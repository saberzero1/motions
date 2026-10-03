# Findings — the table cursor guard, and why it keeps regressing

Companion to `test/specs/table-cursor-surface-parity.e2e.ts`, which is
committed **skipped** because it fails. It fails on open defects, not on
mistakes in itself.

## Why the defect returns: two structural reasons

### 1. The guard was keyed on the old implementation's DOM

`mainEditorTableCursorGuard` (`src/vim/table-cell-cursor-guard.ts`) suppresses
the parent's vim cursor while the caret is inside a table. Its precondition
was:

```ts
hasVisibleTableWidget(view); // queries '.cm-table-widget'
```

`tableWidgetMode: 'owned'` removes Obsidian's widget by construction —
measured `widgets: 0` — so the predicate went false and the guard silently
stopped engaging on that surface. Nothing announced it.

Fixed: the predicate now asks whether a table is rendered by **either**
implementation (`.cm-table-widget, .vim-motions-table-surface`). Any future
surface has to be added there, and the function says so.

**This fix is currently unverifiable**, and that is stated rather than hidden.
Reverting it changes none of this spec's results, because in `owned` the
parent cursor is not drawn at all (below) — so there is nothing for the guard
to suppress. It becomes load-bearing the moment that is fixed.

### 2. Every prior assertion was an absence

Counted across the four prior fixes' specs — `table-cursor-suppression.e2e.ts`
(#127, #135, #136) and `table-cursor-source-mode.e2e.ts` (#132):

| assertion                                | count |
| ---------------------------------------- | ----- |
| `cursorOnTableLine === false`            | 4     |
| `parentCursorVisible === false`          | 1     |
| anything asserting a cursor **is** drawn | **0** |

A suite built only from absences is satisfied by a cursor that renders
**nowhere**. It cannot distinguish "correctly suppressed inside the table"
from "broken everywhere", which is exactly the state `owned` is in. Every one
of those specs also pins `tableWidgetMode = 'native'`, so none could observe
the other surface.

The new spec therefore does two things the old ones do not: it is
parameterised over `SURFACES = ['native', 'owned']`, and it asserts
**presence** — a visible cursor of non-zero extent outside the table — paired
with the absence inside it.

## The three defects it reproduces

| #   | Surface  | Scenario                                  | Measured              |
| --- | -------- | ----------------------------------------- | --------------------- |
| 1   | `owned`  | a cursor is drawn outside the table       | **non-deterministic** |
| 2   | `owned`  | no parent cursor inside the table         | blocked on 1          |
| 3   | `native` | the cursor returns after the caret leaves | fails                 |

### Defect 1: instrumented, and the cause is in our predicate

The DOM probing in the first pass was unreliable — five samples, three
different answers. It was replaced by logging from **inside** the fork's
`BlockCursorPlugin`, reading `suppressed`, `cursors.length`, `hasFocus` and
the layer's child count on every `update()` and `drawSel()`. That is the
measurement to trust, and it says something different from the probes.

With the caret parked **inside** a table:

|          | parent                                                       | cell editor                  |
| -------- | ------------------------------------------------------------ | ---------------------------- |
| `native` | `suppressed=true n=1 kids=0` — measured, correctly not drawn | `n=1 kids=1` — draws its own |
| `owned`  | `suppressed=true n=1 kids=0` — same, correct                 | `n=0 kids=0 focus=false`     |

Two conclusions.

**The historical flakiness is explained, and it was ours.** The instrumented
tag matched `.cm-table-widget` in `owned` mode, which means Obsidian's cell
editor and its widget exist **transiently** there before
`suppressNativeCellEditor` clears them. So the old
`hasVisibleTableWidget()` predicate was _intermittently_ true in `owned`,
suppressing the parent's cursor on some frames and not others. That is a
concrete mechanism for a cursor that comes and goes, and it is in this
plugin's predicate rather than in the fork. The fix — asking whether
**either** implementation renders a table — makes it deterministic, and the
instrumentation confirms `suppressed=true` consistently in `owned`.

**A real defect remains: no caret is drawn in a cell in `owned` mode.** The
parent is correctly suppressed, and nothing else draws one — the nested editor
is constructed without the vim extension, so it has no `BlockCursorPlugin` at
all, and `drawSelection`'s own cursor measured `0x0`. `native` does not have
this problem because Obsidian's cell editor receives the vim extension and
draws its own cursor.

That is almost certainly the user-visible half of this report, and
`table-nested-view.e2e.ts:244` currently asserts `nested.cursorLayers === 0`
as **correct**, which pins it.

### A fork hypothesis that was tested and rejected

`drawSel()` has a genuine single-shot-recovery hole: `update()` clears the
layer on focus loss, and a later measure yielding zero cursors cannot restore
it, because `cursors.length != this.cursors.length` is `0 != 0` and `.some`
over an empty array is false — so it returns having done nothing, with no
further measure scheduled.

A bounded retry was implemented in the fork and **changed nothing**. The
instrumentation shows why: the retry is gated on `!drawSuppressed`, and in
this path `drawSuppressed` is `true`. The hole may still be worth closing on
its own merits, but it is not this defect, and the patch was reverted rather
than published on an unverified hypothesis.

### Defect 2: found, fixed in the fork, and the mechanism is exact

With the caret in a cell the nested editor **has** a caret and is focused — it
is forcibly hidden. Measured on the nested editor's own cursor layer:
`display: none` (inline), with **one** child.

`BlockCursorPlugin.update()` does this:

```ts
let nativeLayers = this.view.scrollDOM.querySelectorAll(
  ".cm-cursorLayer:not(.cm-vimCursorLayer)");
for (...) nativeLayers[i].style.display = "none";
```

The comment above it reads "Always hide native CM6 cursor layers — the fork
renders its own cursor for every mode", which is right for its own view and
wrong here: the nested cell editor is a **separate `EditorView` mounted inside
the parent's `scrollDOM`**, and it draws its caret with plain
`drawSelection()`. So the parent's plugin reached across an editor boundary and
hid another view's caret. Probing confirmed it directly — the parent's own
query returns two matching layers, one of them `insideNested: true`.

This also explains every `0x0` reading in the section above: a `display: none`
element has no box, so each probe that measured geometry was measuring the
consequence rather than the cause.

Fixed in the fork by skipping layers it does not own:

```ts
ownsLayer(layer) { return layer.closest(".cm-editor") === this.view.dom }
```

Generic, with no mention of tables — it only asserts "my own view's layers".
The same guard is applied in `destroy()`, which previously cleared a `display`
property it had never set on a nested view's layer.

Verified against a local fork build: `display: block`, one child, a `1x19`
caret at `1146,253` inside a cell whose box starts at `1127,203`. Negative
control — remove the ownership check — returns it to `display: none` and
`0x0`. The fork's own suite stays green across four partitions: **1622
passing, 0 failing**.

`test/specs/table-cell-caret.e2e.ts` holds the regression, skipped until the
fork ships and the alias range is bumped.

### A claim from the previous pass, withdrawn

That pass suggested `table-nested-view.e2e.ts`'s `cursorLayers === 0`
assertion was pinning the defect. It is **not**: it counts
`.cm-vimCursorLayer`, the fork's own layer, which the nested editor
legitimately does not have because it is built without the vim extension. The
caret comes from `drawSelection`'s `.cm-cursorLayer`. That assertion is correct
and unchanged.

### Still ambiguous, and stated as such

Whether the parent cursor is reliably drawn **outside** a table in `owned`
mode is unresolved. This spec's DOM query reports none; the fork's own
`kids` counter reports one. The instrumented tag cannot reliably distinguish
the parent from Obsidian's transient cell editor — both fail the
`.cm-table-widget` and nested-class tests once the widget is cleared — so the
logged lines cannot be attributed with confidence. Resolving it needs a view
identity the fork can report (a stable id per `EditorView`), not another DOM
selector.

### Defect 3 is pre-existing and in `native`

`native` fails `the cursor returns when the caret leaves the table`: after the
caret has been inside a table and leaves, no cursor is drawn. The suppression
latch clears (`clearCursorSuppressedForView`) but the cursor does not come
back within the measured window. Not introduced here, and invisible to the
existing suite for reason 2 above.

## Instrument errors made while finding this

Recorded because they cost most of the investigation, and because the pattern
is now four-for-four in this plan sequence:

| read                                       | why it misled                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `.cm-vimCursorLayer > *` only              | the fork draws `.cm-fat-cursor`; omitting it reported "no cursor" everywhere                                                |
| `getComputedStyle(.cm-content).caretColor` | the fork's rule targets `.cm-vimMode > .cm-content > .cm-line`; reading `.cm-content` measures an unrelated inherited value |
| a `visible()` filter requiring width > 0   | hid a `0x0` element that was present                                                                                        |
| filtered vs unfiltered counts              | produced two contradictory readings of the same state before the race was recognised                                        |

The habit that eventually worked: count the element **unfiltered** first, then
add one filter clause at a time.

---

## Re-measured later: one of the three "defects" was not one

The three findings above were recorded from the spec's failures. Re-measuring
each in isolation changes the picture substantially, and the correction is
worth more than the original reading.

### `owned` PRESENCE / ABSENCE — not a defect, and not non-determinism

Running the `owned` half **alone**, with the `native` half not executed, every
step is correct:

| step                      | `viewSuppressed` | `overrideCount` | parent cursor layer                  |
| ------------------------- | ---------------- | --------------- | ------------------------------------ |
| caret outside the table   | `false`          | 0               | `display: block`, 1 child            |
| caret inside a cell       | `true`           | 1               | hidden (nested editor draws instead) |
| caret outside again       | `false`          | 0               | `display: block`, 1 child            |
| after a further keystroke | `false`          | 0               | `display: block`, 1 child            |

The recorded "two identical sequences measured `1` and `0` fat cursors" was
not non-determinism. It was **cross-test contamination**: the preceding
`native` scenario leaves a stale `true` in the fork's suppression override,
which is a `WeakMap` keyed by `EditorView`. `setPluginSettingAndReload` does
not recreate the editor and does not reset that map, so `owned` started every
run already suppressed. The trace is unambiguous — in the combined run the
`owned` half records **no** `setCursorSuppressedForView` call at all while
reporting `overrideCount: 1`.

Consequence for the spec: its `owned` half is a contamination guard as much as
a cursor guard, and the two surfaces must stay in one file, in this order, for
it to keep that property.

### `native` returns — real, and narrower than recorded

It reproduces only when the caret leaves the table **without a keystroke**.
Same document, same start and end offsets:

| how the caret left      | `viewSuppressed` | `overrideCount` | cursor  |
| ----------------------- | ---------------- | --------------- | ------- |
| `k` `k` `k` (real keys) | `false`          | 0               | present |
| dispatched selection    | `true`           | 1               | absent  |

Mechanism: entering a table activates table-nav, which suppresses the cursor;
`TableNavController.update()`'s `s.state === 'nav'` branch returns
unconditionally and never re-checks whether the caret is still in a table; and
nav's only exits run from its own key handlers. So a picker jump, `:42`, a
mark or a harpoon slot leaves nav active with the caret outside the table —
keys swallowed (a following `j` did not move the head) and the cursor
suppressed. `table-cell-cursor-guard` cannot compensate, because its `update()`
early-returns while `isTableNavActive(state)`.

### Fix attempts, and why they are not in the tree

Five attempts, each verified by running both suites:

1. Exit from the `nav` branch directly — the branch fires and `exitTable`
   aborts, because it dispatches and CM6 rejects a reentrant dispatch from a
   ViewPlugin `update()`.
2. Defer with `requestAnimationFrame` — **fixes the target defect** (guard spec
   4 failing → 1 failing, `owned` contamination gone) but breaks
   `tables.e2e.ts` `ca| should change cell including trailing pipe`. Bisected
   to the nav-branch block.
3. Add `!update.docChanged` — `ca|` still fails.
4. Add an `isCellVimIdle` guard — `ca|` still fails. Note `isCellVimIdle(null)`
   returns `true` by design, so the guard passes whenever the adapter is not
   resolvable; that is a plausible but unconfirmed reason it was ineffective.
5. Skip the realign on the non-user-initiated exit — `ca|` still fails.

The `ca|` failure is `Position 41 is out of range for changeset of length 37`,
thrown synchronously inside the test's own callback: a stale-position dispatch
against the post-change document (`ca|` removes 4 characters from a 41-char
document). `ca|` ends in insert mode, and the test reports `activeEl: BODY`,
`cmFocused: false`.

The controller is therefore left unchanged pending a design that cannot land
mid-operation. Three of the four guard scenarios pass without it.

---

## Resolution

Two changes, in `src/vim/table-nav-controller.ts`. The second one alone was
tried five times and failed; it only became safe once the first was in place.

### 1. `tryEnter()` resolves the table from the current state

`scheduleEntry()` captured a `TableRange` and its `entryTimer !== null` guard
stopped any later update replacing the pending candidate, so an edit inside
the `ENTRY_DEBOUNCE_MS` window left the captured `to` past the end of the
document. The only validation was `cursorInRange(from, to)`, which still
passes because the cursor is numerically inside the stale span. The stale
`tableTo` then reached `tableNavStateField`, where the next document-changing
transaction maps it and throws from inside a `StateField` update:

```
Position 41 is out of range for changeset of length 37
```

This is a **pre-existing** defect, not one introduced by the exit work — but
it is what made every attempt at the exit fail, because the teardown dispatches
and that is what mapped the stale range. `tryEnter()` now searches the current
state, and rejects a range extending past `doc.length`.

### 2. A deferred, fail-closed, non-interactive exit

`update()`'s `nav` branch schedules `abandonNav()` on a frame when a
**selection-only** transaction leaves the caret outside every table. The frame
re-validates rather than captures: session still `nav`, the document still the
same immutable `Text` object, the caret still outside every table, and vim
quiescent.

`vimQuiescent()` is fail-closed — an unresolvable adapter or vim state answers
false. `isCellVimIdle` is deliberately **not** reused: it treats a null state
as idle, which is right for a cell editor still initialising and wrong for a
decision that dispatches and destroys a cell editor.

`abandonNav()` is a separate routine rather than a placement variant of
`exitTable`, because the order differs where it matters: `exitTableNav` is
dispatched **before** `destroyTableCell()`, so no stale range is left in the
state field when the cell-editor teardown flushes a transaction. It does not
call `placeCursorAround` or `view.focus()` — the caret is already where
whatever moved it wanted it, and focus may legitimately have moved too.

### Negative controls

| Control | Sabotage                                         | Result                                     |
| ------- | ------------------------------------------------ | ------------------------------------------ |
| E       | `tryEnter` trusts the captured range again       | `ca                                        | ` fails with the position error; parity still 8/8 |
| F       | `vimQuiescent` returns true on a missing adapter | **did not fire** — both suites still green |
| G       | no deferred abandon at all                       | parity 4 failing, the original state       |
| H       | `refreshVimCursors()` removed from `abandonNav`  | **did not fire** — both suites still green |

Control H is why there is no explicit cursor redraw in `abandonNav`. The
reasoning for adding one was sound and measured in the earlier design — in
that ordering the layer really was left visible with zero children — but in
this ordering the `exitTableNav` dispatch and the cell-editor teardown already
produce the update the fork redraws on. It was removed rather than kept on
faith. If the teardown is ever reordered so that no transaction follows the
release, `refreshVimCursors()` is the fix.

Control F is recorded as **unverified** rather than treated as proof the guard
is unnecessary. The suite never reaches a state where the adapter fails to
resolve, so no scenario distinguishes the two branches. It is kept because
`false` is the only coherent answer for a predicate asking whether vim is
_demonstrably_ quiescent — with no state to read, nothing is demonstrable —
and because the permissive form is what made attempt 4 ineffective. Anyone
removing it should expect no test to object.
