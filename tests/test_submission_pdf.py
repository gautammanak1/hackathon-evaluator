"""Multipart /evaluate/submission: PDF multi-repo batch behaviour."""

from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient

import main


def test_submission_pdf_batch_even_when_repo_url_form_set(monkeypatch):
    """Sheet PDFs should batch all links; previously a filled URL field forced a single evaluation."""

    def fake_extract(_body: bytes) -> str:
        return "\n".join(f"https://github.com/org/repo{i}" for i in range(5))

    monkeypatch.setattr(main, "extract_pdf_text", fake_extract)

    def fake_run_batch(_graph, items):
        return [{"repo_name": it.repo_url.rsplit("/", 1)[-1]} for it in items]

    monkeypatch.setattr(main, "_run_batch", fake_run_batch)
    monkeypatch.setattr(main, "build_evaluation_graph", lambda: object())

    client = TestClient(main.app)
    res = client.post(
        "/evaluate/submission",
        data={"repo_url": "https://github.com/ignored/single"},
        files={"pdf": ("rows.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "batch"
    assert body["count"] == 5
    assert body["notice"] and "ignored" in body["notice"].lower()


def test_submission_pdf_single_when_only_one_link_in_pdf(monkeypatch):
    def fake_extract(_body: bytes) -> str:
        return "pitch https://github.com/acme/only-one"

    monkeypatch.setattr(main, "extract_pdf_text", fake_extract)

    class FakeGraph:
        def invoke(self, payload):
            return {"report": {"repo_name": "only-one", "quality_score": 7}, "work_dir": None}

    monkeypatch.setattr(main, "build_evaluation_graph", lambda: FakeGraph())

    client = TestClient(main.app)
    res = client.post(
        "/evaluate/submission",
        files={"pdf": ("one.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "single"
    assert body["evaluation"]["repo_name"] == "only-one"
