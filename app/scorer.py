"""Deterministic scoring (checklist page 2). Pure function: no LLM, no DB.

The LLM only answers per criterion; every number shown in the UI comes from here.
"""
from decimal import ROUND_HALF_UP, Decimal

HUNDRED = Decimal(100)
ZERO = Decimal(0)


def _num(d):
    return None if d is None else float(d.quantize(Decimal("0.01"), ROUND_HALF_UP))


def _fraction(c, r):
    """Share of the criterion's weight earned: 1/0 for yes/no, step/top-step for scales."""
    if c["type"] == "scale":
        steps = [Decimal(str(s["value"])) for s in c["scale"]]
        if r.get("step") is None or Decimal(str(r["step"])) not in steps:
            raise ValueError(f"criterion {c['id']}: step {r.get('step')!r} is not on the scale")
        return Decimal(str(r["step"])) / max(steps)
    if r.get("answer") not in ("yes", "no"):
        raise ValueError(f"criterion {c['id']}: answer {r.get('answer')!r} is not yes/no")
    return Decimal(1 if r["answer"] == "yes" else 0)


def score(checklist, raw, overrides=None):
    """raw / overrides: {criterion_id: {"applicable", "answer", "step", ...}}.

    Overrides (reviewer decisions) replace the AI fields; everything else is passed through.
    Only the total is rounded (half-up, 2 places); intermediate values stay exact.
    """
    overrides = overrides or {}
    rows, w, b = [], {}, {}
    for c in checklist["criteria"]:
        cid = c["id"]
        r = {**raw.get(cid, {}), **overrides.get(cid, {})}
        row = {**r, "id": cid, "title": c["title"], "section": c.get("section"), "type": c["type"],
               "weight": c.get("weight") or 0, "overridden": cid in overrides,
               "points": None, "redistributed_weight": None, "redistributed_points": None}
        if cid not in raw and cid not in overrides:
            row["status"] = "missing"
        elif not r.get("applicable", True):
            row["status"] = "na"
        elif c["type"] == "flag":
            row["status"] = "flag"
            if r.get("answer") != "yes":
                row["subtypes"] = []
        else:
            row["status"] = "scored"
            weight = Decimal(str(row["weight"]))
            if weight > 0:
                w[cid], b[cid] = weight, weight * _fraction(c, r)
        rows.append(row)

    total_w = sum(w.values(), ZERO)
    for row in rows:
        if row["id"] in w:
            row["points"] = _num(b[row["id"]])
            row["redistributed_weight"] = _num(w[row["id"]] * HUNDRED / total_w)
            row["redistributed_points"] = _num(b[row["id"]] * HUNDRED / total_w)

    sections = []
    for s in checklist.get("sections", []):
        ids = [x["id"] for x in rows if x["section"] == s["id"] and x["id"] in w]
        avail = sum((w[i] for i in ids), ZERO)
        earned = sum((b[i] for i in ids), ZERO)
        sections.append({"id": s["id"], "title": s["title"],
                         "earned": _num(earned * HUNDRED / total_w) if ids else None,
                         "available": _num(avail * HUNDRED / total_w) if ids else None,
                         "percent": _num(earned * HUNDRED / avail) if ids else None})

    flags = [{"criterion_id": x["id"], "title": x["title"], "subtypes": x.get("subtypes") or [],
              "evidence_ids": x.get("evidence_ids") or []}
             for x in rows if x["status"] == "flag" and x.get("answer") == "yes"]
    complete = all(x["status"] != "missing" for x in rows)
    return {"total": _num(sum(b.values(), ZERO) * HUNDRED / total_w) if total_w and complete else None,
            "complete": complete,
            "flags": flags, "criteria": rows, "sections": sections}


def _mean(values):
    values = [Decimal(str(v)) for v in values if v is not None]
    return _num(sum(values, ZERO) / len(values)) if values else None


def summarize(checklist, finals):
    """Overview aggregates. finals: [(attrs, score(...) result)] with attrs like {"language", "channel"}.

    Averages use the same half-up rounding as totals; a criterion "misses" when it earned less than
    its weight (scored) or was raised (flag).
    """
    totals = [f["total"] for _, f in finals if f["total"] is not None]
    buckets = {"low": 0, "mid": 0, "high": 0}
    for t in totals:
        buckets["low" if t < 70 else "mid" if t < 90 else "high"] += 1

    def by(key):
        groups = {}
        for attrs, f in finals:
            groups.setdefault(attrs.get(key), []).append(f["total"])
        return [{"key": k, "n": len(v), "avg": _mean(v)} for k, v in sorted(groups.items(), key=lambda kv: str(kv[0]))]

    criteria = []
    for c in checklist["criteria"]:
        rows = [r for _, f in finals for r in f["criteria"] if r["id"] == c["id"]]
        if c["type"] == "flag":
            judged = [r for r in rows if r["status"] == "flag"]
            missed, earned = sum(r.get("answer") == "yes" for r in judged), None
        else:
            judged = [r for r in rows if r["status"] == "scored" and r["points"] is not None]
            missed = sum(_fraction(c, r) < 1 for r in judged)
            weight = sum((Decimal(str(r["weight"])) for r in judged), ZERO)
            earned = _num(sum((Decimal(str(r["weight"])) * _fraction(c, r) for r in judged), ZERO) * HUNDRED / weight) if weight else None
        criteria.append({"id": c["id"], "title": c["title"], "section": c.get("section"), "type": c["type"],
                         "judged": len(judged), "na": sum(r["status"] == "na" for r in rows),
                         "missed": missed, "earned_percent": earned})
    return {"evaluated": len(finals), "scored": len(totals), "avg_total": _mean(totals),
            "flagged": sum(bool(f["flags"]) for _, f in finals), "buckets": buckets,
            "by_language": by("language"), "by_channel": by("channel"), "criteria": criteria}
