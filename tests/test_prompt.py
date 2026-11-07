import copy
import json
from pathlib import Path

from app.prompt import build_system, build_user
from app.transcript import prepare
from tests.test_transcript import CHAT

ROOT = Path(__file__).parent.parent
CHECKLIST = json.loads((ROOT / "contracts" / "default_checklist.json").read_text("utf-8"))


def test_system_prompt_is_compiled_from_checklist():
    system = build_system(CHECKLIST)
    for c in CHECKLIST["criteria"]:
        assert f"Критерий {c['id']}. {c['title']}" in system
        assert c["rule"] in system
        for s in c["scale"]:
            assert f"- {s['value']} — {s['label']}" in system
    assert "N/A не допускается" in system and "Условие N/A: Данных для ответа хватало" in system
    assert "off_book_offer" in system
    assert CHECKLIST["instructions"].splitlines()[0] in system


def test_replaced_criterion_reaches_prompt_without_code_change():
    edited = copy.deepcopy(CHECKLIST)
    edited["criteria"][6] = {"id": "09", "section": "conduct", "title": "Проверка понимания", "type": "binary",
                             "weight": 5, "na_allowed": False, "rule": "Да — оператор уточнил, всё ли понятно.",
                             "na_condition": "", "guidance": "", "scale": [], "subtypes": []}
    system = build_system(edited)
    assert "Критерий 09. Проверка понимания" in system and "Критерий 07." not in system


def test_user_message_carries_conversation_and_retry_errors():
    msgs = prepare(CHAT)
    user = build_user(CHAT, msgs)
    assert "Первая реплика оператора: m3" in user and "[m0] 00:00 client: Где тариф?" in user
    assert "отклонён" in build_user(CHAT, msgs, ["критерий 01 не оценён"])


def test_no_criterion_wording_in_code():
    code = [p for p in list((ROOT / "app").glob("*.py")) + list((ROOT / "web").rglob("*.js"))]
    texts = {p.name: p.read_text("utf-8") for p in code}
    for c in CHECKLIST["criteria"]:
        for name, text in texts.items():
            assert c["title"] not in text, f"criterion title {c['title']!r} hardcoded in {name}"
            assert c["rule"][:40] not in text, f"criterion rule hardcoded in {name}"
