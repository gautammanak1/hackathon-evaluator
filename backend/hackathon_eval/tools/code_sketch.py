"""Lightweight structural sketch of repository text for reviewer context."""

from __future__ import annotations

import re

_TOP_LEVEL_DEF = re.compile(r"(?m)^(?:async\s+)?def\s+(\w+)\s*\(")
_CLASS = re.compile(r"(?m)^class\s+(\w+)")
_DECORATOR = re.compile(r"(?m)^@\s*(\w+)")
_IMPORT = re.compile(r"(?m)^from\s+([a-zA-Z0-9_.]+)\s+import|^import\s+([a-zA-Z0-9_.]+)")
_FILE_HINT = re.compile(r"(?m)^###\s+FILE:\s+(.+)$")
_UAGENTS = re.compile(r"\buagents?\b", re.IGNORECASE)
_CHAT = re.compile(r"\bchat(_protocol|message|acknowledgement)?\b", re.IGNORECASE)
_PAYMENT = re.compile(r"\b(payment|requestpayment|commitpayment|completepayment)\b", re.IGNORECASE)
_ASI = re.compile(r"\b(asi1|asione|openai)\b", re.IGNORECASE)


def build_code_semantic_sketch(text: str, max_lines: int = 150) -> str:
    """
    Extract coarse structure: classes, defs, notable decorators (e.g. @agent.on_message).
    """
    lines: list[str] = []
    file_hints = [m.group(1).strip() for m in _FILE_HINT.finditer(text)][:25]
    for fh in file_hints:
        lines.append(f"file {fh}")
    for m in _CLASS.finditer(text):
        lines.append(f"class {m.group(1)}")
    for m in _TOP_LEVEL_DEF.finditer(text):
        lines.append(f"def {m.group(1)}(...)")
    for m in _DECORATOR.finditer(text):
        name = m.group(1)
        if name in {"agent", "pytest", "app"} or "message" in name.lower() or "rest" in name.lower():
            lines.append(f"@{name}...")
    for m in _IMPORT.finditer(text):
        mod = m.group(1) or m.group(2)
        if mod:
            top = mod.split(".")[0]
            if top in {"uagents", "langgraph", "fastapi", "openai", "langchain", "github"}:
                lines.append(f"import {mod}")

    # High-value capability markers for strict reviewer mode.
    markers = []
    if _UAGENTS.search(text):
        markers.append("capability:uagents")
    if _CHAT.search(text):
        markers.append("capability:chat_protocol")
    if _PAYMENT.search(text):
        markers.append("capability:payment_protocol")
    if _ASI.search(text):
        markers.append("capability:llm_or_asi")
    lines.extend(markers)

    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for ln in lines:
        if ln not in seen:
            seen.add(ln)
            out.append(ln)

    return "\n".join(out[:max_lines])
