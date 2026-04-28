"""Shared LangGraph state for the evaluation workflow."""

from __future__ import annotations

from typing import Any, TypedDict

try:
    from typing import NotRequired
except ImportError:  # Python < 3.11
    from typing_extensions import NotRequired


class EvalState(TypedDict, total=False):
    # GitHub URL (optional if document_text is provided): document-only evaluations skip clone.
    repo_url: NotRequired[str | None]
    branch: NotRequired[str | None]
    # Optional pitch / README paste / batch CSV notes—merged into the judge user message.
    submission_context: NotRequired[str | None]
    # Extracted PDF (or other server-side document) plain text for excerpt + judge.
    document_text: NotRequired[str | None]
    # Arbitrary key/values: team_name, table_name, track, or any event-specific columns.
    submission_metadata: NotRequired[dict[str, Any] | None]
    work_dir: str
    repo_name: str

    # Ingestion
    clone_ok: bool
    clone_error: str
    file_paths: list[str]
    combined_source_excerpt: str
    repo_stats: dict[str, Any]

    # Analysis (deterministic)
    scan: dict[str, Any]
    features: NotRequired[dict[str, Any]]
    code_semantic_sketch: NotRequired[str]

    # RAG / knowledge
    knowledge_context: str

    # LLM intermediate
    analysis_llm_notes: str
    analysis: NotRequired[dict[str, Any]]

    protocol_validation: NotRequired[dict[str, Any]]
    benchmark: NotRequired[dict[str, Any]]

    # Final structured output
    report: dict[str, Any]
