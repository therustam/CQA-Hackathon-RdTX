"""Build results/<set>/results.json for submission (organizers' format 1.0).

Usage:
  python -m scripts.export_results --group DEV --out results/dev/results.json [--fetch] [--evaluate]
  python -m scripts.export_results --group <PROD group_id> --out results/prod/results.json --fetch --evaluate --expect 10

--fetch     import the set from the organizers' API (CQA_SOURCE_URL) first
--evaluate  evaluate conversations that have no complete evaluation yet (one more attempt for failed ones)
--force     with --evaluate: re-evaluate all (e.g. after switching the model); earlier answers stay in the DB
"""
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import db, export, importer  # noqa: E402
from app.main import run_evaluation  # noqa: E402  (also loads .env and initialises the DB)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--checklist", type=int)
    ap.add_argument("--team")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--evaluate", action="store_true")
    ap.add_argument("--force", action="store_true", help="with --evaluate: re-evaluate every conversation")
    ap.add_argument("--expect", type=int, help="required number of records (10 for prod)")
    args = ap.parse_args()

    if args.fetch:
        records, bad = importer.fetch_group(args.group)
        for r in records:
            db.upsert_conversation(r, args.group)
        print(f"импортировано: {len(records)}")
        for p in bad:
            print(f"ВНИМАНИЕ, ошибка входных данных: {p}")

    cl = db.checklist(args.checklist)
    if cl is None:
        sys.exit("чек-лист не найден")
    ids = [r["id"] for r in db.query("select id from conversations where group_id=? order by id", (args.group,))]
    if not ids:
        sys.exit(f"в базе нет диалогов набора {args.group!r}; добавьте --fetch")

    if args.evaluate:
        todo = [cid for cid in ids if args.force or not db.one(
            "select 1 from evaluations where id=(select max(id) from evaluations where conversation_id=? and checklist_id=?)"
            " and status='ok'", (cid, cl["id"]))]
        print(f"оцениваю: {len(todo)} из {len(ids)} …")
        with ThreadPoolExecutor(max_workers=5) as pool:
            for n, _ in enumerate(pool.map(lambda cid: run_evaluation(cid, cl), todo), 1):
                print(f"  {n}/{len(todo)}", end="\r")
        print()

    doc = export.document(cl, ids, args.team)
    lengths = {cid: len(db.conversation(cid)["transcript"]) for cid in ids}
    issues = export.problems(doc, expected_ids=ids, transcript_lengths=lengths, expect=args.expect)
    if issues:
        sys.exit("Экспорт не сохранён:\n- " + "\n- ".join(issues))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(out.suffix + ".tmp")
    temporary.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", "utf-8")
    temporary.replace(out)
    ok = sum(r["status"] == "ok" for r in doc["results"])
    print(f"{out}: {len(doc['results'])} записей, ok {ok}, модель {doc['model']['name'] or '—'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
