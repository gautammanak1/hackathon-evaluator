"""Heuristic protocol validation from static text (no runtime proof)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

PaymentStatus = Literal["valid", "invalid", "unknown"]
ChatStatus = Literal["valid", "invalid", "unknown"]


_REQUEST = re.compile(r"\bRequestPayment\b")
_COMMIT = re.compile(r"\bCommitPayment\b")
_COMPLETE = re.compile(r"\bCompletePayment\b")
_PAY_SPEC = re.compile(r"\bpayment_protocol_spec\b")

_CHAT_MSG = re.compile(r"\bChatMessage\b")
_CHAT_ACK = re.compile(r"\bChatAcknowledgement\b")
_CHAT_SPEC = re.compile(r"\bchat_protocol_spec\b")
_ASYNC_HANDLER = re.compile(r"(?m)^\s*async\s+def\s+\w+\s*\(")
_ON_MESSAGE = re.compile(r"@\s*agent\s*\.on_message\b|\.on_message\s*\(")
_PROTOCOL_HANDLER = re.compile(r"@\w*proto\w*\.on_message\b|@chat_proto\.on_message\b")


@dataclass
class ProtocolValidationResult:
    payment: PaymentStatus
    chat: ChatStatus
    payment_notes: list[str] = field(default_factory=list)
    chat_notes: list[str] = field(default_factory=list)


def validate_protocols(combined_text: str) -> dict:
    """
    Return JSON-serializable protocol_validation dict.
    Payment valid only if payment_protocol_spec or all three payment message types appear.
    Chat valid if chat spec/models plus async/on_message signals.
    """
    r = _validate(combined_text or "")
    return {
        "payment": r.payment,
        "chat": r.chat,
        "payment_notes": r.payment_notes,
        "chat_notes": r.chat_notes,
        "disclaimer": "Heuristic static analysis only; cannot prove runtime message ordering.",
    }


def _validate(text: str) -> ProtocolValidationResult:
    notes_p: list[str] = []
    notes_c: list[str] = []

    has_req = bool(_REQUEST.search(text))
    has_com = bool(_COMMIT.search(text))
    has_cmp = bool(_COMPLETE.search(text))
    has_pay_spec = bool(_PAY_SPEC.search(text))

    if has_pay_spec and has_req and has_com and has_cmp:
        pay: PaymentStatus = "valid"
    elif has_req and has_com and has_cmp:
        pay = "valid"
        notes_p.append("Payment message types present; payment_protocol_spec not found.")
    elif has_pay_spec or has_req or has_com or has_cmp:
        pay = "invalid"
        missing = []
        if not has_req:
            missing.append("RequestPayment")
        if not has_com:
            missing.append("CommitPayment")
        if not has_cmp:
            missing.append("CompletePayment")
        notes_p.append("Incomplete payment flow signals: missing " + ", ".join(missing))
    else:
        pay = "unknown"
        notes_p.append("No payment protocol markers found.")

    chat_models = bool(_CHAT_MSG.search(text) and _CHAT_ACK.search(text))
    chat_spec = bool(_CHAT_SPEC.search(text))
    async_ok = bool(_ASYNC_HANDLER.search(text))
    on_msg = bool(_ON_MESSAGE.search(text) or _PROTOCOL_HANDLER.search(text))

    if (chat_spec or chat_models) and async_ok and on_msg:
        chat: ChatStatus = "valid"
    elif chat_spec or chat_models:
        chat = "invalid"
        if not async_ok:
            notes_c.append("No async handlers detected for chat flow.")
        if not on_msg:
            notes_c.append("No on_message / protocol handler pattern detected.")
    elif _ON_MESSAGE.search(text) or _PROTOCOL_HANDLER.search(text):
        chat = "invalid"
        notes_c.append("Handlers without chat protocol models/spec.")
    else:
        chat = "unknown"
        notes_c.append("No chat protocol markers found.")

    return ProtocolValidationResult(
        payment=pay,
        chat=chat,
        payment_notes=notes_p,
        chat_notes=notes_c,
    )
