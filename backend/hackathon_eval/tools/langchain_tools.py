"""Optional LangChain utilities: filesystem loading, Python REPL tool."""

from __future__ import annotations

from pathlib import Path

from langchain_community.document_loaders import DirectoryLoader, TextLoader


def make_repo_directory_loader(repo_root: Path, glob: str = "**/*.py") -> DirectoryLoader:
    """File-system document loader for a cloned repository (LangChain DirectoryLoader)."""
    return DirectoryLoader(
        str(repo_root),
        glob=glob,
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"},
        silent_errors=True,
        recursive=True,
        show_progress=False,
    )


def make_python_repl_tool():
    """
    LangChain Python REPL tool (sandbox). Requires langchain-experimental.
    Use only in trusted environments; not invoked by the default graph.
    """
    try:
        from langchain_experimental.tools import PythonREPLTool

        return PythonREPLTool()
    except Exception:
        return None
