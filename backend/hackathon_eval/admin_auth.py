"""Verify admin JWTs issued by the Next.js admin login route."""

from __future__ import annotations

import os
from typing import Any

import jwt


class AdminAuthError(Exception):
    """Raised when an admin JWT is missing or invalid."""


def _secret() -> str:
    s = os.getenv("ADMIN_JWT_SECRET", "")
    if not s:
        raise AdminAuthError("ADMIN_JWT_SECRET is not configured on the server")
    return s


def verify_admin_token(token: str | None) -> dict[str, Any]:
    """Decode + validate an admin JWT. Raises :class:`AdminAuthError` on failure."""
    if not token:
        raise AdminAuthError("missing admin token")
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise AdminAuthError("token expired") from e
    except jwt.InvalidTokenError as e:
        raise AdminAuthError("invalid token") from e
    if payload.get("scope") != "admin":
        raise AdminAuthError("token scope is not admin")
    return payload


__all__ = ["verify_admin_token", "AdminAuthError"]
