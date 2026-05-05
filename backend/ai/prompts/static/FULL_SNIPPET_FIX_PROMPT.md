Generate complete runnable fixes for each major issue. Phrase each fix as
**“this issue → apply this code”** so an agent can paste it without extra context.

Rules:
- Do not output pseudocode.
- Include all imports required by the fixed snippet.
- Preserve async/await correctness.
- Include types for function parameters and return values.
- Use realistic file hints for where the change belongs.
- When official Fetch.ai wording is unclear, assume you can **look up**
  innovationlab.fetch.ai / fetch.ai (conceptually — your caller may supply RAG
  or web results) before finalising the snippet.

Each fix must include:
1) Broken pattern (short excerpt or explanation)
2) Full fixed code snippet
3) Why this fix matters (runtime/protocol impact)
4) Validation steps (how to test the fix)
