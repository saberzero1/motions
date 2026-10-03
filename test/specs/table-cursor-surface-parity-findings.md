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
