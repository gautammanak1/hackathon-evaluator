"""LangGraph nodes: ingestion, analysis, features, knowledge, benchmark, evaluation, report."""

from __future__ import annotations

import json
import os
from dataclasses import fields
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from hackathon_eval.agents import (
    build_doc_links,
    generate_repo_diagrams,
    generate_suggestions,
    generate_suggestions_llm,
    maybe_create_github_issue,
    run_deep_code_analysis,
)
from hackathon_eval.benchmarks import compare_to_benchmark
from hackathon_eval.config import OPENAI_MODEL
from hackathon_eval.judge_output import AxisScores, JudgeLLMOutput
from ai.prompts.assembly import get_evaluation_system_prompt
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

_MAX_SYS_PROMPT_CHARS = int(os.getenv("MAX_SYS_PROMPT_CHARS", "28000"))


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
    bool_protocols = (
        f"uAgents={'detected' if flags.get('uagents') else 'absent'}, "
        f"chat-protocol={'valid' if chat_ok else 'missing/invalid'}, "
        f"payment-protocol={'valid' if pay_ok else 'missing/invalid'}, "
        f"LLM-integration={'detected' if flags.get('llm') else 'absent'}"
    )
    issue_preview = "; ".join(issues[:5]) if issues else "no major heuristic issues"
    summ = (
        "**Problem this project solves**\n"
        "Heuristic mode could not infer the user-facing problem from static signals alone. "
        "Provide a model API key (FetchDocsAssistant uses the OpenAI Agents SDK + the prebuilt "
        "Fetch.ai docs vector store) so the judge can read the README and agent docstrings.\n\n"
        "**The idea & approach**\n"
        f"From static markers the repo intends to integrate with Fetch.ai: {bool_protocols}. "
        "Without an LLM the judge can only enumerate which primitives are present; the conceptual "
        "design walkthrough is best-effort and may be incomplete.\n\n"
        "**How it is built**\n"
        f"Deterministic axes settled at architecture {arch}, protocols {prot}, ai_usage {ai_u}, "
        f"code_quality {code_q}, innovation {innov} (each 0–10). "
        f"Code-quality structure points: {struct_pts}/3. "
        f"Benchmark grounding: {br}. The LLM provider is expected to be ASI:One via "
        "`https://api.asi1.ai/v1` — any plain OpenAI client found in the code is itself a defect.\n\n"
        "**Notable strengths (with code evidence)**\n"
        "Heuristic mode does not surface code-evidenced strengths. Re-run the evaluator with the "
        "FetchDocsAssistant agent enabled (set OPENAI_API_KEY) to see file-grounded strengths.\n\n"
        "**Critical risks & next-step recommendation**\n"
        f"Top reviewer issues seen heuristically: {issue_preview}. "
        "Next step: enable the LLM path so the auto-fixer can patch missing ChatProtocol scaffolds "
        "and migrate any plain OpenAI calls to ASI:One automatically."
    )
    notes_txt = (
        "; ".join(issues) if issues else "No major heuristic issues."
    )
    return JudgeLLMOutput(
        classification=cls,
        problem_solved=(
            "Heuristic mode could not infer the user-facing problem from static signals alone. "
            "Provide an LLM key so the judge can read the README and agent docstrings directly."
        ),
        solution_overview=(
            "Heuristic mode only enumerates protocol markers. With an LLM key the judge would walk "
            "through entry points, handler chains, and LLM call sites to describe the solution end-to-end."
        ),
        scores=axes,
        benchmark_reason=br,
        summary=summ,
        notes=notes_txt,
        chat_protocol_details=c[1],
        asi_llm_details=l[1],
        payment_details=p[1],
    )


def node_repo_ingestion(state: EvalState) -> dict[str, Any]:
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


def node_deep_code_analysis(state: EvalState) -> dict[str, Any]:
    return run_deep_code_analysis(state)


def node_doc_linker(state: EvalState) -> dict[str, Any]:
    issues = state.get("issues") or []
    if not issues:
        issues = ((state.get("analysis") or {}).get("issues") or []) if isinstance(state.get("analysis"), dict) else []
    if not issues:
        deep = state.get("deep_analysis") or {}
        sec = deep.get("security") if isinstance(deep, dict) else []
        if sec:
            issues.append("Critical: hardcoded secrets or injection patterns detected")
        proto = (deep.get("protocol_compliance_ast") or {}) if isinstance(deep, dict) else {}
        if isinstance(proto, dict):
            if not proto.get("chat_protocol", True):
                issues.append("Chat protocol invalid or incomplete")
            if not proto.get("payment_protocol", True):
                issues.append("Payment protocol invalid or incomplete")
            if not proto.get("uagents", True):
                issues.append("uAgents implementation missing")
    return {"doc_links": build_doc_links(issues, state.get("deep_analysis"))}


def node_suggestion_generator(state: EvalState) -> dict[str, Any]:
    issues = ((state.get("analysis") or {}).get("issues") or []) if isinstance(state.get("analysis"), dict) else []
    deep = state.get("deep_analysis") or {}
    if isinstance(deep, dict):
        for w in (deep.get("weaknesses") or []):
            if isinstance(w, dict) and w.get("title"):
                issues.append(f"{w.get('title')} [severity: {w.get('severity','medium')}]")
    if not issues:
        if isinstance(deep, dict) and deep.get("security"):
            issues.append("Critical security issues detected in source code")
    max_suggestions = int(os.getenv("MAX_SUGGESTIONS", "15"))
    doc_links = state.get("doc_links") or []

    llm_suggestions = generate_suggestions_llm(
        issues=issues,
        doc_links=doc_links,
        deep_analysis=state.get("deep_analysis"),
        knowledge_context=state.get("knowledge_context", "") or "",
        code_semantic_sketch=state.get("code_semantic_sketch", "") or "",
        code_excerpt=state.get("combined_source_excerpt", "") or "",
        repo_name=state.get("repo_name", "") or "",
        max_suggestions=max_suggestions,
    )

    if llm_suggestions:
        return {"suggestions": llm_suggestions}

    return {
        "suggestions": generate_suggestions(
            issues=issues,
            doc_links=doc_links,
            deep_analysis=state.get("deep_analysis"),
            max_suggestions=max_suggestions,
        )
    }


def node_diagram_generator(state: EvalState) -> dict[str, Any]:
    analysis = state.get("analysis") or {}
    flags = analysis.get("flags") if isinstance(analysis, dict) else None
    if not isinstance(flags, dict):
        flags = {}
    diagrams = generate_repo_diagrams(
        repo_name=state.get("repo_name", "") or "",
        flags=flags,
        file_paths=state.get("file_paths") or [],
        code_excerpt=state.get("combined_source_excerpt", "") or "",
        code_semantic_sketch=state.get("code_semantic_sketch", "") or "",
        deep_analysis=state.get("deep_analysis"),
    )
    return {"diagrams": diagrams}


def node_github_issue_reporter(state: EvalState) -> dict[str, Any]:
    # If the key is present (e.g. MCP sets ``create_github_issue: False``), honour it and do
    # **not** upgrade via ``GITHUB_AUTO_ISSUE``. If the key is absent, keep legacy behaviour:
    # server-wide auto-issue when ``GITHUB_AUTO_ISSUE`` is truthy (HTTP /evaluate default).
    if "create_github_issue" in state:
        create_issue = bool(state["create_github_issue"])
    else:
        create_issue = os.getenv("GITHUB_AUTO_ISSUE", "false").lower() in {"1", "true", "yes"}

    if not create_issue:
        return {"github_issue": {"created": False, "issue_url": None, "reason": "disabled"}}
    report_payload = state.get("report") if isinstance(state.get("report"), dict) else {}
    if not report_payload:
        # Fallback snapshot if report wasn't materialized for any reason.
        report_payload = {
            "repo_name": state.get("repo_name") or "",
            "issues": ((state.get("analysis") or {}).get("issues") or []) if isinstance(state.get("analysis"), dict) else [],
            "report_v2": {
                "repo_name": state.get("repo_name") or "",
                "classification": ((state.get("analysis") or {}).get("reflection") or {}).get("classification", "unknown")
                if isinstance(state.get("analysis"), dict)
                else "unknown",
                "score": ((state.get("analysis") or {}).get("heuristic_score"))
                if isinstance(state.get("analysis"), dict)
                else None,
                "features": {
                    "uagents": bool((state.get("features") or {}).get("uagents_usage")) if isinstance(state.get("features"), dict) else False,
                    "chat_protocol": bool(((state.get("features") or {}).get("chat_protocol") or {}).get("implemented"))
                    if isinstance(state.get("features"), dict)
                    else False,
                    "payment_protocol": bool(((state.get("features") or {}).get("payment_protocol") or {}).get("implemented"))
                    if isinstance(state.get("features"), dict)
                    else False,
                    "llm_integration": bool(((state.get("features") or {}).get("asi1_llm") or {}).get("implemented"))
                    if isinstance(state.get("features"), dict)
                    else False,
                },
            },
        }
    report_payload = {
        **report_payload,
        "doc_links": state.get("doc_links") or report_payload.get("doc_links") or [],
        "suggestions": state.get("suggestions") or report_payload.get("suggestions") or [],
    }

    try:
        result = maybe_create_github_issue(
            report=report_payload,
            repo_url=(state.get("repo_url") or ""),
            create_issue=create_issue,
            request_token=state.get("github_token"),
        )
    except Exception as exc:
        result = {"created": False, "issue_url": None, "reason": str(exc)}
    patch: dict[str, Any] = {"github_issue": result}
    if isinstance(state.get("report"), dict):
        merged = dict(state["report"])
        merged["github_issue"] = result
        merged["github_issue_url"] = result.get("issue_url")
        rv2 = merged.get("report_v2")
        if isinstance(rv2, dict):
            rv2 = dict(rv2)
            rv2["github_issue"] = result
            rv2["github_issue_url"] = result.get("issue_url")
            merged["report_v2"] = rv2
        patch["report"] = merged
    return patch


def node_evaluation(state: EvalState) -> dict[str, Any]:
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
    deep = state.get("deep_analysis") if isinstance(state.get("deep_analysis"), dict) else {}
    payload = {
        "repo_name": state.get("repo_name"),
        "quality_score_heuristic": score,
        "issues": issues,
        "structure_note": struct_note,
        "flags": flags,
        "scan_signals": s.signals[:40],
        "PROTOCOL_VALIDATION": protocol_validation,
        "BENCHMARK": benchmark,
        "DEEP_STRENGTHS": deep.get("strengths", []),
        "DEEP_WEAKNESSES": deep.get("weaknesses", []),
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
        "strengths": deep.get("strengths", []),
        "weaknesses": deep.get("weaknesses", []),
    }
    return {"analysis_llm_notes": json.dumps(analysis), "analysis": analysis, "issues": issues}


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
        "review_mode": state.get("review_mode") or os.getenv("REVIEW_MODE", "strict_reviewer"),
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
        "strengths": analysis.get("strengths", []) if isinstance(analysis, dict) else [],
        "weaknesses": analysis.get("weaknesses", []) if isinstance(analysis, dict) else [],
        "deep_analysis": state.get("deep_analysis") or {},
        "suggestions": state.get("suggestions") or [],
        "diagrams": state.get("diagrams") or {},
        "doc_links": state.get("doc_links") or [],
        "github_issue_url": ((state.get("github_issue") or {}).get("issue_url")),
        "github_issue": state.get("github_issue") or {},
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
        "strengths": report_v2["strengths"],
        "weaknesses": report_v2["weaknesses"],
        "github_issue_url": report_v2["github_issue_url"],
        "github_issue": report_v2["github_issue"],
        "diagrams": report_v2["diagrams"],
    }

    report = {"report_v2": report_v2, "report_legacy": legacy, **legacy}
    return {"report": report}


NODE_INGESTION = "repo_ingestion"
NODE_ANALYSIS = "code_analysis"
NODE_PROTOCOL = "protocol_validation"
NODE_FEATURES = "feature_detection"
NODE_KNOWLEDGE = "knowledge_grounding"
NODE_BENCHMARK = "benchmark_compare"
NODE_DEEP_CODE = "deep_code_analysis"
NODE_GITHUB_ISSUES = "github_issue_reporter"
NODE_SUGGESTIONS = "suggestion_generator"
NODE_DIAGRAMS = "diagram_generator"
NODE_DOC_LINKER = "documentation_linker"
NODE_EVAL = "evaluation"
NODE_REPORT = "report_generator"
