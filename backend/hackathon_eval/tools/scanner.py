"""Deterministic code scanning — strict signals to reduce false positives."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class ScanResult:
    uagents_import: bool = False
    agent_instantiations: int = 0
    bureau_refs: bool = False
    agentverse_refs: bool = False
    uagents_context_protocol: bool = False

    chat_protocol_spec: bool = False
    chat_message_models: bool = False
    on_message_handlers: int = 0
    fastapi_or_flask: bool = False
    websocket_hint: bool = False

    payment_protocol_spec: bool = False
    payment_request_commit: bool = False
    stripe_or_checkout_hint: bool = False
    wallet_hint: bool = False
    transaction_hint: bool = False
    money_devkit_hint: bool = False

    openai_sdk: bool = False
    langchain_hint: bool = False
    llm_generic_hint: bool = False
    asi_endpoint_hint: bool = False

    tech_stack: list[str] = field(default_factory=list)

    signals: list[str] = field(default_factory=list)


_UA_IMPORT = re.compile(r"(?m)^\s*(?:from|import)\s+uagents\b")
_UA_AGENT = re.compile(r"\bAgent\s*\(")
_BUREAU = re.compile(r"\bBureau\s*\(")
_AGENTVERSE = re.compile(r"\bagentverse\b", re.I)
_CTX_PROTO = re.compile(r"\bContext\b.*\bProtocol\b|from\s+uagents\s+import\s+.*Context")

_CHAT_SPEC = re.compile(r"\bchat_protocol_spec\b")
_CHAT_MODELS = re.compile(
    r"\bChatMessage\b|\bChatAcknowledgement\b|\bTextContent\b|\buagents_core\.contrib\.protocols\.chat\b"
)
_ON_MSG = re.compile(r"@\s*agent\s*\.on_message\b|\.on_message\s*\(")
_FASTAPI = re.compile(r"\bFastAPI\b|\bflask\b|\bFlask\b")
_WS = re.compile(r"\bwebsocket\b|WebSocket|socket\.io", re.I)

_PAY_SPEC = re.compile(r"\bpayment_protocol_spec\b")
_PAY_MSG = re.compile(r"\bRequestPayment\b|\bCommitPayment\b|\bCompletePayment\b")
_STRIPE = re.compile(r"\bstripe\b|checkout\.session|PaymentIntent", re.I)
_WALLET = re.compile(r"\bwallet\b|mnemonic|COSMOS|fetchd|fet\b", re.I)
_TX = re.compile(r"\btransaction\b|tx_hash|broadcast_tx|sign_tx", re.I)
_MDK = re.compile(r"MoneyDevKit|moneydevkit|mdk", re.I)

_OPENAI = re.compile(r"\bopenai\b|ChatOpenAI|OpenAI\s*\(|from\s+openai\s+import", re.I)
_LC = re.compile(r"\blangchain\b|\bLangGraph\b|\blanggraph\b")
_LLM = re.compile(r"\bgpt-4|gpt-3|claude|anthropic|ollama|llm\b|ChatCompletion", re.I)
_ASI = re.compile(r"asi1\.ai|api\.asi1|ASI1|ASI-1", re.I)

_TECH = {
    "python": re.compile(r"\.py\b|pyproject|requirements\.txt", re.I),
    "typescript": re.compile(r"\.tsx?\b|tsconfig"),
    "javascript": re.compile(r"\.jsx?\b"),
    "rust": re.compile(r"\.rs\b|Cargo\.toml"),
    "go": re.compile(r"\.go\b|go\.mod"),
    "react": re.compile(r"react|next/|vite"),
    "docker": re.compile(r"Dockerfile|docker-compose"),
}


def scan_combined_text(text: str) -> ScanResult:
    r = ScanResult()

    if _UA_IMPORT.search(text):
        r.uagents_import = True
        r.signals.append("import uagents")
    n_agents = len(_UA_AGENT.findall(text))
    r.agent_instantiations = n_agents
    if n_agents:
        r.signals.append(f"Agent() count~{n_agents}")

    if _BUREAU.search(text):
        r.bureau_refs = True
        r.signals.append("Bureau")
    if _AGENTVERSE.search(text):
        r.agentverse_refs = True
        r.signals.append("agentverse reference")
    if _CTX_PROTO.search(text):
        r.uagents_context_protocol = True
        r.signals.append("Context/Protocol usage")

    if _CHAT_SPEC.search(text):
        r.chat_protocol_spec = True
        r.signals.append("chat_protocol_spec")
    if _CHAT_MODELS.search(text):
        r.chat_message_models = True
        r.signals.append("chat models import")
    om = len(_ON_MSG.findall(text))
    r.on_message_handlers = om
    if om:
        r.signals.append(f"on_message handlers~{om}")

    if _FASTAPI.search(text):
        r.fastapi_or_flask = True
        r.signals.append("web framework")
    if _WS.search(text):
        r.websocket_hint = True
        r.signals.append("websocket hint")

    if _PAY_SPEC.search(text):
        r.payment_protocol_spec = True
        r.signals.append("payment_protocol_spec")
    if _PAY_MSG.search(text):
        r.payment_request_commit = True
        r.signals.append("payment message types")
    if _STRIPE.search(text):
        r.stripe_or_checkout_hint = True
        r.signals.append("stripe/checkout hint")
    if _WALLET.search(text):
        r.wallet_hint = True
        r.signals.append("wallet/cosmos hint")
    if _TX.search(text):
        r.transaction_hint = True
        r.signals.append("transaction wording")
    if _MDK.search(text):
        r.money_devkit_hint = True
        r.signals.append("MoneyDevKit")

    if _OPENAI.search(text):
        r.openai_sdk = True
        r.signals.append("OpenAI / OpenAI SDK")
    if _LC.search(text):
        r.langchain_hint = True
        r.signals.append("LangChain / LangGraph")
    if _LLM.search(text):
        r.llm_generic_hint = True
        r.signals.append("LLM / model usage wording")
    if _ASI.search(text):
        r.asi_endpoint_hint = True
        r.signals.append("ASI1 endpoint reference")

    stack = []
    for name, rx in _TECH.items():
        if rx.search(text):
            stack.append(name)
    r.tech_stack = sorted(set(stack))

    return r


def scan_to_dict(s: ScanResult) -> dict:
    return {
        "uagents_import": s.uagents_import,
        "agent_instantiations": s.agent_instantiations,
        "bureau_refs": s.bureau_refs,
        "agentverse_refs": s.agentverse_refs,
        "uagents_context_protocol": s.uagents_context_protocol,
        "chat_protocol_spec": s.chat_protocol_spec,
        "chat_message_models": s.chat_message_models,
        "on_message_handlers": s.on_message_handlers,
        "fastapi_or_flask": s.fastapi_or_flask,
        "websocket_hint": s.websocket_hint,
        "payment_protocol_spec": s.payment_protocol_spec,
        "payment_request_commit": s.payment_request_commit,
        "stripe_or_checkout_hint": s.stripe_or_checkout_hint,
        "wallet_hint": s.wallet_hint,
        "transaction_hint": s.transaction_hint,
        "money_devkit_hint": s.money_devkit_hint,
        "openai_sdk": s.openai_sdk,
        "langchain_hint": s.langchain_hint,
        "llm_generic_hint": s.llm_generic_hint,
        "asi_endpoint_hint": s.asi_endpoint_hint,
        "tech_stack": s.tech_stack,
        "signals": s.signals,
    }
