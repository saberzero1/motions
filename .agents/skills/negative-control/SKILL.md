---
name: negative-control
description: Prove a test can fail before trusting it. Applies to EVERY new or modified test — unit, e2e, or golden — not just bug reproductions. A test that cannot fail is worse than no test, because it reports safety that does not exist.
triggers:
    - write a test
    - add a test
    - new test
    - unit test
    - e2e test
    - test coverage
    - verify the fix
    - negative control
argument-hint: '[test file or test name]'
---

# Negative control

## Purpose

Every test must be shown to fail when the behaviour it describes is broken. Passing is not evidence; **failing on demand** is.

This repository has shipped tests that passed for the wrong reason on at least five occasions:

| Shape                        | Real instance                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tautological assertion       | `const r = buf === buf; expect(r).toBe(true)` — passed for every possible implementation                      |
| Assertion/claim divergence   | A test named "with null data" whose `null ?? {}` constant-folded to `{}`, silently duplicating the next test  |
| Mock that intercepts nothing | `vi.mock('…/bridge')` for a symbol the subject imports from `./tree-state`                                    |
| Setup that silently no-ops   | `delete Symbol.dispose` — non-configurable, so the precondition never held and the test passed on every input |
| Unawaited async assertion    | A WDIO `expect` never awaited resolves to a pending Promise; truthy, never throws                             |

None were caught by review. Every one was caught by _executing_ the check.

## When this applies

**Any** change that adds or modifies a test. Specifically including cases the `issue-repro` skill does not cover:

- unit tests written alongside a new feature
- tests added for code that already exists
- tests written during a refactor
- golden/acceptance tests
- a test you changed while fixing an unrelated failure

If you are writing an assertion, this applies.

## The control

Pick the strongest technique available, in this order.

### 1. Red first (strongest)

Write the test before the behaviour exists or before the fix is applied. Run it. **It must fail, and the failure must be the one you expect** — not an import error, not a timeout, not a syntax error. A test that fails for the wrong reason is not a control.

This is the required technique whenever there is a "before" state: bug fixes, and any behaviour change.

### 2. Sabotage the subject

When the behaviour already works and there is no "before" state, break it deliberately:

- invert a comparison, change `>=` to `>`
- return a constant from the function under test
- delete the line the test is meant to protect

Run the test. It must fail. **Restore the code.** Record the observed failure — actual vs expected values, not "it failed".

### 3. Invert the assertion (weakest)

Change `toBe(x)` to `toBe(<something else>)` and confirm it fails. This proves the assertion executes and is reached. It does **not** prove the assertion is about the right thing, so prefer 1 or 2 whenever possible.

## Evidence

A negative control is only done when you can state the observed failure concretely:

> Removing the `column === 0` adjustment made the fold end at offset **21** (the next heading) instead of **12** (the body line).

> Changing `startIndex: fromB` to `fromA` produced `startIndex: 7`, expected `9`.

"I verified it fails" is not evidence. Give the numbers.

## Vacuity checklist

Before accepting a test, confirm none of these are true:

- [ ] The assertion would hold for **any** implementation of the subject (tautology).
- [ ] The test never calls the function it claims to test.
- [ ] The test's name claims a behaviour the assertions never check.
- [ ] The only assertion is `toBeDefined`/`toBeTruthy`/`not.toThrow` on something that could not plausibly be otherwise.
- [ ] A `vi.mock()` path is not actually imported by the module under test.
- [ ] A setup step (deleting a global, overwriting a builtin, setting a flag) silently did nothing.
- [ ] An async assertion is not awaited.
- [ ] The assertion sits inside an `if`/`catch` that may never execute.
- [ ] The expected value is produced by calling the same code under test.

## Relationship to the lint gates

`npm run lint` runs `@vitest/eslint-plugin` and `eslint-plugin-wdio` over `test/`. Those catch the _syntactic_ subset: no assertion at all, unawaited assertions, conditional assertions, duplicate titles, self-comparison.

They cannot catch a test that asserts confidently about the wrong thing. `expect-expect` trusts any helper named in `assertFunctionNames` without inspecting it — a wrapper that only proves "the plugin is still loaded" satisfies the rule while proving nothing about the feature under test.

**The lint gate is necessary and not sufficient. The negative control is what closes the gap.**

## MUST DO

- Run the negative control for every new or modified assertion.
- Restore any sabotage immediately, and re-run the suite afterwards to prove restoration.
- Record the observed failure values in your report or commit message.
- When a test's name and its assertions disagree, treat the NAME as the intent and fix the assertions — or rename the test and say so.
- If a test cannot be made to fail, delete it or replace it. Say which.

## MUST NOT DO

- Do NOT add `expect(true).toBe(true)`, or any assertion whose only purpose is to satisfy `expect-expect`. That converts a detectable problem into an undetectable one.
- Do NOT add an `eslint-disable` for a test-quality rule. Fix the test or report it.
- Do NOT widen `assertFunctionNames` to silence a finding without inspecting the helper.
- Do NOT weaken an assertion to make a test pass.
- Do NOT delete a failing test to make the suite green.
- Do NOT claim a negative control you did not run.
- Do NOT revert a newly added `await` because it exposed a failure — that failure is the point.
