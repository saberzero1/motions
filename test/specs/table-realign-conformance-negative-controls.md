# Negative controls — table formatter conformance (Plan E1.1)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-realign-conformance.e2e.ts` (**9 passing**) and
`test/unit/table/realign-width.test.ts` (**11 passing**).

## The step's premise was false, and the two halves of it contradicted

Plan E1.1 asked for a `displayWidth()` helper, on the stated premise that
padding by `String.length` "is wrong for CJK, emoji, combining marks,
variation selectors, flags and ZWJ sequences". The same step also required our
output to match `TableEditor.rebuildTable()` **byte-for-byte**.

Measured, those cannot both hold. Obsidian pads by UTF-16 length too:

| specimen     | `.length` | display width | Obsidian's column width |
| ------------ | --------- | ------------- | ----------------------- |
| `日本語`     | 3         | 6             | **3**                   |
| `👨‍👩‍👧` ZWJ     | 8         | 2             | **8**                   |
| `🇯🇵` flag    | 4         | 2             | **4**                   |
| `日a😀`      | 4         | 5             | **4**                   |
| `e` + U+0301 | 2         | 1             | **2**                   |
| `a\|b`       | 4         | 4             | **4**                   |

`realignTableLines` already conformed. Implementing `displayWidth` would have
**broken** the match the step also mandates, so the helper was not added and
the step became a regression guard. A2 already places visual alignment in the
decoration layer — "source padding is NOT the live layout engine" — so nothing
depends on the source bytes carrying display width.

## Control 1 — `displayWidth` used for padding, exactly as E1.1 asked

**Sabotage** in `src/vim/table-utils.ts`: an East-Asian-wide `displayWidth()`
driving both the column-width scan and the pad.

| suite                              | result                   |
| ---------------------------------- | ------------------------ |
| `table-realign-conformance.e2e.ts` | **5 passing, 4 failing** |
| `realign-width.test.ts`            | **7 passed, 4 failed**   |

Both fail on exactly `cjk`, `zwj emoji`, `regional-indicator flag` and
`mixed scripts` — the four specimens where the two width models disagree —
and both keep `ascii`, `combining mark`, `emoji`, `escaped pipe` and
`wikilink containing a pipe`, where they agree. The isolation is the evidence:
a control that failed all nine would only show the suite runs.

## Control 0 — the first version of this spec was vacuous, and the control is what caught it

The spec originally drove `:tablerealign` against the document and compared
the result with the oracle. Under the control above it reported **9 passing**
with the sabotage fully applied — verified live, 4 occurrences of
`displayWidth` in the source and a successful rebuild.

The cause is that the spec ran in `tableWidgetMode: 'native'`, which is where
`rebuildTable()` exists — and there **Obsidian's widget reformats the table
immediately after our realign**. The document converged on Obsidian's output
no matter what our formatter produced, so the test compared Obsidian with
itself.

Plan E1.1 had in fact specified asserting `realignTableLines(lines)`
directly; routing through the document to avoid adding an accessor is what
introduced the hole. `VimMotionsPlugin.formatTableLines()` now exposes the
pure function and the spec calls it, after which the same sabotage fails 4 of
9 as it should.

Two things made this findable rather than invisible:

- the sabotage was **verified present** before its result was believed, which
  separates "the control did not fire" from "the control was not applied";
- the per-case isolation was predicted in advance — 4 specific specimens, not
  "some failures" — so 9/9 passing was recognisable as wrong rather than as
  success.

## Control 2 — the unit expectations are not self-generated

`realignTableLines` had **no unit coverage at all** before this. That is why
the e2e vacuity mattered so much: with the document comparison neutralised,
nothing anywhere tested the function, and the deliberately wrong width model
passed all **3543** unit tests.

The new unit expectations are literals harvested from Obsidian's live output
rather than from our own function, and the e2e spec re-derives them from
`rebuildTable()` on every run, so the two cannot drift together.
