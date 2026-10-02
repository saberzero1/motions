# Negative controls — treesitter surface gate (defect A3)

Plan B Step 3. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers `test/specs/table-surface-gate.e2e.ts`,
`test/unit/util/surface-gate.test.ts`, and the gate additions to
`test/unit/fold/bridge-metadata.test.ts`.

Baselines with the implementation intact: e2e **2 passing**, `surface-gate`
unit **5 passed**, `bridge-metadata` unit **8 passed** (was 5 before this
step).

This gate has failed three times. Controls 5 and 6 are the two that caught
failures the cell-side assertions could not see, and control 7 is the one that
caught a flaw in a _test fake_ rather than in the product.

## Control 1 — the branch itself, unit (`bridge-metadata`)

**Sabotage** in `src/treesitter/bridge.ts`, never gating:

```ts
if (false && classifySurface(update.view) === 'table-cell') return; // SABOTAGE
```

`2 failed | 4 passed` — `allocates nothing for a table cell surface …`
(`expected "vi.fn()" to not be called at all, but actually been called 1
times`) and `ignores updates on a gated-out surface …` (`… called 2 times`).

## Control 2 — the branch over-applied, unit (`bridge-metadata`)

**Sabotage**, gating every surface:

```ts
if (true || classifySurface(update.view) === 'table-cell') return; // SABOTAGE
```

`5 failed | 1 passed`. Four pre-existing tests fail alongside the new parent
control (`expected "vi.fn()" to be called 1 times, but got 0 times`). This is
the shape both earlier attempts shipped — the extension reaching nothing at
all — and it is detected here.

## Control 3 — selector drift (`surface-gate`)

**Sabotage** in `src/util/surface-gate.ts`:

```ts
export const TABLE_CELL_SELECTOR = '.cm-table-widget-renamed'; // SABOTAGE
```

`1 failed | 4 passed` — `pins the selector the production guards already use`
(`expected '.cm-table-widget-renamed' to be '.cm-table-widget'`). Three
production guards hard-code this string, so drift here silently stops the gate
without failing anything else.

## Control 4 — classifier stubbed out (`surface-gate`)

**Sabotage**, returning the default without consulting the table:

```ts
export function classifySurfaceBy(matches) {
    return 'document'; // SABOTAGE
}
```

`3 failed | 2 passed` — `reports a table cell when the widget wrapper is an
ancestor` (`expected 'document' to be 'table-cell'`) and `asks only for
selectors it means to act on` (`expected [] to strictly equal [
'.cm-table-widget' ]`).

## Control 5 — e2e, the gate removed: does it change the real product?

The decisive measurement. A passing `cell.hasTree === false` proves nothing
unless the pre-gate value was `true`.

**Sabotage**: control 1's, rebuilt with `npm run build:ci-test` and run against
a real Obsidian 1.13.7.

`1 passing | 1 failing` — `withholds the parser from a table cell …` at the
`cell.hasTree` assertion, `Expected: false / Received: true`.

So the bridge really was allocating a WASM parser per table cell before this
step, and the e2e detects it.

## Control 6 — e2e, the gate over-applied: the parent control

**Sabotage**: control 2's, rebuilt and re-run.

`2 failing` — **both** tests, each at its `parent.hasTree` assertion
(`Expected: true / Received: false`), at spec lines 97 and 125.

This is the reading that the two earlier `appendConfig` attempts never had.
Both of them reported their cell-side assertions as passing while the
extension was installed nowhere at all. Do not remove the parent assertions.

## Control 7 — the latch, and a fake that was too cooperative

**Sabotage** in `src/treesitter/bridge.ts`, deciding on the first update
whether or not the view is in the document:

```ts
// if (!update.view.dom.isConnected) return;                        // SABOTAGE
```

First run: `1 failed | 7 passed` — only `gives a detached document surface its
bridge once it connects`. The cell test **survived**, which was wrong.

The cause was the test fake, not the product: its `closest` matched the
selector regardless of `isConnected`, so a cell classified correctly even
while detached. Real DOM does not behave that way — a detached editor has no
ancestors, measured at `isConnected: false`, `widgetAncestor: false` for every
cell editor Obsidian constructs. The fake now answers `closest` only while
connected.

Re-run after fixing the fake: `2 failed | 6 passed` — both latch tests, with
`expected "vi.fn()" to not be called at all, but actually been called 1 times`
on the cell. The cell test now reproduces the defect it describes.

## Measurement behind the latch

Recorded because it overturned the step's first implementation, which
classified in the `ViewPlugin` create function and silently gated nothing.
Instrumented `classifySurface` and read every call during a real session:

| construction         | `isConnected` | `widgetAncestor` | doc                                           | surface read   |
| -------------------- | ------------- | ---------------- | --------------------------------------------- | -------------- |
| vault note           | false         | false            | `---\ntest: test\n---\nThis is your new _vau` | `document`     |
| main editor          | true          | false            | `# Heading\n\nBody text.`                     | `document`     |
| cell editor          | false         | false            | `Name`                                        | **`document`** |
| cell editor          | false         | false            | `aa`                                          | **`document`** |
| cell editor          | false         | false            | `aa`                                          | **`document`** |
| main editor          | true          | false            | `# Heading\n\n\| Name \| Value \|…`           | `document`     |
| accessor read, later | true          | true             | `aa`                                          | `table-cell`   |

Cell editors are constructed detached, so the create function cannot classify
them; the same view reads `table-cell` correctly once it is in the document.
The first six rows are construction-time; the last is the plugin accessor
reading the same cell view afterwards.
