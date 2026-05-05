"""Shared evaluation entrypoint for FastAPI and the uAgent façade.

Avoids circular imports: FastAPI (``main``) and ``uagent_facade`` both call
``evaluate_and_persist`` with a plain ``dict`` payload shaped like
:class:`hackathon_eval.state.EvalState`.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from hackathon_eval.canonical_report import build_canonical_payload
from hackathon_eval.graph import invoke_graph_timed
from hackathon_eval.persistence import save_evaluation
from hackathon_eval.tools.repo_tools import remove_path


def resolve_source_url(payload: dict[str, Any]) -> str:
    return ((payload.get("repo_url") or "") if isinstance(payload, dict) else "") or ""


def submission_type(payload: dict[str, Any]) -> str:
    doc = (payload.get("document_text") or "").strip()
    url = (payload.get("repo_url") or "").strip()
    if url and doc:
        return "github_with_document"
    if doc:
        return "pdf"
    return "github"


def persist_and_merge(
    report: dict[str, Any],
    *,
    steps: list[dict[str, Any]],
    submission_metadata: dict[str, Any] | None,
    source_url: str,
    submission_type_str: str,
) -> tuple[dict[str, Any], str]:
    total_ms = sum(int(s.get("duration_ms") or 0) for s in steps)
    canon = build_canonical_payload(
        repo_report=report,
        evaluation_steps=steps,
        submission_metadata=submission_metadata,
        source_url=source_url or "",
        submission_type=submission_type_str,
        total_evaluation_time_ms=total_ms if total_ms else None,
    )
    merged_body = {**report, **canon}
    submission_id = save_evaluation(merged_body)
    merged = {**merged_body, "submission_id": submission_id}
    return merged, submission_id


def evaluate_and_persist(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Run LangGraph, persist to Supabase/memory, cleanup clone directory."""
    report, steps, work_dir = invoke_graph_timed(payload)
    meta = payload.get("submission_metadata") if isinstance(payload.get("submission_metadata"), dict) else None
    merged, sid = persist_and_merge(
        report,
        steps=steps,
        submission_metadata=meta,
        source_url=resolve_source_url(payload),
        submission_type_str=submission_type(payload),
    )
    if not os.getenv("EVAL_PERSIST_CLONE") and work_dir:
        remove_path(Path(work_dir))
    return merged, sid


def build_eval_payload(
    *,
    repo_url: str | None,
    branch: str | None = None,
    submission_context: str | None = None,
    document_text: str | None = None,
    submission_metadata: dict[str, Any] | None = None,
    review_mode: str | None = None,
    create_github_issue: bool = False,
    github_token: str | None = None,
    user_github_login: str | None = None,
    eval_profile: Literal["full", "fast"] | None = None,
) -> dict[str, Any]:
    """Mirror ``main._build_payload`` for uAgent / other callers."""
    pl: dict[str, Any] = {}
    if (repo_url or "").strip():
        pl["repo_url"] = repo_url.strip()  # type: ignore[union-attr]
    if branch:
        pl["branch"] = branch
    ctx = (submission_context or "").strip()
    if ctx:
        pl["submission_context"] = ctx
    doc = (document_text or "").strip()
    if doc:
        pl["document_text"] = doc
    meta: dict[str, Any] = dict(submission_metadata or {})
    if user_github_login and "github_login" not in meta:
        meta["github_login"] = user_github_login
    if meta:
        pl["submission_metadata"] = meta
    if (review_mode or "").strip():
        pl["review_mode"] = str(review_mode).strip()
    if create_github_issue:
        pl["create_github_issue"] = True
    if github_token:
        pl["github_token"] = github_token
    if eval_profile in ("full", "fast"):
        pl["eval_profile"] = eval_profile
    return pl


__all__ = [
    "evaluate_and_persist",
    "build_eval_payload",
    "persist_and_merge",
    "resolve_source_url",
    "submission_type",
]
