"""SQLite persistence for evaluation records (optional Postgres via DATABASE_URL later)."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_DB_PATH = Path(os.getenv("EVAL_DB_PATH", "")).expanduser() if os.getenv("EVAL_DB_PATH") else None
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE = _BACKEND_ROOT / "data" / "evaluations.db"


def _db_file() -> Path:
    if _DB_PATH and _DB_PATH.is_absolute():
        return _DB_PATH
    env = os.getenv("EVAL_DB_PATH", "").strip()
    if env:
        return Path(env).expanduser()
    _DEFAULT_SQLITE.parent.mkdir(parents=True, exist_ok=True)
    return _DEFAULT_SQLITE


def _connect() -> sqlite3.Connection:
    path = _db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluations (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                error TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def save_evaluation(payload: dict[str, Any], *, status: str = "complete", error: str | None = None) -> str:
    """Persist evaluation JSON; returns UUID string (also written into payload as submission_id)."""
    init_db()
    eid = str(uuid.uuid4())
    merged = dict(payload)
    merged["submission_id"] = eid
    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO evaluations (id, created_at, status, payload, error) VALUES (?, ?, ?, ?, ?)",
            (eid, created, status, json.dumps(merged, ensure_ascii=False), error),
        )
        conn.commit()
    finally:
        conn.close()
    return eid


def load_evaluation(eid: str) -> dict[str, Any] | None:
    init_db()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, created_at, status, payload, error FROM evaluations WHERE id = ?",
            (eid.strip(),),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    data = json.loads(row["payload"])
    if isinstance(data, dict):
        data["_persist"] = {
            "id": row["id"],
            "created_at": row["created_at"],
            "status": row["status"],
            "error": row["error"],
        }
    return data


def delete_evaluation(eid: str) -> bool:
    """Remove a persisted evaluation by id. Returns True if a row was deleted."""
    init_db()
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM evaluations WHERE id = ?", (eid.strip(),))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_evaluations(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Lightweight rows for leaderboard (id, created_at, status, summary fields from payload)."""
    init_db()
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT id, created_at, status, payload FROM evaluations
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (max(1, min(limit, 500)), max(0, offset)),
        ).fetchall()
    finally:
        conn.close()
    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except json.JSONDecodeError:
            payload = {}
        summary = _summarize_payload(payload)
        out.append(
            {
                "submission_id": r["id"],
                "created_at": r["created_at"],
                "status": r["status"],
                **summary,
            }
        )
    return out


def _summarize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    rv2 = payload.get("report_v2") if isinstance(payload.get("report_v2"), dict) else {}
    repo = payload.get("repo_name") or rv2.get("repo_name") or ""
    meta = payload.get("submission_metadata") or rv2.get("submission_metadata") or {}
    team = ""
    if isinstance(meta, dict):
        team = str(meta.get("team_name") or meta.get("team") or "")
    score_block = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    fin = score_block.get("final_score")
    if fin is None:
        fin = rv2.get("score")
    cls = ""
    if isinstance(score_block, dict) and score_block.get("classification"):
        cls = str(score_block["classification"])
    if not cls:
        cls = str(payload.get("classification") or rv2.get("classification") or "")
    return {
        "project_name": repo,
        "team_name": team,
        "score": fin,
        "classification": cls,
    }


__all__ = ["init_db", "save_evaluation", "load_evaluation", "list_evaluations", "delete_evaluation"]
