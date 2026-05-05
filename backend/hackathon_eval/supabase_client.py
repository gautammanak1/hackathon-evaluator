"""Supabase client wrapper. Server-side (service-role) only.

Returns ``None`` from :func:`get_supabase` when the env vars are missing, so the
server still boots in dev environments without Supabase configured. Callers
must handle ``None`` (the rest of the persistence layer falls back to in-memory
storage in that case).
"""

from __future__ import annotations

import os
from typing import Optional

try:
    from supabase import Client, create_client  # type: ignore[import-untyped]
except Exception:  # pragma: no cover - allow import failure during static checks
    Client = None  # type: ignore[assignment,misc]
    create_client = None  # type: ignore[assignment]


_client: Optional["Client"] = None


def get_supabase() -> Optional["Client"]:
    """Return a memoised, service-role Supabase client or ``None`` if env is missing."""
    global _client
    if _client is not None:
        return _client
    if create_client is None:
        return None
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    _client = create_client(url, key)
    return _client


def supabase_configured() -> bool:
    return get_supabase() is not None


__all__ = ["get_supabase", "supabase_configured"]
