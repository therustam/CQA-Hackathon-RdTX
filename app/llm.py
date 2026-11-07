"""Claude adapter: one structured-output call per conversation, with token usage and cost."""
import json
import os
import time
from pathlib import Path

import anthropic

SCHEMA = json.loads((Path(__file__).parent.parent / "contracts" / "llm_output.schema.json").read_text("utf-8"))

# USD per 1M tokens: input, output, cache read. Cache writes cost 1.25x input.
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}
# models that accept server-side refusal fallbacks (fallbacks="default")
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


class LLMError(Exception):
    pass


def model_name():
    return os.getenv("CQA_MODEL", "claude-opus-5-5")


def cost_usd(model, usage):
    price_in, price_out, price_cache = PRICES.get(model, PRICES["claude-opus-5-5"])
    return round((usage["input_tokens"] * price_in + usage["cache_write_tokens"] * price_in * 1.25
                  + usage["cache_read_tokens"] * price_cache + usage["output_tokens"] * price_out) / 1e6, 5)


def call(system, user):
    """Returns {"data", "usage", "model", "latency_ms"}; raises LLMError on refusal/truncation."""
    model = model_name()
    extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"} if model in FALLBACK_MODELS else {}
    started = time.monotonic()
    resp = anthropic.Anthropic().beta.messages.create(
        model=model,
        max_tokens=16000,
        # stable per checklist version -> cached across a batch
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_config={"effort": os.getenv("CQA_EFFORT", "medium"),
                       "format": {"type": "json_schema", "schema": SCHEMA}},
        **extra,
    )
    if resp.stop_reason == "refusal":
        raise LLMError(f"model refused: {getattr(resp.stop_details, 'category', None)}")
    if resp.stop_reason == "max_tokens":
        raise LLMError("response truncated at max_tokens")
    u = resp.usage
    usage = {"input_tokens": u.input_tokens or 0, "output_tokens": u.output_tokens or 0,
             "cache_write_tokens": u.cache_creation_input_tokens or 0,
             "cache_read_tokens": u.cache_read_input_tokens or 0}
    text = next(b.text for b in resp.content if b.type == "text")
    return {"data": json.loads(text), "usage": usage, "model": resp.model,
            "latency_ms": int((time.monotonic() - started) * 1000)}
