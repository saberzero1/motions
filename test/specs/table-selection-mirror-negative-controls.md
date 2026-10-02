# Negative controls — table selection mirror

Plan B Step 6. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers the two rendering scenarios in `test/specs/table-key-router.e2e.ts` and
`test/unit/table/selection-mirror.test.ts`. Baselines: router **11 passing**,
mirror unit **11 passed**.

## Control 1 — the visual branch removed

**Sabotage** in `src/vim/table/selection-mirror.ts`, collapsing everything to a
caret:

```ts
if (true || !vim?.visualMode) {                                     // SABOTAGE
```

`9 passing | 2 failing` — both rendering scenarios, at
`selectionRects` (`Expected: > 0 / Received: 0`).

## Control 2 — linewise falls back to the parent's CM6 selection

**Sabotage**, skipping the `vim.sel` branch so linewise uses the parent range
like charwise does:

```ts
if (false && vim.visualLine) {                                      // SABOTAGE
```

`10 passing | 1 failing` — **only** the `V`/`Vj` scenario fails; the charwise
scenario still passes.

That asymmetry is the point. The parent's own CM6 selection is the real range
for charwise (`anchor: 48, head: 49` after `v`, `head: 51` after `vll`) and is
**collapsed at the line start** for linewise (`anchor: 46, head: 46` after `V`,
with the range living in `vim.sel`'s line numbers). One source cannot serve
both, and this control is what demonstrates it rather than asserting it.

## Control 3 — `drawSelection()` removed from the nested editor

**Sabotage** in `nested-view.ts`:

```ts
// drawSelection(),                                                 // SABOTAGE
```

`9 passing | 2 failing`, both rendering scenarios at `selectionRects`.

Worth recording because the first implementation of this step omitted
`drawSelection` and looked like a broken mirror: the selection was being set
correctly all along, but a CodeMirror view without that extension leaves
highlighting to the browser's native selection and renders no
`.cm-selectionBackground` at all. The nested editor is constructed directly, so
it gets nothing Obsidian's own editors include unless it is asked for.

## Why the assertions are on text, not only on rectangle counts

`selectionRects > 0` cannot tell a correct mirror from one highlighting the
wrong rows. Each scenario therefore also asserts the selected text, read from
the child's own state rather than `window.getSelection()`:

- after `V`: contains `| aa   | 11    |`, does **not** contain `| bb`;
- after `Vj`: contains both data rows, does **not** contain `| Name`;
- after `vll`: exactly `'aa '`, three characters;
- after `<Esc>`: empty, and zero rectangles.

These are paired with the pre-existing `Vjd` scenario, which deletes two rows —
so a mirror that renders the wrong range while the operator acts on the right
one, or the reverse, is caught by one of the two.

## Measurement behind the two sources

Taken against a real Obsidian before the mirror was written, with the cursor
parked at offset 48 in the `aa` row:

| state       | parent CM6 selection | `vim.visualLine` | `vim.sel` lines |
| ----------- | -------------------- | ---------------- | --------------- |
| normal      | 48 → 48              | false            | 0, 0            |
| after `v`   | 48 → **49**          | false            | 4, 4            |
| after `vll` | 48 → **51**          | false            | 4, 4            |
| after `V`   | 46 → **46**          | **true**         | 4, 4            |

This corrects the spike's record, which reported the parent's CM6 selection as
empty during visual mode and concluded the vim range was unavailable there. It
is available for charwise; only linewise collapses it.
