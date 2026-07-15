---
title: Tables
description: Table cell navigation, text objects, manipulation commands, format-on-exit auto-alignment, and cursor-aware table widget for Live Preview.
tags:
    - features
    - keybindings
---

## Introduction

Vim Motions provides comprehensive support for Markdown tables, including structural navigation, cell-level text objects, manipulation commands, and a specialized table widget for Live Preview that preserves Vim's editing power.

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
> These manipulation commands call Obsidian's internal table commands. They require the interactive table widget to be disabled or the cursor to be inside the table in a mode where the widget is suppressed.

## Table auto-formatting

Vim Motions includes built-in auto-formatting for tables:

- **Format-on-exit**: When you edit a table in raw Markdown and move the cursor outside the table, the table columns are automatically realigned. No formatting happens while you are typing inside the table, so the cursor stays where you expect it.
- **Separator generation**: Typing `||` on a new line immediately below a table header row generates a correctly formatted separator row matching the header's column count.
- **Manual realignment**: Use `<Leader>tr` or `:tablerealign` to realign at any time.

## Table widget in Live Preview

To provide a seamless editing experience, Vim Motions manages how tables are rendered in Obsidian's Live Preview mode.

- **Embedded**: The table renders as themed HTML. Moving the cursor into the table enters a two-layer editing mode:
    1. **Table navigation**: `h`/`j`/`k`/`l` moves a cell highlight. Structural commands (`o`, `O`, `dd`, `dc`, `J`, `K`, `H`, `L`, `I`, `A`, `=`) manipulate rows and columns directly.
    2. **Cell editing**: Press `i`, `a`, `c`, `s`, or `Enter` to open a vim-enabled editor in the highlighted cell. `Escape` returns to table navigation. A second `Escape` exits the table.
- **Cursor-aware (Default)**: Tables are rendered as themed HTML when the cursor is outside, but switch to raw Markdown when the cursor enters the table. This allows for full Vim editing power within the table.
- **Always raw**: Tables always display as plain Markdown.
- **Off**: Restores Obsidian's default interactive table editor.

The rendered table widget processes cell content through Obsidian's markdown renderer. Inline formatting (bold, italic, code), images, links, and math expressions display correctly in the rendered view.

> [!tip]
> The **Embedded** mode provides the best vim editing experience for tables. The rendered table stays visible while editing, individual cells get their own vim editor, and structural commands let you add, delete, and move rows and columns without leaving the table.

### Embedded mode keybindings

**Table navigation** (active when the cursor enters a table):

| Key                             | Action                                                 |
| ------------------------------- | ------------------------------------------------------ |
| `h` / `l`                       | Move cell highlight left / right                       |
| `j` / `k`                       | Move cell highlight down / up (exit table at boundary) |
| `i` / `a` / `c` / `s` / `Enter` | Enter cell editing                                     |
| `Escape`                        | Exit table                                             |
| `o` / `O`                       | Add row below / above                                  |
| `dd`                            | Delete row                                             |
| `dc`                            | Delete column                                          |
| `J` / `K`                       | Move row down / up                                     |
| `H` / `L`                       | Move column left / right                               |
| `I` / `A`                       | Add column left / right                                |
| `=`                             | Realign table                                          |

**Cell editing** (active after entering a cell):

| Key                       | Action                                  |
| ------------------------- | --------------------------------------- |
| All vim keys              | Normal vim editing within the cell      |
| `Tab` / `Shift-Tab`       | Save cell, move to next / previous cell |
| `Escape` (in normal mode) | Save cell, return to table navigation   |

> [!info]
> You can configure the table widget mode in **Settings → Vim Motions → Table widget in live preview**.

> [!note]
> **First-render learning lag**: On the very first load after plugin installation, the suppressor needs to observe one table widget render to learn its internal structure. A table may briefly flash as a widget before being suppressed; this is cached for the session.

> [!warning]
> **Third-party plugin compatibility**: Plugins that apply text decorations globally (e.g., dynamic highlighters) may conflict with the table widget if they mark text inside replaced table ranges. The table widget uses elevated CM6 decoration precedence to prevent duplication, but plugins that also escalate their decoration precedence could override this. If you see duplicated table content, try disabling the conflicting plugin's highlighting or switching to **Always raw** mode.

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
