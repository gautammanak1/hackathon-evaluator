"""Shared LangGraph state for the evaluation workflow."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

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
    review_mode: NotRequired[str | None]
    # "fast" skips deep_code + doc_linker + suggestions + diagrams (MCP default / quick UI).
    eval_profile: NotRequired[Literal["full", "fast"]]
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
    issues: NotRequired[list[str]]

    protocol_validation: NotRequired[dict[str, Any]]
    benchmark: NotRequired[dict[str, Any]]
    deep_analysis: NotRequired[dict[str, Any]]
    suggestions: NotRequired[list[dict[str, Any]]]
    diagrams: NotRequired[dict[str, Any]]
    github_issue: NotRequired[dict[str, Any]]
    doc_links: NotRequired[list[dict[str, Any]]]
    create_github_issue: NotRequired[bool]
    github_token: NotRequired[str | None]

    # Final structured output
    report: dict[str, Any]
