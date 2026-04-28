# Hackathon evaluation rubric (Fetch.ai / ASI:One)

## uAgents (2 points)

**Pass:** `import uagents` or equivalent; at least one `Agent(` instance; handlers or protocols wired (not a dead import).

**Partial / fail:** Only README mention; import without `Agent()`; `Agent()` with no `@agent.on_message`, protocol, or event handlers.

## Chat protocol (2 points)

**Pass:** `chat_protocol_spec` and/or `uagents_core.contrib.protocols.chat` message models; handlers processing `ChatMessage` / structured content.

**Weak:** HTTP-only API (FastAPI/Flask) without uAgents chat models when project claims an ASI agent.

## ASI:One / LLM (2 points)

**Pass:** OpenAI / ASI client usage, LangChain or LangGraph pipelines with real calls; adapter patterns (`uagents_adapter`, LangGraph executor) when present.

**Weak:** Only strings like “GPT” in docs; no SDK imports.

## Payment protocol (2 points)

**Pass:** `payment_protocol_spec`, `RequestPayment` / `CommitPayment`, MoneyDevKit references, or Stripe + wallet flow clearly tied to agent commerce.

**Weak:** Stripe keyword only in frontend with no protocol / agent flow.

## Code quality & structure (2 points)

**Pass:** Multiple modules, separation (e.g. `protocols/`), tests, clear config; reasonable file count and tech stack variety.

**Weak:** Single-file stub; almost empty repo; only assets.

## Anti–false-positive rules

- Do **not** mark chat protocol pass from generic WebSockets alone.
- Do **not** mark payment pass from the word “wallet” in unrelated blockchain boilerplate.
- Require **co-location** of signals (same area of codebase or clear integration path) for “implemented”.
