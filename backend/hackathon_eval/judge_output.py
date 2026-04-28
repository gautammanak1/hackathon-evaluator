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
        description="User/market problem or pain this repo targets (1–3 sentences); say if unknown.",
    )
    solution_overview: str = Field(
        default="",
        description="How this codebase addresses that problem with agents/protocols/LLM (2–5 sentences), grounded in evidence.",
    )
    scores: AxisScores
    benchmark_reason: str = Field(
        description="Must restate cosine similarity / closest_match from BENCHMARK JSON.",
    )
    summary: str
    notes: str
    chat_protocol_details: str
    asi_llm_details: str
    payment_details: str
