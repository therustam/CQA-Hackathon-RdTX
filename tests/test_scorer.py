import json
from pathlib import Path

import pytest

from app.scorer import score

CHECKLIST = json.loads((Path(__file__).parent.parent / "contracts" / "default_checklist.json").read_text("utf-8"))

NA = {"applicable": False, "answer": None, "step": None}


def yes():
    return {"applicable": True, "answer": "yes", "step": None}


def no():
    return {"applicable": True, "answer": "no", "step": None}


def step(v):
    return {"applicable": True, "answer": None, "step": v}


def worked_example():
    # docs/PLAN.md 2.2: 70.5 of 80 applicable -> 88.125 -> 88.13
    return {"01": yes(), "02": NA, "03": yes(), "04": step(15), "05": yes(), "06": step(7), "07": NA, "08": no()}


def by_id(result):
    return {c["id"]: c for c in result["criteria"]}


def test_worked_example_total_rounds_half_up():
    r = score(CHECKLIST, worked_example())
    assert r["total"] == 88.13  # Python round(88.125, 2) would give 88.12
    assert r["complete"] is True
    assert r["flags"] == []


def test_worked_example_redistributed_weights():
    c = by_id(score(CHECKLIST, worked_example()))
    assert [c[i]["redistributed_weight"] for i in ("01", "03", "04", "05", "06")] == [12.5, 25, 25, 18.75, 18.75]
    assert c["02"]["status"] == "na" and c["02"]["redistributed_weight"] is None
    assert c["06"]["points"] == 10.5  # 15 * 7 / 10
    assert c["04"]["points"] == 15


def test_scale_steps_proportional_to_weight():
    raw = {**worked_example(), "06": step(4)}
    assert by_id(score(CHECKLIST, raw))["06"]["points"] == 6
    raw["06"] = step(10)
    assert by_id(score(CHECKLIST, raw))["06"]["points"] == 15


def test_all_weighted_na_gives_no_total():
    raw = {cid: NA for cid in ("01", "02", "03", "04", "05", "06", "07")}
    raw["08"] = no()
    r = score(CHECKLIST, raw)
    assert r["total"] is None
    assert all(s["percent"] is None for s in r["sections"])


def test_perfect_and_zero():
    perfect = {"01": yes(), "02": yes(), "03": yes(), "04": step(20), "05": yes(), "06": step(10), "07": yes(), "08": no()}
    assert score(CHECKLIST, perfect)["total"] == 100
    zero = {"01": no(), "02": no(), "03": no(), "04": step(0), "05": no(), "06": step(0), "07": no(), "08": no()}
    assert score(CHECKLIST, zero)["total"] == 0


def test_flag_is_separate_from_total():
    raw = {**worked_example(), "08": {**yes(), "subtypes": ["off_book_offer"], "evidence_ids": ["m14"]}}
    r = score(CHECKLIST, raw)
    assert r["total"] == 88.13
    assert [f["criterion_id"] for f in r["flags"]] == ["08"]
    assert r["flags"][0]["subtypes"] == ["off_book_offer"]


def test_override_recalculates_and_keeps_original_fields():
    raw = worked_example()
    raw["04"] = {**step(15), "explanation": "AI text"}
    r = score(CHECKLIST, raw, {"04": {"applicable": True, "answer": None, "step": 20}})
    assert r["total"] == 94.38  # 75.5 / 80 = 94.375 -> half-up
    c = by_id(r)["04"]
    assert c["overridden"] is True and c["step"] == 20 and c["explanation"] == "AI text"


def test_override_to_na_redistributes():
    r = score(CHECKLIST, worked_example(), {"03": NA})
    assert r["total"] == 84.17  # 50.5 / 60


def test_missing_criterion_marks_incomplete():
    raw = worked_example()
    del raw["05"]
    r = score(CHECKLIST, raw)
    assert r["complete"] is False
    assert by_id(r)["05"]["status"] == "missing"
    assert r["total"] == 85.38  # 55.5 / 65 = 85.3846


def test_sections():
    s = {x["id"]: x for x in score(CHECKLIST, worked_example())["sections"]}
    assert (s["start"]["earned"], s["start"]["available"], s["start"]["percent"]) == (12.5, 12.5, 100)
    assert (s["security"]["earned"], s["security"]["available"]) == (43.75, 50)
    assert s["gross"]["percent"] is None


def test_custom_weights_still_normalise_to_100():
    checklist = {"criteria": [
        {"id": "a", "title": "A", "type": "binary", "weight": 30, "scale": []},
        {"id": "b", "title": "B", "type": "binary", "weight": 10, "scale": []},
    ]}
    assert score(checklist, {"a": yes(), "b": no()})["total"] == 75


def test_step_outside_scale_is_rejected():
    with pytest.raises(ValueError):
        score(CHECKLIST, {**worked_example(), "04": step(12)})
