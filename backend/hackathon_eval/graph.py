"""LangGraph workflow assembly."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from hackathon_eval.graph_nodes import (
    NODE_ANALYSIS,
    NODE_BENCHMARK,
    NODE_EVAL,
    NODE_FEATURES,
    NODE_INGESTION,
    NODE_KNOWLEDGE,
    NODE_PROTOCOL,
    NODE_REPORT,
    node_benchmark_compare,
    node_code_analysis,
    node_evaluation,
    node_feature_detection,
    node_knowledge_grounding,
    node_protocol_validation,
    node_repo_ingestion,
    node_report_generator,
)
from hackathon_eval.state import EvalState


def build_evaluation_graph():
    g = StateGraph(EvalState)
    g.add_node(NODE_INGESTION, node_repo_ingestion)
    g.add_node(NODE_ANALYSIS, node_code_analysis)
    g.add_node(NODE_PROTOCOL, node_protocol_validation)
    g.add_node(NODE_FEATURES, node_feature_detection)
    g.add_node(NODE_KNOWLEDGE, node_knowledge_grounding)
    g.add_node(NODE_BENCHMARK, node_benchmark_compare)
    g.add_node(NODE_EVAL, node_evaluation)
    g.add_node(NODE_REPORT, node_report_generator)

    g.set_entry_point(NODE_INGESTION)
    g.add_edge(NODE_INGESTION, NODE_ANALYSIS)
    g.add_edge(NODE_ANALYSIS, NODE_PROTOCOL)
    g.add_edge(NODE_PROTOCOL, NODE_FEATURES)
    g.add_edge(NODE_FEATURES, NODE_KNOWLEDGE)
    g.add_edge(NODE_KNOWLEDGE, NODE_BENCHMARK)
    g.add_edge(NODE_BENCHMARK, NODE_EVAL)
    g.add_edge(NODE_EVAL, NODE_REPORT)
    g.add_edge(NODE_REPORT, END)

    return g.compile()


def run_evaluation(
    repo_url: str | None = None,
    branch: str | None = None,
    submission_context: str | None = None,
    document_text: str | None = None,
    submission_metadata: dict | None = None,
) -> dict:
    """Execute graph; returns final report dict (legacy keys + report_v2)."""
    app = build_evaluation_graph()
    payload: EvalState = {}
    if (repo_url or "").strip():
        payload["repo_url"] = repo_url.strip()
    if branch:
        payload["branch"] = branch
    if submission_context:
        payload["submission_context"] = submission_context
    if (document_text or "").strip():
        payload["document_text"] = document_text.strip()
    if submission_metadata:
        payload["submission_metadata"] = dict(submission_metadata)
    out = app.invoke(payload)
    return out.get("report") or {}
