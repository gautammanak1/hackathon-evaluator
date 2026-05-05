"""FastAPI service for hackathon repository evaluation."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
try:
    from sse_starlette.sse import EventSourceResponse
except Exception:  # pragma: no cover
    EventSourceResponse = None  # type: ignore[assignment]

from hackathon_eval.batch_file_parse import BatchEvaluateItem, parse_batch_upload
from hackathon_eval.canonical_report import build_canonical_payload
from hackathon_eval.config import API_CORS_ORIGINS
from hackathon_eval.graph import build_evaluation_graph, invoke_graph_timed
from hackathon_eval.agents.github_issue_reporter import maybe_create_github_issue
from hackathon_eval.pdf_extract import extract_pdf_text
from hackathon_eval.pdf_urls import find_github_repo_urls
from hackathon_eval.admin_auth import AdminAuthError, verify_admin_token
from hackathon_eval.persistence import admin_evaluations as db_admin_evaluations
from hackathon_eval.persistence import admin_repos as db_admin_repos
from hackathon_eval.persistence import admin_stats as db_admin_stats
from hackathon_eval.persistence import admin_users as db_admin_users
from hackathon_eval.persistence import delete_evaluation as db_delete_evaluation
from hackathon_eval.persistence import list_evaluations as db_list_evaluations
from hackathon_eval.persistence import load_evaluation as db_load_evaluation
from hackathon_eval.persistence import load_suggestions as db_load_suggestions
from hackathon_eval.persistence import set_github_issue_url as db_set_github_issue_url
from hackathon_eval.persistence import save_evaluation
from hackathon_eval.tools.repo_tools import remove_path

load_dotenv()


def _configure_third_party_log_noise() -> None:
    """Keep terminal readable: httpx INFO logs every OpenAI request + traces/ingest.

    Tracing can stay enabled via ``OPENAI_AGENTS_TRACING_ENABLED``; this only
    suppresses chatty client HTTP logs (set ``HTTP_LOG_DEBUG=1`` to re-enable).
    """
    if os.getenv("HTTP_LOG_DEBUG", "").strip().lower() in {"1", "true", "yes"}:
        return
    for name in ("httpx", "httpcore", "openai"):
        logging.getLogger(name).setLevel(logging.WARNING)


_configure_third_party_log_noise()


@asynccontextmanager
async def _app_lifespan(_: FastAPI):
    """Larger default thread pool so MCP (``asyncio.to_thread``) + /evaluate can run together."""
    import concurrent.futures

    try:
        workers = int(os.getenv("EVAL_THREAD_POOL_WORKERS", "12"))
    except ValueError:
        workers = 12
    workers = max(4, min(32, workers))
    exe = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    asyncio.get_running_loop().set_default_executor(exe)
    yield
    exe.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="Hackathon Evaluator API",
    version="1.0.0",
    lifespan=_app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=API_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _mount_mcp(app: FastAPI) -> None:
    if os.getenv("MCP_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return
    from ai.mcp_server import sse_starlette_mount

    mp = (os.getenv("MCP_MOUNT_PATH") or "/mcp").strip()
    if not mp.startswith("/"):
        mp = "/" + mp
    mp = mp.rstrip("/") or "/mcp"
    app.mount(mp, sse_starlette_mount(mp))


_mount_mcp(app)


class EvaluateRequest(BaseModel):
    """Either `repo_url` or `document_text` (or both) must be provided."""

    repo_url: str | None = None
    branch: str | None = None
    submission_context: str | None = None
    document_text: str | None = None
    submission_metadata: dict[str, Any] | None = None
    review_mode: str | None = None
    create_github_issue: bool = False
    github_token: str | None = None
    user_github_login: str | None = None
    eval_profile: Literal["full", "fast"] | None = None

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def _need_source(self) -> EvaluateRequest:
        has_repo = bool((self.repo_url or "").strip())
        has_doc = bool((self.document_text or "").strip())
        if not has_repo and not has_doc:
            raise ValueError("Provide repo_url and/or document_text")
        return self


class BatchEvaluateRequest(BaseModel):
    items: list[BatchEvaluateItem] = Field(..., description="Repositories / documents to evaluate")

    model_config = {"extra": "ignore"}


class EvaluateResponse(BaseModel):
    evaluation: dict[str, Any]
    submission_id: str


class BatchEvaluateResponse(BaseModel):
    results: list[dict[str, Any]]
    count: int


class SubmissionEvaluateResponse(BaseModel):
    """Multipart /submission: one repo evaluation or many repos detected inside a spreadsheet PDF."""

    mode: Literal["single", "batch"] = "single"
    evaluation: dict[str, Any] | None = None
    results: list[dict[str, Any]] | None = None
    count: int = 1
    notice: str | None = None
    submission_id: str | None = None
    submission_ids: list[str] | None = None


class DeepEvaluateRequest(EvaluateRequest):
    pass


class CreateIssueRequest(BaseModel):
    repo_url: str
    github_token: str | None = None
    pr_number: int | None = None


def _github_ok(url: str) -> bool:
    u = url.strip()
    return "github.com" in u or u.startswith("git@")


_GITHUB_OWNER_RE = re.compile(
    r"^https?://github\.com/([^/\s]+)/([^/\s#?]+?)(?:\.git)?/?$",
    re.IGNORECASE,
)


def _extract_owner(url: str) -> str | None:
    m = _GITHUB_OWNER_RE.match(url.strip())
    if not m:
        return None
    return m.group(1)


def _enforce_repo_ownership(
    repo_url: str | None,
    user_github_login: str | None,
    *,
    is_admin: bool,
) -> None:
    """Raise 403 unless the repo owner matches the signed-in GitHub login (or admin)."""
    if is_admin:
        return
    url = (repo_url or "").strip()
    if not url:
        return
    owner = _extract_owner(url)
    login = (user_github_login or "").strip()
    if not login:
        raise HTTPException(
            status_code=401,
            detail="user_github_login is required for non-admin evaluations",
        )
    if not owner:
        # Non-standard URL — fail closed.
        raise HTTPException(
            status_code=400,
            detail="repo_url must look like https://github.com/<owner>/<repo>",
        )
    if owner.lower() != login.lower():
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only analyse repositories you own on GitHub. "
                f"This repo belongs to '{owner}', but you are signed in as '{login}'."
            ),
        )


def _is_admin_request(token: str | None) -> bool:
    if not token:
        return False
    try:
        verify_admin_token(token)
        return True
    except AdminAuthError:
        return False


def require_admin(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    try:
        return verify_admin_token(x_admin_token)
    except AdminAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _resolve_source_url(payload: dict[str, Any]) -> str:
    return ((payload.get("repo_url") or "") if isinstance(payload, dict) else "") or ""


def _submission_type(payload: dict[str, Any]) -> str:
    doc = (payload.get("document_text") or "").strip()
    url = (payload.get("repo_url") or "").strip()
    if url and doc:
        return "github_with_document"
    if doc:
        return "pdf"
    return "github"


def _persist_and_merge(
    report: dict[str, Any],
    *,
    steps: list[dict[str, Any]],
    submission_metadata: dict[str, Any] | None,
    source_url: str,
    submission_type: str,
) -> tuple[dict[str, Any], str]:
    total_ms = sum(int(s.get("duration_ms") or 0) for s in steps)
    canon = build_canonical_payload(
        repo_report=report,
        evaluation_steps=steps,
        submission_metadata=submission_metadata,
        source_url=source_url or "",
        submission_type=submission_type,
        total_evaluation_time_ms=total_ms if total_ms else None,
    )
    merged_body = {**report, **canon}
    submission_id = save_evaluation(merged_body)
    merged = {**merged_body, "submission_id": submission_id}
    return merged, submission_id


def _evaluate_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Run LangGraph with timings, persist, cleanup clone directory."""
    report, steps, work_dir = invoke_graph_timed(payload)
    meta = payload.get("submission_metadata") if isinstance(payload.get("submission_metadata"), dict) else None
    merged, sid = _persist_and_merge(
        report,
        steps=steps,
        submission_metadata=meta,
        source_url=_resolve_source_url(payload),
        submission_type=_submission_type(payload),
    )
    if not os.getenv("EVAL_PERSIST_CLONE") and work_dir:
        remove_path(Path(work_dir))
    return merged, sid


def _build_payload(
    *,
    repo_url: str | None,
    branch: str | None,
    submission_context: str | None,
    document_text: str | None,
    submission_metadata: dict[str, Any] | None,
    review_mode: str | None = None,
    create_github_issue: bool = False,
    github_token: str | None = None,
    user_github_login: str | None = None,
    eval_profile: Literal["full", "fast"] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if (repo_url or "").strip():
        payload["repo_url"] = repo_url.strip()
    if branch:
        payload["branch"] = branch
    ctx = (submission_context or "").strip()
    if ctx:
        payload["submission_context"] = ctx
    doc = (document_text or "").strip()
    if doc:
        payload["document_text"] = doc
    meta: dict[str, Any] = dict(submission_metadata or {})
    if user_github_login and "github_login" not in meta:
        meta["github_login"] = user_github_login
    if meta:
        payload["submission_metadata"] = meta
    if (review_mode or "").strip():
        payload["review_mode"] = str(review_mode).strip()
    if create_github_issue:
        payload["create_github_issue"] = True
    if github_token:
        payload["github_token"] = github_token
    if eval_profile in ("full", "fast"):
        payload["eval_profile"] = eval_profile
    return payload


def _run_batch(
    items_or_graph: list[BatchEvaluateItem] | Any,
    maybe_items: list[BatchEvaluateItem] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    # Backward compatibility for tests/older callers passing (_graph, items).
    items = maybe_items if maybe_items is not None else items_or_graph
    if not isinstance(items, list):
        return [], []
    results: list[dict[str, Any]] = []
    ids: list[str] = []
    for item in items:
        url = (item.repo_url or "").strip()
        doc = (item.document_text or "").strip()
        if not url and not doc:
            results.append({"error": "Each item needs repo_url and/or document_text", "label": item.label})
            continue
        if url and not _github_ok(url):
            results.append(
                {"error": "repo_url must be a GitHub repository", "repo_url": url, "label": item.label}
            )
            continue
        payload = _build_payload(
            repo_url=item.repo_url,
            branch=item.branch,
            submission_context=item.submission_context,
            document_text=item.document_text,
            submission_metadata=item.submission_metadata,
        )
        try:
            merged, sid = _evaluate_payload(payload)
            if item.label is not None:
                merged = {**merged, "batch_label": item.label}
            results.append(merged)
            ids.append(sid)
        except Exception as e:
            results.append({"error": str(e), "repo_url": url or None, "label": item.label})
    return results, ids


def _normalize_batch_output(raw: Any) -> tuple[list[dict[str, Any]], list[str]]:
    if isinstance(raw, tuple) and len(raw) == 2:
        return raw[0], raw[1]
    if isinstance(raw, list):
        return raw, []
    return [], []


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/meta/mcp")
def mcp_discovery(request: Request):
    """Public MCP SSE endpoints for external clients (Cursor / Claude / etc.)."""
    mp = (os.getenv("MCP_MOUNT_PATH") or "/mcp").strip()
    if not mp.startswith("/"):
        mp = "/" + mp
    mp = mp.rstrip("/") or "/mcp"
    public = (os.getenv("MCP_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    base = public or str(request.base_url).rstrip("/")
    return {
        "mcp_sse_url": f"{base}{mp}/sse",
        "mcp_messages_post_path": f"{mp}/messages/",
        "mount_path": mp,
        "hint": "Register the SSE URL in your MCP client; POST JSON-RPC to messages path per MCP streamable HTTP spec.",
    }


@app.get("/health/detailed")
def health_detailed():
    llm_ok = bool(os.getenv("OPENAI_API_KEY"))
    rag_ok = bool(os.getenv("INNOVATION_LABS_DOCS") or os.path.isdir("data/innovation-labs-docs"))
    gh_ok = bool(os.getenv("GITHUB_TOKEN"))
    return {"ok": True, "components": {"llm": llm_ok, "rag": rag_ok, "github_api": gh_ok}}


@app.get("/evaluation/{evaluation_id}")
def get_evaluation(evaluation_id: str):
    row = db_load_evaluation(evaluation_id.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return row


@app.delete("/evaluation/{evaluation_id}")
def delete_evaluation_endpoint(evaluation_id: str):
    if not db_delete_evaluation(evaluation_id.strip()):
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return {"ok": True, "id": evaluation_id.strip()}


@app.get("/evaluations")
def list_evaluations_endpoint(limit: int = 50, offset: int = 0):
    return {"items": db_list_evaluations(limit=limit, offset=offset)}


# ---------------------------------------------------------------------------
# Admin endpoints (X-Admin-Token JWT — issued by Next.js admin login route)
# ---------------------------------------------------------------------------


@app.get("/admin/stats")
def admin_stats_endpoint(_admin: dict[str, Any] = Depends(require_admin)):
    return db_admin_stats()


@app.get("/admin/users")
def admin_users_endpoint(_admin: dict[str, Any] = Depends(require_admin)):
    return {"items": db_admin_users()}


@app.get("/admin/repos")
def admin_repos_endpoint(_admin: dict[str, Any] = Depends(require_admin)):
    return {"items": db_admin_repos()}


@app.get("/admin/evaluations")
def admin_evaluations_endpoint(
    limit: int = 50,
    offset: int = 0,
    _admin: dict[str, Any] = Depends(require_admin),
):
    return {"items": db_admin_evaluations(limit=limit, offset=offset)}


_MAX_BATCH_JSON = 40
_MAX_BATCH_FILE = 100


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest, x_admin_token: str | None = Header(default=None)):
    url = (req.repo_url or "").strip()
    if url and not _github_ok(url):
        raise HTTPException(status_code=400, detail="repo_url must be a GitHub repository")
    is_admin = _is_admin_request(x_admin_token)
    _enforce_repo_ownership(req.repo_url, req.user_github_login, is_admin=is_admin)
    try:
        payload = _build_payload(
            repo_url=req.repo_url,
            branch=req.branch,
            submission_context=req.submission_context,
            document_text=req.document_text,
            submission_metadata=req.submission_metadata,
            review_mode=req.review_mode,
            create_github_issue=req.create_github_issue,
            github_token=req.github_token,
            user_github_login=req.user_github_login,
            eval_profile=req.eval_profile,
        )
        merged, sid = _evaluate_payload(payload)
        return EvaluateResponse(evaluation=merged, submission_id=sid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/evaluate/deep-analysis", response_model=EvaluateResponse)
def evaluate_deep_analysis(req: DeepEvaluateRequest, x_admin_token: str | None = Header(default=None)):
    return evaluate(req, x_admin_token)


@app.get("/evaluate/{submission_id}/suggestions")
def get_suggestions(submission_id: str, severity: str | None = None):
    severities: set[str] | None = None
    if severity:
        severities = {s.strip().lower() for s in severity.split(",") if s.strip()}
    items = db_load_suggestions(submission_id.strip(), severities=severities)
    return {"submission_id": submission_id.strip(), "count": len(items), "suggestions": items}


@app.post("/evaluate/{submission_id}/create-issue")
def create_issue_for_evaluation(submission_id: str, req: CreateIssueRequest):
    row = db_load_evaluation(submission_id.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    try:
        res = maybe_create_github_issue(
            report=row,
            repo_url=req.repo_url,
            create_issue=True,
            request_token=req.github_token,
            pr_number=req.pr_number,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    issue_url = res.get("issue_url")
    if issue_url:
        db_set_github_issue_url(submission_id.strip(), str(issue_url))
    return {"submission_id": submission_id.strip(), **res}


@app.post("/evaluate/submission", response_model=SubmissionEvaluateResponse)
async def evaluate_submission(
    repo_url: str | None = Form(default=None),
    branch: str | None = Form(default=None),
    pdf: UploadFile | None = File(default=None),
    _admin: dict[str, Any] = Depends(require_admin),
):
    """Multipart: optional GitHub URL plus optional PDF. Admin-only."""
    doc_text = ""
    if pdf is not None and (pdf.filename or "").strip():
        body = await pdf.read()
        try:
            doc_text = extract_pdf_text(body)
        except (ValueError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    form_repo = (repo_url or "").strip()
    if form_repo and not _github_ok(form_repo):
        raise HTTPException(status_code=400, detail="repo_url must be a GitHub repository")
    if not form_repo and not doc_text:
        raise HTTPException(status_code=400, detail="Provide a PDF file and/or repo_url")

    notice: str | None = None
    pdf_single_repo = False
    effective_repo = form_repo

    found = find_github_repo_urls(doc_text) if doc_text else []
    if doc_text and len(found) >= 2:
        notice_parts: list[str] = []
        if len(found) > _MAX_BATCH_FILE:
            notice_parts.append(
                f"Found {len(found)} repos in PDF; evaluating the first {_MAX_BATCH_FILE}."
            )
            found = found[:_MAX_BATCH_FILE]
        if form_repo:
            notice_parts.append(
                "The PDF lists multiple repositories; evaluating all detected links. The GitHub URL field was ignored."
            )
        notice = " ".join(notice_parts) if notice_parts else None
        items = [
            BatchEvaluateItem(
                repo_url=u,
                label=str(i + 1),
                submission_metadata={"source": "pdf_spreadsheet", "row_hint": str(i + 1)},
            )
            for i, u in enumerate(found)
        ]
        results, ids = _normalize_batch_output(_run_batch(build_evaluation_graph(), items))
        return SubmissionEvaluateResponse(
            mode="batch",
            evaluation=None,
            results=results,
            count=len(results),
            notice=notice,
            submission_ids=ids,
        )
    if doc_text and not form_repo and len(found) == 1:
        effective_repo = found[0]
        pdf_single_repo = True

    try:
        if effective_repo and doc_text:
            if form_repo:
                payload = _build_payload(
                    repo_url=effective_repo,
                    branch=branch,
                    submission_context=None,
                    document_text=doc_text,
                    submission_metadata=None,
                )
            elif pdf_single_repo:
                payload = _build_payload(
                    repo_url=effective_repo,
                    branch=branch,
                    submission_context=doc_text[:25_000],
                    document_text=None,
                    submission_metadata=None,
                )
        else:
            payload = _build_payload(
                repo_url=effective_repo if effective_repo else None,
                branch=branch,
                submission_context=None,
                document_text=doc_text or None,
                submission_metadata=None,
            )
        merged, sid = _evaluate_payload(payload)
        return SubmissionEvaluateResponse(
            mode="single",
            evaluation=merged,
            results=None,
            count=1,
            notice=notice,
            submission_id=sid,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/evaluate/batch", response_model=BatchEvaluateResponse)
def evaluate_batch(req: BatchEvaluateRequest, _admin: dict[str, Any] = Depends(require_admin)):
    if len(req.items) > _MAX_BATCH_JSON:
        raise HTTPException(
            status_code=400,
            detail=f"At most {_MAX_BATCH_JSON} items in JSON batch",
        )
    results, _ids = _normalize_batch_output(_run_batch(build_evaluation_graph(), req.items))
    return BatchEvaluateResponse(results=results, count=len(req.items))


@app.post("/evaluate/batch/upload", response_model=BatchEvaluateResponse)
async def evaluate_batch_upload(
    file: UploadFile = File(...),
    _admin: dict[str, Any] = Depends(require_admin),
):
    """Upload `.csv` or `.xlsx` (admin-only) with a GitHub URL column (`repo_url`, `url`, `repository`, or `repo`)."""
    raw = await file.read()
    name = file.filename or "upload.csv"
    try:
        items = parse_batch_upload(name, raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not items:
        raise HTTPException(
            status_code=400,
            detail="No valid rows: add a column repo_url, url, repository, or repo with GitHub URLs",
        )
    if len(items) > _MAX_BATCH_FILE:
        raise HTTPException(
            status_code=400,
            detail=f"At most {_MAX_BATCH_FILE} rows per file",
        )
    results, _ids = _normalize_batch_output(_run_batch(build_evaluation_graph(), items))
    return BatchEvaluateResponse(results=results, count=len(items))


@app.post("/evaluate/stream")
async def evaluate_stream(req: EvaluateRequest):
    if EventSourceResponse is None:
        raise HTTPException(status_code=503, detail="SSE streaming dependency not installed")
    payload = _build_payload(
        repo_url=req.repo_url,
        branch=req.branch,
        submission_context=req.submission_context,
        document_text=req.document_text,
        submission_metadata=req.submission_metadata,
        create_github_issue=req.create_github_issue,
        github_token=req.github_token,
        review_mode=req.review_mode,
        eval_profile=req.eval_profile,
    )

    async def _event_gen():
        report, steps, _work_dir = invoke_graph_timed(payload)
        for step in steps:
            yield {"event": "step", "data": str(step)}
        merged, sid = _persist_and_merge(
            report,
            steps=steps,
            submission_metadata=payload.get("submission_metadata"),
            source_url=_resolve_source_url(payload),
            submission_type=_submission_type(payload),
        )
        yield {"event": "done", "data": str({"submission_id": sid, "evaluation": merged})}

    return EventSourceResponse(_event_gen())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
