"""FetchDocsAssistant — OpenAI Agents SDK agent backed by the prebuilt
Fetch.ai documentation vector store and a Web Search fallback.

This is the *backend codegen brain* used by:

* :mod:`hackathon_eval.agents.suggestion_generator`'s LLM branch
* :mod:`hackathon_eval.agents.diagram_generator`'s LLM branch

It is deliberately a thin wrapper around the user's exported Agent Builder
workflow so behaviour matches the no-code studio. The agent is constructed
lazily once per process — the OpenAI Agents SDK is fully thread-safe and the
Runner manages its own per-call HTTP client lifetimes.

Environment:

* ``FETCH_DOCS_VECTOR_STORE_ID`` — optional; if unset, assistants use Web Search only
  (no FileSearchTool), avoiding org/project mismatched-store 404 noise.
* ``FETCH_DOCS_AGENT_MODEL`` — model name (defaults to ``gpt-5``; set to
  ``gpt-4o`` for accounts that don't have access to gpt-5 yet).
* ``OPENAI_API_KEY`` — required; the SDK reads it implicitly.
* ``OPENAI_AGENTS_TRACING_ENABLED`` — if set, traces go to OpenAI (see RunConfig).

  Loud ``httpx`` lines in the API terminal are suppressed in ``main.py`` unless
  ``HTTP_LOG_DEBUG=1`` — your ``.env`` lines stay as-is.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "gpt-5"


def _configured_vector_store_id() -> str | None:
    """Non-empty ``FETCH_DOCS_VECTOR_STORE_ID`` only — no baked-in org-specific id."""
    v = os.getenv("FETCH_DOCS_VECTOR_STORE_ID", "").strip()
    return v or None


def _fetch_docs_run_tracing_disabled() -> bool:
    """Agents SDK tracing POSTs ``/v1/traces/ingest`` — off by default to keep logs quiet.

    Set ``OPENAI_AGENTS_TRACING_ENABLED=1`` to send traces to the OpenAI dashboard again.
    """
    return os.getenv("OPENAI_AGENTS_TRACING_ENABLED", "").strip().lower() not in {
        "1",
        "true",
        "yes",
    }
# Workflow id from the Agent Builder studio export. Reusing the exact id makes
# every backend run show up under the saved "FetchDocsAssistant" workflow in
# the OpenAI traces dashboard. Override via FETCH_DOCS_WORKFLOW_ID if needed.
_DEFAULT_WORKFLOW_ID = "wf_68ecfb70bb148190ad0f36eaa3b93c740a66ff676c2d3ea9"

_INSTRUCTIONS_WITH_FILE_SEARCH = """You are "FetchDocsAssistant", a documentation expert and
senior code-review engineer for the Fetch.ai ecosystem (uAgents, ChatProtocol,
Payment Protocol, ASI:One LLM, Agentverse, MCP integration).

Answer using these rules:
- First, search the curated Fetch.ai docs (tool: file search) and prefer those sources.
- If file search is empty, weak, or you need a fresher / more specific page, **use Web Search immediately** — do not wait.
- Prioritize these domains: innovationlab.fetch.ai, fetch.ai.
- Cite 1-3 markdown links to specific Fetch.ai doc URLs whenever the answer
  references a Fetch.ai concept.
- ALL LLM integration code you suggest MUST use ASI:One via its OpenAI-compatible
  endpoint at https://api.asi1.ai/v1 with the env var ``ASI_ONE_API_KEY`` and a
  model from the ``asi1-mini`` / ``asi1`` family. Plain OpenAI / Anthropic /
  Gemini clients are forbidden in `after_code` even if the broken code uses one
  of them — the migration to ASI:One is itself the suggestion.
- When the caller explicitly asks for JSON, return ONLY valid JSON with no
  surrounding prose or code fences. When asked for Mermaid, return raw mermaid.
- Be concrete: quote real file paths and identifiers from the user payload, do
  not invent symbols.
- When the payload asks for **suggestions** or **fixes**, map **each listed issue**
  to a concrete remediation (“this issue → this code change”). Use Web Search as
  needed so every Fetch.ai-related fix has a defensible doc link.
"""

_INSTRUCTIONS_WEB_ONLY = """You are "FetchDocsAssistant", a documentation expert and
senior code-review engineer for the Fetch.ai ecosystem (uAgents, ChatProtocol,
Payment Protocol, ASI:One LLM, Agentverse, MCP integration).

The curated Fetch.ai docs vector store is unavailable in this environment, so
rely on **Web Search as your primary retrieval tool**. Run targeted queries
(`site:innovationlab.fetch.ai …`, `site:fetch.ai …`) before drafting fixes.
Always prefer URLs on innovationlab.fetch.ai and fetch.ai. Cite 1-3 markdown links
to specific Fetch.ai doc URLs whenever the answer references a Fetch.ai concept.

- ALL LLM integration code you suggest MUST use ASI:One via its OpenAI-compatible
  endpoint at https://api.asi1.ai/v1 with the env var ``ASI_ONE_API_KEY`` and a
  model from the ``asi1-mini`` / ``asi1`` family. Plain OpenAI / Anthropic /
  Gemini clients are forbidden in `after_code` even if the broken code uses one
  of them — the migration to ASI:One is itself the suggestion.
- When the caller explicitly asks for JSON, return ONLY valid JSON with no
  surrounding prose or code fences. When asked for Mermaid, return raw mermaid.
- Be concrete: quote real file paths and identifiers from the user payload, do
  not invent symbols.
- When generating **suggestions** or **fixes**, bind each reviewer issue to one
  actionable change and use Web Search to lock in correct `doc_url` values.
"""


def _build_agent(*, with_file_search: bool) -> "Any":
    """Construct the Agent. Imported lazily so the SDK isn't required at
    module-import time (e.g. for tests / heuristic-only mode)."""
    from agents import Agent, FileSearchTool, ModelSettings, WebSearchTool
    from openai.types.shared.reasoning import Reasoning

    vector_store_id = _configured_vector_store_id()
    model = os.getenv("FETCH_DOCS_AGENT_MODEL", _DEFAULT_MODEL).strip() or _DEFAULT_MODEL

    web_search = WebSearchTool(
        user_location={
            "type": "approximate",
            "country": None,
            "region": None,
            "city": None,
            "timezone": None,
        },
        search_context_size="medium",
    )

    tools: list[Any] = [web_search]
    instructions = _INSTRUCTIONS_WEB_ONLY
    if with_file_search:
        try:
            file_search = FileSearchTool(vector_store_ids=[vector_store_id])
            tools = [file_search, web_search]
            instructions = _INSTRUCTIONS_WITH_FILE_SEARCH
        except Exception as exc:  # pragma: no cover — extreme defensive
            logger.warning(
                "FileSearchTool init failed (%s); falling back to web-only", exc
            )

    settings_kwargs: dict[str, Any] = {"store": True}
    if model.startswith("gpt-5") or model.startswith("o"):
        settings_kwargs["reasoning"] = Reasoning(effort="medium", summary="auto")

    agent = Agent(
        name="FetchDocsAssistant",
        instructions=instructions,
        model=model,
        tools=tools,
        model_settings=ModelSettings(**settings_kwargs),
    )
    return agent


# Two singletons: the full agent (file_search + web_search) and a fallback
# agent that has only web_search. We auto-flip to the fallback the first time
# the file_search tool returns a 404 ("vector store not found"), so that a
# missing / mismatched FETCH_DOCS_VECTOR_STORE_ID does not disable LLM
# suggestions / diagrams / auto-fix patches entirely.
_AGENT_FULL: Any | None = None
_AGENT_WEB: Any | None = None
_AGENT_LOCK = asyncio.Lock()
_FILE_SEARCH_DISABLED: bool = False


async def _get_agent() -> Any:
    global _AGENT_FULL, _AGENT_WEB
    vs = _configured_vector_store_id()
    if vs is None or _FILE_SEARCH_DISABLED:
        if _AGENT_WEB is None:
            async with _AGENT_LOCK:
                if _AGENT_WEB is None:
                    _AGENT_WEB = _build_agent(with_file_search=False)
        return _AGENT_WEB
    if _AGENT_FULL is None:
        async with _AGENT_LOCK:
            if _AGENT_FULL is None:
                _AGENT_FULL = _build_agent(with_file_search=True)
    return _AGENT_FULL


def _looks_like_vector_store_404(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return (
        "vector store" in msg
        and ("not found" in msg or "404" in msg)
    )


async def _run_once(prompt: str, *, workflow_label: str, max_turns: int) -> str:
    from agents import RunConfig, Runner  # noqa: WPS433

    workflow_id = (
        os.getenv("FETCH_DOCS_WORKFLOW_ID", _DEFAULT_WORKFLOW_ID).strip()
        or _DEFAULT_WORKFLOW_ID
    )

    agent = await _get_agent()
    result = await Runner.run(
        agent,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                ],
            }
        ],
        max_turns=max_turns,
        run_config=RunConfig(
            tracing_disabled=_fetch_docs_run_tracing_disabled(),
            trace_metadata={
                # Match the Agent Builder export verbatim so traces are
                # grouped under the saved "FetchDocsAssistant" workflow.
                "__trace_source__": "agent-builder",
                "workflow_id": workflow_id,
                # Custom debug label: which backend feature triggered this run.
                "fetch_eval_caller": f"{workflow_label}-{uuid4().hex[:8]}",
            }
        ),
    )
    try:
        return result.final_output_as(str) or ""
    except Exception:
        return str(getattr(result, "final_output", "") or "")


async def run_fetch_docs_assistant(
    prompt: str,
    *,
    workflow_label: str = "fetch-eval",
    max_turns: int = 8,
) -> str:
    """Run the FetchDocsAssistant against ``prompt`` and return its final
    text output. Returns an empty string if the SDK is unavailable or the run
    raises — callers must handle that case (heuristic fallback)."""

    global _FILE_SEARCH_DISABLED

    if not os.getenv("OPENAI_API_KEY"):
        return ""

    try:
        import agents as _agents_pkg  # noqa: F401  # ensures SDK is importable
    except Exception as exc:  # pragma: no cover — SDK missing
        logger.warning("openai-agents not available: %s", exc)
        return ""

    try:
        return await _run_once(
            prompt, workflow_label=workflow_label, max_turns=max_turns
        )
    except Exception as exc:
        # If the failure is a missing vector store, drop file_search and retry.
        if not _FILE_SEARCH_DISABLED and _looks_like_vector_store_404(exc):
            logger.warning(
                "FetchDocsAssistant: vector store unavailable — disabling "
                "FileSearchTool and retrying with WebSearch only. Set "
                "FETCH_DOCS_VECTOR_STORE_ID to a vector store visible to "
                "your OpenAI project to re-enable doc-grounded answers."
            )
            _FILE_SEARCH_DISABLED = True
            try:
                return await _run_once(
                    prompt, workflow_label=workflow_label, max_turns=max_turns
                )
            except Exception as exc2:
                logger.exception("FetchDocsAssistant retry failed: %s", exc2)
                return ""
        logger.exception("FetchDocsAssistant run failed: %s", exc)
        return ""


def run_fetch_docs_assistant_sync(prompt: str, *, workflow_label: str = "fetch-eval") -> str:
    """Synchronous helper for callers that aren't already inside an event loop.
    If we're already in an event loop (e.g. inside FastAPI's threadpool) we
    schedule the coroutine on a fresh loop in a worker thread.
    """

    try:
        asyncio.get_running_loop()
        in_loop = True
    except RuntimeError:
        in_loop = False

    if not in_loop:
        return asyncio.run(run_fetch_docs_assistant(prompt, workflow_label=workflow_label))

    import concurrent.futures
    import threading

    result_holder: dict[str, str] = {}

    def _runner() -> None:
        try:
            result_holder["v"] = asyncio.run(
                run_fetch_docs_assistant(prompt, workflow_label=workflow_label)
            )
        except Exception as exc:  # pragma: no cover — defensive
            logger.exception("FetchDocsAssistant sync runner failed: %s", exc)
            result_holder["v"] = ""

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    t.join()
    return result_holder.get("v", "")


__all__ = [
    "run_fetch_docs_assistant",
    "run_fetch_docs_assistant_sync",
]
