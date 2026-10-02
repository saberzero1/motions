# Negative controls — owned table horizontal scroll parity

Plan B Step 9, scenarios 5A and 5B. Per
`.agents/skills/negative-control/SKILL.md`: every assertion was shown to fail
before being trusted.

Covers `test/specs/table-owned-scroll-parity.e2e.ts`. Baseline: **2 passing**.

These are **bounds, not correctness tests**. Issue #167 items 5 and 6 belong to
Plan E; what is asserted here is that `owned` is no worse than `native`.

## The measurement that reshaped both scenarios

Final readings after 60 `l` presses from row 3 column 1, on the wide fixture:

| mode     | caret left/right | scroller left/right | `inViewport` | scroll offsets |
| -------- | ---------------- | ------------------- | ------------ | -------------- |
| `native` | 1801 / 1801      | 504 / 1797          | **false**    | 0,0,0,0,0,0    |
| `owned`  | 1648 / 1649      | 1127 / 1785         | **true**     | 0,0,0,0,0,0    |

Two things follow, and both changed the spec:

1. **Neither mode scrolls horizontally at all.** Every offset is 0 in both. That
   _is_ #167 item 5 — horizontal scrolloff absent — reproduced in `native` as
   well as `owned`, which is the evidence that it is not a regression this plan
   introduced and genuinely belongs to Plan E.
2. **`native`'s caret ends outside its scroller** (1801 > 1797) while `owned`'s
   does not. That is incidental geometry and is deliberately **not** pinned; it
   would move with window size.

## Control 1 — the parity assertion was vacuous, and now is not

5A was first written as the plan phrases it:

```ts
if (native.final.inViewport) {
    expect(owned.final.inViewport).toBe(true);
}
```

`native.final.inViewport` is `false`, as measured above, so **the assertion never
ran**. The scenario passed while testing nothing about parity.

Rewritten as the bound the plan actually asks for — "`owned` must not be the only
mode that fails" — which executes on every run:

```ts
const ownedNoWorse = owned.final.inViewport || !native.final.inViewport;
expect(ownedNoWorse).toBe(true);
```

**Sabotage** inverting it:

```ts
expect(ownedNoWorse).toBe(false); // SABOTAGE
```

`1 passing | 1 failing` — 5A, `Expected: false / Received: true`. The expression
is live and discriminates on the current readings.

## Control 2 — the document-safety assertion

**Sabotage** in `src/vim/table/key-router.ts`, a realistic defect: the router
routes the key but forgets to stop it reaching the nested editor natively, so
every `l` is both a motion and a typed character.

```ts
routed++; // SABOTAGE: preventDefault removed
```

**2 failing** — both scenarios, at `owned.docUnchanged`.

An earlier attempt at this control sabotaged `syncUpExtension` to write on every
update and **did not fire**, because during 60 motions the nested editor's
document never changes, so that path never runs. The control had to exercise a
path the scenario actually reaches; the one above does.

## Why `native` is held to a weaker assertion than `owned`

`native.docUnchanged` was asserted first and failed: Obsidian's table editor
**realigns the whole table** when the cursor leaves a cell, padding every cell to
a uniform width and rewriting `|----|` as `| ------------ |`. Measured on lines
32 and 33 of the fixture during the `scrolloff=100` run.

That is Obsidian's documented format-on-exit behaviour, not data loss, and not
something this plan may assert away. So:

- `owned` — **byte-identical**. It is our code and it must not touch the
  document while only moving.
- `native` — **content-identical** after collapsing all horizontal whitespace and
  separator runs. The question for it is only whether anything was lost.

Asserting byte-equality for `native` would have failed for a reason that has
nothing to do with this plan, which is the failure mode 5B's parity framing
exists to avoid.
