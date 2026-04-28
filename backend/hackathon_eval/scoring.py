"""Structured scoring and notes derived from scan + LLM."""

from __future__ import annotations

from hackathon_eval.tools.scanner import ScanResult, scan_to_dict


def count_agent_instances(s: ScanResult) -> int:
    """Prefer explicit Agent( count; cap for sanity."""
    return min(s.agent_instantiations, 50)


def uagents_deployed_properly(s: ScanResult) -> tuple[bool, str]:
    if not s.uagents_import and s.agent_instantiations == 0:
        return False, "No uAgents import or Agent() construction found."
    if s.agent_instantiations == 0 and s.uagents_import:
        return False, "uAgents imported but no Agent() instance detected."
    if s.agent_instantiations >= 1 and not (s.uagents_context_protocol or s.on_message_handlers):
        return False, "Agent exists but little handler/protocol wiring detected (may be incomplete)."
    return True, "uAgents usage appears substantive (Agent + handlers/protocol signals)."


def chat_protocol_score(s: ScanResult) -> tuple[bool, str]:
    strong = s.chat_protocol_spec or (s.chat_message_models and s.on_message_handlers > 0)
    weak = (
        s.on_message_handlers > 0
        or s.fastapi_or_flask
        or s.websocket_hint
    )
    if strong:
        return True, "Chat protocol or structured uAgents chat models and handlers present."
    if weak and s.chat_message_models:
        return True, "Chat-style messaging patterns present; verify ASI1 compatibility."
    if weak:
        return False, "HTTP/WebSocket style messaging only — official chat_protocol_spec not found."
    return False, "No clear chat protocol or structured messaging implementation."


def llm_integration_score(s: ScanResult) -> tuple[bool, str]:
    if s.openai_sdk or s.langchain_hint:
        detail = []
        if s.langchain_hint:
            detail.append("LangChain/LangGraph")
        if s.openai_sdk:
            detail.append("OpenAI client")
        return True, ", ".join(detail) + " usage detected."
    if s.asi_endpoint_hint and s.llm_generic_hint:
        return True, "ASI1 / LLM references found."
    if s.llm_generic_hint:
        return False, "LLM wording present but no clear OpenAI/langchain integration."
    return False, "No LLM / OpenAI / LangChain integration detected."


def payment_score(s: ScanResult) -> tuple[bool, str]:
    if s.payment_protocol_spec or (s.payment_request_commit and s.stripe_or_checkout_hint):
        return True, "Payment protocol spec or seller/buyer payment message flow indicators."
    if s.money_devkit_hint:
        return True, "MoneyDevKit reference found."
    if s.stripe_or_checkout_hint and (s.wallet_hint or s.transaction_hint):
        return True, "Payments via fintech APIs + wallet/transaction wording (verify protocol completeness)."
    if s.stripe_or_checkout_hint:
        return False, "Stripe/checkout hints only — payment protocol completeness unclear."
    if s.wallet_hint and s.transaction_hint:
        return False, "Wallet/transaction wording without payment protocol markers."
    return False, "No payment protocol or payment flow detected."


def structure_quality(s: ScanResult, excerpt_len: int, num_files: int) -> tuple[int, str]:
    """Return partial points 0-2 for structure/quality heuristics."""
    score = 0.0
    notes: list[str] = []

    if num_files >= 10:
        score += 1.0
        notes.append("broad codebase coverage")
    elif num_files >= 5:
        score += 0.5
        notes.append("moderate codebase footprint")
    else:
        notes.append("small or sparse codebase")

    if len(s.tech_stack) >= 2:
        score += 0.5
        notes.append("multiple technologies")

    if s.chat_protocol_spec and s.payment_protocol_spec:
        score += 0.5
        notes.append("both chat and payment protocol markers")

    points = int(min(2, round(score)))
    if excerpt_len < 800:
        notes.append("low text capture — may be asset-only or ignored extensions")

    return points, "; ".join(notes)


def compute_quality_score(
    u_ok: bool,
    c_ok: bool,
    l_ok: bool,
    p_ok: bool,
    struct_points: int,
) -> int:
    total = 0
    total += 2 if u_ok else 0
    total += 2 if c_ok else 0
    total += 2 if l_ok else 0
    total += 2 if p_ok else 0
    total += struct_points
    return min(10, total)


def merge_issues(
    u: tuple[bool, str],
    c: tuple[bool, str],
    l: tuple[bool, str],
    p: tuple[bool, str],
    empty_repo: bool,
) -> list[str]:
    issues: list[str] = []
    if empty_repo:
        issues.append("Repository appears empty or unscannable.")
    if not u[0]:
        issues.append(f"uAgents: {u[1]}")
    if not c[0]:
        issues.append(f"Chat protocol: {c[1]}")
    if not l[0]:
        issues.append(f"LLM: {l[1]}")
    if not p[0]:
        issues.append(f"Payments: {p[1]}")
    return issues


__all__ = [
    "scan_to_dict",
    "count_agent_instances",
    "uagents_deployed_properly",
    "chat_protocol_score",
    "llm_integration_score",
    "payment_score",
    "structure_quality",
    "compute_quality_score",
    "merge_issues",
]
