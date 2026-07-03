---
name: release
description: Cut a signed semver release tag following the project's versioning rules.
argument-hint: "[bump type: major|minor|patch, or explicit vX.Y.Z]"
---

# Release

Cut a new signed semver tag. Optional argument: `$ARGUMENTS` — a bump type
(`major`/`minor`/`patch`) or an explicit `vX.Y.Z`. If omitted, determine the bump from the
commit log in Step 3 and confirm with the user.

## Step 1 — Preconditions

```bash
git branch --show-current
git status
git fetch origin
git log origin/main..main --oneline
git log main..origin/main --oneline
```

Confirm:

- Current branch is `main`
- Working tree is clean
- `main` is up to date with `origin/main` (both log commands above are empty)

Stop and tell the user if any precondition fails — do not tag a dirty or diverged tree.

## Step 2 — Find the Latest semver Tag

Lexical sort is a trap: pre-v1.0.0 date-style tags (e.g. `v2602.2`) sort **after** semver
tags lexically. Use exactly this command:

```bash
git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+' | head -1
```

## Step 3 — Review Changes and Decide the Bump

```bash
git log <last-tag>..HEAD --oneline
```

Decide (or confirm the user-supplied) bump type:

- **major** — breaking changes
- **minor** — new features, backward compatible
- **patch** — fixes only, backward compatible

Compute the new `vX.Y.Z` from the last tag and confirm it with the user before tagging.

## Step 4 — Create the Tag

Annotated and **signed** — lightweight tags are forbidden, never use `--no-sign`:

```bash
git tag -s vX.Y.Z -m "<short summary of this release>"
```

## Step 5 — Push (Only with Explicit Approval)

```bash
git push origin vX.Y.Z
```

Do not run this until the user explicitly approves pushing the tag.

## Step 6 — No Deploy Is Triggered

GitHub Pages deploys from pushes to `main` via `deploy-pages.yaml`, not from tags.
Tagging here is bookkeeping only — pushing the tag does not build or deploy anything.
