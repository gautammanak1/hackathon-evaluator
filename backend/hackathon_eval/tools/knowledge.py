"""Load and retrieve grounding context from local Innovation Labs + agent examples."""

from __future__ import annotations

import os
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from hackathon_eval.config import (
    OPENAI_EMBEDDING_MODEL,
    resolve_agent_examples,
    resolve_innovation_labs_docs,
)
from hackathon_eval.doc_catalog import canonical_url_for_doc_file, load_url_manifest

MAX_MD_FILES = int(os.getenv("MAX_KNOWLEDGE_MD_FILES", "80"))
MAX_PROTO_FILES = int(os.getenv("MAX_KNOWLEDGE_PROTO_FILES", "40"))
MAX_CHUNK_TOTAL = int(os.getenv("MAX_KNOWLEDGE_CHUNKS", "600"))


def _documents_from_paths(
    paths: list[Path],
    docs_root: Path | None = None,
) -> list[Document]:
    manifest = load_url_manifest() if docs_root else {}
    out: list[Document] = []
    for p in paths:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
            if len(text) > 120_000:
                text = text[:120_000] + "\n...[truncated]...\n"
            meta: dict = {"source": str(p)}
            if docs_root is not None and p.suffix.lower() == ".md":
                cu = canonical_url_for_doc_file(p, docs_root, manifest or None)
                if cu:
                    meta["canonical_url"] = cu
            out.append(Document(page_content=text, metadata=meta))
        except OSError:
            continue
    return out


def _split_documents_semantic(documents: list[Document]) -> list[Document]:
    """Language-aware chunking: Python/TS/MD get tailored separators when available."""
    md_chunks: list[Document] = []
    py_chunks: list[Document] = []
    ts_chunks: list[Document] = []
    generic: list[Document] = []

    for d in documents:
        src = str(d.metadata.get("source", "")).lower()
        if src.endswith(".py"):
            py_chunks.append(d)
        elif src.endswith((".ts", ".tsx", ".js", ".jsx")):
            ts_chunks.append(d)
        elif src.endswith(".md"):
            md_chunks.append(d)
        else:
            generic.append(d)

    chunks: list[Document] = []

    def run_split(docs: list[Document], language: object | None) -> list[Document]:
        if not docs:
            return []
        try:
            if language == Language.PYTHON:
                splitter = RecursiveCharacterTextSplitter.from_language(
                    language=Language.PYTHON, chunk_size=1400, chunk_overlap=160
                )
            elif language == Language.JS:
                splitter = RecursiveCharacterTextSplitter.from_language(
                    language=Language.JS, chunk_size=1400, chunk_overlap=160
                )
            else:
                splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=120)
        except Exception:
            splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=120)
        return splitter.split_documents(docs)

    chunks.extend(run_split(py_chunks, Language.PYTHON))
    chunks.extend(run_split(ts_chunks, Language.JS))
    chunks.extend(run_split(md_chunks, None))
    chunks.extend(run_split(generic, None))
    return chunks


def load_grounding_documents(
    docs_dir: Path | None = None,
    agents_dir: Path | None = None,
) -> list[Document]:
    """Load markdown from Innovation Labs + reference agent protocol Python files."""
    docs: list[Document] = []
    docs_dir = docs_dir if docs_dir is not None else resolve_innovation_labs_docs()
    agents_dir = agents_dir if agents_dir is not None else resolve_agent_examples()

    if docs_dir is not None and docs_dir.exists():
        md_files = sorted({p for p in docs_dir.rglob("*.md") if p.is_file()})[:MAX_MD_FILES]
        docs.extend(_documents_from_paths(md_files, docs_root=docs_dir))

    if agents_dir is not None and agents_dir.exists():
        proto_files = sorted({p for p in agents_dir.rglob("protocols/*.py") if p.is_file()})[
            :MAX_PROTO_FILES
        ]
        docs.extend(_documents_from_paths(proto_files, docs_root=None))

    return docs


def build_retriever(docs: list, k: int = 8):
    if not docs:
        return None
    if not os.getenv("OPENAI_API_KEY"):
        return None
    chunks = _split_documents_semantic(docs)
    if MAX_CHUNK_TOTAL and len(chunks) > MAX_CHUNK_TOTAL:
        chunks = chunks[:MAX_CHUNK_TOTAL]
    if not chunks:
        return None
    emb = OpenAIEmbeddings(model=OPENAI_EMBEDDING_MODEL)
    store = FAISS.from_documents(chunks, emb)
    return store.as_retriever(search_kwargs={"k": k})


_RETRIEVER_CACHE: dict[str, object] = {}


def retrieve_context(
    query: str,
    docs_dir: Path | None = None,
    agents_dir: Path | None = None,
) -> str:
    """Return top relevant chunks for LLM grounding (embedding search)."""
    docs_dir = docs_dir if docs_dir is not None else resolve_innovation_labs_docs()
    agents_dir = agents_dir if agents_dir is not None else resolve_agent_examples()
    cache_key = f"{docs_dir}:{agents_dir}"
    if cache_key not in _RETRIEVER_CACHE:
        all_docs = load_grounding_documents(docs_dir, agents_dir)
        _RETRIEVER_CACHE[cache_key] = build_retriever(all_docs)

    retriever = _RETRIEVER_CACHE[cache_key]
    if retriever is None:
        return ""
    try:
        hits = retriever.invoke(query)
    except Exception:
        return ""
    parts = []
    for i, d in enumerate(hits, 1):
        src = d.metadata.get("source", "unknown")
        cu = d.metadata.get("canonical_url")
        url_line = f"\ncanonical_url: {cu}\n" if cu else ""
        parts.append(f"[{i}] source: {src}{url_line}\n{d.page_content[:4000]}")
    return "\n\n---\n\n".join(parts)


def clear_knowledge_cache() -> None:
    _RETRIEVER_CACHE.clear()
