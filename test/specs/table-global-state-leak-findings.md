# Finding: entering a table leaks global editor state across an LP→Source switch

> [!note] The `owned` table surface was removed before release, superseded by `tableWidgetMode: reveal`. This investigation measured it and `native`; `table-state-leak.e2e.ts` now runs its owned arms against `reveal`. Kept as the record of how the leak was found.

**Status**: reproduced, 4/4 runs, deterministic. Affects `tableWidgetMode: 'native'` — the
shipped default (`src/settings.ts:340`) — as well as `owned`.

**Measured**: 2026-10-17, Obsidian 1.13.7 (installer 1.5.8, linux), plugin at `7f8cf90`,
bundle rebuilt from HEAD before every run.

This record exists because the defect is invisible to the 37 table e2e specs, one of which
asserts it as expected behaviour. The probe that produced it was a throwaway diagnostic and
was deleted; §5 is enough to rebuild it.

## 1. What happens

Enter a Markdown table, then switch Live Preview → Source. Three pieces of state survive the
transition that should not:

| Leaked state                          | Observable                                                                   | Consequence                   |
| ------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| Per-view cursor suppression override  | `getViewOverrideCount() === 1`, `isCursorSuppressedForView(parent) === true` | No cursor is painted anywhere |
| Focus ownership                       | `document.activeElement === BODY`, `parentFocused === false`                 | Keystrokes reach nothing      |
| Fork key interception (`native` only) | `isKeyInterceptActive() === true`                                            | Compounds the above           |

End state: **a real `j` moves nothing and changes nothing.** The editor is dead until the
user clicks back into it.

## 2. Observed tuples

`ownedSurfaces` counts `.vim-motions-table-surface`; `nativeWidgets` counts
`.cm-table-widget`. These are different surfaces — conflating them is how a probe reads
`false` in owned mode and reports nonsense. `visibleCursors` counts
`.cm-vimCursorLayer > *, .cm-cursor, .vim-motions-cursor` filtered to a non-zero
bounding box, i.e. real paint rather than a flag.

### ARM A — `owned`, entered with real `j j j j`

| Field                           | T1 in table      | T2 immediately after switch | T3 settled (+400 ms) |
| ------------------------------- | ---------------- | --------------------------- | -------------------- |
| `ownedSurfaces`                 | 1                | 0                           | 0                    |
| `nested.mounted`                | 1                | 0                           | 0                    |
| `nested.mounts/unmounts`        | 1/0              | 1/1                         | 1/1                  |
| `nested.focused`                | true             | false                       | false                |
| `parentFocused`                 | false            | false                       | false                |
| `activeElement`                 | `DIV.cm-content` | **BODY**                    | **BODY**             |
| `visibleCursors`                | 1                | **0**                       | **0**                |
| `suppression.viewSuppressed`    | true             | **true**                    | **true**             |
| `suppression.viewOverrideCount` | 1                | **1**                       | **1**                |
| `keyInterceptActive`            | false            | false                       | false                |

`head 46 → 46, moved=false, docChanged=false`

`mounts`/`unmounts` are balanced at 1/1, so the nested child **is** destroyed. This rules out
an orphaned-but-connected child; the child is gone and its suppression override is not.

### ARM B — `owned`, entered by dispatching a CM6 selection

Identical T3 to ARM A (`viewOverrideCount 1`, `visibleCursors 0`, `activeElement BODY`),
`head 48 → 48 moved=false`. Entry mechanism is not the variable.

### ARM C — `owned`, table **never entered** (control)

| Field                           | T3 settled       |
| ------------------------------- | ---------------- |
| `nested.mounted`                | 0                |
| `activeElement`                 | `DIV.cm-content` |
| `visibleCursors`                | **1**            |
| `suppression.viewSuppressed`    | **false**        |
| `suppression.viewOverrideCount` | **0**            |
| `keyInterceptActive`            | false            |

`head 0 → 11, moved=true` — healthy.

### ARM D — `native` (the default), entered with real `j j j j`

| Field                           | T1 in table      | T3 settled |
| ------------------------------- | ---------------- | ---------- |
| `nativeWidgets`                 | 1                | 0          |
| `ownedSurfaces`                 | 0                | 0          |
| `activeElement`                 | `DIV.cm-content` | **BODY**   |
| `visibleCursors`                | **0**            | **0**      |
| `suppression.viewSuppressed`    | true             | **true**   |
| `suppression.viewOverrideCount` | 1                | **1**      |
| `keyInterceptActive`            | **true**         | **true**   |

`head 65 → 65, moved=false, docChanged=false`

**This is the load-bearing arm.** It was written as a control to isolate owned-vs-native and
instead showed the defect is not owned-specific. `native` leaks a third piece of state
(`keyInterceptActive`) that `owned` does not.

## 3. Why the probe is trustworthy

**ARM C vs ARM A is a single-variable control.** Both run `tableWidgetMode: 'owned'`, both
call the same un-awaited `rawSwitchToSource()`, and both assert
`suppression.viewOverrideCount === 0`. ARM C passes it; ARM A fails it with `Received: 1`.
The only difference is whether the table was entered. This exonerates the probe's own
mechanism — in particular, the deliberately un-awaited `setState` is not what drops focus,
because ARM C uses it and ends with `activeElement === DIV.cm-content`.

**The failing read is a real value, not an `undefined` coerced into place.** The failure
message is `Expected: 0 / Received: 1`. An absent accessor would have reported
`Received: undefined`.

**Assertion ordering matters when reading the failures.** ARM A's health block is 8
assertions and aborts at the third:

1. `isSourceMode() === true` — passed
2. `nested.mounted === 0` — passed
3. `suppression.viewOverrideCount === 0` — **failed, Received 1**
4. –8. never executed

So the `visibleCursors: 0`, `activeElement: BODY` and `moved=false` figures in §2 are
**observed from the printed tuple, not asserted**. They are real measurements; they are not
independent assertion failures. An earlier draft of this analysis claimed all five health
criteria failed simultaneously, which was wrong.

**Determinism**: 4 runs, 4 identical results — ARM A/B/D fail at the `viewOverrideCount`
assertion with `Received: 1`, ARM C passes. Runs 1–2 reported source lines 344/399/461;
runs 3–4 reported 343/400/462 after the probe was Prettier-formatted between them. Same
assertions, renumbered.

The user-reported frequency was "about half the time". Under the probe it is 100%. The
real-world variance is likely which cell, which direction of mode switch, and whether a
click intervenes — not the leak itself, which is unconditional once a table is entered.

## 4. The spec that pins the defect

`test/specs/table-cursor-vanish.e2e.ts:112-124` is ARM D in miniature — `setupTableDoc()`,
`browser.keys(['j','j'])`, `ensureSourceMode()` — and ends:

```ts
expect(fork.keyInterceptActive).toBe(true);
```

It is green today. It asserts the leak as the expected outcome, under a `describe` titled
`'Bug 2: Cursor visible after LP→source (#167)'`. The same assertion is repeated at `:154`.
**Fixing the leak turns both red.** They must be inverted or deleted as part of any fix, or
they will be read as a regression.

No other table spec observes this transition without a settling delay, and none asserts on
painted cursors plus focus plus a subsequent real keystroke together, which is why 37 specs
pass over it.

## 5. Rebuilding the probe

Four `it()` blocks in one spec, `tableWidgetMode` set via `setPluginSettingAndReload`,
document = 8 lines with a 2-column / 2-data-row table at lines 3-6 and the cursor parked at
line 0.

- **Entry, real keys**: `browser.keys(['j','j','j','j'])`, then `browser.pause(700)`.
- **Entry, park**: `cm.dispatch({ selection: { anchor: cm.state.doc.line(5).from + 2 } })`.
- **The switch**: read `view.getState()`, set `mode='source'` and `source=true`, then
  `void view.setState(state, { history: false })` — **not awaited**, and no `waitUntil`.
  Awaiting it reproduces `ensureSourceMode()` and closes the window being measured.
- **Sampling**: one `browser.executeObsidian` returning `plugin.getNestedTableStats()`,
  `window.CodeMirrorAdapter.getTableDebugState()`, `document.activeElement`, the
  `visibleCursors` count above, and both surface counts. Sample at three points: in-table,
  immediately post-switch with no pause, and settled after 400 ms.
- **Liveness**: snapshot head and document, `browser.keys(['j'])`, pause 400 ms, re-snapshot,
  compare.

Two traps worth repeating:

- `window.CodeMirrorAdapter.getTableDebugState` is registered as `() => getTableDebugState(appRef)`
  (`src/vim/bundled-vim.ts:103`) and takes **zero** arguments.
  `test/specs/table-debug-state.e2e.ts:73` declares it as `(app: unknown) => unknown` and
  calls it with `app`; that is a live declaration error, harmless only by luck.
- An `executeObsidian` callback is serialised into Chromium and cannot close over anything
  module-scoped in the spec file. A shared `EMPTY_NESTED` constant hoisted out of the
  callback throws at runtime.

## 6. Scope

Not investigated, and not claimed:

- Source → Live Preview, the reverse direction.
- Whether a click back into the editor fully recovers all three leaked items or only focus.
- Pane switches, tab switches and modal open/close, which Oracle flagged as the same class
  of transition but which this probe did not exercise.
- `raw` mode, which is deprecated and separately documented as broken.
- Whether the three leaks share one root cause or are three independent teardown gaps. The
  `native`-only `keyInterceptActive` leak suggests at least two owners
  (`table-nav-controller.ts` for interception, `table-cell-cursor-guard.ts` for suppression).
