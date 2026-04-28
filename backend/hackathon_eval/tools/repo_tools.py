"""Clone and scan GitHub repositories."""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

from hackathon_eval.config import (
    IGNORE_DIR_NAMES,
    MAX_FILE_BYTES,
    MAX_REPO_FILES,
    TEXT_EXTENSIONS,
)


def normalize_github_url(url: str) -> str:
    u = url.strip().rstrip("/")
    if u.endswith(".git"):
        return u
    if "github.com" in u and not u.endswith(".git"):
        return u + ".git"
    return u


def parse_repo_identity(url: str) -> tuple[str, str]:
    """Return (host_agnostic_name, suggested_folder_name)."""
    u = url.strip().rstrip("/")
    u = re.sub(r"\.git$", "", u)
    parsed = urlparse(u)
    path = parsed.path.strip("/")
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}", parts[-1]
    return path or "unknown_repo", parts[-1] if parts else "repo"


def clone_repository(
    url: str,
    dest_parent: Path | None = None,
    branch: str | None = None,
    depth: int = 1,
) -> tuple[Path, str | None]:
    """
    Shallow-clone repo. Returns (path, error_message).
    """
    dest_parent = dest_parent or Path(tempfile.gettempdir())
    dest = dest_parent / f"heval_{uuid.uuid4().hex}"
    cmd = ["git", "clone", "--depth", str(depth)]
    if branch:
        cmd.extend(["--branch", branch])
    cmd.extend([normalize_github_url(url), str(dest)])
    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
        return dest, None
    except subprocess.CalledProcessError as e:
        err = (e.stderr or e.stdout or str(e))[:4000]
        return dest, err
    except subprocess.TimeoutExpired:
        return dest, "git clone timed out"
    except FileNotFoundError:
        return dest, "git executable not found"


def iter_text_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in IGNORE_DIR_NAMES for part in p.parts):
            continue
        if p.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        files.append(p)
    files.sort(key=lambda x: str(x))
    return files[:MAX_REPO_FILES]


def read_file_safe(path: Path, limit: int = MAX_FILE_BYTES) -> str:
    try:
        data = path.read_bytes()[:limit]
        return data.decode("utf-8", errors="replace")
    except OSError:
        return ""


def build_repo_bundle(root: Path, max_chars: int = 120_000) -> tuple[str, dict]:
    """
    Concatenate a bounded excerpt of repository text for LLM + heuristics.
    """
    paths = iter_text_files(root)
    chunks: list[str] = []
    total = 0
    for fp in paths:
        rel = fp.relative_to(root)
        content = read_file_safe(fp)
        if not content.strip():
            continue
        header = f"\n\n===== FILE: {rel.as_posix()} =====\n"
        piece = header + content
        if total + len(piece) > max_chars:
            remaining = max_chars - total - len(header)
            if remaining > 500:
                piece = header + content[:remaining] + "\n... [truncated] ...\n"
                chunks.append(piece)
            break
        chunks.append(piece)
        total += len(piece)

    excerpt = "".join(chunks)
    stats = {
        "num_files_scanned": len(paths),
        "excerpt_chars": len(excerpt),
        "extensions": _extension_counts(paths),
    }
    return excerpt, stats


def _extension_counts(paths: list[Path]) -> dict[str, int]:
    out: dict[str, int] = {}
    for p in paths:
        ext = p.suffix.lower() or "(none)"
        out[ext] = out.get(ext, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def remove_path(path: Path) -> None:
    try:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass
