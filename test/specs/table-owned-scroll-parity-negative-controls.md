# Negative controls — owned table horizontal scroll parity

Plan B Step 9, scenarios 5A and 5B. Per
`.agents/skills/negative-control/SKILL.md`: every assertion was shown to fail
before being trusted.

Covers `test/specs/table-owned-scroll-parity.e2e.ts`. Baseline: **2 passing**.

These are **bounds, not correctness tests**. Issue #167 items 5 and 6 belong to
Plan E; what is asserted here is that `owned` is no worse than `native`.

## The measurement that reshaped both scenarios — and the one that corrected it

**First measurement, wrong.** It read `.cm-table-widget`'s `.table-wrapper`
descendant for native and fell back to the editor's `scrollDOM`, and reported
every offset as 0 in both modes. That became a published claim in
`KNOWN_LIMITATIONS.md` and `docs/features/tables.md` that neither mode scrolls
horizontally. It was **false**.

**Re-measured** by surveying every candidate container with its computed
`overflow-x`, `scrollLeft`, `scrollWidth` and `clientWidth`:

| selector                                 | native                                              | owned                              |
| ---------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `.cm-table-widget`                       | `overflow-x: auto`, **scrollable**, reached **623** | absent                             |
| `.cm-table-widget .table-wrapper`        | `overflow: visible`, never scrolls                  | absent                             |
| `.vim-motions-table-nested .cm-scroller` | absent                                              | `overflow-x: auto`, **scrollable** |
| `.vim-motions-table-surface` / `-rows`   | absent                                              | `overflow: visible`                |
| editor `scrollDOM`                       | not scrollable                                      | not scrollable                     |

So the element carrying `overflow-x: auto` in native is the widget **itself**,
not its wrapper, and only while the table-nav overlay is active
(`styles.css:16-21`). The first measurement read two elements that never scroll.

**That exposed a real regression.** Owned's scroller is genuinely scrollable and
sat at `scrollLeft: 0` through 60 `l` presses while native reached 623 — `owned`
was strictly **worse**. Cause: the parent's vim owns the motion, so the nested
editor never receives a cursor command of its own and nothing asks it to scroll.
Fixed by `scrollIntoView: true` on the mirrored selection dispatch in
`nested-view.ts`.

5A therefore asserts **correctness** now, not parity: both modes reach a
non-zero offset, the offsets are monotonic, and owned's caret ends visible.

**5B's parity framing survived the correction.** With `scrolloff=100` every
offset is 0 in **native** as well, so #167 item 6 is pre-existing and `owned`
reproduces rather than introduces it.

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
