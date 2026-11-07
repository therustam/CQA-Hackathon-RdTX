"""Agreement of stored AI answers with the team's reference labels, per criterion and per language.

Usage:  python -m scripts.bench [--gold data/gold.json] [--checklist ID] [--out docs/eval_report.md]
gold.json: {"p1-ru-001": {"01": "yes", "02": "na", "04": 20, "08": "no"}, ...}
Compares the AI's original answers (appeal decisions are ignored). Scale criteria also report
agreement within one step.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import db  # noqa: E402


def ai_value(r):
    if r is None:
        return None
    if not r.get("applicable", True):
        return "na"
    return r["step"] if r.get("step") is not None else r.get("answer")


def main():
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", default="data/gold.json")
    ap.add_argument("--checklist", type=int)
    ap.add_argument("--out")
    args = ap.parse_args()

    gold = json.loads(Path(args.gold).read_text("utf-8"))
    cl = db.checklist(args.checklist)
    meta = {c["id"]: c for c in cl["data"]["criteria"]}
    hits = defaultdict(lambda: [0, 0, 0])  # (criterion, language) -> [exact, within one step, total]
    missing, diffs = [], []
    for cid, labels in gold.items():
        conv = db.conversation(cid)
        eid = db.latest_evaluation_id(cid, cl["id"]) if conv else None
        ev = db.evaluation(eid) if eid else None
        if not ev or ev["status"] == "error":
            missing.append(cid)
            continue
        for crit, want in labels.items():
            if crit not in meta:
                continue
            got = ai_value(ev["raw"].get(crit))
            exact = str(got) == str(want)
            near = exact
            if meta[crit]["type"] == "scale" and isinstance(got, (int, float)) and isinstance(want, (int, float)):
                steps = sorted(s["value"] for s in meta[crit]["scale"])
                near = got in steps and want in steps and abs(steps.index(got) - steps.index(want)) <= 1
            for key in ((crit, conv["language"]), (crit, "все")):
                hits[key][0] += exact
                hits[key][1] += near
                hits[key][2] += 1
            if not exact:
                diffs.append(f"| {cid} | {crit} | {want} | {got} |")

    langs = ["все", "RU", "KZ", "EN"]
    pct = lambda h: f"{100 * h[0] / h[2]:.0f}% ({h[0]}/{h[2]})" if h[2] else "—"
    lines = [f"# Согласие с эталоном — чек-лист v{cl['id']}", "",
             f"Размечено диалогов: {len(gold)}, без оценки: {len(missing)}", "",
             "| Критерий | " + " | ".join(langs) + " | ±1 ступень (все) |",
             "|---|" + "---|" * (len(langs) + 1)]
    for crit in meta:
        row = [pct(hits[(crit, lang)]) for lang in langs]
        near = hits[(crit, "все")]
        within = f"{100 * near[1] / near[2]:.0f}%" if meta[crit]["type"] == "scale" and near[2] else ""
        lines.append(f"| {crit} {meta[crit]['title']} | " + " | ".join(row) + f" | {within} |")
    total = [sum(hits[(c, lang)][i] for c in meta) for lang in langs for i in (0, 2)]
    lines.append("| **Итого** | " + " | ".join(
        f"**{100 * total[2 * k] / total[2 * k + 1]:.0f}%**" if total[2 * k + 1] else "—" for k in range(len(langs))) + " | |")
    if diffs:
        lines += ["", "## Расхождения", "", "| Диалог | Критерий | Эталон | Модель |", "|---|---|---|---|", *diffs]
    if missing:
        lines += ["", "Без оценки: " + ", ".join(missing)]
    report = "\n".join(lines) + "\n"
    print(report)
    if args.out:
        Path(args.out).write_text(report, "utf-8")


if __name__ == "__main__":
    main()
