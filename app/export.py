"""Submission file in the organizers' results format 1.0: one record per conversation.

Criterion codes come from the checklist (`export_id`), the total and the flag from app.scorer.
Exports the AI's own answers; reviewer overrides are not applied.
"""
import json
import os
import math

from app import db
from app.scorer import score


def export_ids(checklist):
    """criterion id -> export code. Checklist versions saved before export_id existed fall back to the default."""
    default = {c["id"]: c.get("export_id") for c in json.loads(db.DEFAULT_CHECKLIST.read_text("utf-8"))["criteria"]}
    return {c["id"]: c.get("export_id") or default.get(c["id"]) or c["id"] for c in checklist["criteria"]}


def turns(message_ids):
    """m{i} -> i + 1: 1-based position in the source transcript array (client, bot and events included)."""
    return sorted({int(x[1:]) + 1 for x in message_ids if x[:1] == "m" and x[1:].isdigit()})


def _error(cid, text):
    return {"conversation_id": cid, "status": "error", "criteria": [], "score": None, "error": text}


def record(checklist, cid, ev):
    if ev is None:
        return _error(cid, "Диалог не оценён.")
    if ev["status"] != "ok" or ev.get("errors"):
        return _error(cid, "; ".join(ev.get("errors") or []) or "Не удалось получить ответ модели.")
    raw = ev["raw"] or {}
    missing = [c["id"] for c in checklist["criteria"] if c["id"] not in raw]
    if missing:
        return _error(cid, f"Модель не дала корректного ответа по критериям {', '.join(missing)}.")
    codes, criteria = export_ids(checklist), []
    for c in checklist["criteria"]:
        r = raw[c["id"]]
        if not r.get("applicable", True):
            value = None
        elif c["type"] == "scale":
            value = r["step"]
        else:
            value = r["answer"] == "yes"
        criteria.append({"criterion_id": codes[c["id"]], "value": value,
                         "rationale": r.get("explanation") or r.get("na_reason") or "",
                         "evidence_turns": turns(r.get("evidence_ids") or r.get("checked_range") or [])})
    s = score(checklist, raw)
    return {"conversation_id": cid, "status": "ok", "criteria": criteria,
            "score": {"final_score": s["total"], "critical_flag": bool(s["flags"])}}


def best_evaluation(cid, checklist_id):
    """Latest complete evaluation, else the latest attempt (so failures are reported, not hidden)."""
    row = (db.one("select max(id) id from evaluations where conversation_id=? and checklist_id=? and status='ok'",
                  (cid, checklist_id))["id"] or db.latest_evaluation_id(cid, checklist_id))
    return db.evaluation(row) if row else None


def document(cl, conversation_ids, team=None):
    evs = {cid: best_evaluation(cid, cl["id"]) for cid in sorted(set(conversation_ids))}
    models = sorted({ev["model"] for ev in evs.values() if ev and ev.get("model")})
    rows = []
    for cid, ev in evs.items():
        source = db.conversation(cid)
        rows.append(_error(cid, source["import_error"]) if source and source.get("import_error")
                    else record(cl["data"], cid, ev))
    return {"schema_version": "1.0",
            "team_name": team or os.getenv("CQA_TEAM_NAME", ""),
            # shortcut: app.llm only calls cloud APIs; change mode if a local model is added
            "model": {"mode": "external_api", "name": ", ".join(models)},
            "results": rows}


def problems(doc, *, expected_ids=None, transcript_lengths=None, expect=None):
    """Validate submission 1.0 against the organizers' initial checklist, not an edited version.

    Valid error records are part of the submission, not format errors.
    """
    default = json.loads(db.DEFAULT_CHECKLIST.read_text("utf-8"))
    required = {c["export_id"]: c for c in default["criteria"]}
    out, seen = [], set()
    if not isinstance(doc, dict):
        return ["ожидался объект результатов"]
    if doc.get("schema_version") != "1.0":
        out.append("нужен schema_version 1.0")
    if not isinstance(doc.get("team_name"), str) or not doc["team_name"].strip():
        out.append("team_name пуст")
    model = doc.get("model") or {}
    if not isinstance(model, dict) or model.get("mode") not in ("local", "external_api", "hybrid") or not isinstance(model.get("name"), str) or not model["name"].strip():
        out.append("нужно указать режим и название использованной модели")
    records = doc.get("results")
    if not isinstance(records, list):
        return out + ["results должен быть массивом"]
    if expect is not None and len(records) != expect:
        out.append(f"записей {len(records)}, требуется {expect}")
    for r in records:
        if not isinstance(r, dict) or not isinstance(r.get("conversation_id"), str) or not r["conversation_id"]:
            out.append("нет conversation_id")
            continue
        cid = r["conversation_id"]
        if cid in seen:
            out.append(f"{cid}: повторяющийся ID")
        seen.add(cid)
        if r.get("status") == "error":
            if (r.get("criteria") != [] or "score" not in r or r.get("score") is not None
                    or not isinstance(r.get("error"), str) or not r["error"].strip()):
                out.append(f"{cid}: некорректная запись error")
            continue
        if r.get("status") != "ok" or not isinstance(r.get("criteria"), list):
            out.append(f"{cid}: некорректный status или criteria")
            continue
        criteria = r["criteria"]
        codes = [c.get("criterion_id") for c in criteria if isinstance(c, dict)]
        if (len(criteria) != len(required) or len(codes) != len(required)
                or any(not isinstance(c, str) for c in codes) or set(codes) != set(required)):
            out.append(f"{cid}: нужны все коды критериев организаторов ровно по одному")
            continue
        raw = {}
        for c in criteria:
            meta, value = required[c["criterion_id"]], c.get("value")
            valid = (meta["na_allowed"] if value is None else
                     type(value) in (int, float) and value in [s["value"] for s in meta["scale"]]
                     if meta["type"] == "scale" else type(value) is bool)
            if "value" not in c or not valid:
                out.append(f"{cid}: недопустимое значение {c['criterion_id']}")
                continue
            raw[meta["id"]] = {"applicable": value is not None,
                               "answer": ("yes" if value else "no") if type(value) is bool else None,
                               "step": value if meta["type"] == "scale" else None}
            evidence = c.get("evidence_turns")
            limit = (transcript_lengths or {}).get(cid)
            if (not isinstance(c.get("rationale"), str) or not c["rationale"].strip()
                    or not isinstance(evidence, list) or not evidence
                    or any(type(t) is not int or t < 1 or (limit is not None and t > limit) for t in evidence)):
                out.append(f"{cid}: нужны обоснование и допустимые номера реплик для {c['criterion_id']}")
        if len(raw) == len(required):
            computed = score(default, raw)
            supplied = r.get("score") or {}
            if not isinstance(supplied, dict):
                out.append(f"{cid}: score должен быть объектом")
                continue
            total = supplied.get("final_score")
            if (type(total) not in (int, float) or not math.isfinite(total) or not 0 <= total <= 100
                    or total != computed["total"] or type(supplied.get("critical_flag")) is not bool
                    or supplied["critical_flag"] != bool(computed["flags"])):
                out.append(f"{cid}: итог или флаг не соответствует ответам по исходному чек-листу")
    if expected_ids is not None and seen != set(expected_ids):
        out.append("ID результатов не совпадают с исходным набором")
    return out
