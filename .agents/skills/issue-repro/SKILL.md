---
name: issue-repro
description: Issue reproduction workflow — write a failing e2e test that reproduces a GitHub issue's reported behavior, then implement the fix so the test passes.
triggers:
    - issue
    - reproduce
    - repro
    - bug
    - fix issue
    - github issue
argument-hint: '<issue-url-or-number> [issue-url-or-number...]'
---

# Issue Reproduction Skill

## Purpose

Given one or more GitHub issues, write e2e tests that faithfully reproduce the reported behavior (the tests MUST fail before the fix), then implement the minimal fix so the tests pass. This test-first approach was adopted because about half of agent-written e2e tests were found to not actually test anything meaningful despite passing.

## When to Activate

Activate when the user provides GitHub issue URLs or numbers and asks to fix them. Typical phrasings:

- "Fix #1234"
- "Reproduce and fix https://github.com/saberzero1/motions/issues/1234"
- "Look into these issues: #100, #101, #102"
- "This issue needs a fix: <link>"

## Workflow

### Phase 1: Understand the Issue

For each issue:

1. **Fetch the issue** — Use `gh issue view <number>` or fetch the URL to read the full issue body, comments, and labels.
2. **Extract reproduction steps** — Identify:
    - Initial editor state (content, cursor position, mode)
    - Key sequence or action that triggers the bug
    - Expected behavior (what should happen)
    - Actual behavior (what happens instead)
    - Any required settings, modes (Live Preview vs Source), or preconditions
3. **Identify the affected code area** — Use explore agents to find relevant source files based on the feature described in the issue.

### Phase 2: Write the Failing Test

1. **Determine test location**:
    - Core vim behavior → `test/specs/vim-builtin/` (Tier 1, use `testWithNeovim()` if applicable)
    - Plugin feature → `test/specs/` (Tier 2)
    - Choose an existing spec file if one covers the same feature area, or create a new one

2. **Write the test** following project conventions:
    - Import from `@wdio/globals` and `wdio-obsidian-service`
    - Use helpers from `test/helpers.ts` (`setupEditor`, `vimKeys`, `vimRawKeys`, `getCursorPos`, `getEditorValue`, `getSelection`, `getVimMode`, etc.)
    - Use `obsidianPage.openFile('Welcome.md')` in `before()` hooks
    - Use `editor.focus()` to focus, NOT `$('.cm-content').click()`
    - Outer-scope variables are NOT available inside `executeObsidian` callbacks
    - For visual-mode compound operations that fail with `vimRawKeys`, use `vimHandleKeys` (set `useHandleKey: true` on test definitions)
    - For fixture-dependent tests, use files in `test-vault/fixtures/`

3. **The test MUST encode the expected (correct) behavior, not the buggy behavior.** It should:
    - Set up the exact preconditions from the issue
    - Execute the exact key sequence or action
    - Assert the CORRECT outcome (what the user expects to happen)

4. **Verify the test fails** — Run the specific test to confirm it fails with the current code:

    ```bash
    npx wdio run ./wdio.conf.mts --spec test/specs/<file>.e2e.ts
    ```

    Use `nix develop` if ChromeDriver mismatches. Individual specs typically complete in 30-90s.

    **CRITICAL**: If the test PASSES before any fix is applied, the test is not reproducing the bug. Rewrite it. A passing test on unfixed code means you're testing the wrong thing.

### Phase 3: Implement the Fix

1. **Fix minimally** — Change only what's necessary to fix the bug. Do not refactor while fixing.
2. **Match existing patterns** — Follow the codebase conventions in CONTRIBUTING.md and AGENTS.md.
3. **Run the test again** — Confirm it now passes:
    ```bash
    npx wdio run ./wdio.conf.mts --spec test/specs/<file>.e2e.ts
    ```
4. **Run diagnostics** — `lsp_diagnostics` on all changed files.
5. **Run unit tests** — `npm run test:unit` to catch regressions.
6. **Check for collateral** — If the fix touches core paths, run related spec files:
    ```bash
    npx wdio run ./wdio.conf.mts --spec 'test/specs/vim-builtin/*.e2e.ts'
    ```

### Phase 4: Verify and Report

1. **Confirm the test correctly reproduces the issue** — The test must fail without the fix and pass with it.
2. **Report per issue**:
    - Issue number/link
    - Root cause (1-2 sentences)
    - What was fixed (files changed, approach)
    - Test file and test name
    - Test result (pass/fail before and after)

## MUST DO

- Read the FULL issue (body + comments) before writing tests.
- Write the e2e test BEFORE implementing the fix.
- Verify the test FAILS before the fix is applied.
- Verify the test PASSES after the fix is applied.
- Use project test helpers (`test/helpers.ts`) instead of inline `executeObsidian` boilerplate.
- Follow test file organization conventions (Tier 1 vs Tier 2, correct directory).
- Run `lsp_diagnostics` on changed source files.
- Fix minimally — no refactoring during bugfixes.
- For Tier 1 tests, add entries to `test/neovim/test-definitions.ts` and note that golden files need re-recording.

## MUST NOT DO

- Do NOT write tests that assert the BUGGY behavior — tests must assert the CORRECT behavior.
- Do NOT skip the "verify test fails first" step — this is the whole point of this workflow.
- Do NOT write tests that pass on unfixed code and claim the fix works.
- Do NOT refactor, clean up, or "improve" unrelated code while fixing a bug.
- Do NOT suppress type errors with `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Do NOT delete or modify existing passing tests to make the suite pass.
- Do NOT use `console.log` in production code — use `new Notice()` for user-facing messages.
- Do NOT commit unless explicitly asked.

## Test Quality Checklist

Before marking a test as complete, verify:

- [ ] Test describes the issue scenario in its `describe`/`it` name (reference issue number)
- [ ] Test sets up exact preconditions from the issue (content, cursor, mode, settings)
- [ ] Test executes the exact key sequence or action from the issue
- [ ] Test asserts the CORRECT outcome, not the buggy outcome
- [ ] Test FAILS on the unfixed codebase
- [ ] Test PASSES after the fix
- [ ] Test does not depend on timing/race conditions (use `waitUntil` for async assertions)
- [ ] Test cleans up after itself (or relies on the global `afterTest` hook in `wdio.conf.mts`)

## Multiple Issues

When given multiple issues:

1. Triage them — read all issues first to identify any that are related or affect the same code area.
2. Handle related issues together (shared test file, single fix if appropriate).
3. Handle unrelated issues sequentially — complete one (test + fix + verify) before moving to the next.
4. Create a todo list tracking progress across all issues.

## Example

User: "Fix https://github.com/saberzero1/motions/issues/1234"

1. `gh issue view 1234` — read issue
2. Issue says: "Pressing `diw` on a word at end of line deletes the newline too"
3. Write test in `test/specs/vim-builtin/operators.e2e.ts`:
    ```typescript
    it('diw at end of line should not delete newline (#1234)', async function () {
        await setupEditor('hello world\nnext line', { line: 0, ch: 6 });
        await vimKeys('d', 'i', 'w');
        const value = await getEditorValue();
        expect(value).toBe('hello \nnext line');
    });
    ```
4. Run test — confirm it fails
5. Find root cause in `src/text-objects/` or fork
6. Implement minimal fix
7. Run test — confirm it passes
8. Run `lsp_diagnostics`, `npm run test:unit`
9. Report: root cause, fix, test result
