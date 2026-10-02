# Negative controls — table boundary hand-off

Plan B Step 7. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers `test/specs/table-boundary.e2e.ts`. Baseline with the implementation
intact: **6 passing**.

The two controls fail **disjoint** scenarios, which is what shows the hand-off
and its guard are separately load-bearing rather than one mechanism with a
redundant condition.

## Control 1 — no hand-off (plain unmount, as before this step)

**Sabotage** in `src/vim/table/nested-view.ts`:

```ts
if (false && hadFocus) this.parent.contentDOM.focus(); // SABOTAGE
```

`2 passing | 4 failing`.

This is the pre-step behaviour, and it is the state the acceptance tests were
written against: `parentFocused` reads `false`, `document.activeElement` is
`<body>`, and the cursor stops moving after the first motion out of the table.
The editor looks dead rather than broken.

Two scenarios survive, both correctly:

- **`3j` from the second-to-last row** passes. The entire counted motion is
  dispatched while the child still holds focus, so no hand-off happens during
  it. This scenario cannot detect the defect, which is worth knowing before
  trusting it as coverage of the boundary.
- **`does not pull focus…`** passes, because not handing focus back is exactly
  what it asserts for that case.

## Control 2 — focus handed back unconditionally

**Sabotage**, dropping the guard:

```ts
this.parent.contentDOM.focus(); // SABOTAGE: guard removed
```

`5 passing | 1 failing` — only `does not pull focus into the editor when the
child did not have it` (`Expected: false / Received: true`).

The guard matters because `handOff` runs whenever the cursor leaves the table,
including when the user's attention has moved elsewhere. Without it, moving the
cursor out of a table programmatically — a picker jump, a link follow, another
plugin — drags focus back into the editor from wherever the user actually is.

That scenario blurs the child and then moves the parent's selection out, which
is the reachable shape of this: the earlier version of this step had the guard
on trust, with nothing exercising it.

## Why every scenario presses a second key

Asserting only where the first motion landed cannot distinguish a working
hand-off from a broken one, because the first motion is dispatched while the
child still has focus and lands correctly either way. The scenarios press
another key afterwards and assert its effect — `j` `j` reaching line 8, `k` `k`
reaching line 1 — so a lost focus shows up as a cursor that stopped.

## What needed no code

Two of the step's three stated concerns turned out to be already satisfied,
measured rather than assumed:

- **Desired column.** `j` `j` from column 2 of the last table row crosses a blank
  line and lands at column 2 of the line below, and `k` `k` likewise. The parent
  owns the motion, so the fork's `lastHPos` applies with nothing to mirror.
- **Residual count.** `3j` from the second-to-last row lands three lines down,
  outside the table, in one dispatch. There is no remainder to carry because the
  count never crosses the boundary — the parent's vim consumes the whole motion.

The plan allotted `boundary.ts` to these. The step reduced to one conditional
focus call, so no module was created.
