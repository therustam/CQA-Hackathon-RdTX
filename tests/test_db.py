import json
import sqlite3

from app import db
from tests.test_transcript import CHAT


def test_existing_database_is_migrated_without_changing_sources_or_ai(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.executescript('''
      create table conversations(id text primary key,group_id text,channel text,language text,audio_url text,
                                transcript text not null,imported_at text);
      create table appeals(id integer primary key autoincrement,evaluation_id integer not null,criterion_id text not null,
                           comment text not null,status text not null,created_at text,action text,reason text,override text,decided_at text);
    ''')
    con.execute("insert into conversations values (?,?,?,?,?,?,?)", ("t-chat", "T", "agent chat", "RU", None,
                                                                  json.dumps(CHAT["transcript"]), "created"))
    for time in ("2026-11-07T10:00:02Z", "2026-11-07T10:00:01Z"):
        con.execute("insert into appeals(evaluation_id,criterion_id,comment,status,decided_at) values(1,'x','c','decided',?)", (time,))
    con.commit()
    con.close()
    monkeypatch.setenv("CQA_DB", str(path))
    db.init()
    db.init()  # migration is idempotent
    assert db.conversation("t-chat")["transcript"] == CHAT["transcript"]
    assert [(r["id"], r["decision_order"]) for r in db.query("select * from appeals order by decision_order")] == [(2, 1), (1, 2)]
    eid = db.save_evaluation("t-chat", db.checklist()["id"], {"status": "error", "errors": ["old attempt"]})
    before = db.evaluation(eid)
    db.init()
    assert db.evaluation(eid) == before
    # Connections are closed, including on Windows, rather than waiting for garbage collection.
    path.rename(tmp_path / "moved.db")
