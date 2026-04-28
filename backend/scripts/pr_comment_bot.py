#!/usr/bin/env python3
"""
Post hackathon evaluation as a GitHub PR comment.

Environment:
  GITHUB_TOKEN   — fine-grained or classic PAT with `pull_requests: write`
  GH_REPO        — `owner/name`
  PR_NUMBER      — integer

Usage:
  python -m scripts.pr_comment_bot --repo-url https://github.com/org/repo --pr 42
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-url", required=True)
    p.add_argument("--pr", type=int, default=int(os.getenv("PR_NUMBER", "0")))
    args = p.parse_args()

    token = os.getenv("GITHUB_TOKEN", "").strip()
    repo = os.getenv("GH_REPO", "").strip()
    if not token or not repo or args.pr <= 0:
        print("Set GITHUB_TOKEN, GH_REPO, and --pr (or PR_NUMBER).", file=sys.stderr)
        return 1

    try:
        from github import Github
    except ImportError:
        print("pip install PyGithub", file=sys.stderr)
        return 1

    from hackathon_eval.graph import build_evaluation_graph
    from hackathon_eval.tools.repo_tools import remove_path

    g = Github(token)
    r = g.get_repo(repo)
    pr = r.get_pull(args.pr)

    graph = build_evaluation_graph()
    state = graph.invoke({"repo_url": args.repo_url.strip(), "branch": None})
    report = state.get("report") or {}
    if state.get("work_dir"):
        remove_path(Path(state["work_dir"]))

    score = report.get("quality_score", "?")
    body = (
        f"### AI Hackathon evaluation (automated)\n\n"
        f"**Score:** {score}/10\n\n"
        f"```json\n{json.dumps(report, indent=2)[:60000]}\n```"
    )
    pr.create_issue_comment(body)
    print("Comment posted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
