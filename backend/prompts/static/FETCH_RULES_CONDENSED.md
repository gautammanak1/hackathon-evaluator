# Fetch.ai development quick reference (condensed)

> Full official docs live on https://innovationlab.fetch.ai — see `FETCH_OFFICIAL_LINKS.md` in this folder.

## Pinned versions (hackathon baseline)

```bash
pip install uagents==0.22.5
pip install langchain==0.3.23 langchain-openai==0.2.14
pip install langgraph==0.3.20
pip install uagents-adapter==0.4.0
```

## Core imports

```python
from uagents import Agent, Context, Protocol, Bureau, Model
from uagents_core.contrib.protocols.chat import (
    ChatMessage,
    ChatAcknowledgement,
    TextContent,
    chat_protocol_spec,
)
from uagents_core.contrib.protocols.payment import (
    RequestPayment,
    CommitPayment,
    payment_protocol_spec,
)
```

## Adapter imports (LangGraph / LangChain bridge)

```python
from uagents_adapter import LangchainRegisterTool, CrewaiRegisterTool, MCPServerAdapter
```

## LangGraph + uAgents (typical wrapper)

Use `langgraph.prebuilt.chat_agent_executor.create_tool_calling_executor`, wrap in a **plain function**, register with `LangchainRegisterTool` — aligns with Innovation Labs adapter examples.

## Evaluation hints for judges

- **uAgents**: real `Agent()`, handlers, protocols — not README-only.
- **Chat protocol**: `chat_protocol_spec` / `ChatMessage` handling vs raw HTTP only.
- **ASI / LLM**: OpenAI/ASI client + usage, LangChain/LangGraph pipelines.
- **Payments**: `payment_protocol_spec` / `RequestPayment` / `CommitPayment` or documented Stripe + wallet flows tied to agents.

## Security / ops

- Validate inputs; rate-limit external LLM calls; never execute untrusted code in production evaluators.
