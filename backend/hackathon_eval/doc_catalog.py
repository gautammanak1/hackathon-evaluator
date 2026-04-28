"""Map local Innovation Labs markdown paths to public Innovation Lab doc URLs."""

from __future__ import annotations

import json
import os
from pathlib import Path

from hackathon_eval.config import PROMPTS_DIR

_BACKEND = Path(__file__).resolve().parent.parent

_MANIFEST_CANDIDATES = [
    Path(os.getenv("DOC_URL_MANIFEST", "").strip()) if os.getenv("DOC_URL_MANIFEST") else None,
    PROMPTS_DIR / "doc_url_manifest.json",
    _BACKEND / "prompts" / "doc_url_manifest.json",
]


def _load_manifest_path() -> Path | None:
    for p in _MANIFEST_CANDIDATES:
        if p is None:
            continue
        if p.exists():
            return p
    return None


def load_url_manifest() -> dict[str, str]:
    """
    Returns mapping canonical_url -> relative path under docs root (posix, may include .md).
    Built by `scripts/build_doc_url_manifest.py`.
    """
    path = _load_manifest_path()
    if not path:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    urls = data.get("by_url")
    if isinstance(urls, dict):
        return {str(k): str(v) for k, v in urls.items()}
    return {}


DEFAULT_DOC_BASE = os.getenv(
    "INNOVATION_LABS_DOC_BASE",
    "https://innovationlab.fetch.ai/resources/docs",
).rstrip("/")


def rel_path_to_canonical_url(rel: str, *, base: str = DEFAULT_DOC_BASE) -> str:
    """
    Deterministic URL from path under docs/: `agent/foo.md` -> `{base}/agent/foo`.
    Matches Docusaurus route when slug follows folder structure.
    """
    p = rel.replace("\\", "/").lstrip("/")
    if p.endswith(".md"):
        p = p[: -len(".md")]
    return f"{base}/{p}"


def canonical_url_for_doc_file(abs_path: Path, docs_root: Path, manifest: dict[str, str] | None = None) -> str | None:
    """Resolve canonical URL for a file under docs_root using manifest reverse lookup or path rule."""
    try:
        rel = abs_path.relative_to(docs_root).as_posix()
    except ValueError:
        return None
    url = rel_path_to_canonical_url(rel)
    if manifest:
        # prefer exact manifest key if path stored as value
        for u, v in manifest.items():
            if v.replace("\\", "/") == rel or v.replace("\\", "/") == rel + ".md":
                return u
    return url
