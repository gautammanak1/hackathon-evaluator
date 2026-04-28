"""Example / smoke tests for the evaluation pipeline."""

from __future__ import annotations

import os

import pytest

from hackathon_eval.graph_nodes import node_report_generator
from hackathon_eval.protocol_validation import validate_protocols
from hackathon_eval.state import EvalState
from hackathon_eval.tools.scanner import scan_combined_text


def test_scan_empty():
    s = scan_combined_text("")
    assert s.agent_instantiations == 0
    assert not s.uagents_import


def test_scan_reference_snippet():
    snippet = """
from uagents import Agent, Context
from uagents_core.contrib.protocols.chat import ChatMessage, chat_protocol_spec
from uagents_core.contrib.protocols.payment import RequestPayment, payment_protocol_spec
from openai import OpenAI
agent = Agent(name="x", seed="y")
"""
    s = scan_combined_text(snippet)
    assert s.uagents_import
    assert s.agent_instantiations >= 1
    assert s.chat_protocol_spec
    assert s.payment_protocol_spec


def test_protocol_payment_valid_signals():
    text = """
from uagents_core.contrib.protocols.payment import RequestPayment, CommitPayment, CompletePayment, payment_protocol_spec
payment_proto = Protocol(spec=payment_protocol_spec)
@payment_proto.on_message(RequestPayment)
async def on_req(ctx, sender, msg):
    await ctx.send(sender, CommitPayment(...))
async def x():
    pass
@agent.on_message(RequestPayment)
async def h():
    pass
"""
    v = validate_protocols(text)
    assert v["payment"] == "valid"


def test_protocol_payment_invalid_incomplete():
    text = "RequestPayment only"
    v = validate_protocols(text)
    assert v["payment"] in ("invalid", "unknown")


def test_code_sketch_extracts_defs():
    from hackathon_eval.tools.code_sketch import build_code_semantic_sketch

    text = "class A:\n  pass\nasync def foo():\n  pass\n@agent.on_message\n"
    sk = build_code_semantic_sketch(text)
    assert "class A" in sk
    assert "def foo" in sk


@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OPENAI_API_KEY not set")
def test_full_graph_public_repo():
    from hackathon_eval.graph import run_evaluation

    report = run_evaluation("https://github.com/octocat/Hello-World")
    assert "repo_name" in report
    assert "quality_score" in report or "score" in report


def test_report_generator_shape():
    state: EvalState = {
        "repo_url": "https://github.com/example/repo",
        "repo_name": "repo",
        "combined_source_excerpt": "from fastapi import FastAPI\napp=FastAPI()",
        "scan": scan_combined_text("from fastapi import FastAPI").__dict__,
        "knowledge_context": "",
        "protocol_validation": validate_protocols("from fastapi import FastAPI"),
        "benchmark": {"closest_match": "unknown", "confidence": 0.0, "reason": "n/a"},
        "submission_metadata": {"team_name": "Test"},
        "analysis": {
            "heuristic_score": 3,
            "issues": ["uAgents: none"],
            "struct_note": "small",
            "reflection": {
                "classification": "Poor",
                "problem_solved": "Unknown.",
                "solution_overview": "Unknown.",
                "scores": {
                    "architecture": 3,
                    "protocols": 3,
                    "ai_usage": 3,
                    "code_quality": 4,
                    "innovation": 3,
                },
                "benchmark_reason": "cosine_good=None",
                "summary": "Frontend-only stub.",
                "notes": "No agents.",
                "chat_protocol_details": "FastAPI only.",
                "asi_llm_details": "None.",
                "payment_details": "None.",
            },
            "flags": {
                "uagents": False,
                "chat": False,
                "llm": False,
                "payment": False,
            },
        },
        "analysis_llm_notes": "",
    }
    out = node_report_generator(state)
    rep = out["report"]
    assert rep["repo_name"] == "repo"
    assert "quality_score" in rep
    assert "report_v2" in rep
    assert rep["report_v2"]["classification"] == "Poor"
    assert isinstance(rep["report_v2"]["scores"], dict)
    assert rep["report_v2"]["problem_solved"] == "Unknown."
    assert rep["report_v2"]["solution_overview"] == "Unknown."
    assert rep["report_v2"]["submission_metadata"].get("team_name") == "Test"
    assert rep.get("submission_metadata", {}).get("team_name") == "Test"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
