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
    return {"total": _num(sum(b.values(), ZERO) * HUNDRED / total_w) if total_w else None,
            "complete": all(x["status"] != "missing" for x in rows),
            "flags": flags, "criteria": rows, "sections": sections}
