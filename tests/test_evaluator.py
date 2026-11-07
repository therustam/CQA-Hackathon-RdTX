import json
from pathlib import Path

from app.evaluator import evaluate, validate
from tests.test_transcript import CHAT

CHECKLIST = json.loads((Path(__file__).parent.parent / "contracts" / "default_checklist.json").read_text("utf-8"))
IDS = {"m0", "m1", "m2", "m3"}


def item(cid, applicable=True, answer=None, step=None, evidence=("m3",), subtypes=()):
    return {"criterion_id": cid, "applicable": applicable, "na_reason": None if applicable else "условие",
            "answer": answer, "step": step, "subtypes": list(subtypes), "explanation": "…",
            "evidence_ids": list(evidence), "checked_range": [], "confidence": 0.9}


def good():
    return {"results": [item("01", answer="yes"), item("02", applicable=False), item("03", applicable=False),
                        item("04", step=20.0), item("05", answer="yes"), item("06", step=10),
                        item("07", answer="yes"), item("08", answer="no")]}


def fake(*responses):
    calls = []

    def call(system, user):
        calls.append(user)
        return {"data": responses[len(calls) - 1], "model": "claude-opus-5-5", "latency_ms": 10,
                "usage": {"input_tokens": 1000, "output_tokens": 500, "cache_write_tokens": 0, "cache_read_tokens": 0}}
    return call, calls


def test_validate_accepts_good_and_normalises_steps():
    results, errors = validate(CHECKLIST, good(), IDS)
    assert errors == []
    assert results["04"]["step"] == 20 and isinstance(results["04"]["step"], int)
    assert results["02"]["answer"] is None


def test_validate_rejects_bad_entries():
    data = good()
    data["results"][0] = item("01", applicable=False)            # N/A not allowed
    data["results"][3] = item("04", step=12)                     # not on scale
    data["results"][4] = item("05", answer="yes", evidence=["m99"])  # unknown message
    data["results"][7] = item("08", answer="yes", subtypes=["rudeness"])
    del data["results"][6]                                       # 07 missing
    results, errors = validate(CHECKLIST, data, IDS)
    assert set(results) == {"02", "03", "06"}
    assert len(errors) == 5


def test_evaluate_ok_and_cost():
    call, calls = fake(good())
    out = evaluate(CHECKLIST, CHAT, call)
    assert out["status"] == "ok" and len(calls) == 1 and len(out["raw"]) == 8
    assert out["cost_usd"] == round((1000 * 4 + 500 * 20) / 1e6, 5)


def test_evaluate_retries_once_with_errors_then_succeeds():
    bad = good()
    bad["results"][0] = item("01", answer="yes", evidence=["m42"])
    call, calls = fake(bad, good())
    out = evaluate(CHECKLIST, CHAT, call)
    assert out["status"] == "ok" and len(calls) == 2
    assert "m42" in calls[1] and out["usage"]["input_tokens"] == 2000


def test_evaluate_marks_needs_review_after_second_failure():
    bad = good()
    bad["results"][0] = item("01", answer="maybe")
    call, calls = fake(bad, bad)
    out = evaluate(CHECKLIST, CHAT, call)
    assert out["status"] == "needs_review" and "01" not in out["raw"] and len(out["raw"]) == 7
