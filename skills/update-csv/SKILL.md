---
name: update-csv
description: Manually fetch match data and update docs/csv, using the correct reader and ordering for each data source.
argument-hint: "[target: jleague (default) | <JFA大会名> | wc2026]"
---

# Update CSV

Manually run a data-fetch reader and update `docs/csv/*`. Optional argument:
`$ARGUMENTS` — `jleague` (default), a JFA competition name, or `wc2026`.

## Step 1 — Pick the Reader

### Jリーグ (default)

```bash
uv run python src/read_jleague_matches.py       # diff update
uv run python src/read_jleague_matches.py -f     # full refresh
```

### JFA competitions

```bash
uv run python src/read_jfamatch.py <大会名>
```

See `config/jfamatch.yaml` for valid competition names.

### WC2026

Run the JFA reader **first** — it is the canonical source for schedule, venue, and
timezone — **then** the openfootball score patcher:

```bash
uv run python src/read_jfamatch.py <WC2026大会名>
uv run python src/read_openfootball_wc.py        # add --dry-run to preview
```

Never reverse this order. `read_openfootball_wc.py` only overwrites `home_goal`/
`away_goal`/`status` (and KO extra-time/PK columns) on rows that already exist — it does
not create schedule rows, so the JFA reader must run first.

## Step 2 — Review the Diff

```bash
git diff --stat docs/csv/
git diff docs/csv/
```

Sanity-check a handful of changed rows (scores, status, section numbers) before
committing.

## Step 3 — Commit on main

Follow the cron convention exactly: GPG-signed, no `--no-gpg-sign`.

```bash
git add docs/csv/
git commit -m "Make new csv (append games on MM/DD HH:MM)"
```

Use the current date/time for `MM/DD HH:MM`.

## Step 4 — Push (Only with User Approval)

```bash
git push
```

Do not push until the user explicitly approves it.
