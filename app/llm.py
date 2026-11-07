"""Provider adapter: one structured-output call per conversation, with token usage and cost."""
import json
import os
import time
from pathlib import Path

import anthropic
import openai

SCHEMA = json.loads((Path(__file__).parent.parent / "contracts" / "llm_output.schema.json").read_text("utf-8"))

# USD per 1M tokens: input, output, cache read. Cache writes cost 1.25x input.
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "gpt-4o-mini": (0.15, 0.60, 0.00),
}
# models that accept server-side refusal fallbacks (fallbacks="default")
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


class LLMError(Exception):
    pass


def provider_name():
    """Select the provider from configured credentials; OpenAI wins if both are set."""
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    return ""


def model_name():
    configured = os.getenv("CQA_MODEL")
    provider = provider_name()
    if configured and ((provider == "openai" and configured.startswith(("gpt-", "o")))
                       or (provider == "anthropic" and configured.startswith("claude-"))):
        return configured
    return "gpt-4o-mini" if provider == "openai" else "claude-opus-5-5"


def cost_usd(model, usage):
    price_in, price_out, price_cache = PRICES.get(model, PRICES["claude-opus-5-5"])
    return round((usage["input_tokens"] * price_in + usage["cache_write_tokens"] * price_in * 1.25
                  + usage["cache_read_tokens"] * price_cache + usage["output_tokens"] * price_out) / 1e6, 5)


def call(system, user):
    """Returns {"data", "usage", "model", "latency_ms"}; raises LLMError on refusal/truncation."""
    provider = provider_name()
    model = model_name()
    if not provider:
        raise LLMError("no model API key configured: set OPENAI_API_KEY or ANTHROPIC_API_KEY")
    extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"} if model in FALLBACK_MODELS else {}
    started = time.monotonic()
    # SDK retries transient failures; the stable system prompt is cached where supported.
    if provider == "openai":
        response = openai.OpenAI(max_retries=4).responses.create(
            model=model,
            input=[{"role": "system", "content": system},
                   {"role": "user", "content": user}],
            max_output_tokens=16000,
            text={"format": {"type": "json_schema", "name": "cqa_output",
                             "strict": True, "schema": SCHEMA}},
        )
        if response.status == "incomplete":
            raise LLMError(f"response incomplete: {getattr(response.incomplete_details, 'reason', None)}")
        u = response.usage
        usage = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0,
                 "cache_write_tokens": 0, "cache_read_tokens": getattr(u, "input_tokens_details", None)
                 and getattr(u.input_tokens_details, "cached_tokens", 0) or 0}
        text = response.output_text
        response_model = response.model
    else:
        response = anthropic.Anthropic(max_retries=4).beta.messages.create(
            model=model,
            max_tokens=16000,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_config={"effort": os.getenv("CQA_EFFORT", "medium"),
                           "format": {"type": "json_schema", "schema": SCHEMA}},
            **extra,
        )
        if response.stop_reason == "refusal":
            raise LLMError(f"model refused: {getattr(response.stop_details, 'category', None)}")
        if response.stop_reason == "max_tokens":
            raise LLMError("response truncated at max_tokens")
        u = response.usage
        usage = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0,
                 "cache_write_tokens": u.cache_creation_input_tokens or 0,
                 "cache_read_tokens": u.cache_read_input_tokens or 0}
        text = next(b.text for b in response.content if b.type == "text")
        response_model = response.model
    return {"data": json.loads(text), "usage": usage, "model": response_model,
            "latency_ms": int((time.monotonic() - started) * 1000)}
