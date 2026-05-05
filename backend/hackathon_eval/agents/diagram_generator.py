"""LLM-driven Mermaid diagram generator for the analysed repository.

Produces two diagrams that the frontend renders with `mermaid.js`:

* ``workflow``  — a ``flowchart TD`` showing how data and control flow through
  the agents / handlers / LLM calls / external integrations of the user's repo.
* ``sequence``  — a ``sequenceDiagram`` showing one representative request /
  response interaction (e.g. a user message hitting the chat protocol, the
  agent calling the LLM, and replying with an Acknowledgement).

The LLM is instructed to ground every node label in real artefacts from the
repo (file path, agent name, function name). When the LLM is not available we
fall back to a deterministic scaffold that names the repo and mentions whichever
protocol markers were detected, so the UI never renders empty diagrams.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any


_FENCE_RE = re.compile(r"```(?:mermaid|json)?\s*(.*?)```", re.DOTALL)


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        m = _FENCE_RE.search(t)
        if m:
            return m.group(1).strip()
    return t


def _sanitize_mermaid(src: str) -> str:
    """Mermaid is whitespace sensitive and rejects control characters."""
    if not src:
        return ""
    src = src.replace("\r\n", "\n").replace("\r", "\n").strip()
    src = "\n".join(line.rstrip() for line in src.split("\n"))
    return src


def _sanitize_sequence(src: str) -> str:
    """Strip flowchart-only syntax that LLMs sometimes leak into sequence diagrams."""
    if not src:
        return ""
    cleaned: list[str] = []
    for line in src.split("\n"):
        # `:::warn` only works in flowcharts — strip it so mermaid doesn't choke.
        line = re.sub(r":::\w+", "", line)
        # classDef has no meaning in sequenceDiagram either.
        if line.lstrip().startswith("classDef"):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def _looks_like_mermaid(src: str, kinds: tuple[str, ...]) -> bool:
    if not src:
        return False
    head = src.lstrip().splitlines()[0].lower() if src.lstrip() else ""
    return any(head.startswith(k) for k in kinds)


def _heuristic_workflow(
    *,
    repo_name: str,
    flags: dict[str, bool],
    file_paths: list[str],
) -> str:
    has_uagents = bool(flags.get("uagents"))
    has_chat = bool(flags.get("chat"))
    has_pay = bool(flags.get("payment"))
    has_llm = bool(flags.get("llm"))

    main_files = [p for p in file_paths if p.endswith(("main.py", "app.py", "agent.py"))][:3]
    entry = main_files[0] if main_files else "agents/main.py"

    lines = ["flowchart TD"]
    lines.append(f'  U["User / Caller"] -->|HTTP / Chat| EP["{entry}"]')
    if has_uagents:
        lines.append('  EP --> AG["uAgents Bureau & Agent registry"]')
    else:
        lines.append('  EP --> AG["(uAgents missing)"]:::warn')
    if has_chat:
        lines.append('  AG --> CHAT["chat_proto: ChatMessage / Acknowledgement"]')
    else:
        lines.append('  AG --> CHAT["(chat protocol missing)"]:::warn')
    if has_llm:
        lines.append('  CHAT --> LLM["ASI:One asi1-mini\\napi.asi1.ai/v1"]')
        lines.append('  LLM --> CHAT')
    else:
        lines.append('  CHAT --> LLM["(LLM integration absent — should call ASI:One)"]:::warn')
    if has_pay:
        lines.append('  CHAT --> PAY["payment_proto: Request → Commit → Complete"]')
    lines.append('  CHAT --> RESP["Acknowledgement / Response"]')
    lines.append('  RESP --> U')
    lines.append("  classDef warn fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D;")
    return "\n".join(lines)


def _heuristic_sequence(*, repo_name: str, flags: dict[str, bool]) -> str:
    has_chat = bool(flags.get("chat"))
    has_llm = bool(flags.get("llm"))
    lines = ["sequenceDiagram"]
    lines.append("  autonumber")
    lines.append("  participant U as User")
    lines.append(f"  participant A as {repo_name or 'Agent'}")
    lines.append("  participant L as ASI:One LLM")
    lines.append("  U->>A: ChatMessage(text)")
    if has_chat:
        lines.append("  A->>A: Validate Model & session id")
    else:
        lines.append("  Note over A: chat protocol missing — would normally validate model")
    if has_llm:
        lines.append("  A->>L: chat.completions.create(model=asi1-mini)")
        lines.append("  L-->>A: completion.content")
    else:
        lines.append("  Note over A,L: No LLM call detected (should call ASI:One)")
    lines.append("  A-->>U: ChatAcknowledgement(timestamp, acknowledged=true)")
    return "\n".join(lines)


def generate_repo_diagrams(
    *,
    repo_name: str,
    flags: dict[str, bool],
    file_paths: list[str],
    code_excerpt: str,
    code_semantic_sketch: str,
    deep_analysis: dict[str, Any] | None,
) -> dict[str, str]:
    """Return ``{"workflow": <mermaid>, "sequence": <mermaid>, "source": "llm"|"heuristic"}``."""

    fallback = {
        "workflow": _heuristic_workflow(repo_name=repo_name, flags=flags or {}, file_paths=file_paths or []),
        "sequence": _heuristic_sequence(repo_name=repo_name, flags=flags or {}),
        "source": "heuristic",
    }

    if not os.getenv("OPENAI_API_KEY"):
        return fallback

    try:
        from .fetch_docs_assistant import run_fetch_docs_assistant_sync
    except Exception:
        return fallback

    sys_prompt = (
        "You produce two Mermaid diagrams that describe a specific GitHub repository "
        "for a Fetch.ai hackathon judge.\n\n"
        "OUTPUT CONTRACT — return ONLY a single JSON object of shape:\n"
        '{ "workflow": "<mermaid flowchart TD ...>", "sequence": "<mermaid sequenceDiagram ...>" }\n\n'
        "Hard rules:\n"
        "1. `workflow` MUST start with `flowchart TD` and show the actual flow of "
        "control through the agents/handlers/LLM calls/external services that exist "
        "in the repo. Reference real file paths, agent names, function names — do not invent.\n"
        "2. `sequence` MUST start with `sequenceDiagram` and depict ONE representative "
        "request/response interaction grounded in the code (e.g. a ChatMessage being "
        "handled, the agent calling the LLM, returning an Acknowledgement). "
        "Use only the standard `participant X as Y` / `A->>B: msg` / `Note over A,B:` "
        "syntax. Do NOT apply `:::warn` or any classDef in sequence diagrams "
        "— they only work in flowchart syntax and will break rendering.\n"
        "3. Use concise node labels in double quotes for flowcharts. Escape `\\n` for line breaks.\n"
        "4. In the `workflow` flowchart, if the repo lacks Fetch.ai integrations, "
        "mark them visually with `classDef warn fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D;` "
        "and append `:::warn` to the missing nodes. In the `sequence` diagram, "
        "use a `Note over X,Y: ...` block to call out missing or wrong components instead.\n"
        "5. The LLM provider in any diagram MUST be ASI:One (api.asi1.ai/v1) — "
        "NEVER label it 'OpenAI' or 'GPT' even if the repo currently uses OpenAI. "
        "If the repo currently uses raw OpenAI, in the workflow label the node "
        '`OpenAI (should be ASI:One)`:::warn ; in the sequence diagram, use '
        '`Note over A,L: Currently OpenAI — must migrate to ASI:One (api.asi1.ai/v1)`.\n'
        "6. No prose outside the JSON object. No code fences inside the strings.\n"
        "7. You MAY use file_search (Fetch.ai docs vector store) and web_search "
        "(innovationlab.fetch.ai / fetch.ai) to confirm protocol or ASI:One naming "
        "before labelling nodes — still ground the diagram in the repo's real files."
    )

    files_block = "\n".join(f"- {p}" for p in (file_paths or [])[:60]) or "- (no files listed)"
    flags_block = ", ".join(f"{k}={v}" for k, v in (flags or {}).items()) or "(none)"
    weaknesses = []
    if isinstance(deep_analysis, dict):
        for w in (deep_analysis.get("weaknesses") or [])[:8]:
            if isinstance(w, dict) and w.get("title"):
                weaknesses.append(f"- {w.get('title')} [severity: {w.get('severity', 'medium')}]")
    weak_block = "\n".join(weaknesses) or "- (none surfaced)"

    combined_prompt = (
        f"# SYSTEM CONTRACT\n{sys_prompt}\n\n"
        f"# CONTEXT\n"
        f"REPO: {repo_name}\n"
        f"DETECTED PROTOCOL FLAGS: {flags_block}\n\n"
        f"WEAKNESSES (surface these as warn nodes when relevant):\n{weak_block}\n\n"
        f"FILE PATHS (top 60):\n{files_block}\n\n"
        f"CODE SEMANTIC SKETCH:\n{(code_semantic_sketch or '')[:4000]}\n\n"
        f"CODE EXCERPT:\n{(code_excerpt or '')[:10000]}\n\n"
        "Return JSON now."
    )

    try:
        text = run_fetch_docs_assistant_sync(combined_prompt, workflow_label="diagrams")
        if not text:
            return fallback
        cleaned = _strip_fences(text)
        data = json.loads(cleaned)
    except Exception:
        return fallback

    workflow = _sanitize_mermaid(str(data.get("workflow", "")))
    sequence = _sanitize_sequence(_sanitize_mermaid(str(data.get("sequence", ""))))

    if not _looks_like_mermaid(workflow, ("flowchart", "graph")):
        workflow = fallback["workflow"]
    if not _looks_like_mermaid(sequence, ("sequencediagram",)):
        sequence = fallback["sequence"]

    return {
        "workflow": workflow,
        "sequence": sequence,
        "source": "llm" if (workflow != fallback["workflow"] or sequence != fallback["sequence"]) else "heuristic",
    }
