# Negative controls — snippets in the owned table surface (Plan D)

Per `.agents/skills/negative-control/SKILL.md`: every assertion was shown to
fail before being trusted.

Covers `test/specs/table-snippets.e2e.ts` (**6 passing**) and the
`keepNonEmpty` cases in `test/unit/table/selection-mirror.test.ts`.

Each control below is also an **isolation** check: the count of surviving
scenarios matters as much as the count of failing ones. A sabotage that fails
everything proves only that the suite runs.

## The plan's premise was false, and the baseline says so

Plan D opened with "snippet **expansion** already works in a table … tabstop
navigation does not", carried from a spike against code that has since
changed. Measured on the shipped build, with `tableWidgetMode: 'owned'`:

|                               | document                    | parent selection | session         |
| ----------------------------- | --------------------------- | ---------------- | --------------- |
| after `i wla <Tab>` in a cell | `\| wlaaa   \| 11    \|`    | empty            | none            |
| same, outside a table         | `[[page\|alias]]plain line` | `page`           | active, field 0 |

Expansion never happened at all — the literal prefix stayed in the cell. The
router's `insertMode && !modified` branch leaves Tab native to a nested editor
that has no snippet extension, so neither the expansion keymap nor the tabstop
bindings — both of which live on the parent — ever ran. Navigation was not
reachable to begin with, so both halves are covered by this spec.

## Control 1 — the Tab branch removed from the router

**Sabotage**: delete the `event.key === 'Tab'` block in `key-router.ts`.

`2 passing | 4 failing`. The two survivors are the outside-table control and
the unmatched-Tab guard, neither of which depends on the in-table branch.

## Control 2 — the branch placed after the insert-mode return

**Sabotage**: move the same block below
`if (insertMode && !modified && event.key !== 'Escape') return;`.

`2 passing | 4 failing` — identical to control 1, because that return is
precisely what swallows Tab. The ordering is load-bearing rather than
incidental, which is the one thing a reader cannot tell from the code.

## Control 3 — the navigation branch removed, expansion left intact

**Sabotage** in `runTableSnippetTab`:

```ts
// if (hasNextSnippetField(parent.state)) return nextSnippetField(parent);
```

`4 passing | 2 failing` — only `Tab moves to the next tabstop…` and
`shows the active tabstop inside the cell`. Expansion keeps working, so
navigation and expansion are proven to be separately load-bearing rather than
one assertion standing in for both.

_Why not sabotage `hasNextSnippetField` alone_: reaching the final field
**clears the session**, so with the surrounding structure intact there is
nothing left to consult and the sabotage is unfalsifiable. Plan D flags this
and it holds here.

## Control 4 — `clearSnippet` removed from Escape

**Sabotage**: delete the `event.key === 'Escape'` block in `key-router.ts`.

`5 passing | 1 failing` — only `Escape ends the session and leaves insert mode
in one press`. CodeMirror's own Escape binding sits on the unfocused parent and
never fires, so without the explicit call the session outlives its insert mode.

## Control 5 — the mirror reverted to always-collapse

**Sabotage** in `selection-mirror.ts`:

```ts
if (false && parentSelection.anchor !== parentSelection.head) {
```

`5 passing | 1 failing` — only `shows the active tabstop inside the cell`.

This is the control for a defect that is invisible to every other assertion:
the feature was fully _working_ — document correct, parent selection correct,
session correct — while the user could not see which tabstop they were on,
because `mirrorRange` collapses to a caret whenever vim is not in visual mode
and a snippet tabstop is a non-empty selection in **insert** mode. Measured
`childSel: ""` at every field against a parent reading `page`.

## Control 6 — expansion disabled globally

**Sabotage**: `return false;` at the top of `expandSnippetAtCursor`.

`1 passing | 5 failing`, including `control: the same snippet outside a table`.

That control exists to distinguish "broken inside a table" from "broken
everywhere", and this is what proves it is not vacuous. The single survivor is
the unmatched-Tab guard, which asserts that nothing happens — and nothing
happening is exactly what a globally disabled expander produces.

## A rejected implementation, recorded because it measured well

The first fix delivered the raw key to the parent's whole keymap stack with
`runScopeHandlers(parent, event, 'editor')`. It passed every expansion and
navigation assertion above. It also corrupted the table: with **no** matching
prefix, Obsidian's indent handler claimed the Tab and wrote a literal tab
before the row —

```
|------|-------|
→	| iznlaa   | 11    |
```

`an unmatched Tab writes nothing into the table` is the regression guard for
that, asserting the full document, the absence of `\t`, and a column count of
three unescaped pipes. The lesson is narrower than "don't use
`runScopeHandlers`": a mechanism that satisfies the feature's own assertions
can still be wrong on the paths the feature does not exercise.

## Known gaps, measured and left open

Both are documented rather than fixed, and neither is a regression — before
this change no snippet body could reach a cell at all.

| Body                   | Result in a cell                                          | Why not fixed here                                                                                                              |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `a\|b`                 | `\| a\|baa   \| 11    \|` — the pipe opens a third column | Escaping literal pipes must not touch snippet syntax, and choice nodes are written `${1\|a,b,c\|}`. A naive escape breaks them. |
| `x${1:one}\ny${2:two}` | does not reach a cell as one line                         | Same transform, same hazard.                                                                                                    |

Plan D decided both should convert (`\|` and `<br>`, following Obsidian's own
table editor). That transform needs its own plan and its own controls against
choice nodes; it is listed in **What is not supported yet**.

## Control 7 — the unit cases, disabled at the source

**Sabotage**: the same `if (false && …)` as control 5, run against
`test/unit/table/selection-mirror.test.ts`.

`13 passed | 3 failed` — `preserves a non-empty range outside visual mode`,
`preserves a backwards range` and `clamps a preserved range to the table`.

The two survivors are deliberate: `still collapses an already-empty selection`
and `leaves visual mode taking precedence` assert behaviour the flag does
**not** change, so a control that broke them would mean the flag was reaching
further than intended.
