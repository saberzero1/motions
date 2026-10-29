# Negative controls: `tableWidgetMode: reveal`

Every scenario in `table-reveal.e2e.ts` and `rpc-table-reveal.e2e.ts`, and
every case in `test/unit/table/reveal-*.test.ts`, was shown to fail when the
behaviour it names is broken. Each sabotage was applied to the source, the
bundle rebuilt with `npm run build:ci-test`, the targeted scenario run, and
the source restored from a copy. Observed values are below.

The mechanism, and the spike that established it, are in
`.omo/table-probe/REVEAL-SPIKE.md`.

## End-to-end

| #   | Sabotage                                                  | Scenario                                                                    | Observed                                                                                                                     |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| E1  | Extender returns `null` always: nothing is revealed       | reveals the table on the keystroke that enters it                           | `widgets` expected `0`, received `1`                                                                                         |
| E1  | same                                                      | extends a visual selection from above into the table                        | mode expected to contain `visual`, received `normal`                                                                         |
| E1  | same                                                      | reveals the table a search lands in                                         | `widgets` expected `0`, received `1`                                                                                         |
| E1  | same                                                      | records and replays a macro down the table's rows                           | row expected `\| Xa   \| 11    \|`, received `\| aa   \| 11    \|`                                                           |
| E2  | `retireTableWidgets` not called                           | reveals the table on the keystroke that enters it                           | cursor expected `{ line: 2, ch: 0 }`, received `{ line: 2, ch: 2 }` — Obsidian's widget moved the caret into the header cell |
| E2  | same                                                      | reveals the table a search lands in                                         | `tableCell` expected `false`, received `true`                                                                                |
| E2  | same                                                      | records and replays a macro                                                 | row expected `\| Xa …`, received `\| aa …`                                                                                   |
| E3  | Extender ignores Obsidian's own filter effect             | stays revealed when in-file search closes on a match inside                 | failed; the suite's `after` hook then timed out with the caret inside a re-replaced table                                    |
| E4  | Cursor guard ignores `isRevealedAt`                       | reveals only the table holding the caret, and keeps the caret drawn there   | `suppressed` expected `false`, received `true`                                                                               |
| E5  | `:table*` text fallback ignores `isRevealedAt`            | runs the :table commands on a revealed table while another keeps its widget | document length expected `14`, received `13` — no row added                                                                  |
| E6  | Caret placed on `mousedown` only, never on `pointerdown`  | places the caret in the clicked cell of an idle table                       | line expected `5`, received `7`                                                                                              |
| E7  | CSS neutralising the reveal highlight removed             | draws nothing for the reveal highlight                                      | outer ring expected `["none"]`, received `["rgb(166, 138, 249) 0px 0px 0px 3px"]`                                            |
| E8  | Highlight only the newline between rows, not the row text | styles revealed rows … and shows inline markup as source                    | row expected `\| [[x]] \| 22    \|`, received `\| x \| 22    \|`                                                             |
| E9  | Finder requires a leading pipe                            | keeps a row revealed after its leading pipe is deleted                      | `widgets` expected `0`, received `1`                                                                                         |
| E10 | Teardown does not withdraw the highlights                 | hands a revealed table back when the mode is switched away                  | `widgets` expected `1`, received `0`                                                                                         |

### RPC

| #   | Sabotage                       | Scenario                                              | Observed                                                                                                                                                                               |
| --- | ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Extender returns `null` always | R1 reveals the table Neovim moves into                | `widgets` expected `0`, received `1`                                                                                                                                                   |
| E1  | same                           | R2 x edits the row Neovim is on                       | CM6 row expected `" cc   \| dd   \|"`, received `" cc  \| dd  \|"` — Obsidian's widget reformatted CM6 while Neovim kept the source, the divergence `rpc-table-owned.e2e.ts` documents |
| E1  | same                           | R3 hands the table back when Neovim leaves            | failed at the entry precondition, `widgets` expected `0`, received `1`                                                                                                                 |
| E1  | same                           | R4 renders Neovim's extmark inside the revealed table | `widgets` expected `0`, received `1`                                                                                                                                                   |

### A control that found a defect

The first run of E1 did not fail cleanly: the renderer **hung** until
WebDriver aborted. The input module converted any cell editor Obsidian opened
into a caret placement inside that cell. With nothing revealed, the placement
put the caret inside a replaced table, Obsidian's widget opened its cell editor
again, focus entered it, and the module placed again — without end. The same
loop was reachable in production whenever a table could not be revealed. The
module now stays out of the way without a captured channel, and stops
converting for a view after a placement that did not reveal its table. E1 then
failed in 5 s on the assertion above.

### A scenario removed for not being able to fail

An earlier scenario ran `d3j` from the line above the table. It passed under
E1: a linewise operator on the parent document needs no revealed table. It was
replaced by the visual-selection scenario, which does.

### Line-level features (`table-reveal-integrations.e2e.ts`)

The IME row-end scenario was red first: before the extender skipped
composition transactions, the row read `" aa   | 11    |に日本"` against the
expected `"| aa   | 11    |日本"` — the leading pipe deleted and the preedit
left beside the commit. That failure is what the fix answers.

| #   | Sabotage                       | Scenario            | Observed                                                                                                                                                                    |
| --- | ------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Extender returns `null` always | all seven scenarios | each failed; flash labels expected `2`, received `0`, and the others at their entry precondition — the caret could not reach the intended row, `widgets` `1` instead of `0` |

Hint mode was first written to expect one label on the table's link and got
two. A control on the same link on an ordinary line, with the caret inside it
so Live Preview shows its source, also gets two, so the count is hint mode's
own for a link shown as source. The scenario now asserts equality with that
control and that the label opens the note.

### Obsidian's own vim (`table-reveal-builtin-vim.e2e.ts`)

| #   | Sabotage                                                                    | Scenario                                          | Observed                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `builtin-vim` blocker restored for `reveal`                                 | reveals the table on the keystroke that enters it | failed — but only once the spec rebooted Obsidian with the setting on. Enabling it at runtime, as first written, built the slot before the setting changed, and the restored blocker **passed** |
| B2  | Reveal slot pushed into `vimExtensionSlot` instead of registered on its own | same                                              | failed: the vim layer is never installed while Obsidian's vim is on                                                                                                                             |

## Unit

| #   | Sabotage                                         | Case                                               | Observed                                                                                                   |
| --- | ------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| U1  | Finder requires a leading pipe                   | keeps a row whose leading pipe was deleted         | `expected null to match object { fromLine: 1, toLine: 4 }`; also fails "finds a table without outer pipes" |
| U2  | Extender ignores Obsidian's own filter           | re-adds its highlights when Obsidian clears them   | `expected [] to deeply equal [ …four row ranges ]`                                                         |
| U3  | `retireTableWidgets` not called                  | retires Obsidian's widget for the table it reveals | `expected 12 to be Infinity`                                                                               |
| U4  | `owned` removed from `tablewidget` `validValues` | accepts every current table widget mode            | `expected [ 'native', 'reveal', 'raw', …(4) ] to include 'owned'`                                          |
| U5  | Composition skip removed from the extender       | leaves the marks alone during an IME composition   | `expected true to be false` — the composing transaction carried highlight effects                          |

### An equivalent mutant, recorded rather than tested

Keeping a collapsed range in the reveal record (`from <= to` instead of
`from < to` in the newline-era mapping) changed no outcome. Any disagreement
between the record and the desired highlights makes the extender rebuild both
from scratch, so the record self-heals. No test can tell the two apart, and
none was contrived to.
