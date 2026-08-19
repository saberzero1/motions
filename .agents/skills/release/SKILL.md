---
name: release
description: Release workflow for Vim Motions — update docs/index.md "What's new" section after `just check` and `just bump` have already run.
triggers:
    - release
    - publish
    - ship
    - what's new
    - docs/index.md
argument-hint: '<version>'
---

# Release Skill

## Purpose

After `just check` and `just bump <version>` have already been run by the user, this skill updates `docs/index.md` with the new "What's new in X.Y.Z" section based on the CHANGELOG.md entry for that version.

## When to Activate

Activate when the user says something like:

- "release 0.117.0"
- "update the docs for the new release"
- "update index.md for this version"
- "ship it"

The user will have already run `just check` (lint, tsc, build, unit tests) and `just bump <version>` (updates manifest.json, versions.json, package.json, CHANGELOG.md) before invoking this skill.

## Context

### What `just check` does (already run by user)

```bash
npm run lint
tsc --noEmit
npm run build
npm run test:unit
```

### What `just bump <version>` does (already run by user)

- Runs `npm run lint`
- Updates `manifest.json` version
- Updates `versions.json` with version → minAppVersion mapping
- Updates `package.json` version
- Inserts `## [<version>] - YYYY-MM-DD` header in CHANGELOG.md under `## [Unreleased]`
- Runs `npm i -D` and `prettier . --check --write`

### What `just tag <version>` does (run after this skill, by user)

```bash
git tag -a "<version>" -m "Release version <version>"
git push origin tag "<version>"
```

### What this skill does

Update `docs/index.md` to reflect the new version's highlights.

## Workflow

### Step 1: Determine the version

If the user provides a version (e.g., "release 0.117.0"), use it. Otherwise, read `manifest.json` to get the current version.

### Step 2: Read the CHANGELOG.md entry

Read CHANGELOG.md and extract the content under `## [<version>] - YYYY-MM-DD`. This is everything between that header and the next `## [` header (or end of file).

### Step 3: Update docs/index.md

Replace the existing "What's new in X.Y.Z" section in `docs/index.md` with a new section for the current version. The section to replace is:

```markdown
## What's new in <old-version>

<old content>

See the [[changelog|full changelog]] for details.
```

Replace with:

```markdown
## What's new in <new-version>

<summarized highlights from CHANGELOG>

See the [[changelog|full changelog]] for details.
```

**Summarization rules:**

- Condense the CHANGELOG entries into user-facing feature highlights.
- Use the same style as the existing "What's new" section (bold feature name, em-dash, brief description).
- Skip "Documentation" and "Changed" sections that are purely internal (CI, AGENTS.md updates). Include "Changed" entries that affect user-visible behavior.
- Keep to 4-6 bullet points max. Group related changes.
- Use Obsidian wikilink syntax for internal doc references (e.g., `[[feature-page|display text]]`).

### Step 4: Verify

- Confirm `docs/index.md` has the correct version number in the "What's new" heading.
- Confirm the old "What's new" section was fully replaced (no leftover content from the previous version).
- Run `lsp_diagnostics` on any changed TypeScript files (there shouldn't be any for this skill, but verify if edits touched code).

### Step 5: Report

Tell the user:

- What was updated
- Remind them to review the changes, commit, and run `just tag <version>` to create the release

## MUST DO

- Read the actual CHANGELOG.md entry — do not fabricate content.
- Preserve the exact format and style of the existing "What's new" section in docs/index.md.
- Use wikilinks (`[[page|text]]`) for internal references, matching existing style.
- Keep the `See the [[changelog|full changelog]] for details.` footer line.

## MUST NOT DO

- Do NOT run `just check`, `just bump`, or `just tag` — the user handles these.
- Do NOT modify CHANGELOG.md, manifest.json, versions.json, or package.json.
- Do NOT create git commits or tags.
- Do NOT fabricate changelog entries — only use what's in CHANGELOG.md.
- Do NOT include purely internal changes (CI config, AGENTS.md) in the "What's new" summary.

## Example

User: "release 0.117.0"

1. Read CHANGELOG.md `## [0.117.0]` section
2. Summarize highlights
3. Replace "What's new in 0.116.0" with "What's new in 0.117.0" in docs/index.md
4. Report done, remind user to review + `just tag 0.117.0`
