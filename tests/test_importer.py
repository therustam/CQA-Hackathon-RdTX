import copy
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app import importer
from tests.test_transcript import CALL, CHAT


@pytest.mark.parametrize("language,text", [("RU", "Где тариф?"), ("KZ", "Тарифті қайдан көруге болады?"), ("EN", "Where is the tariff?")])
def test_languages_and_supported_payload_forms(language, text):
    record = copy.deepcopy(CHAT)
    record.update(language=language)
    record["transcript"][0]["text"] = text
    for payload in (record, [record], {"records": [record]},
                    {"isSuccess": True, "data": {"total_records": 1, "records": [record]}}):
        records, problems = importer.records_from_payload(payload)
        assert records == [record] and problems == []


@pytest.mark.parametrize("timestamp", [None, 12, "broken", "00:99", "-1:00"])
def test_bad_timestamp_preserves_id_as_import_error(timestamp):
    record = copy.deepcopy(CHAT)
    record["transcript"][0]["timestamp"] = timestamp
    records, problems = importer.records_from_payload([record])
    assert problems and records[0]["conversation_id"] == record["conversation_id"]
    assert records[0]["import_error"] and records[0]["transcript"] == []


def test_call_requires_timezone_and_accepts_seven_fraction_digits():
    assert importer.records_from_payload([CALL]) == ([CALL], [])
    record = copy.deepcopy(CALL)
    record["transcript"][0]["timestamp"] = "2026-11-03T13:10:00"
    assert importer.records_from_payload([record])[1]


@pytest.mark.parametrize("payload", [
    {"isSuccess": False, "error": "failure"},
    {"data": {"total_records": 2, "records": [CHAT]}},
    [CHAT, CHAT],
])
def test_source_error_count_and_duplicate_ids_are_rejected(payload):
    with pytest.raises(importer.ImportErrorWithDetail):
        importer.records_from_payload(payload)


def test_fetch_uses_encoded_group_and_checks_http(monkeypatch):
    monkeypatch.setenv("CQA_SOURCE_URL", "https://example.test/source?existing=1")
    seen = []

    def get(url, **kwargs):
        seen.append(url)
        return httpx.Response(200, json={"isSuccess": True, "data": {"records": [CHAT]}})

    monkeypatch.setattr(importer.httpx, "get", get)
    assert importer.fetch_group("control & set")[0] == [CHAT]
    assert parse_qs(urlsplit(seen[0]).query) == {"existing": ["1"], "group_id": ["control & set"]}
    monkeypatch.setattr(importer.httpx, "get", lambda *a, **kw: httpx.Response(503))
    with pytest.raises(importer.ImportErrorWithDetail):
        importer.fetch_group("control")
