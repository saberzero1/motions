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

### Defect 1 is a race, and that is the headline

Two probes running the **same** sequence — `setupEditor`, pause, `cm.focus()`,
dispatch a selection to line 1, pause, count `.cm-fat-cursor` — returned:

```
probe A   fat: 1      probe B   fat: []
```

The only difference between them was an extra `executeObsidian` round-trip
beforehand, i.e. timing. Unfiltered counts, same selector, same position
outside any table.

So the parent cursor in `owned` mode is **sometimes drawn and sometimes not**.
That is the most likely reason this defect has been fixed four times: each fix
was validated inside one timing window, and a race does not stay fixed.

It also explains the user-visible report — a cursor "displayed next to the
table widget". The parent's parked selection sits inside the block-replaced
range, so when the stale cursor does paint, it paints at the table's edge.

A race needs a deliberate fix — most likely ordering between the surface's
block-replace decoration and the fork's `BlockCursorPlugin` measurement — not
another point patch. No exception is logged: `console.error` was captured
across the sequence and came back empty, so the fork's plugin is not crashing.

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
