"""Batch CSV / Excel parsing."""

from __future__ import annotations

from hackathon_eval.batch_file_parse import parse_csv_bytes


def test_parse_csv_flexible_columns():
    csv_text = (
        "Team,table_name,repository,branch\n"
        'Acme,1,https://github.com/octocat/Hello-World,main\n'
        "Beta,2,https://github.com/octocat/Hello-World,\n"
    )
    items = parse_csv_bytes(csv_text.encode("utf-8"))
    assert len(items) == 2
    assert items[0].repo_url == "https://github.com/octocat/Hello-World"
    assert items[0].branch == "main"
    meta0 = items[0].submission_metadata or {}
    assert meta0.get("team") == "Acme"
    assert meta0.get("table_name") == "1"


def test_parse_csv_repo_url_header():
    data = "repo_url\nhttps://github.com/octocat/Hello-World\n"
    items = parse_csv_bytes(data.encode("utf-8"))
    assert len(items) == 1
    assert items[0].repo_url.endswith("Hello-World")
