"""Benchmark corpora: good vs bad repo centroids via embeddings (optional)."""

from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from pathlib import Path

from hackathon_eval.config import OPENAI_EMBEDDING_MODEL
from hackathon_eval.tools.repo_tools import build_repo_bundle, clone_repository, remove_path

_CFG_CACHE = os.getenv("BENCHMARK_CACHE_DIR", "").strip()
CACHE_DIR = Path(_CFG_CACHE) if _CFG_CACHE else Path(__file__).resolve().parents[2] / ".cache"
CACHE_FILE = CACHE_DIR / "benchmark_centroids.json"


def _parse_dirs(raw: str) -> list[Path]:
    return [Path(p.strip()).expanduser() for p in raw.split(",") if p.strip()]


def _load_url_list(path_str: str | None) -> list[str]:
    if not path_str or not path_str.strip():
        return []
    p = Path(path_str).expanduser()
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [str(u) for u in data]
    if isinstance(data, dict) and "urls" in data:
        return [str(u) for u in data["urls"]]
    return []


def _l2_normalize(v: list[float]) -> list[float]:
    s = math.sqrt(sum(x * x for x in v))
    if s <= 1e-12:
        return v
    return [x / s for x in v]


def _centroid(vectors: list[list[float]]) -> list[float] | None:
    if not vectors:
        return None
    dim = len(vectors[0])
    acc = [0.0] * dim
    for v in vectors:
        if len(v) != dim:
            continue
        for i, x in enumerate(v):
            acc[i] += x
    n = len(vectors)
    return [x / n for x in acc]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def _config_hash(parts: list[str]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"\n")
    return h.hexdigest()[:24]


def _collect_excerpt_for_path(p: Path) -> str:
    if p.is_file():
        try:
            return p.read_text(encoding="utf-8", errors="replace")[:80_000]
        except OSError:
            return ""
    if p.is_dir():
        excerpt, _ = build_repo_bundle(p, max_chars=100_000)
        return excerpt
    return ""


def _embed(emb: object, text: str) -> list[float]:
    t = text[:100_000] if text else ""
    if not t.strip():
        return []
    return list(emb.embed_query(t))


def _gather_corpus_vectors(
    emb: object,
    dirs: list[Path],
    urls: list[str],
    max_items: int,
) -> tuple[list[list[float]], list[str]]:
    vectors: list[list[float]] = []
    labels: list[str] = []
    for d in dirs:
        if len(vectors) >= max_items:
            break
        if not d.is_dir():
            continue
        ex = _collect_excerpt_for_path(d)
        v = _embed(emb, ex)
        if v:
            vectors.append(_l2_normalize(v))
            labels.append(str(d))
    for url in urls:
        if len(vectors) >= max_items:
            break
        root, err = clone_repository(url, dest_parent=Path(tempfile.gettempdir()), depth=1)
        try:
            if err:
                continue
            ex, _ = build_repo_bundle(root, max_chars=100_000)
            v = _embed(emb, ex)
            if v:
                vectors.append(_l2_normalize(v))
                labels.append(url)
        finally:
            remove_path(root)
    return vectors, labels


def build_or_load_centroids(*, force: bool = False) -> dict:
    """Return dict with good/bad normalized centroid vectors and metadata."""
    if not os.getenv("OPENAI_API_KEY"):
        return {"enabled": False, "reason": "OPENAI_API_KEY missing"}

    good_dirs = _parse_dirs(os.getenv("BENCHMARK_GOOD_DIRS", ""))
    bad_dirs = _parse_dirs(os.getenv("BENCHMARK_BAD_DIRS", ""))
    good_urls = _load_url_list(os.getenv("BENCHMARK_GOOD_URLS_FILE", ""))
    bad_urls = _load_url_list(os.getenv("BENCHMARK_BAD_URLS_FILE", ""))

    max_per_class = int(os.getenv("BENCHMARK_MAX_ITEMS_PER_CLASS", "12"))
    parts = [
        json.dumps([str(p) for p in good_dirs]),
        json.dumps([str(p) for p in bad_dirs]),
        json.dumps(good_urls),
        json.dumps(bad_urls),
        OPENAI_EMBEDDING_MODEL,
    ]
    cfg_hash = _config_hash(parts)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # use module-level CACHE_FILE - fix: CACHE_DIR might be wrong when env empty

    if (
        not force
        and CACHE_FILE.exists()
        and os.getenv("BENCHMARK_REBUILD", "").lower() not in {"1", "true", "yes"}
    ):
        try:
            cached = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            if cached.get("config_hash") == cfg_hash:
                return cached
        except (OSError, json.JSONDecodeError):
            pass

    try:
        from langchain_openai import OpenAIEmbeddings
    except ImportError:
        return {"enabled": False, "reason": "langchain_openai missing"}

    emb = OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL)

    gv, gl = _gather_corpus_vectors(emb, good_dirs, good_urls, max_per_class)
    bv, bl = _gather_corpus_vectors(emb, bad_dirs, bad_urls, max_per_class)

    g_cent = _centroid(gv)
    b_cent = _centroid(bv)
    if g_cent:
        g_cent = _l2_normalize(g_cent)
    if b_cent:
        b_cent = _l2_normalize(b_cent)

    out = {
        "enabled": bool(g_cent or b_cent),
        "config_hash": cfg_hash,
        "good_centroid": g_cent,
        "bad_centroid": b_cent,
        "good_exemplars": gl[:20],
        "bad_exemplars": bl[:20],
        "good_count": len(gv),
        "bad_count": len(bv),
    }
    try:
        CACHE_FILE.write_text(json.dumps(out), encoding="utf-8")
    except OSError:
        pass
    return out


def compare_to_benchmark(target_text: str, centroids: dict | None = None) -> dict:
    """Cosine similarity of target excerpt to good/bad centroids."""
    base = {
        "closest_match": "unknown",
        "confidence": 0.0,
        "similarity_good": None,
        "similarity_bad": None,
        "reason": "",
        "exemplars_good": [],
        "exemplars_bad": [],
    }
    if not target_text or not target_text.strip():
        base["reason"] = "Empty target excerpt."
        return base

    if centroids is None:
        centroids = build_or_load_centroids()

    if not centroids.get("enabled"):
        base["reason"] = centroids.get("reason", "Benchmark corpus not configured or empty.")
        return base

    try:
        from langchain_openai import OpenAIEmbeddings
    except ImportError:
        base["reason"] = "langchain_openai missing"
        return base

    emb = OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL)
    tv = _l2_normalize(_embed(emb, target_text))
    if not tv:
        base["reason"] = "Embedding failed for target."
        return base

    sg = sb = None
    gcent = centroids.get("good_centroid")
    bcent = centroids.get("bad_centroid")
    if gcent:
        sg = _cosine(tv, gcent)
    if bcent:
        sb = _cosine(tv, bcent)

    base["similarity_good"] = sg
    base["similarity_bad"] = sb
    base["exemplars_good"] = centroids.get("good_exemplars", [])[:5]
    base["exemplars_bad"] = centroids.get("bad_exemplars", [])[:5]

    if sg is None and sb is None:
        base["reason"] = "No centroids computed."
        return base

    if sg is not None and sb is not None:
        margin = 0.02
        if sg > sb + margin:
            base["closest_match"] = "good"
        elif sb > sg + margin:
            base["closest_match"] = "bad"
        else:
            base["closest_match"] = "ambiguous"
        # confidence from softmax of scaled similarities
        exg = math.exp(max(-5.0, min(5.0, sg * 5)))
        exb = math.exp(max(-5.0, min(5.0, sb * 5)))
        base["confidence"] = round(max(exg, exb) / (exg + exb + 1e-9), 4)
        base["reason"] = (
            f"cosine_good={sg:.4f}, cosine_bad={sb:.4f}; closest={base['closest_match']}."
        )
    elif sg is not None:
        base["closest_match"] = "good"
        base["confidence"] = round(max(0.0, min(1.0, (sg + 1) / 2)), 4)
        base["reason"] = f"Only good centroid; cosine_good={sg:.4f}."
    else:
        base["closest_match"] = "bad"
        base["confidence"] = round(max(0.0, min(1.0, (sb + 1) / 2)), 4)
        base["reason"] = f"Only bad centroid; cosine_bad={sb:.4f}."

    return base
