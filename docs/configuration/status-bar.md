---
title: Status bar
description: Configure the Vim mode status bar — mode display, chord display, powerline styling, and custom mode prompts.
tags:
    - configuration
---

Vim Motions shows the current Vim mode and pending keystrokes in Obsidian's status bar. All status bar features can be toggled and customized independently.

## Vim mode display

Shows `NORMAL`, `INSERT`, `VISUAL`, `V-LINE`, `V-BLOCK`, `REPLACE`, `SELECT`, `V-REPLACE`, `COMMAND`, `SEARCH`, or `NORMAL (insert-normal)` in the status bar. Toggle via **Settings → Vim Motions → Status bar → Vim mode status bar**, `vim.opt.statusbar = true` in Lua, or `set statusbar` / `set nostatusbar` in vimrc.

### Custom mode text

Customize the text shown for each mode via **Settings → Vim Motions → Vim mode display prompt**, in Lua, or in vimrc:

```lua
vim.g.mode_prompt_normal = "N"
vim.g.mode_prompt_insert = "I"
vim.g.mode_prompt_visual = "V"
vim.g.mode_prompt_replace = "R"
vim.g.mode_prompt_visual_line = "VL"
vim.g.mode_prompt_visual_block = "VB"
vim.g.mode_prompt_select = "S"
vim.g.mode_prompt_vreplace = "VR"
vim.g.mode_prompt_command = "CMD"
vim.g.mode_prompt_search = "/"
vim.g.mode_prompt_insert_normal = "(i)"
```

```vim
" Or via vimrc:
let g:mode_prompt_normal = "N"
let g:mode_prompt_insert = "I"
let g:mode_prompt_visual = "V"
let g:mode_prompt_visual_line = "VL"
let g:mode_prompt_visual_block = "VB"
let g:mode_prompt_replace = "R"
let g:mode_prompt_select = "S"
let g:mode_prompt_vreplace = "VR"
let g:mode_prompt_command = "CMD"
let g:mode_prompt_search = "/"
let g:mode_prompt_insert_normal = "(i)"
```

Supports any text including emoji — e.g., `vim.g.mode_prompt_normal = "🟢"`.

> [!info] Fork mode required
> Select, V-Replace, Command, Search, and Insert-Normal indicators require the fork's vim engine (recommended setup with built-in vim mode OFF). In built-in vim mode, only NORMAL, INSERT, VISUAL, and REPLACE are shown.

## Chord display

Shows pending keystrokes as you type a multi-key command (e.g., `2d`, `gq`, `<leader>t`). This helps confirm your input is being registered, especially for long sequences.

Toggle via **Settings → Vim Motions → Status bar → Vim chord display**, `vim.opt.chorddisplay = true` in Lua, or `set chorddisplay` / `set nochorddisplay` in vimrc.

## Macro recording indicator

When recording a macro, the status bar shows `RECORDING @{register}` (e.g., `RECORDING @q`). This is always active when the status bar is enabled.

## Powerline-style mode indicator

Optional colored mode indicator with per-mode background colors and a triangular separator. No special fonts required — the separator is a Unicode character.

Toggle via **Settings → Vim Motions → Status bar → Powerline-style status bar**, `vim.opt.powerline = true` in Lua, or `set powerline` / `set nopowerline` in vimrc.

### Color customization

Override powerline colors via CSS custom properties in a CSS snippet:

```css
body {
    --vim-pl-normal-bg: #a3be8c;
    --vim-pl-insert-bg: #88c0d0;
    --vim-pl-visual-bg: #b48ead;
    --vim-pl-v-line-bg: #b48ead;
    --vim-pl-v-block-bg: #b48ead;
    --vim-pl-replace-bg: #bf616a;
    --vim-pl-select-bg: #b48ead;
    --vim-pl-vreplace-bg: #bf616a;
    --vim-pl-command-bg: #88c0d0;
    --vim-pl-search-bg: #88c0d0;
}
```

These properties can also be configured via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin, which provides separate light and dark mode defaults.

## `data-vim-mode` attribute

The status bar element has a `data-vim-mode` attribute for CSS targeting. This allows you to apply custom styles to the status bar based on the current Vim mode.

Available attribute values:

- `normal`
- `insert`
- `visual`
- `v-line`
- `v-block`
- `replace`
- `select`
- `vreplace`
- `command`
- `search`
- `insert-normal`

Example CSS snippet targeting a specific mode:

```css
.vim-motions-mode[data-vim-mode='insert'] {
    border: 1px solid var(--text-accent);
}
```
