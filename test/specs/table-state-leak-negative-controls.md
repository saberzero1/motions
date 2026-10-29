# Negative controls: `table-state-leak.e2e.ts`

## Under `reveal`

The `owned` table surface was removed before release, superseded by `tableWidgetMode: reveal`. Its arms here — A, B, C, E, F, G and H — were
converted to `reveal` rather than deleted, because they drive exactly the
transitions a revealed table must also survive: Live Preview to Source, a
modal, a tab switch, a window blur and a pane split. Inside a revealed table
nothing is suppressed, so those arms now also require `viewOverrideCount` 0
and no cell editor. Converting them found a defect: the Source switch showed
the reveal grid in Source mode, fixed in its own commit.

ARM J is new. The owned surface left table-nav dead after a switch back to
`native`; switching from `reveal` does not, and ARM J pins that. Its control:
leaving the reveal slot installed after the switch fails it with nav state
`"inactive"` against `"nav"`. Making teardown skip withdrawing the highlights
does **not** fail it, because the scenario's `setupEditor` replaces the whole
document and the stale highlights with it — that property is covered by
`table-reveal.e2e.ts`'s mode-switch scenario instead.

The controls below were measured under the owned surface; the fixes they
defend — the nav session's widget-gone abandon, the cursor guard's
re-evaluation, and the hand-off that distinguished a surface withdrawn from a
caret leaving — are the first two still in place, the third removed with the
nested editor.

Defends three independent fixes for the global state leak recorded in
`table-global-state-leak-findings.md`. Each fix was reverted on its own and the
spec re-run; all values below were observed, and every sabotage was restored
and re-verified green afterwards.

Measured 2026-10-17, Obsidian 1.13.7 (installer 1.5.8, linux), bundle rebuilt
with `npm run build:ci-test` before every run.

Signature read per arm: `{overrideCount, suppressed, keyIntercept, active,
cursors, moved}` plus `handOff: {reason, hasFocus, focusNowhere, restored}`.

## Red first — the pre-fix baseline

Before any `src/` change, the two inverted assertions in
`table-cursor-vanish.e2e.ts` failed on the leak itself:

```
✖ releases key intercept and cursor suppression on LP→source
✖ releases without needing a keystroke to trigger the safety handler
Expected: false
Received: true          (fork.keyInterceptActive)
```

Those two tests previously asserted `toBe(true)` — they pinned the defect as
expected behaviour and were green for the whole life of the bug. A third test,
`forceTableCleanup via bridge clears all stuck state`, was **deleted**: its
helper performed the three mutations the test then asserted, so it could not
fail. Its claimed subject is now covered against the product by the two
surviving scenarios.

## Control 1 — cursor-guard re-evaluation trigger

**Sabotage**: `src/vim/table-cell-cursor-guard.ts`, restore the symmetric
early return (`if (!(update.selectionSet || update.focusChanged)) return;`),
dropping the `!this.cursorInTable &&` guard.

| Arm                        | `cursors` | Result                       |
| -------------------------- | --------- | ---------------------------- |
| A (owned, real keys)       | 1 → **0** | ✖ fails `visibleCursors > 0` |
| B (owned, park)            | 1 → **0** | ✖ fails                      |
| C (control, never entered) | 1         | ✓ holds                      |
| D (native)                 | 1         | ✓ holds                      |

`2 passing / 2 failing`.

**The load-bearing detail**: `overrideCount` stayed **0** under this sabotage.
The Live Preview → Source reconfigure recreates the guard's `ViewPlugin`, whose
`destroy()` clears the per-view override — but nothing repopulates the cursor
layer the guard emptied with `vimLayer.textContent = ''`. So the flag reads
healthy while the user sees no cursor. **A flags-only spec would not have
caught this fix's absence.** This is the concrete reason `visibleCursors`
measures real bounding boxes rather than reading `viewSuppressed`.

## Control 2 — `handOff` reason split

Re-run against the **final** implementation. An earlier attempt at this fix is
recorded under "Rejected approaches" below; its control is not reused, because
the implementation it defended no longer exists.

**Sabotage**: `src/vim/table/nested-view.ts`, collapse the reason branch in
`handOff()` to `const hadFocus = held.view.hasFocus;`.

| Arm | `handOff.restored` | `active`       | `moved`          | Result  |
| --- | ------------------ | -------------- | ---------------- | ------- |
| A   | true → **false**   | DIV → **BODY** | true → **false** | ✖       |
| B   | true → **false**   | DIV → **BODY** | true → **false** | ✖       |
| C   | false              | DIV            | true             | ✓ holds |
| D   | false              | DIV            | true             | ✓ holds |

`2 passing / 2 failing`. All 6 tests in `table-boundary.e2e.ts` stayed green
under the sabotage, which is expected: the sabotage _is_ the pre-fix behaviour
that spec was written against.

Note `handOff.hasFocus` is **false** on arms A and B both before and after the
fix, and `focusNowhere` is **true**. That pair is the whole argument for the
fix: the signal `hasFocus` was supposed to carry is already gone by the time
`handOff` runs.

## Control 3 — `widget-gone` abandon trigger

**Sabotage**: `src/vim/table-nav-controller.ts`, delete the
`if (!s.widgetEl?.isConnected) { this.scheduleAbandon('widget-gone'); return; }`
block from `update()`.

| Field           | ARM D before | ARM D sabotaged |
| --------------- | ------------ | --------------- |
| `overrideCount` | 0            | **1**           |
| `suppressed`    | false        | **true**        |
| `keyIntercept`  | false        | **true**        |
| `active`        | DIV          | **BODY**        |
| `cursors`       | 1            | **0**           |
| `moved`         | true         | **false**       |

`3 passing / 1 failing` — arms A, B and C unaffected, which is correct: the nav
overlay is `native`-only. Both `table-cursor-vanish.e2e.ts` scenarios also
failed under this sabotage, confirming they now defend the fix rather than the
defect.

This is the only sabotage that reproduces the complete original signature, and
it is the one that matters most, because `native` is the shipped default
(`src/settings.ts:340`).

## Rejected approaches, with the measurements that rejected them

**Orphan-only focus restore.** First attempt at fix 2: treat
`activeElement === body` as "the child had focus" unconditionally, with no
reason split. It fixed arms A and B and **broke**
`table-boundary.e2e.ts:193`, `does not pull focus into the editor when the
child did not have it` — a correct, non-vacuous test. That scenario blurs the
child deliberately ("the user's attention has gone elsewhere") and then leaves
the table, so `activeElement` is `body` there too. The heuristic cannot tell
"focus went nowhere because we destroyed the focused element" from "focus went
nowhere because the user left".

**Proactive `ownsFocus` tracking.** Second attempt: record focus ownership on
the `Mounted` record via `focus`/`blur` listeners on the child's `contentDOM`,
treating a blur that arrives while `view.dom.isConnected` as a genuine
departure and a blur after detachment as the child being destroyed while
holding focus. Measured `blurConnected: true` on arms A and B — **Obsidian
blurs the child before detaching it**, so both cases look identical at the blur
and the discriminator does not exist. Reverted; the fields and listeners were
removed rather than left in place unused.

What finally distinguishes them is already in `reconcile()`: `activeTable()` is
purely document-based, so a Live Preview → Source switch leaves it returning
the table (the caret is still inside its range) and the hand-off comes from the
`!findSurfaceRoot(...)` branch, while the user navigating out comes from the
`!activeTable(...)` branch. Two branches, two reasons, opposite focus
decisions.

## Regression scope

Full table suite after the fixes: **38 spec files, 299 tests, 0 failures**, in
four batches of ≤10 `--spec` invocations.

| Batch | Specs                                                                                                                                                                  | Tests |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1     | 10 (4 × `rpc-table-*`, block-mirror, boundary, cell-bridge, cell-caret, cell-cursorline, cell-decorations)                                                             | 58    |
| 2     | 10 (cell-scrolloff, cell-vim-mode, click-and-clipboard, cursor-source-mode, cursor-suppression, cursor-surface-parity, cursor-vanish, debug-state, escaped-pipes, ime) | 75    |
| 3     | 10 (key-router, nav-disabled, nav-hotkeys, nav-mode, nav-scroll, nested-view, owned-scroll-parity, owned-surface, passive-grid, raw-deprecation)                       | 98    |
| 4     | 8 (realign-conformance, realign-guard, tables, snippets, state-leak, structural-owned, surface-gate, typography)                                                       | 68    |

Batch 3 carries all 45 live `table-nav-mode` tests, which exercise the
controller changed by fix 3.

## Not covered

- Source → Live Preview, the reverse direction.
- Pane switches, tab switches and modal open/close. Oracle flagged these as the
  same class of transition; neither the probe nor this spec exercises them, and
  `focusNowhere` is the only signal that would apply.
- Whether a click back into the editor recovers all three items or only focus.
- `raw` mode, deprecated and separately documented as broken.
