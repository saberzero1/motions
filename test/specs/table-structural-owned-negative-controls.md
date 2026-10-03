# Negative controls — structural table commands in owned mode (Plan E2)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-structural-owned.e2e.ts` (**14 passing**) and
`test/unit/table/structural.test.ts` (**22 passing**).

## E2.1 — the reuse inventory, measured

Plan E2.1 requires a verdict for every structural key before any
implementation. All eleven already had a registered vim command; the question
was whether it works without Obsidian's table widget. Measured with the cursor
at offset 2 of the first data row, same fixture in both modes:

| Key  | Registered command                            | `native`          | `owned`     | Verdict                          |
| ---- | --------------------------------------------- | ----------------- | ----------- | -------------------------------- |
| `o`  | `:tablerowafter` → `editor:table-row-after`   | changed           | **inert**   | needed a text fallback           |
| `O`  | `:tablerowbefore` → `editor:table-row-before` | changed           | **inert**   | needed a text fallback           |
| `dd` | `:tablerowdelete` → `editor:table-row-delete` | changed           | **inert**   | needed a text fallback           |
| `dc` | `:tablecoldelete` → `editor:table-col-delete` | changed           | **inert**   | needed a text fallback           |
| `J`  | `:tablerowdown` → `editor:table-row-down`     | changed           | **inert**   | needed a text fallback           |
| `K`  | `:tablerowup` → `editor:table-row-up`         | changed           | **inert**   | needed a text fallback           |
| `H`  | `:tablecolleft` → `editor:table-col-left`     | no-op at column 0 | **inert**   | needed a text fallback           |
| `L`  | `:tablecolright` → `editor:table-col-right`   | changed           | **inert**   | needed a text fallback           |
| `I`  | `:tablecolbefore` → `editor:table-col-before` | changed           | **inert**   | needed a text fallback           |
| `A`  | `:tablecolafter` → `editor:table-col-after`   | changed           | **inert**   | needed a text fallback           |
| `=`  | `:tablerealign`                               | changed           | **changed** | already text-based, reused as-is |

"Inert" is literal: the document came back **byte-identical**. Ten of eleven
commands silently did nothing in `owned`, because they drive Obsidian's
private `TableEditor` through the widget the mode removes. One in eleven was
reusable.

`native`'s `tablecolleft` no-op is correct, not a failure — the cursor is in
column 0 and there is nothing to its left. The nav overlay no-ops there too,
which is why the spec has a separate scenario starting in column 2.

### A premise worth re-checking, and it held

E2 claims these keys "change meaning in `owned` mode, silently". That reads
oddly, since the nav overlay looks like a mode one enters. It is not: the
overlay **auto-activates** when the cursor lands in a table
(`table-nav-controller.ts` `update()` → `tryEnter()`), gated only on
`enableTableNav`, `tableWidgetMode === 'native'` and the fork. So in `native`
the structural meanings apply automatically and in `owned` they did not —
the divergence is real. `d` is likewise already swallowed in `native`, so
matching that is parity rather than a new restriction.

## Control 1 — the fallback never runs

**Sabotage**: `return false` at the top of `runTextFallback`, restoring the
pre-change behaviour.

`6 passing | 8 failing` — every scenario that expects the document to change.

The survivors are exactly the scenarios that assert **no** change:
`tablecolleft` at column 0, `tablerowup` across the separator, and the
outside-table set. That is the correct shape: an assertion of absence cannot
distinguish a working guard from a feature that does nothing, which is why the
suite carries both kinds.

## Control 2 — the in-table guard removed

**Sabotage**: fall back to `{ start: cursor.line, end: cursor.line }` when
`findTableBounds` returns nothing.

`13 passing | 1 failing` — only `outside a table, every command leaves the
document alone`.

Controls 1 and 2 are deliberately crossed: each is invisible to the other's
scenarios. Control 1 cannot fail the outside-table case, because that case
expects nothing to happen either way; control 2 cannot fail the in-table
cases, because the guard is satisfied there.

## Control 3 — column operations skip the separator

**Sabotage** in `mapColumns`: push the separator line unchanged.

| suite                           | result                  |
| ------------------------------- | ----------------------- |
| `table-structural-owned.e2e.ts` | **14 passing**          |
| `structural.test.ts`            | **20 passed, 2 failed** |

**The e2e cannot see this, and the reason is in the fixture.**
`realignTableLines` rebuilds the separator from the column count of the data
rows, so a skipped separator is silently repaired — _except_ for its alignment
markers, which realign reads back out of it. The e2e fixture uses
`|------|------|`, every column `none`, so there is no marker to misplace and
no observable difference.

The unit suite uses `|:---|---:|:--:|` and fails exactly the two alignment
cases: `keeps each column with its own marker when a column moves` and `gives
a new column no alignment`. So the separator handling is load-bearing — it
carries each column's alignment with the column — and the unit tests are the
only thing that can tell.

Recorded rather than papered over: the honest statement is that the e2e proves
cell counts and the unit tests prove alignment, and neither substitutes for
the other.

## Control 4 — `native` is untouched

Not a sabotage but a standing guard, and the one E2.4 requires. The five nav
suites plus `tables.e2e.ts` run unmodified in `native` and stay green:

```
table-nav-mode, table-cell-vim-mode, table-nav-disabled,
table-nav-scroll, table-nav-hotkeys, tables      6 passed
```

They assert against `.cm-table-widget` geometry, `editMode.tableCell` and
native `TableEditor` effects — none of which exists in `owned`. They were not
edited to pass in both modes, which is the failure class that produced the
`treesitter.e2e.ts` incident; owned coverage is new scenarios asserting
document outcomes instead.

## What was deliberately not done

E2.2 proposes registering the eleven keys in `GlobalMappingRegistry` so they
are remappable and visible to which-key. That is **not** in this change. The
fallback fixes the measured defect — ten commands doing nothing — behind the
commands, actions and `<leader>` bindings that already exist, without
intercepting a single key at document-capture level. Key registration shadows
`o`, `O`, `I`, `A`, `J` and the `d` prefix inside a table and needs its own
controls for each; it is a separate change with a separate risk profile.
