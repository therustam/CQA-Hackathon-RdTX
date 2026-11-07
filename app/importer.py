"""Load conversations from the organizers' API (server-side, avoids CORS) or an uploaded JSON file."""
import os
import math
import re
from datetime import datetime
from urllib.parse import urlencode

import httpx

from app.transcript import parse_time

ROLES = {"client", "operator", "bot", "system"}


class ImportErrorWithDetail(Exception):
    pass


def records_from_payload(payload):
    """Accepts the API envelope, {"records": [...]}, a list of records or a single record."""
    if isinstance(payload, dict) and payload.get("isSuccess") is False:
        raise ImportErrorWithDetail("источник вернул isSuccess=false")
    if isinstance(payload, dict) and "data" in payload:
        payload = payload["data"] or {}
    expected = payload.get("total_records") if isinstance(payload, dict) else None
    if isinstance(payload, dict) and "records" in payload:
        payload = payload["records"]
    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        raise ImportErrorWithDetail("ожидался JSON с массивом records")
    if expected is not None and (type(expected) is not int or expected != len(payload)):
        raise ImportErrorWithDetail("total_records не совпадает с числом записей")
    good, problems, seen = [], [], set()
    for i, r in enumerate(payload):
        cid = r.get("conversation_id") if isinstance(r, dict) else None
        if isinstance(cid, str) and cid:
            if cid in seen:
                raise ImportErrorWithDetail(f"повторяющийся conversation_id: {cid}")
            seen.add(cid)
        problem = _problem(r)
        if problem:
            problems.append(f"запись {i}: {problem}")
            if isinstance(cid, str) and cid:
                good.append({"conversation_id": cid, "channel": None, "language": None,
                             "audio_url": None, "transcript": [], "import_error": problem})
        else:
            good.append(r)
    return good, problems


def _problem(r):
    if not isinstance(r, dict) or not isinstance(r.get("conversation_id"), str) or not r["conversation_id"]:
        return "нет conversation_id"
    if r.get("channel") not in ("agent chat", "voice call") or r.get("language") not in ("RU", "KZ", "EN"):
        return "некорректный channel или language"
    t = r.get("transcript")
    if not isinstance(t, list) or not t:
        return "пустой transcript"
    for m in t:
        if not isinstance(m, dict) or m.get("speaker") not in ROLES or not isinstance(m.get("text"), str):
            return "некорректная роль или текст реплики"
        ts = m.get("timestamp")
        try:
            if not isinstance(ts, str) or not ts:
                raise ValueError
            if r["channel"] == "voice call":
                if "T" not in ts or datetime.fromisoformat(ts).utcoffset() is None:
                    raise ValueError
            elif not re.fullmatch(r"(?:\d+:)?\d+:[0-5]\d", ts):
                raise ValueError
            if not math.isfinite(parse_time(ts)):
                raise ValueError
        except (ValueError, TypeError, OverflowError, OSError):
            return "некорректный timestamp реплики"
    url = r.get("audio_url")
    if url and (not isinstance(url, str) or not url.startswith("https://")):
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
