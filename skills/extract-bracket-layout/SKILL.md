---
name: extract-bracket-layout
description: Extract initial bracket slot order and advancement connections from publicly published tournament HTML, PDF, or image pages when CSV match data alone does not reveal who meets which winner. Use this for tournaments like the Emperor's Cup or Levain Cup before results exist, and output a reusable bracket definition for season_map or a companion JSON file.
---

# Extract Bracket Layout

Use this skill when a tournament page already shows the official bracket structure, but CSV or schedule data alone cannot tell which match winner advances to which next match.

Typical triggers:

- "天皇杯の PDF トーナメント表から bracket_order を作りたい"
- "ルヴァンカップの公開ページを見て、試合前の接続定義を起こしたい"
- "CSV だけでは勝者の接続先が分からないので、公式 HTML/PDF を元に初期配置を定義したい"

This skill is for recovering **structure**, not scores. Treat results shown on the page as incidental. The target output is a stable bracket definition that would still be valid before kickoff.

## Workflow

1. Identify the official source type.
2. Extract only the structural information needed to reconstruct the bracket.
3. Normalize that structure into a reusable definition.
4. Record assumptions and unresolved ambiguities explicitly.

Read [references/source-patterns.md](references/source-patterns.md) for source-specific heuristics.
Read [references/output-schema.md](references/output-schema.md) before creating the final definition.

## Step 1: Classify the source

Choose one source mode:

- **Structured HTML**: bracket is represented by DOM text or repeated card elements.
- **HTML with embedded images**: the page mostly contains bracket images or PDF links.
- **PDF / image bracket**: the bracket itself is visual, so infer structure from spatial layout.

Prefer official sources over scraped mirrors.

If both HTML and PDF exist:

- Prefer the PDF when it contains the authoritative bracket image.
- Use the HTML page for context such as section names, tabs, or round labels.

## Step 2: Recover the minimal structure

Extract only what is needed for a future-proof bracket definition:

- round names in display order
- entry slots at the earliest visible round
- which two slots feed each match in the next round
- byes / seeded entries / TBD placeholders
- disconnected sections caused by redraws or later draws

Ignore:

- final scores
- kickoff times unless they help disambiguate which visual match belongs to which round
- decorative labels, sponsor marks, legends

## Step 3: Normalize to a reusable definition

Output one of these:

- `bracket_order` only, if the tournament is a single standard binary tree and slot order is sufficient
- a richer bracket definition, if any of the following are true:
  - the tournament has byes that matter structurally
  - there are multiple disconnected sections
  - a later round is redrawn or re-seeded
  - the page shows placeholders such as "Match 1 winner" instead of team names

Use the schema and examples in [references/output-schema.md](references/output-schema.md).

## Step 4: Validate before handing off

Check all of these:

- every non-root match has exactly two feeders unless it is explicitly a bye
- every earliest-round slot is used at most once
- round order matches the official page
- disconnected or redrawn sections are not forced into a false single tree
- the output would still make sense if all results were removed from the source page

If any ambiguity remains, include an `assumptions` or `unresolved` section instead of guessing silently.

## Source-specific guidance

### Structured HTML

- Inspect repeated match cards, round containers, headings, and anchor text.
- If winner labels already replaced team names, look for hidden text, alt text, or linked match labels.
- Extract the bracket from the DOM before attempting OCR-like reasoning.

### HTML with embedded images

- First identify whether the image is a single bracket or multiple section images.
- Use nearby headings such as "プライムラウンド", "プレーオフラウンド", "ラウンド16まで" to split the definition into sections when needed.
- If the page links to a PDF, use the PDF as the primary structural source.

### PDF / image bracket

- Read the bracket as a graph from the earliest visible round toward the final.
- Treat horizontal or vertical alignment as the primary signal for feeder relationships.
- Record slot order exactly as it appears top-to-bottom or left-to-right in the earliest visible round.
- When the bracket is visually symmetric, extract one half at a time, then join at the parent round.

## Output expectations

The final output should include:

- source URLs
- source type
- target scope, for example "準々決勝以降" or "1stラウンド Group A"
- chosen definition format
- the actual JSON or season_map-ready snippet
- assumptions and unresolved points

## Optional helper

Use `scripts/init_bracket_spec.py` to generate a blank JSON scaffold when the tournament is too large to draft by hand.

Example:

```bash
python skills/extract-bracket-layout/scripts/init_bracket_spec.py \
  --title "Emperor's Cup 2025 R16 and later" \
  --round "ラウンド16" \
  --round "準々決勝" \
  --round "準決勝" \
  --round "決勝" \
  --slot R16-1 --slot R16-2 --slot R16-3 --slot R16-4 \
  --slot R16-5 --slot R16-6 --slot R16-7 --slot R16-8 \
  --slot R16-9 --slot R16-10 --slot R16-11 --slot R16-12 \
  --slot R16-13 --slot R16-14 --slot R16-15 --slot R16-16
```

The helper only creates a scaffold. You still need to fill in feeder relationships from the official bracket.
