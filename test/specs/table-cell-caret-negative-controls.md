# Negative controls — the caret inside an owned table cell

Spec: `test/specs/table-cell-caret.e2e.ts`

The fix has three pieces in three different places. Each was sabotaged alone,
with the other two intact, so that the spec attributes a failure to the right
one instead of passing on the strength of its neighbours. Restored state green
after every control.

Every control ran against a rebuilt bundle (`npm run build:ci-test`). A bare
`wdio run` does not rebuild `main.js`, which would have made all three controls
report the restored result and prove nothing.

## Baseline (all three pieces present)

```
✓ draws the vim block cursor in the cell, and only that
✓ switches to the browser caret in insert mode and back
✓ keeps the selection background in visual mode
3 passing
```

Measured shape, caret parked mid-cell:

| mode              | fork cursor | `drawSelection()` caret | browser caret       |
| ----------------- | ----------- | ----------------------- | ------------------- |
| normal            | `10x19`     | hidden                  | `rgba(0, 0, 0, 0)`  |
| insert            | none        | hidden                  | `rgb(138, 92, 245)` |
| normal (returned) | `10x19`     | hidden                  | `rgba(0, 0, 0, 0)`  |

Insert mode drawing no fork cursor is correct. `measureCursor` sets
`showCursor = !insertMode || overwrite || shape !== "bar"`, so for a bar shape
the fork suppresses its own element and tints the real browser caret instead.
A probe reading only `.cm-fat-cursor` scores that as "no caret" — which is the
error that sent an earlier run of this work chasing a non-existent defect.

## Control 1 — `vimCursorFromSource` removed from the child's extensions

Sabotage: delete the `vimCursorFromSource(...)` extension and its import from
`src/vim/table/nested-view.ts`.

```
✖ draws the vim block cursor in the cell, and only that
    Expected: not "none"      // vimCursor
✖ switches to the browser caret in insert mode and back
✓ keeps the selection background in visual mode
2 failing
```

The fork's cursor is absent entirely, so there is no per-mode shape to follow —
this is the state the surface shipped in after the 6.4.4 layer-ownership fix:
a caret was visible, but it was `drawSelection()`'s 1px bar in every mode.

The control also flipped `drawSelVisible` to `true`, which was not predicted
and is worth recording, because it means two mechanisms hide that layer.
`BlockCursorPlugin.update()` sets `display: none` on every
`.cm-cursorLayer:not(.cm-vimCursorLayer)` the view **owns**, and after the
6.4.4 ownership fix the child's own plugin owns the child's layer — so
installing a cursor in the child also hides `drawSelection()`'s there, and
removing the cursor removes that hide along with it.

The CSS is still required, and control 3 is what proves it: with the fork
cursor present and only the CSS removed, the layer is visible again. The fork's
hide runs when its plugin updates and CM6's own layer management reasserts
`display` afterwards; the CSS is declarative and does not race. Keep both.

## Control 2 — the mode-change redraw removed

Sabotage: delete the `parentModeSignature()` comparison and its
`refreshVimCursors()` call from `NestedTableHost.update()`.

```
✓ draws the vim block cursor in the cell, and only that
✖ switches to the browser caret in insert mode and back
    Expected: "none"
    Received: "10x19"         // vimCursor, in insert mode
2 passing, 1 failing
```

Exactly the staleness the redraw exists for: the block measured in normal mode
is still `10x19` after `i`, because a vim mode change produces **no transaction
in the child** — the keys go to the parent — so the child's cursor plugin never
updates. Instrumented separately, it received **zero** updates across an `i`
and an `<Esc>`.

Note which scenario survives. Normal mode still passes, because the first
shape measured happens to be the correct one; only entering insert reveals it
is frozen. A spec that checked normal mode alone would report this fixed.

**The first implementation of this redraw passed all three scenarios and broke
two other specs.** It forced the host's reconcile and a mirrored selection
dispatch, which redraws the cursor correctly but also carries `scrollIntoView`
and churns mounts: `table-owned-scroll-parity`'s `scrolloff=100` scenario and
`table-boundary`'s remount-on-re-entry both failed. Stashing only
`nested-view.ts` and `styles.css` and re-running showed both passing, which is
what attributed them to this change rather than to a pre-existing defect — the
changelog records `scrolloff=100` as a known issue on this surface, so
"pre-existing" was the available wrong answer. The fork's
`refreshVimCursors()` is a `requestMeasure` pass rather than a transaction and
has neither side effect.

## Control 3 — the CSS hiding `drawSelection()`'s cursor layer removed

Sabotage: delete the `.cm-cursorLayer:not(.cm-vimCursorLayer)` block from
`styles.css`.

```
✖ draws the vim block cursor in the cell, and only that
    Expected: false
    Received: true            // drawSelVisible
2 passing, 1 failing
```

The double caret: the fork's `10x19` block and `drawSelection()`'s `1x19` bar
rendered together. Both carets are "a caret", so a spec asserting only that a
caret exists passes here — which is why the scenario asserts the absence of the
second one rather than the presence of the first.

The selection scenario passing in this control is the paired check on the same
rule: the CSS targets only the cursor layer, and hiding the selection layer
instead would render a mirrored visual range invisible while leaving every
cursor assertion green.

## Not controlled

The fork-side `ownsLayer` guard shipped in `@saberzero1/codemirror-vim@6.4.4`
and has its own control recorded in that repo's `DIFFERENCES.md` (layer
`display: none` with one child and a `0x0` caret before, `display: block` with
a positioned caret after). Reverting it here would require rebuilding the
dependency, and control 1 already covers the host-side half.
