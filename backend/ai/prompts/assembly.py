"""Assemble judge system prompts from ``ai/prompts/static`` + optional local Innovation Labs docs."""

from __future__ import annotations

import os
from pathlib import Path

from hackathon_eval.config import PROMPTS_DIR, resolve_innovation_labs_docs
from hackathon_eval.doc_catalog import load_url_manifest

MAX_PROMPT_ASSEMBLY_LINES = int(os.getenv("MAX_PROMPT_ASSEMBLY_LINES", "1000"))
PROMPT_FULL_RULES_MAX_CHARS = int(os.getenv("PROMPT_FULL_RULES_MAX_CHARS", "12000"))
MANIFEST_APPEND_ENTRIES = int(os.getenv("PROMPT_MANIFEST_URL_SAMPLE", "35"))

_PRIORITY_SUBDIRS = [
    "agent-creation",
    "agent-communication",
    "agentverse",
    "asione",
    "agent-transaction",
    "examples",
    "mcp-integration",
    "concepts-ai-agents",
]

_STATIC_SKIP = frozenset(
    {
        "STRICT_EVAL_INSTRUCTIONS.md",
        "JUDGE_AGENT_PROMPT.md",
    }
)
REVIEW_MODE = os.getenv("REVIEW_MODE", "strict_reviewer").strip().lower()


def _read_text_file(path: Path, max_chars: int = 80_000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:max_chars]
    except OSError:
        return ""


def _collect_static_prompt_files(static_dir: Path) -> list[Path]:
    if not static_dir.exists():
        return []
    return sorted(p for p in static_dir.glob("*.md") if p.name not in _STATIC_SKIP)


def assemble_doc_corpus_lines(docs_root: Path | None, max_lines: int) -> str:
    if docs_root is None or not docs_root.exists():
        return ""

    ordered_paths: list[Path] = []
    seen: set[Path] = set()

    for sub in _PRIORITY_SUBDIRS:
        base = docs_root / sub
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.md")):
            if p.is_file() and p not in seen:
                seen.add(p)
                ordered_paths.append(p)

    if len(ordered_paths) < 300:
        for p in sorted(docs_root.rglob("*.md")):
            if p.is_file() and p not in seen:
                seen.add(p)
                ordered_paths.append(p)

    lines_out: list[str] = []
    budget = max_lines
    for path in ordered_paths:
        if budget <= 0:
            break
        try:
            rel = path.relative_to(docs_root)
        except ValueError:
            rel = path
        chunk = _read_text_file(path, max_chars=120_000)
        header = f"\n\n### SOURCE: {rel}\n\n"
        for line in (header + chunk).splitlines():
            lines_out.append(line)
            budget -= 1
            if budget <= 0:
                break

    return "\n".join(lines_out)


def _manifest_citation_appendix() -> str:
    m = load_url_manifest()
    if not m:
        return ""
    lines = ["## Doc URL manifest sample (local path map)\n"]
    for i, (url, rel) in enumerate(sorted(m.items())):
        if i >= MANIFEST_APPEND_ENTRIES:
            break
        lines.append(f"- `{url}` → `{rel}`")
    return "\n".join(lines) + "\n"


def build_master_evaluation_prompt() -> str:
    static_dir = PROMPTS_DIR / "static"
    parts: list[str] = []

    parts.append(
        "# Role\n"
        "You are a strict technical judge for Fetch.ai / ASI:One hackathon submissions.\n"
    )

    agent_style = static_dir / "JUDGE_AGENT_PROMPT.md"
    if agent_style.exists():
        parts.append("## Agent-style judge contract\n")
        parts.append(_read_text_file(agent_style, max_chars=80_000))
        parts.append("\n")

    strict_path = static_dir / "STRICT_EVAL_INSTRUCTIONS.md"
    if strict_path.exists():
        parts.append("## Tier D — Strict instructions\n")
        parts.append(_read_text_file(strict_path, max_chars=120_000))
        parts.append("\n")
    if REVIEW_MODE == "strict_reviewer":
        strict_reviewer_path = static_dir / "STRICT_REVIEWER_PROMPT.md"
        full_fix_path = static_dir / "FULL_SNIPPET_FIX_PROMPT.md"
        if strict_reviewer_path.exists():
            parts.append("## Reviewer policy — strict reviewer mode\n")
            parts.append(_read_text_file(strict_reviewer_path, max_chars=80_000))
            parts.append("\n")
        if full_fix_path.exists():
            parts.append("## Fix generation policy — full runnable snippets\n")
            parts.append(_read_text_file(full_fix_path, max_chars=80_000))
            parts.append("\n")

    parts.append("## Tier A — Bundled references\n")
    for fp in _collect_static_prompt_files(static_dir):
        if fp.name == "FETCH_DEVELOPMENT_RULES_FULL.md":
            continue
        body = _read_text_file(fp, max_chars=200_000)
        parts.append(f"\n### {fp.name}\n{body}\n")

    full_rules = static_dir / "FETCH_DEVELOPMENT_RULES_FULL.md"
    if full_rules.exists():
        body = _read_text_file(full_rules, max_chars=PROMPT_FULL_RULES_MAX_CHARS)
        parts.append(f"\n## Tier B2 — Bounded full rules ({full_rules.name})\n{body}\n")

    live_root = resolve_innovation_labs_docs()
    corpus = assemble_doc_corpus_lines(live_root, MAX_PROMPT_ASSEMBLY_LINES)
    if corpus.strip():
        parts.append("\n## Tier B — Live Innovation Labs doc excerpt (assembled)\n" + corpus + "\n")
    else:
        parts.append(
            "\n## Tier B — Live docs\n"
            "No local Innovation Labs docs path configured or found. "
            "Set INNOVATION_LABS_DOCS to a checkout of `innovation-labs/docs`, "
            "or mount docs into ./data/innovation-labs-docs.\n"
        )

    appdx = _manifest_citation_appendix()
    if appdx.strip():
        parts.append("\n" + appdx)

    parts.append(
        """
## Output contract (baseline)
- Honor deterministic boolean `flags` in the user message unless they clearly contradict the excerpt (if contradiction, note it in notes; do not flip booleans silently).
- Cite file-path hints from the excerpt when possible.
- If the excerpt is sparse, say so and avoid inventing integrations.
"""
    )

    return "\n".join(parts)


_CACHED_PROMPT: str | None = None


def get_evaluation_system_prompt(*, refresh: bool = False) -> str:
    global _CACHED_PROMPT
    if _CACHED_PROMPT is None or refresh:
        _CACHED_PROMPT = build_master_evaluation_prompt()
    return _CACHED_PROMPT or ""


def clear_prompt_cache() -> None:
    global _CACHED_PROMPT
    _CACHED_PROMPT = None
