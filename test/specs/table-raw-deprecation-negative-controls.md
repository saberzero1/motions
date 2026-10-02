# Negative controls — `tableWidgetMode: raw` deprecation (Plan E3)

Per `.agents/skills/negative-control/SKILL.md`: every assertion was shown to
fail before being trusted.

Covers `test/specs/table-raw-deprecation.e2e.ts` (**6 passing**) and the
`tableWidgetMode migration` block in `test/unit/settings-migration.test.ts`
(**19 passed** in that file).

Two controls did not fire on the first attempt, and each exposed a different
kind of hole.

## Control 1 — the notice suppressed

**Sabotage** in `src/main.ts`:

```ts
if (true || this.rawDeprecationNotified) return; // SABOTAGE
```

`2 failing` — `Expected: 1 / Received: 0`.

## Control 2 — the once-per-session flag removed, and a vacuous scenario

**Sabotage**, deleting both the guard and the set:

```ts
// if (this.rawDeprecationNotified) return;
// this.rawDeprecationNotified = true;
```

**First attempt: `4 passing`. The control did not fire.**

The scenario's stimulus was eight document edits, on the assumption that the
notice path runs per render. It does not: `applyRawDeprecationNotice` is called
from `populateRuntimeSlots()`, which runs on a **settings reload**. Document
edits and cursor movement never reach it, so the flag was never exercised and
the scenario proved nothing.

Stimulus replaced with three unrelated `scrolloffLines` reloads — each of which
does run the notice path.

**Re-run: `3 passing | 1 failing`** — `Expected: 0 / Received: 3`. One notice per
reload, which is exactly what the flag prevents.

## Control 3 — a legacy shape left pointing at `raw`

**Sabotage** in `src/settings-migration.ts`:

```ts
return 'raw'; // SABOTAGE
```

`2 failed | 17 passed` — both `suppressTableWidget` cases,
`expected 'raw' to be 'native'`.

## Control 4 — an explicit `raw` migrated away

**Sabotage**, adding `raw` to the legacy set:

```ts
if (mode === 'raw') return 'native'; // SABOTAGE
```

`1 failed | 18 passed` — only `leaves an explicit raw alone, because this
release only deprecates it`.

That asymmetry is the point: control 3 breaks the legacy cases and leaves the
explicit one passing, control 4 does the reverse. Migrating a user off a
documented option they chose is the thing a deprecation exists to avoid, and it
is a separate decision from retargeting values nobody can still be setting
deliberately.

_An earlier version of this sabotage edited the `||` chain and failed six tests
instead of one. A control that breaks more than its target cannot show which
assertion is load-bearing; it was redone precisely._

## Control 5 — `always` left mapping to `raw` in the option path

**Sabotage** in `src/vim/options.ts`:

```ts
always: 'raw', // SABOTAGE
```

**First attempt: did not fire.** Nothing covered the vimrc/Lua option path at
all — `src/vim/options.ts` has its own legacy mapping, separate from the
stored-settings migration in `settings-migration.ts`, and only the latter had
tests. The change was unverified.

Two scenarios added: `set tablewidget=always` must resolve to `native`, and
`set tablewidget=raw` must still be accepted and warn.

**Re-run: `5 passing | 1 failing`** — `Expected: "native" / Received: "raw"`.

## Control 6 — E3.5, the value must survive

This step's deliverable is the **absence** of changes, which nothing else
detects. Mechanical checks, all passing:

| Check                                                            | Result                                           |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| the `'native' \| 'raw' \| 'owned'` union member survives         | present                                          |
| the raw CSS branch survives                                      | 3 references in `src/main.ts`, 1 in `styles.css` |
| raw-referencing specs survive                                    | 9 files                                          |
| the #132 regression survives (`table-cursor-source-mode.e2e.ts`) | 6 references                                     |

A compiler or `knip` pass would not complain about deleting the union member too
early; it would make nine specs fail in a way that reads as a test problem
rather than a scope violation.

## Corrections to the plan's own inventory

Two items in Plan E3's measured inventory were wrong, and both came from
pre-planning analysis carried without verification:

- **"Two docs pages actively recommend `raw`"** — they do not.
  `docs/index.md:41` reports a _defect_ about it, and
  `docs/features/snippets.md:36` explicitly says `set tablewidget=raw` is **not**
  a workaround. There were no recommendations to remove.
- **A contradiction inside the plan**: E3.1 said `raw` keeps working while
  E3.2's table migrated existing `raw` users to `native`. Those cannot both
  hold. Resolved in favour of E3.1 — only the legacy shapes retarget, and a
  stored `raw` is left alone. Control 4 pins that resolution.

A third item was stale rather than wrong: `docs/configuration/vimrc.md` and
`docs/configuration/lua-config.md` both omitted `owned` entirely, which was
fixed alongside the deprecation note.
