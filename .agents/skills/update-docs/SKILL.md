---
name: update-docs
description: Post-implementation documentation update — check and update AGENTS.md, CHANGELOG.md, CONTRIBUTING.md, KNOWN_LIMITATIONS.md, README.md, and relevant docs/ pages after every fix or feature.
triggers:
    - update docs
    - update documentation
    - docs update
    - documentation
argument-hint: '[description-of-changes]'
---

# Update Documentation Skill

## Purpose

After every fix or feature implementation, ensure all project documentation is consistent with the code changes. A change is not complete until its documentation is updated.

## When to Activate

Activate after any code change that affects user-visible behavior, internal architecture, settings, keybindings, ex commands, Lua API, or known limitations. This includes:

- Bug fixes
- New features
- Behavioral changes
- New settings or options
- New keybindings, motions, text objects, operators, ex commands
- New or modified Lua API functions
- Codebase structure changes (new files, renamed files, moved files)
- Test infrastructure changes

## Files to Check

Every change requires evaluating these files for updates:

### 1. CHANGELOG.md

**Always update.** Add entries under `## [Unreleased]` using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**Sections** (use only the applicable ones):

- `### Added` — new features, new commands, new settings
- `### Changed` — behavioral changes, refactors that affect users
- `### Fixed` — bug fixes (reference issue number with `([#N](url))`)
- `### Removed` — removed features or settings
- `### Tests` — new or modified tests
- `### Documentation` — list all doc files updated (always last)

**Format**:

```markdown
- **Bold feature/fix name** — description of what changed. Technical detail about root cause or implementation if relevant. ([#N](https://github.com/saberzero1/motions/issues/N))
    - Plugin: `src/path/file.ts` (brief description of change)
    - Fork: `~/Repos/codemirror-vim/src/file.ts` (if fork changes involved)
    - Styles: `styles.css` (if CSS changes)
```

### 2. AGENTS.md

Update when:

- New source files are added (add to file tree with description)
- File descriptions change (e.g., new functionality added to existing file)
- Fork API surface changes (new exposed functions, changed behavior)
- Environment/tooling changes
- Documentation maintenance tables change (new feature area, new page)
- Dual-vim architecture changes
- Test infrastructure changes

**Key sections to check**:

- `## Environment & tooling` — fork descriptions, dependency notes
- `### Dual-vim architecture` — if vim mode behavior changes
- `## File & folder conventions` — if file structure changes
- `## Testing` — test file organization, helpers, infrastructure
- `## Commands & settings` — if settings tab changes
- `## Documentation maintenance` — change-to-page routing table, page ownership table

### 3. CONTRIBUTING.md

Update when:

- Codebase structure changes (new files in `src/` tree)
- New patterns for adding features (new motion type, new operator type)
- Test infrastructure changes (new helpers, new patterns)
- Convention changes (code style, registration patterns)
- Settings override behavior changes

**Key sections to check**:

- `## Codebase structure` — the `src/` file tree with descriptions
- `## Adding a new feature` — patterns for motions, operators, ex commands, etc.
- `## Conventions` — code style, registration, settings
- `## Testing` — test infrastructure, helpers, patterns

### 4. KNOWN_LIMITATIONS.md

Update when:

- A bug is fixed that was listed as a known limitation → mark as `~~Fixed~~`
    - Top-level `## ~~...~~ (Fixed)` sections go to the "Resolved Issues" section at the bottom
    - Fixed sub-items (`### ~~...~~`, `- ~~...~~`) stay within their active parent section
- A new limitation is discovered → add section
- An existing limitation's behavior changes → update description
- `docs/reference/known-limitations.md` is auto-generated from this file in CI — do NOT manually edit the docs version

### 5. README.md

Update when:

- New user-facing features are added (add to Features list)
- Feature descriptions change significantly
- Installation requirements change
- Development commands change

**Style**: Match existing bullet format — `**Bold feature name**` em-dash brief description with inline references.

### 6. docs/ pages

Use the **change-to-page routing table** from AGENTS.md to determine which docs pages to update:

| Change type                       | Docs pages to update                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| New keybinding/motion             | `reference/keybindings.md` + `configuration/remapping.md` (if new ex command alias)                       |
| New text object                   | `reference/keybindings.md` § "Markdown text objects" + `features/text-objects.md`                         |
| New ex command                    | `reference/keybindings.md` § "Ex commands" + `features/ex-commands.md`                                    |
| New setting                       | `configuration/settings.md`                                                                               |
| New vimrc option                  | `configuration/vimrc.md`                                                                                  |
| New Lua API function/namespace    | `configuration/lua-config.md` + `KNOWN_LIMITATIONS.md` (update function count)                            |
| New feature (entire)              | New `features/<name>.md` + `features/index.md` + `reference/keybindings.md` + `configuration/settings.md` |
| Bug fix                           | `KNOWN_LIMITATIONS.md` (mark Fixed if applicable)                                                         |
| New limitation                    | `KNOWN_LIMITATIONS.md`                                                                                    |
| Setting default changed           | `configuration/settings.md`                                                                               |
| Keybinding changed/removed        | `reference/keybindings.md`                                                                                |
| Installation requirements changed | `getting-started/installation.md` + `getting-started/recommended-setup.md`                                |

**Use the page ownership table** from AGENTS.md to find the canonical docs page for each feature area.

**Docs style conventions**:

- Keybindings in inline code: `` `]h` ``, `` `<C-w>v` ``
- Settings paths bold with arrows: **Settings → Vim Motions → Jump navigation**
- Callout types: `[!tip]`, `[!info]`, `[!warning]`, `[!bug]`
- Internal links as wikilinks: `[[installation]]`, `[[settings#Vim engine]]`
- Keybinding tables are single-sourced in `reference/keybindings.md` — feature pages transclude via `![[keybindings#Section]]`

**Frontmatter** — every docs page must have:

```yaml
---
title: Page Title
description: Brief desc
tags:
    - category-name
---
```

## Workflow

### Step 1: Identify what changed

Read the diff or summary of changes. Classify each change:

- Is it user-facing? (affects behavior, adds feature, fixes bug)
- Is it internal? (refactor, test infra, CI)
- Does it add/modify/remove files in `src/`?
- Does it affect settings, keybindings, ex commands, or Lua API?

### Step 2: Determine which files need updates

For each change, check all 6 file categories above. Use the routing tables.

### Step 3: Read current state

Read the relevant sections of each file that needs updating. Do NOT fabricate — only update based on actual changes.

### Step 4: Apply updates

Update each file, matching existing style and format. For CHANGELOG.md, always add a `### Documentation` section listing all doc files updated.

### Step 5: Verify

- All updated files have consistent information (no contradictions between AGENTS.md and CONTRIBUTING.md)
- CHANGELOG.md `### Documentation` section lists every file touched
- No stale references to old behavior remain
- `lsp_diagnostics` on any changed TypeScript files (shouldn't apply here, but verify)

## MUST DO

- Read the actual code changes before writing documentation — do not fabricate.
- Match the existing style of each file exactly (indentation, heading levels, bullet format).
- Include issue numbers with full GitHub URLs in CHANGELOG.md entries: `([#N](https://github.com/saberzero1/motions/issues/N))`.
- List changed plugin/fork files in CHANGELOG.md entries with `- Plugin:` / `- Fork:` / `- Styles:` sub-bullets.
- Always add `### Documentation` as the last section in the CHANGELOG entry listing every doc file updated.
- Keep AGENTS.md and CONTRIBUTING.md file trees synchronized — a new file must appear in both.
- When marking a KNOWN_LIMITATIONS.md item as fixed, use `~~strikethrough~~` and add the issue reference.

## MUST NOT DO

- Do NOT skip any of the 6 file categories — check all of them for every change.
- Do NOT update `docs/reference/known-limitations.md` directly — it is auto-generated from `KNOWN_LIMITATIONS.md` in CI.
- Do NOT update `docs/reference/changelog.md` directly — it is auto-generated from `CHANGELOG.md` in CI.
- Do NOT fabricate changelog entries or documentation for changes that didn't happen.
- Do NOT reformat or restructure existing documentation sections that are unrelated to the current change.
- Do NOT remove the `### Documentation` section from CHANGELOG entries — it is always required.

## Example

After fixing issue #140 where `diw` at end of line deletes the newline:

1. **CHANGELOG.md** — Add under `## [Unreleased]`:

    ```markdown
    ### Fixed

    - **`diw` at end of line deletes newline** — ... ([#140](...))
        - Plugin: `src/text-objects/word.ts` (boundary check)

    ### Tests

    - 1 regression test in `test/specs/vim-builtin/operators.e2e.ts` (#140)

    ### Documentation

    - `CHANGELOG.md`
    - `KNOWN_LIMITATIONS.md`: (if applicable)
    ```

2. **AGENTS.md** — No update needed (no new files, no structure change).

3. **CONTRIBUTING.md** — No update needed (no new files).

4. **KNOWN_LIMITATIONS.md** — Mark as fixed if it was listed.

5. **README.md** — No update needed (no new feature).

6. **docs/** — No update needed (bug fix with no docs page impact).
