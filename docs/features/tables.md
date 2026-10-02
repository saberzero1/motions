---
title: Tables
description: Table cell navigation, text objects, manipulation commands, manual realignment, and native table editor integration for Live Preview.
tags:
    - features
    - keybindings
---

## Introduction

Vim Motions provides comprehensive support for Markdown tables, including structural navigation, cell-level text objects, manipulation commands, and native table editor integration for Live Preview that preserves Vim's editing power.

## Cell navigation

![[keybindings#Table navigation]]

Table navigation commands allow you to move between cells horizontally and vertically.

- **Wrapping**: Horizontal navigation (`]|`, `[|`, `]c`, `[c`) wraps around to the next or previous row when reaching the end or beginning of a row.
- **Separator-skip**: Vertical navigation (`]r`, `[r`) automatically skips over table separator rows (the `|---|` lines) to land on the same column in the next or previous content row.

> [!warning]
> On many non-US keyboard layouts, the pipe character (`|`) requires a modifier key (like AltGr) that may conflict with Vim's key capture. If `]|` or `[|` do not work on your keyboard, use the alternative `]c` and `[c` bindings.

## Table text objects

![[keybindings#Table text objects]]

Table text objects allow you to operate on the content of individual cells using standard Vim operators:

- `di|`: Delete the content of the current cell.
- `ci|`: Change the content of the current cell (delete and enter insert mode).
- `yi|`: Yank (copy) the content of the current cell.
- `vi|`: Visually select the content of the current cell.

The `a|` variant includes the surrounding pipes and padding.

> [!tip]
> Escaped pipes (`\|`) inside table cells are treated as cell content, not boundaries. For example, `| foo \| bar | baz |` is a two-column table where the first cell contains `foo \| bar`. `\\|` (escaped backslash followed by pipe) is treated as a real boundary.

## Table manipulation

![[keybindings#Table manipulation]]

A suite of manipulation commands is available under the `<Leader>t` prefix for structural changes to the table:

- `<Leader>to`: Add a row below the current row.
- `<Leader>tO`: Add a row above the current row.
- `<Leader>tj`: Move the current row down.
- `<Leader>tk`: Move the current row up.
- `<Leader>tdd`: Delete the current row.
- `<Leader>tiL`: Add a column to the right.
- `<Leader>tiH`: Add a column to the left.
- `<Leader>tL`: Move the current column to the right.
- `<Leader>tH`: Move the current column to the left.
- `<Leader>tdc`: Delete the current column.
- `<Leader>tr`: Realign the entire table.

> [!note]
> These manipulation commands call Obsidian's internal table commands. In `native` mode, they work when the cursor is inside the table. In `raw` mode, use Source mode or manual Markdown editing.

## Table auto-formatting

Vim Motions includes built-in auto-formatting for tables:

- **Manual realignment**: Use `<Leader>tr` or `:tablerealign` to realign a table's columns at any time. In table-nav mode, `=` does the same.
- **No automatic realignment**: Vim Motions never reformats a table on its own — not while you type, not when the cursor leaves the table. Realignment happens only when you ask for it, so the cursor stays where you expect it. Obsidian's own table editor may normalise a table's formatting when it commits a cell edit; that is Obsidian's behaviour rather than this plugin's.

## Table widget in Live Preview

Vim Motions integrates with Obsidian's native table editor in Live Preview. Two rendering modes are available via `set tablewidget`:

- **`native`** (default): Obsidian's native table widget renders in Live Preview. Cell editors are native Obsidian editors with vim injected via `registerEditorExtension()`. The native editor handles wikilinks, pipe escaping (`|` → `\|`), cursor positioning, and `<br>` conversion automatically.
- **`owned`** (experimental): the plugin renders the table itself, replacing Obsidian's widget entirely. See [[tables#Owned table surface]] below.
- **`raw`**: Always shows raw markdown table syntax. No widget rendering. Useful for users who prefer source-style editing in Live Preview. The vim cursor remains fully visible in raw mode — cursor suppression only activates when a native table widget is visible.

In **source mode**, tables are always rendered as raw markdown regardless of the `tablewidget` setting. The cursor behaves normally — no cursor suppression occurs.

The `tablenav` setting (on by default) controls whether the **table-nav overlay** activates on top of the native editor. With `tablenav` off, the native table editor still provides full vim cell editing with cross-cell `h`/`j`/`k`/`l` navigation — just without the overlay UI.

| Configuration                   | Experience                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| `native` + `tablenav` (default) | Full table-nav overlay with cell highlighting and structural commands |
| `native` + `notablenav`         | Native table editor with vim cell editing and cross-cell navigation   |
| `raw`                           | Raw markdown tables                                                   |
| `owned`                         | The plugin's own renderer, with Vim normal, visual and insert mode    |

## Owned table surface

> [!warning]
> Experimental, and not the default. Enable with `set tablewidget=owned` or **Settings → Vim Motions → General → Table widget in live preview**.

With `owned`, the plugin replaces Obsidian's table decoration with its own and mounts a nested editor inside it when the cursor enters a table. The nested editor hosts the caret; the **parent editor's vim owns every command**, so there is one vim state, one undo history and one document.

![[keybindings#Owned table surface]]

### What works

- Normal-mode commands, including `dd`, `D`, `u`, `.`, `zz` and counts
- Charwise and linewise visual mode, with the selection rendered inside the table
- Insert mode, including IME composition — a composition commits once and one `u` reverses it
- Leaving the table by `j`/`k` at the first or last row, preserving the desired column and any count; re-entering remounts

### What is not supported yet

- **Idle cells render as plain text**, not as a formatted table. Only the cursor's table is affected; this is the main reason `owned` is not the default.
- **The table-nav overlay** (`tablenav`) is not reconciled with this mode.
- **Visual block** renders as the enclosing charwise span, because a rectangular selection cannot be expressed as one CodeMirror range.
- **Some Obsidian widget features** are not reproduced: row and column buttons, the cell and column context menus, column and row drag-to-reorder, sort by column, multi-cell selection, copy and paste of a cell selection, malformed-table handling, click-to-place-cursor, and alignment-aware rendering. Column _resizing_ is not in that list — Obsidian's widget does not offer it, so nothing is lost.
- **`scrolloff=100` disables horizontal scrolling inside a table**, in `owned` and `native` alike. Ordinary horizontal scrolling works in both — the nested editor follows the caret.

### When it falls back

`owned` is skipped, with a one-time notice, when any of these hold. Each is a deliberate restriction rather than a missing feature:

| Condition                                  | Reason                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Obsidian's own **Vim key bindings** are on | Only the bundled engine has been measured against this surface          |
| **Mobile**                                 | Desktop only for now                                                    |
| The **Neovim backend** is connected        | Neovim owns text and keys; this surface's input path is not wired to it |
| **Source mode** or Reading view            | Replacing table source in a mode meant to show source is a defect       |
| The setting is not `owned`                 | Opt-in                                                                  |

## Table-nav mode

When the cursor enters a table in Live Preview with `tablenav` enabled, a navigation overlay activates. This mode allows you to navigate between cells and perform structural changes without entering the cell editor.

### Keybindings

| Key                             | Action                                               |
| ------------------------------- | ---------------------------------------------------- |
| `h` / `j` / `k` / `l`           | Navigate between cells                               |
| `Tab` / `Shift+Tab`             | Navigate to next / previous cell (wraps across rows) |
| `{count}j`, `{count}l`, etc.    | Navigate with count prefix (e.g., `3j`)              |
| `i` / `a` / `c` / `s` / `Enter` | Start editing the active cell                        |
| `Escape`                        | Exit table-nav and return to the main editor         |
| `o`                             | Add a row below                                      |
| `O`                             | Add a row above                                      |
| `dd`                            | Delete the current row                               |
| `dc`                            | Delete the current column                            |
| `J`                             | Move the current row down                            |
| `K`                             | Move the current row up                              |
| `H`                             | Move the current column to the left                  |
| `L`                             | Move the current column to the right                 |
| `I`                             | Add a column to the left                             |
| `A`                             | Add a column to the right                            |
| `=`                             | Realign the table                                    |
| `.`                             | Repeat the last structural command                   |

> [!info] Fork-only feature
> Table-nav mode requires the bundled vim engine or the Neovim backend. If you are using Obsidian's built-in vim mode, the plugin falls back to standard cell editing. Under the Neovim backend the overlay works normally: Obsidian's keymap scope consumes its keys before they reach Neovim.

> [!tip]
> The **native** mode provides the best vim editing experience for tables. Obsidian's native table widget handles rendering while vim is injected into cell editors. Structural commands let you add, delete, and move rows and columns without leaving the table. Notes with multiple tables are fully supported — each table is independently navigable.

> [!info] Viewport scrolling
> When navigating through a table taller or wider than the viewport, the editor scrolls both vertically and horizontally to keep the highlighted cell visible. This works even with tables that extend well beyond the screen.

### Native mode vim navigation

In **native** mode, motions in normal mode cross cell boundaries automatically:

| Key             | In cell                       | At boundary                                               |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `l`             | Move right within cell        | Move to next cell (same row)                              |
| `h`             | Move left within cell         | Move to previous cell (same row)                          |
| `j`             | Move down within cell         | Move to same column in next data row (skip separator)     |
| `k`             | Move up within cell           | Move to same column in previous data row (skip separator) |
| `w` / `W`       | Move to next word within cell | Move to next cell                                         |
| `b` / `B`       | Move to previous word         | Move to previous cell                                     |
| `e` / `E`       | Move to end of word           | Move to next cell                                         |
| `ge` / `gE`     | Move to end of previous word  | Move to previous cell                                     |
| `j` at last row | —                             | Exit table downward                                       |
| `k` at header   | —                             | Exit table upward                                         |

Count prefixes work for cross-cell `j`/`k` motions: `3j` crosses 3 rows.

Operator-pending (`dj`, `yl`) and visual mode motions are confined to the current cell — they do not trigger cross-cell navigation.

### Vim modality in cell editors

Cell editors are Obsidian's native editors with vim injected via `registerEditorExtension()`. Full Vim modality is supported: Normal, Insert, and Visual modes all work within a single table cell.

- `Tab` / `Shift+Tab` navigate between cells, wrapping across rows (Tab at the last cell of a row moves to the first cell of the next row; Shift+Tab at the first cell wraps to the last cell of the previous row). When table-nav is enabled, Tab exits the cell editor and returns to table-nav on the destination cell.
- When table-nav is enabled: `Escape` in normal mode returns to table-nav. `h`/`j`/`k`/`l` and `w`/`b`/`e` in normal mode move the cursor within the cell; only when the cursor reaches a cell boundary do they exit to table-nav and navigate to the adjacent cell. This lets you use standard vim cursor movement inside cells after pressing Escape from insert mode.
- When table-nav is disabled: `Escape` in normal mode stays in the cell; `h`/`j`/`k`/`l` and `w`/`b`/`e` cross cell boundaries directly via motion overrides.
- **Register sharing**: Vim registers are shared between cell editors and the main document.
- **Which-key**: [[which-key|Which-key]] popups work in cell editors.

> [!info] Cell editors use Live Preview
> Cell editors use Obsidian's Live Preview rendering. Markdown syntax like wikilink brackets (`[[` `]]`) and formatting marks are hidden during editing, but the underlying text is preserved.

> [!info] Animated cursor in cells
> When the [[animated-cursor|animated cursor]] is enabled, table cell editors use the native vim cursor as the steady-state renderer. The canvas-based animated cursor cannot reliably render above table cell content due to CSS stacking contexts. Cross-cell navigation (`h`/`j`/`k`/`l`) snaps the cursor to the destination cell. Within a single cell, the native cursor renders normally.

> [!tip] Multi-line cell content
> Pressing `Enter` inside a cell editor creates a line break. The native editor automatically handles `<br>` ↔ newline conversion so the table structure stays valid.

### Table row text objects

In raw Markdown mode, you can operate on entire table rows using the `ir` and `ar` text objects:

- `ir`: Selects the **inner row** content (everything between the first and last `|` pipes, excluding the pipes themselves).
- `ar`: Selects the **around row** content (the entire line including the leading and trailing pipes).

These text objects are useful for quickly deleting, changing, or yanking whole rows while editing the Markdown source.

> [!info]
> You can configure the table widget mode in **Settings → Vim Motions → Table widget in live preview**, or via `set tablewidget=native` / `set tablewidget=raw` in your vimrc.

## Ex commands

The following Ex commands are available for table manipulation:

| Command             | Short          | Description         |
| ------------------- | -------------- | ------------------- |
| `:tablerowbefore`   | `:tablerowb`   | Add row above       |
| `:tablerowafter`    | `:tablerowa`   | Add row below       |
| `:tablerowup`       | `:tablerowu`   | Move row up         |
| `:tablerowdown`     | `:tablerowd`   | Move row down       |
| `:tablerowdelete`   | `:tablerowde`  | Delete row          |
| `:tablecolbefore`   | `:tablecolb`   | Add column left     |
| `:tablecolafter`    | `:tablecola`   | Add column right    |
| `:tablecolleft`     | `:tablecoll`   | Move column left    |
| `:tablecolright`    | `:tablecolr`   | Move column right   |
| `:tablecoldelete`   | `:tablecold`   | Delete column       |
| `:tablealignleft`   | `:tablealignl` | Align column left   |
| `:tablealigncenter` | `:tablealignc` | Align column center |
| `:tablealignright`  | `:tablealignr` | Align column right  |
| `:tableinsert`      | `:tablei`      | Insert a new table  |
| `:tablerealign`     | `:tablerea`    | Realign the table   |

See [[known-limitations#Tables]] for detailed technical limitations.
