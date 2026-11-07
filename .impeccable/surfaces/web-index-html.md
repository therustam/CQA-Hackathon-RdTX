---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: ["web/cqa.css","web/js/cqa.js"]
---

## Scope

Whole CQA web app (web/index.html + web/cqa.css + web/js/cqa.js): list, card, appeal queue, checklist editor. Mode: Operate. Code-led (no image generation in this harness).

## Audience and task

Quality specialist and reviewer at Freedom Broker support; jury watches on a projector. Task: import, evaluate, read verdicts with evidence, appeal, decide, edit checklist.

## Direction contract

THESIS: A calm product dashboard: fixed sidebar + top bar, white panels on a grey canvas, every verdict cited to a numbered message. Replaces the earlier green Clinical Chart direction (owner decision, 2026-11-07).
OWN-WORLD: Neutral zinc palette, near-black primary, one blue accent for links only, meaning colours (ok/warn/bad) always next to text, yellow for evidence; tabular numerals; soft card shadows, no gradients or glass.
STORY: Open the overview, see where points are lost, drill into the dialogs, open a card, click a verdict to land on its message, dispute it, watch the reviewer decide in the inbox and the total move.
FIRST VIEWPORT: Overview: four KPI panels, score distribution, segment averages, criteria-loss table.
FORM: See DESIGN.md (tokens, shell, screens, rules).
