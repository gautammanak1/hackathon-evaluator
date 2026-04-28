#!/usr/bin/env python3
"""
Build doc_url_manifest.json from a local Innovation Labs `docs/` checkout.

Maps https://innovationlab.fetch.ai/resources/docs/<relpath-without-md> -> relative path.

Usage:
  python backend/scripts/build_doc_url_manifest.py /path/to/innovation-labs/docs \\
    --out backend/prompts/doc_url_manifest.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running from repo root
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(_ROOT / "backend"))

from hackathon_eval.doc_catalog import DEFAULT_DOC_BASE, rel_path_to_canonical_url


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("docs_root", type=Path, help="Path to innovation-labs/docs")
    p.add_argument("--out", type=Path, default=Path("backend/prompts/doc_url_manifest.json"))
    p.add_argument("--base", default=DEFAULT_DOC_BASE)
    args = p.parse_args()

    root = args.docs_root.resolve()
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        return 1

    by_url: dict[str, str] = {}
    by_relpath: dict[str, str] = {}

    for md in sorted(root.rglob("*.md")):
        if not md.is_file():
            continue
        rel = md.relative_to(root).as_posix()
        url = rel_path_to_canonical_url(rel, base=args.base.rstrip("/"))
        by_url[url] = rel
        by_relpath[rel] = url

    payload = {
        "base": args.base.rstrip("/"),
        "generated_from": str(root),
        "by_url": by_url,
        "by_relpath": by_relpath,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(by_url)} entries to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
