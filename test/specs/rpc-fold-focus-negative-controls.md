# RPC fold focus negative controls

## Unfixed product: the defect itself

Before the fix, with `foldlevel` still `enabled ? 0 : 99`, all four scenarios
failed. `closed` is `vim.fn.foldclosed()` per line over the eight-line heading
fixture, so `[1, 1, 1, 1, 1, 1, 7, 7]` is both top-level heading folds closed on
arrival — the reported `zM`:

```text
1) activates a focused pane with every heading fold open (#199)
  Array [
-   -1, -1, -1, -1, -1, -1, -1, -1,
+   1,  1,  1,  1,  1,  1,  7,  7,
  ]
```

The frontmatter scenario failed on the body lines while the frontmatter fold
itself was correct, which is the shape of the bug: the guard worked, it just took
every heading with it.

```text
2) still closes the rendered frontmatter fold (#199)
  Array [
-   -1, -1, -1, -1,
+   4,  4,  4,  4,
  ]
```

```text
3) closes only the fold the user asks for (#199)
CM6 never rendered the single closed fold

4) leaves every pane unfolded as focus moves between them (#199)
  Array [
-   -1, -1, -1, -1, -1, -1, -1, -1,
+   1,  1,  1,  1,  1,  1,  7,  7,
  ]

0 passing, 4 failing
```

## `foldlevel` raised to 99 instead

The tempting fix — open the headings by raising `foldlevel` — is caught by the
frontmatter scenario alone, and by nothing else. Vim caps an expression fold at
`MAX_LEVEL` 20, so the sentinel never reaches 99 and the frontmatter fold opens,
handing Neovim's cursor the properties widget again:

```text
2) still closes the rendered frontmatter fold (#199)
  Object {
-   "closed": 1,
-   "closedEnd": 3,
+   "closed": -1,
+   "closedEnd": -1,
    "level": 20,
  }

3 passing, 1 failing
```

## `foldmethod` set to manual: no folds exist at all

Establishes what the level ladder in scenario 1 is for. With no folds in the
buffer, "nothing is closed" is true for the wrong reason:

```text
   ✖ activates a focused pane with every heading fold open (#199)
   ✖ still closes the rendered frontmatter fold (#199)
   ✖ closes only the fold the user asks for (#199)
   ✓ leaves every pane unfolded as focus moves between them (#199)

1 passing, 3 failing
```

Scenario 4 passes vacuously here: a pane with no folds and a pane with no closed
folds are indistinguishable from `foldclosed()` alone. That is deliberate — its
subject is the focus transition, and scenario 1 in the same spec is what refuses
to let folding be absent, asserting the measured `level` ladder
`[1, 1, 1, 1, 2, 2, 1, 1]` before it asserts anything about closure.

## Unfixed product: a `FileType` handler reclaiming the window

`activateDocument()` runs `filetype detect`, which re-fires the user's own
`FileType` handlers on every activation, and setting a window-local fold
expression there is ordinary Neovim configuration. Before the per-activation
reapply, the connect-time expression survived the first note and nothing
restored it afterwards, so the frontmatter guard was lost from the second note
onward — `level: 0` is the user's expression answering where the plugin's
sentinel used to be:

```text
5) keeps the frontmatter fold when a FileType handler overwrites the fold
   expression (#199)
  Object {
-   "closed": 1,
-   "closedEnd": 3,
-   "level": 20,
+   "closed": -1,
+   "closedEnd": -1,
+   "level": 0,
  }

5 passing, 1 failing
```

## Reapply removed

Deleting only the `applyFoldExpression()` call from `syncForActivation()` failed
that scenario and nothing else, so the coverage is localised to the activation
path rather than to folding in general:

```text
   ✖ keeps the frontmatter fold when a FileType handler overwrites the fold expression (#199)

5 passing, 1 failing
```

## Reapply over-reaching into `foldlevel`

The opposing control on the same method. Adding `foldlevel` to the per-activation
reapply — the obvious way to "finish" the fix — restores the frontmatter guard
and breaks the user's own fold level instead, undoing a `zM` on every pane
switch:

```text
   ✖ leaves a user fold level alone across a pane switch (#199)
  Array [
-   1, 1, 1, 1, 1, 1, 7, 7,
+   -1, -1, -1, -1, -1, -1, -1, -1,
  ]

5 passing, 1 failing
```

Only reapplying `foldmethod` and `foldexpr` satisfies both, which is why the two
scenarios are kept together. `leaves a user fold level alone` is green before
and after the reapply was added; its job is to stay green, and this sabotage is
what proves it is not decorative.

`sync()` keeps its early return because `prepareKeyInput()` awaits it before
every delegated keystroke. Collapsing the two methods would put two RPC
round-trips on that path, which no gate would catch — `rpc-latency.e2e.ts` is
explicitly non-blocking.

## Restored

```text
   ✓ activates a focused pane with every heading fold open (#199)
   ✓ still closes the rendered frontmatter fold (#199)
   ✓ closes only the fold the user asks for (#199)
   ✓ leaves every pane unfolded as focus moves between them (#199)
   ✓ keeps the frontmatter fold when a FileType handler overwrites the fold expression (#199)
   ✓ leaves a user fold level alone across a pane switch (#199)

6 passing (6s)
Spec Files: 1 passed, 1 total
```

## Why the existing fold spec did not catch this

`rpc-folds-undo.e2e.ts` measures the mirror, not the activation. Its
`resetBuffer()` sets `foldmethod`, `foldexpr`, `foldlevel=99` and `foldenable`
and then runs `zR` before every scenario, so the window it measures is never the
window the product produced. Nothing in this spec sets any fold option or runs
`zR`. The two specs are not redundant: one isolates the mirror, the other refuses
to touch the state under measurement.

Every other RPC spec sets `propertiesInDocument` to `source`, which is the branch
that already worked. This spec sets `visible`, Obsidian's default, before
connecting — `NeovimFrontmatterFold` caches the resolved mode and reapplies
nothing once it matches, so the mode has to be in place for the activation that
installs the window's fold options.
