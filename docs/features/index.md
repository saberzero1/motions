---
title: Features
description: Overview of all Vim Motions features — text objects, navigation, EasyMotion, workspace control, and more.
tags:
    - features
---

Vim Motions adds Markdown-aware editing capabilities to Obsidian's Vim mode. Each feature can be toggled independently in [[settings|Settings]].

## Markdown editing

- **[[text-objects|Text objects]]** — 12 Markdown-aware text objects for bold, italic, code, math, links, blockquotes, callouts, code blocks, tags, and table cells. Work with all standard Vim operators (`d`, `c`, `y`, `v`).
- **[[structural-navigation|Structural navigation]]** — jump between headings (`]h`/`[h`), list items (`]l`/`[l`), links (`]n`/`[n`), and open buffers (`]b`/`[b`). Works with counts and operators.
- **[[tables|Tables]]** — cell navigation (`]c`/`[c`), row navigation (`]r`/`[r`), cell text objects (`i|`/`a|`), table manipulation (`<Leader>t` prefix), auto-formatting, and a cursor-aware table widget for Live Preview.
- **[[hardwrap|Hard-wrap formatting]]** — `gq`/`gw` operators with Markdown-aware line wrapping. Preserves blockquote, list, and nested structural prefixes on continuation lines.

## Jump navigation

- **[[easymotion|EasyMotion / Hop]]** — jump to any visible position with two keystrokes. Find, word, line, and search motions. Works in operator-pending mode (`d` + easymotion) and visual mode. Live Preview aware.
- **[[harpoon|Harpoon]]** — pin files to numbered slots for instant switching (`<leader>1`–`<leader>9`). Cursor position tracked and restored. Pins persist across sessions; file renames update automatically.
- **[[hint-mode|Hint mode]]** — Vimium-style keyboard navigation for the entire Obsidian UI. Multiple actions: `f` activates, `F` opens in new pane, `yf` yanks, `df` closes. Works in editor, sidebar, tab bar, settings, and popout windows.

## Workspace & commands

- **[[workspace-navigation|Workspace navigation]]** — Neovim-style window management: `<C-w>` splits, `gt`/`gT` tabs, `gd` go-to-definition, `gO` outline, `gf` file switcher. Global key handler for non-editor views (PDF, graph, canvas).
- **[[ex-commands#Picker commands|Picker / Fuzzy finder]]** — telescope.nvim-inspired fuzzy picker with 12 built-in sources, preview pane, live grep, frecency scoring, meta-picker (`:Picker`), bundled integrations for Omnisearch, Tasks, and Dataview, and a [[picker-api|provider API]] for external plugin integration.
- **[[surround|Surround]]** — vim-surround implementation: `ds`/`cs`/`ys`/`S` with Markdown delimiter support. Count-prefix repeats delimiters (`2ysiw*` → `**word**`). Dot-repeatable.
- **[[ex-commands|Ex commands]]** — 60+ ex commands for file management (`:e`, `:w`, `:saveas`), buffer navigation (`:bn`, `:bp`, `:b`), window management (`:sp`, `:vs`, `:tabnew`), table manipulation, and Obsidian integration (`:ob`, `:sidebar`, `:grep`).
- **[[oil-explorer|Oil explorer]]** — oil.nvim-inspired file explorer: edit vault directories as buffers, create/rename/delete files with standard vim commands (`dd`, `o`, `cw`, `:w`).
- **[[snippets|Snippets]]** — VS Code-compatible snippet expansion with tabstop navigation, linked mirrors, variable resolution, choice nodes, context-aware filtering. Ships 40+ Obsidian-adapted snippets. User-defined snippets via JSON files or Lua DSL.

## Quality of life

- **[[marks|Marks]]** — Visual mark indicators in the gutter, global mark persistence across files and sessions, and a grouped marks picker with cross-file navigation.
- **[[quality-of-life|Quality of life]]** — Neovim defaults (`Y` → `y$`, `Q` → `@@`), yank highlight, smart list continuation on `o`/`O`, scrolloff, configurable insert escape sequences, vim mode status bar with optional powerline styling, which-key hints, chord display, and input method switching for CJK users.

## Configuration

All features are configurable via the [[settings|Settings UI]], [[lua-config|.obsidian.init.lua]], or [[vimrc|.obsidian.vimrc]]. See the [[keybindings|keybinding cheat sheet]] for a complete reference of all motions and commands.
