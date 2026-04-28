"""Extract plain text from PDF uploads (pypdf + pdfplumber fallback for table/Sheets exports)."""

from __future__ import annotations

import io
import os
from typing import Final

from hackathon_eval.pdf_urls import find_github_repo_urls

_MAX_DEFAULT: Final[int] = 200_000
# If pypdf yields less than this, try pdfplumber (often better for Google Sheets → PDF).
_MIN_CHARS_TRY_PLUMBER: Final[int] = int(os.getenv("PDF_FALLBACK_MIN_CHARS", "80"))


def _extract_pypdf(data: bytes, cap: int) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    return "\n\n".join(parts).strip()


def _extract_pdfplumber(data: bytes, cap: int) -> str:
    try:
        import pdfplumber
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("pdfplumber is required for table-heavy PDFs; pip install pdfplumber") from e

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
            # Words can help when extract_text is sparse
            if not t or len(t.strip()) < 20:
                words = page.extract_words()
                if words:
                    parts.append(" ".join(w.get("text", "") for w in words))
    text = "\n\n".join(parts).strip()
    if len(text) > cap:
        text = text[:cap] + "\n\n[PDF text truncated]"
    return text


def extract_pdf_text(data: bytes, *, max_chars: int | None = None) -> str:
    """
    Extract concatenated text from PDF bytes.
    Uses pypdf first, then pdfplumber if output is very short (common for Google Sheets PDF).
    """
    if not data or not data.strip():
        raise ValueError("empty PDF payload")
    cap = max_chars if max_chars is not None else _MAX_DEFAULT
    try:
        from pypdf import PdfReader  # noqa: F401 — import check
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("pypdf is required for PDF uploads; pip install pypdf") from e

    text = _extract_pypdf(data, cap)
    if len(text) < _MIN_CHARS_TRY_PLUMBER:
        try:
            alt = _extract_pdfplumber(data, cap)
            if len(alt) > len(text):
                text = alt
        except (RuntimeError, OSError, ValueError):
            pass

    # pypdf often merges table cells so only one github.com link appears; pdfplumber usually preserves more.
    try:
        n_urls = len(find_github_repo_urls(text))
        if n_urls < 2:
            alt = _extract_pdfplumber(data, cap)
            if len(find_github_repo_urls(alt)) > n_urls:
                text = alt
    except (RuntimeError, OSError, ValueError):
        pass

    if not text:
        raise ValueError(
            "No extractable text in this PDF. If it is from Google Sheets, try "
            "File → Download → CSV or Excel and use bulk upload instead."
        )
    if len(text) > cap:
        text = text[:cap] + "\n\n[PDF text truncated]"
    return text
