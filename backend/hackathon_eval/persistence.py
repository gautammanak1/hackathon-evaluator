"""Persistence layer.

Primary store: **Supabase** (Postgres) via the service-role key. When Supabase
env vars are missing (dev), persistence falls back to a process-local
in-memory dict so the API still boots and test runs work offline.

The public API (``save_evaluation`` / ``load_evaluation`` / ``list_evaluations`` /
``delete_evaluation`` / ``load_suggestions`` / ``set_github_issue_url``) is the
same shape that the rest of the codebase expects.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

from .supabase_client import get_supabase

_LOG = logging.getLogger(__name__)

_TABLE = "evaluations"
_USERS_TABLE = "users"

# Lenient enough to pull owner/repo out of any github.com URL — including ones
# with `/tree/main`, `/issues/...`, or `.git` suffixes.
_GITHUB_RE = re.compile(
    r"github\.com[:/](?P<owner>[^/\s]+)/(?P<repo>[^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# In-memory fallback (when Supabase isn't configured)
# ---------------------------------------------------------------------------


class _Memory:
    def __init__(self) -> None:
        self._rows: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def insert(self, row: dict[str, Any]) -> None:
        with self._lock:
            self._rows[row["id"]] = row

    def get(self, eid: str) -> dict[str, Any] | None:
        return self._rows.get(eid)

    def update(self, eid: str, **fields: Any) -> bool:
        with self._lock:
            row = self._rows.get(eid)
            if not row:
                return False
            row.update(fields)
            return True

    def delete(self, eid: str) -> bool:
        with self._lock:
            return self._rows.pop(eid, None) is not None

    def list(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        rows = sorted(self._rows.values(), key=lambda r: r.get("created_at") or "", reverse=True)
        return rows[offset : offset + limit]

    def all(self) -> list[dict[str, Any]]:
        return list(self._rows.values())


_MEM = _Memory()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _split_repo(payload: dict[str, Any]) -> tuple[str, str]:
    """Extract owner/repo from anywhere we can find it in the payload.

    Different code paths populate the payload with different keys
    (``repo_url`` / ``source_url`` / ``submission_metadata.owner+repo`` /
    ``report_v2.repo_url`` / ``report_v2.repo_name``), so try them all in
    order and stop at the first one that yields a valid owner+repo pair.
    """
    rv2 = payload.get("report_v2") if isinstance(payload.get("report_v2"), dict) else {}
    meta = (
        payload.get("submission_metadata")
        if isinstance(payload.get("submission_metadata"), dict)
        else {}
    )

    candidate_urls = [
        (payload.get("repo_url") or "").strip(),
        (payload.get("source_url") or "").strip(),
        str(rv2.get("repo_url") or "").strip(),
        str(rv2.get("source_url") or "").strip(),
    ]
    for url in candidate_urls:
        if not url:
            continue
        m = _GITHUB_RE.search(url)
        if m:
            return m.group("owner"), m.group("repo")

    # submission_metadata commonly has explicit owner / repo fields.
    if isinstance(meta, dict):
        owner = str(meta.get("owner") or "").strip()
        repo = str(meta.get("repo") or "").strip()
        if owner and repo:
            return owner, repo

    # Fall back to "owner/repo" found in repo_name (top-level or rv2).
    for source in (payload, rv2):
        repo_name = str(source.get("repo_name") or "").strip()
        if "/" in repo_name:
            o, _, r = repo_name.partition("/")
            o, r = o.strip(), r.strip()
            if o and r:
                return o, r

    return "", ""


def _score_of(payload: dict[str, Any]) -> float | None:
    rv2 = payload.get("report_v2") if isinstance(payload.get("report_v2"), dict) else {}
    s = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    fin = s.get("final_score") if isinstance(s, dict) else None
    if isinstance(fin, (int, float)):
        return float(fin)
    if isinstance(rv2.get("score"), (int, float)):
        return float(rv2["score"])
    if isinstance(payload.get("quality_score"), (int, float)):
        return float(payload["quality_score"])
    return None


def _classification_of(payload: dict[str, Any]) -> str | None:
    s = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    rv2 = payload.get("report_v2") if isinstance(payload.get("report_v2"), dict) else {}
    return (
        (s.get("classification") if isinstance(s, dict) else None)
        or payload.get("classification")
        or rv2.get("classification")
        or None
    )


def _resolve_user_id(github_login: str | None) -> str | None:
    if not github_login:
        return None
    sb = get_supabase()
    if sb is None:
        return None
    try:
        res = sb.table(_USERS_TABLE).select("id").ilike("github_login", github_login).limit(1).execute()
        rows = getattr(res, "data", None) or []
        if rows:
            return str(rows[0].get("id"))
    except Exception:  # pragma: no cover - DB hiccups shouldn't break evaluate
        return None
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def init_db() -> None:
    """No-op kept for backwards compatibility (Supabase is provisioned via SQL)."""
    return None


def save_evaluation(
    payload: dict[str, Any],
    *,
    status: str = "complete",
    error: str | None = None,
) -> str:
    """Persist evaluation payload. Returns submission UUID (also written into ``payload``)."""
    eid = str(uuid.uuid4())
    merged = dict(payload)
    merged["submission_id"] = eid

    repo_owner, repo_name = _split_repo(merged)
    score = _score_of(merged)
    classification = _classification_of(merged)
    suggestions = merged.get("suggestions") or merged.get("report_v2", {}).get("suggestions") or []
    doc_links = merged.get("doc_links") or merged.get("report_v2", {}).get("doc_links") or []
    deep_analysis = merged.get("deep_analysis") or merged.get("report_v2", {}).get("deep_analysis") or {}
    github_issue_url = merged.get("github_issue_url") or merged.get("report_v2", {}).get("github_issue_url")

    meta = merged.get("submission_metadata") if isinstance(merged.get("submission_metadata"), dict) else {}
    github_login = None
    if isinstance(meta, dict):
        github_login = meta.get("github_login") or meta.get("user_github_login")
    user_id = _resolve_user_id(github_login)

    rv2_payload = merged.get("report_v2") if isinstance(merged.get("report_v2"), dict) else {}
    resolved_repo_url = (
        merged.get("repo_url")
        or merged.get("source_url")
        or rv2_payload.get("repo_url")
        or rv2_payload.get("source_url")
        or (
            f"https://github.com/{repo_owner}/{repo_name}"
            if repo_owner and repo_name
            else ""
        )
    )

    row = {
        "id": eid,
        "user_id": user_id,
        "repo_url": resolved_repo_url,
        "repo_owner": repo_owner,
        "repo_name": repo_name,
        "branch": merged.get("branch"),
        "score": score,
        "classification": classification,
        "status": status,
        "payload": merged,
        "suggestions": suggestions,
        "doc_links": doc_links,
        "deep_analysis": deep_analysis,
        "github_issue_url": github_issue_url,
        "error": error,
        "created_at": _now_iso(),
    }

    sb = get_supabase()
    if sb is None:
        _MEM.insert(row)
        return eid

    try:
        sb.table(_TABLE).insert(row).execute()
    except Exception as exc:  # pragma: no cover - keep API responsive on DB errors
        _LOG.warning("supabase insert failed: %s", exc)
        _MEM.insert(row)
    return eid


def _row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    payload["_persist"] = {
        "id": row.get("id"),
        "created_at": row.get("created_at"),
        "status": row.get("status"),
        "error": row.get("error"),
    }
    payload["submission_id"] = row.get("id") or payload.get("submission_id")
    payload["suggestions"] = row.get("suggestions") or payload.get("suggestions") or []
    payload["doc_links"] = row.get("doc_links") or payload.get("doc_links") or []
    payload["deep_analysis"] = row.get("deep_analysis") or payload.get("deep_analysis") or {}
    payload["github_issue_url"] = row.get("github_issue_url") or payload.get("github_issue_url")
    return payload


def load_evaluation(eid: str) -> dict[str, Any] | None:
    sb = get_supabase()
    if sb is None:
        row = _MEM.get(eid.strip())
        return _row_to_payload(row) if row else None
    try:
        res = sb.table(_TABLE).select("*").eq("id", eid.strip()).limit(1).execute()
    except Exception as exc:  # pragma: no cover
        _LOG.warning("supabase load failed: %s", exc)
        row = _MEM.get(eid.strip())
        return _row_to_payload(row) if row else None
    rows = getattr(res, "data", None) or []
    if not rows:
        return None
    return _row_to_payload(rows[0])


def delete_evaluation(eid: str) -> bool:
    eid = eid.strip()
    sb = get_supabase()
    if sb is None:
        return _MEM.delete(eid)
    try:
        res = sb.table(_TABLE).delete().eq("id", eid).execute()
    except Exception as exc:  # pragma: no cover
        _LOG.warning("supabase delete failed: %s", exc)
        return _MEM.delete(eid)
    rows = getattr(res, "data", None) or []
    return len(rows) > 0


def list_evaluations(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    sb = get_supabase()
    if sb is None:
        rows = _MEM.list(limit=limit, offset=offset)
        return [_summarise_row(r) for r in rows]
    try:
        res = (
            sb.table(_TABLE)
            .select("id, created_at, status, score, classification, repo_owner, repo_name, payload")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover
        _LOG.warning("supabase list failed: %s", exc)
        rows = _MEM.list(limit=limit, offset=offset)
        return [_summarise_row(r) for r in rows]
    return [_summarise_row(r) for r in (getattr(res, "data", None) or [])]


def _summarise_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    payload = payload if isinstance(payload, dict) else {}
    rv2 = payload.get("report_v2") if isinstance(payload.get("report_v2"), dict) else {}
    repo = payload.get("repo_name") or rv2.get("repo_name") or f"{row.get('repo_owner', '')}/{row.get('repo_name', '')}"
    meta = payload.get("submission_metadata") or rv2.get("submission_metadata") or {}
    team = ""
    if isinstance(meta, dict):
        team = str(meta.get("team_name") or meta.get("team") or "")
    return {
        "submission_id": row.get("id"),
        "created_at": row.get("created_at"),
        "status": row.get("status"),
        "project_name": repo,
        "team_name": team,
        "score": row.get("score"),
        "classification": row.get("classification"),
    }


def load_suggestions(eid: str, severities: set[str] | None = None) -> list[dict[str, Any]]:
    row = load_evaluation(eid)
    if not row:
        return []
    items = row.get("suggestions") if isinstance(row.get("suggestions"), list) else []
    if not severities:
        return [x for x in items if isinstance(x, dict)]
    return [x for x in items if isinstance(x, dict) and str(x.get("severity", "")).lower() in severities]


def set_github_issue_url(eid: str, issue_url: str) -> bool:
    eid = eid.strip()
    sb = get_supabase()
    if sb is None:
        return _MEM.update(eid, github_issue_url=issue_url)
    try:
        res = sb.table(_TABLE).update({"github_issue_url": issue_url}).eq("id", eid).execute()
    except Exception as exc:  # pragma: no cover
        _LOG.warning("supabase update failed: %s", exc)
        return _MEM.update(eid, github_issue_url=issue_url)
    rows = getattr(res, "data", None) or []
    return len(rows) > 0


# ---------------------------------------------------------------------------
# Admin queries (used by /admin/* FastAPI endpoints)
# ---------------------------------------------------------------------------


def _iter_all_rows() -> Iterable[dict[str, Any]]:
    sb = get_supabase()
    if sb is None:
        return _MEM.all()
    try:
        res = sb.table(_TABLE).select("*").order("created_at", desc=True).limit(2000).execute()
    except Exception:
        return _MEM.all()
    return getattr(res, "data", None) or []


def _iter_users() -> list[dict[str, Any]]:
    sb = get_supabase()
    if sb is None:
        return []
    try:
        res = sb.table(_USERS_TABLE).select("*").order("created_at", desc=True).limit(2000).execute()
    except Exception:
        return []
    return list(getattr(res, "data", None) or [])


def admin_stats() -> dict[str, Any]:
    rows = list(_iter_all_rows())
    users = _iter_users()
    issues = sum(1 for r in rows if r.get("github_issue_url"))
    scored = [float(r["score"]) for r in rows if isinstance(r.get("score"), (int, float))]
    avg = round(sum(scored) / len(scored), 2) if scored else None
    now = datetime.now(timezone.utc)
    last_24h = 0
    for r in rows:
        ts = r.get("created_at") or ""
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
        except ValueError:
            dt = None
        if dt and (now - dt).total_seconds() <= 86400:
            last_24h += 1
    return {
        "total_users": len(users),
        "total_evaluations": len(rows),
        "total_issues_created": issues,
        "average_score": avg,
        "last_24h_evaluations": last_24h,
    }


def admin_users() -> list[dict[str, Any]]:
    rows = list(_iter_all_rows())
    users = _iter_users()
    by_user_id: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        uid = r.get("user_id")
        if uid:
            by_user_id.setdefault(str(uid), []).append(r)
    out: list[dict[str, Any]] = []
    for u in users:
        uid = str(u.get("id"))
        ev = sorted(by_user_id.get(uid, []), key=lambda r: r.get("created_at") or "", reverse=True)
        scored = [float(x["score"]) for x in ev if isinstance(x.get("score"), (int, float))]
        latest = ev[0] if ev else {}
        out.append(
            {
                "id": uid,
                "github_login": u.get("github_login"),
                "email": u.get("email"),
                "name": u.get("name"),
                "avatar_url": u.get("avatar_url"),
                "created_at": u.get("created_at"),
                "last_login_at": u.get("last_login_at"),
                "evaluations_count": len(ev),
                "issues_count": sum(1 for x in ev if x.get("github_issue_url")),
                "average_score": round(sum(scored) / len(scored), 2) if scored else None,
                "latest_evaluation_id": latest.get("id"),
                "latest_repo": (
                    f"{latest.get('repo_owner')}/{latest.get('repo_name')}"
                    if latest.get("repo_owner") and latest.get("repo_name")
                    else None
                ),
            }
        )
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


def admin_repos() -> list[dict[str, Any]]:
    rows = list(_iter_all_rows())
    users = {str(u.get("id")): u for u in _iter_users()}
    by_repo: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        owner = (r.get("repo_owner") or "").strip()
        name = (r.get("repo_name") or "").strip()
        if not owner or not name:
            continue
        by_repo.setdefault(f"{owner}/{name}", []).append(r)
    out: list[dict[str, Any]] = []
    for key, items in by_repo.items():
        items.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        latest = items[0]
        owner_login = None
        uid = latest.get("user_id")
        if uid and str(uid) in users:
            owner_login = users[str(uid)].get("github_login")
        out.append(
            {
                "repo_owner": latest.get("repo_owner"),
                "repo_name": latest.get("repo_name"),
                "evaluations_count": len(items),
                "latest_score": latest.get("score"),
                "latest_classification": latest.get("classification"),
                "latest_issue_url": latest.get("github_issue_url"),
                "last_evaluated_at": latest.get("created_at"),
                "github_login": owner_login,
                "latest_evaluation_id": latest.get("id"),
            }
        )
    out.sort(key=lambda x: x.get("last_evaluated_at") or "", reverse=True)
    return out


def admin_evaluations(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    rows = list(_iter_all_rows())[offset : offset + limit]
    users = {str(u.get("id")): u for u in _iter_users()}
    out: list[dict[str, Any]] = []
    for r in rows:
        uid = r.get("user_id")
        login = users.get(str(uid), {}).get("github_login") if uid else None
        out.append(
            {
                "id": r.get("id"),
                "repo_url": r.get("repo_url"),
                "repo_owner": r.get("repo_owner"),
                "repo_name": r.get("repo_name"),
                "score": r.get("score"),
                "classification": r.get("classification"),
                "github_login": login,
                "github_issue_url": r.get("github_issue_url"),
                "created_at": r.get("created_at"),
            }
        )
    return out


__all__ = [
    "init_db",
    "save_evaluation",
    "load_evaluation",
    "list_evaluations",
    "delete_evaluation",
    "load_suggestions",
    "set_github_issue_url",
    "admin_stats",
    "admin_users",
    "admin_repos",
    "admin_evaluations",
]
