# Negative controls — clicks, context menu, clipboard (Plan E1.4b)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-click-and-clipboard.e2e.ts` (**4 passing**).

## Measured before implementing: two of three already worked

Plan E1.4b marks click-to-place-cursor, the cell context menu and the
cell-selection clipboard as **required**, and describes the first as "mostly
already works". Measured on the shipped code:

| interaction                 | result                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| right-click a cell          | **already worked** — `menus: 1`                                     |
| block `y` over a 2×2 region | **already worked** — register `{ blockwise: true, text: "aa\ncc" }` |
| click a cell                | **broken** — `childHead` 34 → 52 while `parentHead` stayed 46       |

So only the third needed building. The click moved the **child's** caret and
left the parent's where it was, which means the caret the user saw and the
position the next motion or operator acted on were different cells. "Mostly
already works" was half right: the visible half worked.

## Control 1 — the up-sync removed

`2 passing | 2 failing` — both click scenarios. The context-menu and clipboard
scenarios survive, which is correct: neither depends on the parent's cursor
following a click, and that is what shows the four scenarios are not testing
one thing four times.

## Control 2 — the delimiter snap removed

**Sabotage**: `const snapped = childHead`.

`3 passing | 1 failing` — only `a click on a delimiter lands in a cell`.

`cellAt` deliberately returns null on a delimiter rather than guessing a side,
so without the snap a click on a rendered `|` leaves the cursor between two
cells, where the next motion or text object acts from nowhere in particular.

## Control 3 — the `mirroring` guard removed

**This control needed a different suite**, and that is the finding.

Against `table-click-and-clipboard.e2e.ts` alone: **4 passing**. The up-sync's
own early return on head equality already breaks the obvious feedback loop, so
nothing in this spec can see the flag.

Against the suites that exercise a **mirrored multi-range selection**:

| assertion                   | without the guard                         |
| --------------------------- | ----------------------------------------- |
| visual mode after `V` / `v` | `Expected: "visual" / Received: "normal"` |
| status bar after `V`        | `Expected: "v-line" / Received: "normal"` |
| snippet tabstop selection   | `Expected: "page" / Received: ""`         |

The mechanism: the host mirrors the parent's selection **down** to the child,
that write is itself a `selectionSet` update, and an unguarded up-sync reads
only `selection.main.head` and pushes a **collapsed** selection back. Every
mirrored range — visual block, linewise visual, a snippet tabstop — is
destroyed by its own mirror.

The lesson generalises: a bidirectional sync's loop guard cannot be validated
by the feature that motivated the sync. It has to be checked against whatever
else writes the same state, and here that was three other specs.

## A harness error, recorded

The click scenario first reported the parent ignoring the click entirely. The
cause was the spec: `pointOf` queried `.vim-motions-table-cell` against the
whole view, which also matches the **passive** rows — and those are
`display: none` while the nested editor is mounted, where
`getBoundingClientRect()` returns all zeros. The click went to (0, 0), outside
the editor. Scoping the query to `.vim-motions-table-nested` fixed it.

That is the fourth measurement in this plan sequence spoiled by reading the
wrong element, after `.table-wrapper` for horizontal scroll, the pre-fix
repeated-tabstop reading, and element-box width for passive/active geometry.

## Entering a table by clicking it (later work)

The scenarios above all call `enterCell()` first, which moves the cursor into
the table programmatically and mounts the nested editor, and then click inside
**that** editor — where CodeMirror resolves the position itself and
`selectionUpExtension` carries it to the parent. So none of them covered
_entering_ a table, and clicking a table the cursor was not already in did
nothing at all. Measured with a real pointer event on the passive grid: the
parent's head stayed at `0` and no editor mounted.

Two scenarios were added for that case, with three controls.

### Control 6 — `TableSurfaceWidget.ignoreEvent` override removed

```
✖ enters the table when the passive grid is clicked from outside
    Expected substring: "cc"
    Received string:    "Line above"
✖ a click on a passive delimiter lands in a cell
4 passing, 2 failing
```

The original defect, and the reason the first implementation of the handler
was **dead code**. `eventBelongsToEditor` walks from the event target up to
`contentDOM` and returns false if any view on the way reports `ignoreEvent`,
which skips every `domEventHandlers` entry. `WidgetType.ignoreEvent()`
defaults to `true`, so the handler was registered and never called. The
override returns `true` for everything except `mousedown`, keeping the
measured key behaviour (a blanket `false` was previously measured to stop every
key reaching the editor) and changing only the one interaction that needs it.

### Control 7 — `snapOutOfDelimiter` neutered

```
✖ a click on a passive delimiter lands in a cell
✖ a click on a delimiter lands in a cell, not on the delimiter
4 passing, 2 failing
```

Both surfaces fail together, which is the point of having moved the function
into `layout-model.ts` and deleted the copy in `nested-view.ts`: two
implementations that drifted would land the cursor between cells on one
surface only.

**This control first failed to fire, and the fault was the new scenario.** It
passed with the snap neutered, because a delimiter span is one character wide
and its centre hit-tests to the offset _after_ the `|` — already inside the
next cell, needing no snap. `pointOfPassive` now biases to the span's left
edge for a delimiter, landing on the delimiter's own offset, which is the
position that has no cell. Without the control the scenario would have shipped
looking like coverage of a path it never touched.

### Control 8 — `createTableSurfaceClick()` not registered

```
✖ enters the table when the passive grid is clicked from outside
    Expected: 0        // before.mounted
    Received: -1
✖ a click on a passive delimiter lands in a cell
4 passing, 2 failing
```

A distinct mechanism from control 6 with the same user-visible symptom: there
the handler is unreachable, here it does not exist. Both are worth holding,
because the widget override and the extension are in different files and
either one alone is inert.
