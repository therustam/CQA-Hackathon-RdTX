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
    import app.llm
    monkeypatch.setattr(app.llm, "call", fake_call)
    import app.main
    importlib.reload(app.main)
    with TestClient(app.main.app) as c:
        yield c


def upload(client):
    body = json.dumps({"isSuccess": True, "data": {"dataset_group_id": "T", "records": [CHAT, CALL]}})
    r = client.post("/api/upload", files={"file": ("t.json", body, "application/json")})
    assert r.status_code == 200, r.text
    return r.json()


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


def test_decision_rejects_na_where_not_allowed(client):
    upload(client)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    client.post(f"/api/evaluations/{ev['id']}/appeals", json={"criterion_id": "05", "comment": "?"})
    aid = client.get("/api/appeals").json()[0]["id"]
    r = client.post(f"/api/appeals/{aid}/decision", json={"action": "change", "reason": "r", "applicable": False})
    assert r.status_code == 422
    ok = client.post(f"/api/appeals/{aid}/decision", json={"action": "confirm", "reason": "Оценка верна"}).json()
    assert ok["final_total"] == 88.13


def test_new_checklist_version_and_batch(client):
    upload(client)
    v1 = client.get("/api/checklists").json()[0]
    cl = copy.deepcopy(client.get(f"/api/checklists/{v1['id']}").json()["data"])
    cl["criteria"][6] = {"id": "09", "section": "conduct", "title": "Проверка понимания", "type": "binary",
                         "weight": 5, "na_allowed": False, "rule": "Да — оператор уточнил, всё ли понятно."}
    v2 = client.post("/api/checklists", json=cl).json()["id"]
    assert v2 > v1["id"] and client.get("/api/checklists").json()[0]["id"] == v2

    job = client.post("/api/batch", json={"group_id": "T", "checklist_id": v2}).json()
    for _ in range(100):
        job = client.get(f"/api/batch/{job['id']}").json()
        if not job["running"]:
            break
        time.sleep(0.05)
    assert (job["total"], job["done"], job["failed"]) == (2, 2, 0)

    ev = client.get("/api/conversations/t-chat/evaluation", params={"checklist_id": v2}).json()
    assert [c["id"] for c in ev["final"]["criteria"]][6] == "09"
    assert ev["final"]["total"] == round(100 * 75.5 / 85, 2)  # 07 (N/A) replaced by 09 = yes
    again = client.post("/api/batch", json={"group_id": "T", "checklist_id": v2}).json()
    time.sleep(0.2)
    assert client.get(f"/api/batch/{again['id']}").json()["skipped"] == 2


def test_checklist_validation(client):
    v1 = client.get("/api/checklists").json()[0]["id"]
    cl = client.get(f"/api/checklists/{v1}").json()["data"]
    dup = copy.deepcopy(cl)
    dup["criteria"][1]["id"] = "01"
    assert client.post("/api/checklists", json=dup).status_code == 422
    bad_scale = copy.deepcopy(cl)
    bad_scale["criteria"][3]["scale"] = [{"value": 5, "label": ""}]
    assert client.post("/api/checklists", json=bad_scale).status_code == 422


def test_upload_rejects_garbage(client):
    r = client.post("/api/upload", files={"file": ("t.json", "not json", "application/json")})
    assert r.status_code == 422
    body = json.dumps([{"conversation_id": "x", "transcript": [{"speaker": "alien", "text": "hi"}]}])
    assert client.post("/api/upload", files={"file": ("t.json", body, "application/json")}).json()["imported"] == 0


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


def test_llm_failure_is_stored_as_error(client, monkeypatch):
    upload(client)
    import app.llm

    def boom(system, user):
        raise RuntimeError("no key")
    monkeypatch.setattr(app.llm, "call", boom)
    ev = client.post("/api/evaluate", json={"conversation_id": "t-chat"}).json()
    assert ev["status"] == "error" and "no key" in ev["errors"][0] and ev["final"]["total"] is None
