"""Create opt-in GitHub issues from evaluation output."""

from __future__ import annotations

import os
import re
from typing import Any

from github import Github
from github.GithubException import GithubException

_LABELS = ["fetchai-eval", "code-review", "auto"]
_SEVERITY_LABEL = {
    "critical": "severity:critical",
    "high": "severity:high",
    "medium": "severity:medium",
    "low": "severity:low",
}


def _repo_from_url(repo_url: str) -> str | None:
    m = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+)", repo_url)
    if not m:
        return None
    return f"{m.group('owner')}/{m.group('repo')}"


_DOC_DEFAULTS = [
    "https://innovationlab.fetch.ai/resources/docs/agent-creation/uagent-creation",
    "https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol",
    "https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-getting-started",
]


def _severity_rank(s: str) -> int:
    return {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(str(s or "").lower(), 4)


def _render_issue_body(report: dict[str, Any]) -> str:
    rv2 = report.get("report_v2") if isinstance(report.get("report_v2"), dict) else {}
    score = report.get("quality_score") or rv2.get("score", "n/a")
    cls = report.get("classification") or rv2.get("classification", "unknown")
    issues = report.get("issues") or rv2.get("issues") or []
    doc_links = report.get("doc_links") or []
    suggestions = sorted(
        [s for s in (report.get("suggestions") or []) if isinstance(s, dict)],
        key=lambda s: _severity_rank(s.get("severity", "")),
    )
    features = rv2.get("features", {})
    repo_name = report.get("repo_name") or rv2.get("repo_name") or "unknown"
    strengths = report.get("strengths") or rv2.get("strengths") or []
    weaknesses = report.get("weaknesses") or rv2.get("weaknesses") or []
    summary = report.get("summary") or rv2.get("summary") or ""

    lines: list[str] = [
        f"# Fetch.ai Evaluator · Deep code review — Score {score}/10 · {cls}",
        "",
        f"_Generated automatically by the Fetch.ai Evaluator for `{repo_name}`._",
        "",
    ]

    if summary:
        lines.extend(["## Summary", summary, ""])

    lines.append("## Protocol compliance")
    lines.extend(
        [
            f"- uAgents: {'✅' if features.get('uagents') else '❌'}",
            f"- Chat Protocol: {'✅' if features.get('chat_protocol') else '❌'}",
            f"- Payment Protocol: {'✅' if features.get('payment_protocol') else '❌'}",
            f"- ASI:1 LLM: {'✅' if features.get('llm_integration') else '❌'}",
            "",
        ]
    )

    if strengths:
        lines.extend(["## Evidence-backed strengths"])
        for s in strengths[:5]:
            if isinstance(s, dict):
                title = s.get("title") or "Strength"
                evidence = s.get("evidence") or "evidence missing"
                lines.append(f"- **{title}** — {evidence}")
        lines.append("")

    if issues or weaknesses:
        lines.append("## Reviewer findings")
        for x in issues[:15]:
            lines.append(f"- {x}")
        for w in weaknesses[:10]:
            if isinstance(w, dict):
                lines.append(f"- {w.get('title')} _(severity: {w.get('severity', 'unknown')})_")
        lines.append("")

    if suggestions:
        lines.append("## Remediation checklist")
        for s in suggestions[:15]:
            sev = str(s.get("severity", "low")).upper()
            title = s.get("title") or "Fix"
            file_hint = s.get("file_hint") or "n/a"
            line_range = s.get("lines") or s.get("line_range") or ""
            loc = f"{file_hint}:{line_range}" if line_range else file_hint
            lines.append(f"- [ ] **[{sev}]** {title} — `{loc}`")
        lines.append("")

        lines.append("## Fix snippets")
        for s in suggestions[:6]:
            sev = str(s.get("severity", "low")).upper()
            title = s.get("title") or "Fix"
            file_hint = s.get("file_hint") or "n/a"
            line_range = s.get("lines") or s.get("line_range") or ""
            loc = f"{file_hint}:{line_range}" if line_range else file_hint
            why = s.get("why_this_fix") or s.get("description") or ""
            doc_url = s.get("doc_url")
            before = s.get("before_code") or s.get("broken_pattern") or ""
            after = s.get("after_code") or s.get("fixed_code") or ""
            risk = s.get("risk")

            lines.extend([f"### [{sev}] {title}", f"_File:_ `{loc}`", ""])
            if why:
                lines.extend(["**Why this matters:**", why, ""])
            if before:
                lines.extend(["**Before:**", "```python", str(before), "```", ""])
            if after:
                lines.extend(["**After:**", "```python", str(after), "```", ""])
            if risk and str(risk).lower() != "none":
                lines.extend([f"**Risk / migration:** {risk}", ""])
            steps = s.get("implementation_steps") or []
            if steps:
                lines.append("**Implementation steps:**")
                for st in steps[:6]:
                    lines.append(f"1. {st}")
                lines.append("")
            tests = s.get("tests_to_add") or []
            if tests:
                lines.append("**Tests to add:**")
                for t in tests[:5]:
                    lines.append(f"- `{t}`")
                lines.append("")
            if doc_url:
                lines.extend([f"**Docs:** {doc_url}", ""])

    if doc_links:
        lines.append("## Fetch.ai documentation references")
        for d in doc_links[:12]:
            if isinstance(d, dict) and d.get("doc_url"):
                label = d.get("issue_type") or d.get("title") or d.get("doc_url")
                lines.append(f"- [{label}]({d['doc_url']})")
        lines.append("")

    lines.append("## Build production-grade Fetch.ai agents")
    for u in _DOC_DEFAULTS:
        lines.append(f"- {u}")
    lines.extend(["", "---", "_Posted by the Fetch.ai Evaluator. Reply with 'recheck' after applying fixes to re-run analysis._"])
    return "\n".join(lines)


def _labels_for_report(report: dict[str, Any]) -> list[str]:
    suggestions = [s for s in (report.get("suggestions") or []) if isinstance(s, dict)]
    severities = {str(s.get("severity", "")).lower() for s in suggestions}
    out = list(_LABELS)
    for sev in ("critical", "high", "medium", "low"):
        if sev in severities and _SEVERITY_LABEL[sev] not in out:
            out.append(_SEVERITY_LABEL[sev])
    return out


def maybe_create_github_issue(
    *,
    report: dict[str, Any],
    repo_url: str,
    create_issue: bool,
    request_token: str | None = None,
    pr_number: int | None = None,
) -> dict[str, Any]:
    """Open a GitHub issue using the user's OAuth token.

    Auth strategy is intentionally simple — no GitHub App. NextAuth's GitHub
    provider grants the user a `repo` scoped OAuth token on sign-in, and the
    Next.js `/api/evaluate` proxy forwards it as ``request_token``. The user
    therefore opens the issue against their own repo on their own behalf, with
    no extra installation step required.

    A server-side ``GITHUB_TOKEN`` PAT is kept only as an emergency fallback
    for admin-initiated runs where no end-user OAuth token is available.
    """
    if not create_issue:
        return {"created": False, "issue_url": None, "reason": "disabled"}
    slug = _repo_from_url(repo_url)
    if not slug:
        return {"created": False, "issue_url": None, "reason": "invalid_repo_url"}

    rv2 = report.get("report_v2") if isinstance(report.get("report_v2"), dict) else {}
    score = report.get("quality_score") or rv2.get("score", "n/a")
    cls = report.get("classification") or rv2.get("classification") or "review"
    title = f"[Fetch.ai Evaluator] Deep code review — score {score}/10 ({cls})"
    body = _render_issue_body(report)
    labels = _labels_for_report(report)
    request_pat = (request_token or "").strip()
    env_pat = os.getenv("GITHUB_TOKEN", "").strip()

    def _create_with_token(token: str) -> tuple[str, bool]:
        gh = Github(token)
        repo = gh.get_repo(slug)
        try:
            issue_local = repo.create_issue(title=title, body=body, labels=labels)
            used_labels_local = True
        except GithubException as exc_local:
            if exc_local.status in {403, 422}:
                issue_local = repo.create_issue(title=title, body=body)
                used_labels_local = False
            else:
                raise
        if pr_number is not None:
            repo.get_pull(int(pr_number)).create_issue_comment(
                f"Automated analysis report created: {issue_local.html_url}"
            )
        return issue_local.html_url, used_labels_local

    user_pat_error: str | None = None
    if request_pat:
        try:
            issue_url, labels_applied = _create_with_token(request_pat)
            return {
                "created": True,
                "issue_url": issue_url,
                "labels_applied": labels_applied,
                "auth_mode": "user_oauth",
            }
        except Exception as exc:
            user_pat_error = str(exc)

    if env_pat:
        try:
            issue_url, labels_applied = _create_with_token(env_pat)
            return {
                "created": True,
                "issue_url": issue_url,
                "labels_applied": labels_applied,
                "auth_mode": "env_pat",
            }
        except Exception as exc:
            return {
                "created": False,
                "issue_url": None,
                "reason": f"env_pat_failed:{exc}",
                "user_oauth_error": user_pat_error,
            }

    return {
        "created": False,
        "issue_url": None,
        "reason": "missing_user_oauth_token",
        "user_oauth_error": user_pat_error,
    }

