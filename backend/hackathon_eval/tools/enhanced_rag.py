"""Enhanced retrieval with BM25 + FAISS and reciprocal rank fusion."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
try:
    from rank_bm25 import BM25Okapi
except Exception:  # pragma: no cover - optional dependency fallback
    BM25Okapi = None  # type: ignore[assignment]

from hackathon_eval.config import OPENAI_EMBEDDING_MODEL


@dataclass
class RrfHit:
    doc: Document
    score: float


def _markdown_chunks(text: str, source: str) -> list[Document]:
    chunks: list[Document] = []
    acc: list[str] = []
    for line in text.splitlines():
        if line.startswith("## ") and acc:
            body = "\n".join(acc).strip()
            if len(body) >= 200:
                chunks.append(Document(page_content=body[:1500], metadata={"source": source}))
            acc = [line]
        else:
            acc.append(line)
    if acc:
        body = "\n".join(acc).strip()
        if len(body) >= 200:
            chunks.append(Document(page_content=body[:1500], metadata={"source": source}))
    return chunks


def load_documents(paths: list[Path]) -> list[Document]:
    docs: list[Document] = []
    for p in paths:
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if p.suffix.lower() == ".md":
            docs.extend(_markdown_chunks(t, str(p)))
        else:
            for i in range(0, len(t), 1350):
                chunk = t[i : i + 1500]
                if len(chunk) >= 200:
                    docs.append(Document(page_content=chunk, metadata={"source": str(p)}))
    return docs


def reciprocal_rank_fusion(rank_lists: list[list[int]], k: int = 60) -> dict[int, float]:
    scores: dict[int, float] = {}
    for rank_list in rank_lists:
        for rank, idx in enumerate(rank_list, start=1):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank)
    return scores


class EnhancedRetriever:
    def __init__(self, docs: list[Document]) -> None:
        self.docs = docs
        self.tokens = [d.page_content.lower().split() for d in docs]
        self.bm25 = BM25Okapi(self.tokens) if (self.tokens and BM25Okapi is not None) else None
        self.faiss = None
        try:
            if docs:
                self.faiss = FAISS.from_documents(docs, OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL))
        except Exception:
            self.faiss = None

    def query(self, q: str, top_k: int = 12, bm25_weight: float = 0.3, semantic_weight: float = 0.7) -> list[RrfHit]:
        if not self.docs:
            return []
        bm25_rank: list[int] = []
        if self.bm25 is not None:
            toks = q.lower().split()
            scores = self.bm25.get_scores(toks)
            bm25_rank = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[: max(20, top_k)]

        semantic_rank: list[int] = []
        if self.faiss is not None:
            try:
                hits = self.faiss.similarity_search_with_score(q, k=max(20, top_k))
                idx_lookup = {id(doc): i for i, doc in enumerate(self.docs)}
                for doc, _score in hits:
                    i = idx_lookup.get(id(doc))
                    if i is not None:
                        semantic_rank.append(i)
            except Exception:
                semantic_rank = []

        fused = reciprocal_rank_fusion([bm25_rank, semantic_rank])
        rescored = []
        for idx, score in fused.items():
            boost = 0.0
            if idx in bm25_rank:
                boost += bm25_weight
            if idx in semantic_rank:
                boost += semantic_weight
            rescored.append((idx, score + boost))
        rescored.sort(key=lambda x: x[1], reverse=True)
        return [RrfHit(doc=self.docs[idx], score=round(s, 6)) for idx, s in rescored[:top_k]]


def load_curated_error_patterns(path: Path) -> list[Document]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    docs: list[Document] = []
    if isinstance(data, list):
        for row in data:
            if not isinstance(row, dict):
                continue
            txt = f"{row.get('problem','')}\n{row.get('solution','')}".strip()
            if txt:
                docs.append(Document(page_content=txt, metadata={"source": str(path), "type": "curated"}))
    return docs

