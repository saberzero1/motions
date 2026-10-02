# Negative controls — layout model and cell decorations (Plans E1.3, E1.4)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-cell-decorations.e2e.ts` (**6 passing**) and
`test/unit/table/layout-model.test.ts` (**21 passing**).

## Unit controls — the layout model

| #   | Sabotage                                                          | Result                                                                                                        |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| U1  | `lineFrom += text.length` — the newline forgotten                 | **2 failed, 19 passed**: `places cell ranges at absolute document offsets`, `honours a non-zero table offset` |
| U2  | iterate `available` instead of `Math.min(available, columnCount)` | **1 failed, 20 passed**: `a row with more cells is truncated for layout only`                                 |
| U3  | every alignment forced to `none`                                  | **1 failed, 20 passed**: `derives columns, alignment and widths from the source`                              |

Each isolates to the cases that depend on it. U1 is the one worth keeping: an
off-by-one in the line accumulator is invisible on a single-line fixture and
puts every decoration on the wrong row from the second line onward, which is
why two of the three offset tests use a table starting at a non-zero offset.

## e2e controls — the decorations

### Control 1 — the decoration extension removed

`1 passing | 5 failing`.

The survivor is `never reuses the cm-table-widget class`, which asserts an
**absence** and so passes when nothing is decorated at all. That is the
expected shape for an absence assertion, and it is why the other five exist.

### Control 2 — alignment ignored in the decoration layer

`CELL_MARKS['none']` for every cell.

`5 passing | 1 failing` — only `takes each column alignment from the separator
row`.

This is Plan E1.4's mandated control, and the isolation is the point: every
geometry assertion still passes, proving that "the columns line up" and "the
columns carry the right alignment" test different things rather than one
standing in for the other.

### Control 3 — `.cm-table-widget` reused on the nested container

`NESTED_CLASS = 'vim-motions-table-nested cm-table-widget'`.

`5 passing | 1 failing` — only `never reuses the cm-table-widget class`.

**The plan's stated justification for this control does not currently hold.**
Plan E1.4 says reusing the class would make "the treesitter bridge withhold its
parser from the owned surface" and "Plan G's cursorline rule hide the owned
surface's cursorline", and predicts the surface-gate unit test will fail.
Measured, with the sabotage applied:

| suite                          | result        |
| ------------------------------ | ------------- |
| `table-surface-gate.e2e.ts`    | **2 passing** |
| `table-cell-cursorline.e2e.ts` | **3 passing** |

Neither moved, for two independent reasons:

- the nested editor is constructed directly and receives **no**
  `registerEditorExtension` extensions, so the treesitter bridge never reaches
  it. Withholding a parser from a view that has no bridge is a no-op.
- Plan G measured that cursorline does not render in a cell editor at all —
  zero elements in all three `cursorlineopt` modes — and deleted the two CSS
  rules. There is no rule left to hide anything.

The `MUST NOT` is still worth keeping and is still pinned by the spec, but as a
**forward-looking convention** rather than a currently-measurable consequence:
if the bridge or the cursorline ever do reach the nested editor, the class
collision becomes real and silent. Recording the distinction matters, because
a reader who trusts the plan's reasoning would conclude the constraint is
load-bearing today and that two other suites are guarding it. They are not.

## A rejected implementation

Alignment was first made _visible_ in the nested editor: hide `n` trailing pad
characters, draw a widget of `n` real spaces before the content, leaving the
row's total width unchanged. It worked and `verify` was green.

It was removed, unshipped, for three reasons. Markdown pads a cell on the right
— `realignTableLines` uses `padEnd`, as Obsidian's own formatter does — so the
mechanism is precisely the "leading-space rewriting" Plan E1.4's own triage
rules out. The surface's job is to show the table's source faithfully, and the
effect is cosmetic. And it put ~60 lines plus a `WidgetType` plus two CSS rules
on the hot path of every table render to achieve it.

The plan's prescribed alternative — "`alignments` from the separator row →
cell-mark `text-align`" — is **not implementable as written**: `text-align` is
a no-op on an inline span, so a spec asserting
`getComputedStyle(cell).textAlign === 'right'` would pass while nothing moved.
That assertion is deliberately absent here; the alignment **class** is asserted
instead, which is what the code produces and what the passive grid will
consume. Alignment is rendered in E1.6, where cells are real blocks and CSS can
do it honestly.
