"""Configuration: paths resolved from environment for local dev, CI, and production."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Repository root = parent of backend/hackathon_eval when installed as backend/hackathon_eval
_PKG_ROOT = Path(__file__).resolve().parent
_BACKEND_ROOT = _PKG_ROOT.parent
_REPO_ROOT = _BACKEND_ROOT.parent

# Optional bundled fallbacks (copy docs here in Docker/images if needed)
_DEFAULT_BUNDLED_DOCS = _REPO_ROOT / "data" / "innovation-labs-docs"
_DEFAULT_BUNDLED_AGENTS = _REPO_ROOT / "data" / "innovation-lab-agents"


def _path_from_env(name: str, default: Path | None) -> Path | None:
    raw = os.getenv(name, "").strip()
    if raw:
        return Path(raw).expanduser()
    return default


def resolve_innovation_labs_docs() -> Path | None:
    """
    Innovation Labs markdown root used for RAG + prompt assembly.

    **Production / Docker:** set `INNOVATION_LABS_DOCS` to the mounted docs directory
    (e.g. a volume clone of `innovation-labs/docs`). Do not rely on developer machine paths.

    **Local dev:** set the env var, or place a copy under `./data/innovation-labs-docs`.
    """
    p = _path_from_env("INNOVATION_LABS_DOCS", None)
    if p is not None and p.exists():
        return p
    if _DEFAULT_BUNDLED_DOCS.exists():
        return _DEFAULT_BUNDLED_DOCS
    # Legacy dev default only if explicitly enabled (avoids leaking fixed home paths in prod)
    legacy = os.getenv("INNOVATION_LABS_DOCS_LEGACY_DEV", "").strip().lower() in {"1", "true", "yes"}
    if legacy:
        dev = Path("/Users/engineer/innovationlab-resources/innovation-labs/docs")
        if dev.exists():
            return dev
    return None


def resolve_agent_examples() -> Path | None:
    """Reference uAgents repos (`**/protocols/*.py`). Optional for RAG."""
    p = _path_from_env("INNOVATION_LAB_AGENTS", None)
    if p is not None and p.exists():
        return p
    if _DEFAULT_BUNDLED_AGENTS.exists():
        return _DEFAULT_BUNDLED_AGENTS
    legacy = os.getenv("INNOVATION_LAB_AGENTS_LEGACY_DEV", "").strip().lower() in {"1", "true", "yes"}
    if legacy:
        dev = Path("/Users/engineer/innovation-lab-agents/agents")
        if dev.exists():
            return dev
    return None


def resolve_prompts_dir() -> Path:
    """Bundled prompt / rules markdown under `backend/prompts`."""
    env = os.getenv("PROMPTS_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    return _BACKEND_ROOT / "prompts"


# Public aliases (may be None — callers must handle missing paths)
DEFAULT_INNOVATION_LABS_DOCS = resolve_innovation_labs_docs()
DEFAULT_AGENT_EXAMPLES = resolve_agent_examples()
PROMPTS_DIR = resolve_prompts_dir()

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

MAX_REPO_FILES = int(os.getenv("MAX_REPO_FILES", "400"))
MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", 200_000))

TEXT_EXTENSIONS = {
    ".py",
    ".toml",
    ".yaml",
    ".yml",
    ".json",
    ".md",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".rs",
    ".go",
    ".java",
    ".kt",
    ".swift",
}

IGNORE_DIR_NAMES = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "target",
    ".gradle",
    ".next",
}

# CORS for Next.js dev / prod
API_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("API_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]
