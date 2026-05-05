"""MCP tools for prompts + evaluation — mount SSE app behind FastAPI (see ``main.py``)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

logger = logging.getLogger(__name__)

_mcp_app: FastMCP | None = None


def _split_csv_env(name: str) -> list[str]:
    raw = os.getenv(name) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def _build_transport_security() -> TransportSecuritySettings:
    """Configure DNS-rebinding protection so MCP works behind Render / Cloudflare.

    Behind a TLS-terminating proxy, the Host header that ``mcp.server.sse``
    inspects is the public hostname (e.g. ``hackathon-evaluator-api.onrender.com``)
    while ``Origin`` is whatever client connected (browser, uagent, curl, etc.).
    The library defaults to an empty allowlist, which fails *every* request.

    Resolution order:

    1. ``MCP_ALLOW_ANY_HOST=1`` — disables protection entirely (use only when
       running behind a trusted proxy; cheapest workable default for self-hosted).
    2. ``MCP_ALLOWED_HOSTS`` / ``MCP_ALLOWED_ORIGINS`` (comma-separated) — explicit
       allowlists, in addition to whatever we derive automatically.
    3. Auto-derive from ``MCP_PUBLIC_BASE_URL`` (host + scheme://host origin),
       always plus the standard localhost dev hosts.
    """
    if os.getenv("MCP_ALLOW_ANY_HOST", "").strip().lower() in {"1", "true", "yes"}:
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)

    hosts: list[str] = []
    origins: list[str] = []

    public = (os.getenv("MCP_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if public:
        try:
            parts = urlsplit(public)
            if parts.hostname:
                host_with_port = parts.netloc  # includes :port if non-default
                hosts.extend({parts.hostname, host_with_port})
                if parts.scheme:
                    origins.append(f"{parts.scheme}://{parts.netloc}")
        except ValueError:  # pragma: no cover — malformed URL is a user error
            logger.warning("MCP_PUBLIC_BASE_URL is not a valid URL: %s", public)

    hosts.extend(["localhost", "127.0.0.1", "0.0.0.0"])
    hosts.extend(f"localhost:{port}" for port in (8000, 8001, 8010, 3000))
    hosts.extend(f"127.0.0.1:{port}" for port in (8000, 8001, 8010, 3000))
    origins.extend(
        [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:8000",
            "http://localhost:8010",
            "http://127.0.0.1",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000",
            "http://127.0.0.1:8010",
        ]
    )

    hosts.extend(_split_csv_env("MCP_ALLOWED_HOSTS"))
    origins.extend(_split_csv_env("MCP_ALLOWED_ORIGINS"))

    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=sorted({h for h in hosts if h}),
        allowed_origins=sorted({o for o in origins if o}),
    )


def _evaluation_json_for_mcp_client(
    report: dict[str, Any],
    steps: list[dict[str, Any]],
    *,
    eval_profile: str,
    issues_sample: list[str],
    issues_total_override: int | None = None,
    summary_cap: int = 8000,
) -> dict[str, Any]:
    """Rich structured payload so MCP agents can relay a complete narrative (not just score)."""
    rv2 = report.get("report_v2") if isinstance(report.get("report_v2"), dict) else {}
    bench = rv2.get("benchmark") if isinstance(rv2.get("benchmark"), dict) else {}
    pv = rv2.get("protocol_validation") if isinstance(rv2.get("protocol_validation"), dict) else {}
    feats = rv2.get("features") if isinstance(rv2.get("features"), dict) else {}
    summ = rv2.get("summary") if isinstance(rv2.get("summary"), str) else ""
    summ = summ.strip()
    strengths = rv2.get("strengths") if isinstance(rv2.get("strengths"), list) else []
    weaknesses = rv2.get("weaknesses") if isinstance(rv2.get("weaknesses"), list) else []

    def _clip_str(x: Any, cap: int = 600) -> str:
        s = x if isinstance(x, str) else str(x)
        return s if len(s) <= cap else s[: cap - 1] + "…"

    strengths_out = [_clip_str(x, 500) for x in strengths[:10]]
    weaknesses_out = [_clip_str(x, 500) for x in weaknesses[:10]]

    lines: list[str] = []
    rn = str(rv2.get("repo_name") or report.get("repo_name") or "")
    if rn:
        lines.append(f"# Evaluation: {rn}")
    lines.append(f"- **Classification:** {rv2.get('classification', 'unknown')}")
    lines.append(f"- **Score:** {rv2.get('score', '?')}/10")
    lines.append(f"- **Eval profile:** {eval_profile}")
    if summ:
        lines.append("")
        lines.append("## Detailed summary")
        lines.append(summ[:summary_cap] + ("…" if len(summ) > summary_cap else ""))
    ps = rv2.get("problem_solved")
    so = rv2.get("solution_overview")
    if isinstance(ps, str) and ps.strip():
        lines.append("")
        lines.append("## Problem addressed")
        lines.append(ps.strip()[:4000])
    if isinstance(so, str) and so.strip():
        lines.append("")
        lines.append("## Solution overview")
        lines.append(so.strip()[:4000])
    if issues_sample:
        lines.append("")
        lines.append("## Issues detected")
        for i, it in enumerate(issues_sample[:24], 1):
            lines.append(f"{i}. {_clip_str(it, 800)}")
    if strengths_out:
        lines.append("")
        lines.append("## Strengths")
        for it in strengths_out:
            lines.append(f"- {it}")
    if weaknesses_out:
        lines.append("")
        lines.append("## Risks / gaps")
        for it in weaknesses_out:
            lines.append(f"- {it}")
    if feats:
        lines.append("")
        lines.append("## Feature signals")
        lines.append(
            ", ".join(f"{k}: {v}" for k, v in feats.items() if isinstance(k, str))
        )
    lines.append("")
    lines.append(
        f"**Protocols:** chat={pv.get('chat', 'unknown')} · payment={pv.get('payment', 'unknown')}"
    )
    if bench.get("reason") or bench.get("closest_match"):
        lines.append("")
        lines.append("## Benchmark")
        if bench.get("closest_match"):
            lines.append(f"- Closest match: {bench.get('closest_match')}")
        if bench.get("reason"):
            lines.append(f"- {_clip_str(bench.get('reason'), 1200)}")

    formatted = "\n".join(lines).strip()
    step_names = [str(s.get("name") or "") for s in steps if isinstance(s, dict)][-24:]

    issues_total = issues_total_override
    if issues_total is None and isinstance(rv2.get("issues"), list):
        issues_total = len(rv2["issues"])
    if issues_total is None:
        issues_total = 0

    out: dict[str, Any] = {
        "eval_profile": eval_profile,
        "repo_name": rv2.get("repo_name") or report.get("repo_name"),
        "classification": rv2.get("classification"),
        "score": rv2.get("score"),
        "issues_total": issues_total,
        "issues_sample": issues_sample,
        "step_count": len(steps),
        "pipeline_steps": step_names,
        "summary": summ[:summary_cap] + ("…" if len(summ) > summary_cap else "") if summ else None,
        "problem_solved": rv2.get("problem_solved"),
        "solution_overview": rv2.get("solution_overview"),
        "notes": rv2.get("notes"),
        "features": feats,
        "protocol_validation": {
            "chat": pv.get("chat"),
            "payment": pv.get("payment"),
        },
        "benchmark": {
            "closest_match": bench.get("closest_match"),
            "reason": bench.get("reason"),
            "confidence": bench.get("confidence"),
        },
        "strengths": strengths_out,
        "weaknesses": weaknesses_out,
        "formatted_report_markdown": formatted,
    }
    return out


def _get_mcp() -> FastMCP:
    global _mcp_app
    if _mcp_app is None:
        _mcp_app = FastMCP(
            "hackathon-evaluator",
            instructions=(
                "Tools for Fetch.ai Hackathon Evaluator: list/read bundled prompts under "
                "backend/ai/prompts/static, fetch the assembled judge system prompt, optionally "
                "run a GitHub repo through the LangGraph evaluation pipeline."
            ),
            transport_security=_build_transport_security(),
        )

        @_mcp_app.tool()
        def list_static_prompt_files() -> str:
            """Return JSON list of ``*.md`` filenames in the bundled prompts static directory."""
            from hackathon_eval.config import PROMPTS_DIR

            static = PROMPTS_DIR / "static"
            if not static.is_dir():
                return json.dumps({"error": "static directory missing", "path": str(static)})
            names = sorted(p.name for p in static.glob("*.md"))
            return json.dumps({"prompts_root": str(PROMPTS_DIR), "files": names})

        @_mcp_app.tool()
        def read_static_prompt(filename: str) -> str:
            """Read one static prompt markdown file by basename only (e.g. ``SUGGESTION_GENERATION_PROMPT.md``)."""
            from hackathon_eval.config import PROMPTS_DIR

            safe = Path(filename).name
            if safe != filename or not re.match(r"^[A-Za-z0-9._-]+\.md$", safe):
                return json.dumps({"error": "invalid filename; use a single .md basename"})
            path = (PROMPTS_DIR / "static" / safe).resolve()
            base = (PROMPTS_DIR / "static").resolve()
            if not str(path).startswith(str(base)):
                return json.dumps({"error": "path escape rejected"})
            if not path.is_file():
                return json.dumps({"error": "not found", "filename": safe})
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                return json.dumps({"error": str(exc)})
            return json.dumps({"filename": safe, "content": text})

        @_mcp_app.tool()
        def get_assembled_evaluation_prompt(max_chars: int = 48000, refresh_cache: bool = False) -> str:
            """Return the full assembled judge system prompt (truncated to ``max_chars``)."""
            from ai.prompts.assembly import clear_prompt_cache, get_evaluation_system_prompt

            if refresh_cache:
                clear_prompt_cache()
            body = get_evaluation_system_prompt(refresh=refresh_cache)
            truncated = len(body) > max_chars
            if truncated:
                body = body[:max_chars] + "\n\n...[truncated]...\n"
            return json.dumps(
                {
                    "char_count_returned": len(body),
                    "truncated": truncated,
                    "prompt": body,
                }
            )

        @_mcp_app.tool()
        async def evaluate_github_repo(
            repo_url: str,
            branch: str | None = None,
            include_issues_sample: bool = True,
            issues_limit: int = 12,
            full_pipeline: bool = False,
        ) -> str:
            """Clone and run the evaluator graph on a GitHub HTTPS URL (no persistence). Output is compact JSON.

            By default runs the **fast** profile (skips deep code, doc linker, suggestions, diagrams).
            Set ``full_pipeline`` true for the same graph as the web ``eval_profile=full`` path.

            Does **not** create GitHub issues (``create_github_issue`` is forced off for MCP), even if
            ``GITHUB_AUTO_ISSUE`` is enabled in server env. The graph runs in a worker thread so the
            asyncio event loop (SSE MCP) stays responsive.
            """
            from hackathon_eval.graph import invoke_graph_timed
            from hackathon_eval.state import EvalState
            from hackathon_eval.tools.repo_tools import remove_path

            url = (repo_url or "").strip()
            if "github.com" not in url and not url.startswith("git@"):
                return json.dumps({"error": "repo_url must be a github.com HTTPS or SSH URL"})
            payload: EvalState = {
                "repo_url": url,
                "eval_profile": "full" if full_pipeline else "fast",
                "create_github_issue": False,
            }
            if (branch or "").strip():
                payload["branch"] = branch.strip()

            try:
                report, steps, work_dir = await asyncio.to_thread(invoke_graph_timed, payload)
            except Exception as exc:  # pragma: no cover — surfaced to MCP client
                logger.exception("MCP evaluate_github_repo failed: %s", exc)
                return json.dumps({"error": str(exc), "repo_url": url})

            if work_dir and not os.getenv("EVAL_PERSIST_CLONE"):
                await asyncio.to_thread(remove_path, Path(work_dir))

            rv2 = report.get("report_v2") if isinstance(report.get("report_v2"), dict) else {}
            issues = rv2.get("issues") if isinstance(rv2.get("issues"), list) else []
            if not issues and isinstance(report.get("analysis"), dict):
                issues = (report["analysis"] or {}).get("issues") or []
            sample = []
            if include_issues_sample and isinstance(issues, list):
                for i, it in enumerate(issues[: max(1, min(issues_limit, 40))]):
                    sample.append(it if isinstance(it, str) else str(it))

            prof = str(payload.get("eval_profile") or "fast")
            n_issues = len(issues) if isinstance(issues, list) else 0
            out = _evaluation_json_for_mcp_client(
                report,
                steps,
                eval_profile=prof,
                issues_sample=sample,
                issues_total_override=n_issues,
            )
            return json.dumps(out, ensure_ascii=False)

    return _mcp_app


def sse_starlette_mount(mount_path: str):  # type: ignore[no-untyped-def]
    """ASGI Starlette sub-app mounted at ``mount_path`` (e.g. ``/mcp``) by FastAPI.

    ``mount_path`` is only for the parent ``app.mount()``; it must **not** be passed
    into :meth:`FastMCP.sse_app`, or ``SseServerTransport`` gets ``/mcp/messages/``
    *and* ASGI ``root_path=/mcp``, producing a broken client URL ``/mcp/mcp/messages/``.
    Internal routes stay ``/sse`` + ``/messages/``; FastAPI adds the mount prefix once.
    """
    _ = mount_path  # sub-app paths are relative; prefix comes from Starlette Mount
    return _get_mcp().sse_app("/")
