---
title: Marks
description: Visual mark indicators in the gutter, global mark persistence across files and sessions, and a grouped marks picker.
tags:
    - features
    - keybindings
---

Vim marks work out of the box via the codemirror-vim engine. Vim Motions adds three enhancements: gutter indicators that show where marks are set, persistence for global marks across files and restarts, and a grouped picker for quick navigation.

## Gutter indicators

When you set a mark with `m{a-z}` or `m{A-Z}`, the mark letter appears in the gutter area next to the marked line. Multiple marks on the same line are shown together (e.g., `ab`). The indicators update automatically when marks are moved, deleted, or when text edits shift line positions.

The gutter indicators use no extra horizontal space — they overlay the existing gutter area without shifting document content.

Toggle via **Settings → Vim Motions → Vim features → Mark gutter indicators**, `vim.opt.markgutter = false` in Lua, or `set nomarkgutter` in vimrc.

## Global mark persistence

Standard vim marks `a`–`z` are buffer-local and exist only while the file is open. Global marks `A`–`Z` are persisted across files and plugin restarts:

- Set mark `A` with `mA` in any file — it stores the file path and cursor position
- Navigate to mark `A` from any file with `'A` or `` `A `` — opens the target file and jumps to the saved position
- Global marks survive closing files, switching tabs, and restarting Obsidian

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
