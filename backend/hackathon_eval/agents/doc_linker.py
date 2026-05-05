"""Map detected issue classes to Fetch.ai docs and snippets."""

from __future__ import annotations

from typing import Any

DOC_LINKS = {
    "uagents_missing": "https://innovationlab.fetch.ai/resources/docs/agent-creation/uagent-creation",
    "chat_protocol_invalid": "https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol",
    "payment_protocol_invalid": "https://innovationlab.fetch.ai/resources/docs/examples/integrations/stripe-integration",
    "llm_missing": "https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-getting-started",
    "langchain_adapter": "https://innovationlab.fetch.ai/resources/docs/examples/adapters/langgraph-adapter-example",
    "agentverse": "https://innovationlab.fetch.ai/resources/docs/agentverse/agentverse",
    "mcp_integration": "https://innovationlab.fetch.ai/resources/docs/mcp-integration/what-is-mcp",
    "asi1_chat_completion": "https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-chat-completion",
}

_EXAMPLES = {
    "uagents_missing": "from uagents import Agent\nagent = Agent(name='my_agent', seed='...')",
    "chat_protocol_invalid": "chat_proto = Protocol(spec=chat_protocol_spec)\nagent.include(chat_proto)",
    "payment_protocol_invalid": "@payment_proto.on_message(CommitPayment)\nasync def on_commit(ctx, sender, msg): ...",
    "llm_missing": "from openai import OpenAI\nclient = OpenAI(base_url='https://api.asi1.ai/v1', api_key=token)",
}


def _issue_key(issue: str) -> str | None:
    s = issue.lower()
    if "uagent" in s:
        return "uagents_missing"
    if "chat" in s:
        return "chat_protocol_invalid"
    if "payment" in s:
        return "payment_protocol_invalid"
    if "llm" in s or "asi" in s:
        return "llm_missing"
    return None


def build_doc_links(issues: list[str], deep_analysis: dict[str, Any] | None = None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for issue in issues:
        key = _issue_key(issue)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "issue_type": key,
                "doc_url": DOC_LINKS[key],
                "explanation": "Read this section to implement the required Fetch.ai pattern correctly. Focus on message schemas and handler flow ordering.",
                "snippet": _EXAMPLES.get(key, "# See linked docs for minimal valid implementation."),
            }
        )

    if deep_analysis and not out:
        out.append(
            {
                "issue_type": "langchain_adapter",
                "doc_url": DOC_LINKS["langchain_adapter"],
                "explanation": "This adapter guide helps when orchestrating LangGraph workflows with Fetch.ai protocols.",
                "snippet": "from langgraph.graph import StateGraph\n# adapter pattern ...",
            }
        )
    return out

