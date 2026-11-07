"""Evaluate one conversation: compile prompt -> LLM -> validate (one retry) -> raw per-criterion results.

Raw results are stored as-is; scores are always computed by app.scorer.
"""
from app import llm
from app.prompt import build_system, build_user
from app.transcript import prepare


def validate(checklist, data, valid_ids):
    """Returns (results by criterion id, list of errors). Invalid entries are left out."""
    criteria = {c["id"]: c for c in checklist["criteria"]}
    results, errors, seen = {}, [], set()
    for r in data.get("results", []):
        cid = r.get("criterion_id")
        c = criteria.get(cid)
        if c is None:
            errors.append(f"неизвестный критерий {cid!r}")
            continue
        if cid in seen:
            errors.append(f"критерий {cid} оценён дважды")
            continue
        seen.add(cid)
        bad = [e for e in (r.get("evidence_ids") or []) + (r.get("checked_range") or []) if e not in valid_ids]
        if bad:
            errors.append(f"критерий {cid}: несуществующие реплики {bad}")
            continue
        if not r.get("applicable", True):
            if not c.get("na_allowed"):
                errors.append(f"критерий {cid}: N/A не допускается")
                continue
            results[cid] = {**r, "answer": None, "step": None, "subtypes": []}
            continue
        if c["type"] == "scale":
            steps = {s["value"] for s in c["scale"]}
            if r.get("step") not in steps:
                errors.append(f"критерий {cid}: ступень {r.get('step')!r} не из шкалы {sorted(steps)}")
                continue
            step = int(r["step"]) if float(r["step"]).is_integer() else r["step"]
            results[cid] = {**r, "answer": None, "step": step, "subtypes": []}
            continue
        if r.get("answer") not in ("yes", "no"):
            errors.append(f"критерий {cid}: answer должен быть yes или no")
            continue
        subtypes = r.get("subtypes") or []
        allowed = {s["id"] for s in c.get("subtypes") or []}
        if c["type"] == "flag" and r["answer"] == "yes" and allowed and not set(subtypes) <= allowed:
            errors.append(f"критерий {cid}: подтипы {subtypes} не из списка {sorted(allowed)}")
            continue
        results[cid] = {**r, "step": None, "subtypes": subtypes if r["answer"] == "yes" else []}
    errors += [f"критерий {cid} не оценён" for cid in criteria if cid not in seen]
    return results, errors


def evaluate(checklist, record, call=None):
    """Returns {"raw", "status", "errors", "model", "usage", "cost_usd", "latency_ms"}."""
    call = call or llm.call
    msgs = prepare(record)
    valid_ids = {m["id"] for m in msgs}
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
