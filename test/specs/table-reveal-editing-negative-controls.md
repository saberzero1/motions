# Negative controls: editing a revealed table

Every scenario in `table-reveal-editing.e2e.ts`, and the related scenarios in
`table-reveal-builtin-vim.e2e.ts`, `rpc-table-reveal.e2e.ts`,
`jump-list.e2e.ts` and `table-settings-labels.e2e.ts`, was shown to fail when
the behaviour it names is broken.

For each sabotage:

1. it was applied to the source;
2. the bundle was rebuilt with `npm run build:ci-test`;
3. only the targeted scenario was run, with `--mochaOpts.grep`;
4. the source was restored from a copy and checked byte-identical.

Two of the first drafts were themselves vacuous. Both are recorded at the end,
because the corrected sabotages are only meaningful next to them.

## Moving between cells

| #   | Sabotage                                                           | Scenario                                                   | Observed                                                                                             |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| S2  | `Shift-Tab` does not skip the separator                            | moves back with Shift-Tab, skipping the separator          | cursor expected `{ line: 2, ch: 9 }`, received `{ line: 3, ch: 8 }`                                  |
| S3  | `Tab` in the last cell does not add a row                          | adds an empty row from the last cell and types into it     | cursor expected `{ line: 6, ch: 2 }`, received `{ line: 5, ch: 9 }`                                  |
| S4  | The reveal check swallows the key instead of passing it            | leaves Tab alone outside a table                           | line expected to change, received `Below the table here`                                             |
| E1  | `Enter` unbound                                                    | moves down a row with Enter                                | cursor expected `{ line: 4, ch: 9 }`, received `{ line: 3, ch: 0 }`: the header row was split        |
| E1  | same                                                               | adds a row with Enter on the last row                      | failed                                                                                               |
| E2  | `Enter` does not skip the separator                                | moves down a row with Enter                                | cursor expected `{ line: 4, ch: 9 }`, received `{ line: 3, ch: 8 }`                                  |
| E3  | A row added by `Enter` puts the cursor in column 0                 | adds a row with Enter on the last row                      | `ch` expected `9`, received `2`                                                                      |
| E4  | `Shift-Enter` unbound                                              | inserts <br> with Shift-Enter                              | row expected `\| aa<br>x   \| 11    \|`, received `\| aa`: the row was split                         |
| E5  | `Enter` swallowed outside a table                                  | leaves Enter alone outside a table                         | line count expected `9`, received `8`                                                                |
| E6  | No end-of-row rule: `Enter` moves down after a row's last pipe too | starts a new line with Enter at the end of a row           | row expected `\| cc \| 33 \|`, received `\|      \| \| cc \| 33 \|      \|`                          |
| E6  | same (`table-reveal.e2e.ts`)                                       | does not jump the cursor while a new table is typed (#121) | failed: the first version shipped this way and the scenario caught it, as `\|   \| \| 1 \| 2 \|  \|` |
| N2  | The insert-mode guard removed (built-in-vim spec)                  | does not move between cells with Tab in normal mode        | `ch` expected not `9`, received `9`                                                                  |

## `tableAutoRealign`

| #   | Sabotage                                                           | Scenario                                                       | Observed                                                                                         |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| S5  | Realign labelled `input.type` instead of `input.type.compose`      | takes back the edit and the realign with one u                 | after `u` expected the original, received `\| aaxxxx   \| 11    \|`: only the realign was undone |
| S6  | Rows without a closing pipe are realigned too                      | does not rebuild a table whose row is still being typed        | row expected `\| bb   \| 22    \| extra`, received `\| bb   \| 22    \|`: the text was dropped   |
| S7  | Changes made before the adapter signals insert mode are not seeded | realigns after a change that only deletes                      | header expected `\|     \| Value \|`, received `\|  \| Value \|`                                 |
| S8  | Blockquote prefix dropped                                          | keeps the blockquote markers of a quoted table                 | rows expected `> \| a    \| b   \|`…, received `\| a    \| b   \|`…                              |
| S9  | Caret not mapped through the realign                               | keeps the caret on its character when an earlier column widens | `ch` expected `11`, received `13`                                                                |
| S10 | The setting ignored                                                | leaves the table as typed when the setting is off              | header expected `\| Name \| Value \|`, received `\| Name   \| Value \|`                          |

## Typing a pipe

| #   | Sabotage                             | Scenario                                              | Observed                                                                         |
| --- | ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| N3  | Wikilink escape removed              | escapes a pipe typed inside a wikilink                | expected `\| [[page\\\|alias]] \| 11 \|`, received `\| [[page\|alias]] \| 11 \|` |
| N4  | Escape applied outside wikilinks too | leaves a pipe typed outside a wikilink as a delimiter | expected `\| aa\|z   \| 11    \|`, received `\| aa\\\|z   \| 11    \|`           |
| N5  | Separator generation removed         | turns \|\| under a header into its separator          | expected `\| ---- \| ----- \|`, received `\|\|`                                  |
| N6  | Header check reduced to "has cells"  | keeps \|\| as a row of a table that already has one   | expected `\|\|`, received `\| ---- \| ----- \|`                                  |

## Column awareness and alignment

| #   | Sabotage                                | Scenario                                             | Observed                                                                            |
| --- | --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| N7  | Status never reported                   | shows the column in the status bar and highlights it | text expected `Col 2/2 · Value`, received `null`                                    |
| N8  | Row cell count reported as the header's | warns when the row has a different number of cells   | expected `Col 1/2 · Name · row has 3 cells`, received `Col 1/2 · Name`              |
| N9  | Active-column mark never set            | shows the column in the status bar and highlights it | cells expected `["Value", "11", "22"]`, received `[]`                               |
| N10 | Alignment text fallbacks removed        | right-aligns the column with <leader>tar             | separator expected `\| ---- \| ----: \|`, received `\|------\|-------\|`: unchanged |
| N10 | same                                    | centres a column with :tablealigncenter              | failed                                                                              |

## Existing motions and text objects

| #   | Sabotage                            | Scenario                                              | Observed                                                            |
| --- | ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| N11 | `i\|` starts at the opening pipe    | operates on a cell with i\| and a\|                   | yank expected `" aa   "`, received `"\| aa   "`                     |
| N12 | `[r`/`]r` do not skip the separator | moves between cells with ]\| and [\| and between rows | cursor expected `{ line: 2, ch: 9 }`, received `{ line: 3, ch: 8 }` |
| R1  | `ir` starts at the opening pipe     | operates on a row with ir and ar                      | yank expected `" aa   \| 11    "`, received `"\| aa   \| 11    "`   |

## Elsewhere

| #   | Sabotage                                                          | Scenario                                                   | Observed                                                                                               |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| N1  | Normal-mode `<Tab>` mapping removed (`jump-list.e2e.ts`)          | normal-mode Tab goes forward like <C-i>, without indenting | line expected `4`, received `0`                                                                        |
| N1  | same (`table-reveal-editing.e2e.ts`)                              | does not move between cells in normal mode                 | failed: Obsidian indented the row                                                                      |
| P1  | Key delegation does not forward `Tab` (`rpc-table-reveal.e2e.ts`) | R5 leaves insert-mode Tab to Neovim                        | Neovim's row expected to change, received `\| cc   \| dd   \|`                                         |
| L1  | The previous `settings.ts` (`table-settings-labels.e2e.ts`)       | lists the table widget modes as short labels               | received the old sentences, e.g. `Use Obsidian's built-in table editor with vim support (recommended)` |
| L2  | Realign setting renamed                                           | offers the realign setting as a toggle                     | `found` expected `true`, received `false`                                                              |

Red before the fix, rather than sabotaged:

- **`table-reveal-builtin-vim.e2e.ts`:** the Tab and realign scenarios failed until the adapter was resolved through `editorView.cm`. `Tab` reached column 3, a tab character, and the table stayed as typed.
- **`table-nav-disabled.e2e.ts`:** "Tab should navigate between cells without table-nav (#136)" failed against the first normal-mode `<Tab>` mapping, with `cellCol` staying 0. It passes with `withTableCellTab`, which hands `Tab` back to Obsidian's cell editor.

## Vacuous drafts

- **The first S4** made the table lookup swallow the key. But the reveal check runs first and already returns outside a table, so the scenario passed. The recorded S4 makes the reveal check itself swallow the key.
- **The first S1** removed the cell handler's insert-mode guard and failed under the bundled engine, until normal-mode `<Tab>` was mapped to the jump list. From then on the engine consumes `Tab` before any keymap runs, so that sabotage could no longer fail there. The guard's scenario moved to the built-in-vim spec, where the plugin registers no mappings; that is N2.
