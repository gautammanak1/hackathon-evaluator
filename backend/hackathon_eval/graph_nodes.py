"""LangGraph nodes: ingestion, analysis, features, knowledge, benchmark, evaluation, report."""

from __future__ import annotations

import json
from dataclasses import fields
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from hackathon_eval.benchmarks import compare_to_benchmark
from hackathon_eval.config import OPENAI_MODEL
from hackathon_eval.judge_output import AxisScores, JudgeLLMOutput
from hackathon_eval.prompts_system import get_evaluation_system_prompt
from hackathon_eval.protocol_validation import validate_protocols
from hackathon_eval.scoring import (
    chat_protocol_score,
    compute_quality_score,
    count_agent_instances,
    llm_integration_score,
    merge_issues,
    payment_score,
    structure_quality,
    uagents_deployed_properly,
)
from hackathon_eval.state import EvalState
from hackathon_eval.tools.code_sketch import build_code_semantic_sketch
from hackathon_eval.tools.knowledge import retrieve_context
from hackathon_eval.tools.repo_tools import (
    build_repo_bundle,
    clone_repository,
    iter_text_files,
    parse_repo_identity,
)
from hackathon_eval.tools.scanner import ScanResult, scan_combined_text

_MAX_SYS_PROMPT_CHARS = int(__import__("os").getenv("MAX_SYS_PROMPT_CHARS", "28000"))


def _evaluation_system_message() -> SystemMessage:
    body = get_evaluation_system_prompt()
    if len(body) > _MAX_SYS_PROMPT_CHARS:
        body = body[:_MAX_SYS_PROMPT_CHARS] + "\n...[system prompt truncated]...\n"
    return SystemMessage(content=body)


def _scan_from_state(state: EvalState) -> ScanResult:
    raw = state.get("scan") or {}
    kwargs = {}
    for f in fields(ScanResult):
        if f.name in raw:
            kwargs[f.name] = raw[f.name]
    return ScanResult(**kwargs)


def _heuristic_judge_output(
    score: int,
    flags: dict[str, bool],
    protocol_validation: dict[str, Any],
    benchmark: dict[str, Any],
    c: tuple[bool, str],
    l: tuple[bool, str],
    p: tuple[bool, str],
    issues: list[str],
    struct_pts: int,
) -> JudgeLLMOutput:
    pv = protocol_validation or {}
    chat_ok = pv.get("chat") == "valid"
    pay_ok = pv.get("payment") == "valid"
    arch = min(10, max(2, score + (1 if flags.get("uagents") else 0)))
    prot = min(10, (5 if chat_ok else 3) + (4 if pay_ok else 2))
    if prot > 10:
        prot = 10
    ai_u = 8 if flags.get("llm") else 4
    code_q = min(10, 4 + struct_pts * 2)
    innov = min(10, 5 + (2 if flags.get("llm") and flags.get("chat") else 0))
    axes = AxisScores(
        architecture=arch,
        protocols=prot,
        ai_usage=ai_u,
        code_quality=code_q,
        innovation=innov,
    )
    if score <= 3:
        cls = "Poor"
    elif score <= 6:
        cls = "Average"
    else:
        cls = "Good"
    br = benchmark.get("reason") or "Benchmark not configured or unavailable."
    summ = (
        f"Heuristic-only classification ({cls}). Overall heuristic score {score}/10. "
        "Set OPENAI_API_KEY for full LLM narrative and axis refinement."
    )
    notes_txt = "; ".join(issues) if issues else "No major heuristic issues."
    return JudgeLLMOutput(
        classification=cls,
        problem_solved="Not inferred in heuristic mode; provide OPENAI_API_KEY for LLM analysis.",
        solution_overview="Not inferred in heuristic mode; provide OPENAI_API_KEY for LLM analysis.",
        scores=axes,
        benchmark_reason=br,
        summary=summ,
        notes=notes_txt,
        chat_protocol_details=c[1],
        asi_llm_details=l[1],
        payment_details=p[1],
    )


def node_repo_ingestion(state: EvalState) -> dict[str, Any]:
    import os

    url = (state.get("repo_url") or "").strip()
    branch = state.get("branch")
    doc_text = (state.get("document_text") or "").strip()
    meta = state.get("submission_metadata") if isinstance(state.get("submission_metadata"), dict) else {}
    max_doc = int(os.getenv("MAX_DOCUMENT_TEXT_CHARS", "200000"))
    max_pdf_annex = int(os.getenv("MAX_PDF_APPEND_CHARS", "80000"))

    def _display_name() -> str:
        for key in ("team_name", "table_name", "project_name", "submission_title"):
            v = meta.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()[:120]
        return "document-submission"

    if not url:
        if not doc_text:
            return {
                "work_dir": "",
                "repo_name": _display_name(),
                "clone_ok": False,
                "clone_error": "Provide a GitHub repo URL and/or upload a PDF with extractable text.",
                "file_paths": [],
                "combined_source_excerpt": "",
                "repo_stats": {"num_files_scanned": 0, "source": "none"},
            }
        excerpt = doc_text[:max_doc]
        return {
            "work_dir": "",
            "repo_name": _display_name().replace("/", "-")[:80] or "document-submission",
            "clone_ok": True,
            "clone_error": "",
            "file_paths": ["document.pdf"],
            "combined_source_excerpt": excerpt,
            "repo_stats": {
                "num_files_scanned": 1,
                "source": "pdf",
                "chars": len(excerpt),
            },
        }

    _, folder = parse_repo_identity(url)
    root, err = clone_repository(url, branch=branch)
    if err:
        base = {
            "work_dir": str(root),
            "repo_name": folder,
            "clone_ok": False,
            "clone_error": err,
            "file_paths": [],
            "combined_source_excerpt": "",
            "repo_stats": {"error": err},
        }
        if doc_text:
            excerpt = doc_text[:max_doc]
            base["clone_ok"] = True
            base["clone_error"] = f"{err} — falling back to PDF/document text only."
            base["file_paths"] = ["document.pdf"]
            base["combined_source_excerpt"] = excerpt
            base["repo_stats"] = {"num_files_scanned": 1, "source": "pdf_fallback", "clone_failed": True}
        return base

    paths = [str(p.relative_to(root)) for p in iter_text_files(root)]
    excerpt, stats = build_repo_bundle(root)
    stats = dict(stats) if isinstance(stats, dict) else {}
    if doc_text:
        annex = doc_text[:max_pdf_annex]
        glue = "\n\n--- Extracted PDF / document (appended) ---\n\n"
        excerpt = (excerpt + glue + annex)[:max_doc]
        stats["pdf_appended_chars"] = len(annex)
    return {
        "work_dir": str(root),
        "repo_name": folder,
        "clone_ok": True,
        "clone_error": "",
        "file_paths": paths,
        "combined_source_excerpt": excerpt,
        "repo_stats": stats,
    }


def node_code_analysis(state: EvalState) -> dict[str, Any]:
    text = state.get("combined_source_excerpt") or ""
    scan = scan_combined_text(text)
    sketch = build_code_semantic_sketch(text)
    return {"scan": scan.__dict__, "code_semantic_sketch": sketch}


def node_protocol_validation(state: EvalState) -> dict[str, Any]:
    text = state.get("combined_source_excerpt") or ""
    return {"protocol_validation": validate_protocols(text)}


def node_feature_detection(state: EvalState) -> dict[str, Any]:
    s = _scan_from_state(state)
    u = uagents_deployed_properly(s)
    c = chat_protocol_score(s)
    l = llm_integration_score(s)
    p = payment_score(s)
    feat = {
        "uagents_usage": u[0],
        "uagents_note": u[1],
        "agents_detected": count_agent_instances(s),
        "chat_protocol": {"implemented": c[0], "details": c[1]},
        "asi1_llm": {"implemented": l[0], "details": l[1]},
        "payment_protocol": {"implemented": p[0], "details": p[1]},
        "tech_stack": s.tech_stack,
    }
    return {"features": feat}


def node_knowledge_grounding(state: EvalState) -> dict[str, Any]:
    s = _scan_from_state(state)
    query = " ".join(
        [
            "uAgents chat protocol payment ASI1",
            " ".join(s.signals[:20]),
            (state.get("repo_name") or ""),
        ]
    )
    ctx = retrieve_context(query)
    return {"knowledge_context": ctx}


def node_benchmark_compare(state: EvalState) -> dict[str, Any]:
    text = state.get("combined_source_excerpt") or ""
    bench = compare_to_benchmark(text)
    return {"benchmark": bench}


def node_evaluation(state: EvalState) -> dict[str, Any]:
    import os

    s = _scan_from_state(state)
    stats = state.get("repo_stats") or {}
    excerpt = state.get("combined_source_excerpt") or ""
    num_files = int(stats.get("num_files_scanned") or 0)
    excerpt_len = len(excerpt)
    empty_repo = not state.get("clone_ok") or num_files == 0 or excerpt_len < 20

    u = uagents_deployed_properly(s)
    c = chat_protocol_score(s)
    l = llm_integration_score(s)
    p = payment_score(s)
    struct_pts, struct_note = structure_quality(s, excerpt_len, num_files)
    issues = merge_issues(u, c, l, p, empty_repo)
    score = compute_quality_score(u[0], c[0], l[0], p[0], struct_pts)

    protocol_validation = state.get("protocol_validation") or {}
    benchmark = state.get("benchmark") or {}

    flags = {
        "uagents": u[0],
        "chat": c[0],
        "llm": l[0],
        "payment": p[0],
    }
    payload = {
        "repo_name": state.get("repo_name"),
        "quality_score_heuristic": score,
        "issues": issues,
        "structure_note": struct_note,
        "flags": flags,
        "scan_signals": s.signals[:40],
        "PROTOCOL_VALIDATION": protocol_validation,
        "BENCHMARK": benchmark,
    }
    sub = (state.get("submission_context") or "").strip()
    sub_block = f"SUBMISSION_CONTEXT:\n{sub[:6000]}\n\n" if sub else ""

    meta = state.get("submission_metadata")
    meta_block = ""
    if isinstance(meta, dict) and meta:
        meta_block = (
            "SUBMISSION_METADATA (hackathon / team columns; schema may vary by event):\n"
            f"{json.dumps(meta, indent=2, ensure_ascii=False)[:8000]}\n\n"
        )

    user = HumanMessage(
        content=(
            f"DETERMINISTIC_JSON:\n{json.dumps(payload, indent=2)[:12000]}\n\n"
            f"{meta_block}"
            f"{sub_block}"
            f"DOC_GROUNDING:\n{state.get('knowledge_context', '')[:8000]}\n\n"
            f"CODE_SEMANTIC_SKETCH:\n{state.get('code_semantic_sketch', '')[:6000]}\n\n"
            f"CODE_EXCERPT:\n{excerpt[:12000]}"
        )
    )

    if not os.getenv("OPENAI_API_KEY"):
        reflection = _heuristic_judge_output(
            score, flags, protocol_validation, benchmark, c, l, p, issues, struct_pts
        )
    else:
        llm = ChatOpenAI(model=OPENAI_MODEL, temperature=0.1)
        structured = llm.with_structured_output(JudgeLLMOutput)
        try:
            reflection = structured.invoke([_evaluation_system_message(), user])
        except Exception as exc:
            reflection = _heuristic_judge_output(
                score, flags, protocol_validation, benchmark, c, l, p, issues, struct_pts
            )
            reflection.summary = (
                f"{reflection.summary} (LLM structured output failed: {exc})"
            )

    # Enforce protocol narrative consistency
    if protocol_validation.get("payment") == "invalid" and p[0]:
        issues = list(issues)
        issues.append(
            "Payment protocol heuristics flagged invalid flow; treat payment claims with skepticism."
        )

    analysis = {
        "heuristic_score": score,
        "issues": issues,
        "struct_note": struct_note,
        "reflection": reflection.model_dump(),
        "flags": flags,
    }
    return {"analysis_llm_notes": json.dumps(analysis), "analysis": analysis}


def node_report_generator(state: EvalState) -> dict[str, Any]:
    s = _scan_from_state(state)
    analysis = state.get("analysis") or {}
    if not analysis:
        try:
            analysis = json.loads(state.get("analysis_llm_notes") or "{}")
        except json.JSONDecodeError:
            analysis = {}

    reflection_raw = analysis.get("reflection") or {}
    flags = analysis.get("flags") or {}

    try:
        judge = JudgeLLMOutput.model_validate(reflection_raw)
    except Exception:
        judge = _heuristic_judge_output(
            int(analysis.get("heuristic_score", 0)),
            flags if isinstance(flags, dict) else {},
            state.get("protocol_validation") or {},
            state.get("benchmark") or {},
            chat_protocol_score(s),
            llm_integration_score(s),
            payment_score(s),
            analysis.get("issues", []) if isinstance(analysis, dict) else [],
            1,
        )

    u_ok = bool(flags.get("uagents", False))
    chat_ok = bool(flags.get("chat", False))
    llm_ok = bool(flags.get("llm", False))
    pay_ok = bool(flags.get("payment", False))

    axis = judge.scores.model_dump()
    mean_axis = round(sum(axis.values()) / max(1, len(axis)))
    heuristic = int(analysis.get("heuristic_score", 0)) if isinstance(analysis, dict) else 0
    top_score = int(round((mean_axis + heuristic) / 2))
    top_score = max(0, min(10, top_score))

    pv = state.get("protocol_validation") or {}
    bench = state.get("benchmark") or {}

    meta_out = state.get("submission_metadata") if isinstance(state.get("submission_metadata"), dict) else {}
    report_v2 = {
        "repo_name": state.get("repo_name") or "",
        "submission_metadata": meta_out,
        "score": top_score,
        "classification": judge.classification,
        "features": {
            "uagents": u_ok,
            "chat_protocol": chat_ok,
            "payment_protocol": pay_ok,
            "llm_integration": llm_ok,
        },
        "protocol_validation": {
            "payment": pv.get("payment", "unknown"),
            "chat": pv.get("chat", "unknown"),
            "payment_notes": pv.get("payment_notes", []),
            "chat_notes": pv.get("chat_notes", []),
            "disclaimer": pv.get("disclaimer", ""),
        },
        "scores": axis,
        "benchmark": {
            "closest_match": bench.get("closest_match", "unknown"),
            "confidence": bench.get("confidence", 0.0),
            "similarity_good": bench.get("similarity_good"),
            "similarity_bad": bench.get("similarity_bad"),
            "reason": judge.benchmark_reason or bench.get("reason", ""),
            "exemplars_good": bench.get("exemplars_good", []) or bench.get("good_exemplars", []),
            "exemplars_bad": bench.get("exemplars_bad", []) or bench.get("bad_exemplars", []),
        },
        "issues": analysis.get("issues", []) if isinstance(analysis, dict) else [],
        "problem_solved": judge.problem_solved,
        "solution_overview": judge.solution_overview,
        "summary": judge.summary,
        "notes": judge.notes,
    }

    struct_note = analysis.get("struct_note") if isinstance(analysis, dict) else ""
    if struct_note:
        report_v2["notes"] = f"{report_v2['notes']}\nStructure: {struct_note}".strip()

    legacy = {
        "repo_name": report_v2["repo_name"],
        "submission_metadata": meta_out,
        "agents_detected": count_agent_instances(s),
        "uagents_usage": u_ok,
        "chat_protocol": {
            "implemented": chat_ok,
            "details": judge.chat_protocol_details or chat_protocol_score(s)[1],
        },
        "asi1_llm_integration": {
            "implemented": llm_ok,
            "details": judge.asi_llm_details or llm_integration_score(s)[1],
        },
        "payment_protocol": {
            "implemented": pay_ok,
            "details": judge.payment_details or payment_score(s)[1],
        },
        "tech_stack": s.tech_stack,
        "quality_score": top_score,
        "issues": report_v2["issues"],
        "problem_solved": judge.problem_solved,
        "solution_overview": judge.solution_overview,
        "summary": judge.summary,
        "notes": report_v2["notes"],
        "classification": judge.classification,
        "protocol_validation": report_v2["protocol_validation"],
        "scores": report_v2["scores"],
        "benchmark": report_v2["benchmark"],
    }

    report = {"report_v2": report_v2, "report_legacy": legacy, **legacy}
    return {"report": report}


NODE_INGESTION = "repo_ingestion"
NODE_ANALYSIS = "code_analysis"
NODE_PROTOCOL = "protocol_validation"
NODE_FEATURES = "feature_detection"
NODE_KNOWLEDGE = "knowledge_grounding"
NODE_BENCHMARK = "benchmark_compare"
NODE_EVAL = "evaluation"
NODE_REPORT = "report_generator"
