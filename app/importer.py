"""Load conversations from the organizers' API (server-side, avoids CORS) or an uploaded JSON file."""
import os
from urllib.parse import urlencode

import httpx

ROLES = {"client", "operator", "bot", "system"}


class ImportErrorWithDetail(Exception):
    pass


def records_from_payload(payload):
    """Accepts the API envelope, {"records": [...]}, a list of records or a single record."""
    if isinstance(payload, dict) and "data" in payload:
        if payload.get("isSuccess") is False:
            raise ImportErrorWithDetail(f"источник вернул ошибку: {payload.get('error') or 'isSuccess=false'}")
        payload = payload["data"] or {}
    if isinstance(payload, dict) and "records" in payload:
        payload = payload["records"]
    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        raise ImportErrorWithDetail("ожидался JSON с массивом records")
    good, problems = [], []
    for i, r in enumerate(payload):
        problem = _problem(r)
        if problem:
            problems.append(f"запись {i}: {problem}")
        else:
            good.append(r)
    return good, problems


def _problem(r):
    if not isinstance(r, dict) or not isinstance(r.get("conversation_id"), str) or not r["conversation_id"]:
        return "нет conversation_id"
    t = r.get("transcript")
    if not isinstance(t, list) or not t:
        return "пустой transcript"
    for m in t:
        if not isinstance(m, dict) or m.get("speaker") not in ROLES or not isinstance(m.get("text"), str):
            return f"некорректная реплика {m!r}"[:200]
    url = r.get("audio_url")
    if url and not str(url).startswith("https://"):
        return "audio_url должен начинаться с https://"
    return None


def fetch_group(group_id):
    base = os.getenv("CQA_SOURCE_URL")
    if not base:
        raise ImportErrorWithDetail("CQA_SOURCE_URL не задан в .env")
    url = base + ("&" if "?" in base else "?") + urlencode({"group_id": group_id})
    resp = httpx.get(url, timeout=120)
    if resp.status_code != 200:
        raise ImportErrorWithDetail(f"источник ответил HTTP {resp.status_code}")
    return records_from_payload(resp.json())
