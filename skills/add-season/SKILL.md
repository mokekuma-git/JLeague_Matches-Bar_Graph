---
name: add-season
description: Add a new season entry to season_map.yaml with validation — team list, colors, point system, and consistency checks.
argument-hint: "[competition and season, e.g. 'J1 2027' or 'WEリーグ 26-27']"
---

# Add Season

Add a new Season Entry under an existing Competition in `docs/yaml/season_map.yaml`.

Optional argument: `$ARGUMENTS` — competition and season, e.g. `J1 2027` or
`WEリーグ 26-27`. If omitted, ask the user which competition/season to add.

## Step 1 — Gather Required Info

Ask the user for anything missing. These four keys are required on every Season Entry:

- `team_count` — number of teams
- `promotion_count` — number of promotion slots
- `relegation_count` — number of relegation slots
- `teams` — team list **in previous-season final-standings order** (this order is the
  tiebreak priority when points are equal)

## Step 2 — Review the Structure

`season_map.yaml` has a 4-layer structure: CompetitionFamily → Competition → Seasons →
Entry, with property cascade (CompetitionFamily → Competition → Season Entry; scalars are
overridden by the lower layer, arrays like `css_files`/`note` are unioned, objects like
`team_rename_map` are merged). See `docs/dev/season_map_design.md` for the full key
reference (`group_display`, `url_category`, `rank_properties`, `season_start_month`,
`data_source`, `note`, `timezone`, `promotion_label`, `interior_point_columns`) and
design rationale.

## Step 3 — Edit season_map.yaml

Edit `docs/yaml/season_map.yaml` directly. It is plain YAML — no project formatter is
required or expected.

Follow the season naming rules:

- Calendar-year season: `YYYY` (e.g. `2027`)
- Cross-year season: `YY-YY` (e.g. `26-27`)
- Sub-season group suffix appended to the year when the competition splits
  (`East`/`West`/`A`/`B`/`EastA`, …); no suffix = virtual combined result of all
  sub-seasons

The season name must match the CSV filename convention:
`{season}_allmatch_result-J{category}.csv` (category number itself never changes; only
the season name varies).

## Step 4 — Verify Team Colors

Every team in the new `teams` list must have a color defined in the CSS file(s) declared
by the competition's (cascaded) `css_files`, under `docs/`:

```bash
grep -c "<team-name-slug>" docs/*.css
```

Warn the user about any team missing a color. Per View Invariant I3, this is not a
rendering blocker — the app still draws the bars and shows a warning — but the season
entry should not ship with silently-missing colors.

## Step 5 — Run Verification

```bash
uv run python scripts/check_point_system_csv.py
uv run pytest
```

From `frontend/`:

```bash
npx vitest run
```

(covers season-map loading / property-cascade tests).

## Step 6 — Reminders

- Unknown optional keys on a Season Entry are warn-and-ignored, not fatal.
- Missing or mistyped **required** keys (`team_count`, `promotion_count`,
  `relegation_count`, `teams`) are a hard error — validation fails immediately.
