# Negative controls — `renderable-ranges.test.ts`

Plan B Step 1. Per `.agents/skills/negative-control/SKILL.md`: each assertion
was shown to fail before being trusted.

Baseline with the implementation intact: **13 passed**.

## Control 1 — fence exclusion

**Sabotage** in `matchFenceMarker`, making every fence marker invisible:

```ts
const match = /^\s*(`{3,}|~{3,})/.exec(text);
if (match) return null; // SABOTAGE: fence detection disabled
```

| result                                                                      |          |
| --------------------------------------------------------------------------- | -------- |
| `rejects a table inside a fenced code block, which findTableRanges accepts` | **FAIL** |
| `rejects a table inside a tilde fence and honours fence length`             | **FAIL** |
| `does not mistake an unclosed fence for closed`                             | **FAIL** |
| other 10                                                                    | pass     |

`3 failed | 10 passed`. Exactly the three fence assertions flip, so they
measure fence handling specifically rather than passing on ambient behaviour,
and the sabotage is targeted rather than breaking the suite.

## Control 2 — separator-row requirement

**Sabotage** in `isRenderableTable`, accepting any block of two or more
pipe-leading lines:

```ts
return true; // SABOTAGE: separator-row requirement removed
```

| result                                                                            |          |
| --------------------------------------------------------------------------------- | -------- |
| `rejects pipe-leading lines with no separator row, which findTableRanges accepts` | **FAIL** |
| `rejects a separator that is not the second line`                                 | **FAIL** |
| other 11                                                                          | pass     |

`2 failed | 11 passed`.

## Why several cases assert a difference rather than a value

Three cases assert that `findRenderableTableRanges` returns nothing **and**
that `findTableRanges` returns one range for the same document. That is
stronger than asserting the new function alone:

- it pins the exact hole being closed — `findTableRanges` matching any two
  contiguous `|`-leading lines with no separator, fence or frontmatter
  awareness, which becomes a correctness bug once a highest-precedence block
  replace is keyed on it;
- it would fail if someone "simplified" the new function into a call to the
  old one, which an assertion on the new function's output alone would not
  catch;
- it simultaneously documents that `findTableRanges` is deliberately **not**
  being tightened, because `src/motions/tables.ts` and the table text objects
  depend on its current laxity.

## Restored

`13 passed` with both sabotages reverted.
