---
title: Tables
description: Table cell navigation, text objects, manipulation commands, auto-formatting, and cursor-aware table widget for Live Preview.
tags:
    - features
    - keybindings
---

# Tables

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

- **Realignment**: Typing `|` in insert mode on a table line triggers an automatic realignment of the table columns.
- **Separator generation**: Typing `||` on a new line immediately below a table header row generates a correctly formatted separator row matching the header's column count.

## Table widget in Live Preview

To provide a seamless editing experience, Vim Motions manages how tables are rendered in Obsidian's Live Preview mode.

- **Cursor-aware (Default)**: Tables are rendered as themed HTML when the cursor is outside, but switch to raw Markdown when the cursor enters the table. This allows for full Vim editing power within the table.
- **Always raw**: Tables always display as plain Markdown.
- **Off**: Restores Obsidian's default interactive table editor.

> [!info]
> You can configure the table widget mode in **Settings → Vim Motions → Table widget in live preview**.

> [!note]
> **First-render learning lag**: On the very first load after plugin installation, the suppressor needs to observe one table widget render to learn its internal structure. A table may briefly flash as a widget before being suppressed; this is cached for the session.

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
