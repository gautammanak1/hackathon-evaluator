"""LangChain-compatible loader that shallow-clones a GitHub repo into a temp directory."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from typing import Iterator

from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document

from hackathon_eval.tools.repo_tools import clone_repository, iter_text_files, read_file_safe


class GitHubRepoLoader(BaseLoader):
    """Loads textual files from a GitHub repository via shallow git clone."""

    def __init__(self, repo_url: str, branch: str | None = None, cleanup: bool = True):
        self.repo_url = repo_url
        self.branch = branch
        self.cleanup = cleanup
        self._root: Path | None = None
        self._temp_parent = Path(tempfile.gettempdir())

    def lazy_load(self) -> Iterator[Document]:
        root, err = clone_repository(self.repo_url, dest_parent=self._temp_parent, branch=self.branch)
        self._root = root
        if err:
            yield Document(page_content="", metadata={"source": self.repo_url, "error": err})
            return
        try:
            for fp in iter_text_files(root):
                rel = fp.relative_to(root)
                text = read_file_safe(fp)
                yield Document(
                    page_content=text,
                    metadata={"source": self.repo_url, "path": rel.as_posix()},
                )
        finally:
            if self.cleanup and root.exists():
                import shutil

                shutil.rmtree(root, ignore_errors=True)
