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
- **[[settings|Settings reference]]** — all 60 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.48.0

- **Mark gutter indicators** — vim mark letters (`a`–`z`, `A`–`Z`) appear in the gutter next to marked lines, providing visual feedback on where marks are set. Multiple marks on the same line are shown together (e.g., `ab`). Zero layout shift. Toggle via **Settings → Vim Motions → Vim features → Mark gutter indicators** (default: on).
- **Global mark persistence** — marks `A`–`Z` are persisted across files and plugin restarts. Setting `mA` stores the file path and cursor position; jumping to `'A` from any file opens the target and restores the cursor.
- **Grouped marks picker** — `:marks` and `<leader>fm` now show marks grouped by category: "Buffer marks" (`a`–`z`) with line preview, "Global marks" (`A`–`Z`) with file path. Selecting a global mark opens the target file and navigates to the saved position.
- **Yank highlight fix** — yank highlight now activates on the initially open editor at plugin startup, not only after switching panes ([#53](https://github.com/saberzero1/motions/issues/53)).

See the [[changelog|full changelog]] for details.
