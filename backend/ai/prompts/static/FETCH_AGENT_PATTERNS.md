# Essential Fetch.ai agent patterns (for evaluators)

## uAgents imports

```python
from uagents import Agent, Context, Protocol, Bureau
```

## Chat protocol (ASI:One compatible)

```python
from uagents_core.contrib.protocols.chat import (
    ChatMessage,
    ChatAcknowledgement,
    TextContent,
    chat_protocol_spec,
)
```

## Payment protocol

```python
from uagents_core.contrib.protocols.payment import (
    RequestPayment,
    CommitPayment,
    payment_protocol_spec,
)
```

## LangGraph + uAgents adapter (common hackathon pattern)

```python
from langgraph.prebuilt import chat_agent_executor
from langchain_openai import ChatOpenAI
from uagents_adapter import LangchainRegisterTool
```

Look for: `LangchainRegisterTool`, `create_tool_calling_executor`, `LanggraphRegisterTool`-style registration, `mailbox=True`, `AGENTVERSE` API keys.

## Adapters

```python
from uagents_adapter import LangchainRegisterTool, CrewaiRegisterTool, MCPServerAdapter
```

## ASI endpoints (string identifiers in examples)

References like `OPENAI_AGENT = 'agent1q...'` or `asi1` API hosts in client code count toward LLM integration **only** with surrounding HTTP/SDK usage.
