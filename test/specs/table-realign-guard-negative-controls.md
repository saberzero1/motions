# Negative controls — realign safe boundary (Plan E1.7)

Per `.agents/skills/negative-control/SKILL.md`.

Covers `test/specs/table-realign-guard.e2e.ts` (**5 passing**).

Every scenario **requests** the realign. Nothing realigns on its own, so a
sequence that merely types and exits would never reach the guard and control 1
could not fail.

## Control 1 — the insert-mode guard removed

**Sabotage** in `canRealignTable`: `return true`.

`4 passing | 1 failing` — only `refuses a realign requested from insert mode`,
where the document must stay byte-identical and does not.

This is Plan E1.7's mandated control, and it is asserted on the guard
**directly** rather than through dot-repeat, as the plan requires. The isolation
is informative: the dot-repeat scenario keeps passing under this sabotage,
because it requests its realign from normal mode. Dot-repeat is the _symptom_
the guard protects against; it cannot stand in for the guard itself.

## Control 2 — the focus reclaim removed

**Sabotage**: drop the `!held.view.hasFocus && this.parent.hasFocus` branch
from the kept-mounted path.

`3 passing | 2 failing` — `measures undo granularity…` and `a realign does not
leak into dot-repeat`.

This is the control for the defect this step actually found, and nothing in the
plan anticipated it. Writing the parent through the vim adapter focuses it as a
side effect, which left the nested editor **mounted but unfocused** while the
parent held focus — measured `mounted: 1`, `focused: false`,
`parentFocused: true`. The table was rendered by the child and driven by
neither, so `u` and `.` did nothing at all: three successive undos left the
document byte-identical.

Note what that looks like from the plan's vantage point. E1.7 predicts an undo
**granularity** problem and prescribes `isolateHistory` for it. The real defect
was undo being entirely dead, from a focus handoff — a different mechanism, in
a different file, that no amount of history annotation would have fixed.

## Control 3 — the composition guard

**Sabotage**: remove `isNestedComposing()` from `canRealignTable`.

**`5 passing`. The control did not fire, so the guard was deleted.**

Two independent reasons, and the first is the one that settles it:

- **Unreachable.** Every realign entry point — `:tablerealign`,
  `<Leader>tr`, `=` — is a normal-mode operation, and composition happens in
  insert mode, which control 1's guard already refuses. The insert-mode check
  subsumes it on every path.
- **Unverifiable.** A scenario was written for it and failed on its own
  precondition: `view.composing` stayed `false` after a synthetic
  `compositionstart`, because CodeMirror's handler sets `composing` to `0` and
  the getter tests `> 0`. Only a real IME composition produces the state, and
  reaching one through CDP to exercise a path that cannot occur is not worth
  the apparatus.

The precondition assertion is what made this visible rather than a false
success: without `expect(composing).toBe(true)`, the scenario would have
reported a passing guard while the state it guards never existed — the exact
shape of a vacuous test.

That is the third unverifiable rule removed in this plan sequence, after
`skipInTableCells()` and the owned surface's padding reset.

## `isolateHistory` was not used, and is not needed

Plan E1.7 requires wrapping the realign in `isolateHistory` so undo
granularity does not depend on CodeMirror's 500ms `newGroupDelay`. It is not
used, for a reason and with a measurement:

- `@codemirror/commands` is **not a declared dependency** — it exists only
  transitively, and importing it would break a clean install. It also ships its
  own nested `@codemirror/state`, which TypeScript rejects outright
  (`Types have separate declarations of a private property '_isAnnotation'`),
  and the annotation is an `AnnotationType` **instance**: a copy of it is not
  the one the host's history reads, so it could compile and silently no-op.
- Measured, the behaviour the annotation was meant to buy already holds. With
  the focus reclaim in place, one `u` undoes the realign and leaves the typed
  `Z`; a second `u` removes the `Z`. The spec asserts that directly and says
  in-line that it is measuring behaviour rather than trusting a mechanism.
