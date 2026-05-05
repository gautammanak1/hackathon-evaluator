# Correct Fetch.ai Protocol Implementations

## Minimal uAgent with Chat Protocol (Python 3.11+)

```python
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

agent = Agent(name="my_agent", seed="your_seed_phrase_here")
chat_proto = Protocol(spec=chat_protocol_spec)

@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=msg.timestamp, acknowledged=True))
    for item in msg.content:
        if isinstance(item, TextContent):
            await ctx.send(
                sender,
                ChatMessage(
                    timestamp=msg.timestamp,
                    msg_id=ctx.session_id,
                    content=[TextContent(type="text", text=f"Received: {item.text}")],
                ),
            )

agent.include(chat_proto)

if __name__ == "__main__":
    agent.run()
```

## Payment Protocol Integration

```python
from uagents import Context, Protocol
from uagents_core.contrib.protocols.payment import CommitPayment, CompletePayment, RequestPayment

payment_proto = Protocol(name="payment")

@payment_proto.on_message(RequestPayment)
async def on_request(ctx: Context, sender: str, msg: RequestPayment):
    await ctx.send(sender, CommitPayment(transaction_id=msg.transaction_id))

@payment_proto.on_message(CommitPayment)
async def on_commit(ctx: Context, sender: str, msg: CommitPayment):
    await ctx.send(sender, CompletePayment(transaction_id=msg.transaction_id))
```

## LangGraph + uAgents Adapter

```python
from langgraph.graph import StateGraph
from uagents import Agent

agent = Agent(name="graph_agent", seed="seed phrase")
graph = StateGraph(dict)
# configure nodes and compile graph
```

## ASI-1 LLM Chat Completion

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_ASI1_KEY", base_url="https://api.asi1.ai/v1")
resp = client.chat.completions.create(
    model="asi1-mini",
    messages=[{"role": "user", "content": "Explain Fetch.ai agent chat protocol quickly."}],
)
print(resp.choices[0].message.content)
```
