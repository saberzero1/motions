# Negative controls — table key router

Plan B Step 4. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers `test/specs/table-key-router.e2e.ts`. Baseline with the implementation
intact: **6 passing**.

Control 3 did not fire on the first attempt, because the assertion it was meant
to test was vacuous.

## Control 1 — the router listener is never installed

**Sabotage** in `src/vim/table/key-router.ts`:

```ts
if (child) return () => undefined; // SABOTAGE
child.contentDOM.addEventListener('keydown', onKeyDown, true);
```

`1 passing | 5 failing`. Every routing scenario fails; only the focus scenario
survives, which is correct — mounting and focusing do not depend on the router.

## Control 2 — the nested editor is never focused

**Sabotage** in `src/vim/table/nested-view.ts`:

```ts
// view.contentDOM.focus();                                        // SABOTAGE
```

**6 failing**, all at the shared focus precondition
(`expect(snap.nested.focused).toBe(true)`, `Expected: true / Received: false`).

This is the control that justifies `expectNestedHasFocus` running in every
scenario. Without focus the keys go to the parent directly, which for several
of these scenarios produces the _same document outcome_ — so the routing
assertions alone would not distinguish a working router from no router at all.

## Control 3 — the caret is not kept in step (and a vacuous assertion)

**Sabotage** in `nested-view.ts`:

```ts
private syncCaret(held: Mounted, table: TableRange): void {
    if (held) return;                                              // SABOTAGE
```

**First attempt: `6 passing`. The control did not fire.**

The assertion was `expect(snap.nested.childHead).toBeGreaterThanOrEqual(0)`. A
freshly constructed `EditorView` has its selection at 0, so that holds whether
or not the caret is ever synchronised. It was testing nothing.

Replaced with the exact translation — the child's document _is_ the parent's
slice `[from, to]`, so the offset is a subtraction and there is no reason to
assert anything looser:

```ts
expect(after.nested.childHead).toBe(after.parentHead - doc.indexOf('| Name'));
```

**Re-run: `3 passing | 3 failing`** — `Expected: 36 / Received: 0`,
`Expected: 37 / Received: 0`, `Expected: 53 / Received: 0`, in the focus, `l`
and `j` scenarios.

This matters beyond the test: if the caret and the parent's head diverge, every
command operates somewhere other than where the user sees the cursor.

## Why `routed` is never a sole assertion

`routed` is the router's own counter, and
`.ast-grep/rules/solo-self-reported-success.yml` exists for exactly this shape.
It appears only as `toBeGreaterThan(before.nested.routed)` alongside assertions
on document text, vim mode and the parent's head — values the product produced.
A scenario asserting only that the counter moved would pass while every key was
dropped on the floor.

## Measurements behind the routing rule

Two facts decided the design, both measured against a real Obsidian before any
of this was written.

**Commands route to an unfocused parent.** `handleKey(adapter, 'd')` twice,
against a parent whose `contentDOM` had been blurred and with
`document.activeElement` on `BODY`, took `hello\nworld` to `world`. That is what
makes a nested editor holding focus workable at all.

**Character input does not route.** In the same harness,
`handleKey(adapter, 'i')` returned `true`, `handleKey(adapter, 'X')` returned
**`undefined`**, `handleKey(adapter, '<Esc>')` returned `true`, and the document
was **unchanged** — focused and blurred alike. The fork deliberately leaves
insert-mode characters to CodeMirror's native input path, so a router cannot
implement insert mode by forwarding keys.

That is why the nested editor is held at `EditorState.readOnly` rather than
`EditorView.editable.of(false)`: read-only keeps text out of a document the
parent never sees, while the view stays focusable so the router receives keys at
all. The two are not interchangeable, and control 2 is what would catch swapping
them.

An earlier run of the second measurement reported
`TypeError: Cannot read properties of undefined (reading 'findKey')` for every
key, including `dd`. That was the probe's fault, not the fork's:
`const handleKey = Vim['handleKey']` then `handleKey(...)` calls it unbound, and
it uses `this`. Call it as a method, the way every production call site does.
