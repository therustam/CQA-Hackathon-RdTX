"""HTTP API + static UI.  Run: uvicorn app.main:app --reload"""
import html
import json
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, wait
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from app import db, evaluator, importer, llm
from app.scorer import score
from app.transcript import prepare

load_dotenv()
db.init()
app = FastAPI(title="CQA — Conversation Quality Analytics")
WEB = Path(__file__).parent.parent / "web"


@app.middleware("http")
async def revalidate_ui(request, call_next):
    """Browsers otherwise cache cqa.js/cqa.css heuristically and show a stale UI after an update."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


# ---------- models (validation at the API boundary) ----------

class Step(BaseModel):
    value: int | float
    label: str = ""


class Subtype(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    label: str = ""


class Section(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1)


class Criterion(BaseModel):
    id: str = Field(min_length=1, max_length=20)
    section: str = ""
    title: str = Field(min_length=1)
    type: Literal["binary", "scale", "flag"]
    weight: int | float = Field(ge=0)
    na_allowed: bool = False
    rule: str = ""
    na_condition: str = ""
    guidance: str = ""
    scale: list[Step] = []
    subtypes: list[Subtype] = []

    @model_validator(mode="after")
    def _check(self):
        if self.type == "scale":
            values = [s.value for s in self.scale]
            if len(set(values)) < 2 or max(values) <= 0 or min(values) < 0:
                raise ValueError(f"критерий {self.id}: нужны минимум две разные ступени ≥ 0, верхняя > 0")
        else:
            self.scale = []
        if self.type == "flag":
            self.weight = 0
        return self


class Checklist(BaseModel):
    name: str = Field(min_length=1)
    instructions: str = ""
    sections: list[Section] = []
    criteria: list[Criterion] = Field(min_length=1)

    @model_validator(mode="after")
    def _check(self):
        ids = [c.id for c in self.criteria]
        if len(ids) != len(set(ids)):
            raise ValueError("идентификаторы критериев должны быть уникальны")
        sections = {s.id for s in self.sections}
        unknown = [c.id for c in self.criteria if c.section and c.section not in sections]
        if unknown:
            raise ValueError(f"критерии {unknown} ссылаются на несуществующую секцию")
        return self


class ImportReq(BaseModel):
    group_id: str = Field(min_length=1, max_length=100)


class EvaluateReq(BaseModel):
    conversation_id: str
    checklist_id: int | None = None
    force: bool = False


class BatchReq(BaseModel):
    group_id: str | None = None
    conversation_ids: list[str] | None = None
    checklist_id: int | None = None
    force: bool = False


class AppealReq(BaseModel):
    criterion_id: str
    comment: str = Field(min_length=1, max_length=4000)


class DecisionReq(BaseModel):
    action: Literal["confirm", "change"]
    reason: str = Field(min_length=1, max_length=4000)
    applicable: bool = True
    answer: Literal["yes", "no"] | None = None
    step: int | float | None = None


# ---------- helpers ----------

def _checklist_or_404(checklist_id=None):
    cl = db.checklist(checklist_id)
    if not cl:
        raise HTTPException(404, "чек-лист не найден")
    return cl


def _conversation_or_404(cid):
    rec = db.conversation(cid)
    if not rec:
        raise HTTPException(404, "диалог не найден")
    return rec


def _appeals(eval_ids):
    if not eval_ids:
        return {}
    marks = ",".join("?" * len(eval_ids))
    out = {}
    for a in db.query(f"select * from appeals where evaluation_id in ({marks}) order by id", tuple(eval_ids)):
        a["override"] = json.loads(a["override"]) if a["override"] else None
        out.setdefault(a["evaluation_id"], []).append(a)
    return out


def _scores(cl_data, ev, appeals):
    overrides = {a["criterion_id"]: a["override"] for a in appeals if a["override"]}  # later decisions win
    raw = ev["raw"] or {}
    return score(cl_data, raw), score(cl_data, raw, overrides)


def eval_view(ev):
    cl = db.checklist(ev["checklist_id"])
    appeals = _appeals([ev["id"]]).get(ev["id"], [])
    original, final = _scores(cl["data"], ev, appeals)
    return {**ev, "checklist": {"id": cl["id"], "name": cl["name"], "data": cl["data"]},
            "original": original, "final": final, "appeals": appeals}


def run_evaluation(cid, cl):
    rec = db.conversation(cid)
    try:
        result = evaluator.evaluate(cl["data"], rec)
    except Exception as e:  # stored so the UI can show the failure and offer a retry
        result = {"status": "error", "errors": [f"{type(e).__name__}: {e}"[:500]], "model": llm.model_name()}
    return db.save_evaluation(cid, cl["id"], result)


def _has_usable_evaluation(cid, checklist_id):
    return db.one("select 1 from evaluations where conversation_id=? and checklist_id=? and status!='error'",
                  (cid, checklist_id)) is not None


# ---------- config & import ----------

@app.get("/api/config")
def config():
    return {"model": llm.model_name(), "has_api_key": bool(os.getenv("ANTHROPIC_API_KEY")),
            "source_configured": bool(os.getenv("CQA_SOURCE_URL"))}


@app.get("/api/groups")
def groups():
    return db.query("select group_id, count(*) n from conversations group by group_id order by max(imported_at) desc")


def _store(records, problems, group_id):
    for r in records:
        db.upsert_conversation(r, group_id)
    return {"group_id": group_id, "imported": len(records), "problems": problems}


@app.post("/api/import")
def import_group(req: ImportReq):
    group_id = req.group_id.strip()
    try:
        records, problems = importer.fetch_group(group_id)
    except importer.ImportErrorWithDetail as e:
        raise HTTPException(502, str(e))
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, f"источник недоступен или вернул не JSON: {type(e).__name__}")
    return _store(records, problems, group_id)


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), group_id: str = Form("")):
    try:
        payload = json.loads(await file.read())
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, "файл не является корректным JSON")
    try:
        records, problems = importer.records_from_payload(payload)
    except importer.ImportErrorWithDetail as e:
        raise HTTPException(422, str(e))
    data = payload.get("data") if isinstance(payload, dict) else None
    group = group_id.strip() or (data or {}).get("dataset_group_id") or "upload"
    return _store(records, problems, group)


# ---------- conversations ----------

@app.get("/api/conversations")
def conversations(group_id: str | None = None, checklist_id: int | None = None):
    cl = _checklist_or_404(checklist_id)
    where, args = ("where group_id=?", (group_id,)) if group_id else ("", ())
    rows = db.query(f"select id, group_id, channel, language, audio_url is not null and audio_url!='' has_audio,"
                    f" json_array_length(transcript) messages from conversations {where} order by id", args)
    evs = {e["conversation_id"]: e for e in db.query(
        "select e.* from evaluations e join (select conversation_id, max(id) id from evaluations"
        " where checklist_id=? group by conversation_id) m on e.id=m.id", (cl["id"],))}
    appeals = _appeals([e["id"] for e in evs.values()])
    for r in rows:
        ev = evs.get(r["id"])
        r["evaluation"] = None
        if ev:
            ev["raw"] = json.loads(ev["raw"] or "{}")
            mine = appeals.get(ev["id"], [])
            original, final = _scores(cl["data"], ev, mine)
            r["evaluation"] = {"id": ev["id"], "status": ev["status"], "cost_usd": ev["cost_usd"],
                               "total": original["total"], "final_total": final["total"],
                               "flags": final["flags"], "complete": final["complete"],
                               "appeals_open": sum(a["status"] == "open" for a in mine),
                               "appeals_total": len(mine)}
    return {"checklist_id": cl["id"], "items": rows}


@app.get("/api/conversations/{cid}")
def conversation(cid: str):
    rec = _conversation_or_404(cid)
    evaluations = db.query("select id, checklist_id, status, model, created_at from evaluations"
                           " where conversation_id=? order by id desc", (cid,))
    return {"conversation_id": cid, "group_id": rec["group_id"], "channel": rec["channel"],
            "language": rec["language"], "has_audio": bool(rec["audio_url"]),
            "messages": prepare(rec), "evaluations": evaluations}


@app.get("/api/conversations/{cid}/evaluation")
def conversation_evaluation(cid: str, checklist_id: int | None = None):
    _conversation_or_404(cid)
    eid = db.latest_evaluation_id(cid, _checklist_or_404(checklist_id)["id"])
    return eval_view(db.evaluation(eid)) if eid else None


_audio_cache = {}


@app.get("/api/conversations/{cid}/audio")
def audio(cid: str):
    """audio_url is a player page with a 1-hour signed mp3 link; resolve it so our <audio> can seek."""
    rec = _conversation_or_404(cid)
    url = rec["audio_url"]
    if not url or not url.startswith("https://"):
        raise HTTPException(404, "у диалога нет записи")
    hit = _audio_cache.get(cid)
    if hit and hit[1] > time.time():
        return RedirectResponse(hit[0])
    try:
        resp = httpx.get(url, timeout=60, follow_redirects=True)
    except httpx.HTTPError:
        raise HTTPException(502, "запись недоступна")
    target = url
    if "audio" not in resp.headers.get("content-type", ""):
        m = re.search(r'<source[^>]+src="([^"]+)"', resp.text) or re.search(r'<audio[^>]+src="([^"]+)"', resp.text)
        if not m:
            raise HTTPException(502, "не удалось найти ссылку на аудио на странице записи")
        target = html.unescape(m.group(1))
    _audio_cache[cid] = (target, time.time() + 45 * 60)  # signed link lives 1 hour
    return RedirectResponse(target)


# ---------- checklists ----------

@app.get("/api/checklists")
def checklists():
    rows = db.query("select id, name, created_at, json_array_length(data, '$.criteria') criteria"
                    " from checklists order by id desc")
    return rows


@app.get("/api/checklists/{checklist_id}")
def checklist(checklist_id: int):
    return _checklist_or_404(checklist_id)


@app.post("/api/checklists")
def save_checklist(body: Checklist):
    """Every save is a new immutable version; older evaluations keep pointing at theirs."""
    return {"id": db.save_checklist(body.model_dump())}


# ---------- evaluation ----------

@app.post("/api/evaluate")
def evaluate(req: EvaluateReq):
    _conversation_or_404(req.conversation_id)
    cl = _checklist_or_404(req.checklist_id)
    if not req.force and _has_usable_evaluation(req.conversation_id, cl["id"]):
        eid = db.latest_evaluation_id(req.conversation_id, cl["id"])
    else:
        eid = run_evaluation(req.conversation_id, cl)
    return eval_view(db.evaluation(eid))


JOBS, LOCK = {}, threading.Lock()
POOL = ThreadPoolExecutor(max_workers=5)


@app.post("/api/batch")
def batch(req: BatchReq):
    cl = _checklist_or_404(req.checklist_id)
    if req.conversation_ids:
        ids = req.conversation_ids
    elif req.group_id:
        ids = [r["id"] for r in db.query("select id from conversations where group_id=? order by id", (req.group_id,))]
    else:
        ids = [r["id"] for r in db.query("select id from conversations order by id")]
    job = {"id": uuid.uuid4().hex[:8], "checklist_id": cl["id"], "total": len(ids),
           "done": 0, "failed": 0, "skipped": 0, "running": True, "cost_usd": 0.0}

    def bump(key, cost=0.0):
        with LOCK:
            job[key] += 1
            job["cost_usd"] = round(job["cost_usd"] + (cost or 0), 5)

    def one(cid):
        if not req.force and _has_usable_evaluation(cid, cl["id"]):
            return bump("skipped")
        ev = db.evaluation(run_evaluation(cid, cl))
        bump("failed" if ev["status"] == "error" else "done", ev["cost_usd"])

    futures = [POOL.submit(one, cid) for cid in ids]
    threading.Thread(target=lambda: (wait(futures), job.update(running=False)), daemon=True).start()
    JOBS[job["id"]] = job
    return job


@app.get("/api/batch/{job_id}")
def batch_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "задача не найдена")
    return JOBS[job_id]


@app.get("/api/evaluations/{eval_id}")
def evaluation(eval_id: int):
    ev = db.evaluation(eval_id)
    if not ev:
        raise HTTPException(404, "оценка не найдена")
    return eval_view(ev)


# ---------- appeals ----------

@app.post("/api/evaluations/{eval_id}/appeals")
def create_appeal(eval_id: int, req: AppealReq):
    ev = db.evaluation(eval_id)
    if not ev:
        raise HTTPException(404, "оценка не найдена")
    if req.criterion_id not in {c["id"] for c in db.checklist(ev["checklist_id"])["data"]["criteria"]}:
        raise HTTPException(422, "в чек-листе нет такого критерия")
    if db.one("select 1 from appeals where evaluation_id=? and criterion_id=? and status='open'",
              (eval_id, req.criterion_id)):
        raise HTTPException(409, "по этому критерию уже есть открытая апелляция")
    db.execute("insert into appeals(evaluation_id, criterion_id, comment, status, created_at) values (?,?,?,?,?)",
               (eval_id, req.criterion_id, req.comment.strip(), "open", db.now()))
    return eval_view(ev)


@app.get("/api/appeals")
def appeals(status: Literal["open", "decided", "all"] = "open"):
    rows = db.query("select a.id from appeals a where ?='all' or a.status=? order by a.id desc", (status, status))
    return [_appeal_view(r["id"]) for r in rows]


def _appeal_view(appeal_id):
    a = db.one("select * from appeals where id=?", (appeal_id,))
    view = eval_view(db.evaluation(a["evaluation_id"]))
    a["override"] = json.loads(a["override"]) if a["override"] else None
    original = next(c for c in view["original"]["criteria"] if c["id"] == a["criterion_id"])
    final = next(c for c in view["final"]["criteria"] if c["id"] == a["criterion_id"])
    rec = db.conversation(view["conversation_id"])
    wanted = set(original.get("evidence_ids") or []) | set(original.get("checked_range") or [])
    fragment = [m for m in prepare(rec) if m["id"] in wanted]
    return {**a, "conversation_id": view["conversation_id"], "channel": rec["channel"], "language": rec["language"],
            "criterion": next(c for c in view["checklist"]["data"]["criteria"] if c["id"] == a["criterion_id"]),
            "original": original, "final": final, "fragment": fragment,
            "total": view["original"]["total"], "final_total": view["final"]["total"]}


@app.post("/api/appeals/{appeal_id}/decision")
def decide(appeal_id: int, req: DecisionReq):
    a = db.one("select * from appeals where id=?", (appeal_id,))
    if not a:
        raise HTTPException(404, "апелляция не найдена")
    if a["status"] != "open":
        raise HTTPException(409, "апелляция уже рассмотрена")
    ev = db.evaluation(a["evaluation_id"])
    c = next(c for c in db.checklist(ev["checklist_id"])["data"]["criteria"] if c["id"] == a["criterion_id"])
    override = None
    if req.action == "change":
        if not req.applicable:
            if not c.get("na_allowed"):
                raise HTTPException(422, "для этого критерия N/A не допускается")
            override = {"applicable": False, "answer": None, "step": None, "na_reason": req.reason.strip()}
        elif c["type"] == "scale":
            if req.step not in [s["value"] for s in c["scale"]]:
                raise HTTPException(422, "ступень не из шкалы критерия")
            override = {"applicable": True, "answer": None, "step": req.step}
        else:
            if req.answer not in ("yes", "no"):
                raise HTTPException(422, "нужен ответ yes или no")
            override = {"applicable": True, "answer": req.answer, "step": None}
    db.execute("update appeals set status='decided', action=?, reason=?, override=?, decided_at=? where id=?",
               (req.action, req.reason.strip(), json.dumps(override) if override else None, db.now(), appeal_id))
    return _appeal_view(appeal_id)


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
