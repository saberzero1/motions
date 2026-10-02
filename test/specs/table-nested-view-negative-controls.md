# Negative controls — nested table editor lifecycle

Plan B Step 3b. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers `test/specs/table-nested-view.e2e.ts`. Baseline with the implementation
intact: **6 passing**.

Control 2 is the important one. It did **not** fire on the first attempt, and
fixing that exposed a defect in the product as well as in the test.

## Control 1 — nothing mounts

**Sabotage** in `src/vim/table/nested-view.ts`, skipping the mount:

```ts
this.unmount();
if (root) return; // SABOTAGE
this.mount(table, text, root);
```

`2 passing | 4 failing`. Everything that asserts on the nested editor fails.

The two survivors are the two that should survive: the `native`-mode control
(nothing is supposed to mount there) and the characterisation of Obsidian's own
cell editor (which does not involve ours). Note that the isolation test fails
rather than passing vacuously — `getNestedTableStats()` reports `-1`, not `0`,
for gutters and cursor layers when nothing is mounted, precisely so that
"minimal" and "absent" cannot read alike.

## Control 2 — the rows container flattened (and a hole in the first version)

**Sabotage** in `src/vim/table/surface-widget.ts`, painting the root's children
directly instead of the dedicated rows container:

```ts
const rows = root.children; // SABOTAGE
```

This is the coupling the rows container exists for: `paint` assigns
`textContent` to child _n_ and trims any extra children, so with a flat
structure it overwrites a row onto the nested editor's host and then removes it.

**First attempt: `6 passing`. The control did not fire.**

The test was at fault. Every field it asserted on — `mounted`, `doc`, `gutters`,
`cursorLayers` — reads from the live `Set` and from `view.state`, all of which
survive the editor being torn out of the document. The spec was measuring an
orphaned editor and could not tell the difference.

Two changes followed, one per side:

- the stats gained `connected` (`view.dom.isConnected`), and the spec asserts it
  plus `hostElements` and `rowsHidden` **after** the edits, not only before;
- the product's reconcile now requires `held.view.dom.isConnected` as well as
  `held.root.isConnected`, so a detached editor is remounted instead of kept.
  Without that, a repaint that detached the host left the user with no visible
  editor and the plugin believing one was mounted.

**Re-run after both: `5 passing | 1 failing`** — `survives edits to its own
table without being rebuilt`, at `mounts` (`Expected: 3 / Received: 4`). The
detach is detected, the host is remounted, and the mount-count delta is what
reports it. That assertion is therefore load-bearing and must not be relaxed.

## Control 3 — a disposer dropped

**Sabotage** in `nested-view.ts`, registering one disposer instead of three:

```ts
cleanups: [() => view.destroy()], // SABOTAGE
```

`5 passing | 1 failing` — `unmounts and runs every disposer …`
(`Expected: 15 / Received: 5`). The assertion is the invariant
`cleanups === unmounts * 3` rather than an absolute count, so it holds however
many times earlier scenarios mounted and unmounted.

## Control 4 — no unmount when the cursor leaves the table

**Sabotage** in `nested-view.ts`:

```ts
if (!table) {
    return; // SABOTAGE
}
```

`5 passing | 1 failing` — same scenario, at `mounted`
(`Expected: 0 / Received: 1`).

## Control 5 — the characterisation scenario's own control

`Obsidian's cell editor … owns its own cell's range` asserts that a write to
the cursor's cell does **not** land. On its own that passes if dispatching is
broken for any reason at all, so the scenario also writes to the header row and
requires that one to land.

**Sabotage** in the spec, making the write helper always report failure:

```ts
return false; // SABOTAGE
return cm.state.doc.toString() !== before;
```

`5 passing | 1 failing` (`Expected: true / Received: false`) — the header-row
control fails while the blocked-cell assertion still passes, which is the proof
that the control is the load-bearing half.

## Control 7 — the native cell-editor suppressor

`keeps the cursor's own cell writable …` asserts three links in a chain: the
suppressor fired, Obsidian's cell editor is gone, and a write to that cell
lands. Two sabotages, hitting different links.

**7a — suppressor disabled** (`src/vim/table/native-cell-suppressor.ts`):

```ts
if (true) return false; // SABOTAGE
```

`5 passing | 1 failing`, at `suppressions` (`Expected: > 0 / Received: 0`).

**7b — suppressor counts without clearing**, which is the more interesting
half, because it leaves the counter satisfied:

```ts
return true; // SABOTAGE: counted, not cleared
```

`5 passing | 1 failing`, at `tableCellActive` (`Expected: false / Received:
true`).

Both the counter and the state assertion are therefore load-bearing. The
counter alone would pass under 7b; the state assertion alone would pass on a
run where Obsidian never opened a cell editor at all — which does happen, see
below.

## Why `suppressions > 0` sits next to the write assertions

A probe run measured `editMode.tableCell == null` after the identical
park-the-cursor sequence, with the write landing unassisted. Obsidian does not
always open a cell editor. On such a run every assertion about writability
passes with the suppressor doing nothing, so the test would report a working
suppressor it had not exercised. `suppressions > 0` is what excludes it.

## Measurement behind the suppressor

| step                                        | `editMode.tableCell` | write to that cell lands |
| ------------------------------------------- | -------------------- | ------------------------ |
| cursor parked in the cell                   | set                  | **no**                   |
| after `cell.destroy()`                      | **still set**        | **no**                   |
| after `editMode.tableCell = null`           | null                 | **yes**                  |
| 1 s idle after clearing                     | null                 | —                        |
| after moving the selection within the table | set again            | —                        |

`destroy()` alone is not sufficient — the reference is what gates the lock — and
`destroy()` alone is not harmless to skip either, since it is what releases the
editor's own resources. Hence destroy-then-null.

It does not return on its own, so there is no clear/reopen churn while idle; it
does return when the selection moves inside a table, which is why the suppressor
runs from the same reconcile pass as the nested editor.

Where that editor lives, measured: `cm.dom.isConnected === false`, inside a
detached `.cm-table-widget`, with `document.activeElement` on the parent's
`.cm-content` and not inside the cell editor. In owned mode Obsidian builds the
whole thing off-document — which is why it is invisible, why it does not steal
focus, and why it was not noticed until a write was attempted.

## Measurement behind the header-row edit target

The survival scenario edits line 3 (the header) rather than line 5 (the cursor's
own cell), which looks arbitrary without this.

Owning the table _renderer_ does not take over the table _editor_. With
`tableWidgetMode: 'owned'`, parking the cursor in a table still opens Obsidian's
`TableCellEditor` (`view.editMode.tableCell != null`), and it owns the range of
the cell it is editing. Measured, writing `X` at offset 2 of each line:

| target                            | landed    |
| --------------------------------- | --------- |
| header row, 1st write             | true      |
| header row, 2nd write             | true      |
| separator row                     | true      |
| cursor's own cell, 1st write      | **false** |
| cursor's own cell, 2nd write      | **false** |
| line outside the table, 1st write | true      |
| line outside the table, 2nd write | true      |

The block is scoped to one cell, not to the table range, and not to the document.

The first diagnosis of this was wrong in an instructive way: an earlier probe
looped ten writes into the cursor's cell, saw the **first** land and the rest
not, and read it as "dispatches are being dropped after the first". Writing to
each line separately is what located it.

This is a constraint for Step 5, which forwards insert-mode text to the parent
document: the one cell it most needs to write is the one Obsidian holds.
