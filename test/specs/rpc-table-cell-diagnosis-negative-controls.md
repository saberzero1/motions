# Negative controls — `rpc-table-cell-diagnosis.e2e.ts`

Plan A Step 2. Per `.agents/skills/negative-control/SKILL.md`: every assertion
here was shown to fail before being trusted.

## The fix under test

`src/vim/table-nav-controller.ts:1006`, inside
`installCellEscapeCapture`:

```ts
if (!isExternalBackendActive()) e.stopImmediatePropagation();
```

Previously an unconditional `e.stopImmediatePropagation()`.

## Control 1 — B11 is load-bearing, not vacuous

**Sabotage**: restore the pre-fix behaviour by making the call unconditional.

```ts
if (!isExternalBackendActive() || true) e.stopImmediatePropagation();
```

| run                       | B11      | B12  |
| ------------------------- | -------- | ---- |
| fix applied               | **pass** | pass |
| sabotaged (unconditional) | **FAIL** | FAIL |

B11 flips with the fix, so it is measuring the fix rather than passing on
ambient behaviour.

Observed B11 values with the fix applied:

```
opened: true   focusInCell: true
healthy  : fast=true  slow=true
stalled  : fast=false slow=false
recovered: fast=true  slow=true  elapsedMs=4
```

`recovered` is probed at a **35000 ms** deadline, which exceeds
`REQUEST_TIMEOUT_MS = 30000` (`src/rpc/msgpack-rpc.ts:21`). A request left
pending by the stall therefore cannot satisfy it; the 4 ms elapsed shows a
real answer rather than a late settle.

## Control 2 — B12's failure was mine to fix, in the test

B12 failed in three successive forms. Each failure was attributed before
being changed, rather than assumed to be a product defect.

**Form 1** — asserted `navAfter === true` after one Escape, preconditioned
only on `opened`. Failed with `navAfter: false`.
Cause: `opened` reads `editMode.tableCell != null`, which Obsidian sets from
cursor position alone — it does **not** prove the plugin's overlay engaged.
The scenario also toggled RPC mid-spec without reloading, leaving the previous
scenario's nav session state and its 500 ms `EXIT_COOLDOWN_MS` in place.

**Form 2** — added a full reload and a `navBefore` precondition. Still failed,
now with `navBefore: true`, so the overlay _had_ engaged and the outcome was
genuine.

**Attribution measured two independent ways**, both showing the fix is inert
with RPC disconnected:

1. `backendState.connected === false`, and `isExternalBackendActive()` is set
   only while connected and cleared at teardown
   (`src/rpc/neovim-connection.ts:322,367,647`), so the guard takes the
   bundled-engine branch — byte-identical to pre-fix code.
2. Under the Control 1 sabotage, B12 failed **identically**. A failure present
   with and without the change cannot be caused by the change.

**Form 3 — the test was wrong.** One Escape is not supposed to reach
table-nav. `.omo/plans/cross-note-jumplist-and-table-vim-modality.md` D5
documents the transition as
`cell-edit(insert) → cell-edit(normal)` via Escape, then
`cell-edit(normal) → table-nav` via Escape. The scenario now presses two and
asserts both steps:

```
navBefore: true          (overlay engaged)
navDuringEdit: false     (cell edit owns keys)
navAfterFirstEsc: false  (cell-edit normal, NOT table-nav)
navAfterSecondEsc: true  (table-nav)
doc unchanged
```

Asserting both steps is strictly stronger than the original single-Escape
expectation: it would now catch either transition breaking, and it encodes the
documented contract rather than a guess at it.

## Control 3 — the stall itself must remain

B8 and B9 are retained unchanged as controls on the fix's blast radius: `Z`
outside any table must still stall (`inTable: false`, `fast=false`) and still
recover on the next real key (3 ms). The fix must not paper over normal Neovim
behaviour, only restore the ability to cancel it from inside a cell editor.

## Full suite state

12 passing with the fix applied; 10 passing / 2 failing under the Control 1
sabotage.
