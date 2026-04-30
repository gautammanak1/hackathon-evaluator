"""Five-pillar weighted scoring (idea 25%, implementation 25%, protocol 20%, AI 15%, presentation 15%)."""

from __future__ import annotations

from typing import Any

WEIGHT_IDEA = 0.25
WEIGHT_IMPLEMENTATION = 0.25
WEIGHT_PROTOCOL = 0.20
WEIGHT_AI = 0.15
WEIGHT_PRESENTATION = 0.15


def compute_final_score(
    idea: float,
    implementation: float,
    protocol_integration: float,
    ai_integration: float,
    presentation: float,
) -> float:
    raw = (
        idea * WEIGHT_IDEA
        + implementation * WEIGHT_IMPLEMENTATION
        + protocol_integration * WEIGHT_PROTOCOL
        + ai_integration * WEIGHT_AI
        + presentation * WEIGHT_PRESENTATION
    )
    return round(raw * 10) / 10


def classification_from_final(final_score: float) -> str:
    if final_score < 4:
        return "Poor"
    if final_score < 6:
        return "Average"
    if final_score < 8:
        return "Good"
    return "Excellent"


def pillars_from_axis_scores(axis: dict[str, Any]) -> dict[str, float]:
    """Map Judge axis scores (0–10) to rubric pillars when explicit pillars are absent."""
    arch = float(axis.get("architecture") or 5)
    proto = float(axis.get("protocols") or 5)
    ai_u = float(axis.get("ai_usage") or 5)
    code_q = float(axis.get("code_quality") or 5)
    innov = float(axis.get("innovation") or 5)
    idea = max(0.0, min(10.0, innov * 0.55 + arch * 0.45))
    implementation = max(0.0, min(10.0, (code_q * 0.55 + arch * 0.45)))
    protocol_integration = max(0.0, min(10.0, proto))
    ai_integration = max(0.0, min(10.0, ai_u))
    presentation = max(0.0, min(10.0, code_q * 0.35 + innov * 0.35 + proto * 0.30))
    return {
        "idea": round(idea * 10) / 10,
        "implementation": round(implementation * 10) / 10,
        "protocol_integration": round(protocol_integration * 10) / 10,
        "ai_integration": round(ai_integration * 10) / 10,
        "presentation": round(presentation * 10) / 10,
    }


def calculation_string(scores: dict[str, float], final: float) -> str:
    i = scores["idea"]
    impl = scores["implementation"]
    p = scores["protocol_integration"]
    a = scores["ai_integration"]
    pres = scores["presentation"]
    parts = [
        f"({i}*{WEIGHT_IDEA})",
        f"({impl}*{WEIGHT_IMPLEMENTATION})",
        f"({p}*{WEIGHT_PROTOCOL})",
        f"({a}*{WEIGHT_AI})",
        f"({pres}*{WEIGHT_PRESENTATION})",
    ]
    return " + ".join(parts) + f" = {final}"
