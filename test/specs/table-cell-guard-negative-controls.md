# Negative controls — table cell editor guard (Plan G)

Per `.agents/skills/negative-control/SKILL.md`: every assertion was shown to
fail before being trusted.

Covers `test/specs/table-cell-scrolloff.e2e.ts` (**1 passing**) and
`test/specs/table-cell-cursorline.e2e.ts` (**3 passing**).

## Control 1 — the scrolloff gate removed

**Sabotage** in `src/vim/scrolloff.ts`:

```ts
if (false && classifySurface(update.view) === 'table-cell') return; // SABOTAGE
```

`1 failing` — `Expected: 0 / Received: 2`. The cell count becomes non-zero for
five `l` presses inside a cell.

This is also the **pre-gate baseline**: before the gate, an instrumented count
measured **8** listener runs inside a cell across two keystrokes. The lower
figure here (2 for five keystrokes) is because the gated build's counter only
increments past the gate, and the cell editor consumes most of the key events
itself.

## Control 2 — the gate over-applied

**Sabotage**, withholding the listener from every surface:

```ts
if (true || classifySurface(update.view) === 'table-cell') return; // SABOTAGE
```

`1 failing` — `Expected: > 0 / Received: 0`, at the **parent** assertion.

This is the control that caught both earlier surface-gate attempts
(`.omo/table-probe/FINDINGS.md` § "SURFACE GATE"), where `appendConfig` from a
`ViewPlugin` installed the extension _nowhere_ and the cell-side assertions
passed for exactly that reason. A cell count of zero is identical whether the
gate withheld the listener or it never installed at all.

## Control 3 — classification in a construction phase: **NOT APPLICABLE**

Plan G's template control is "classification moved into a `ViewPlugin` create
function must fail, reproducing the detached-construction defect".

**It does not apply here, and no passing substitute was invented.** The gate
lives in an `EditorView.updateListener`, which has no construction phase: the
listener first runs on an update, and the `update.selectionSet` guard above it
already implies the view is in the document. There is nothing to move the
classification _into_.

The defect it guards against is real but belongs to `ViewPlugin`-based gates —
it is covered for the treesitter bridge by
`test/specs/table-surface-gate-negative-controls.md` control 7. Recorded here as
not applicable rather than silently omitted.

## Control 4 — the cursorline absence assertion inverted

`table-cell-cursorline.e2e.ts` asserts an **absence** (`0` highlights inside a
cell), and an absence assertion is indistinguishable from a selector that
matches nothing. So the control inverts it:

```ts
expect(inside.highlightsInWidget).toBeGreaterThan(0); // SABOTAGE
expect(inside.layersInWidget).toBeGreaterThan(0); // SABOTAGE
```

`3 failing` — `Expected: > 0 / Received: 0` in all three scenarios.

Selector validity is additionally proven **inside the spec**, not only by this
control: each scenario first asserts the parent has exactly one highlight with
the cursor outside any table, so the query demonstrably matches something.

## Why the parent control is mode-specific

Measured, and it changed the spec's shape:

| `cursorlineopt` | highlights in widget | parent highlights, cursor **in** a table |
| --------------- | -------------------- | ---------------------------------------- |
| `line`          | 0                    | **0**                                    |
| `both`          | 0                    | **0**                                    |
| `screenline`    | 0 (layers 0)         | **1 layer**                              |

In the `Decoration.line` modes the parent's own highlight also disappears while
the cursor sits in a table, because the line is inside the block-replaced range
and there is no rendered `.cm-line` for the class to attach to. So those two
scenarios assert the parent's highlight **returns on leaving the table**, while
the `screenline` scenario — a measured rectangle in its own layer, which
survives — asserts the parent's in place.

Asserting a parent highlight in place for `line`/`both` would fail for a reason
that has nothing to do with cell editors.

## What this plan did NOT do, and why

An earlier draft added two CSS rules to suppress cursorline inside
`.cm-table-widget`, on the stated grounds that it rendered there and was a
visible defect in the default configuration. **Measurement refuted that**:
cursorline does not render in a cell editor at all. The rules were removed and
the step became the regression coverage above.

Had they shipped, one of them (`display: none` on `.vim-motions-cursorline`)
would have been actively harmful: `buildCursorlineDecorations`
(`src/vim/cursorline.ts:66-74`) applies that class via `Decoration.line` to the
**real text line**, so hiding it hides the cell's content.
