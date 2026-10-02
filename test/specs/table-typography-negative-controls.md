# Negative controls — owned-surface typography (Plan E1.2)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-typography.e2e.ts` (**3 passing**).

## Control 1 — monospace removed

**Sabotage** in `styles.css`: `font-family: var(--font-text)` in place of
`var(--font-monospace)` on the shared block.

`1 passing | 2 failing` — both grid scenarios, `Expected: true / Received:
false` on the advance-width check.

The survivor is the passive/active parity scenario, and that is correct: both
renderers become proportional _together_, so they still agree with each other.
Parity and monospace are separate properties, which is why the suite asserts
both rather than treating one as evidence of the other.

The check measures **advance width** — twenty `i`s against twenty `M`s —
rather than the font name. A theme that names a proportional family in
`--font-monospace` would satisfy a name assertion and still break the grid.

## Control 2 — the padding reset removed

**Sabotage**: delete the `padding: 0; margin: 0;` block added for the owned
surface.

**`3 passing`. The control did not fire, so the rule was deleted.**

It was added on a misdiagnosis. The parity scenario reported a 12px delta, and
CodeMirror's default `.cm-content`/`.cm-line` padding is a plausible cause, so
a reset went in. It did not help — the delta stayed at exactly 12px — and
probing the element chain showed why: the passive row and the nested
`.cm-line` already shared an identical `left` of 1127.5, and the 12px was
entirely in **width**, 657.5 against 645.5.

That difference is not typography. A passive row is a block `div` that fills
its container; a `.cm-line` is sized by CodeMirror's content box. The two
boxes are not comparable at all, so the assertion was measuring the wrong
thing. It now measures the rendered **text**, via a `Range` over each row's
contents, after which the two agree to within 1px and the padding rule is
provably unnecessary.

Shipping a CSS rule that no test can detect is the `skipInTableCells()` shape
this project has already paid for once — 14 call sites that read as a gate and
gated nothing. The rule is gone rather than kept "just in case".

## The pattern this makes three for

Each of these started as a confident reading of a proxy rather than of the
thing itself, and each produced a wrong diagnosis that a re-measurement
overturned:

| Measured                | Proxy that misled                   | What it actually was                                          |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------- |
| horizontal scroll       | `.table-wrapper` / `scrollDOM`      | neither scrolls; `native` reaches `scrollLeft: 623`           |
| repeated tabstop        | reading taken before the mirror fix | insertion beside the field, not `minimalDiff` over-forwarding |
| passive/active geometry | element box width                   | rendered text width; `left` already matched                   |

The habit that catches it: when a measurement reports the **absence** of a
behaviour, or a delta that a plausible fix does not move, question the
instrument before accepting the result.

## A harness error, recorded

The monospace check first reported `false` for both renderers against correct
CSS. `span.style.font = getComputedStyle(el).font` is the culprit: Chrome
serialises the `font` shorthand as an **empty string** unless every longhand
round-trips, so the probe span inherited the body's proportional font and no
grid could ever pass. Setting `fontFamily`, `fontSize`, `fontWeight`,
`fontStyle` and `letterSpacing` individually fixed it.
