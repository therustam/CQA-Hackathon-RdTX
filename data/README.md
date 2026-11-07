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

The current local gold.json is a preliminary review by Codex, not organizer labels or a human-expert
reference. It contains 100 partial labels for 14 conversations: three chats per RU/KZ/EN and all five
calls. Labels were assigned from transcripts before comparing model answers. Missing labels mean
unreviewed criteria, not N/A. No audio was reviewed; uncertain product-specific advice was excluded.
This selected sample cannot establish accuracy on the full DEV or PROD set.

Expert review is needed for three disagreements: identification in p4-ru-002 (account/order information
before confirmation) and p4-ru-003 (whether the early status statement is a disclosure), and closure in
p4-ru-005 (whether the agent had an opportunity to finish before the client disconnected). Do not
change labels just to match the model. Run `python -m scripts.bench --checklist 2` for the comparison;
use the appropriate checklist ID when evaluating another version.
