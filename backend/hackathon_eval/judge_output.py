"""Structured LLM output for strict hackathon judging."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AxisScores(BaseModel):
    architecture: int = Field(default=5, ge=0, le=10, description="Architecture quality 0-10")
    protocols: int = Field(default=5, ge=0, le=10, description="Protocol correctness 0-10")
    ai_usage: int = Field(default=5, ge=0, le=10, description="Real AI / LLM usage 0-10")
    code_quality: int = Field(default=5, ge=0, le=10)
    innovation: int = Field(default=5, ge=0, le=10)


class JudgeLLMOutput(BaseModel):
    classification: str = Field(
        description="One of: Good, Average, Poor (optionally Excellent if justified).",
    )
    problem_solved: str = Field(
        default="",
        description=(
            "User/market problem or pain this repo targets, in 3–5 sentences. "
            "Cite which file or module conveys the intent (README.md, agent docstring, etc.). "
            "If genuinely unclear from the excerpt, say so explicitly — do not invent a problem."
        ),
    )
    solution_overview: str = Field(
        default="",
        description=(
            "How this codebase addresses that problem with agents / protocols / LLM, "
            "in 5–8 sentences. Walk through the high-level pipeline: entry point → agents/handlers → "
            "protocols invoked → LLM calls → external integrations → output. Reference concrete files. "
            "Avoid generic praise."
        ),
    )
    scores: AxisScores
    benchmark_reason: str = Field(
        description="Must restate cosine similarity / closest_match from BENCHMARK JSON.",
    )
    summary: str = Field(
        description=(
            "DETAILED narrative summary, MUST be five labelled paragraphs separated by blank lines, "
            "in EXACTLY this order and with EXACTLY these markdown headers (verbatim, including the "
            "asterisks):\n\n"
            "**Problem this project solves**\n"
            "<2-4 sentences describing the real-world / user pain the repo targets, citing the file or "
            "doc (README.md, agent docstring, demo script) where this intent is communicated. If genuinely "
            "unclear, say so — do not invent a problem.>\n\n"
            "**The idea & approach**\n"
            "<3-5 sentences describing the conceptual design: which agents/services exist, how they hand "
            "messages to each other, what the LLM is asked to do, and which Fetch.ai primitives "
            "(uAgents, ChatProtocol, Payment Protocol, Agentverse, ASI:One) are intended to be used.>\n\n"
            "**How it is built**\n"
            "<3-6 sentences describing the actual architecture you can see in the code: language(s), "
            "framework versions, key files (with paths), entry point, message flow, LLM provider "
            "(must be ASI:One; flag plain OpenAI/Anthropic/Gemini as a defect to migrate), frontend stack, "
            "datastore. Reference real file paths — do not invent symbols.>\n\n"
            "**Notable strengths (with code evidence)**\n"
            "<2-4 sentences listing the strongest things about the implementation, each one grounded in a "
            "concrete file/symbol citation. No generic praise.>\n\n"
            "**Critical risks & next-step recommendation**\n"
            "<2-4 sentences listing the most important risks or gaps a developer must fix to ship, "
            "ending with one concrete next-step recommendation.>\n\n"
            "Hard rules: write in clean prose paragraphs (NOT bullet points), keep each section under "
            "120 words, do NOT collapse the five sections, never echo the deterministic JSON back "
            "unchanged. The five **Header** lines must appear exactly as shown so the frontend can render "
            "them as bold subheadings."
        ),
    )
    notes: str = Field(
        description=(
            "Auxiliary observations that did not fit the structured fields: codebase size, "
            "language mix, notable patterns, and any caveats about the analysis itself. "
            "3–6 sentences."
        ),
    )
    chat_protocol_details: str
    asi_llm_details: str
    payment_details: str
