# Fetch.ai Innovation Lab — official documentation URLs

Use these as the canonical references when judging hackathon projects (uAgents, chat protocol, ASI:One, payments, adapters).

## Core

- Introduction: https://innovationlab.fetch.ai/resources/docs/intro

## Agent creation

- uAgent creation: https://innovationlab.fetch.ai/resources/docs/agent-creation/uagent-creation
- SDK creation: https://innovationlab.fetch.ai/resources/docs/agent-creation/sdk-creation
- uAgents adapter guide: https://innovationlab.fetch.ai/resources/docs/agent-creation/uagents-adapter-guide

## Agent communication

- Agent Chat Protocol: https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol
- uAgent ↔ uAgent: https://innovationlab.fetch.ai/resources/docs/agent-communication/uagent-uagent-communication
- SDK ↔ uAgent: https://innovationlab.fetch.ai/resources/docs/agent-communication/sdk-uagent-communication
- SDK ↔ SDK: https://innovationlab.fetch.ai/resources/docs/agent-communication/sdk-sdk-communication

## Agentverse

- Overview: https://innovationlab.fetch.ai/resources/docs/agentverse/agentverse
- API key: https://innovationlab.fetch.ai/resources/docs/agentverse/agentverse-api-key
- Searching agents: https://innovationlab.fetch.ai/resources/docs/agentverse/searching
- Agentverse-based applications: https://innovationlab.fetch.ai/resources/docs/agentverse/agentverse-based-application

## ASI:One (mini / LLM)

- ASI:One Mini introduction: https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-introduction
- Getting started: https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-getting-started
- API reference: https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-api-reference
- Chat completion: https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-chat-completion
- Function calling: https://innovationlab.fetch.ai/resources/docs/asione/asi1-mini-function-calling

## MCP

- What is MCP: https://innovationlab.fetch.ai/resources/docs/mcp-integration/what-is-mcp

## Examples (representative)

- On-chain agents: https://innovationlab.fetch.ai/resources/docs/examples/on-chain-examples/on-chain-agents
- LangChain: https://innovationlab.fetch.ai/resources/docs/examples/other-frameworks/langchain
- LangGraph adapter: https://innovationlab.fetch.ai/resources/docs/examples/adapters/langgraph-adapter-example
- ASI1 compatible uAgents (chat protocol): https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi1-compatible-uagents
- Stripe integration: https://innovationlab.fetch.ai/resources/docs/examples/integrations/stripe-integration
- LangGraph MCP agent: https://innovationlab.fetch.ai/resources/docs/examples/mcp-integration/langgraph-mcp-agent-example

## Pin compatibility (hackathon / lab-tested combos)

```bash
pip install uagents==0.22.5
pip install langchain==0.3.23 langchain-openai==0.2.14
pip install langgraph==0.3.20
pip install uagents-adapter==0.4.0
```

When scoring: prefer evidence of these patterns in repo requirements/pyproject over stray dependencies.
