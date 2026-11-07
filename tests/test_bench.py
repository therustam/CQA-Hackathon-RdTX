import json
import sys

from app import db
from scripts import bench
from tests.test_evaluator import good
from tests.test_transcript import CHAT


def test_bench_counts_missing_evaluations_and_disagreements(tmp_path, monkeypatch):
    monkeypatch.setenv("CQA_DB", str(tmp_path / "test.db"))
    db.init()
    cl = db.checklist()
    db.upsert_conversation(CHAT, "T")
    db.save_evaluation("t-chat", cl["id"], {"status": "ok", "raw": {r["criterion_id"]: r for r in good()["results"]}})
    gold = tmp_path / "gold.json"
    gold.write_text(json.dumps({"t-chat": {"01": "yes", "04": 15}, "missing": {"01": "yes"}}), "utf-8")
    output = tmp_path / "report.md"
    monkeypatch.setattr(sys, "argv", ["bench", "--gold", str(gold), "--out", str(output)])
    bench.main()
    report = output.read_text("utf-8")
    assert "без оценки: 1" in report and "50% (1/2)" in report
    assert "| t-chat | 04 | 15 | 20.0 |" in report
    assert "| missing | 01 | yes | None |" in report
