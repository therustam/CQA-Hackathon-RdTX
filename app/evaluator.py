"""Evaluate one conversation: compile prompt -> LLM -> validate (one retry) -> raw per-criterion results.

Raw results are stored as-is; scores are always computed by app.scorer.
"""
import math

from app import llm
from app.prompt import build_system, build_user
from app.transcript import prepare


def validate(checklist, data, valid_ids):
    """Returns (results by criterion id, list of errors). Invalid entries are left out."""
    criteria = {c["id"]: c for c in checklist["criteria"]}
    results, errors, seen = {}, [], set()
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        return {}, ["ожидался объект с массивом results"]
    for r in data.get("results", []):
        if not isinstance(r, dict) or not isinstance(r.get("criterion_id"), str):
            errors.append("некорректная запись критерия")
            continue
        cid = r.get("criterion_id")
        c = criteria.get(cid)
        if c is None:
            errors.append(f"неизвестный критерий {cid!r}")
            continue
        if cid in seen:
            results.pop(cid, None)
            errors.append(f"критерий {cid} оценён дважды")
            continue
        seen.add(cid)
        required = llm.SCHEMA["properties"]["results"]["items"]["required"]
        if any(k not in r for k in required) or set(r) - set(required):
            errors.append(f"критерий {cid}: поля не соответствуют схеме")
            continue
        evidence, checked = r.get("evidence_ids"), r.get("checked_range")
        if (not isinstance(evidence, list) or not isinstance(checked, list)
                or any(not isinstance(x, str) for x in evidence + checked)
                or len(checked) not in (0, 2) or not (evidence or checked)):
            errors.append(f"критерий {cid}: нужны реплики-основания или границы проверенного участка")
            continue
        confidence = r.get("confidence")
        if (type(r.get("applicable")) is not bool
                or not isinstance(r.get("explanation"), str) or not r["explanation"].strip()
                or type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1
                or (r["na_reason"] is not None and not isinstance(r["na_reason"], str))
                or not isinstance(r["subtypes"], list) or any(not isinstance(s, str) for s in r["subtypes"])):
            errors.append(f"критерий {cid}: некорректное обоснование, применимость или confidence")
            continue
        bad = [e for e in (r.get("evidence_ids") or []) + (r.get("checked_range") or []) if e not in valid_ids]
        if bad:
            errors.append(f"критерий {cid}: несуществующие реплики {bad}")
            continue
        if not r.get("applicable", True):
            if not c.get("na_allowed"):
                errors.append(f"критерий {cid}: N/A не допускается")
                continue
            if not r.get("na_reason") or not r["na_reason"].strip():
                errors.append(f"критерий {cid}: нужна причина N/A")
                continue
            results[cid] = {**r, "answer": None, "step": None, "subtypes": []}
            continue
        if r["na_reason"] is not None:
            errors.append(f"критерий {cid}: причина N/A допустима только для N/A")
            continue
        if c["type"] == "scale":
            steps = {s["value"] for s in c["scale"]}
            if r["answer"] is not None or type(r.get("step")) not in (int, float) or r["step"] not in steps:
                errors.append(f"критерий {cid}: ступень {r.get('step')!r} не из шкалы {sorted(steps)}")
                continue
            step = int(r["step"]) if float(r["step"]).is_integer() else r["step"]
            results[cid] = {**r, "answer": None, "step": step, "subtypes": []}
            continue
        if r.get("answer") not in ("yes", "no") or r["step"] is not None:
            errors.append(f"критерий {cid}: answer должен быть yes или no")
            continue
        subtypes = r.get("subtypes") or []
        allowed = {s["id"] for s in c.get("subtypes") or []}
        if c["type"] == "flag" and r["answer"] == "yes" and allowed and (not subtypes or not set(subtypes) <= allowed):
            errors.append(f"критерий {cid}: подтипы {subtypes} не из списка {sorted(allowed)}")
            continue
        results[cid] = {**r, "step": None,
                        "subtypes": subtypes if c["type"] == "flag" and r["answer"] == "yes" else []}
    errors += [f"критерий {cid} не оценён" for cid in criteria if cid not in seen]
    return results, errors


def evaluate(checklist, record, call=None):
    """Returns {"raw", "status", "errors", "model", "usage", "cost_usd", "latency_ms"}."""
    call = call or llm.call
    msgs = prepare(record)
    valid_ids = {m["id"] for m in msgs if not m["duplicate"]}
    system = build_system(checklist)
    attempts, errors, results = [], None, {}
    for _ in range(2):  # one automatic retry with the validation errors fed back
        resp = call(system, build_user(record, msgs, errors))
        attempts.append(resp)
        results, errors = validate(checklist, resp["data"], valid_ids)
        if not errors:
            break
    usage = {k: sum(a["usage"][k] for a in attempts) for k in attempts[0]["usage"]}
    model = attempts[-1]["model"]
    return {"raw": results, "status": "needs_review" if errors else "ok", "errors": errors,
            "model": model, "usage": usage, "cost_usd": llm.cost_usd(model, usage),
            "latency_ms": sum(a["latency_ms"] for a in attempts)}
