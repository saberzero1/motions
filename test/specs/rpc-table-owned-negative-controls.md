# Negative controls — owned table surface under RPC (Plan C)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/rpc-table-owned.e2e.ts` (**7 passing**), skipped by
`requireRpcPrerequisites` when `nvim` is absent. Measured against Neovim
0.12.5.

## Control 1 — the RPC gate restored

**Sabotage** in `resolveTableSurfaceBlocker`: return a blocker when
`isExternalBackendActive()`.

**First attempt: 7 passing. The control did not fire** — and the reason was a
hole in the spec's own setup, not in the sabotage.

`beforeEach` selected `owned` **before** the connection came up. The gate is
evaluated when the extension slot is built, so `isExternalBackendActive()` was
still false at that moment and the blocker never ran. A fully restored gate
therefore passed every assertion, which also means the _original_ blocker was
inert in that ordering: `owned` would have rendered under RPC before this plan
touched anything, as long as the mode was chosen first.

Reordered to RPC-then-mode — which is also the realistic flow, a user with the
backend connected choosing the mode — the control fires:

`5 passing | 2 failing`, with `rootCount` `Expected: > 0 / Received: 0` and
`nested.mounted` `Expected: 1 / Received: 0`.

## Control 2 — a key router installed in the child

**Sabotage**: install `installKeyRouter` unconditionally.

`6 passing | 1 failing` — `C2: the child is inert and never focused`,
`routerInstalled` `Expected: false / Received: true`.

Detected by an **installation spy**, as the plan requires, not by key
behaviour. A behavioural control is unfalsifiable here: the parent's capture
handler calls `preventDefault()` and `stopPropagation()` before a child
listener would run, so `routed` stays `0` and no double-application occurs
whether the router exists or not.

## Control 3 — `contenteditable=false` alone, and the focus guard alone

Neither is individually detectable, and that is worth stating rather than
hiding:

| Sabotage                                                   | Result                   |
| ---------------------------------------------------------- | ------------------------ |
| restore `contentDOM.focus()`, keep `contenteditable=false` | **7 passing**            |
| remove `contenteditable=false`, keep the focus guard       | **7 passing**            |
| **remove both**                                            | **5 passing, 2 failing** |

`focus()` on a non-editable `contentDOM` is a no-op, so either guard alone is
sufficient and neither can be observed while the other stands. Plan C mandates
both — "`contentEditable=false` **and** never focused" — and both are kept as
defence-in-depth on an input-path invariant, with this table as the honest
record that the pair is load-bearing while the members are not.

The joint control's **second** failure is the more interesting one:

```
C3: the parent cursor cannot be parked inside the table (limitation)
  Expected: < 5   Received: 5
```

With the child focused, the parent's head reaches row 5 and agrees with
Neovim. That is a direct confirmation of the limitation's cause below — and of
why it is not fixed by focusing the child.

## The measured limitation, and why C3's acceptance was unachievable

Plan C's C3 requires that, parked on the first data row,
`nvim_win_get_cursor` agrees with the parent's cursor, and prescribes a
`nvim_win_set_cursor` push to achieve it.

Measured, the parent **cannot** park there at all: with Neovim on row 5 the
parent's head sits on row 3. A block-replaced range cannot host a caret, and
under the bundled engine it is the _focused child_ that keeps the parent's
parked selection stable — which control 3's joint sabotage demonstrates by
restoring exactly that agreement. A presentational child never takes focus, so
CodeMirror relocates the parent's selection into the replaced range's first
line.

A cursor push would not fix it: CM6 relocates the selection straight back, and
the plan itself forbids a general CM6 → Neovim push because no loop guard
exists for that direction. So no push was added. What is asserted instead is
what is actually true and what actually matters:

- Neovim's cursor is authoritative — four `j` from line 1 reports row 5;
- `x` edits that row in **Neovim's own buffer**, not "Line above";
- the cursor is stable across three frames, so nothing is re-dispatching;
- the parent's head is _behind_ Neovim's row, pinned so the limitation cannot
  change silently.

The consequence for users is that the active cell is not highlighted under
RPC. That is stated in the `owned` option's description in both settings
implementations, which is what a user reads before opting in.

## A pre-existing divergence, established by a control rather than assumed

Under RPC the CM6 document and Neovim's buffer disagree on a table's column
widths: Obsidian's own table editor reformats CM6 (`| AA  | BB  |`,
`| --- | --- |`) while Neovim holds the source (`| AA   | BB   |`,
`|------|------|`).

That looked like a regression introduced by rendering the table. It is not.
The same divergence is measured in `native` mode with the identical sequence,
which the `CONTROL:` scenario asserts — along with the fact that the two
differ _only_ in padding, by comparing both with whitespace and dashes
stripped. Without that control the finding would have been attributed to this
plan and chased in the wrong place.
