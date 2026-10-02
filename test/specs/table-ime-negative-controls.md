# Negative controls — nested table insert mode and composition

Plan B Step 5. Per `.agents/skills/negative-control/SKILL.md`: every assertion
was shown to fail before being trusted.

Covers `test/specs/table-ime.e2e.ts`, the three insert-mode scenarios added to
`test/specs/table-key-router.e2e.ts`, and
`test/unit/table/sync-up.test.ts`.

Baselines with the implementation intact: IME **3 passing**, router **9
passing**, `sync-up` unit **11 passed**.

Control 2 did not fire, and the code it was testing was deleted as a result.

## Control 1 — the composing guard removed

**Sabotage** in `src/vim/table/sync-up.ts`:

```ts
// if (update.view.composing) return;                              // SABOTAGE
```

`2 passing | 1 failing` — `commits a composition once, with no preedit residue`.
The preedit reaches the real document, so the document no longer equals
`TABLE_DOC` while composing.

## Control 2 — the `compositionend` flush removed, and then deleted

**Sabotage**: `installCompositionFlush` returning a no-op disposer without
registering its listener.

**`3 passing`. The control did not fire.**

Investigated rather than papered over: by the time CodeMirror dispatches the
committing transaction, `view.composing` is already `false`, so the commit
arrives at the ordinary `updateListener` and the separate flush never had
anything to do. No reachable state needs it — a cancelled composition restores
the child's text, which diffs to nothing, and a committed one arrives as a
non-composing update.

`installCompositionFlush` was therefore **removed** rather than kept. Code whose
absence no test can detect is unverified, and keeping it would have claimed a
composition safeguard that does nothing. If a real IME is ever found to commit
while `composing` is still true, the fix is to defer rather than drop a
suppressed flush, and that will be reproducible — this was not.

Removing it also returned the disposer invariant in
`table-nested-view.e2e.ts` to four per mount.

## Control 3 — whole-region forward instead of a minimal diff

**Sabotage** in `minimalDiff`, returning the entire range:

```ts
return { from: 0, to: before.length, insert: after }; // SABOTAGE
```

`8 passing | 1 failing` — `replays exactly one character on dot-repeat`.

This is the spike's measured fidelity defect, now regression-tested: the parent
observes one region-replacing transaction instead of a keystroke, so
`lastInsertModeChanges` captures the whole synced span and `.` replays it. The
original symptom was `| Qaa   Qaa  |` from a single `Q`.

Note which assertions did **not** catch it: typing still landed correctly, the
line count was still stable, and the document still matched after the insert.
Only the dot-repeat scenario distinguishes a minimal forward from a correct-
looking one.

## Controls carried by the unit tests

`test/unit/table/sync-up.test.ts` pins minimality directly — `insert` of length
one and a zero-width region for a single typed character — plus an exact
round-trip over six before/after pairs. Control 3 fails those too.

## Three test expectations that were wrong, not the code

Recorded because each looked like a defect at first and was not.

- `minimalDiff('| aa |', '| aaa |')` returns `{from: 4, to: 4, insert: 'a'}`,
  not `{from: 2, …}`. Prefix-first lands at the **end** of a run of identical
  characters. Both are one-character inserts; the position inside the run is not
  determined by minimality, so the test asserts the size instead.
- `minimalDiff('| a |\n| b |', '| a |\n\n| b |')` returns `from: 6`, not `5`,
  for the same reason.
- The region boundary **can** split a surrogate pair. Two emoji sharing a high
  surrogate diff to the low surrogate alone. An earlier comment in `sync-up.ts`
  claimed this never happens; it does, and it is harmless, because CodeMirror
  positions are code units too. The test now asserts an exact round-trip rather
  than that the pair stays whole.

## Insert-mode offset assertion

`leaves insert-mode characters native and forwards them to the parent` first
asserted a hand-written `'| Qaa  | 11    |'` and failed on the cell's trailing
spaces. It now derives the expectation from the source document,
`TABLE_DOC.replace('| aa', '| Qaa')`, which pins the offset exactly without
guessing whitespace — and, being a whole-document comparison, also catches a
stray line or a second insertion anywhere else.
