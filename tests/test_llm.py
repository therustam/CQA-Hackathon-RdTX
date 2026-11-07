from types import SimpleNamespace as NS
from unittest.mock import Mock

import pytest

from app import llm


def openai_response():
    return NS(status="completed", model="gpt-4o-mini", output_text='{"results":[]}',
              usage=NS(input_tokens=100, output_tokens=20, input_tokens_details=NS(cached_tokens=40)))


def test_openai_adapter_parameters_cache_and_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setenv("CQA_MODEL", "gpt-4o-mini")
    create = Mock(return_value=openai_response())
    factory = Mock(return_value=NS(responses=NS(create=create)))
    monkeypatch.setattr(llm.openai, "OpenAI", factory)
    result = llm.call("system", "user")
    assert llm.provider_name() == "openai"
    assert result["usage"] == {"input_tokens": 60, "output_tokens": 20, "cache_write_tokens": 0, "cache_read_tokens": 40}
    kwargs = create.call_args.kwargs
    assert kwargs["input"][0] == {"role": "system", "content": "system"}
    assert kwargs["text"]["format"]["schema"] == llm.SCHEMA and kwargs["text"]["format"]["strict"] is True
    assert "reasoning" not in kwargs
    assert factory.call_args.kwargs["timeout"] == llm.TIMEOUT_S


@pytest.mark.parametrize("status,text", [("incomplete", "{}"), ("failed", "{}"), ("completed", ""), ("completed", "invalid")])
def test_openai_rejects_incomplete_failure_refusal_and_bad_json(monkeypatch, status, text):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("CQA_MODEL", "gpt-4o-mini")
    response = openai_response()
    response.status, response.output_text = status, text
    response.incomplete_details = NS(reason="max_output_tokens")
    monkeypatch.setattr(llm.openai, "OpenAI", lambda **kw: NS(responses=NS(create=lambda **kw: response)))
    with pytest.raises(llm.LLMError):
        llm.call("system", "user")


@pytest.mark.parametrize("stop,content,success", [
    ("end_turn", [NS(type="text", text='{"results":[]}' )], True),
    ("refusal", [], False), ("max_tokens", [], False),
    ("end_turn", [], False), ("end_turn", [NS(type="text", text="invalid")], False),
])
def test_anthropic_adapter_and_failures(monkeypatch, stop, content, success):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setenv("CQA_MODEL", "claude-opus-5-5")
    response = NS(stop_reason=stop, content=content, model="claude-opus-5-5",
                  usage=NS(input_tokens=100, output_tokens=20, cache_creation_input_tokens=30, cache_read_input_tokens=40))
    create = Mock(return_value=response)
    monkeypatch.setattr(llm.anthropic, "Anthropic", lambda **kw: NS(beta=NS(messages=NS(create=create))))
    if success:
        result = llm.call("system", "user")
        assert result["data"] == {"results": []}
        assert result["usage"]["cache_write_tokens"] == 30 and result["usage"]["cache_read_tokens"] == 40
        assert create.call_args.kwargs["output_config"]["format"]["schema"] == llm.SCHEMA
        assert create.call_args.kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    else:
        with pytest.raises(llm.LLMError):
            llm.call("system", "user")


def test_missing_key_and_transport_failure(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(llm.LLMError):
        llm.call("system", "user")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    create = Mock(side_effect=TimeoutError("transport timeout"))
    monkeypatch.setattr(llm.openai, "OpenAI", lambda **kw: NS(responses=NS(create=create)))
    with pytest.raises(TimeoutError):
        llm.call("system", "user")
