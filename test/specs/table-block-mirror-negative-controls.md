# Negative controls — visual-block selection mirror (Plan E1.5)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-block-mirror.e2e.ts` (**4 passing**) and the
`mirrorRanges` block in `test/unit/table/selection-mirror.test.ts`
(**21 passing** in that file).

## Control 1 — only `.main` mirrored

**Sabotage** in `selection-mirror.ts`, forcing the single-range path:

```ts
if (true || selection.ranges.length <= 1) {
```

| suite                       | result                    |
| --------------------------- | ------------------------- |
| `table-block-mirror.e2e.ts` | **2 passing, 2 failing**  |
| `table-key-router.e2e.ts`   | **13 passing, 0 failing** |

The two failures are the block scenarios (`3 → 1` ranges, `mainIndex 1 → 0`).
The router suite is the pairing Plan E1.5 requires: its `Vjd` and
`V`/`Vj`/Escape scenarios keep passing, so the block assertions and the
linewise ones are proven to test different things rather than one standing in
for the other.

## Control 2 — `allowMultipleSelections` removed

**Sabotage**: drop `EditorState.allowMultipleSelections.of(true)` from the
nested editor's extensions.

`2 passing | 2 failing` — the same two scenarios, `Expected: 3 / Received: 1`.

This is the half that is easy to miss. The mirror dispatches three ranges
either way; without the facet CodeMirror silently keeps only the first, so the
mapping code can be entirely correct and the user still sees a one-row
selection. Mapping and permission are separately load-bearing.

## Two scenarios that are deliberately _not_ mirror tests

`pairs with linewise, which must stay a single range` and `a block delete
removes the block, not whole rows` both survive control 1, and that is correct
rather than a weakness:

- the linewise one asserts the single-range path is unchanged;
- the delete one measures the **parent's** operation. The parent's vim holds
  all three ranges regardless of what the child renders, so the delete is
  right even while the display is wrong. It guards block correctness, not the
  mirror — which is exactly why the mirror needs its own assertions, and why
  "the document came out right" was never sufficient evidence here.

## A harness error worth recording

The first run reported `parentCount: 1` and read as "visual block produces one
range", contradicting the measurement Plan E1.5 is built on. The cause was the
test: `browser.keys(['\u0016'])` sends the raw control character, which does
not arrive as a keydown with `ctrlKey: true`, so `<C-v>` never reached the
router and block mode was never entered. `browser.keys(['Control', 'v',
'NULL'])` — the form the rest of the suite uses — gives three ranges as
documented.

A second expectation was wrong by arithmetic rather than by mechanism: the
block-delete row was hand-written as `|      | 11   |` when removing two
characters from `| aa   |` leaves four spaces, not six. It now derives the
expectation (`TABLE_DOC.replace('aa', '')…`) instead of counting by hand. Both
failures looked like product defects and neither was.
