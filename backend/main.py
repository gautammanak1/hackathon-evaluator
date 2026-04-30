"""FastAPI service for hackathon repository evaluation."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from hackathon_eval.batch_file_parse import BatchEvaluateItem, parse_batch_upload
from hackathon_eval.canonical_report import build_canonical_payload
from hackathon_eval.config import API_CORS_ORIGINS
from hackathon_eval.graph import invoke_graph_timed
from hackathon_eval.pdf_extract import extract_pdf_text
from hackathon_eval.pdf_urls import find_github_repo_urls
from hackathon_eval.persistence import delete_evaluation as db_delete_evaluation
from hackathon_eval.persistence import list_evaluations as db_list_evaluations
from hackathon_eval.persistence import load_evaluation as db_load_evaluation
from hackathon_eval.persistence import save_evaluation
from hackathon_eval.tools.repo_tools import remove_path

load_dotenv()

app = FastAPI(title="Hackathon Evaluator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=API_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvaluateRequest(BaseModel):
    """Either `repo_url` or `document_text` (or both) must be provided."""

    repo_url: str | None = None
    branch: str | None = None
    submission_context: str | None = None
    document_text: str | None = None
    submission_metadata: dict[str, Any] | None = None

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


def _github_ok(url: str) -> bool:
    u = url.strip()
    return "github.com" in u or u.startswith("git@")


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
    if submission_metadata:
        payload["submission_metadata"] = dict(submission_metadata)
    return payload


def _run_batch(items: list[BatchEvaluateItem]) -> tuple[list[dict[str, Any]], list[str]]:
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


@app.get("/health")
def health():
    return {"ok": True}


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


_MAX_BATCH_JSON = 40
_MAX_BATCH_FILE = 100


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest):
    url = (req.repo_url or "").strip()
    doc = (req.document_text or "").strip()
    if url and not _github_ok(url):
        raise HTTPException(status_code=400, detail="repo_url must be a GitHub repository")
    try:
        payload = _build_payload(
            repo_url=req.repo_url,
            branch=req.branch,
            submission_context=req.submission_context,
            document_text=req.document_text,
            submission_metadata=req.submission_metadata,
        )
        merged, sid = _evaluate_payload(payload)
        return EvaluateResponse(evaluation=merged, submission_id=sid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/evaluate/submission", response_model=SubmissionEvaluateResponse)
async def evaluate_submission(
    repo_url: str | None = Form(default=None),
    branch: str | None = Form(default=None),
    pdf: UploadFile | None = File(default=None),
):
    """Multipart: optional GitHub URL plus optional PDF. Spreadsheet PDFs with many github.com links are auto-batched."""
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
        results, ids = _run_batch(items)
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
def evaluate_batch(req: BatchEvaluateRequest):
    if len(req.items) > _MAX_BATCH_JSON:
        raise HTTPException(
            status_code=400,
            detail=f"At most {_MAX_BATCH_JSON} items in JSON batch",
        )
    results, _ids = _run_batch(req.items)
    return BatchEvaluateResponse(results=results, count=len(req.items))


@app.post("/evaluate/batch/upload", response_model=BatchEvaluateResponse)
async def evaluate_batch_upload(file: UploadFile = File(...)):
    """Upload `.csv` or `.xlsx` with a GitHub URL column (`repo_url`, `url`, `repository`, or `repo`). Other columns become `submission_metadata`."""
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
    results, _ids = _run_batch(items)
    return BatchEvaluateResponse(results=results, count=len(items))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
