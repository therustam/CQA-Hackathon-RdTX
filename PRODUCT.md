# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML, CSS and JavaScript (ES modules, no framework, no build) served by a FastAPI backend — required by the hackathon brief so the UI can later become a Dynamics 365 HTML web resource.

## Users

- **Quality specialist** (primary): configures the checklist, imports conversations by `group_id` or JSON, runs evaluation, reads results with evidence, files appeals on individual criteria.
- **Reviewer**: works the appeal queue, inspects disputed score, comment and dialogue fragment, confirms or changes the score with a reason.
- **Jury** (Freedom Broker staff): watches a 5-minute demo and checks the control set and a live criterion replacement.

No login: the two roles are a switch in the header.

## Product Purpose

Conversation Quality Analytics (CQA) for Freedom Broker support: an LLM scores each operator conversation (chats and calls; RU, KZ, EN) against a configurable checklist, every answer points to the exact message it rests on, and code computes all points, N/A redistribution and totals. Success = a QA expert agrees with the scores, can click from any verdict to its evidence, can dispute and resolve a criterion with an auditable history, and can change the checklist without code.

## Positioning

Checklist-as-configuration plus verdicts that are always tied to a clickable message; the AI never produces numbers, so totals are exact and reproducible, and appeals are overrides on top of an untouched AI result.

## Operating Context

Internal back-office tool, desktop. Demo on a projector / big screen in Russian. Later embedded in Dynamics 365 (single mount point `#cqa-root`, `cqa-` class prefix, one config object).

## Capabilities and Constraints

- Six functions: create/edit checklist (versions), evaluate a conversation, show result; open card, file appeal, decide appeal with recalculation.
- Result per criterion: answer or step, points, weight, redistributed weight, explanation, evidence links, checked range for missed actions, N/A reason; section results; total (2 decimals, half-up); gross-error flag shown separately.
- Calls: transcript with audio player; evidence seeks the recording.
- UI copy in Russian; transcripts shown verbatim in their language with original timestamps.

## Brand Commitments

Follow Freedom Broker's look as seen in the organizers' materials: deep green as the brand anchor with light-green accents. No official logo or brand assets are on hand — do not fabricate them.

## Evidence on Hand

DEV set of 65 conversations (60 synthetic chats, 5 real calls) in `data/dev.json` (local only). Checklist PDF in `docs/checklist.pdf`. No accuracy figures or cost figures exist yet; do not invent them in the UI.

## Product Principles

1. Every verdict is traceable to a message.
2. Numbers come from code, never from the model.
3. The AI result is never overwritten; human decisions are layered and visible.
4. Configuration over code: a new criterion works after saving.
5. Legible at projector distance in five minutes.

## Accessibility & Inclusion

Projector legibility: large body text, strong contrast, status never carried by color alone.
