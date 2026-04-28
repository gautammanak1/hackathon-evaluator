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
from hackathon_eval.config import API_CORS_ORIGINS
from hackathon_eval.graph import build_evaluation_graph
from hackathon_eval.pdf_extract import extract_pdf_text
from hackathon_eval.pdf_urls import find_github_repo_urls
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


def _github_ok(url: str) -> bool:
    u = url.strip()
    return "github.com" in u or u.startswith("git@")


def _invoke_clean(graph, payload: dict[str, Any]) -> dict[str, Any]:
    state = graph.invoke(payload)
    report = state.get("report") or {}
    if not os.getenv("EVAL_PERSIST_CLONE") and state.get("work_dir"):
        remove_path(Path(state["work_dir"]))
    return report


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


def _run_batch(graph, items: list[BatchEvaluateItem]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
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
        state: dict[str, Any] | None = None
        try:
            state = graph.invoke(payload)
            report = state.get("report") or {}
            if item.label is not None:
                report = {**report, "batch_label": item.label}
            results.append(report)
        except Exception as e:
            results.append({"error": str(e), "repo_url": url or None, "label": item.label})
        finally:
            if (
                not os.getenv("EVAL_PERSIST_CLONE")
                and state
                and state.get("work_dir")
            ):
                remove_path(Path(state["work_dir"]))
    return results


@app.get("/health")
def health():
    return {"ok": True}


_MAX_BATCH_JSON = 40
_MAX_BATCH_FILE = 100


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest):
    url = (req.repo_url or "").strip()
    doc = (req.document_text or "").strip()
    if url and not _github_ok(url):
        raise HTTPException(status_code=400, detail="repo_url must be a GitHub repository")
    try:
        graph = build_evaluation_graph()
        payload = _build_payload(
            repo_url=req.repo_url,
            branch=req.branch,
            submission_context=req.submission_context,
            document_text=req.document_text,
            submission_metadata=req.submission_metadata,
        )
        report = _invoke_clean(graph, payload)
        return EvaluateResponse(evaluation=report)
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

    # PDF from Google Sheets: many github.com cells → one evaluation per repo.
    # Batch whenever the PDF text exposes 2+ repo links, even if the user also filled the URL field
    # (otherwise only one row runs and the rest of the sheet is ignored).
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
        graph = build_evaluation_graph()
        items = [
            BatchEvaluateItem(
                repo_url=u,
                label=str(i + 1),
                submission_metadata={"source": "pdf_spreadsheet", "row_hint": str(i + 1)},
            )
            for i, u in enumerate(found)
        ]
        results = _run_batch(graph, items)
        return SubmissionEvaluateResponse(
            mode="batch",
            evaluation=None,
            results=results,
            count=len(results),
            notice=notice,
        )
    if doc_text and not form_repo and len(found) == 1:
        effective_repo = found[0]
        pdf_single_repo = True

    try:
        graph = build_evaluation_graph()
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
        report = _invoke_clean(graph, payload)
        return SubmissionEvaluateResponse(
            mode="single",
            evaluation=report,
            results=None,
            count=1,
            notice=notice,
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
    graph = build_evaluation_graph()
    return BatchEvaluateResponse(results=_run_batch(graph, req.items), count=len(req.items))


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
    graph = build_evaluation_graph()
    return BatchEvaluateResponse(results=_run_batch(graph, items), count=len(items))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
