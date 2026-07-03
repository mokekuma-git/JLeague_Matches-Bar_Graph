---
name: verify
description: Verify pending changes end-to-end before committing — runs the right checks for what actually changed (Python, frontend, shared types, season_map).
---

# Verify Pending Changes

Run the checks that match the scope of the current diff, not a fixed blanket suite. This
catches issues CI would miss (CI only typechecks + tests the frontend; it does not build).

## Step 1 — Detect Scope

```bash
git status
git diff --stat
```

Classify the touched paths against the categories below. A single change set may hit
several categories — run every check that applies.

## Step 2 — Run Matching Checks

### Python changed (`src/`, `scripts/`, `tests/`)

```bash
uv run ruff check src/ scripts/ tests/
uv run pytest
```

### Frontend changed (`frontend/`)

Run from `frontend/`:

```bash
npm run typecheck
npx vitest run
npm run build
```

Always run `npm run build`, even though CI does not. Per CLAUDE.md, CI only runs
typecheck + vitest — `docs/matches.html` / `docs/assets/` are gitignored build
artifacts, so a build break is otherwise only caught at PR-deploy time.

### Shared type definitions changed (`src/match_utils.py` or `frontend/src/types/*.ts`)

```bash
uv run python scripts/check_type_sync.py
```

Covers the Python ↔ TypeScript sync for `CSV_COLUMN_SCHEMA`/`RawMatchRow`,
`SeasonEntry.OPTIONAL_KEYS`/`SeasonEntryOptions`, and `POINT_SYSTEM_VALUES`/`POINT_MAPS`.

### `docs/yaml/season_map.yaml` or `docs/csv/*` changed

```bash
uv run python scripts/check_point_system_csv.py
```

Validates that `point_system` values declared in `season_map.yaml` are consistent with
the CSV data they govern.

### Rendering / View logic changed

Suggest, but do not require without asking:

```bash
npx playwright test --grep-invert @full-render
```

(run from `frontend/`), plus a manual `npm run dev` check against the four View
Invariants in CLAUDE.md:

- **I1** — bar-graph height: all team columns and the points column have equal height
- **I2** — future-box ordering: `.future` boxes never appear interleaved with played boxes
- **I3** — team-color warning: undefined team colors must not block rendering, only warn
- **I4** — ranking/bar order match: default ranking-table order matches the bar graph's
  left-to-right order (until the user manually sorts the ranking table)

## Step 3 — Report

Report pass/fail per check, plainly. Include the actual failing output (not a paraphrase)
for anything that failed. Never claim success if any applicable check failed or was
skipped.
