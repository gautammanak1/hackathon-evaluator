"""PDF text extraction heuristics."""

from __future__ import annotations

from hackathon_eval import pdf_extract as pe
from hackathon_eval.pdf_urls import find_github_repo_urls


def test_extract_prefers_plumber_when_it_finds_more_github_urls(monkeypatch):
    def fake_pypdf(_data, _cap):
        return "https://github.com/a/single"

    def fake_plumber(_data, _cap):
        return "\n".join(f"https://github.com/org/r{i}" for i in range(5))

    monkeypatch.setattr(pe, "_extract_pypdf", fake_pypdf)
    monkeypatch.setattr(pe, "_extract_pdfplumber", fake_plumber)

    out = pe.extract_pdf_text(b"%PDF-fake")
    assert len(find_github_repo_urls(out)) == 5
