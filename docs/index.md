---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, a telescope-style fuzzy picker, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.ob` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn`, `vim.api` (buffer APIs, `nvim_set_hl`), `vim.ob` (68 Obsidian-specific functions: metadata, filesystem, UI, cursor, surround, leader), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.schedule`/`vim.uv` timers, 17 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), and fuzzy picker API
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 35+ configurable settings
- **[[easymotion|EasyMotion / Hop]]** — jump to any visible position with two keystrokes
- **[[workspace-navigation|Workspace keyboard control]]** — navigate panes, tabs, and sidebar without a mouse
- **[[surround|Surround]]** — add, change, or delete surrounding delimiters (nvim-surround parity, custom pairs)
- **[[hardwrap|Hard-wrap formatting]]** — Markdown-aware `gq`/`gw` operators
- **[[ex-commands|100+ ex commands]]** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, fuzzy picker commands, and more
- **[[hint-mode|Vimium-style hints]]** — navigate the entire Obsidian UI with keyboard hints

## Get started

> [!tip] New to Vim Motions?
> Start with [[installation]] to install the plugin, then follow [[recommended-setup]] to configure Obsidian for the best experience.

## Quick links

- **[[keybindings|Keybinding cheat sheet]]** — complete reference for all motions, text objects, operators, and commands
- **[[settings|Settings reference]]** — all 65 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.63.0

- **Cross-note jump list** — `<C-o>` and `<C-i>` now navigate backward/forward through a cross-note jump history. Jumps are recorded on `gd`/`gD`, picker selection, harpoon, oil, hint mode, EasyMotion, and 40+ other navigation paths. Persists across sessions. New `:jumps` ex command and `jumplist`/`jumplistsize` settings.
- **Table cell vim modality** — cell editors in embedded table widget mode now support a two-Escape pattern: first Escape exits insert → normal mode within the cell, second Escape returns to table-nav mode. Entry via `i`, `a`, `c`, `s` with correct cursor semantics.
- **`ir`/`ar` table row text objects** — `ir` selects inner row content (between first and last `|`), `ar` selects the entire row including pipes.
- **Hint mode `F` on file explorer fixed** — pressing `F` in hint mode on file explorer entries and other generic targets now correctly opens in a new tab instead of the current tab. ([#70](https://github.com/saberzero1/motions/issues/70))
- **Jump list override preserved across vimrc reload** — the `jumpListWalk` action override is no longer lost when `reloadFeatures()` runs during vimrc loading.
- **First character no longer swallowed in table cell editor** — pressing `i` to enter a cell editor no longer drops the entry keystroke.

See the [[changelog|full changelog]] for details.
