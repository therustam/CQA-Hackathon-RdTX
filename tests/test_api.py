import copy
import importlib
import json
import re
import time

import pytest
from fastapi.testclient import TestClient

from tests.test_transcript import CALL, CHAT

# answers for the default checklist that reproduce the 88.13 worked example
WORKED = {"02": "na", "07": "na", "04": 15, "06": 7, "08": "no"}


def fake_call(system, user):
    """Answers every criterion found in the compiled prompt: WORKED overrides, else yes / top step."""
    results = []
    for block in system.split("### Критерий ")[1:]:
        cid = block.split(".")[0]
        want = WORKED.get(cid)
        item = {"criterion_id": cid, "applicable": True, "na_reason": None, "answer": None, "step": None,
                "subtypes": [], "explanation": "ok", "evidence_ids": ["m0"], "checked_range": [], "confidence": 1}
        if want == "na":
            item.update(applicable=False, na_reason="условие")
        elif "Тип: шкала" in block:
            item["step"] = want if isinstance(want, int) else int(re.search(r"\n- (\d+) —", block).group(1))
        else:
            item["answer"] = want or "yes"
        results.append(item)
    usage = {"input_tokens": 3000, "output_tokens": 800, "cache_write_tokens": 0, "cache_read_tokens": 0}
    return {"data": {"results": results}, "usage": usage, "model": "claude-opus-5-5", "latency_ms": 5}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CQA_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CQA_TEAM_NAME", "Test team")
    import app.llm
    monkeypatch.setattr(app.llm, "call", fake_call)
    import app.main
    importlib.reload(app.main)
    with TestClient(app.main.app) as c:
        yield c
    app.main.POOL.shutdown(wait=True)


def upload(client):
    body = json.dumps({"isSuccess": True, "data": {"dataset_group_id": "T", "records": [CHAT, CALL]}})
    r = client.post("/api/upload", files={"file": ("t.json", body, "application/json")})
    assert r.status_code == 200, r.text
    return r.json()


def wait_job(client, job):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        state = client.get(f"/api/batch/{job['id']}").json()
        if not state["running"]:
            return state
        time.sleep(0.01)
    pytest.fail("batch did not finish")


def test_full_flow_evaluate_appeal_decide(client):
    assert upload(client) == {"group_id": "T", "imported": 2, "problems": []}
    items = client.get("/api/conversations", params={"group_id": "T"}).json()["items"]
    assert [i["id"] for i in items] == ["t-call", "t-chat"] and items[0]["has_audio"] == 1

    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    assert ev["status"] == "ok" and ev["original"]["total"] == 88.13 and ev["final"]["total"] == 88.13
    assert ev["cost_usd"] == round((3000 * 4 + 800 * 20) / 1e6, 5)

    r = client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": "04", "comment": "Ответ полный"})
    assert r.status_code == 200
    assert client.post(f"/api/evaluations/{ev['id']}/appeals",
                       json={"criterion_id": "04", "comment": "ещё раз"}).status_code == 409

    queue = client.get("/api/appeals").json()
    assert len(queue) == 1 and queue[0]["comment"] == "Ответ полный" and queue[0]["original"]["step"] == 15
    assert [m["id"] for m in queue[0]["fragment"]] == ["m0"]

    bad = client.post(f"/api/appeals/{queue[0]['id']}/decision", json={"action": "change", "reason": "x", "step": 12})
    assert bad.status_code == 422
    decided = client.post(f"/api/appeals/{queue[0]['id']}/decision",
                          json={"action": "change", "reason": "Следующий шаг корректен", "step": 20}).json()
    assert decided["status"] == "decided" and decided["final"]["step"] == 20
    assert (decided["total"], decided["final_total"]) == (88.13, 94.38)

    view = client.get(f"/api/evaluations/{ev['id']}").json()
    assert view["original"]["total"] == 88.13 and view["final"]["total"] == 94.38
    assert view["appeals"][0]["reason"] == "Следующий шаг корректен"
    assert client.get("/api/appeals").json() == []

    row = next(i for i in client.get("/api/conversations").json()["items"] if i["id"] == "t-chat")
    assert row["evaluation"]["final_total"] == 94.38 and row["evaluation"]["appeals_total"] == 1

    stats = client.get("/api/stats", params={"group_id": "T"}).json()
    assert (stats["conversations"], stats["evaluated"], stats["avg_total"]) == (2, 1, 94.38)
    assert (stats["changed_by_appeal"], stats["appeals_decided"], stats["appeals_open"]) == (1, 1, 0)
    assert next(c for c in stats["criteria"] if c["id"] == "04")["missed"] == 0


def test_decision_rejects_na_where_not_allowed(client):
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": "05", "comment": "?"})
    aid = client.get("/api/appeals").json()[0]["id"]
    r = client.post(f"/api/appeals/{aid}/decision", json={"action": "change", "reason": "r", "applicable": False})
    assert r.status_code == 422
    same = client.post(f"/api/appeals/{aid}/decision", json={"action": "change", "reason": "r", "answer": "yes"})
    assert same.status_code == 422  # identical to the AI answer: that is a confirmation
    ok = client.post(f"/api/appeals/{aid}/decision", json={"action": "confirm", "reason": "Оценка верна"}).json()
    assert ok["final_total"] == 88.13


def test_each_decision_reports_its_own_effect(client):
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    for cid in ("04", "05"):
        client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": cid, "comment": "c"})
    first, second = sorted(client.get("/api/appeals").json(), key=lambda a: a["id"])
    client.post(f"/api/appeals/{first['id']}/decision", json={"action": "change", "reason": "r", "step": 20})
    d2 = client.post(f"/api/appeals/{second['id']}/decision", json={"action": "change", "reason": "r", "answer": "no"}).json()
    assert (d2["total"], d2["final_total"]) == (94.38, 75.63)  # 75.5/80 -> 60.5/80 = 75.625 half-up
    d1 = next(a for a in client.get("/api/appeals?status=decided").json() if a["id"] == first["id"])
    assert (d1["total"], d1["final_total"], d1["current_total"]) == (88.13, 94.38, 75.63)
    assert d1["decided"]["step"] == 20


def test_new_checklist_version_and_batch(client):
    upload(client)
    v1 = client.get("/api/checklists").json()[0]
    cl = copy.deepcopy(client.get(f"/api/checklists/{v1['id']}").json()["data"])
    cl["criteria"][6] = {"id": "09", "section": "conduct", "title": "Проверка понимания", "type": "binary",
                         "weight": 5, "na_allowed": False, "rule": "Да — оператор уточнил, всё ли понятно."}
    v2 = client.post("/api/checklists", json=cl).json()["id"]
    assert v2 > v1["id"] and client.get("/api/checklists").json()[0]["id"] == v2

    job = client.post("/api/batch", json={"group_id": "T", "checklist_id": v2}).json()
    job = wait_job(client, job)
    assert (job["total"], job["done"], job["failed"]) == (2, 2, 0)

    ev = client.get("/api/conversations/t-chat/evaluation", params={"checklist_id": v2}).json()
    assert [c["id"] for c in ev["final"]["criteria"]][6] == "09"
    assert ev["final"]["total"] == 88.82  # 07 (N/A) replaced by 09 = yes
    again = client.post("/api/batch", json={"group_id": "T", "checklist_id": v2}).json()
    assert wait_job(client, again)["skipped"] == 2


def test_checklist_validation(client):
    v1 = client.get("/api/checklists").json()[0]["id"]
    cl = client.get(f"/api/checklists/{v1}").json()["data"]
    dup = copy.deepcopy(cl)
    dup["criteria"][1]["id"] = "01"
    assert client.post("/api/checklists", json=dup).status_code == 422
    bad_scale = copy.deepcopy(cl)
    bad_scale["criteria"][3]["scale"] = [{"value": 5, "label": ""}]
    assert client.post("/api/checklists", json=bad_scale).status_code == 422
    dup_section = copy.deepcopy(cl)
    dup_section["sections"].append(copy.deepcopy(dup_section["sections"][0]))
    assert client.post("/api/checklists", json=dup_section).status_code == 422


def test_upload_rejects_garbage(client):
    r = client.post("/api/upload", files={"file": ("t.json", "not json", "application/json")})
    assert r.status_code == 422
    body = json.dumps([{"conversation_id": "x", "transcript": [{"speaker": "alien", "text": "hi"}]}])
    assert client.post("/api/upload", files={"file": ("t.json", body, "application/json")}).json()["imported"] == 1
    doc = client.get("/api/conversations/x").json()
    assert doc["import_error"] and doc["messages"] == []


def test_audio_redirect_resolves_player_page(client, monkeypatch):
    upload(client)
    import app.main

    class Resp:
        headers = {"content-type": "text/html; charset=utf-8"}
        text = '<audio id="a"><source src="https://cdn.example/rec.mp3?sig=a&amp;b=1" type="audio/mpeg"></audio>'

    monkeypatch.setattr(app.main.httpx, "get", lambda *a, **k: Resp())
    r = client.get("/api/conversations/t-call/audio", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "https://cdn.example/rec.mp3?sig=a&b=1"
    assert client.get("/api/conversations/t-chat/audio").status_code == 404


def test_recording_player_remains_available_when_resolution_fails(client, monkeypatch):
    import app.main
    upload(client)

    def unavailable(*args, **kwargs):
        import httpx
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(app.main.httpx, "get", unavailable)
    assert client.get("/api/conversations/t-call/audio", follow_redirects=False).status_code == 502
    player = client.get("/api/conversations/t-call/audio?player=true", follow_redirects=False)
    assert player.status_code == 307 and player.headers["location"] == CALL["audio_url"]
    assert client.get("/api/conversations/t-chat/audio?player=true", follow_redirects=False).status_code == 404


def test_llm_failure_is_stored_as_error(client, monkeypatch):
    upload(client)
    import app.llm

    def boom(system, user):
        raise RuntimeError("no key")
    monkeypatch.setattr(app.llm, "call", boom)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    assert ev["status"] == "error" and "no key" in ev["errors"][0] and ev["final"]["total"] is None


def test_export_results_format(client):
    from app import export
    upload(client)
    client.post("/api/evaluate", json={"conversation_id": "t-chat"})
    r = client.get("/api/export", params={"group_id": "T"})
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    doc = r.json()
    assert doc["schema_version"] == "1.0" and doc["model"] == {"mode": "external_api", "name": "claude-opus-5-5"}
    call, chat = doc["results"]
    # not evaluated -> reported as an error record, never skipped or scored as zero
    assert call == {"conversation_id": "t-call", "status": "error", "criteria": [], "score": None,
                    "error": "Диалог не оценён."}
    values = {c["criterion_id"]: c["value"] for c in chat["criteria"]}
    assert values == {"contact": True, "discovery": None, "identification": True, "consultation": 15,
                      "empathy": True, "dialogue": 7, "closure": None, "critical": False}
    assert chat["criteria"][0]["evidence_turns"] == [1]  # m0 -> turn 1
    assert chat["score"] == {"final_score": 88.13, "critical_flag": False}
    assert export.problems(doc) == []  # error records are explicitly allowed in the submission
    assert export.turns(["m9", "m0", "m9", "bad"]) == [1, 10]


def test_control_set_keeps_all_ten_ids_including_provider_failure(client, monkeypatch):
    from app import llm, export
    records = []
    greetings = {"RU": "Здравствуйте, я Анна.", "KZ": "Сәлеметсіз бе, мен Аннамын.", "EN": "Hello, I am Anna."}
    for i in range(10):
        record = copy.deepcopy(CHAT)
        record.update(conversation_id=f"control-{i + 1:02d}", language=("RU", "KZ", "EN")[i % 3])
        record["transcript"][-1]["text"] = greetings[record["language"]]
        records.append(record)
    payload = {"isSuccess": True, "data": {"dataset_group_id": "CONTROL", "total_records": 10, "records": records}}
    uploaded = client.post("/api/upload", files={"file": ("control.json", json.dumps(payload), "application/json")})
    assert uploaded.json() == {"group_id": "CONTROL", "imported": 10, "problems": []}

    def call(system, user):
        if "Диалог control-10." in user:
            raise RuntimeError("simulated provider failure")
        return fake_call(system, user)

    monkeypatch.setattr(llm, "call", call)
    job = wait_job(client, client.post("/api/batch", json={"group_id": "CONTROL"}).json())
    assert (job["total"], job["done"], job["failed"], job["skipped"]) == (10, 9, 1, 0)
    response = client.get("/api/export", params={"group_id": "CONTROL"})
    assert response.status_code == 200
    doc = response.json()
    assert export.problems(doc, expected_ids=[r["conversation_id"] for r in records],
                           transcript_lengths={r["conversation_id"]: len(r["transcript"]) for r in records}, expect=10) == []
    assert sum(r["status"] == "ok" for r in doc["results"]) == 9
    assert doc["results"][-1]["status"] == "error" and doc["results"][-1]["score"] is None
    for record in records:
        source = client.get(f"/api/conversations/{record['conversation_id']}").json()
        assert source["language"] == record["language"]
        assert source["messages"][-1]["text"] == greetings[record["language"]]


def test_batch_retries_needs_review_and_counts_it_as_failed(client, monkeypatch):
    from app import db, llm
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    partial = {**ev, "status": "needs_review", "errors": ["missing"],
               "raw": {k: v for k, v in ev["raw"].items() if k != "01"}}
    db.save_evaluation("t-chat", ev["checklist_id"], partial)
    assert client.get("/api/conversations/t-chat/evaluation").json()["final"]["total"] is None

    def invalid(system, user):
        response = fake_call(system, user)
        response["data"]["results"].pop()
        return response

    monkeypatch.setattr(llm, "call", invalid)
    job = wait_job(client, client.post("/api/batch", json={"conversation_ids": ["t-chat"]}).json())
    assert (job["skipped"], job["done"], job["failed"]) == (0, 0, 1)
    monkeypatch.setattr(llm, "call", fake_call)
    job = wait_job(client, client.post("/api/batch", json={"conversation_ids": ["t-chat", "t-chat"]}).json())
    assert (job["total"], job["done"], job["failed"]) == (1, 1, 0)


def test_reimport_keeps_source_evidence_and_group(client):
    from app import db
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    changed = copy.deepcopy(CHAT)
    changed["transcript"][0]["text"] = "Different request"
    body = json.dumps([changed])
    response = client.post("/api/upload", data={"group_id": "T"},
                           files={"file": ("t.json", body, "application/json")}).json()
    assert response["imported"] == 0 and response["problems"]
    assert db.conversation("t-chat")["transcript"] == CHAT["transcript"]
    assert client.get(f"/api/evaluations/{ev['id']}").json()["raw"] == ev["raw"]
    body = json.dumps([CHAT])
    response = client.post("/api/upload", data={"group_id": "OTHER"},
                           files={"file": ("t.json", body, "application/json")}).json()
    assert response["imported"] == 0 and db.conversation("t-chat")["group_id"] == "T"
    assert upload(client)["imported"] == 2  # unchanged import remains idempotent


def test_reverse_decisions_and_return_to_original_value(client):
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    for cid in ("04", "05"):
        client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": cid, "comment": "c"})
    a, b = sorted(client.get("/api/appeals").json(), key=lambda x: x["id"])
    client.post(f"/api/appeals/{b['id']}/decision", json={"action": "change", "reason": "r", "answer": "no"})
    result = client.post(f"/api/appeals/{a['id']}/decision", json={"action": "change", "reason": "r", "step": 20}).json()
    assert (result["total"], result["final_total"], result["current_total"]) == (69.38, 75.63, 75.63)
    client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": "04", "comment": "return"})
    aid = client.get("/api/appeals").json()[0]["id"]
    result = client.post(f"/api/appeals/{aid}/decision", json={"action": "change", "reason": "r", "step": 15})
    assert result.status_code == 200
    assert (result.json()["total"], result.json()["final_total"]) == (75.63, 69.38)
    assert client.get(f"/api/appeals?status=decided").status_code == 200


def test_confirm_after_override_keeps_current_value_and_full_range(client):
    from app import db
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    ev["raw"]["04"].update(evidence_ids=[], checked_range=["m0", "m3"])
    eid = db.save_evaluation("t-chat", ev["checklist_id"], ev)
    client.post(f"/api/evaluations/{eid}/appeals", json={"criterion_id": "04", "comment": "range"})
    appeal = client.get("/api/appeals").json()[0]
    assert [m["id"] for m in appeal["fragment"]] == ["m0", "m1", "m2", "m3"]
    client.post(f"/api/appeals/{appeal['id']}/decision", json={"action": "change", "reason": "r", "step": 20})
    client.post(f"/api/evaluations/{eid}/appeals", json={"criterion_id": "04", "comment": "confirm"})
    aid = client.get("/api/appeals").json()[0]["id"]
    result = client.post(f"/api/appeals/{aid}/decision", json={"action": "confirm", "reason": "r"}).json()
    assert (result["total"], result["final_total"]) == (94.38, 94.38)
    assert result["decided"]["step"] == 20


def test_bad_source_is_exported_as_error_without_calling_llm(client, monkeypatch):
    from app import llm
    bad = copy.deepcopy(CHAT)
    bad["transcript"][0]["timestamp"] = "invalid"
    body = json.dumps([bad])
    imported = client.post("/api/upload", files={"file": ("t.json", body, "application/json")}).json()
    assert imported["imported"] == 1 and imported["problems"]
    monkeypatch.setattr(llm, "call", lambda *args: pytest.fail("invalid source must not reach model"))
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    assert ev["status"] == "error"
    result = client.get("/api/export").json()["results"][0]
    assert result["conversation_id"] == "t-chat" and result["status"] == "error"
    assert result["criteria"] == [] and result["score"] is None
    fixed = client.post("/api/upload", files={"file": ("fixed.json", json.dumps([CHAT]), "application/json")}).json()
    assert fixed["imported"] == 1 and not fixed["problems"]
    monkeypatch.setattr(llm, "call", fake_call)
    assert client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()["status"] == "ok"
    assert client.get(f"/api/evaluations/{ev['id']}").json()["status"] == "error"


@pytest.mark.parametrize("replacement", [
    {"type": "scale", "scale": [{"value": 6, "label": "Full"}, {"value": 0, "label": "None"}]},
    {"type": "binary", "na_allowed": True, "na_condition": "No request"},
    {"type": "flag", "subtypes": []},
])
def test_replacement_types_preserve_old_version(client, replacement):
    upload(client)
    old = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    original = client.get(f"/api/checklists/{old['checklist_id']}").json()["data"]
    edited = copy.deepcopy(original)
    edited["criteria"][6] = {"id": "new", "title": "New criterion", "rule": "Configured rule",
                              "weight": 5, **replacement}
    version = client.post("/api/checklists", json=edited).json()["id"]
    new = client.post("/api/evaluate", json={"conversation_id": "t-chat", "checklist_id": version}).json()
    assert new["status"] == "ok" and "new" in new["raw"] and "07" not in new["raw"]
    assert client.get(f"/api/evaluations/{old['id']}").json()["raw"] == old["raw"]
    assert client.get(f"/api/checklists/{old['checklist_id']}").json()["data"] == original
    assert client.get("/api/export", params={"checklist_id": version}).status_code == 422
