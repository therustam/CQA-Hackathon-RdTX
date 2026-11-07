import copy
import json
import sys
import os
import subprocess
from pathlib import Path

import pytest

from app import export
from tests.test_evaluator import CHECKLIST, good


def document():
    ev = {"status": "ok", "raw": {r["criterion_id"]: r for r in good()["results"]}}
    return {"schema_version": "1.0", "team_name": "Test", "model": {"mode": "external_api", "name": "test-model"},
            "results": [export.record(CHECKLIST, "t-chat", ev)]}


def test_official_codes_values_total_and_evidence():
    doc = document()
    assert export.problems(doc, expected_ids=["t-chat"], transcript_lengths={"t-chat": 4}, expect=1) == []
    for mutate in (
        lambda d: d["results"][0]["criteria"][0].update(criterion_id="unknown_code"),
        lambda d: d["results"][0]["criteria"][0].update(value=None),
        lambda d: d["results"][0]["criteria"][3].update(value=True),
        lambda d: d["results"][0]["criteria"][3].update(value=12),
        lambda d: d["results"][0]["criteria"][0].update(evidence_turns=[5]),
        lambda d: d["results"][0]["criteria"][0].update(evidence_turns=[True]),
        lambda d: d["results"][0]["criteria"][0].update(rationale=" "),
        lambda d: d["results"][0]["score"].update(final_score=0),
        lambda d: d["results"][0]["score"].update(critical_flag=True),
        lambda d: d.update(team_name=" "),
        lambda d: d["model"].update(name=""),
        lambda d: d.update(model=[]),
        lambda d: d["results"][0].update(score=[1]),
        lambda d: d["results"][0]["criteria"].append(None),
    ):
        changed = copy.deepcopy(doc)
        mutate(changed)
        assert export.problems(changed, transcript_lengths={"t-chat": 4})
    assert export.problems(doc, expected_ids=["other"])
    assert export.problems(doc, expect=10)


def test_ten_records_include_valid_errors_without_dropping_ids():
    doc = document()
    row = doc["results"][0]
    doc["results"] = [{**copy.deepcopy(row), "conversation_id": str(i)} for i in range(9)]
    doc["results"].append({"conversation_id": "9", "status": "error", "criteria": [], "score": None, "error": "failed"})
    assert export.problems(doc, expected_ids=map(str, range(10)), expect=10) == []
    doc["results"].append(copy.deepcopy(doc["results"][0]))
    assert export.problems(doc, expect=10)


def test_review_status_cannot_become_ok_on_export():
    ev = {"status": "needs_review", "raw": {r["criterion_id"]: r for r in good()["results"]}, "errors": ["duplicate"]}
    result = export.record(CHECKLIST, "t-chat", ev)
    assert result == {"conversation_id": "t-chat", "status": "error", "criteria": [], "score": None, "error": "duplicate"}


def test_cli_invalid_document_keeps_existing_file(tmp_path, monkeypatch):
    from app import db
    monkeypatch.setenv("CQA_DB", str(tmp_path / "test.db"))
    db.init()
    from scripts import export_results
    db.upsert_conversation({"conversation_id": "t-chat", "channel": "agent chat", "language": "RU",
                            "audio_url": None, "transcript": []}, "T")
    target = tmp_path / "results.json"
    target.write_text("previous valid file", encoding="utf-8")
    monkeypatch.setattr(export_results.export, "document", lambda *a: document())
    monkeypatch.setattr(sys, "argv", ["export_results", "--group", "T", "--out", str(target), "--expect", "10"])
    with pytest.raises(SystemExit):
        export_results.main()
    assert target.read_text("utf-8") == "previous valid file"
    monkeypatch.setattr(sys, "argv", ["export_results", "--group", "T", "--out", str(target)])
    # Source has no turns, so even a structurally valid document must not replace the file.
    with pytest.raises(SystemExit):
        export_results.main()
    assert target.read_text("utf-8") == "previous valid file"


@pytest.mark.parametrize("module", ["scripts.export_results", "scripts.bench"])
def test_cli_writes_utf8_with_non_unicode_console(tmp_path, monkeypatch, module):
    from app import db
    from tests.test_transcript import CHAT
    monkeypatch.setenv("CQA_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CQA_TEAM_NAME", "Test team")
    db.init()
    db.upsert_conversation(CHAT, "T")
    db.save_evaluation("t-chat", db.checklist()["id"], {
        "status": "ok", "model": "test-model", "raw": {r["criterion_id"]: r for r in good()["results"]}})
    output = tmp_path / "output"
    if module == "scripts.bench":
        gold = tmp_path / "gold.json"
        gold.write_text('{"t-chat":{"01":"yes"}}', "utf-8")
        args = ["--gold", str(gold), "--out", str(output)]
    else:
        args = ["--group", "T", "--out", str(output), "--expect", "1"]
    process = subprocess.run([sys.executable, "-m", module, *args],
                             env={**os.environ, "PYTHONIOENCODING": "cp1252"},
                             capture_output=True, encoding="utf-8", timeout=30)
    assert process.returncode == 0, process.stderr
    assert output.exists() and process.stdout
