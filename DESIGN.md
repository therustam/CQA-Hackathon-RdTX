---
name: CQA
description: Back-office dashboard for conversation quality at Freedom Broker support. Neutral product UI; every verdict cites a numbered message.
colors:
  bg: "#f7f7f8"
  surface: "#ffffff"
  surface-2: "#fafafa"
  hover: "#f4f4f5"
  text: "#18181b"
  text-2: "#52525b"
  text-3: "#71717a"
  text-4: "#a1a1aa"
  border: "#e4e4e7"
  border-2: "#d4d4d8"
  primary: "#18181b"
  primary-hover: "#27272a"
  accent: "#2563eb"
  accent-bg: "#eff4ff"
  accent-line: "#dbe4ff"
  ok: "#15803d"
  ok-bg: "#ecfdf3"
  bad: "#b42318"
  bad-bg: "#fef3f2"
  bad-line: "#fecdca"
  warn: "#b45309"
  warn-bg: "#fffaeb"
  warn-line: "#fedf89"
  neutral: "#52525b"
  neutral-bg: "#f4f4f5"
  mark: "#fef9c3"
  mark-line: "#eab308"
  mark-strong: "#fde68a"
  bar-ok: "#15803d"
  bar-warn: "#f59e0b"
  bar-bad: "#ef4444"
  range: "#fafaf6"
typography:
  kpi:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  kpi-small:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  heading:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
  subheading:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-small:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  overline:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  bar: "3px"
  xs: "4px"
  bar-lg: "5px"
  sm: "6px"
  md: "8px"
  count: "10px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "28px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-small:
    padding: "0 10px"
    height: "30px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  filter-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "32px"
  filter-pill-active:
    backgroundColor: "{colors.hover}"
  nav-item:
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  badge-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    height: "22px"
  badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    height: "22px"
  badge-bad:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad}"
    rounded: "{rounded.pill}"
    height: "22px"
  verdict:
    rounded: "{rounded.sm}"
    height: "24px"
    typography: "{typography.caption}"
  evidence-ref:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "22px"
---

# CQA design system

A quiet, neutral product dashboard in the spirit of modern admin panels: grey canvas, white panels, near-black primary, one blue accent reserved for links. Colour carries meaning only (ok / warn / bad / evidence) and always sits next to text.

## Shell

- Grid: sidebar (248px, collapses to a 68px icon rail; auto-rail under 900px) | top bar (56px) over the content area.
- Only the content area scrolls, with `scrollbar-gutter: stable`, so switching screens never shifts the frame.
- Sidebar: brand, navigation (Обзор, Диалоги, Апелляции, Чек-листы), and at the bottom the model status dot and the role switch (a property of the user, not a section).
- Top bar: breadcrumbs on the left, the screen's actions on the right (filter pills, secondary buttons, one primary button). Every screen puts its actions there.
- Pages: max 1440px, 28px padding. Full-height screens (card, appeals, editor) split into panels that scroll independently.

## Screens

- **Обзор** (home, `#/`): four KPI panels, score distribution, averages by language and channel, a "where points are lost" criteria table. Numbers come from `/api/stats`, computed by `app/scorer.summarize`.
- **Диалоги** (`#/dialogs`): one panel with a search box and filter pills, a dense table with score mini-bars. Import opens in a dialog. Batch progress is a floating panel owned by the shell.
- **Карточка** (`#/c/<id>`): summary panel (id, meta, total, section bars), gross-error alert, then transcript | criteria. Criteria are compact rows; the open one shows explanation, evidence chips, appeal history and actions.
- **Апелляции** (`#/appeals`): inbox, with the queue on the left and the selected case on the right (AI verdict, specialist comment, fragment, decision).
- **Чек-листы** (`#/checklist`): structure tree (settings, sections, criteria with weights, weight-sum bar) | editor of the selected item. Service ids are moved into «Дополнительно».

## Rules

- Focus is neutral (grey ring), never a blue glow. Text inputs show a soft grey ring on focus. Pills show the ring only for keyboard focus.
- A filter pill that narrows the list gets the `data-active` tint, and «Сбросить» appears.
- Score tone: ≥90 ok, 70–90 warn, <70 bad, always next to the number.
- Evidence is yellow (`mark`), both in chips and in the highlighted transcript lines.
- No shadows beyond `shadow-control` / `shadow-card` / `shadow-pop`, no gradients, no glass.
