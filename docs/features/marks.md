---
title: Marks
description: Visual mark indicators in the gutter, global mark persistence across files and sessions, and a grouped marks picker.
tags:
    - features
    - keybindings
---

Vim marks work out of the box via the codemirror-vim engine. Vim Motions adds three enhancements: gutter indicators that show where marks are set, persistence for global marks across files and restarts, and a grouped picker for quick navigation.

## Gutter indicators

When you set a mark with `m{a-z}` or `m{A-Z}`, the mark letter appears in a dedicated gutter column to the left of line numbers. Multiple marks on the same line are shown together (e.g., `ab`); if more than three marks share a line, the display truncates with an ellipsis (e.g., `abc…`). The indicators update automatically when marks are moved, deleted, or when text edits shift line positions.

Mark labels use a fixed font size regardless of the content line — heading lines won't inflate the mark indicators. Global marks (`A`–`Z`) render in a distinct color from local marks (`a`–`z`).

Clicking a mark label in the sign column moves the cursor to that line.

The sign column has three modes, with optional width control:

| Mode   | Vimrc                   | Lua                             | Behavior                                                 |
| ------ | ----------------------- | ------------------------------- | -------------------------------------------------------- |
| Auto   | `set signcolumn=auto`   | `vim.opt.signcolumn = "auto"`   | Show the gutter column when marks exist, hide when empty |
| Auto:N | `set signcolumn=auto:3` | `vim.opt.signcolumn = "auto:3"` | Same as auto, but reserve N character slots (1–4)        |
| Always | `set signcolumn=yes`    | `vim.opt.signcolumn = "yes"`    | Always reserve gutter space, even with no marks          |
| Yes:N  | `set signcolumn=yes:2`  | `vim.opt.signcolumn = "yes:2"`  | Always reserve N character slots                         |
| Off    | `set signcolumn=no`     | `vim.opt.signcolumn = "no"`     | Never show mark indicators                               |

Toggle via **Settings → Vim Motions → Vim features → Sign column**. `set markgutter` / `set nomarkgutter` remain as backward-compatible aliases.

Mark indicators also appear in the `statuscolumn` unified gutter when `%s` is included in the format string (e.g., `vim.opt.statuscolumn = "%s %l %r %C"`).

The gutter layout from left to right is: **sign column → line numbers → fold column → content**, matching Neovim's default arrangement.

## Global mark persistence

Standard vim marks `a`–`z` are buffer-local and exist only while the file is open. Global marks `A`–`Z` are persisted across files and plugin restarts:

- Set mark `A` with `mA` in any file — it stores the file path and cursor position
- Navigate to mark `A` from any file with `'A` or `` `A `` — opens the target file and jumps to the saved position
- Global marks survive closing files, switching tabs, and restarting Obsidian
- File renames automatically update all global marks pointing to the renamed file
- File deletes automatically remove global marks pointing to the deleted file

> [!tip]
> Use global marks to bookmark locations you return to frequently. `mA` for your daily note, `mB` for your current project — then `'A` and `'B` jump there from anywhere.

## Marks picker

Open the marks picker with `:marks` or `<leader>fm`. Marks are grouped by category:

- **Buffer marks** (`a`–`z`) — local to the current file, showing line number and content preview
- **Global marks** (`A`–`Z`) — showing the target file path and line number

Select a buffer mark to jump to its position. Select a global mark to open the target file and navigate to the saved position. If a global mark points to a file that no longer exists, a notice is shown.

The picker supports fuzzy search across mark names, file paths, and line content.

## Keybindings

| Key                 | Action                                           |
| ------------------- | ------------------------------------------------ |
| `m{a-z}`            | Set buffer-local mark                            |
| `m{A-Z}`            | Set global mark (persisted)                      |
| `'{a-z}`            | Jump to buffer mark (line)                       |
| `` `{a-z} ``        | Jump to buffer mark (exact position)             |
| `'{A-Z}`            | Jump to global mark (opens file)                 |
| `` `{A-Z} ``        | Jump to global mark (opens file, exact position) |
| `<leader>fm`        | Open marks picker                                |
| `:marks`            | Open marks picker                                |
| `:delmarks {marks}` | Delete specified marks                           |
