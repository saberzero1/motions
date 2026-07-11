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
- **[[settings|Settings reference]]** — all 64 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.49.0

- **Which-key sort order** — configurable sort order for the which-key popup. "which-key" (default) matches which-key.nvim: individual keys first, groups last, alphanumeric before special keys. "Groups first" shows groups before individual keys. Configurable via **Settings → Vim Motions → Which-key sort order**, `vim.opt.whichkeysort` in Lua, or `set whichkeysort` in vimrc.
- **Which-key Lucide icons** — optional icon support for the which-key popup, inspired by which-key.nvim. Icons render inline via Obsidian's `setIcon()` API with 8 named theme colors or arbitrary CSS color strings. Per-entry icons assignable via Settings, Lua, or vimrc. Built-in defaults for Table, EasyMotion, and Harpoon groups. Toggle via `whichkeyicons` setting.
- **Harpoon-style file pinning** — pin files to numbered slots for instant switching. `<leader>ha` pins, `<leader>1`–`<leader>9` jumps to slots, `<leader>hp` opens the harpoon picker. Cursor position tracked per file and restored on navigation. Pins persist across sessions; file renames and deletes auto-update. 6 ex commands (`:HarpoonAdd`, `:HarpoonRemove`, `:Harpoon`, `:HarpoonSelect`, `:HarpoonNext`, `:HarpoonPrev`), 14 Obsidian commands, and 15 leader keybindings with which-key group.

See the [[changelog|full changelog]] for details.
