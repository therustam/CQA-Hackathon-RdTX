from app.transcript import first_operator_id, parse_time, prepare, render

CHAT = {
    "conversation_id": "t-chat", "channel": "agent chat", "language": "RU", "audio_url": None,
    "transcript": [
        {"timestamp": "00:00", "speaker": "client", "text": "Где тариф?"},
        {"timestamp": "00:02", "speaker": "bot", "text": "Здравствуйте! Я AIM."},
        {"timestamp": "00:38", "speaker": "system", "text": "Эскалация на оператора."},
        {"timestamp": "02:15", "speaker": "operator", "text": "Здравствуйте! Меня зовут Алина."},
    ],
}


def iso(sec):
    return f"2026-11-03T13:{10 + sec // 60:02d}:{sec % 60:02d}.6388245+00:00"


CALL = {
    "conversation_id": "t-call", "channel": "voice call", "language": "RU", "audio_url": "https://x/rec",
    "transcript": [
        {"timestamp": iso(0), "speaker": "system", "text": "Запись и транскрибирование запущены."},
        {"timestamp": iso(10), "speaker": "bot", "text": "IVR"},
        {"timestamp": iso(20), "speaker": "system", "text": "Запись и транскрибирование приостановлены."},
        {"timestamp": iso(30), "speaker": "system", "text": "Запись и транскрибирование возобновлены."},
        {"timestamp": iso(40), "speaker": "operator", "text": "Меня зовут [Имя скрыто]."},
        {"timestamp": iso(50), "speaker": "system", "text": "Клиент находится на удержании."},
        {"timestamp": iso(55), "speaker": "operator", "text": "Коллега, подскажи."},
        {"timestamp": iso(60), "speaker": "system", "text": "Клиент больше не находится на удержании."},
        {"timestamp": iso(70), "speaker": "operator", "text": "Спасибо за ожидание."},
        {"timestamp": iso(65), "speaker": "client", "text": "Алло?"},
        {"timestamp": iso(65), "speaker": "client", "text": "Алло?"},
    ],
}


def test_parse_time_formats():
    assert parse_time("01:15") == 75
    assert parse_time("1:01:15") == 3675
    assert parse_time("2026-11-03T15:49:13.1900670+00:00") - parse_time("2026-11-03T15:49:12.1900670+00:00") == 1


def test_chat_ids_relative_time_no_audio():
    msgs = prepare(CHAT)
    assert [m["id"] for m in msgs] == ["m0", "m1", "m2", "m3"]
    assert msgs[3]["t"] == 135 and msgs[3]["timestamp"] == "02:15"
    assert all(m["audio_offset"] is None for m in msgs)
    assert first_operator_id(msgs) == "m3"


def test_chat_render_marks_long_pause():
    text = render(prepare(CHAT))
    assert "[m3] 02:15 (пауза 01:37) operator: Здравствуйте! Меня зовут Алина." in text
    assert "[m1] 00:02 bot:" in text


def test_call_audio_offsets_subtract_recording_pause():
    off = {m["id"]: m["audio_offset"] for m in prepare(CALL)}
    assert off["m1"] == 10
    assert off["m4"] == 30  # 40 s since start minus 10 s pause
    assert off["m8"] == 60


def test_call_hold_marks_internal_operator_lines():
    msgs = {m["id"]: m for m in prepare(CALL)}
    assert msgs["m6"]["internal"] is True
    assert msgs["m4"]["internal"] is False and msgs["m8"]["internal"] is False


def test_call_render_sorts_by_time_and_drops_exact_duplicates():
    msgs = prepare(CALL)
    assert msgs[10]["duplicate"] is True
    text = render(msgs)
    assert text.count("Алло?") == 1
    assert text.index("[m9]") < text.index("[m8]")  # client 65 s before operator 70 s
    assert "внутренняя консультация" in text.split("[m6]")[1].split("\n")[0]
