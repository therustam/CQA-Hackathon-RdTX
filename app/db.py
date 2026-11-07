"""SQLite storage. JSON documents live in TEXT columns; a fresh connection per call keeps threads safe."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_CHECKLIST = Path(__file__).parent.parent / "contracts" / "default_checklist.json"

SCHEMA = """
create table if not exists conversations(
  id text primary key, group_id text, channel text, language text, audio_url text,
  transcript text not null, imported_at text, import_error text);
create table if not exists checklists(
  id integer primary key autoincrement, name text, data text not null, created_at text);
create table if not exists evaluations(
  id integer primary key autoincrement, conversation_id text not null, checklist_id integer not null,
  model text, status text not null, raw text, errors text, usage text, cost_usd real, latency_ms integer,
  created_at text);
create index if not exists evaluations_conv on evaluations(conversation_id, checklist_id);
create table if not exists appeals(
  id integer primary key autoincrement, evaluation_id integer not null, criterion_id text not null,
  comment text not null, status text not null default 'open', created_at text,
  action text, reason text, override text, decided_at text, decision_order integer);
"""


def path():
    return os.getenv("CQA_DB", "cqa.db")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    con = sqlite3.connect(path(), timeout=30)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def query(sql, args=()):
    with connect() as con:
        return [dict(r) for r in con.execute(sql, args).fetchall()]


def one(sql, args=()):
    rows = query(sql, args)
    return rows[0] if rows else None


def execute(sql, args=()):
    with connect() as con:
        return con.execute(sql, args).lastrowid


def init():
    with connect() as con:
        con.execute("pragma journal_mode=wal")
        con.executescript(SCHEMA)
        if "import_error" not in {r["name"] for r in con.execute("pragma table_info(conversations)")}:
            con.execute("alter table conversations add column import_error text")
        if "decision_order" not in {r["name"] for r in con.execute("pragma table_info(appeals)")}:
            con.execute("alter table appeals add column decision_order integer")
            for order, row in enumerate(con.execute(
                    "select id from appeals where status='decided' order by decided_at,id").fetchall(), 1):
                con.execute("update appeals set decision_order=? where id=?", (order, row["id"]))
        if not con.execute("select 1 from checklists").fetchone():
            data = json.loads(DEFAULT_CHECKLIST.read_text("utf-8"))
            con.execute("insert into checklists(name, data, created_at) values (?,?,?)",
                        (data["name"], json.dumps(data, ensure_ascii=False), now()))


def upsert_conversation(record, group_id):
    # Evidence IDs must keep pointing at the same source, including after a repeated import.
    with connect() as con:
        con.execute("begin immediate")
        old = con.execute("select * from conversations where id=?", (record["conversation_id"],)).fetchone()
        repairing = old and old["import_error"] and not record.get("import_error") and old["group_id"] == group_id
        if old and not repairing and (old["group_id"] != group_id or any(old[k] != record.get(k) for k in ("channel", "language"))
                    or json.loads(old["transcript"]) != record["transcript"]
                    or old["import_error"] != record.get("import_error")):
            raise ValueError(f"{record['conversation_id']}: повторный импорт меняет исходный диалог или набор")
        con.execute("insert into conversations(id,group_id,channel,language,audio_url,transcript,imported_at,import_error)"
                    " values (?,?,?,?,?,?,?,?) on conflict(id) do update set"
                    " channel=excluded.channel, language=excluded.language, transcript=excluded.transcript,"
                    " import_error=excluded.import_error, audio_url=excluded.audio_url, imported_at=excluded.imported_at",
                    (record["conversation_id"], group_id, record.get("channel"), record.get("language"),
                     record.get("audio_url"), json.dumps(record["transcript"], ensure_ascii=False), now(),
                     record.get("import_error")))


def conversation(cid):
    row = one("select * from conversations where id=?", (cid,))
    if row:
        row["transcript"] = json.loads(row["transcript"])
        row["conversation_id"] = row["id"]
    return row


def checklist(checklist_id=None):
    row = (one("select * from checklists where id=?", (checklist_id,)) if checklist_id
           else one("select * from checklists order by id desc limit 1"))
    if row:
        row["data"] = json.loads(row["data"])
    return row


def save_checklist(data):
    return execute("insert into checklists(name, data, created_at) values (?,?,?)",
                   (data["name"], json.dumps(data, ensure_ascii=False), now()))


def save_evaluation(cid, checklist_id, result):
    return execute(
        "insert into evaluations(conversation_id, checklist_id, model, status, raw, errors, usage, cost_usd,"
        " latency_ms, created_at) values (?,?,?,?,?,?,?,?,?,?)",
        (cid, checklist_id, result.get("model"), result["status"], json.dumps(result.get("raw") or {}, ensure_ascii=False),
         json.dumps(result.get("errors") or [], ensure_ascii=False), json.dumps(result.get("usage") or {}),
         result.get("cost_usd"), result.get("latency_ms"), now()))


def evaluation(eval_id):
    row = one("select * from evaluations where id=?", (eval_id,))
    if row:
        for k in ("raw", "errors", "usage"):
            row[k] = json.loads(row[k] or "null")
    return row


def latest_evaluation_id(cid, checklist_id):
    row = one("select max(id) id from evaluations where conversation_id=? and checklist_id=?", (cid, checklist_id))
    return row["id"] if row else None
