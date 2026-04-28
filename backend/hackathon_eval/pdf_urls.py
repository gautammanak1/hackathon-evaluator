"""Find GitHub repository URLs inside plain text (e.g. PDF export of a spreadsheet)."""

from __future__ import annotations

import re


def _normalize_repo_url(user: str, repo: str) -> str:
    u = user.strip().strip("/")
    r = repo.strip().strip("/")
    r = r.removesuffix(".git")
    for suf in (".", ",", ";", ")", "]", "}"):
        r = r.rstrip(suf)
    if not u or not r or "." in u[:1]:
        return ""
    return f"https://github.com/{u}/{r}"


def find_github_repo_urls(text: str) -> list[str]:
    """
    Return unique repo URLs in document order.
    Matches https://github.com/owner/repo and optional trailing path segments.
    """
    if not text or not text.strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    # e.g. https://github.com/org/repo or .../org/repo/issues → still capture org/repo
    pat = re.compile(
        r"(?:https?://)?github\.com/([\w.-]+)/([\w.-]+)(?:[/#?][^\s\])>'\"]*)?",
        re.IGNORECASE,
    )
    for m in pat.finditer(text):
        canonical = _normalize_repo_url(m.group(1), m.group(2))
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        out.append(canonical)
    return out
