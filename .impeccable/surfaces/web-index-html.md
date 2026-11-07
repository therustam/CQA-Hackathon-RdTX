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

THESIS: Each conversation is a chart: vitals on top, every finding flagged and cited to a numbered message, the reviewer co-signs; refuses the KPI-tile SaaS dashboard with sidebar and cards.
OWN-WORLD: White ruled chart paper, flat deep-green #12392B bands, light-green #A6E07B signal, red alert band for gross errors, amber for pending review; result flags as boxed glyphs (✓ ✗ N/A, step/max); tabular numerals; no shadows, gradients or glass; m-ids and 01-08 as primary index type.
STORY: See the dataset, open a chart, click any verdict to land on its message, dispute one finding, watch the reviewer co-sign and the total move.
FIRST VIEWPORT: Card screen. Full-width green vitals strip: conversation id large, channel, language, total 88.13 at display size, section bars, gross-error alert band beneath when flagged. Below: left 42% transcript notes with m-ids and timestamps; right 58% results table, one fixed-furniture row per criterion. Primary action (Оценить / Апелляция) at strip right.
FORM: Clinical Chart, position 7 of 7, seed 4bdc5a6a. Signature interaction: audio position marker runs down the call transcript; evidence chips seek and highlight.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
