---
title: Tables
description: Table cell navigation, text objects, manipulation commands, format-on-exit auto-alignment, and native table editor integration for Live Preview.
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

- **Format-on-exit**: When you edit a table in raw Markdown and move the cursor outside the table, the table columns are automatically realigned. No formatting happens while you are typing inside the table, so the cursor stays where you expect it.
- **Separator generation**: Typing `||` on a new line immediately below a table header row generates a correctly formatted separator row matching the header's column count.
- **Manual realignment**: Use `<Leader>tr` or `:tablerealign` to realign at any time.

## Table widget in Live Preview

Vim Motions integrates with Obsidian's native table editor in Live Preview. Two modes are available via `set tablewidget`:

- **`native`** (default): Obsidian's native table widget renders in Live Preview. Moving the cursor into a table activates table navigation (same `h`/`j`/`k`/`l` nav, same structural commands). Cell editors are native Obsidian editors with vim injected via `registerEditorExtension()`. All the same keybindings apply. The native editor handles wikilinks, pipe escaping (`|` → `\|`), cursor positioning, and `<br>` conversion automatically.
- **`raw`**: Always shows raw markdown table syntax. No widget rendering. Useful for users who prefer source-style editing in Live Preview.

## Table-nav mode

When the cursor enters a table in Live Preview, a navigation overlay activates. This mode allows you to navigate between cells and perform structural changes without entering the cell editor.

### Keybindings

| Key                             | Action                                       |
| ------------------------------- | -------------------------------------------- |
| `h` / `j` / `k` / `l`           | Navigate between cells                       |
| `i` / `a` / `c` / `s` / `Enter` | Start editing the active cell                |
| `Escape`                        | Exit table-nav and return to the main editor |
| `o`                             | Add a row below                              |
| `O`                             | Add a row above                              |
| `dd`                            | Delete the current row                       |
| `dc`                            | Delete the current column                    |
| `J`                             | Move the current row down                    |
| `K`                             | Move the current row up                      |
| `H`                             | Move the current column to the left          |
| `L`                             | Move the current column to the right         |
| `I`                             | Add a column to the left                     |
| `A`                             | Add a column to the right                    |
| `=`                             | Realign the table                            |

> [!info] Fork-only feature
> Table-nav mode requires the bundled vim engine (fork mode). If you are using Obsidian's built-in vim mode, the plugin falls back to standard cell editing.

> [!tip]
> The **native** mode provides the best vim editing experience for tables. Obsidian's native table widget handles rendering while vim is injected into cell editors. Structural commands let you add, delete, and move rows and columns without leaving the table. Notes with multiple tables are fully supported — each table is independently navigable.

### Native mode vim navigation

In **native** mode, `h`/`j`/`k`/`l` in normal mode cross cell boundaries automatically:

| Key             | In cell                | At boundary                                               |
| --------------- | ---------------------- | --------------------------------------------------------- |
| `l`             | Move right within cell | Move to next cell (same row)                              |
| `h`             | Move left within cell  | Move to previous cell (same row)                          |
| `j`             | Move down within cell  | Move to same column in next data row (skip separator)     |
| `k`             | Move up within cell    | Move to same column in previous data row (skip separator) |
| `j` at last row | —                      | Exit table downward                                       |
| `k` at header   | —                      | Exit table upward                                         |

Operator-pending (`dj`, `yl`) and visual mode motions are confined to the current cell — they do not trigger cross-cell navigation.

### Vim modality in cell editors

Cell editors are Obsidian's native editors with vim injected via `registerEditorExtension()`. Full Vim modality is supported: Normal, Insert, and Visual modes all work within a single table cell.

- `Tab` / `Shift-Tab` navigate between cells (handled by the native table editor).
- `Escape` in normal mode stays in the cell (matches Obsidian's built-in vim behavior).
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
