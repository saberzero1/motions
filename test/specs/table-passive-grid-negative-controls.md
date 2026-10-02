# Negative controls — passive table grid (Plan E1.6)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-passive-grid.e2e.ts` (**5 passing**), run alongside
`table-typography.e2e.ts` (**3 passing**) because the two guard the same
invariant from opposite ends.

## Control 1 — a glyph substituted in the passive rendering

**Sabotage**: emit `│` (U+2502) in place of the source's `|`.

| suite                       | result                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `table-passive-grid.e2e.ts` | **3 passing, 2 failing** — both character-identity scenarios |
| `table-typography.e2e.ts`   | **3 passing**                                                |

**The parity suite did not notice**, and that is the finding. A box-drawing
glyph has the same advance as `|` in a monospace face, so "passive and active
geometry agree within 1px" is satisfied by a rendering that shows different
characters. Geometry parity is necessary and not sufficient; the
character-identity assertion is the cheaper and stricter signal, and this is
the measurement that justifies keeping both rather than folding one into the
other.

## Control 2 — spans not emitted, rows left as plain text

`3 passing | 2 failing` — `marks cells and delimiters…` (`Expected: 9 /
Received: 0`) and `carries each column alignment…`.

Character identity survives, correctly: plain text has always been identical
to the source. That is precisely why it cannot stand in for the structural
assertions — the renderer before this step passed the identity check while
producing no cells at all.

## Control 3 — the alignment class dropped

`4 passing | 1 failing` — only `carries each column alignment from the
separator row`.

## Why this is not a `<table>`

The obvious improvement here is to render real table cells, which would let
CSS align text properly. It is ruled out, and the reason is measured rather
than stylistic: the **active** renderer is CodeMirror text showing the padded
source, so any renderer that moved a glyph would shift the grid at the instant
the cursor entered the table. That jump is the class of complaint
[#167](https://github.com/saberzero1/motions/issues/167) is about, and
`table-typography.e2e.ts` exists to prevent it.

So alignment is parsed from the separator row and carried as a class on both
surfaces, where a theme can use it, and no glyph is re-positioned on either.
The earlier plan note that alignment would be _rendered_ in this step was
wrong, and so was the spacer-widget attempt in E1.4 that preceded it — both
assumed a renderer free to lay out cells independently of the source, which A2
is deliberately not.

## A defect this spec caught

The passive renderer first emitted **12** cell spans where the nested editor
emits 9. `buildTableLayout` does produce cells for the separator row — only
the column-width accumulation skips it — and the active decorations drop them
with an explicit `kind === 'separator'` check that the passive painter was
missing. The two surfaces are meant to be interchangeable for styling, so a
divergent class count is a real defect rather than a cosmetic one; the
`isSeparator` branch now carries a comment saying the cells exist and are
skipped on purpose.
