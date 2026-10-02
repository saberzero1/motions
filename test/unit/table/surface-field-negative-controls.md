# Negative controls — `surface-field.test.ts`

Plan B Step 2. Per `.agents/skills/negative-control/SKILL.md`: each assertion
was shown to fail before being trusted.

Baseline with the implementation intact: **12 passed**.

All controls were re-run after the module was restructured to take an
injected `shouldRender` predicate, because a restructure can silently make a
test vacuous. Each still fails exactly its own assertion.

## Control 1 — `Prec.highest`

**Sabotage** in `surface-field.ts`, dropping the precedence wrapper:

```ts
provide: (field) => EditorView.decorations.from(field), // SABOTAGE
```

`1 failed | 10 passed` — only `provides its decorations at the highest
precedence`. The test seeds a `Prec.high` competitor precisely so that losing
`Prec.highest` is detectable; without the competitor our value would still sit
at index 0 and the assertion would pass vacuously.

This matters because precedence is the whole mechanism: at `Prec.highest` our
block replace removes Obsidian's table widget from the DOM entirely, and at a
lower precedence Obsidian's renders instead and ours is dropped.

## Control 2 — stale content from a reused widget

**Sabotage** in `surface-field.ts`, reusing one cached widget instance to
simulate a "stable identity" scheme:

```ts
let cached: TableSurfaceWidget | null = null;        // SABOTAGE
cached ??= new TableSurfaceWidget(table.lines);      // SABOTAGE
widget: cached,
```

`1 failed | 10 passed` — only `reflects the NEW text after an edit inside the
table`.

This is a regression test for a design error made and corrected during this
step. The plan originally prescribed identity as "a stable per-table token
held in a `WeakMap`, independent of offsets", on the reasoning that comparing
source text in `eq` recreates the widget per keystroke and destroys its DOM.
The reasoning about `eq` is right; the remedy was wrong. A widget caches its
`lines` at construction, so reusing the instance keeps the DOM **and renders
text the document no longer contains**.

CM6's actual mechanism for surviving a content change is `updateDOM(dom,
view)`, documented as updating "a DOM element created by a widget of the same
type (but different, non-`eq` content)", whose **default implementation
returns `false`** — which is why an unimplemented `updateDOM` causes the
redraw in the first place. The correct pairing is therefore `eq` on content
**plus** `updateDOM` patching in place.

## Control 3 — the Live Preview gate

**Sabotage** in `createTableSurface`, ignoring the injected predicate:

```ts
void shouldRender; // SABOTAGE: gate ignored
```

`1 failed | 10 passed` — only `renders nothing when shouldRender is false`.

The two gating tests are a deliberate pair: one asserts nothing renders when
the predicate is false, the other that a table _does_ render when it is true.
Either alone is satisfiable by a field that never renders, or by one that
ignores the gate.

The predicate is injected rather than read from Obsidian inside the field, so
the field stays free of an `obsidian` import and is constructible in a unit
test. Production supplies the Live Preview check — the decoration must not
engage in Source mode or Reading view, because replacing table source in a
mode meant to show source is issue #167 item 2.

## Control 4 — rebuilding when the gate flips

**Sabotage** in the field's `update`, rebuilding only on a document change:

```ts
void gateChanged;
if (tr.docChanged) return build(tr.state); // SABOTAGE
```

`1 failed | 11 passed` — only `rebuilds when the gate flips without a document
change`.

This control exists because the bug it guards was **missed by the unit suite
and caught in a browser**. Every earlier gating test used a _constant_
predicate, so a gate that flips was never exercised: the field rebuilt only on
`docChanged`, and switching Live Preview to Source mode changes the gate
without touching the document, so the cached decoration set survived and the
table stayed replaced in Source mode. That is issue #167 item 2 reproduced by
the gate written to prevent it.

The regression test's gate must be **state-derived** to model production,
where it reads `editorLivePreviewField`. The first version of the test closed
over a mutable variable and failed even against the correct implementation,
because `shouldRender(tr.startState)` and `shouldRender(tr.state)` both read
the same current value and nothing could ever look changed. A predicate backed
by a real `StateField` and flipped with a `StateEffect` exercises it properly.

## Not testable at this level — deferred with its observable named

Removing `updateDOM` (reverting to the inherited `false`) cannot be caught
here: these tests never call `toDOM` or `updateDOM`, because `toDOM` uses
Obsidian's `createDiv` global. The observable for it is
`getTableSurfaceRedrawCount()`, which must stay at one per table across an
editing session; a climbing count means CM6 is redrawing. That assertion
belongs to the end-to-end check once the field is wired into a real editor,
and the counter exists for it. The unit suite asserts only that the counter
stays at **zero** here, which is what proves these tests exercise state rather
than rendering.

## Restored

`12 passed` with all four sabotages reverted.
