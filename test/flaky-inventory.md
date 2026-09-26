# Intermittently failing tests

Every test that fails intermittently is a defect. The only question is where:

- **Test-side** — the test does not control a precondition, so it sometimes
  exercises the buggy path and sometimes does not.
- **Product-side** — the product is nondeterministic, so the same inputs
  sometimes produce the bug.

There is no third category. An environmental condition outside our control
(GPU compositing, runner speed) is still test-side: the test must assert or
skip on that condition explicitly rather than silently vary.

## Rules

1. **No entry may terminate at "flaky."** That word has repeatedly been used
   in this repository as a synonym for "unexplained," which is how `g-` — a
   real bug that broke the feature for every user after any file switch —
   survived for months looking like noise.
2. **Classification requires evidence.** Either a root cause, or a forced
   failure. Record observed values, not "it failed" (see
   `.agents/skills/negative-control/SKILL.md`).
3. **Forcing failure comes before fixing.** You cannot reliably force a
   failure you do not understand, so a forced failure _is_ the proof that the
   mechanism is known. N green runs never prove determinism; the 110/110 green
   run on `0815d5c` was luck, and the same commit failed twice on re-run.
4. **A fix is proven by the forcing probe going green**, not by CI passing
   once.

## Inventory

| Test                                                                       | Platform        | Observed                | Status                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `g- does not crash at root`                                                | all three       | 4 runs                  | **Resolved — product.** Stale `this.undoTree` captured at registration; `activateUndoTreeForFile()` swaps it per note. Fixed in `ff8442a`.                                                                                                                                                                                                       |
| `zc on callout folds it`                                                   | macOS           | 3/5, then 2/3           | **Resolved — environment.** The CI window starts without OS focus; waiting for it to arrive fixes the suite (0/8 cold failures, 0 skips). 16/16 correlation.                                                                                                                                                                                     |
| `editor:unfold-all clears all folds including custom`                      | macOS           | with the above          | **Resolved — environment.** Same cause.                                                                                                                                                                                                                                                                                                          |
| `cursor follows cursor movement`                                           | macOS           | 2 of last 3             | **Resolved — environment.** Same unfocused-window cause as the fold pair; `document.hasFocus()` matched the outcome 8/8. No link to #181.                                                                                                                                                                                                        |
| `]3 should jump to next H3`                                                | macOS and Linux | 4                       | **Resolved — product.** `isTreeAvailable()` reports a tree exists; `getAllNodesOfType` returns `[]` for one that is absent, stale or freed, and the motion returned the cursor unmoved with no fallback. Fixed in `src/motions/headings.ts`.                                                                                                     |
| `the animated cursor picks up a shape change (#181)`                       | macOS           | 1                       | Unknown. Fails on its canvas-paint precondition, not on the scroll defect #181 describes.                                                                                                                                                                                                                                                        |
| `focuses the expected pane in all four directions`                         | macOS           | 3                       | **Focus excluded, three samples.** Latest: `cmFocused` true, focused window, 28-char document, no notices. A test rather than a hook, so possibly distinct from the hook cluster.                                                                                                                                                                |
| `"after each" hook — RPC key delegation`                                   | macOS           | 1                       | **Resolved — product.** Renderer SIGSEGV from tree-sitter nodes retained across a parse; the hook is a cascade. `rpc-keys` now 0 segfaults in 6 runs on Linux, not re-verified on macOS.                                                                                                                                                         |
| `"after each" hook — RPC structural navigation`                            | Linux           | 2/5 in CI, ~1/3 locally | **Resolved — product.** The session died from the retained-node SIGSEGV in the preceding test. `rpc-structural-nav` now 0/16 after the fix, from a pooled 29%.                                                                                                                                                                                   |
| `matches counted operator-pending heading motion edits`                    | Linux           | 1                       | **Resolved — product.** A heading motion, which is exactly the retained-node path. 0/16 after the fix.                                                                                                                                                                                                                                           |
| `matches backward operator-pending heading motion edits`                   | Linux           | 2                       | **Resolved — product.** Same heading-motion path. 0/16 after the fix.                                                                                                                                                                                                                                                                            |
| `matches the fork for operators, visual selections, registers, and counts` | Windows         | 1                       | **Likely the same cause, unverified.** An RPC text-object spec, which walks the same trees; `rpc-text-objects` is clean on Linux. Never reproduced on Windows, so this is inference, not measurement.                                                                                                                                            |
| `which-key shows after space press`                                        | Windows         | 1                       | Unknown. Polls 2000 ms for behaviour gated by `operatorshadowtimeout`'s 1000 ms deferral, so the margin is thin by construction.                                                                                                                                                                                                                 |
| `a config reload closes an open picker instead of leaking it`              | Windows         | 1                       | Unknown. New in `2b6bc75`.                                                                                                                                                                                                                                                                                                                       |
| `uses the host jumplist for two cross-note older jumps`                    | Windows, Linux  | 2                       | **Focus excluded**: failed with `cmFocused` true and a correct 19-char document.                                                                                                                                                                                                                                                                 |
| `paints an embedded note the same way`                                     | macOS           | 1                       | Unknown. `Expected: 1, Received: 0` at `yank-highlight-widgets.e2e.ts:162` on run `36196919228`. **Non-causation only, not a root cause**: the same spec passed on Linux shard 28 in that same run, and the commit under test changed only the global count accumulator, which is platform-independent and gated on `countActive`. Re-run green. |
| `leaves the stock behaviour when the setting is disabled`                  | Windows         | 1                       | Unknown. `waitUntil condition timed out after 5000ms` in `rpc-editor-options.e2e.ts` on run `36214766021`. **Non-causation only**: the commit under test added type declarations no `src/` module imports, so esbuild drops them from the bundle; `file-explorer-navigation.e2e.ts` passed 7/7 in the same shard. Re-run green.                  |

## Why step 2 is not just deleting the delete

The obvious reading of "stop deleting the old tree on re-parse" is to remove the
two `oldTree.delete()` calls. That would be worse than the bug it fixes.

A `web-tree-sitter` `Tree` is a JavaScript handle onto memory inside the WASM
heap. JavaScript garbage collection reclaims the handle; it does not free the
tree, which only `.delete()` does. Dropping the calls therefore leaks the
underlying allocation for every re-parse, for the life of the session.

That is the wrong direction twice over. It leaks, and it drives heap growth —
which this file long believed was the mechanism behind the one failure that
segfaults. **That mechanism has since been measured and refuted**; see
"Measured: the WASM heap never grows, in either configuration" below. Removing
the deletes is still wrong, but for the leak alone.

So step 2 needs lifetime management rather than deletion removal. **Both
mechanisms this file previously proposed for it are unavailable, and the claims
below were wrong** -- a plan review checked them against the code:

- **Not fengari's `FinalizationRegistry`.** It is armed only in
  `lua_setmetatable` under `case LUA_TUSERDATA:`, i.e. full userdata. `pushTSTree`
  and `pushTSNode` both use `lua_pushlightuserdata` stored as a `_tree`/`_node`
  field on a plain Lua table. Light userdata has no per-value metatable and no
  `__gc` in Lua 5.3, so the registry never sees these objects.
- **Not reference counting via `applyTreeRef`.** Query captures carry no tree
  reference at all: `query-api.ts` calls `pushTSNode` without `applyTreeRef`, so
  nodes from `iter_captures`/`iter_matches` have no `_tree`. Refcounting would
  free trees those nodes point into -- reintroducing the bug in the path this
  file named as the worst case. `iter_children` also leaks its registry ref when
  user Lua `break`s out, which would become a permanent pin.

Either route is therefore a table-to-full-userdata conversion across 31 node
methods plus a fengari change, not a detail of one. Given the measured severity
is stale data rather than a crash, in an opt-in API with no user reports, the
reviewed recommendation is to **decline it** and fix three real defects instead;
see `.omo/plans/treesitter-memory-safety.md`.

Given the measured severity — stale data, not a crash — this is not urgent, and
it should not be started as a quick cleanup. This file previously sequenced
**pre-growing the heap** ahead of it as an independent answer to the crash
class; that has since been measured and dropped, so there is no longer a
cheaper thing to do first.

## Measured: the Lua TSNode use-after-free does not crash

Driving it directly rather than reasoning about it. A Lua mapping takes a node,
replaces the buffer through `nvim_buf_set_lines` so the parser cache re-parses
and deletes the old tree, and repeats forty times, keeping every node. It then
reads `:type()` on all of them and reports the count through `scrolloffLines`,
so a clean run cannot be confused with Lua that never ran.

**80 nodes read after their tree was deleted, in each of 6 runs, 0 segfaults.**

The explanation fits the rest of this file. `tree.delete()` frees _within_ WASM
linear memory; it does not unmap anything, so the address stays inside the
mapped heap and the read returns stale bytes rather than faulting.

The second half of that explanation — that the heading walk faulted because a
heap **move** put its address outside the mapping — **is refuted by direct
measurement**, recorded below. The heap never grows in either configuration, so
whatever kills the renderer there, it is not a detached backing buffer. What
survives is the first half: a read inside the mapped heap, returning whatever
now occupies the address.

So the Lua path's real risk is **silent wrong data, not a crash**: a node read
after its tree was freed can return a plausible-looking type or range taken from
reused memory. That is a genuine bug and a much less severe one, and it lowers
the priority of everything in the section below.

Two process notes. The first version of this probe asserted only that the plugin
was still loaded, which would have passed whether or not the Lua ran — the exact
vacuity this file criticises elsewhere. The second failed to read its own
channel (`scrolloff` instead of `scrolloffLines`) and reported `-1` six times,
which is the only reason it was caught.

## Measured: the WASM heap never grows, in either configuration

Step 0 of `.omo/plans/treesitter-memory-safety.md` was a kill gate on
pre-growing the heap: if the heap never grows during the reproducer, then
pre-growing it is a provable no-op that still commits mobile memory. It
returned more than that. It refuted the mechanism this file had settled on.

The instrument is a caller-owned `new WebAssembly.Memory({ initial: 512,
maximum: 32768 })` passed as `Parser.init({ wasmMemory })`, with `grow`
wrapped to count calls. `initial` is deliberately the upstream default, so the
probe observes production behaviour instead of changing it.

Two controls, because `grows: 0` is worthless without them:

- **Does the option apply at all?** `Parser.init` takes
  `Partial<EmscriptenModule>`, `EmscriptenModule` is never defined and
  `@types/emscripten` is not installed, so under `-skipLibCheck` it is `any`
  and a misspelled key compiles. The plan's control — misspell it, expect
  `grows: 0, pages: 512` — cannot on its own distinguish an ignored option
  from an applied one over a heap that never grows, because both report
  exactly that. So the probe also reports `applied`, by counting non-zero
  bytes in its own buffer: an ignored option leaves that memory untouched.
- **Can the counter see growth at all?** Run the same probe on the host,
  outside Obsidian, against a document big enough to force growth.

| control                   | applied   | nonZeroBytes | grows | pages         | parses |
| ------------------------- | --------- | ------------ | ----- | ------------- | ------ |
| `wasmMemory`, 950 KB doc  | **true**  | 999,290      | **2** | 512 → **738** | yes    |
| `wasmMemroy` (misspelled) | **false** | 0            | 0     | 512           | yes    |

So the option applies, and the counter detects growth when growth happens.

Then the measurement, in the CI container, polling from `afterTest`:

| configuration                            | spec(s)                         | readings | applied   | grows | peak |
| ---------------------------------------- | ------------------------------- | -------- | --------- | ----- | ---- |
| master (fixed, cursor-only walk)         | `rpc-structural-nav`            | 14       | true, all | **0** | 512  |
| master (fixed, cursor-only walk)         | `navigation` + `fold-providers` | 24       | true, all | **0** | 512  |
| `js-api.ts`/`headings.ts` at `88ec375~1` | `rpc-structural-nav` × 4 runs   | 46       | true, all | **0** | 512  |

**84 readings, `grows: 0` and `peakPages: 512` in every one.**

The third row is the one that matters, and it is not what the plan asked for.
Step 0 as written measures master — where the fix already deleted the
allocating path — so `grows: 0` there is equally consistent with "the fix
removed the growth", and refutes nothing. Reverting `js-api.ts` and
`headings.ts` to before `88ec375` puts the retaining walk back, and **two of
those four runs failed**, both stalling after the same test
(`matches operator-pending link motion edits`), so that arm is genuinely the
failing arm. The heap did not grow in the failing runs either.

**Verdict: do not implement Item 1.** Pre-growing a heap that never grows
cannot prevent anything. The plan called this outcome a success and it is:
it costs one container run and removes a permanent mobile memory cost from
the roadmap.

What this does **not** overturn: the fix. `getNodeSummariesOfType` measured
8/16 → 0/16 and 29% → 0/16, twice green in CI, and retaining a node across a
parse is still wrong. Only the stated reason was wrong. With growth excluded
here and frees excluded earlier (neutralising every free still crashed 8/16),
the mechanism is **open** — the remaining candidate is a read inside the
mapped heap against an address the allocator has since reused, which is the
first half of the `tree.delete()` explanation above and is not yet measured.
Do not write it up as established.

Two caveats worth keeping. `dmesg` inside the container exposed 26 lines of
container networking and no process records even under `--privileged`, so it
is **not** a segfault detector here; the reproduced failure is a WebDriver
timeout inside `setRpcEnabled`, which is consistent with a dead renderer but
is not proof of `SIGSEGV`. And the probe reads its own buffer, so it reports
growth of the heap tree-sitter uses — not renderer memory generally.

## ROOT CAUSE: a leaked `TreeCursor` and `web-tree-sitter`'s FinalizationRegistry

The fix works. It does **not** work for the reason recorded, and "retaining
nodes across a parse" is not the mechanism. Measured, not argued.

`getAllNodesOfType` did two things wrong, and the replacement changed both: it
retained `Node` objects, **and it never called `cursor.delete()`**. Every
account in this file blamed the first. A 2x2 separates them — each arm is
`rpc-structural-nav` in the container, counting fresh `dmesg` segfaults:

| arm                | retains `Node`s | leaks cursor | segfaults     |
| ------------------ | --------------- | ------------ | ------------- |
| pre-fix (original) | yes             | yes          | 8/16 (50%)    |
| **leak only**      | **no**          | yes          | **5/8 (63%)** |
| **retention only** | yes             | **no**       | **0/6**       |
| shipped fix        | no              | no           | 0/16          |

The leaked cursor is **necessary and sufficient**. Retention is neither: with
the cursor freed, the original retaining walk ran 6/6 clean at 14 passing. And
the leak-only arm reproduces the recorded fingerprint exactly —
`segfault at 12cd7fffffff`, `717fffffff`, `9a17fffffff`, every one
`base + 0x7fffffff`, every one at code offset `...b57`, the same JIT site as
the original cores.

The pathway is in `web-tree-sitter` and it is not subtle once seen:

```js
var finalizer3 = newFinalizer((address) => {
    C._ts_tree_cursor_delete_wasm(address); // address === this.tree[0]
});
constructor(internal, tree) {
    finalizer3?.register(this, this.tree[0], this); // holds the TREE pointer
}
delete() {
    finalizer3?.unregister(this); // the operative line of the fix
    ...
}
```

A cursor registers itself with a `FinalizationRegistry` **holding the tree's
pointer, not its own**. Drop the cursor without `delete()` and it stays
registered. The bridge then re-parses and calls `previous.delete()`, freeing
that tree. Later, at a GC-determined moment, V8 collects the orphaned cursor
and fires the finalizer against the dangling tree pointer — a use-after-free
inside the WASM allocator, executed from a GC callback in JIT code.

That accounts for every observation this file collected:

- **Nondeterministic at ~50%** — it needs a GC at the wrong moment.
- **Requires RPC, and specifically fork/RPC alternation** — the fork walk leaks
  the cursor, while RPC drives both the re-parses that free trees and the
  allocation churn that triggers GC. Neither side alone does it.
- **`getTreeForView` forced null was 0/16** — no walk, so no cursor is ever
  constructed or registered.
- **The heap never grows** — irrelevant to a use-after-free at a live address.
- **The fault is V8-level in JIT code, not a WASM bounds trap** — it is a GC
  finalizer callback corrupting allocator state, which then surfaces elsewhere.

### The arm that misled the entire investigation

> `]h`, with all 12 tree-sitter handle frees neutralised | 8/16

This was read as "with nothing freed at all a use-after-free is impossible",
and it is what retired the whole use-after-free class. **It is invalid.**
Neutralising our twelve `.delete()` call sites does not disable
`FinalizationRegistry`; GC keeps freeing every dropped handle through
`finalizer2`/`finalizer3` regardless. That arm never achieved "nothing is ever
freed", which is exactly why the rate did not move. The correct reading is the
opposite of the one taken: it is evidence _for_ the finalizer path, because
removing our frees leaves the GC frees untouched.

### Unfixed surface

The severity of a dropped handle is now **a latent GC-timed use-after-free,
not a leak**. Both `.walk()` sites currently free in a `finally`
(`js-api.ts`, `snippets/context.ts`), so the cursor class is closed. What
remains:

- `lua/treesitter/api.ts` `get_string_parser` parses a tree and hands it to Lua
  through `pushTSTree` with **no owner**. It is freed only when GC collects it.
- Any `Tree`, `Query` or `Parser` dropped without `delete()` anywhere is the
  same shape. The three defects fixed alongside this investigation — the
  `query.parse()` wrapper, `parserCache` and `ltreeCache` — were all in this
  class, which makes them considerably more than tidiness.
- A pattern gate for "handle allocated, never deleted" is the durable answer;
  `.walk()` without a matching `delete()` is the narrow version.

### Re-measured: the disconnect crash is gone too

`rpc-structural-nav` is the spec that measured 24 of 46 (52%) before the
deferred-teardown mitigation and ~29% after it. On current master — cursor
freed, mitigation still in place — it measures **0 segfaults and 0 failing runs
in 16**, every run 14 passing. Against its own 29% post-mitigation rate that is
p ≈ 0.004; against the 52% baseline, p ≈ 1e-5.

So the `KNOWN_LIMITATIONS` entry for the RPC disconnect crash and this
tree-sitter crash were the **same defect**, which is what the shared
`base + 0x7fffffff` fingerprint was saying all along. The entry is marked fixed.

One consequence worth stating plainly: the deferred-teardown mitigation was
adopted on 24/46 versus 7/38, Fisher p = 0.002 — but **both arms contained the
leak**, so that comparison was confounded. It has now been decided empirically.
Three teardown shapes on current master, 16 container runs each:

| teardown                                          | segfaults | historical |
| ------------------------------------------------- | --------- | ---------- |
| 3-second deferred `SIGTERM` (the mitigation)      | **0/16**  | ~29%       |
| synchronous `qa!` + await `'close'` (pre-b8bab58) | **0/16**  | 24/46, 52% |
| immediate non-blocking `SIGTERM` (now shipped)    | **0/16**  | n/a        |

48 runs, 0 segfaults. The synchronous arm is the decisive one: it is the exact
configuration that measured 52%, and it is now clean, p ≈ 1e-5. So the
mitigation was never load-bearing and the 3x reduction was noise or a timing
side effect, not a fix.

The deferral is therefore removed. What is kept is the non-blocking shape,
which is better independently — disconnect returns immediately rather than
blocking up to four seconds — and which is also _less_ code than the
synchronous version it replaced, so reverting to the latter would have been a
regression in both responsiveness and complexity.

### What is still not established

The step from "finalizer frees a dangling tree pointer" to "V8 faults at
`base + 0xffffffff` in JIT code" is inferred, not measured. Allocator
corruption surfacing later fits, and the toggle is decisive (5/8 against 0/6),
but the intermediate state was never observed. Do not write that step up as
established.

## Recommendation on the Lua TSNode question: not a generation counter

Reading `api.ts` changes the diagnosis. Line 122 does `if (oldTree)
oldTree.delete()` on re-parse, and line 212 the same, so when a user's Lua holds
a node and anything re-parses, **we free the tree those nodes point into**. That
is a plain use-after-free of our own making, not the WASM heap-move story the
earlier entries assumed.

tree-sitter's contract is the opposite: a re-parse yields a _new_ tree and
leaves the old one valid until its owner deletes it. Neovim behaves that way, so
Lua written against Neovim is correct and we break it.

That makes a generation counter the wrong instrument. It would report the
breakage on every node method, at a per-call cost, while leaving the cause in
place — and it would make code fail that is valid everywhere else.

Recommended order, with step 1 now done and the answer above:

1. ~~**Measure first.**~~ Done: it does not crash, it returns stale data.
2. **Stop deleting the old tree on re-parse.** Node userdata already holds a
   Lua reference to its tree (`applyTreeRef`/`treeIndex` in `node.ts`), so
   lifetime can follow references, with `__gc` via `FinalizationRegistry`
   collecting trees nothing points at. Semantically correct, no API change, no
   per-call cost.
3. ~~**Pre-growing the WASM heap** is the separate belt-and-braces for the
   genuine heap-move class.~~ Dropped: the heap never grows, measured at 84
   readings across both configurations. There is no heap-move class to brace
   against.
4. **Generation counter only if 2 proves infeasible** — for instance if trees
   cannot be kept alive without unbounded growth. It is the fallback that trades
   a crash for a wrong-but-safe error, and it should be chosen knowingly rather
   than by default.

Worth noting the framing error this corrects: the Lua path was filed under the
same root cause as the heading-motion crash because the symptom matched. It is a
different defect that happens to produce a similar fault.

## The picker entry now carries its own evidence

`a config reload closes an open picker instead of leaking it` made two
assertions against fixed delays, and the CI failure could not distinguish them:
`pickerOpen()` false at the first meant the picker never opened, which is a test
race; true at the second meant the reload failed to close it, which is the
product leak the test exists to catch.

Both now wait. Opening fails with `picker never opened after Q`. Failing to
close throws with the DOM state instead of a bare `expect(true).toBe(false)`.
Negative-controlled by removing the reload, which produces:

```
picker survived the config reload:
{"activeEl":"vim-motions-picker-input","modalContainers":1,"pickers":1,"prompts":0}
```

So the next Windows occurrence reports which of the two it is, and what
survived. 10 passing, 4 of 4 clean on Linux — which is no-regression evidence
only, since Linux has never reproduced it.

`#181` was left alone: it already carries a diagnosis block covering
`reducedMotion` and canvas sizing, added by an earlier session. The known gap
there is that it only runs on failure, so there is no passing baseline to
compare against — worth fixing if it recurs, but not worth adding a second
diagnostic on top of an untested first one.

## `#136`: a sleep that was covering more than it looked like

`j after Enter cell edit should navigate to next row (#136)` failed on macOS
with `expect(received).not.toBeNull()` — the highlighted cell was null after a
fixed 300 ms following `j`, so the highlight had not repainted yet.

The obvious fix was to replace all three fixed pauses in that test with waits.
That made it **deterministically worse**: 1 failing in 4 of 4 runs, with
`table-nav highlight never returned after Escape`. `hasCellEditor()` becomes
true as soon as the element exists, which is sooner than the 800 ms it
replaced, so Escape arrived before the cell editor had finished initialising and
nav mode never came back.

The lesson is worth keeping, because it cuts against the rest of this file: a
fixed sleep is not always a lazy wait. Those two were covering **initialisation
that exposes no signal**, and turning them into existence checks removed time
the test genuinely needed. Only the final step — where the highlight has an
observable signal and the assertion was the thing racing — was converted. 28
passing, 4 of 4 clean.

Both of this run's macOS entries were therefore test defects rather than product
defects, and both were the same shape: an assertion made against a fixed delay
instead of the condition it depended on.

## The frontmatter entry: the planted diagnostic answered it

`keeps source-rendered frontmatter fully navigable` is resolved, and it was a
test defect rather than a product one.

An earlier session added a diagnostic to this test for exactly this moment: it
reports what the fork's frontmatter decision is _based on_, "so the next CI run
separates a mis-read properties mode from a fold or live-preview problem". On
its first real failure it answered unambiguously — `propertiesInDocument:
"visible"` in a test that had just called `reconnectInPropertiesMode('source')`.
Mis-**set**, not mis-read, and therefore neither a fold nor a live-preview
problem.

The cause is `setPropertiesMode`, which called `setConfig` and then
`browser.pause(300)` with no check that it landed. When that race is lost the
walk runs with properties still `visible`, so the fork correctly keeps its
frontmatter interception, the cursor stalls on the metadata container, and the
test reports a navigation failure for a setup that had not applied yet. It now
waits for the setting to read back, with a message naming the setting if it
never does.

Two things worth taking from it. The diagnostic was worth planting: it converted
an unreproducible macOS failure into a one-line answer, on a platform nobody
could bisect. And this is the same unverified-setter shape recorded elsewhere in
this file — a fixed sleep standing in for a condition nobody checked.

`rpc-keys` runs 4x clean on Linux after the change, though Linux never
reproduced the failure, so that confirms no regression rather than the fix.

## CI after the fixes, and two entries this file was missing

Three consecutive full E2E runs on master: `fix: blockquote` **passed**,
`docs: close the RPC inventory entries` **failed**, `test: which-key budget`
**passed**. The middle one is a docs-only commit, so its failure is by
definition a flake rather than a regression. No RPC segfault appears in any of
them, which is the change worth noting — that cluster used to dominate.

The failing run was two macOS shards, and **neither test was in the inventory
table**, so the list of open entries was incomplete:

| Test                                                         | Spec                         | Platform | Observed |
| ------------------------------------------------------------ | ---------------------------- | -------- | -------- |
| `keeps source-rendered frontmatter fully navigable`          | `rpc-keys.e2e.ts`            | macOS    | 1        |
| `j after Enter cell edit should navigate to next row (#136)` | `table-cell-vim-mode.e2e.ts` | macOS    | 1        |

The frontmatter one carries usable diagnostics: `rows: [7,6,6,6,6,6]` with
`mode: "source"`, `propertiesInDocument: "visible"` and
`metadataContainers: 1`. The cursor reaches row 6 and then stalls there for four
more steps. That is the shape `setPropertiesSource()` exists to prevent — the
fork's frontmatter interception is meant to be skipped when properties render as
source text, and a stall on a `.metadata-container` is what happens when it is
not. So the likely fault is the gating callback reporting the wrong mode, which
would not be macOS-specific in itself.

It is also worth noting this is an **RPC spec** that failed _after_ the
tree-sitter fix, and it fails by stalling rather than by segfault, so it is a
separate defect rather than a survivor of that cluster.

Neither reproduces on Linux: `rpc-keys` and `table-cell-vim-mode` ran eight
times in the container for 38 passing each, 0 failures, 0 segfaults. Same
caveat as the other Linux attempts — that bounds the rate, it does not clear
them, and macOS is the platform that saw them.

## Reproduction attempt on Linux: none of the five reproduce

All four specs owning the five open entries — `cursor-shapes-runtime`,
`rpc-obsidian-bridge`, `lua-space-leader`, `lua-vim-ui` — run ten times in the
container: **530 test executions, 0 failures, 0 segfaults**.

What that does and does not establish. Ten clean runs bound the rate below about
26% at 95% confidence, and these entries were each observed one to three times
across many CI runs, so their real rate is single-digit percent. **Ten runs
cannot distinguish fixed from rare, and for four of the five the platform is
wrong anyway.** Treat this as "does not reproduce on Linux at ten samples",
which is weaker than unreproducible.

Two corrections came out of it. `focuses the expected pane in all four
directions` and `uses the host jumplist for two cross-note older jumps` both
live in **`rpc-obsidian-bridge.e2e.ts`**, so the earlier claim that no open
entry is an RPC entry was wrong. That spec has now run 16 times clean (6 in the
cluster check, 10 here) since the tree-sitter fix, which is the most likely
explanation for both.

`which-key shows after space press` is settled by reading rather than sampling.
`waitForWhichKey` allowed 2000 ms while `operatorshadowtimeout` defaults to
1000 ms, and `<Space>` is a prefix, so the overlay cannot appear until the
deferral expires. The real budget was 1000 ms, polled at 100 ms plus a round
trip. The default is now 5000 ms, measured past the deferral. This is a test
defect, not a product one — the overlay was never late, the assertion was early.

That leaves three genuinely open, all needing a platform the container cannot
provide: `#181` and `focuses the expected pane` on macOS, `a config reload
closes an open picker` on Windows.

## What is still open, after the tree-sitter fix

Ten of the fifteen inventory entries are resolved. The five that are not share
two properties: **none is an RPC entry**, and **none has ever been reproduced
locally**, because the container harness is Linux and these are macOS and
Windows observations.

| Still open                                                    | Platform       | Why it is not closed                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `the animated cursor picks up a shape change (#181)`          | macOS          | Fails on its canvas-paint precondition rather than the scroll defect the issue describes. Related to the canvas pair resolved as unfocused-window, but not the same failure.            |
| `focuses the expected pane in all four directions`            | macOS          | Focus excluded across three samples — `cmFocused` true, focused window, correct document. A test rather than a hook, so not the session-death cascade either.                           |
| `which-key shows after space press`                           | Windows        | Polls 2000 ms for behaviour gated by `operatorshadowtimeout`'s 1000 ms deferral. The margin is thin by construction, so this is likely a test-design problem rather than a product one. |
| `a config reload closes an open picker instead of leaking it` | Windows        | One observation, new in `2b6bc75`. Not enough data to characterise.                                                                                                                     |
| `uses the host jumplist for two cross-note older jumps`       | Windows, Linux | Focus excluded: failed with `cmFocused` true and a correct 19-char document.                                                                                                            |

The honest constraint is the harness. Every measurement in this file after the
container repro was Linux-only, so the four macOS and Windows entries cannot be
bisected the same way — they need either CI stress runs, which cost 45 minutes a
sample, or a macOS/Windows equivalent of the container loop.

Of the five, `which-key` is the one most likely to be a test defect rather than a
product defect, and it is also the cheapest to settle: raise the poll above the
deferral it is racing, and see whether it stops failing.

## What "resolved" means for the two product bugs

**`g-`** — defect fixed and guarded. `undo-tree.e2e.ts:168` asserts the live
tree's sequence moves, and its negative control was recorded: the unfixed
build reported `Expected: 19, Received: 20`.

**Vim toggle** — defect fixed, and guarded only at the settings level.
`vim-toggle.e2e.ts` "rapid toggle applies both requests and ends enabled"
fails when the cooldown is un-awaited, so it does catch the mechanism.

Nothing asserts the consequence that actually hurt: that extension-slot
features survive a rapid toggle. An attempt to add one was removed because it
could not be made to fail — with the awaited cooldown reverted it still
passed, since the serialised chain and the deferred callback checks prevent
the drop on their own. A test that cannot fail is worse than none, so it went
rather than staying as decoration.

Closing this properly needs a control that reverts all three parts of
`34168dd` at once, not one of them.

## Fold and canvas hold in production CI

Two consecutive real runs after the focus fixes, `f5d3502` and `80d4918`:
zero macOS failures in either, 99 and 98 jobs green. Every CI shard job is a
cold start, which is the condition that used to break both clusters, so this
is the case they used to fail rather than a warm rehearsal.

Remaining in production: the Linux RPC entries, and one Windows jumplist
failure.

## `]3` is a behavioural failure, not an environmental one

`3848e23` failed it on **Linux**, having previously only failed on macOS, and
the diagnostic added earlier names the difference:

    cursor never reached line 4:
      {"lastObserved":0,"probeKeys":["]","3"],"viaHandleKey":0}

`viaHandleKey` replays the same keys through `Vim.handleKey`, bypassing DOM
delivery. It also leaves the cursor at line 0, so the motion does not move
regardless of how it is invoked. That excludes key delivery, the platform, and
the focus cause behind the fold and canvas clusters.

A heading motion that finds no heading is the shape of structural navigation
running before its heading data exists. `AGENTS.md` records that the heading
provider falls back to regex only when treesitter metadata is unavailable, so
metadata readiness is the first thing to measure.

This one is user-relevant: opening a note and immediately pressing `]3` is an
ordinary thing to do, and nothing here depends on CI.

## The RPC cluster is larger than five entries

Applying the focus fix to `rpc-obsidian-bridge` and `rpc-keys` on the strength
of the fold and canvas results did not help: six cold macOS samples, two
failures, and a different test each time — `keeps source-rendered frontmatter
fully navigable` and `forwards the count from 2<C-o> to the host jumplist`.
`focuses the expected pane in all four directions`, the failure that prompted
the change, did not recur at all.

That is the signature of the Neovim-exit cause rather than an unfocused
window: the failing test moves between runs because whichever test is running
when the child exits is the one that fails. It also means the cluster spans
`rpc-structural-nav`, `rpc-obsidian-bridge`, `rpc-keys` and `rpc-text-objects`
rather than the entries originally listed, and that entry names are a poor
key for it.

The fix was applied from a prior instead of a measurement, which is the
departure that produced this. The change itself is kept because it aligns the
two focus paths, which had unequal strength for no reason, but it resolved
nothing here.

## Why Neovim exits: still open, and how to get at it

Six more cold Linux samples, four failures, `dead:no-proc` confirmed again.
Reading Neovim's own log from the default locations returned nothing: Neovim
writes `stdpath('log')` only for some levels, and the spawned child does not
necessarily resolve the paths guessed from the runner's `HOME`.

The reliable version is to set `NVIM_LOG_FILE` to a known path in the
workflow environment. Obsidian inherits the runner environment and the plugin
spawns the child from Obsidian, so the setting propagates, and the file is
then readable from Node after the session dies.

Two failures also reported an empty pid set with no test state at all, which
means the hook failed before a pid was recorded. Those are a different shape
from the `dead:no-proc` case and should not be counted with it.

An earlier note here claimed the host fails to notice a dead child and that
this was a ready-to-fix defect. Reading the code before fixing showed it is
not: `neovim-connection.ts` registers `child.on('close')`, and `handleClose`
calls `rpc.dispose(new Error('Neovim process exited'))`, which rejects every
pending request, then shows a Notice naming the exit code or signal.

The hang is also not an RPC call. `getEditorValue` runs
`view.editor.getValue()`, which is CM6 only and involves no RPC, so the
renderer is not waiting on Neovim when it stops answering. What makes the
renderer unresponsive around the time the child exits is unknown, and
`spawnSync`-style synchronous work in teardown is the first thing to look
for, since a synchronous block would produce exactly this shape: no completed
long task, a trivial document, and `execute/sync` never returning.

## RPC entries: Neovim exits, and the renderer then hangs

Six cold Linux samples, three failures, and the Node-side process state names
the primary event:

|                               | document                 | Neovim             |
| ----------------------------- | ------------------------ | ------------------ |
| boundaries before the failure | 13-32 chars              | `alive:S`          |
| the failing boundary          | unreadable, session gone | **`dead:no-proc`** |

Two replicas showed it on the same test, `matches counted operator-pending
heading motion edits`. The renderer stall is the consequence, not the cause:
the child exits, and the host is left waiting on a process that is gone.

This is the measurement that browser-side probes could never make. Every
failing replica reported `docLength` and `longtasks` as null, because by the
time `afterEach` ran the session had already died. Reading `/proc` from Node
survives that.

Open and user-relevant: why the child exits. A crash in the companion Lua, an
unhandled RPC message, or the operating system reclaiming it are all live,
and they differ in whether a user can hit them. The 30-second request timeout
added earlier should have rejected the pending call when the stream closed,
so the host's handling of a dead child is worth auditing regardless of the
cause.

## RPC entries: narrowed to a native block

`connectionRetryTimeout` did not fix the stall, but it changed a dead session
with no test name into a clean 180-second abort carrying a stack:

    WebDriverError: The operation was aborted due to timeout on execute/sync
      at getEditorValue (test/helpers.ts:39)
      at forkSnapshots (rpc-structural-nav.e2e.ts:161)

Excluded by measurement since:

- **Document size.** 13 to 32 characters at every test boundary up to the
  failure, so `getValue()` is not walking anything large.
- **A JavaScript long task.** None is ever reported. That is consistent with
  being stuck inside one rather than evidence against it, because a
  `PerformanceObserver` emits a `longtask` entry only once the task finishes —
  reading it as "not JavaScript" would have sent the next round chasing GC and
  IPC for nothing.
- **Neovim being dead.** The child is `alive:S`, sleeping normally, at every
  boundary that reports.

So the renderer stops answering `execute/sync` for 180 seconds with a trivial
document and no completed long task. Browser-side instrumentation returns null
once the session dies, which is precisely when the evidence is wanted, so the
process state is now read from Node and survives.

Local rate is roughly one run in six against four in six on CI, so CI remains
the better sampling ground.

## RPC entries: the connection timeout did not fix them

Six cold Linux samples: four failed. The signature is unchanged --
22 `invalid session id` and 2 `Timed out receiving message from renderer:
30.000`, with no failing test names at all, because the session dies before
any test reports.

`connectionRetryTimeout` addresses the HTTP client's patience. The 30-second
limit in the message is ChromeDriver waiting on the renderer, which that
setting does not govern, so the change could not have helped and the quiet
runs since it landed were normal CI happening not to sample the case.

A renderer that stops responding for thirty seconds is a main-thread block.
If it is our main thread it is a user-visible freeze, so this one is not
dismissible as environment until that is settled.

## UI-lifecycle entries: not reproduced, and three replicas were harness noise

Eight Windows replicas: five ran and all five passed; three died in setup on
`EPERM`, which `e2e.yml` retries and the stress workflow did not, so they
looked like spec failures. The retry is now in both.

Focus was reported on every run rather than only on failures. Locally these
specs show `hasFocus` true with `cm-focused` false and the body as active
element, which is expected since neither puts a cursor in an editor -- so the
discriminator that resolved the fold and canvas clusters does not transfer
here, and applying that fix blind could have passed for the wrong reason.

## Canvas entries: resolved

Focusing the window after the spec's own reload cleared them: eight cold
macOS starts, eight passes, no skips, `document.hasFocus()` true on every one.
Against four and five failures in eight before, each failure unfocused.

Placement was what took two attempts. `beforeSuite` runs before the spec calls
`reloadObsidian`, and the reload discards the focus, so the global wait left
five of eight still failing. The call has to come after the spec's own load,
which is what the fold specs were already doing.

|                                    | cold failures | focus on failures           |
| ---------------------------------- | ------------- | --------------------------- |
| before                             | 4/8, then 5/8 | `hasFocus` false every time |
| focus wait in beforeSuite          | 5/8           | false every time            |
| focus wait after the spec's reload | 0/8           | n/a, all true               |

## Canvas entries: the same unfocused window

Eight cold macOS starts with the environment reported unconditionally:

| replicas      | result | reducedMotion | hasFocus |
| ------------- | ------ | ------------- | -------- |
| 1, 3, 4, 6, 7 | fail   | true          | false    |
| 2, 5, 8       | pass   | true          | true     |

`prefers-reduced-motion: reduce` is active on every macOS replica, passing and
failing alike, so it is incidental. On failure data alone it looked like the
cause, because the give-up diagnostic only ran when the test failed; the
passing rows are what excluded it. `document.hasFocus()` matched the outcome
8 times out of 8.

The failing canvas is present, 1024x676 with a matching client rect, display
block and opacity 1 — it exists, is sized and visible, and is never drawn on.

An earlier note here claimed the canvas specs pass while unfocused and used
that to exclude focus for this cluster. That came from a single run in which
only the fold specs happened to fail, and it was wrong.

The focus wait therefore moved from the fold spec to `beforeSuite`, so every
spec gets it rather than the one cluster that was investigated first.

## Fold pair: an unfocused CI window

`document.hasFocus()` matched the outcome 16 times out of 16 across two runs
of eight cold macOS starts:

|            | hasFocus | cm-focused | callout                      | placeholders | result |
| ---------- | -------- | ---------- | ---------------------------- | ------------ | ------ |
| 9 replicas | true     | present    | editable lines               | 1            | pass   |
| 7 replicas | false    | absent     | `.cm-embed-block.cm-callout` | 0            | fail   |

Without OS focus CodeMirror never registers focus, Live Preview keeps the
callout rendered as a widget, nothing can fold inside it, and the document
content is correct throughout — which is why eleven hypotheses looking for a
macOS-versus-Linux behavioural difference found nothing.

Waiting for focus fixes it. `editor.focus()` cannot raise a window and
`Page.bringToFront` addresses the renderer rather than the OS window, so
neither helped. But focus does arrive on a cold start, just not immediately:
`ensureWindowFocused` retries for five seconds, and the suite then runs in the
focused state the assertions need. The skip is a fallback that should rarely
fire.

Measured across eight cold macOS starts per configuration:

|                        | cold failures | suites skipped                                   |
| ---------------------- | ------------- | ------------------------------------------------ |
| no guard               | 2/8, then 5/8 | —                                                |
| focus sampled once     | —             | 6/8, over-skipping suites that would have passed |
| focus awaited up to 5s | 0/8           | 0/8                                              |

Sampling focus once was itself a defect of the same family as a vacuous
assertion: it reported safety that had never been established, disabling six
suites to absorb a failure rate of two to five in eight.

A user's window is focused while they type in it, so this describes the
runner and not the plugin. **The canvas entries are not explained by it**:
both canvas specs ran on the unfocused replicas and passed.

## Fold pair: cause identified, fix not yet found

Live Preview renders a callout as a `.cm-embed-block.cm-callout` widget and
unrenders it to editable lines only once the cursor is inside. On a cold start
the cursor placement had not taken effect when the fold was attempted, so the
callout was still a widget, no placeholder could render inside it, and `zc`
produced nothing.

Measured, cold versus warm on the same runner and commit:

|                           | cold (fail)                          | warm (pass)                                 |
| ------------------------- | ------------------------------------ | ------------------------------------------- |
| callout / embed elements  | 1 / 1                                | 0 / 0                                       |
| third `.cm-content` child | `div.cm-embed-block.cm-callout[125]` | `div.cm-line…HyperMD-callout…cm-active[24]` |
| `.cm-foldPlaceholder`     | 0                                    | 1                                           |

The obvious fix does not work. Waiting for `.cm-embed-block.cm-callout` to
disappear before folding **times out on a cold start**, turning two failures
into four: `callout line is foldable` and `callout fold placeholder contains
callout type` were passing only because `foldable()` returns a range for a
widget-rendered region, so they were passing vacuously in exactly the state
that breaks the other two. The wait was reverted rather than left on master.

So the callout never becomes editable on a cold start, which means the cursor
never lands inside it — `setupEditor`'s cursor placement is not taking effect
there. That is the next thing to measure: the cursor position and editor focus
immediately after `setupEditor` on a cold iteration, not the callout markup
that follows from them.

`waitUntilFoldable` cannot see this: `foldable()` is a state query and returns
a range while the region is still a widget, so the precondition it checked was
not the precondition the assertion needed. `waitUntilCalloutEditable` waits for
the widget to clear.

Reproduced locally on demand, which no earlier hypothesis managed: placing the
cursor outside the callout gives `embed=1` and the widget element, placing it
inside gives `embed=0` and three `HyperMD-quote-1` lines. That is the cold
state on demand, and it also proves the new wait is not a no-op.

Classified **test-side**: a real user folds a callout with the cursor on it,
which unrenders the widget first.

## The fold pair fails on a cold start, and renders differently when it does

Two stress runs, and both failed on **iteration 1**:

|                       | iter 1 (fail) | iters 2-8 (pass) |
| --------------------- | ------------- | ---------------- |
| `.cm-foldPlaceholder` | 0             | 1                |
| `.cm-line` count      | 4             | 5                |
| content height        | 563           | 490              |
| editor height         | 598           | 598              |
| `getMode()`           | source        | source           |
| `directFoldEffect`    | stuck         | stuck            |

The fold reaches state either way. What differs is rendering: on the cold
iteration the callout occupies fewer line elements and more vertical space,
which is a decorated block rather than plain lines, and no fold placeholder
appears. Mode is `source` in both, so this is not reading view.

**This invalidates how the stress tool's rates should be read.** A shard job
in `e2e.yml` runs wdio exactly once, so every real CI job is iteration 1. A
stress run of N iterations contains one cold start and N-1 warm ones, which
is why the same spec measures ~7% under stress and ~60% in CI. Stress
underestimates any cold-start failure by roughly a factor of N.

Refuted along the way: state accumulation within the spec (`foldable` stays
true after all eight tests), and every earlier platform-difference
hypothesis, since the discriminator is warm-versus-cold on one runner rather
than macOS-versus-Linux.

The remaining question is what the callout is decorated with on a cold start.
The next probe should capture the callout element's own markup and computed
box in both states rather than aggregate counts.

## Next hypothesis for the fold pair: state within the spec

Run `35025641995` failed the fold pair again with a payload identical to every
previous one. Comparing it against the always-on probe in the same file is the
part that had not been done:

- the `before()` hook reports `directFoldEffect: "stuck"` — folding works
- `zc on callout folds it` (test 4 of 8) and `editor:unfold-all` (8 of 8)
  produce no fold at all

Folding therefore works at the start of the spec and stops working later in
the same file, on the same runner, in the same process. That is state
accumulating across tests, not a property of the platform — and it is
consistent with every refuted hypothesis so far, all of which looked for a
macOS-versus-Linux difference.

A probe must record foldability after **each** test in `fold-providers`, on a
runner where it fails, and find the first test after which it stops. All eight
pass locally, so this needs CI or a forced local equivalent of whatever that
test leaves behind.

## Canvas entries are intermittent, confirmed

`cursor follows cursor movement` passed on macOS in `35008278154` and failed
on macOS in `35025641995`, with no code change between them affecting it. It
is intermittent on that runner rather than impossible there.

## RPC entries after the connection timeout

Two consecutive runs (`35008278154`, `35025641995`) contain no RPC failures,
against three of five before `9fda566`. Encouraging and far from proven; the
prior green run `0815d5c` was followed by two red ones on the same commit.

## Runner capability, measured

|                    | Linux       | macOS    | Windows     |
| ------------------ | ----------- | -------- | ----------- |
| cores              | 4           | 3        | 4           |
| device memory      | 8 GB        | 8 GB     | 8 GB        |
| WebGL              | SwiftShader | **none** | SwiftShader |
| `directFoldEffect` | stuck       | stuck    | stuck       |

macOS is the only runner with no WebGL context, and the only one where the
canvas entries fail. That is suggestive, but it is **not** a capability wall:
`9fda566` added `canvasPaintSupported`, which skips a canvas spec when 2D
paint and readback are unavailable, and across 36 macOS jobs in run
`35008278154` it never fired. Both canvas tests ran and passed there.

So the canvas entries are intermittent on macOS, not impossible on macOS, and
"a runner artifact that cannot affect real users" is **not** established.

Note the guard checks an offscreen 2D readback, which is weaker than what the
feature needs (an onscreen composited canvas). It not firing rules out the
strongest form of incapability, not every form.

Fold works on all three runners, so no graphics explanation applies to it.

## It is a renderer SIGSEGV, and every local run was testing a stale bundle

`dmesg` names it. It needs `--privileged` to read inside the container, and
`--pid=host` for the PIDs to mean anything, because the kernel reports host PIDs
while the container has its own namespace:

```
obsidian[1820789]: segfault at 20397fffffff ip 000027ae79ccab57 error 4
obsidian[1826745]: segfault at fbd7fffffff   ip 00003f8a616a4b57 error 4
```

`error 4` is a user-mode read of an unmapped page. Correlation with the test
result is exact: every failing run has a fresh segfault, every clean run has
none, now over nine runs. The crash **is** the failure, and the `invalid session
id` cascade, the `tab crashed` message and the 30 s driver timeout are all
downstream of it.

Resolving the faulting `ip` against a snapshot of `/proc/<pid>/maps` (the
process is gone by the time `dmesg` is read, so the snapshot has to be taken
while it lives) puts it in an anonymous **`rwxp`** region -- writable and
executable, not file-backed. That is JIT code. The low bits of `ip` are `b57`
across the two `ci-test` bundles, which differ by six lines, while the earlier
production bundle faulted at `c17`, `5d7` and `792`. The offset moves when the
bundle changes materially and holds when it barely changes, so this is **our own
JIT-compiled JavaScript**, not V8's blob. An earlier note here claimed the
opposite; it compared two nearly identical bundles and drew the wrong
conclusion. Every fault address has the form
`base + 0x7fffffff`, the signature of `kMaxInt` reaching a memory access as an
index or length.

~~Refuted by experiment, not by argument: **the entire use-after-free class**.~~
First all six tree frees were neutralised and the bundle rebuilt -- 2 of 4 runs
still segfaulted. That test was incomplete, because queries and parsers are
freed too and `named-queries.ts` invalidates queries by revision at runtime, so
the second pass neutralised **all twelve** handle frees across `bridge.ts`,
`language-tree.ts`, `runtime.ts`, `query.ts`, `named-queries.ts` and
`lua/treesitter/api.ts`. With nothing freed at all a use-after-free is
impossible, and it **still segfaulted** at the same `b57` site.

**This conclusion is invalid, and it is the one that cost the investigation the
most.** Neutralising the twelve in-repo `delete()` calls never achieved
"nothing freed": `web-tree-sitter` registers every handle with its own
`FinalizationRegistry`, so GC kept freeing each dropped handle regardless. The
use-after-free class was never excluded, and it is in fact the root cause --
see "ROOT CAUSE: a leaked `TreeCursor` and `web-tree-sitter`'s
FinalizationRegistry" above. Read correctly, this arm is evidence _for_ the
finalizer path, because removing our frees leaves the GC frees untouched.

So the fault is a **bad index, not a stale pointer**, which reframes it
usefully: something passes a large value into a WASM-backed call, and
`0x7fffffff` is exactly the `MAXCOL` that `coordinates.ts:227` maps `Infinity`
to. web-tree-sitter converts a `{row, column}` position to a byte offset without
clamping, so a `MAXCOL` column reaching `descendantForPosition` or
`namedDescendantForPosition` indexes WASM linear memory about 2 GiB past its
base, beyond the guard region, where it faults for real instead of trapping.
`lua/treesitter/api.ts` calls `namedDescendantForPosition` with a
caller-supplied position.

There _is_ still a real use-after-free in `lua/treesitter/api.ts`, which hands a
tree to Lua via `pushTSTree` and then frees it on the next parse. It is a
genuine bug on its own terms, and it is not this crash.

### MAXCOL is refuted too, and there are two crash signatures

A clamp-and-log probe was added at all seven `descendantForPosition` /
`namedDescendantForPosition` boundaries -- `js-api.ts`, `language-tree.ts` x2,
`runtime.ts` x2, `lua/treesitter/node.ts` and `lua/treesitter/api.ts` -- logging
and clamping any row or column outside `[0, 1e6]`.

Across four runs it logged **zero** hits, and 2 of 4 still segfaulted. No
oversized position ever reaches tree-sitter, so `MAXCOL` does not get there and
that hypothesis is dead. It was a good fit for the fault address and still
wrong, which is the recurring lesson in this file.

The probe did surface something the pass/fail counts had hidden. One crash
landed at `addr=87ddb00000c`, `ip=...96d4`, which matches neither the
`base + 0x7fffffff` shape nor the `...b57` code site seen everywhere else. So
there are **at least two distinct crash signatures**, and any theory explaining
only the `0x7fffffff` one was always going to leave failures behind. That is
consistent with how many single-mechanism explanations have now died here.

Refuted so far, each by measurement: OOM and memory growth, `/dev/shm`, CPU
count, process and handle buildup, six container security and namespace
settings, Neovim liveness, msgpack decoding, payload size, JS heap and DOM
growth, ~~the whole tree-sitter use-after-free class~~, and oversized
positions. The use-after-free entry is struck because the arm that produced it
was invalid; it is the root cause.

### Implemented: the renderer stops parsing while RPC is connected

`enableTreesitterBridge()` is called once from `onload()` and is **not gated on
the RPC connection**, so while Neovim is connected the same document is parsed
twice on every change: natively inside Neovim, and again as WASM tree-sitter in
the renderer.

The motions themselves already use Neovim's copy — under RPC, structural motions
and Markdown text objects run as buffer-local companion mappings backed by
Neovim's parsers, and fold state is mirrored back from redraw. The renderer tree
keeps being maintained anyway, for fold metadata and the syntax-aware JS
consumers (`code-block`, `blockquote`, `delimiter`, `snippets/context`), which
already retain regex fallbacks for when the bridge is unavailable.

Worth evaluating on two grounds. It removes duplicated parsing on every
keystroke while connected. And it removes the RPC-driven parses that made the
retained-node defect reachable in the first place: the crash needed the fork
walking nodes _while_ something else re-parsed. (This paragraph originally
attributed that to heap growth, which has since been measured at zero; the
second ground still holds, because what the retained node needs is a re-parse,
not a larger heap.)

What would need checking first: which consumers are genuinely dormant under RPC
versus still reading the renderer tree, whether fold metadata quality survives
the fallback, and that the Lua `vim.treesitter` API is unaffected — it keeps its
own parser cache, separate from the bridge, so user Lua would still need a
parser regardless.

Implemented and verified both ways: with the bridge gated on the connection, 34
RPC tests pass with it off (including `rpc-folds-undo`, the fold-metadata case
that was the main worry) and 33 non-RPC tests pass with it on (including
`fold-providers` and `navigation`, which need the tree). So the consumers really
are dormant under RPC, which was the assumption worth checking.

This is defence in depth, not the fix: the defect itself is resolved at the call
sites.

### The whole RPC cluster is clean after the one fix

`rpc-keys`, `rpc-text-objects`, `rpc-obsidian-bridge` and `rpc-text-sync` run
together, six times, with the node-retention fix in place: **47 passing per run,
0 failing, 0 segfaults**, 282 test executions in total. Together with
`rpc-structural-nav` at 0/16, the cluster that opened this file is resolved by a
single change.

That is also the answer to why so many unrelated-looking specs failed: they all
drive structural heading motions somewhere, and every one of them was walking
the same retained-node path.

**Still only identified by shape, not measured.** The four remaining sites in
the section below have not been shown to crash; they are the same pattern in
code. `src/lua/treesitter/node.ts` is the one to take seriously, and it needs a
design decision rather than the fix applied here: the Lua API hands out `TSNode`
userdata with 31 methods, so it cannot simply return plain data. Invalidating
outstanding node handles when a parse runs -- a generation counter checked on
every method -- is the shape that fits, and it is a real change rather than a
tidy-up. `src/treesitter/query.ts` has the same constraint, since its captures
feed that API.

### Fixed, and where the same shape remains

`getAllNodesOfType()` collected `Node` objects into an array during a cursor
walk and the caller read them afterwards; `headingLevelFromNode()` then called
`node.child()` on each retained node, allocating again while iterating. Replaced
with `getNodeSummariesOfType()`, which navigates with the `TreeCursor` alone --
`nodeType`, `startPosition` and `endPosition` read in place without allocating a
node -- returns plain data, and deletes the cursor.

| measurement                     | before     | after                |
| ------------------------------- | ---------- | -------------------- |
| `]h`-only reproducer            | 8/16       | **0/16**             |
| unmodified `rpc-structural-nav` | 29% pooled | **0/16**, 14 passing |

**The same pattern elsewhere — audited, and smaller than it first looked.**
Anything that keeps a `Node` past a point where a parse can run is exposed, but
tracing the consumers splits them cleanly:

- `src/lua/treesitter/node.ts` — nodes are handed to Lua as userdata and
  retained across Lua calls. This is the worst case: the interval between calls
  is unbounded and user config controls it. Reachable from any `vim.treesitter`
  use.
- `src/treesitter/query.ts` — captures store `raw.node` into arrays and maps
  (the `captureMap`, `existing`, `idExisting` paths) and read them after the
  collection finishes. Same collect-then-read shape as the bug just fixed.
- `src/lua/treesitter/language-tree-api.ts` — `nodeForRange` and
  `namedNodeForRange` return nodes into Lua.
- `src/snippets/context.ts` — holds the result of `getNodeAtPosition`; lower
  risk if consumed immediately, but it is the same class.

**Audit result.** `FilteredCapture.node` is consumed only by
`src/lua/treesitter/query-api.ts`, so `query.ts`, `language-tree-api.ts` and
`lua/treesitter/node.ts` are one surface: the Lua `vim.treesitter` API. It is
opt-in — it runs only if a user's Lua calls it — and it cannot take the fix
applied here, because nodes _are_ the API. Nodes stay valid for a tree's
lifetime by tree-sitter's own contract, so raising a Lua error on re-parse would
break correct user code; the real defect is that the WASM binding caches raw
addresses, which is upstream. A generation counter would trade a segfault for a
wrong-but-safe result, and that trade needs a decision rather than a patch.

Two sites were reachable without Lua, not one. The first claim that
`snippets/context.ts` was the only one was made from auditing the node-_returning_
APIs rather than their consumers, and it was wrong: `src/text-objects/blockquote.ts`
kept the outermost `block_quote` node through a `.parent` walk -- which allocates
at every step -- and read its start and end rows _after_ the walk finished. That
is the `aq`/`iq` text object, with no Lua and no RPC involved. It now reads both
rows from each candidate as it is encountered and retains only numbers.
`code-block.ts` and `delimiter.ts` were checked in the same pass and are clean;
both read into plain data immediately.

`src/snippets/context.ts` is the other one, also fixed: the fenced-code-block language is now read through a cursor instead
of `codeBlock.child(i)` in a loop, which allocated repeatedly while the block
node was still being read.

`hasAncestorOfType` was rewritten to use a cursor and then reverted, because the
unit tests caught it returning `false` always: `node.walk()` is rooted at that
node, so `gotoParent()` fails immediately and no ancestor is ever reached. The
parent chain is also the low-risk shape — it allocates one node and reads it
straight away rather than retaining several.

`src/fold/metadata.ts` is the counter-example to copy: it extracts readonly
plain data and retains nothing.

The general rule worth enforcing: **treat a `Node` as valid only until the next
tree-sitter call.** Extract what you need immediately, and never store one in a
collection, a cache, a closure or Lua userdata. An ast-grep rule could catch the
array/collection case.

### Located: reading a tree-sitter tree in the renderer during alternation

Bisecting inside `rpc-structural-nav`, which reproduces at a known rate, 16 runs
per arm:

| fork phase does                                               | segfault runs |
| ------------------------------------------------------------- | ------------- |
| nothing (document replaced only)                              | **0/16**      |
| one trivial key (`x`)                                         | **0/16**      |
| `]h` only                                                     | **8/16**      |
| `]h`, with all 12 tree-sitter handle frees neutralised        | 8/16          |
| `]h`, with incremental `tree.edit()` disabled (full re-parse) | 7/16          |
| `]h`, with `getTreeForView` forced to null                    | **0/16**      |

Replacing the document is harmless; dispatching a trivial key is harmless. One
treesitter-backed motion reproduces it. And the thing that has to happen is the
**read**: forcing every renderer tree-sitter consumer onto its fallback takes
8/16 to 0/16, p ≈ 0.0015% against a 50% arm.

Two mechanisms are excluded at that same power, both of which this file had
previously guessed at:

- **Not handle lifetime.** With nothing ever freed, it still crashed 8/16. The
  earlier dismissal of this was at n = 4 and worth nothing; this one is not.
- **Not incorrect incremental edits.** Full re-parse on every change still
  crashed 7/16.

So a tree that is alive and correctly parsed still faults when walked. The
candidate taken forward at this point was **web-tree-sitter node pointers
outliving a WASM heap move**: nodes are JS objects holding addresses into WASM
linear memory, and a parse that grows that memory replaces the backing buffer,
leaving any retained node pointing into a detached one. It fits the recorded
fault -- a read at `base + garbage_u32`, in JIT code, with no JavaScript frame
-- and it appeared to explain why neutralising frees made no difference, since
leaking trees makes growth _more_ likely, not less. It also appeared to explain
the alternation requirement: the fork phase walks nodes while the RPC phase
drives parsing.

**This was later refuted by measurement** -- the heap does not grow at all, in
either configuration, including in failing runs; see "Measured: the WASM heap
never grows, in either configuration". The fix derived from it is still correct
and still measured; the mechanism is open. Read the rest of this section as the
reasoning that produced a working fix for the wrong reason, which is the
recurring lesson of this file.

Note what the codebase already does correctly here: `src/fold/metadata.ts`
extracts readonly plain-data ranges and titles rather than retaining nodes. The
heading motion's `getAllNodesOfType` returns nodes instead, and holds them.

Next step is a fix rather than another bisect: have tree consumers extract plain
data (positions, types, text) immediately and never retain a node across
anything that can parse or allocate. `]h` is the reproducer to verify against --
8/16 before, and the fix has to take that to 0/16.

### The beforeSuite vim-mode cycle is not the cause either

`wdio.conf.mts` cycles vim mode once per spec file -- `disable-vim-mode`, pause,
`enable-vim-mode`, pause -- which is a full `teardownVimSubsystems` and
`setupVimSubsystems`, destroying and recreating every editor extension including
the treesitter bridge. A reasonable suspect for specs that already alternate
engines.

Skipping it for `rpc-` specs measured **9/16**, against a pooled 29%. No
improvement, so it is not a contributor and the skip was reverted rather than
drop the toggle canary for nothing.

Worth noting the spread while reading any single arm in this file: with the same
code, arms have landed at 2/16, 3/16, 5/16, 8/16 and 9/16. The pooled figure is
the only one worth quoting.

### Prevention attempt: deferring the RPC reconcile does not help

`reloadFeatures()` starts the async RPC reconcile and then synchronously rebuilds
the extension slots and reconfigures CodeMirror, so ViewPlugins are destroyed and
recreated while an RPC connect or disconnect is still in flight. Deferring the
reconcile past the synchronous reload measured **8/16**, against a pooled 28/96
(29%) for the deferral baseline -- no improvement, and if anything worse
(Fisher p = 0.09). Reverted, since it changes toggle semantics for nothing.

A separate attempt to test a settle at the engine transition measured nothing:
the synthetic reproducer built for it dropped the note-switching the 3/8 version
had and came back 0/8, so there was no signal to move. Prevention experiments
have to run against `rpc-structural-nav`, which is the only workload that
reproduces at a usable rate.

### It needs fork work and RPC work alternating, which a user does not do

Building a session workload up one ingredient at a time, each 8 runs in the
container, all with a single connection unless noted:

| workload                                                     | segfault runs |
| ------------------------------------------------------------ | ------------- |
| 1,200 RPC requests, simple edits                             | 0/2 runs      |
| 40 note switches + edits, 1 connect                          | **0/8**       |
| 40 structural-motion batches (`]h`, `d]l`, `gqG`), 1 connect | **0/8**       |
| structural motions + 14 connect/disconnect cycles            | **0/8**       |
| the same, **plus fork-driven editing between RPC periods**   | **3/8**       |

Only the last one crashes, and the only thing it adds is renderer-side work
through the bundled fork -- `setupEditor` plus `vimHandleKeysSync` -- in the
window while RPC is disconnected. So the requirement is **fork activity and RPC
activity alternating in one session**, not traffic, not note switching, not
structural motions, not connect cycles, and not any of them in isolation.

That is exactly what a parity spec does and exactly what a person does not. The
specs alternate fourteen times per file because comparing the two engines is
their entire purpose. A user runs one engine or the other.

It also explains the absence of user reports: the backend is opt-in and
desktop-only, and a session that enables it and works stays on the measured-clean
side -- 320 note switches, 320 structural-motion batches and 1,200 requests, all
without a single segfault.

The risky pattern for a user is narrow: disable the backend, edit with the
bundled fork, re-enable it, and repeat. Once or twice is unlikely to hit a rate
of a few percent per alternation; a habit of toggling mid-session is what would.

### What drives the rate is RPC work, not connect cycles

Option 3 was finished and measured. The parity failure it first produced was
diagnosed rather than papered over: logging both snapshots from the unmodified
spec gave the original agreed value, `- two` at column 2, which is what the RPC
side still produced. **The fork side had moved.** The cause was the per-test
`loadSingleFileWorkspace()` in the old `beforeEach`; without it the fork leaks
editor state between cases. Restoring it per case made the restructure 14/14
green with no segfault, and two negative controls confirmed the tests still
fail: seeding an extra line fails the `before` hook, and corrupting one stored
snapshot fails exactly that test by name.

Then the campaign came back at **7/16 (44%)** -- worse than the 14-cycle
baseline it was meant to improve. The restructure had cut connect cycles from 14
to 2 while adding 14 workspace reloads _while connected_, each forcing a leaf
change and a full Neovim reseed. Removing those did not rescue it either.

Putting that beside the earlier dose-response measurements:

| cases processed              | segfault runs |
| ---------------------------- | ------------- |
| 1                            | 0/16          |
| 8                            | 4/16 (25%)    |
| 14                           | ~29%          |
| 14, restructured to 2 cycles | 7/16 (44%)    |

The earlier reading of this as cycle-dependent was wrong. It tracks the **number
of cases exercised against a live RPC connection** -- roughly 2% per case,
linear -- and the number of connect cycles is incidental. That is why 14 cases
in 2 cycles is no better than 14 cases in 14 cycles.

The consequence is worth stating plainly: **restructuring cannot fix this.**
Splitting the spec across more files does not reduce total risk either, because
the same number of cases still runs; it only spreads them over more sessions.
Per-run flakiness is proportional to RPC work, so the only real lever is the
per-case defect itself, which remains unexplained.

Option 3 is therefore rejected along with Options 1 and 2, and the deferred
shutdown stays the only measure that has moved the rate.

### Option 3 was implemented, measured worse, and reverted

The restructure works mechanically. Hoisting the 14 cases into a table, running
every fork phase in one pass and every RPC phase in the next, cuts the run from
14 connect cycles to **2** -- two rather than one because `setRpcEnabled` is
what applies `textwidth`, and 12 cases use 80 while 2 use 40.

Two things had to change for it to run at all, and both are worth knowing:

1. The RPC phase relied on **connect-time seeding**. With one connection held
   across cases, Neovim stays authoritative and still holds the previous case,
   so `nvim_win_set_cursor` failed with `Invalid cursor line: out of range`
   whenever the predecessor was shorter. Seeding the buffer explicitly with
   `nvim_buf_set_lines` fixes that.
2. Each fork case used to run immediately after `setRpcEnabled(false, tw)`,
   which reloads features. Repeating that per case inside the fork pass is free,
   since disconnecting while already disconnected is a no-op.

It reached **13 of 14 passing with no segfault**, and stopped there.
`matches operator-pending list motion edits` disagrees: `d]l` from `(0, 2)` on
`- one / \u0020\u0020continuation / - two / - three` gives the fork
`-two` with the cursor at column 1, and RPC `- two` at column 2. The two agreed
before the restructure, so one side changed and the evidence does not say which.
Adding the feature reload back to the fork pass did not move it, which rules out
the more obvious of the two explanations.

That is a genuine behavioural question -- either the RPC seed is not equivalent
to connect-time seeding, or the fork leaks state between cases that the old
per-case reconnect used to wash out -- and the second possibility would be a
pre-existing bug this spec was hiding. Either way it is not something to settle
by adjusting the expectation, so the restructure is reverted rather than shipped
at 13/14.

To resume: re-apply the restructure, then get the original agreed value for that
one case by logging both snapshots from the unmodified spec. Whichever side
moved is the one to explain.

### Pooled rates, and a correction to the arm-by-arm reading above

Sixteen-run arms against a rate near 30% have very wide intervals, and reading
differences between them -- which the sections above do repeatedly -- was a
mistake. Pooling every arm by what it actually changed:

| group                                 | runs  | rate    |
| ------------------------------------- | ----- | ------- |
| no deferral (raw baseline)            | 24/46 | 52%     |
| with deferral, any other change       | 28/96 | **29%** |
| one connect cycle instead of fourteen | 0/16  | **0%**  |

Two results survive pooling. The deferral is real: 28/96 against 24/46, Fisher
p = 0.008. And a single cycle is real: 0 of 16 against a 29% background is
p = 0.004. Everything else -- socket transport, resident process, harness-kill
removal, stubbing the `adoptedStyleSheets` churn -- lands inside the deferral
group's interval and none of it is distinguishable from any other.

That also corrects the earlier figure in this file: the deferral takes the rate
to about **29%**, not the 18% recorded from a smaller sample. One arm
(`adoptedStyleSheets` stubbed) measured 9/16, which looked alarming next to a
2/16 arm of the same code until both were seen as draws from one ~29%
distribution.

Also excluded, each on its own: `reloadFeatures()` plus the CM6 reconfiguration
that follows it, measured without RPC at 14 cycles a run -- **0/12**. So the
cycle's cost is in the RPC subsystem setup and teardown specifically, not in the
plugin's feature reload.

### Three candidate fixes, measured: two rejected, exposure is per-cycle

Each arm is 16 runs of `rpc-structural-nav` in the container, counting runs with
a fresh `dmesg` segfault.

| arm                                                           | segfault runs  |
| ------------------------------------------------------------- | -------------- |
| raw baseline, before the deferral                             | 24/46 (52%)    |
| **deferred shutdown (shipped)**                               | **2/16 (13%)** |
| deferred + no per-test harness kill                           | 3/16 (19%)     |
| Option 1: socket transport (`--listen`, no stdio pipes)       | 4/16 (25%)     |
| Option 2: resident Neovim, real reuse (`spawn=1`, zero kills) | 5/16 (31%)     |

**Option 1 is rejected.** Replacing stdio pipes with a Unix socket did not move
the rate, and it is worse in one respect: with `--listen` Neovim does not exit
when the socket closes, so a renderer crash orphans it -- two of the sixteen
runs leaked an `nvim`. `--embed` over stdio exits on channel close, which is a
property worth keeping.

**Option 2 is rejected, and it is the most informative result here.** Parking
the process on disable and adopting it on enable needed two supporting changes:
`decorations.ts` must keep the UI attached (`--embed` Neovim exits when its last
UI detaches, which is why the first attempt silently never reused anything --
`adopt=0`, verified by tracing), and an adopted session must wipe its buffers or
the parity tests fail on stale state. With those, a run is one spawn, thirteen
adoptions and zero kills. **It still crashed 5 of 16.** So the crash requires
neither spawning nor killing Neovim, and every process-lifetime theory in this
file -- including the one the shipped mitigation is built on -- is wrong about
the mechanism.

A harness confound turned up on the way. `rpc-structural-nav`'s `afterEach`
SIGKILLed every spawned Neovim from the wdio Node process, so in **every** arm
measured before this the child died externally 14 times a run regardless of what
the product did. Moving it to a suite-level sweep changed nothing (3/16), so it
was not the cause, but it does mean the earlier "never kill" and "retain" arms
never tested what they claimed to.

**Exposure is per-cycle, and that is the one lever that works:**

| cycles per run | segfault runs    |
| -------------- | ---------------- |
| 1              | **0/16**         |
| 8              | 4/16 (25%)       |
| 14             | ~19% across arms |

That fits a constant per-cycle risk of roughly 2-4%. A spec that connects once
instead of fourteen times should therefore be roughly an order of magnitude less
flaky, without touching the product. For a user, one enable/disable in a session
carries that same few-percent risk.

What a cycle still contains, after everything excluded: the plugin's own
subsystem teardown and setup, `reloadFeatures()`, and the CM6 reconfiguration
that follows. Not the process, not the transport, not the message handlers.

### The teardown bisect: what moves the rate and what does not

Every arm is `rpc-structural-nav` in the container, counting runs that produced
a fresh `dmesg` segfault. The spec does 14 connect-traffic-disconnect cycles per
run.

| arm        | change                                    | segfault runs |
| ---------- | ----------------------------------------- | ------------- |
| baseline   | none                                      | 24/46 (52%)   |
| B          | extmark + float handlers stubbed entirely | 5/8           |
| C          | buffer-line + cursor handlers stubbed     | 4/8           |
| D          | RPC reader detached before `qa!`          | 4/8           |
| G          | `qa!` sent, `'close'` not awaited         | 4/6           |
| L          | child retained alive, never killed        | 3/8           |
| F          | `SIGKILL` suppressed, `qa!` + wait kept   | 2/6           |
| H          | all child listeners removed, no wait      | 2/6           |
| I          | read pipe destroyed before exit           | 1/8           |
| E          | no `qa!`, no wait, no kill                | 0/6           |
| K          | detach, defer `SIGTERM`/`SIGKILL` by 3 s  | 0/8           |
| production | same as K, written properly               | 2/8           |

Two things to read carefully here. Stubbing our own inbound handlers -- B, C and
D -- moves nothing, so the fault is not in what we do with the data. And no
single arm eliminates it: K's 0/8 and the production code's 2/8 are the same
code, so K was partly luck, which is the standing hazard of 6-to-8 sample arms
against a 52% base rate.

Grouped, the signal is real. Arms that drop the synchronous quit-and-wait --
E, K, production and the 600 s-deferral variant -- total **7/38 (18%)** against
**24/46 (52%)** for the rest, Fisher p = 0.002. So removing it is worth roughly
a 3x reduction and is kept. It is a **mitigation, not a cure**.

The residual matters. Deferring the kill by 600 s still gave 2/8, and once
`resetState()` drops the last reference Node can GC the stdio streams and close
the pipes, so `nvim --embed` exits on channel close at an unpredictable moment
anyway. Retaining the child forever (L) still gave 3/8. So "the child dies" is
not a sufficient description of the residual path.

What is established: a renderer SIGSEGV on a corrupted V8 compressed pointer,
requiring RPC traffic plus disconnect cycling, not caused by our message
handling, and only partly attributable to how the child is shut down. The next
question is whether owning a piped child process inside an Electron **renderer**
is supportable at all, which is a question about upstream rather than about this
repository.

### The crash requires RPC, and it is the data path

The control that should have been run first. Six `vim-builtin` specs, no RPC,
two runs at a duration comparable to one `rpc-structural-nav` run:

```
run 1 -> 4, 17, 10, 51, 5, 21 passing | segfaults: 0
run 2 -> 4, 17, 10, 51, 5, 21 passing | segfaults: 0
```

108 tests per run, zero failures, **zero segfaults**, against roughly 50-70% of
RPC runs segfaulting. So the crash **requires RPC**. Obsidian itself, V8 in
general, CodeMirror, the vim fork and tree-sitter are all exonerated by this one
measurement -- they are exercised just as hard by the control.

Narrowing once more with a result already in this file: `rpc-connect-cycle` ran
432 connect/disconnect cycles across four variants and two platforms without a
single failure, and it is the RPC spec that moves almost no data. The specs that
crash are the ones with heavy msgpack traffic. So it is the **data path**, not
the connection lifecycle.

That matters because the RPC data path is the only place this plugin runs Node
code inside the renderer: `child_process` stdio streams, socket reads, and
`Uint8Array` views over pooled Node buffers, decoded partly by native
`TextDecoder`. A stale or detached view over a backing store produces exactly
the `base + garbage_u32` fault recorded above, and JavaScript alone cannot
produce it.

`msgpack-rpc.ts` reads carefully on inspection -- `concatBytes` copies,
`slice()` copies, and `DataView` is constructed with the view's own
`byteOffset`/`byteLength` -- so inspection is not enough and the next step is
measurement, not more reading.

Next bisect, in order of suspicion, each an A/B at ~3 minutes a run:

1. **msgpack decode**: copy every incoming chunk at the socket boundary before
   it reaches the decoder, so no view over a pooled Node buffer survives an
   event turn.
2. **document-sync**: the byte/UTF-16 mapping and line events.
3. **decorations/extmarks**: the redraw-time CM6 dispatch.

### The cores: a -1 used as an unsigned 32-bit offset

Two cores were extracted with `coredumpctl dump` and read in a container with
`gdb` (33 GiB each uncompressed, so delete them afterwards). Both stacks stop at
frame 0 -- `?? ()`, no unwind past it, which is what JIT frames look like
without frame pointers. The registers are the evidence:

|           | core A             | core B             |
| --------- | ------------------ | ------------------ |
| `rip`     | `0x687a279ab57`    | `0x1d70d38996d4`   |
| `rbx`     | `0x37e880000000`   | `0x87d80000000`    |
| offending | `rdx = 0xffffffff` | `rsi = 0x5b000000` |
| fault     | `0x37e97fffffff`   | `0x87ddb00000c`    |

For core A the arithmetic is exact: `0x37e880000000 + 0xffffffff =
0x37e97fffffff`. `rax` held `0xfffffffb`, which is `(uint32)(-5)`. Core B is the
same shape, `rbx + rsi + 0xc`, with a ~1.5 GiB offset.

So both crashes are **a negative number used as an unsigned 32-bit offset from a
large base**. `-1` becomes `0xffffffff` and reads ~4 GiB past the base, outside
any guard region, so it faults instead of trapping.

The base registers matter: `0x...80000000` values are cage- or
reservation-aligned, and a `0xffffffff` offset from a cage base is a **corrupted
compressed pointer** -- V8 reading a field off a garbage object. That is
engine-level corruption rather than a JavaScript logic error, which is the best
available explanation for why fourteen application-level hypotheses in this file
all died.

Where the `-1` does _not_ come from: `bridge.ts`. `PointScanner.at()` and
`advancePoint()` only ever increment row and column from 0, contain no
`indexOf`, and `translateChanges` derives `startIndex`, `oldEndIndex` and
`newEndIndex` from CodeMirror offsets that cannot go negative. Worth noting that
the earlier clamp probe covered `descendantForPosition` but **not** `tree.edit()`,
so it could not have caught a bad edit; the edit path was checked by reading it
instead.

**Electron version is refuted.** `installerVersion` was switched from `earliest`
(Chrome 120, December 2023) to `latest`: 1 of 4 runs still segfaulted, at
`0x203effffffff`, the same `base + 0xffffffff` fingerprint with a different `ip`
offset because the build differs. The pin was restored, since `earliest` is a
deliberate minimum-supported-installer policy.

The durable artefact here is the fingerprint. Any future crash showing
`fault == base + 0xffffffff` is this bug; anything else is not.

### Every _local_ run before this point tested `main.js` from 06:13

`test:e2e` was bare `wdio run` and `onPrepare()` only deletes
`workspace.json`, so **nothing built the plugin**. `main.js` was older than
`src/`, and the bundle under test was a stale production build from hours
earlier. The measurement that concluded "the `disconnectChild` fix does not help"
was therefore made against a bundle that did not contain it.

Re-measured with a fresh build: still 2 of 4, so that conclusion happens to
survive -- but it was luck, not method. `test:e2e` now runs `build:ci-test`
first.

CI was never affected: `e2e.yml` runs `build:ci-test` before `wdio` in all
three of its jobs. This was a local-reproduction trap only, which is worth
knowing when a local result and a CI result disagree -- and anyone reproducing
locally must build first, or they are testing whatever `main.js` was lying
around.

## The renderer tab crashes after going unresponsive for 30 s

The driver log says it outright:

```
chromedriver: [SEVERE]: Timed out receiving message from renderer: 30.000
webdriver: WebDriverError: unknown error: session deleted because of page crash
from tab crashed
```

The `obsidian` process count goes 3 -> 6 and never reaches 0, so the main
process is fine; it is the **renderer** that dies. No Crashpad `.dmp` is
written, and `dmesg` is not readable inside the container, though an OOM kill
was already excluded at 852 MiB peak against 8 GiB.

That is the whole chain, and it makes every earlier observation consistent:

1. the renderer main thread blocks
2. ChromeDriver gives up at its 30 s renderer timeout
3. the tab is declared crashed and the session is deleted
4. every later `executeObsidian` returns `invalid session id`

Steps 3 and 4 are what the section below describes, and they are downstream.
The single 78 s `waitRpcOff` throw was not the anomaly I dismissed it as: a
renderer blocked long enough to trip a 30 s driver timeout is exactly a single
`getRpcState()` round trip taking tens of seconds. Both readings were the same
event seen from different ends.

So the question is now specific and answerable: **what blocks the renderer main
thread for more than 30 s?** An unresolved Promise cannot do it, so something
synchronous is running. This spec exercises treesitter-backed structural
motions with WASM grammars alongside RPC, which is where to look first --
a synchronous parse or query loop is the shape that fits. The remaining
measurement is a main-thread profile or a sampling stack at the moment the
driver's 30 s timer starts, not more environment permutation.

## The RPC cluster is the WebDriver session dying

Reading the actual error instead of counting passes and failures settles it.
Three consecutive failing container runs, identical error, different call site:

```
WebDriverError: invalid session id when running "execute/sync"
  at async rpcSnapshots   (run 1)
  at async waitForRpc     (run 2)
  at async getNotices     (run 3)
```

The session is **gone**, so every later `executeObsidian` fails instantly. That
is why the count is always exactly `2 failing`: the test that first touches the
dead session, plus the `after each` hook that touches it next. The test _name_
varies only by when the death lands, which is the whole reason this looked like
six unrelated flaky specs with a rotating cast of failures.

So it is not a hang, not teardown, and not an RPC problem. Obsidian or its
renderer is dying mid-run, and everything downstream is an artefact of asking a
dead session questions.

This also corrects the section below. The 78 s `waitRpcOff` throw was one
atypical instance and I generalised from it; `did not become disconnected` did
not recur in any of the **nine** runs after it. The two `disconnectChild`
defects found along the way are real and are fixed, but they are not this
cluster: with both fixed, 3 of 5 runs still failed, against a baseline near 2
in 3.

Not yet known: why the process dies. Memory is already excluded (852 MiB peak
against 8 GiB, and the cgroup figure falls during a run), so this is not an OOM
kill. The open candidates are an Electron renderer crash under Xvfb, a
ChromeDriver-side session timeout, and a main-process crash. The next
measurement is the ChromeDriver log, the Electron exit code and `dmesg` from
inside the container, none of which have been looked at yet.

Worth noting for whoever picks this up: the failure names were available from
the first container run and I spent this phase counting `N passing / N failing`
instead of reading them. The error was one `grep` away the whole time.

## The RPC cluster is teardown, not a renderer death

Timing every step from Node — `STEP n start/ok/THREW <label> <ms>`, so a call
that starts and never finishes names itself — caught it in the act:

```
STEP 161 ok    rpc:getLines0      6ms
STEP 162 ok    rpc:getCursor0     5ms
STEP 163 ok    fork:rpcOff       22ms
STEP 164 THREW fork:waitRpcOff  78147ms
```

Every RPC request runs in 5-6 ms and `getValue`/`getCursor` in 2-4 ms right up
to the end. There is no latency creep and no gradual degradation: the failure
is abrupt, and it is `waitForRpc(false)` — waiting for the backend to report
_disconnected_ — hanging and throwing.

That explains the shape of the whole cluster. Half of these failures land in
`before each`/`after each`, which is exactly where `setRpcEnabled(false)` and
`waitForRpc(false)` run, and it is why the failing _test name_ varies from run
to run while the specs stay the same. It also fits the exit wrapper reporting a
clean `rc=0`: the child does exit correctly, just far too slowly.

The 78 s is itself evidence. `waitForRpc` has a **10 s** timeout, and
`browser.waitUntil` only checks the clock between iterations, so a 10 s budget
can overshoot to 78 s only if a single `getRpcState()` round trip blocked for
roughly 68 s. The renderer was unresponsive during teardown — which is what the
earlier "stall inside `executeObsidian`" reading was seeing, from the wrong end.

`disconnectChild` in `src/rpc/neovim-connection.ts` has two defects that fit:

1. `await this.featureBridge?.stop()` is the **first** statement, and it issues
   RPC round trips to a Neovim that is on its way out. `this.connected = false`
   is not reached until ~20 lines later, so every observer keeps seeing
   `connected === true` for however long that await takes. `waitForRpc(false)`
   is one such observer.
2. The close-Promise settles **only** via `child.once('close', ...)`. The
   `GRACEFUL_EXIT_TIMEOUT_MS` timer sends `SIGKILL` but never resolves, so if
   `close` does not arrive the await is permanent. This is the inverse of the
   `promise-owned-listener` shape the project's own ast-grep rule targets, and
   worth checking against the test harness: `neovimBinaryPath` points at
   `nvim-exit-wrapper.sh`, and unless that wrapper `exec`s, `SIGKILL` on the
   shell leaves an `nvim` grandchild holding the inherited stdio pipes open,
   which is precisely a `close` that never fires.

Not yet proven: which of the two produces the 68 s renderer block, and whether
an unresolved Promise alone can account for it (it should not — an orphaned
Promise does not block a main thread, so something synchronous is still
unexplained). Clearing `connected` before the awaits and giving the Promise a
settle path are both correct regardless, and the second is testable directly by
checking whether the wrapper `exec`s.

The wrapper mechanism is real and was fixed, and it is **not** the cause. The
wrapper ran `"$REAL_NVIM" "$@"` without `exec`, so the tree really was
Obsidian -> bash -> nvim with the shell as the plugin's `child`, and the
grandchild really would hold the pipes open past a `SIGKILL`. Converting it to
`exec` did not move the failure rate: **2 of 4 runs still failed**, against a
baseline of roughly 5 in 7. Those two rates are indistinguishable at this
sample size, and two clean runs is precisely the evidence that made
`--privileged` look like an answer an hour earlier.

Neither of those two failures carried `did not become disconnected`, so at
least one failure mode exists that is not the teardown hang. The 78 s hang was
observed once, is real, and is not the whole cluster.

What stands regardless of flakiness: the `exec` fix, because the plugin should
own the real process rather than a shell that swallows its signals; and the two
`disconnectChild` defects above, because clearing `connected` after an awaited
call that can hang, and a Promise whose only settle path is an event that may
never arrive, are both wrong on their own terms.

Reproducing: wrap each step of `forkSnapshots`/`rpcSnapshots` in a `timed()`
helper that logs from Node, run the container loop, and read the last STEP line.

## No container setting explains it, and privileged was luck

Seven axes, one run each unless noted, against a baseline that fails roughly
seven times in ten:

| Axis                                          | Result                   |
| --------------------------------------------- | ------------------------ |
| baseline `--cpus=4 --memory=8g --shm-size=2g` | fail                     |
| `--security-opt seccomp=unconfined`           | fail                     |
| `--ipc=host`                                  | fail                     |
| `--privileged`                                | 1 clean, then **2 fail** |
| `--cap-add=SYS_ADMIN`                         | fail                     |
| `--security-opt apparmor=unconfined`          | fail                     |
| no cpu or memory limits                       | fail                     |

The single clean `--privileged` run looked like the answer and was not. At a
baseline failure rate near 70%, one clean run is a coin toss; the two
confirmation runs settled it. The same mistake as concluding "memory" from one
4 GiB failure and one 8 GiB pass an hour earlier — a reminder that the
confirmation run is not optional when the base rate is this high.

So the container is not reproducing the bug _through_ any setting. It is
reproducing it because it is a different and slower execution environment, and
the bug is timing-sensitive. Capabilities, seccomp, apparmor, IPC namespace,
`/dev/shm` and cgroup limits are all eliminated.

What the container gives is the thing that was missing for the whole
investigation: a five-minute reproduction at roughly 70%. The mechanism is
still unidentified, and the next step is to use that loop for timing
instrumentation inside a failing run rather than for more environment
permutations, which have now been exhausted.

## Reproduced locally in a resource-constrained container

Running the real spec inside the CI image with `--cpus=2 --memory=4g`
reproduces it on demand: two runs, both 10 passing and 2 failing, both with
`invalid session id` and one naming
`matches navigation across nested list items` and the `"after each"` hook.

```
docker run --rm --cpus=2 --memory=4g --shm-size=2g \
  -v "$PWD:/work" -w /work -e CI=true \
  --entrypoint bash ghcr.io/saberzero1/motions/e2e-runner:latest -lc '
    Xvfb :77 -screen 0 1280x1024x24 & sleep 3; export DISPLAY=:77
    herbstluftwm & sleep 1
    npx wdio run ./wdio.conf.mts --spec test/specs/rpc-structural-nav.e2e.ts'
```

The image's own entrypoint fails to start Xvfb on `:99` under a bind mount, so
the display is started by hand on `:77`.

It reproduces in the container, not because of any particular limit: 5 of 7
container runs failed against roughly one in six on the host. The container is
the trigger, and it is also what CI uses, which is the point.

Eliminated by measurement while looking for the limit that mattered:

| Candidate                 | Measurement                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| total memory              | peaked at **852 MiB** against an 8 GiB cap, and 8 GiB runs fail too                                             |
| memory growth             | cgroup `memory.current` _declines_ over a run, 682 → 575 MiB                                                    |
| `/dev/shm`                | fails identically at `--shm-size=256m` and `8g`                                                                 |
| CPU count                 | fails at both 2 and 4 cores; the one clean container run was 2 cores                                            |
| process or handle buildup | `obsidian` holds at 6 processes from early to late in a run that failed; `esbuild` at 2; zombies never exceed 1 |

The buildup hypothesis was worth testing and is **not supported**. An earlier
reading of "obsidian 3 → 10" came from a sampler whose `pgrep -c ... || echo 0`
split each record across two lines; with that fixed the count is flat, and the
3 was startup ramp rather than a leak.

So the mechanism is still unidentified — but the loop is now five minutes
instead of forty-five, which is the thing that was missing all along.

## Bisect of the RPC cycle against its surroundings

Each variant is six cold Linux replicas at twelve cycles, so 72 cycles per row,
on the platform where the full spec fails about four runs in six.

| Variant            | Adds                                                | Result                                      |
| ------------------ | --------------------------------------------------- | ------------------------------------------- |
| `bare`             | nothing                                             | 72/72 settled                               |
| `workspace`        | `loadSingleFileWorkspace` per cycle                 | 72/72 settled                               |
| `workspace+source` | …plus `useSourceProperties`                         | 72/72 settled (Linux), 6/6 replicas (macOS) |
| `editor`           | …plus `setupEditor`, cursor moves, `getEditorValue` | 72/72 both platforms                        |

About 432 cycles across four variants and both platforms without a single
failure. Decomposition is exhausted: no element of the connect/disconnect path,
the workspace load, source properties, or the editor work reproduces the
failure, on either platform, and the `editor` variant calls the very function
the stall lands inside.

So the failure needs something none of the variants has: most likely the volume
and interleaving of the real spec — fourteen tests, dozens of RPC round trips,
repeated connect and disconnect under sustained load — rather than any single
element of it. Four clean decompositions are themselves the finding.

The next step is therefore to stop decomposing and stress the real spec, which
is the only configuration known to fail and already carries the Node-side
instrumentation: `/proc` state, the wrapper's exit status, and the per-test log
delta, none of which the browser-side diagnostic can reach once the session
dies.

The same variant now runs on macOS with nothing else changed, since a clean
Linux bisect says nothing about the platform where most recent failures land.

Note the platform split: the bisect runs on Linux, while recent failures have
been macOS RPC hooks — `"after each" hook for Neovim RPC connection lifecycle`
and `… key delegation` on `d09d53e`. The cluster spans both, so a Linux bisect
that stays clean does not exonerate the macOS side; if `workspace+source` also
settles, the next variant should carry the editor work, and a macOS dispatch is
worth running alongside it.

## The RPC failures are concentrated in setup and teardown

Across seven runs, every RPC-related failure:

| Failure                                                  | Count | Kind |
| -------------------------------------------------------- | ----- | ---- |
| `"after each"` — structural navigation                   | 3     | hook |
| `"before each"` — structural navigation                  | 1     | hook |
| `"after each"` — text synchronisation                    | 1     | hook |
| `"after each"` — key delegation                          | 1     | hook |
| `matches backward operator-pending heading motion edits` | 2     | test |
| `keeps source-rendered frontmatter fully navigable`      | 1     | test |
| `uses the host jumplist for two cross-note older jumps`  | 2     | test |

**Half are hooks, across three different specs**, and the failing tests vary
between runs rather than repeating. So no consistent subset of tests is at
fault; what the hooks share is `setRpcEnabled` and `waitForRpc` — starting and
stopping Neovim.

**The cycle alone is exonerated.** Six cold Linux replicas ran twelve
connect/disconnect cycles each — 72 in total, on the platform where the full
spec fails about four runs in six — and every one settled:

    {"cycles":"UD UD UD UD UD UD UD UD UD UD UD UD","completed":12,"settled":true}

repeated for all six replicas. If the cycle carried the failure probability,
72 of them would not come back clean.

So starting and stopping Neovim is not fragile in itself. The cause is an
interaction with what the real hooks put around it:
`loadSingleFileWorkspace`, `useSourceProperties`, and editor work between
cycles.

That is a bisect rather than a search. Add one element back at a time — the
workspace load first, since it is the heaviest and touches the same editor the
stall appears in — and the first variant that fails names the interaction.

## Neovim is not crashing, and the exit may be incidental

The wrapper answered on its first failing run:

    RPCTASKS {"after":"matches navigation across nested list items",
              "tasks":null,"nvim":[],"nvimLog":"",
              "nvimExit":"21:30:33 pid=3486 rc=0"}

`rc=0`. Not 139 for SIGSEGV, not 137 for a kill, not an error code. **Neovim
is not crashing**, so a crash in the companion Lua, a fatal signal and the OOM
killer are all excluded.

That also undermines the causal story recorded earlier. `rc=0` is exactly what
a healthy disconnect produces — passing runs record the same — and
`beforeEach` calls `setRpcEnabled(false)`, which shuts Neovim down on purpose.
So the earlier claim that the child exits and the renderer hang follows from it
is **not supported**: a clean exit at a teardown boundary is indistinguishable
from the teardown itself, and `dead:no-proc` was consistent with normal
shutdown all along.

What remains is the original question in its earlier form: why does the
renderer stop answering `execute/sync`? Known about it:

- no completed long task, which is consistent with being stuck inside one
- a trivial document, 13 to 32 characters
- no RPC request pending, since `getEditorValue` is CM6 only
- Neovim exiting cleanly rather than dying

The next measurement should establish whether the exit precedes the stall or
follows it, because the current data cannot order them. A timestamp on the
renderer's last successful call, compared against the wrapper's exit line,
would do it.

## What identifying the RPC cause still needs

The remaining question is why the Neovim child exits, and every channel we
have dies with the WebDriver session:

| Channel                  | Result                                                  |
| ------------------------ | ------------------------------------------------------- |
| browser diagnostic       | `unavailable: invalid session id`                       |
| Node `/proc`             | `dead:no-proc` — gone, not why                          |
| `NVIM_LOG_FILE`          | empty; Neovim writes it only for some levels            |
| the plugin's exit Notice | computed correctly, unreadable once the session is gone |

`neovimBinaryPath` is a plugin setting, so pointing it at a wrapper that
records the child's exit status needs no product change and survives the
session. `test/fixtures/nvim-exit-wrapper.sh` does that, and standalone it
passes arguments through and records the status.

The first wiring attempt failed with 2 failing, 0 passing and an empty exit
log. The PATH theory offered for it was wrong; capturing the error named the
real cause in one run:

    javascript error: resolvePath is not defined

`resolvePath` had been called inside the `executeObsidian` callback, which
runs in the browser where `node:path` does not exist. The path is now resolved
in Node and passed as an argument.

It works: the spec stays at 14 passing and the exit log fills with `rc=0`
entries, so the wrapper is genuinely running rather than silently absent. A
healthy disconnect is a clean exit; a signalled child reads as 128+signal, so
a crash and an orderly quit are distinguishable from that one number.

Confirming the instrument ran, rather than inferring it from the absence of
failures, is what separated this attempt from the last one.

## After the heading fix

`83bd881` carried the fix and failed three jobs; `871639a` on top of it was
110/110 green. **No heading motion failed in either** — not `]3`, `]h` or
`[h` — which is the first evidence the fix holds in CI rather than only under
the forced empty tree.

The three failures were all known shapes, plus one new entry:

- Linux `"after each"` and `matches backward operator-pending heading motion
edits`, the latter reporting `unavailable: invalid session id` — the
  child-exit cluster, where the browser diagnostic cannot run by definition.
- Windows `uses the host jumplist for two cross-note older jumps` with
  `cmFocused` true and a 19-character document. That is the second such
  sample, so focus is excluded for it on repeated measurement rather than one
  observation.
- macOS `keeps source-rendered frontmatter fully navigable`, an RPC spec.
- Linux `vim.plugins.add fetches mini.comment from GitHub`, which fetches over
  the network during the test. Its diagnostic is unremarkable — focused
  window, no editor open — so a fetch failure is the likely shape rather than
  anything in the editor, and it belongs with the installer failures as
  infrastructure rather than with the rest.

## The recurring shape: a guard that checks something adjacent

Three defects this session share one form — a check that answers a question
_near_ the one the code depends on:

| Where                              | Checked                            | Needed                                |
| ---------------------------------- | ---------------------------------- | ------------------------------------- |
| `waitUntilFoldable`                | `foldable()`, a state query        | the region rendered as editable lines |
| `isTreeAvailable` in `headings.ts` | a tree exists                      | the tree yields headings              |
| `callout fold placeholder…`        | an `if` guard around the assertion | the assertion running at all          |

Each passed while the thing it protected was broken, which is why all three
survived so long.

**Audited the treesitter consumers for the same shape.** Only headings had it.
The other four decide on the _result_ rather than the predicate and are
correct as written:

| File                         | Shape                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `text-objects/code-block.ts` | `treesitterCodeBlock(...) ?? findContainingBlock(...)` |
| `text-objects/blockquote.ts` | `treesitterBlockquoteRange(...) ?? …`                  |
| `text-objects/delimiter.ts`  | `if (tsRange) return …;` then the regex path           |
| `snippets/context.ts`        | `if (tsResult) return tsResult;` then the regex path   |

A wider scan for readiness-style predicates gating behaviour found only
`isEnabled() || isInsertMode()` in `snippets/tab-expand.ts`, which is a
feature gate rather than a fallback decision.

So the product side is clean apart from the one fixed. The shape recurs mostly
in **test** code, where a wait or a guard stands in for the real
precondition — worth suspecting first whenever a test passes in a state that
should have broken it.

## `]3`: resolved, and it was every heading motion

`isTreeAvailable(view)` answers whether a tree exists, not whether it yields
headings. `getAllNodesOfType` returns `[]` for a root that is absent, stale or
already freed, so `treesitterHeadingMotion` returned the cursor unmoved — and
the regex fallback never ran, because the choice had already been made by
`isTreeAvailable`.

The same shape as `waitUntilFoldable`: a guard checking something adjacent to
what the code actually needs.

Negative control, forcing the treesitter path to yield zero headings:

|                                  | result               |
| -------------------------------- | -------------------- |
| empty tree, with the fallback    | 16 passing           |
| empty tree, without it (pre-fix) | 8 passing, 8 failing |

The failures were `]h`, `[h`, `]h with count` and the level-specific motions,
so the defect was never specific to `]3` — every heading motion fails while
the tree is unavailable, and `]3` was whichever test ran at the wrong moment.
That is also why it looked intermittent and crossed platforms.

User-visible: open a note and press `]h` before the parse settles.

## The global diagnostic classified two entries on its first run

`203ba65` is the commit that added it, and its four failing jobs were nearly
discarded as superseded. Two carried the payload:

    ]3 should jump to next H3
      cmFocused true, docHasFocus true, docLength 25,
      no callout widget, no cursor canvases

    uses the host jumplist for two cross-note older jumps
      cmFocused true, docHasFocus true, docLength 19

**Focus is excluded for both.** They failed with the editor focused and the
document correct, so the cause behind the fold and canvas clusters does not
apply.

For `]3` that settles the classification. The editor is focused, the document
is the expected 25 characters, and the motion still does not move — already
known not to be key delivery, since `viaHandleKey` leaves the cursor at line 0
as well. It is a behavioural defect, and an ordinary one to hit: open a note
and press `]3`.

The other two failing jobs were the macOS RPC key-delegation hook, which
reports nothing because the session is gone, and a Windows **Install pinned
Neovim** step, which never ran a test at all.

So one run classified two entries, confirmed a third as the RPC shape, and
contained one failure that was not a test failure — none of which needed a
round trip to interrogate.

## First eliminations from the forced matrix

`d5ab229` came back 110/110 green, so it offered nothing to diagnose. The
forced conditions do not need a failure to be useful.

**Focus is excluded for `which-key shows after space press` and `a config
reload closes an open picker instead of leaking it`.** Blurring the active
element before the suite left both passing, 12 and 10. They also sit at
`activeEl BODY` with `cm-focused` false in normal operation, because neither
puts a cursor in an editor, so they are already unfocused when they pass.

That is two entries and one condition closed in a single local run, with no
CI involved. Eliminations are permanent: these two never need testing against
focus again, whatever else they turn out to be.

Remaining for them: cold start, and whatever is not yet on the list. Several
of the other unidentified entries live in RPC specs, where the child-exit
cause is the more likely explanation than any of these.

## Identifying the rest without waiting for CI to fail

Three failure conditions are now known, and each can be applied deliberately
instead of sampled:

| Condition          | How to force it                         |
| ------------------ | --------------------------------------- |
| editor not focused | blur the active element                 |
| cold start         | one iteration per job, several replicas |
| Neovim child gone  | kill the tracked pid mid-test           |

The first is demonstrated. Blurring `document.activeElement` put the callout
back into `.cm-embed-block.cm-callout` immediately, locally, on the first
attempt:

    focusedBefore True  widgetBefore False
    focusedAfter  True  widgetAfter  True

Note `document.hasFocus()` stayed true throughout. The discriminator is
CodeMirror focus rather than window focus; the window mattered only as a
precondition for it, and blurring the element reaches the same state directly.
That also makes the condition reproducible on a developer machine, which the
window-level version was not.

So the remaining entries do not need CI to fail by chance. Run each suspect
spec under each forced condition: whatever fails is identified, and whatever
survives all three is genuinely something else and can be separated from the
pile. That converts an open-ended wait into a finite matrix of
specs x conditions.

## Do the entries share a cause?

Two structural factors were checked and neither discriminates:

- **Position in the spec file.** Spread evenly (4/8, 8/8, 4/7, 11/16, 2/2,
  11/29, 10/14, 5/14, 1/1, 2/12, 7/10, 24/29), so this is not per-spec setup
  hitting the first tests.
- **Synchronisation style.** `zc on callout folds it` has seven `browser.pause`
  calls and four `waitUntil`s and fails; `which-key`, the operator-pending pair
  and the jumplist entry have none of either and fail too.

What does partition cleanly is the subsystem each one waits on, and it
correlates with platform:

| Cluster         | Entries                                        | Asserts on                                  | Platform         |
| --------------- | ---------------------------------------------- | ------------------------------------------- | ---------------- |
| Rendering/paint | fold pair, animated cursor pair                | CM6 decorations, canvas pixels              | all macOS        |
| RPC lifecycle   | structural-nav pair, text-objects, bridge pair | cross-process parity; two are hook failures | Linux-dominant   |
| UI lifecycle    | which-key, picker leak, pane focus             | transient overlay, modal, focus             | Windows-dominant |

Every entry asserts on state an asynchronous subsystem must produce in
reaction to an event, never on synchronous in-memory state. That is necessary
but not sufficient — most passing e2e tests do the same.

The clustering argues against a single root cause. Treat the three groups as
three investigations, and force each at the conditions its own cluster runs
under.

## Two runs of one commit share no failures

`2b6bc75` was run twice with no code change between them:

| Run A                                                                   | Run B          |
| ----------------------------------------------------------------------- | -------------- |
| `"after each" hook — RPC structural navigation` (Linux)                 | —              |
| `matches backward operator-pending heading motion edits` (Linux)        | —              |
| `zc on callout folds it` (macOS)                                        | —              |
| `editor:unfold-all clears all folds including custom` (macOS)           | —              |
| `a config reload closes an open picker instead of leaking it` (Windows) | —              |
| `uses the host jumplist for two cross-note older jumps`                 | Windows, Linux | 2   | **Focus excluded**: failed with `cmFocused` true and a correct 19-char document. |

The sets are disjoint. Whatever selects the failures on a given run, it is not
the commit, so a single green run says nothing and a single red one identifies
only which test drew the short straw that time.

Measured across the five runs containing `34168dd`: the fold pair failed in
three and the RPC structural-nav pair in three, both matching their pre-fix
rates. That is the basis for saying the toggle fix did not touch them.

## What each diagnostic can and cannot see

`NVIM_LOG_FILE` is one path per runner, so it is isolated across shards but
shared by every test inside a job, and this spec starts a fresh Neovim per
test. Reading the tail would therefore attribute an earlier test's bytes to
the failure; `afterEach` records the file offset at the start of each test and
reads only the delta.

It may still yield nothing. A local reproduction with the variable set left
the file at zero bytes, because Neovim writes that log only for some levels,
so a crash need not appear in it at all.

The plugin already derives the exit reason itself: `handleClose` formats the
code or signal into a Notice. The global `afterTest` diagnostic reads visible
Notices for that reason.

But the browser-side diagnostic cannot run at all when the session has died,
which is exactly the RPC failure mode: it reports `unavailable` and nothing
else. The division is therefore:

| Failure shape                       | What sees it                                          |
| ----------------------------------- | ----------------------------------------------------- |
| session survives (fold, canvas, UI) | `afterTest` FAILDIAG, including Notices               |
| session dies (RPC)                  | Node-side `RPCTASKS`: `/proc` state and the log delta |

Neither alone covers both, which is why both exist.

## A red job is not always a failing test

Run `d162ff1` showed three failing macOS jobs. Two of them failed at
**Install pinned Neovim**, after 0 and 1 minutes, before any test ran; only
the third reached the suite. Reading the count as three test failures
overstates the problem by a factor of three.

The failure summary runs after wdio, so a job that dies in setup produces a
red square with no summary at all, which looks the same at a glance as a test
failure that reported nothing. Check the failing **step** before the failing
test: `.steps[] | select(.conclusion=="failure") | .name`, or simply the job
duration, since a setup failure is over in about a minute.

Worth adding to the reporting: name the failing step in the summary, so
installer and network failures are separable from test failures without
opening the job.

## Shard numbers do not identify specs

`e2e (macos-latest, shard 3)` reported `cursor follows cursor movement`, but
that test is defined in `animated-cursor.e2e.ts`, which the same round-robin
places in shard 1; shard 3 holds `animated-cursor-scroll.e2e.ts`, which does
not define it. Recomputing the discover job's distribution locally therefore
does **not** reliably reproduce the mapping a given run used.

Read the failing test name from the job log or the step summary. Do not infer
the spec from the shard index, and do not infer a root cause from the spec you
think the shard contains — that is how the #181 attribution above was made.

## Fold providers lost by the vim-mode toggle

Refuted first, so they are not re-tested:

| Hypothesis                       | Measurement                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Key delivery                     | `viaCommand: true, foldedAfterCommand: false` — folding fails through Obsidian's own `editor:toggle-fold` too |
| Degenerate provider range        | `range {from:39,to:88}`, `degenerate: false`                                                                  |
| Viewport too small to parse      | `viewport {from:0,to:106}` over a 106-character document, `viewportCoversLine: true`                          |
| Fold applied but not detected    | `foldedRanges: []`, `placeholders: 0`                                                                         |
| CM6 folding unavailable on macOS | `directFoldEffect: "stuck"` on all three platforms                                                            |
| Obsidian version                 | 1.13.7 on macOS and Linux alike                                                                               |
| Window size                      | 8/8 folds at 1024x676 (macOS CI), 1274x984 (Linux CI), 2538x1380                                              |
| Runner slowness                  | 40/40 folds at CPU throttle 1x, 4x, 8x, 16x, 32x                                                              |

Forced by replaying what `wdio.conf.mts` does before **every** spec — disable
vim, pause, enable vim, pause:

```
pause 800ms -> 6/6 folded (FFFFFF)
pause 200ms -> 3/6 folded (.F.F.F)  foldableMisses: 3
pause  50ms -> 3/6 folded (.F.F.F)  foldableMisses: 3
pause   0ms -> 3/6 folded (.F.F.F)  foldableMisses: 3
```

`foldableMisses` equals the failure count exactly: when it fails,
`foldable()` returns null, so `zc` correctly folds nothing. Isolating the
toggle from the editing:

```
baselineFoldable: true -> afterEachCycle: "FFFFFFFF" -> afterSettle3s: false
```

Folding does not recover. A user who toggles vim mode loses folding until
Obsidian reloads.

### Mechanism, as far as it is established

```
disable0 -> vimEnabled false
enable0  -> false            <- fails when it follows a real disable
settled0 -> false, foldable false
disable1 -> false (no-op)
enable1  -> true,  foldable true   <- succeeds when it follows a no-op
```

`enableVim` fails only when it follows a _real_ disable, so `disableVim()`
resolves before its teardown has finished: there is un-awaited async work
continuing past the returned promise, and the enable races it.

Two fixes were attempted and **both proven insufficient**, so neither shipped:

1. Serialising toggles through a promise chain — `FFFFFFFF`, unchanged.
   Serialising on a promise that settles too early cannot help.
2. Deferring the `settings.vimEnabled` check out of the command callbacks —
   `FFFFFFFF`, unchanged. It does fix a real secondary defect
   (`enable-vim-mode` reads the flag synchronously, so with a disable pending
   the enable was never queued at all), but not this.

### The toggle defect is real but is not this cause

`34168dd` fixed a genuine, user-facing bug: a rapid disable/enable left Vim
off and every extension-slot feature unregistered until Obsidian reloaded.
Forced deterministically before the fix, `TTTTTTTT` after it.

It did **not** fix the fold failures. `zc on callout folds it` and
`editor:unfold-all` failed again in `953c8e6` and `4b688c6`, both of which
contain the fix, at roughly the pre-fix rate.

The error was an inference, not a measurement. The forced reproduction used a
**0 ms** gap between disable and enable; at the **800 ms** gap `wdio.conf.mts`
actually uses, the _unfixed_ code folded 6/6. Claiming CI was affected
required assuming a slow macOS runner makes 800 ms behave like 0 ms, which
was never measured and is now refuted.

The fold cause is therefore still unknown, and this is the eleventh refuted
hypothesis for it. Anything proposed next must be forced at the gap CI
actually uses.

### Toggle fix detail (`34168dd`)

Both `disableVim` and `enableVim` cleared `toggleInProgress` from a 500 ms
timer armed in `finally`, so the returned promise resolved while the flag was
still set. The opposite toggle, arriving inside that window, hit its own guard
and was discarded with nothing to retry it.

Three changes were needed, and each was individually insufficient:

1. **Await the cooldown** before clearing the flag, so the promise reflects
   completion. The chain alone still resolved into the window.
2. **Serialise toggles** through a promise chain, so the next starts after the
   previous finishes.
3. **Defer the `settings.vimEnabled` check** out of the command callbacks.
   Reading it synchronously made `enable-vim-mode` skip queueing a toggle whose
   predecessor had not yet updated the flag, so the guard was never reached.

The probe now reports `afterEachCycle: "TTTTTTTT"` with `vimEnabled: true`.

`vim-toggle.e2e.ts`'s `rapid toggle is debounced` asserted `vimEnabled` false
after a rapid disable/enable — the dropped request, encoded as intent. It now
asserts the state that was asked for. This is a deliberate behaviour change:
a rapid double toggle applies both halves instead of swallowing the second. If
the debounce was guarding against real thrash, the better design is coalescing
(record the desired end state, apply once) rather than applying both.

### Every extension-slot feature was exposed

`setupVimSubsystems()` nests the per-feature slots inside the one the toggle
emptied — `animatedCursorSlot` (`src/main.ts:2831`), `undoTreeSlot` (:2746)
and the three snippet slots (:2785-2787). A dropped enable therefore took all
of them down together, not folding alone.

That makes one mechanism a candidate for several entries above, including
both animated-cursor entries, whose CI signature is a canvas that never
paints. **Not yet confirmed by measurement.** Two probe attempts failed on their own
preconditions rather than on the subject:

1. `setPluginSetting` stores the value without reloading features, giving
   `canvases: 0` at baseline. Use `setPluginSettingAndReload`.
2. With that fixed, `canvases: 1` but `painted: false` _at baseline_, before
   any toggling — the canvas is sampled once after 500 ms, while the real
   assertion polls up to 5.4 s (`pollPaintedCursor`). A single sample is too
   early to mean anything.

A valid probe must reuse the spec's own polling helper rather than a
point-in-time read. Until then this remains a source-level observation.

### Why this may not be only about folding

`wdio.conf.mts` cycles vim mode before every spec, and `AGENTS.md` records
that `animatedCursor`, `enableSnippets`, `snippetTriggerMode` and
`enableUndoTree` all shipped broken for want of a runtime slot. Any
extension-slot feature is exposed to the same teardown race, so this one cause
may account for several macOS entries above. Test them against this lever
before investigating them separately — `34168dd` may already have cleared
some of them, which the next CI run will show.

## The Windows Neovim install step: a parse bug, not a flaky install

Not a test, but it fails the setup step of whole Windows shards, so it belongs
here — and it is the case that best illustrates rule 1. The message refutes
itself:

```
Neovim API level 14 log: "/tmp/nvim-debug.log" not accessible, logging to:
"C:\\Users\\runneradmin\\AppData\\Local\\nvim-data\\nvim.log" is below
required level 12
```

It names API level **14** and rejects it for being below **12**. The level was
never the problem. The captured string was.

### Root cause: stderr merged into the value

The probe captured
`… -c 'lua io.write(vim.version().api_level)' -c 'qa' 2>&1`. Headless Neovim
writes **every** message to stderr: `msg_puts_printf` in `src/nvim/message.c`
ends at `fprintf(stderr, …)` for everything except the `info_message` branch
that `--version` and `--help` take. Any warning therefore lands inside the
value that `^\d+$` then rejects.

### Which warning, and why Windows only

`.github/workflows/e2e.yml` sets `NVIM_LOG_FILE: /tmp/nvim-debug.log` at the
top level, for every job. Windows Neovim cannot create that path, so
`log_path_init` in `src/nvim/log.c` falls back to the state directory and
exports `__NVIM_LOG_FILE_WANT`; on `VimEnter`,
`runtime/lua/vim/_core/log.lua:check_log_file` turns that into
`log: %q not accessible, logging to: %q`. Linux and macOS can write
`/tmp/nvim-debug.log`, so neither ever produced it.

### Why it looked intermittent

`check_log_file` does not notify directly — it calls `vim.defer_fn(…, 100)`.
The probe quits at `-c 'qa'`, normally long before that timer fires, so only a
runner slow enough to still be alive at 100 ms sees the warning. That is the
entire race. Nothing in the product is nondeterministic.

### Forced failure

Neovim 0.12.5 from the official release tarball, `NVIM_LOG_FILE` pointed at a
directory so the fallback triggers, and the quit deferred past the timer:

```
$ … --clean --headless -u NONE -c 'lua io.write(vim.version().api_level)' \
      -c 'lua vim.defer_fn(function() vim.cmd("qa") end, 400)'
STDOUT=[14]
STDERR=[log: "/tmp" not accessible, logging to: "…/nvim/nvim.log"]
```

Both capture forms against that command, in real `pwsh`:

```
OLD (2>&1)       : THROW -> Neovim API level 14
log: "/tmp" not accessible, logging to: "…" is below required level 12
NEW (stdout only): PASS  -> Neovim API level 14 satisfies required level 12
```

The fix is proven by the second line, per rule 4. An empty stdout — Neovim
genuinely broken — still throws, so the floor check is not weakened.

### Why not a retry

The run that loses the 100 ms race fails deterministically, so a three-attempt
loop turns one failure into three, and it would hide a real API-floor
violation behind the same retry. The `EPERM` retry in the same workflow is a
different thing: that one is a genuine NTFS file-locking collision a later
attempt can win.

### Still open: Windows RPC diagnostics are blind

`NVIM_LOG_FILE: /tmp/nvim-debug.log` remains unusable on Windows, so Neovim
logs to `%LOCALAPPDATA%\nvim-data\nvim.log` there and anything reading
`$NVIM_LOG_FILE` finds nothing. `nvimLogPath()` in
`rpc-structural-nav.e2e.ts` falls through to its two POSIX candidates and
returns `undefined`, so it degrades to a size of 0 rather than failing — which
is why this never surfaced as a red test. Any Windows entry above that was
diagnosed with "the Neovim log was empty" was reading nothing. Fixing it means
a per-OS path in the workflow; this change does not touch it.
