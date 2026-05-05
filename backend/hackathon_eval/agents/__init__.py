"""Agent modules for deep analysis and post-processing."""

from .code_analysis_agent import run_deep_code_analysis
from .diagram_generator import generate_repo_diagrams
from .doc_linker import build_doc_links
from .fetch_docs_assistant import (
    run_fetch_docs_assistant,
    run_fetch_docs_assistant_sync,
)
from .github_issue_reporter import maybe_create_github_issue
from .suggestion_generator import generate_suggestions, generate_suggestions_llm

__all__ = [
    "run_deep_code_analysis",
    "build_doc_links",
    "maybe_create_github_issue",
    "generate_suggestions",
    "generate_suggestions_llm",
    "generate_repo_diagrams",
    "run_fetch_docs_assistant",
    "run_fetch_docs_assistant_sync",
]
