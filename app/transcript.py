"""Transcript preprocessing: message ids, time parsing, hold segments, call audio offsets.

Original timestamps and order are kept for the UI; the prompt gets a time-sorted, de-duplicated view.
Event phrases below describe the data format (system messages of the chat/telephony platform),
not checklist criteria.
"""
from datetime import datetime

LONG_PAUSE_S = 60

HOLD_ON = ("находится на удержании", "is on hold", "customer on hold")
HOLD_OFF = ("больше не находится на удержании", "no longer on hold", "taken off hold")
REC_START = ("запись и транскрибирование запущены", "жазу және транскрипция басталды", "recording and transcription started")
REC_PAUSE = ("запись и транскрибирование приостановлены", "recording and transcription paused")
REC_RESUME = ("запись и транскрибирование возобновлены", "recording and transcription resumed")


def parse_time(ts):
    """Seconds: 'MM:SS' / 'H:MM:SS' for chats, epoch seconds for ISO 8601 call timestamps."""
    if not ts:
        return None
    if "T" in ts:
        return datetime.fromisoformat(ts).timestamp()  # Python 3.11+ reads 7 fractional digits
    seconds = 0.0
    for part in ts.split(":"):
        seconds = seconds * 60 + float(part)
    return seconds


def _has(text, phrases):
    t = text.lower()
    return any(p in t for p in phrases)


def prepare(record):
    """Messages in original order with stable ids m0..mN, relative time, hold and audio info."""
    msgs, seen, on_hold = [], set(), False
    for i, m in enumerate(record.get("transcript") or []):
        text = m.get("text") or ""
        if m.get("speaker") == "system":
            if _has(text, HOLD_OFF):
                on_hold = False
            elif _has(text, HOLD_ON):
                on_hold = True
        key = (m.get("timestamp"), m.get("speaker"), text)
        msgs.append({"id": f"m{i}", "index": i, "timestamp": m.get("timestamp"), "speaker": m.get("speaker"),
                     "text": text, "t": parse_time(m.get("timestamp")),
                     "internal": on_hold and m.get("speaker") == "operator", "duplicate": key in seen})
        seen.add(key)
    times = [m["t"] for m in msgs if m["t"] is not None]
    start = min(times) if times else 0
    for m in msgs:
        m["t"] = None if m["t"] is None else round(m["t"] - start, 3)
    is_call = bool(record.get("audio_url")) or record.get("channel") == "voice call"
    for m, off in zip(msgs, _audio_offsets(msgs) if is_call else [None] * len(msgs)):
        m["audio_offset"] = off
    return msgs


def _audio_offsets(msgs):
    """Position in the recording: time since recording start minus paused stretches.

    Checked on the 5 DEV calls: predicted length matches the mp3 within 1-7 s (docs/decisions.md).
    """
    events = sorted((m["t"], m["text"]) for m in msgs if m["speaker"] == "system" and m["t"] is not None)
    starts = [t for t, x in events if _has(x, REC_START)]
    rec_start = starts[0] if starts else 0
    pauses, paused_at = [], None
    for t, x in events:
        if _has(x, REC_PAUSE) and paused_at is None:
            paused_at = t
        elif _has(x, REC_RESUME) and paused_at is not None:
            pauses.append((paused_at, t))
            paused_at = None
    if paused_at is not None:
        pauses.append((paused_at, float("inf")))
    out = []
    for m in msgs:
        if m["t"] is None:
            out.append(None)
            continue
        cut = sum(max(0, min(m["t"], b) - a) for a, b in pauses if a >= rec_start)
        out.append(round(max(0.0, m["t"] - rec_start - cut), 1))
    return out


def _clock(seconds):
    s = int(seconds or 0)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def render(msgs):
    """Prompt view: stable time sort, exact duplicates dropped, long pauses and hold marked."""
    lines, prev = [], None
    ordered = sorted((m for m in msgs if not m["duplicate"]), key=lambda m: (m["t"] is None, m["t"] or 0))
    for m in ordered:
        role = m["speaker"] + (" (внутренняя консультация с коллегой, клиент на удержании — не реплика клиенту)"
                               if m["internal"] else "")
        pause = ""
        if prev is not None and m["t"] is not None and m["t"] - prev >= LONG_PAUSE_S:
            pause = f" (пауза {_clock(m['t'] - prev)})"
        lines.append(f"[{m['id']}] {_clock(m['t'])}{pause} {role}: {m['text']}")
        prev = m["t"] if m["t"] is not None else prev
    return "\n".join(lines)


def first_operator_id(msgs):
    return next((m["id"] for m in msgs if m["speaker"] == "operator" and not m["internal"]), None)
