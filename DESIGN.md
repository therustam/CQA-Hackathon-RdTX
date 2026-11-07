---
name: CQA
description: Conversation quality chart for Freedom Broker support. Every verdict is cited to a numbered message.
colors:
  chart-green: "#12392b"
  chart-green-2: "#1d553f"
  green-ink: "#e9f3ea"
  green-ink-2: "#b9d3c1"
  signal-green: "#a6e07b"
  ink: "#17201b"
  ink-2: "#46524b"
  ink-3: "#6a756f"
  paper: "#ffffff"
  paper-2: "#f3f6f2"
  paper-3: "#e8ede7"
  rule: "#d5dcd4"
  rule-strong: "#aab6ad"
  yes: "#17673b"
  yes-bg: "#e2f2e3"
  no: "#a8231b"
  no-bg: "#fbe6e3"
  na: "#56625b"
  na-bg: "#e9ede9"
  amber: "#7a4f00"
  amber-bg: "#fff0cf"
  alert-red: "#b3261e"
  highlight: "#f1f8c8"
  highlight-rule: "#8fb93a"
  range: "#f6f8ee"
  focus: "#2f7a52"
typography:
  display:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  subtitle:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-small:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  section-heading:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.05em"
  index:
    fontFamily: "Golos Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  page: "28px"
components:
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
  button-primary:
    backgroundColor: "{colors.chart-green}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.chart-green-2}"
  button-signal:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.chart-green}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chart-green-2}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-small:
    padding: "0 10px"
    height: "32px"
    typography: "{typography.body-small}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "17px"
    padding: "0 12px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.chart-green}"
    textColor: "{colors.green-ink}"
  tag-ok:
    backgroundColor: "{colors.yes-bg}"
    textColor: "{colors.yes}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "26px"
  tag-warn:
    backgroundColor: "{colors.amber-bg}"
    textColor: "{colors.amber}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "26px"
  tag-err:
    backgroundColor: "{colors.no-bg}"
    textColor: "{colors.no}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "26px"
  tag-alert:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "26px"
  verdict-yes:
    backgroundColor: "{colors.yes-bg}"
    textColor: "{colors.yes}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
    width: "84px"
  verdict-no:
    backgroundColor: "{colors.no-bg}"
    textColor: "{colors.no}"
    rounded: "{rounded.sm}"
    height: "34px"
  verdict-na:
    backgroundColor: "{colors.na-bg}"
    textColor: "{colors.na}"
    rounded: "{rounded.sm}"
    height: "34px"
  verdict-step:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.chart-green}"
    rounded: "{rounded.sm}"
    height: "34px"
  evidence-ref:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.chart-green}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "26px"
  evidence-ref-hover:
    backgroundColor: "{colors.signal-green}"
  vitals-strip:
    backgroundColor: "{colors.chart-green}"
    textColor: "{colors.green-ink}"
    padding: "18px 28px 20px"
  alert-band:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.paper}"
    padding: "12px 28px"
  transcript-row-playing:
    backgroundColor: "{colors.chart-green}"
    textColor: "{colors.green-ink}"
    padding: "7px 20px"
  transcript-row-cited:
    backgroundColor: "{colors.highlight}"
    padding: "7px 20px"
---

# Design System: CQA

## Overview

**Creative North Star: "The Clinical Chart"**

Each conversation is a patient chart. Vitals sit in a flat deep-green strip across the top (identifier, channel, language, the total at display size, one bar per section), a red alert band drops beneath it when a gross error is found, and the body below is ruled paper: transcript notes on the left, one fixed row per criterion on the right. Every finding is boxed, scored, and cited to a numbered message (m0, m1, ...), and the reviewer's decision is written into the chart beneath the AI result instead of replacing it.

The system is dense, flat and ruled. Structure comes from horizontal rules (2px green to open an entry, 1px grey between rows), tinted bands, and fixed column furniture, not from cards, shadows or panels floating on a grey canvas. Numbers are tabular everywhere so totals, weights and timestamps align in columns. Colour carries meaning (green = brand and pass, red = fail and gross error, amber = pending review, pale yellow-green = cited evidence) and every coloured state also carries a word.

It refuses the KPI-tile SaaS dashboard: no sidebar, no grid of stat cards, no gradients, glass or drop shadows. The surface was built for a projector as much as a desk, hence a 17px body and heavy, short labels.

**Key Characteristics:**
- Flat deep-green vitals strip with the total at 64px; light-green signal as the single bright accent.
- Ruled chart paper: entries open with a 2px green top rule, rows divide with 1px grey rules.
- Boxed word verdicts (ДА / НЕТ / N/A / step of max) and m-id evidence chips that seek the transcript.
- Tabular numerals and m-ids / 01-08 as primary index type.
- No shadows, gradients, cards or decorative icons.

## Colors

A deep forest green and its pale ink carry the brand; one light-green signal is the only bright accent; red, amber and green tints are reserved for verdict semantics.

### Primary
- **Chart Green** (chart-green): the vitals strip, primary buttons, selected chips and segmented switches, criterion numbers, section-heading rules, the opening rule of every appeal and editor entry, and the playback-cursor row.
- **Chart Green Raised** (chart-green-2): hover for primary buttons, meter and section-bar tracks inside the strip, link colour on paper, the dividing rule inside the strip.
- **Green Ink** (green-ink) and **Green Ink Muted** (green-ink-2): text on Chart Green; muted for metadata and labels in the strip. Pure white is used only for the identifier and the total on green.

### Secondary
- **Signal Green** (signal-green): the single bright accent. Section-bar and meter fills, the "Оценить" call to action, the recalculated total in the score trail, evidence-chip hover, text selection, the arrival flash on a cited message. Never a background for paragraphs.

### Tertiary (verdict semantics)
- **Pass Green** (yes / yes-bg), **Fail Red** (no / no-bg), **Not-applicable Grey** (na / na-bg), **Pending Amber** (amber / amber-bg): always used as a pair (dark text and border on its own tint).
- **Alert Red** (alert-red): solid. Only for gross errors: the alert band, the alert verdict box, the "выявлено m11" flag chip and the alert tag.
- **Evidence Highlight** (highlight + highlight-rule): the cited-message row (tinted with lime rules top and bottom), the selected criterion row, and the evidence chips.
- **Checked Range** (range): faint wash on the transcript rows a "missed action" verdict covered.

### Neutral
- **Ink** (ink), **Ink 2** (ink-2), **Ink 3** (ink-3): body text, secondary text and subheads, metadata and table headers.
- **Paper** (paper), **Paper 2** (paper-2), **Paper 3** (paper-3): white chart page; faint green-grey for hover rows, the transcript column and trail boxes.
- **Rule** (rule) and **Rule Strong** (rule-strong): 1px row dividers; input, button and chip strokes.
- **Focus** (focus): the 3px focus outline.

### Named Rules
**The One Signal Rule.** Signal Green is the only bright colour on the page. It fills progress and marks the next action; it never tints a surface larger than a row.

**The Word-With-Colour Rule.** No state is colour alone. Every tint carries its word: ДА, НЕТ, N/A, "выявлено", "на проверке".

**The Red Is Gross Rule.** Solid Alert Red means a gross error, nothing else. Ordinary failures use the Fail Red pair on its pale tint.

## Typography

**Display Font:** Golos Text (self-hosted, Cyrillic and Latin subsets, weights 400-700), with Segoe UI, system-ui
**Body Font:** Golos Text
**Label/Mono Font:** Golos Text with tabular numerals; no separate mono.

**Character:** One Russian-native grotesque at every size. Hierarchy comes from weight and size jumps, not from family contrast; tabular figures on the root make every number column align.

### Hierarchy
- **Display** (700, 64px, line-height 1, -0.03em): the conversation total in the vitals strip only, with "/ 100" in 22px regular green ink. 48px on phones.
- **Headline** (700, 34px, -0.02em): the conversation identifier in the strip; page titles use 30px.
- **Title** (700, 22px): appeal entry headings, decision outcome, empty-state headings; also criterion numbers (01-08) in Chart Green.
- **Subtitle** (700, 18px): panel heads ("Транскрипт", "Оценка по критериям") and editor block heads.
- **Body** (400, 17px, 1.5): transcript text, explanations (max 75ch), table cells. Criterion titles 600 at 17px. 16px on phones.
- **Body small** (15px): bot and system lines, small buttons, chips, trail boxes.
- **Label** (500, 14px, sentence case, Ink 2): form field names sit above their control as sentence-case subheads; table headers 600 in Ink 3.
- **Section heading** (700, 14px, uppercase, 0.05em, Chart Green, 2px green underline): the criteria section titles in the results panel, with the section score at the right in sentence case.
- **Index** (700, 13px): m-ids, timestamps (400) and speaker role (uppercase 0.04em, coloured by speaker) in each transcript row.

### Named Rules
**The Tabular Rule.** Numerals are tabular on the root. Totals, weights, timestamps and m-ids always line up.

**The Two Uppercases Rule.** Uppercase appears in exactly two places: criteria section headings and transcript speaker roles. Field names, page titles and everything else stay sentence case.

## Layout

A top bar (64px, 5px Chart Green top rule) holds brand, three underlined tabs, the model line and the role switch. List, appeals and editor pages sit in a centred page (max 1480px, 28px padding). The conversation card fills the viewport below the bar: full-width vitals strip, optional full-width bands, then a two-column chart split 42 / 58 (transcript / results) with each column scrolling independently.

Spacing steps are 4, 8, 12, 16, 20 and 28px: 20px is the panel gutter, 28px the page and strip gutter. Criterion rows use fixed furniture (40px number, flexible title, 96px verdict, 112px points). Transcript rows are a 52px id / 74px time / text grid.

At 1100px and below the chart stacks (transcript capped at 70vh), the strip actions move below the score, and appeal columns and editor grids collapse. At 640px the nav becomes a full-width scrolling tab row, the transcript and results flow in the page scroll instead of nested scrollers, criterion rows reflow to number / title+verdict / points, and the conversation table turns into two-column rows.

## Elevation & Depth

Fully flat. There are no box shadows anywhere in the build. Depth is tonal and ruled: the Chart Green strip and red band sit as solid bands, the transcript column is Paper 2 against a white results column, and entries are separated by rules. The only z-lift is positional (sticky table header, sticky editor save bar with a 2px green top rule, the toast in solid Ink).

### Named Rules
**The Ruled Chart Rule.** Separate with rules and bands, never with shadows or floating cards. An entry opens with a 2px Chart Green top rule; rows inside it divide with 1px Rule.

## Shapes

Corners are small and functional: 4px on compact data marks (tags, verdict boxes, evidence chips, flag chip), 6px on controls and soft containers (buttons, inputs, selects, notices, trail boxes, inline forms, toasts), 2px on the focus outline. Filter chips and the pending-count badge are full pills (half their height). Bands, the vitals strip, appeal entries and editor blocks have no radius and no border box at all; they are defined by their top rule or their fill. Verdict boxes use a 2px stroke, everything else 1px.

## Components

### Buttons
Restrained, 40px tall controls with a 1px stroke.
- **Shape:** 6px corners; 40px tall, 16px side padding; small variant 32px / 10px / 15px text.
- **Secondary (default):** white with Rule Strong stroke and Ink text; hover to Paper 2.
- **Primary:** Chart Green fill, Green Ink text; hover to Chart Green Raised.
- **Signal:** Signal Green fill with Chart Green bold text; the "Оценить" call to action.
- **Ghost:** no stroke, Chart Green Raised text; inline actions such as "Апелляция".
- **On the strip:** buttons invert to transparent with a Green Ink Muted stroke; selects take the raised green fill.
- **Disabled:** 50% opacity and a not-allowed cursor; evaluation controls disabled for a missing API key always carry a `title` giving the reason, and the top bar says "Модель не подключена — нет API-ключа".

### Chips
- **Filter chips:** 34px pills, white with Rule Strong stroke and Ink 2 text; pressed state fills Chart Green. The segmented role switch follows the same pressed treatment in a 6px bordered group.
- **Status tags:** 26px, 4px corners, 600 weight, tint plus word (ok / warn / err / neutral / plain outline); alert tag is solid red with white text.

### Cards / Containers
There are no cards. Appeal entries and checklist editor blocks are ruled chart entries: 2px Chart Green top rule, a head row closed by a 1px Rule, no side borders, no radius, no grey head band, 28px between entries. Inside an appeal, the two columns (dispute / decision) divide with a 1px vertical rule; the decision outcome is set at 22px bold, signatures sit under a dashed rule, and the disputed comment is an amber quote block.

### Inputs / Fields
- **Style:** 40px, 1px Rule Strong stroke, 6px corners, white, 12px padding; textareas resize vertically.
- **Label:** sentence-case field name above the control (14px, 500, Ink 2), 4px gap.
- **Focus:** 3px Focus outline with 2px offset (global).
- **Error:** Fail Red text line beneath the form; notices use tint pairs.

### Navigation
Text tabs in the top bar, 500 weight Ink 2, with a 3px bottom rule. Hover tints Paper 2; the current page turns Chart Green with a Chart Green underline. A pending-appeals count sits in an amber pill. On phones the tabs become a full-width horizontal scroller under the brand.

### Vitals Strip (signature)
Flat Chart Green band: back link, identifier at 34px white, metadata line in Green Ink Muted with bold values, total at 64px with the score trail ("Исходно 100 → 85", new value in Signal Green), actions at the right. A 1px raised-green rule then section cells: name, percentage, a 6px Signal Green bar on a raised-green track, points line. A flag-only section (gross errors) shows a solid red flag chip "выявлено" with its m-id chips, or the words "не выявлено", never a meter.

### Criterion Row and Verdict Box (signature)
One fixed-furniture row per criterion: Chart Green two-digit number, 600 title with the answer type below, a boxed word verdict, points ("10 из 10" over "вес 10 → 10"). The verdict is a 34px box with a 2px stroke: ДА (pass pair), НЕТ (fail pair), N/A (grey on Rule Strong stroke), step/max (Chart Green on white), alert (solid red), pending (amber pair). Below: explanation, "Основание:" with evidence chips, the N/A reason or checked-range trail, actions. The selected row takes the Evidence Highlight.

### Transcript Row and Evidence Chip (signature)
Each message row: m-id, timestamp (a seek link on calls), speaker role coloured by party (operator green, client blue, bot and system muted, system italic), text. Evidence chips are 26px lime-ruled boxes with the m-id in bold green; clicking one scrolls to the row, flashes it Signal Green and settles to the Evidence Highlight with lime rules top and bottom. During call playback the row being heard inverts to Chart Green with Green Ink text across all its cells; no side bar.

### Bands
Full-width 12px / 28px bands under the strip: solid Alert Red for gross errors (evidence chips go translucent white), amber tint for pending review, fail tint for errors. The batch progress bar is a Chart Green band with a 10px Signal Green meter.

## Do's and Don'ts

### Do:
- **Do** open every entry (appeal, editor block, sticky save bar) with a 2px Chart Green top rule and divide rows with 1px Rule.
- **Do** give every verdict a boxed word (ДА / НЕТ / N/A / step of max) in its tint pair with a 2px stroke.
- **Do** cite evidence with m-id chips that scroll to and highlight the message.
- **Do** keep numerals tabular and right-align numeric columns.
- **Do** write field names as sentence-case subheads above their control.
- **Do** disable model-dependent actions with a `title` stating the reason when no API key is configured.
- **Do** honour reduced motion: animations and transitions are removed under `prefers-reduced-motion`.

### Don't:
- **Don't** use box shadows, gradients, glass or floating cards; depth is bands and rules.
- **Don't** put a border box, radius or grey head band on chart entries.
- **Don't** use glyphs (check marks, crosses) as verdicts or decorative icons; the only icons are the back chevron and inline button SVGs.
- **Don't** put small uppercase labels above headings or fields; uppercase is limited to criteria section headings and speaker roles.
- **Don't** use solid Alert Red for anything but gross errors.
- **Don't** show a meter for a flag-only section; show the red "выявлено" chip or "не выявлено".
- **Don't** mark the playing transcript row with a side bar; invert the whole row to Chart Green.
- **Don't** fabricate a Freedom Broker logo or brand assets.
