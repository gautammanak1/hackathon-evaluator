"""Suggestion generation for actionable fixes.

Two paths:

1. ``generate_suggestions_llm`` — calls the LLM with the
   ``SUGGESTION_GENERATION_PROMPT.md`` system prompt plus repo evidence.
   Used when ``OPENAI_API_KEY`` is set. Produces real-time, repo-grounded
   ``before_code`` / ``after_code`` snippets and ASI:One migrations.

2. ``generate_suggestions`` — deterministic heuristic fallback used when
   no LLM key is available or the LLM returns invalid JSON.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from hackathon_eval.config import PROMPTS_DIR


def _severity_for_issue(issue: str) -> str:
    s = issue.lower()
    if "critical" in s or "secret" in s:
        return "critical"
    if "payment" in s or "chat" in s:
        return "high"
    if "llm" in s or "uagent" in s:
        return "medium"
    return "low"


def _category_for_issue(issue: str) -> str:
    s = issue.lower()
    if "protocol" in s or "chat" in s or "payment" in s:
        return "protocol"
    if "secret" in s or "injection" in s:
        return "security"
    if "architecture" in s:
        return "architecture"
    return "quality"


def _issue_specific_fix(issue: str) -> dict[str, Any]:
    s = issue.lower()
    if "asi" in s or "llm" in s or "openai" in s:
        return {
            "file_hint": "agents/asi_one_client.py",
            "before_code": (
                "# Either no LLM call at all, or it points at api.openai.com / "
                "Anthropic / Gemini.\n"
                "# Fetch.ai hackathon scoring requires ASI:One via api.asi1.ai/v1.\n"
            ),
            "after_code": (
                "import os\n"
                "from openai import OpenAI  # ASI:One ships an OpenAI-compatible SDK surface\n\n"
                "client = OpenAI(\n"
                "    api_key=os.getenv(\"ASI_ONE_API_KEY\", \"\"),\n"
                "    base_url=\"https://api.asi1.ai/v1\",\n"
                ")\n\n"
                "def generate_reply(prompt: str) -> str:\n"
                "    response = client.chat.completions.create(\n"
                "        model=\"asi1-mini\",  # use \"asi1\" for the agentic web-search model\n"
                "        messages=[{\"role\": \"user\", \"content\": prompt}],\n"
                "        temperature=0.2,\n"
                "    )\n"
                "    return response.choices[0].message.content or \"\"\n"
            ),
            "why_this_fix": (
                "Routes LLM calls through ASI:One (api.asi1.ai/v1) which is the only "
                "LLM surface the Fetch.ai hackathon rubric scores positively. Plain OpenAI / "
                "Anthropic / Gemini clients trigger a 'no ASI integration' deduction even if "
                "they technically work."
            ),
            "validation_steps": [
                "Add ASI_ONE_API_KEY to your .env (get one from https://asi1.ai/dashboard/api-keys)",
                "python -c \"from agents.asi_one_client import generate_reply; print(generate_reply('ping'))\"",
                "Re-run the evaluator and confirm `asi1_llm_integration.implemented` is true",
            ],
            "tests_to_add": ["tests/test_asi_one_client.py::test_generate_reply_returns_text"],
        }
    if "complexity" in s:
        return {
            "file_hint": "agents/workflow.py",
            "before_code": "# One large function with multiple branching paths",
            "after_code": (
                "from typing import Any\n\n"
                "def validate_payload(payload: dict[str, Any]) -> None:\n"
                "    if not payload.get('task'):\n"
                "        raise ValueError('task is required')\n\n"
                "def build_job(payload: dict[str, Any]) -> dict[str, Any]:\n"
                "    return {'task': payload['task'], 'priority': payload.get('priority', 'normal')}\n\n"
                "def process_job(payload: dict[str, Any]) -> dict[str, Any]:\n"
                "    validate_payload(payload)\n"
                "    job = build_job(payload)\n"
                "    return {'status': 'accepted', 'job': job}\n"
            ),
            "why_this_fix": "Breaks a high-complexity path into small testable functions and reduces failure risk.",
            "validation_steps": [
                "Run existing workflow tests",
                "Add targeted tests for validate_payload and build_job",
                "Confirm cyclomatic complexity for original function decreases",
            ],
            "tests_to_add": ["test_validate_payload_rejects_missing_task", "test_process_job_accepts_valid_payload"],
        }
    return {
        "file_hint": "agents/main.py",
        "before_code": "# existing implementation\n# TODO: protocol incomplete\n",
        "after_code": (
            "from uagents import Context, Protocol\n"
            "from uagents_core.contrib.protocols.chat import ChatMessage, ChatAcknowledgement\n\n"
            "chat_proto = Protocol(name='chat')\n\n"
            "@chat_proto.on_message(ChatMessage)\n"
            "async def on_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:\n"
            "    await ctx.send(sender, ChatAcknowledgement(timestamp=msg.timestamp, acknowledged=True))\n"
        ),
        "why_this_fix": "Ensures protocol handler chain is complete and prevents runtime protocol rejection.",
        "validation_steps": [
            "Run unit tests for protocol handlers",
            "Simulate chat/payment message round-trip",
            "Verify evaluator marks protocol as implemented",
        ],
        "tests_to_add": ["test_chat_handler_acknowledges_messages", "test_payment_flow_ordering"],
    }


_ASI_ONE_QUICKSTART = (
    "https://innovationlab.fetch.ai/resources/docs/asione/asi-one-quickstart"
)
_ASI_ONE_OVERVIEW = (
    "https://innovationlab.fetch.ai/resources/docs/asione/asi-one-overview"
)
_ASI_ONE_OPENAI_COMPAT = (
    "https://innovationlab.fetch.ai/resources/docs/asione/build/openai-compatibility"
)


def _doc_url_for_issue(issue: str, doc_links: list[dict[str, str]]) -> str:
    s = issue.lower()
    if "asi" in s or "llm" in s or "openai" in s:
        return _ASI_ONE_OPENAI_COMPAT
    by_type = {dl.get("issue_type", ""): dl.get("doc_url", "") for dl in doc_links if isinstance(dl, dict)}
    if "uagent" in s and by_type.get("uagents_missing"):
        return by_type["uagents_missing"]
    if "chat" in s and by_type.get("chat_protocol_invalid"):
        return by_type["chat_protocol_invalid"]
    if "payment" in s and by_type.get("payment_protocol_invalid"):
        return by_type["payment_protocol_invalid"]
    return doc_links[0]["doc_url"] if doc_links else _ASI_ONE_OVERVIEW


def generate_suggestions(
    *,
    issues: list[str],
    doc_links: list[dict[str, str]],
    deep_analysis: dict[str, Any] | None = None,
    max_suggestions: int = 10,
) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    for idx, issue in enumerate(issues[: max_suggestions * 2], start=1):
        severity = _severity_for_issue(issue)
        category = _category_for_issue(issue)
        fix = _issue_specific_fix(issue)
        doc_url = _doc_url_for_issue(issue, doc_links)
        suggestions.append(
            {
                "id": f"sugg_{idx:03d}",
                "severity": severity,
                "category": category,
                "title": issue[:90],
                "description": f"Address this issue to improve Fetch.ai protocol compliance and production readiness: {issue}",
                "broken_pattern": issue,
                "before_code": fix["before_code"],
                "after_code": fix["after_code"],
                "fixed_code": fix["after_code"],
                "file_hint": fix["file_hint"],
                "doc_url": doc_url,
                "effort_minutes": 15 if severity in {"critical", "high"} else 8,
                "why_this_fix": fix["why_this_fix"],
                "risk": "Without this fix, protocol interactions can fail silently or be marked non-compliant.",
                "implementation_steps": [
                    "Add required protocol imports",
                    "Register missing handler(s)",
                    "Wire handler protocol into agent/bureau",
                ],
                "validation_steps": fix["validation_steps"],
                "tests_to_add": fix["tests_to_add"],
                "estimated_time_minutes": 15 if severity in {"critical", "high"} else 8,
            }
        )
    if deep_analysis and deep_analysis.get("security"):
        suggestions.append(
            {
                "id": f"sugg_{len(suggestions)+1:03d}",
                "severity": "critical",
                "category": "security",
                "title": "Remove hardcoded secrets and rotate compromised tokens",
                "description": "Move secrets to environment variables and rotate any exposed credentials.",
                "broken_pattern": "Hardcoded secret literal in source file",
                "before_code": "API_KEY = 'hardcoded_secret_here'",
                "after_code": "API_KEY = os.getenv('API_KEY', '')",
                "fixed_code": "import os\nAPI_KEY = os.getenv('API_KEY', '')",
                "file_hint": "config.py",
                "doc_url": doc_url,
                "effort_minutes": 12,
                "why_this_fix": "Prevents secret leakage and reduces compromise risk.",
                "risk": "Hardcoded credentials can be exfiltrated from source or logs.",
                "implementation_steps": [
                    "Replace literal with environment lookup",
                    "Rotate existing leaked keys",
                    "Update deployment secret manager",
                ],
                "validation_steps": [
                    "Run app with env var set",
                    "Ensure no secrets in git history moving forward",
                ],
                "tests_to_add": [
                    "test_config_reads_api_key_from_env",
                ],
                "estimated_time_minutes": 12,
            }
        )
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    suggestions.sort(key=lambda s: (order.get(str(s.get("severity")), 99), int(s.get("effort_minutes", 999))))
    return suggestions[:max_suggestions]


# ---------------------------------------------------------------------------
# LLM-driven suggestion generation (preferred path when OPENAI_API_KEY is set)
# ---------------------------------------------------------------------------

_SUGGESTION_PROMPT_PATH = PROMPTS_DIR / "static" / "SUGGESTION_GENERATION_PROMPT.md"


def _load_suggestion_prompt() -> str:
    try:
        return _SUGGESTION_PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        return (
            "You generate copy-pasteable code fixes for a Fetch.ai hackathon project. "
            "All LLM calls in `after_code` MUST use ASI:One via api.asi1.ai/v1, never plain OpenAI. "
            "Return ONLY valid JSON of the shape {\"suggestions\": [...]}.\n"
        )


def _strip_json_fences(text: str) -> str:
    """LLMs sometimes wrap JSON in ```json fences despite explicit instructions."""
    t = text.strip()
    if t.startswith("```"):
        m = re.search(r"```(?:json)?\s*(.*?)```", t, flags=re.DOTALL)
        if m:
            return m.group(1).strip()
    return t


def _scrub_openai_in_after_code(after_code: str) -> str:
    """Defensive: if the LLM still emits `api.openai.com` or `OPENAI_API_KEY` as the
    primary client config in an LLM-integration suggestion, rewrite to ASI:One.
    The prompt forbids it, but we enforce it on egress so the user never sees it."""
    if not after_code:
        return after_code
    s = after_code
    if "asi1.ai" in s.lower():
        return s
    if ("openai.com" in s.lower()) or ("OPENAI_API_KEY" in s) or ("gpt-4o" in s.lower()):
        s = re.sub(r"api_key\s*=\s*os\.getenv\(\s*['\"]OPENAI_API_KEY['\"]", "api_key=os.getenv('ASI_ONE_API_KEY'", s)
        s = re.sub(r"OpenAI\(\s*api_key=([^,)]+)\)", r"OpenAI(api_key=\1, base_url='https://api.asi1.ai/v1')", s)
        s = re.sub(r"model\s*=\s*['\"]gpt-4o(?:-mini)?['\"]", "model='asi1-mini'", s)
        s = re.sub(r"model\s*=\s*['\"]gpt-3\.5[^'\"]*['\"]", "model='asi1-mini'", s)
        s = "# NOTE: rewritten to ASI:One — Fetch.ai hackathon scoring requires api.asi1.ai/v1.\n" + s
    return s


def _normalize_llm_suggestion(raw: dict[str, Any], idx: int, doc_links: list[dict[str, str]]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    severity = str(raw.get("severity", "medium")).lower()
    if severity not in {"critical", "high", "medium", "low"}:
        severity = "medium"
    after = _scrub_openai_in_after_code(str(raw.get("after_code", "")).strip())
    before = str(raw.get("before_code", "")).strip()
    title = str(raw.get("title") or "Suggested fix").strip()[:160]
    description = str(raw.get("description") or "").strip()
    file_hint = str(raw.get("file_hint") or "").strip()
    why = str(raw.get("why_this_fix") or "").strip()
    if not after or not title or not why:
        return None
    issue_for_doc = f"{title} {description}"
    doc_url = str(raw.get("doc_url") or "").strip() or _doc_url_for_issue(issue_for_doc, doc_links)
    eta = raw.get("estimated_time_minutes") or raw.get("effort_minutes") or 15
    try:
        eta = int(eta)
    except Exception:
        eta = 15
    return {
        "id": str(raw.get("id") or f"sugg_{idx:03d}"),
        "severity": severity,
        "category": str(raw.get("category") or _category_for_issue(issue_for_doc)),
        "title": title,
        "description": description,
        "broken_pattern": str(raw.get("broken_pattern") or "").strip()[:300],
        "before_code": before,
        "after_code": after,
        "fixed_code": after,
        "file_hint": file_hint or "agents/main.py",
        "lines": str(raw.get("lines") or "").strip(),
        "doc_url": doc_url,
        "effort_minutes": eta,
        "estimated_time_minutes": eta,
        "why_this_fix": why,
        "risk": str(raw.get("risk") or "").strip() or "Review for behavior changes after applying the fix.",
        "implementation_steps": [
            str(s) for s in (raw.get("implementation_steps") or []) if str(s).strip()
        ],
        "validation_steps": [
            str(s) for s in (raw.get("validation_steps") or []) if str(s).strip()
        ],
        "tests_to_add": [
            str(s) for s in (raw.get("tests_to_add") or []) if str(s).strip()
        ],
    }


def generate_suggestions_llm(
    *,
    issues: list[str],
    doc_links: list[dict[str, str]],
    deep_analysis: dict[str, Any] | None,
    knowledge_context: str,
    code_semantic_sketch: str,
    code_excerpt: str,
    repo_name: str,
    max_suggestions: int = 12,
) -> list[dict[str, Any]] | None:
    """Real-time, LLM-grounded suggestions. Returns None if LLM is unavailable
    or returns invalid JSON (caller should fall back to ``generate_suggestions``)."""

    if not os.getenv("OPENAI_API_KEY"):
        return None

    try:
        from .fetch_docs_assistant import run_fetch_docs_assistant_sync
    except Exception:
        return None

    system_prompt = _load_suggestion_prompt()

    issue_lines = "\n".join(f"- {x}" for x in issues[: max_suggestions * 2]) or "- (no explicit issues; infer from code)"
    weaknesses = []
    if isinstance(deep_analysis, dict):
        for w in (deep_analysis.get("weaknesses") or [])[:20]:
            if isinstance(w, dict) and w.get("title"):
                weaknesses.append(f"- {w.get('title')} [severity: {w.get('severity', 'medium')}]")
    weak_block = "\n".join(weaknesses) or "- (none surfaced)"

    user_payload = (
        f"# SYSTEM CONTRACT\n{system_prompt}\n\n"
        f"# CONTEXT\n"
        f"REPO: {repo_name}\n\n"
        f"REVIEWER ISSUES:\n{issue_lines}\n\n"
        f"DEEP-ANALYSIS WEAKNESSES:\n{weak_block}\n\n"
        f"DOC GROUNDING (local RAG, top hits — also use file_search + web_search tools):\n{(knowledge_context or '')[:6000]}\n\n"
        f"CODE SEMANTIC SKETCH:\n{(code_semantic_sketch or '')[:4000]}\n\n"
        f"CODE EXCERPT (verbatim — quote `before_code` from this):\n{(code_excerpt or '')[:14000]}\n\n"
        "# TASK\n"
        f"Act as an implementation agent: for each REVIEWER ISSUES / WEAKNESS line, produce **this issue → this fix** "
        f"with paste-ready `after_code`, up to {max_suggestions} objects in severity order (critical first). "
        "Prefer one suggestion per distinct issue when the code allows. "
        "Each `description` must name which issue it fixes. "
        "Quote `before_code` verbatim from CODE EXCERPT. "
        "Every LLM-integration `after_code` MUST use ASI:One at `https://api.asi1.ai/v1` "
        "with `ASI_ONE_API_KEY` and model `asi1-mini` or `asi1`. "
        "Ground `doc_url` with **file_search** on the Fetch.ai docs vector store when available; "
        "when RAG/file_search is thin or ambiguous, **actively use Web Search** "
        "(`site:innovationlab.fetch.ai` / `site:fetch.ai`) and cite the exact doc page URLs you found. "
        "Return ONLY JSON of shape {\"suggestions\": [...]}."
    )

    try:
        text = run_fetch_docs_assistant_sync(user_payload, workflow_label="suggestions")
        if not text:
            return None
        cleaned = _strip_json_fences(text)
        data = json.loads(cleaned)
    except Exception:
        return None

    raw_list = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(raw_list, list) or not raw_list:
        return None

    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw_list, start=1):
        norm = _normalize_llm_suggestion(item, i, doc_links)
        if norm:
            out.append(norm)

    if not out:
        return None

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    out.sort(key=lambda s: (order.get(str(s.get("severity")), 99), int(s.get("effort_minutes", 999))))
    return out[:max_suggestions]

