"""Deep code analysis agent (AST + heuristics)."""

from __future__ import annotations

import ast
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from hackathon_eval.protocol_validation import validate_protocols

_SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
]
_INJECTION_HINTS = [
    "subprocess.Popen(",
    "subprocess.call(",
    "subprocess.run(",
    "os.system(",
    "eval(",
    "exec(",
]


def _iter_repo_files(work_dir: str | None) -> list[Path]:
    if not work_dir:
        return []
    root = Path(work_dir)
    if not root.exists():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


def _cyclomatic_complexity(fn: ast.AST) -> int:
    score = 1
    for node in ast.walk(fn):
        if isinstance(
            node,
            (
                ast.If,
                ast.For,
                ast.While,
                ast.IfExp,
                ast.ExceptHandler,
                ast.With,
                ast.Assert,
                ast.Try,
                ast.BoolOp,
                ast.comprehension,
            ),
        ):
            score += 1
    return score


def _analyze_python_file(path: Path) -> dict[str, Any]:
    out: dict[str, Any] = {
        "file": str(path),
        "imports": [],
        "functions": [],
        "classes": 0,
        "typed_functions": 0,
        "total_functions": 0,
        "dead_code_candidates": [],
        "issues": [],
    }
    try:
        source = path.read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(source)
    except Exception as exc:
        out["issues"].append(f"AST parse failed: {exc}")
        return out

    imported_names: list[str] = []
    assigned_names: set[str] = set()
    used_names: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                imported_names.append(name)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                name = alias.asname or alias.name
                imported_names.append(name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out["total_functions"] += 1
            complexity = _cyclomatic_complexity(node)
            has_return_type = node.returns is not None
            has_typed_args = all(arg.annotation is not None for arg in node.args.args)
            if has_return_type and has_typed_args:
                out["typed_functions"] += 1
            out["functions"].append(
                {
                    "name": node.name,
                    "line": node.lineno,
                    "complexity": complexity,
                    "typed": bool(has_return_type and has_typed_args),
                }
            )
        elif isinstance(node, ast.ClassDef):
            out["classes"] += 1
        elif isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Store):
                assigned_names.add(node.id)
            elif isinstance(node.ctx, ast.Load):
                used_names.add(node.id)

    out["imports"] = imported_names
    for name in sorted(assigned_names - used_names):
        if not name.startswith("_"):
            out["dead_code_candidates"].append(name)
    out["unused_imports"] = sorted(name for name in imported_names if name not in used_names)
    return out


def run_deep_code_analysis(state: dict[str, Any]) -> dict[str, Any]:
    """Return deep analysis block to merge into EvalState."""
    files = _iter_repo_files(state.get("work_dir"))
    py_files = [p for p in files if p.suffix == ".py"]
    text_files = [p for p in files if p.suffix.lower() in {".md", ".txt", ".rst"}]
    import_graph: dict[str, set[str]] = defaultdict(set)
    py_analyses: list[dict[str, Any]] = []
    security_issues: list[dict[str, Any]] = []
    tests_detected = 0
    readme_quality = {"score": 0, "notes": []}

    for p in py_files[:500]:
        file_report = _analyze_python_file(p)
        py_analyses.append(file_report)
        rel = str(p)
        for name in file_report.get("imports", []):
            import_graph[rel].add(name)
        if "test" in p.name.lower() or "tests" in str(p.parent).lower():
            tests_detected += 1
        try:
            raw = p.read_text(encoding="utf-8", errors="replace")
            for pattern in _SECRET_PATTERNS:
                for m in pattern.finditer(raw):
                    security_issues.append(
                        {
                            "type": "hardcoded_secret",
                            "file": rel,
                            "line_estimate": raw[: m.start()].count("\n") + 1,
                            "snippet": m.group(0)[:120],
                        }
                    )
            for hint in _INJECTION_HINTS:
                if hint in raw:
                    security_issues.append({"type": "injection_risk", "file": rel, "pattern": hint})
        except OSError:
            continue

    readmes = [p for p in text_files if p.name.lower().startswith("readme")]
    if readmes:
        try:
            readme_body = readmes[0].read_text(encoding="utf-8", errors="replace")
            headings = re.findall(r"(?m)^##\s+.+$", readme_body)
            badges = re.findall(r"!\[[^\]]*\]\([^)]+\)", readme_body)
            examples = "```" in readme_body
            score = 2 + min(4, len(headings)) + min(2, len(badges)) + (2 if examples else 0)
            readme_quality = {
                "score": min(10, score),
                "notes": [
                    f"headings={len(headings)}",
                    f"badges={len(badges)}",
                    f"examples={'yes' if examples else 'no'}",
                ],
            }
        except OSError:
            pass

    function_count = sum(int(r.get("total_functions", 0)) for r in py_analyses)
    typed_count = sum(int(r.get("typed_functions", 0)) for r in py_analyses)
    type_coverage = round((typed_count / function_count) * 100, 1) if function_count else 0.0
    complexities = [f["complexity"] for r in py_analyses for f in r.get("functions", [])]
    avg_complexity = round(sum(complexities) / len(complexities), 2) if complexities else 0.0
    complexity_score = max(0, min(10, int(10 - math.ceil(max(0.0, avg_complexity - 2)))))

    import_frequency = Counter(name for r in py_analyses for name in r.get("imports", []))
    protocol_validation = validate_protocols(state.get("combined_source_excerpt") or "")

    strengths: list[dict[str, Any]] = []
    weaknesses: list[dict[str, Any]] = []
    proto = {
        "uagents": protocol_validation.get("chat") != "missing",
        "chat_protocol": protocol_validation.get("chat") == "valid",
        "payment_protocol": protocol_validation.get("payment") == "valid",
        "asi1_llm": bool(state.get("scan", {}).get("has_asi1")),
    }
    if proto["uagents"]:
        strengths.append({"title": "uAgents framework detected", "evidence": "uagents imports and/or agent patterns found"})
    else:
        weaknesses.append({"title": "uAgents framework not detected", "severity": "high"})
    if proto["chat_protocol"]:
        strengths.append({"title": "Chat protocol appears implemented", "evidence": "protocol validation returned valid"})
    else:
        weaknesses.append({"title": "Chat protocol missing/invalid", "severity": "high"})
    if proto["payment_protocol"]:
        strengths.append({"title": "Payment protocol appears implemented", "evidence": "payment validators found complete flow markers"})
    else:
        weaknesses.append({"title": "Payment protocol missing/invalid", "severity": "high"})
    if proto["asi1_llm"]:
        strengths.append({"title": "LLM/ASI integration signal present", "evidence": "scanner detected asi/openai markers"})
    else:
        weaknesses.append({"title": "No clear ASI/LLM integration signal", "severity": "medium"})
    if security_issues:
        weaknesses.append({"title": f"{len(security_issues)} security issue(s) detected", "severity": "critical"})
    if complexity_score >= 7:
        strengths.append({"title": "Code complexity in healthy range", "evidence": f"complexity_score={complexity_score}"})
    else:
        weaknesses.append({"title": f"Complexity appears elevated (score={complexity_score})", "severity": "medium"})

    return {
        "deep_analysis": {
            "summary": {
                "python_files_scanned": len(py_files),
                "tests_detected": tests_detected,
                "security_issue_count": len(security_issues),
                "dead_code_candidates": sum(len(r.get("dead_code_candidates", [])) for r in py_analyses),
            },
            "import_graph": {k: sorted(v) for k, v in import_graph.items()},
            "top_imports": [name for name, _n in import_frequency.most_common(20)],
            "circular_imports": [],  # Placeholder: true graph cycle detection can be added safely later.
            "complexity": {
                "avg_cyclomatic_complexity": avg_complexity,
                "complexity_score": complexity_score,
            },
            "security": security_issues,
            "type_annotations": {
                "typed_functions": typed_count,
                "total_functions": function_count,
                "coverage_percent": type_coverage,
            },
            "test_coverage_signal": {"test_files": tests_detected, "coverage_known": False},
            "readme_quality": readme_quality,
            "protocol_compliance_ast": proto,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "file_reports": py_analyses[:120],
        }
    }

