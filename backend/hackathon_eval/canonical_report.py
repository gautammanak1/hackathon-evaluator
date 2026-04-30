"""Assemble enterprise-shaped evaluation payload for persistence + API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from hackathon_eval.weighted_scores import (
    WEIGHT_AI,
    WEIGHT_IDEA,
    WEIGHT_IMPLEMENTATION,
    WEIGHT_PRESENTATION,
    WEIGHT_PROTOCOL,
    calculation_string,
    classification_from_final,
    compute_final_score,
    pillars_from_axis_scores,
)


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


STEP_UI_NAMES = {
    "repo_ingestion": "Repo Ingestion",
    "code_analysis": "Code Analysis",
    "protocol_validation": "Protocol Validation",
    "feature_detection": "Feature Detection",
    "knowledge_grounding": "Knowledge Grounding",
    "benchmark_compare": "Benchmark Compare",
    "evaluation": "Evaluation",
    "report_generator": "Report Generation",
}


def normalize_evaluation_steps(raw: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    out = []
    for i, row in enumerate(raw, start=1):
        name = str(row.get("name") or row.get("node") or f"step_{i}")
        out.append(
            {
                "step_id": row.get("step_id") or i,
                "name": STEP_UI_NAMES.get(name, name),
                "node_key": name,
                "status": row.get("status") or "complete",
                "duration_ms": int(row.get("duration_ms") or 0),
                "timestamp": row.get("timestamp") or _iso_now(),
            }
        )
    return out


def build_canonical_payload(
    *,
    repo_report: dict[str, Any],
    evaluation_steps: list[dict[str, Any]] | None,
    submission_metadata: dict[str, Any] | None,
    source_url: str | None,
    submission_type: str,
    total_evaluation_time_ms: int | None = None,
    warning: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    """Wrap legacy graph output + weighted scores into a stable envelope."""
    rv2 = repo_report.get("report_v2") or {}
    legacy_scores = rv2.get("scores") or {}
    pillars = pillars_from_axis_scores(legacy_scores)
    final = compute_final_score(
        pillars["idea"],
        pillars["implementation"],
        pillars["protocol_integration"],
        pillars["ai_integration"],
        pillars["presentation"],
    )
    cls = classification_from_final(final)
    feat = rv2.get("features") or {}
    features_detected = [
        {"name": "uAgents Framework", "status": "implemented" if feat.get("uagents") else "missing", "confidence": 0.9},
        {"name": "Chat Protocol", "status": "implemented" if feat.get("chat_protocol") else "missing", "confidence": 0.85},
        {"name": "Payment Protocol", "status": "implemented" if feat.get("payment_protocol") else "not_implemented", "confidence": 0.85},
        {"name": "LLM Integration", "status": "implemented" if feat.get("llm_integration") else "missing", "confidence": 0.85},
    ]
    steps_norm = normalize_evaluation_steps(evaluation_steps or [])
    payload = {
        "submission_id": "",
        "timestamp": _iso_now(),
        "project_name": rv2.get("repo_name") or repo_report.get("repo_name") or "",
        "team_name": (
            str((submission_metadata or {}).get("team_name") or "")
            if isinstance(submission_metadata, dict)
            else ""
        ),
        "track": (
            str((submission_metadata or {}).get("track") or "") if isinstance(submission_metadata, dict) else ""
        ),
        "submission_type": submission_type,
        "source_url": source_url or "",
        "metadata": {
            "submitted_date": _iso_now()[:10],
            "custom_context": "",
        },
        "evaluation_status": "error" if error else ("complete" if repo_report else "pending"),
        "evaluation_steps": steps_norm,
        "scores": {
            "idea": pillars["idea"],
            "implementation": pillars["implementation"],
            "protocol_integration": pillars["protocol_integration"],
            "ai_integration": pillars["ai_integration"],
            "presentation": pillars["presentation"],
            "final_score": final,
            "calculation": calculation_string(pillars, final),
            "classification": cls,
            "confidence": float(rv2.get("benchmark", {}).get("confidence") or 0.0),
            "weights": {
                "idea": WEIGHT_IDEA,
                "implementation": WEIGHT_IMPLEMENTATION,
                "protocol_integration": WEIGHT_PROTOCOL,
                "ai_integration": WEIGHT_AI,
                "presentation": WEIGHT_PRESENTATION,
            },
        },
        "analysis": {
            "idea": {
                "problem_statement": rv2.get("problem_solved") or "",
                "solution": rv2.get("solution_overview") or "",
                "innovation": "",
                "score_rationale": rv2.get("summary") or "",
                "strengths": [],
                "weaknesses": [],
            },
            "implementation": {
                "technologies": repo_report.get("tech_stack") or [],
                "code_quality": legacy_scores,
                "strengths": [],
                "weaknesses": repo_report.get("issues") or [],
            },
            "protocol_integration": rv2.get("protocol_validation") or {},
            "ai_integration": {"details": rv2.get("notes") or ""},
            "presentation": {"readme_score": pillars["presentation"], "notes": rv2.get("notes") or ""},
        },
        "features_detected": features_detected,
        "report_v2": rv2,
        "report_legacy": repo_report.get("report_legacy") or {k: v for k, v in repo_report.items() if k != "report_v2"},
        "total_evaluation_time_ms": total_evaluation_time_ms or sum(int(s.get("duration_ms") or 0) for s in steps_norm),
        "error": error,
        "warning": warning,
    }
    # Align classification string with legacy judge string when close
    legacy_cls = (rv2.get("classification") or "").strip()
    if legacy_cls and legacy_cls != cls:
        payload["scores"]["legacy_classification"] = legacy_cls
    payload["quality_score"] = final
    payload["classification"] = cls
    if payload["project_name"]:
        payload["repo_name"] = payload["project_name"]
    return payload
