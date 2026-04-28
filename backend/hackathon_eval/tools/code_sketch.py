"""Lightweight structural sketch of Python-ish text for LLM context (not full AST)."""

from __future__ import annotations

import re

_TOP_LEVEL_DEF = re.compile(r"(?m)^(?:async\s+)?def\s+(\w+)\s*\(")
_CLASS = re.compile(r"(?m)^class\s+(\w+)")
_DECORATOR = re.compile(r"(?m)^@\s*(\w+)")


def build_code_semantic_sketch(text: str, max_lines: int = 120) -> str:
    """
    Extract coarse structure: classes, defs, notable decorators (e.g. @agent.on_message).
    """
    lines: list[str] = []
    for m in _CLASS.finditer(text):
        lines.append(f"class {m.group(1)}")
    for m in _TOP_LEVEL_DEF.finditer(text):
        lines.append(f"def {m.group(1)}(...)")
    for m in _DECORATOR.finditer(text):
        name = m.group(1)
        if name in {"agent", "pytest", "app"} or "message" in name.lower() or "rest" in name.lower():
            lines.append(f"@{name}...")

    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for ln in lines:
        if ln not in seen:
            seen.add(ln)
            out.append(ln)

    return "\n".join(out[:max_lines])
