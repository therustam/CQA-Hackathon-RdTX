# data/

This folder is gitignored (except this file). The DEV set contains real customer calls and signed
recording links, so it is not published with the repository.

You do not need any file here to run the app: enter a `group_id` (e.g. `DEV`) in the UI and the
backend fetches the set from the organizers' API (`CQA_SOURCE_URL` in `.env`), or upload a JSON file
in the UI.

Optional local files:

- `dev.json` — raw API response for `group_id=DEV` (`{"isSuccess": true, "data": {"records": [...]}}`).
  Import it with the "Загрузить JSON" button in the UI.
- `gold.json` — the team's reference labels for `scripts/bench.py`:
  `{"p1-ru-001": {"01": "yes", "02": "na", "04": 20, "08": "no"}, ...}`
  (binary/flag criteria: `yes` / `no` / `na`; scale criteria: the step number or `na`).
