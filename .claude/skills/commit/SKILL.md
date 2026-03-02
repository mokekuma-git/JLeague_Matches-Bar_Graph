---
name: commit
description: Stage and commit changes following the project's Git workflow conventions. Validates branch, optionally creates Issues/PRs, and signs commits.
argument-hint: "[commit message or empty for auto-generate]"
---

# Smart Commit

Commit staged/unstaged changes following this project's workflow conventions.

Optional argument: `$ARGUMENTS` — a commit message hint or Issue number. If empty, auto-generate from the diff.

## Step 1 — Gather Context

Run these in parallel:

1. `git status` (never `-uall`)
2. `git diff` + `git diff --cached` (staged + unstaged)
3. `git log --oneline -5` (recent commit style reference)
4. `git branch --show-current` (current branch)
5. `git log --oneline main..HEAD` (commits on this branch since diverging from main)

If there are no changes (no untracked, no modified, no staged), stop and tell the user.

## Step 2 — Analyze Scope

Classify the change set into one of:

| Scope | Criteria | Action |
|-------|----------|--------|
| **Trivial** | CLAUDE.md / README update, CSS color addition, single test addition, config tweak | Commit directly to `main`, no Issue/PR needed |
| **Single-commit fix** | One logical change, 1-3 files, self-contained | May go to `main` or a branch — ask if unclear |
| **Multi-commit work** | 2+ logical steps, or part of an ongoing series | Needs a branch. If no Issue exists, suggest creating one |
| **Sub-issue** | Part of a larger milestone; a parent feature branch exists | Sub-branch → PR to **parent branch** (not `main`). Parent branch's PR handles the merge to `main` |

## Step 3 — Branch Validation

Check whether the current branch is appropriate:

- **On `main` with Trivial scope**: OK, proceed
- **On `main` with Multi-commit scope**: Warn the user. Suggest creating a branch (see naming rules below).
- **On a feature/fix/refactor branch**: Verify the changes match the branch's purpose. Warn if they seem unrelated.

If the user needs to switch branches, offer to do it (stashing if needed).

### Parent Branch Detection

When on a feature/fix/refactor branch, check whether it was branched from another feature branch (not `main`):

1. `MAIN_BASE=$(git merge-base main HEAD)`
2. For each local branch (excluding `main` and current): `BRANCH_BASE=$(git merge-base <branch> HEAD)`
3. If `BRANCH_BASE` differs from `MAIN_BASE` (i.e., BRANCH_BASE is a descendant of MAIN_BASE), that branch is the **parent branch**

If a parent branch is detected, confirm with the user:
> "This branch appears to be based on `<parent-branch>` (not `main`). Should the PR target `<parent-branch>`?"

Store the confirmed parent branch as the PR base for Step 7. If no parent branch is found, the PR base is `main`.

### Branch Naming

Three prefixes, chosen by the nature of the work:

| Prefix | When to use | Label |
|--------|------------|-------|
| `fix/` | Bug fixes — correcting broken behavior | `bug` |
| `feature/` | New functionality or enhancements | `enhancement` |
| `refactor/` | Code cleanup, restructuring without behavior change | `refactoring` |

Naming pattern:
- With Issue: `{prefix}/issue-{N}-short-desc` (e.g. `fix/issue-63-csv-workflow-uv`)
- Without Issue: `{prefix}/{short-desc}` (e.g. `feature/p5-state-and-render-split`)

## Step 4 — Issue Creation (if needed)

When multi-commit work has no associated Issue, offer to create one:

```
gh issue create --title "..." --body "..." --label "enhancement|bug|refactoring"
```

Issue conventions:
- **Title**: Japanese or English (Japanese is common for this project)
- **Body structure** (Japanese):
  ```
  ## 概要
  [1-2 sentences on what and why]

  ## 変更内容
  [Bullet list of planned changes]
  ```
- **Labels**: `enhancement` (feature), `bug` (defect), `refactoring` (cleanup)

## Step 5 — Craft the Commit Message

### Rules

1. **Language**: English only
2. **First line**: Imperative verb + concise summary (<=72 chars)
   - Verbs: Add, Fix, Remove, Extract, Introduce, Unify, Replace, Migrate, Rename, Wire, Modernize, Update, Expand
   - Pattern: `{Verb} {what was done}` — focus on intent, not files
3. **Body** (optional, separated by blank line): 1-3 lines explaining **why** or **how**, not listing files
4. **Issue reference**: Include `Fixes #{N}` or `Refs #{N}` in the body when this commit resolves or relates to an Issue. Only use `Fixes` on the commit that actually completes the work.
5. **Co-Authored-By**: Always append as the last line:
   ```
   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
6. **Never** enumerate individual files or list "Changed X, Y, Z" — those belong in PR descriptions

### Commit message examples

Single-line (trivial):
```
Add team color for 滋賀 (J2 2026)
```

With body (explaining why):
```
Replace print with standard logging across all Python scripts

Unify output control using the logging module instead of bare print()
and config.debug flags. Each module gets its own logger; --debug flag
now controls log level (DEBUG vs INFO) via basicConfig.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

With issue reference:
```
Introduce MatchUtils class with singleton and eliminate global state

Replace module-level config state in match_utils with a MatchUtils class
and singleton instance `mu`. Each reader script now uses `mu.init_config()`
instead of cross-script config imports.

Fixes #89

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Step 6 — Stage and Commit

1. Stage specific files (prefer `git add <file>...` over `git add .`). Never stage `.env`, credentials, or secrets.
2. Commit with GPG signing (do NOT use `--no-gpg-sign`):
   ```bash
   git commit -m "$(cat <<'EOF'
   Commit message here

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```
3. Run `git status` after to verify success.

If a pre-commit hook fails: fix the issue, re-stage, and create a **new** commit (never `--amend` unless the user explicitly asks).

## Step 7 — Post-Commit Guidance

After committing, if on a feature/fix/refactor branch and the work appears complete, suggest:

1. **Push**: `git push -u origin {branch}`
2. **Determine PR base** (from Step 3 parent branch detection):
   - Parent branch detected → `--base <parent-branch>`
   - No parent branch → `--base main` (default, omit the flag)
3. **Create PR** using the project's PR format:

**PR targeting `main`** (no parent branch):
```
gh pr create --title "..." --body "$(cat <<'EOF'
Fixes #{N}

## Summary
[Japanese bullet points — what was done and why]

## Changes
| Commit | Description |
|--------|-------------|
| `abc1234` | ... |

## Test plan
- [ ] `uv run pytest` passed
- [ ] `npx vitest run` passed (frontend/)
- [ ] `npm run build` succeeded (frontend/)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**PR targeting a parent branch** (sub-issue work):
```
gh pr create --title "..." --base <parent-branch> --body "$(cat <<'EOF'
Refs #{sub-issue-N}

> このPRは `<parent-branch>` への統合PRです。`main` への統合は親Issue #N の完了PRで行います。

## Summary
[Japanese bullet points — what was done and why]

## Changes
| Commit | Description |
|--------|-------------|
| `abc1234` | ... |

## Test plan
- [ ] `uv run pytest` passed
- [ ] `npx vitest run` passed (frontend/)
- [ ] `npm run build` succeeded (frontend/)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR conventions:
- **Title**: English, concise (< 70 chars)
- **`Fixes #N`**: Use only when the PR directly closes the Issue AND targets `main`. For sub-issue PRs targeting a parent branch, use `Refs #N` instead
- **`--base`**: Always specify when not targeting `main`
- **Summary**: Japanese bullet points (日本語)
- **Changes**: Commit table or category breakdown
- **Test plan**: Checklist with `- [x]` for passed, `- [ ]` for pending
- **Footer**: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Only suggest PR creation — do NOT create it without user confirmation.

## Rules

- NEVER push without explicit user approval
- NEVER use `--no-verify` or `--no-gpg-sign`
- NEVER amend unless the user explicitly requests it
- NEVER force-push
- Prefer new commits over amending when hooks fail
- If `$ARGUMENTS` contains an Issue number (e.g., `#89`), use it for branch naming and `Fixes/Refs` references
- When in doubt about scope (Trivial vs Multi-commit), ask the user
