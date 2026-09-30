# Negative controls — `insert-escape-mapping.e2e.ts`

Covers the fork changes for user `<Esc>` mappings and `:stopinsert`. Every
expectation in the spec was measured against **Neovim 0.12.5** under
`nvim --clean` before the fork was touched; the oracle values are recorded
below so a future reader can re-derive them without re-running the probe.

## Neovim oracle

Driven with `nvim_feedkeys(…, 'mtx', false)` so mappings are expanded and the
typeahead is drained; observations are buffer text and cursor column, because
`'x'` leaves insert mode at the end of the call and makes a mode reading
useless.

| Probe                                           | Neovim 0.12.5                     |
| ----------------------------------------------- | --------------------------------- |
| `A` `x` then `:stopinsert`                      | line `hellox`, col `5`, mode `n`  |
| `A` `x` then `<Esc>`                            | line `hellox`, col `5`, mode `n`  |
| `:stopinsert` in normal mode                    | no error, mode `n`, buffer intact |
| `:stopi`                                        | resolves                          |
| `inoremap <Esc> XY` then `a` `<Esc>`            | line `aXYbc`                      |
| `inoremap <Esc> XY` then `a` `<C-c>`            | line `abc` — **not** remapped     |
| `inoremap <Esc> XY` then `a` `<C-[>`            | line `aXYbc` — **is** remapped    |
| `imap <Esc> <Esc>` (recursive) then `a` `<Esc>` | line `abc`, mode `n`, no hang     |
| `inoremap <Esc>q ZZ` then `a` `<Esc>`           | line `abc`, mode `n`              |
| `xnoremap <Esc> ll` then `v` `<Esc>`            | mode `v`, col `2`                 |

`<C-[>` is remapped and `<C-c>` is not because `<C-[>` _is_ Escape — both send
`0x1b` — while `<C-c>` is a distinct Vim key. That asymmetry is the reason the
two adjacent `keyToKey` entries in the fork differ by a single `noremap`
property, and it is the thing S3 below protects.

## Red first

Run before any fork change, against the shipped registry fork:

**7 failed, 5 passed.**

| Test                                     | Expected | Actual on unfixed code |
| ---------------------------------------- | -------- | ---------------------- |
| `:stopinsert` is a known ex command      | `false`  | `unknownCommand: true` |
| `:stopinsert` cursor parity with `<Esc>` | col `5`  | `unknownCommand: true` |
| `:stopi` short form                      | `false`  | `unknownCommand: true` |
| `:stopinsert` no-op in normal mode       | `false`  | `unknownCommand: true` |
| `inoremap <Esc> XY`                      | `aXYbc`  | `abc`                  |
| `<C-[>` follows the `<Esc>` mapping      | `aXYbc`  | `abc`                  |
| `vnoremap <Esc> ll`                      | `visual` | `normal`               |

The five that already passed are the controls for the _existing_ behaviour the
change must not break, so each one needed its own sabotage below.

## Sabotages

Each applies one edit to `~/Repos/codemirror-vim/src/vim.js`, rebuilds the fork
and `main.js`, runs the spec, and is then restored. Harness:
`/tmp/opencode/sabotage.sh`.

| ID  | Sabotage                                                                        | Test that failed                            | Expected → Actual                                      |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| S1  | Drop the `keyToKeyStack.indexOf(…) == -1` condition from `userEscMappingClaims` | recursive `imap <Esc> <Esc>`                | mode `normal` → `insert`                               |
| S2  | Match partials as well as full matches (`.full` → `.full.concat(.partial)`)     | longer `<Esc>q` mapping only                | mode `normal` → `insert`                               |
| S3  | Add `noremap: false` to the two `<C-c>` `keyToKey` entries                      | `<C-c>` still exits insert                  | `abc` → `aXYbc`                                        |
| S5  | `userEscMappingClaims()` returns `true` unconditionally                         | 8 tests, including both no-mapping controls | e.g. `<Esc>` with no mapping: mode `normal` → `insert` |
| S6  | Drop `:stopinsert`'s `!vim.insertMode` early return                             | `:stopinsert` no-op in normal mode          | cursor `{line:0,ch:2}` → `{line:0,ch:1}`               |

S5 is the broad control: it confirms that all four "no user mapping" and
"mapping must not apply" tests genuinely depend on the resolver's answer rather
than passing for ambient reasons.

## S4 — the control that found dead code

**Sabotage:** remove `if (noremap) return false;` from the top of
`userEscMappingClaims`.

**Result: 12 passing, 0 failing.** No test could distinguish its presence.

That guard was not defensive, it was unreachable. `commandMatches` already
honours the module-level `noremap` flag through
`startIndex = noremap ? keyMap.length - defaultKeymapLength : 0`, which skips
the user entries outright, so a `noremap` expansion can never yield a
`_isDefault === false` candidate for the loop to find. S3 is what proves the
`noremap` _semantics_ are load-bearing; S4 proves a second copy of them in
`userEscMappingClaims` was not.

The line was removed rather than kept as belt-and-braces, and the spec was
re-run at **12 passing** afterwards.

## A deleted test — `vim.schedule(stopinsert)`

`lua-doc-examples.e2e.ts` briefly carried a second scenario wrapping
`vim.cmd("stopinsert")` in `vim.schedule`, matching the deferred half of the
recipe in `docs/guides/plugin-integration.md`. It **passed against the unfixed
build**, so it proved nothing.

The mode timeline, measured on the registry fork with no fix present:

| Lua body                                 | settle   | +200 ms  | +1200 ms |
| ---------------------------------------- | -------- | -------- | -------- |
| `normal! a` + `vim.schedule(stopinsert)` | `normal` | `normal` | `insert` |
| `normal! a` alone                        | `insert` | `insert` | `insert` |
| `normal! a` + scheduled unknown command  | `insert` | —        | `insert` |

Row 1 reaching `normal` at settle is not `stopinsert` working — rows 2 and 3
show `normal! a` alone never leaves insert mode. The leader mapping had not yet
fired on the first poll, and `waitUntil(mode === 'normal')` was satisfied
immediately. The subject never ran.

It was deleted rather than repaired: an honest deferred assertion needs an
observable window between the callback returning and the scheduled tick, and
lengthening the defer to manufacture one would exercise `vim.defer_fn` rather
than the `vim.schedule` the documentation actually publishes. The direct
scenario is red-first (`insert` against `normal`) and covers `:stopinsert`
reached through `vim.cmd` from a Lua callback.
