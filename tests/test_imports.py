"""Smoke test: the installed `hackathon_eval` package and its key submodules import cleanly."""

from __future__ import annotations

import importlib

import pytest


@pytest.mark.parametrize(
    "module",
    [
        "hackathon_eval",
        "hackathon_eval.graph",
        "hackathon_eval.graph_nodes",
        "hackathon_eval.state",
        "hackathon_eval.evaluation_runner",
        "hackathon_eval.persistence",
    ],
)
def test_module_imports(module: str) -> None:
    importlib.import_module(module)


def test_public_api_exposes_run_evaluation() -> None:
    pkg = importlib.import_module("hackathon_eval")
    assert hasattr(pkg, "run_evaluation")
    assert hasattr(pkg, "build_evaluation_graph")
