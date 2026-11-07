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
    "gpt-6-luna": (0.10, 0.50, 0.01),
    "gpt-4o-mini": (0.15, 0.60, 0.075),
}
# models that accept server-side refusal fallbacks (fallbacks="default")
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


# SDK default is 600 s: a stalled request blocked a worker for 10 min before the retry.
# Normal evaluations take 15-40 s (calls included), so 120 s leaves 3x headroom.
TIMEOUT_S = 120


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
    return "gpt-6-luna" if provider == "openai" else "claude-opus-5-5"


def price(model):
    """Providers return dated names (gpt-4o-mini-2024-07-18): match the longest known prefix."""
    known = [k for k in PRICES if (model or "").startswith(k)]
    return PRICES[max(known, key=len)] if known else PRICES["claude-opus-5-5"]


def cost_usd(model, usage):
    price_in, price_out, price_cache = price(model)
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
        # gpt-4o-family models reject the reasoning parameter
        reasoning = {} if model.startswith("gpt-4") else {"reasoning": {"effort": os.getenv("CQA_EFFORT", "medium")}}
        response = openai.OpenAI(max_retries=4, timeout=TIMEOUT_S).responses.create(
            model=model,
            input=[{"role": "system", "content": system},
                   {"role": "user", "content": user}],
            max_output_tokens=16000,
            text={"format": {"type": "json_schema", "name": "cqa_output",
                             "strict": True, "schema": SCHEMA}},
            **reasoning,
        )
        if response.status == "incomplete":
            raise LLMError(f"response incomplete: {getattr(response.incomplete_details, 'reason', None)}")
        if response.status != "completed":
            raise LLMError(f"response failed: {response.status}")
        u = response.usage
        cached = getattr(getattr(u, "input_tokens_details", None), "cached_tokens", 0) or 0
        # OpenAI's input_tokens already include the cached ones; keep the two buckets disjoint
        usage = {"input_tokens": (u.input_tokens or 0) - cached, "output_tokens": u.output_tokens or 0,
                 "cache_write_tokens": 0, "cache_read_tokens": cached}
        text = response.output_text
        response_model = response.model
    else:
        response = anthropic.Anthropic(max_retries=4, timeout=TIMEOUT_S).beta.messages.create(
            model=model,
            max_tokens=16000,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_config={"effort": os.getenv("CQA_EFFORT", "medium"),
                           "format": {"type": "json_schema", "schema": SCHEMA}},
            **extra,
        )
        if response.stop_reason == "refusal":
            raise LLMError(f"model refused: {getattr(getattr(response, 'stop_details', None), 'category', None)}")
        if response.stop_reason == "max_tokens":
            raise LLMError("response truncated at max_tokens")
        u = response.usage
        usage = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0,
                 "cache_write_tokens": u.cache_creation_input_tokens or 0,
                 "cache_read_tokens": u.cache_read_input_tokens or 0}
        text = next((b.text for b in response.content if b.type == "text"), None)
        response_model = response.model
    if not isinstance(text, str) or not text.strip():
        raise LLMError("model returned no text (possibly a refusal)")
    try:
        data = json.loads(text)
    except ValueError as e:
        raise LLMError("model returned invalid JSON") from e
    return {"data": data, "usage": usage, "model": response_model,
            "latency_ms": int((time.monotonic() - started) * 1000)}
