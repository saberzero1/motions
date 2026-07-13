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

## What's new in 0.55.0

- **Sign column migrated to dedicated gutter column** — vim mark indicators now render in a proper CM6 gutter column instead of CSS overlays. Fixes marks cascading into wrong lines, overlapping on multi-mark lines, and inheriting heading font sizes. Gutter layout matches Neovim: sign column → line numbers → fold column → content. Runtime reconfiguration via `:set signcolumn=yes/auto/no`. ([#59](https://github.com/saberzero1/motions/issues/59))
- **Dual line number display** — new `linenumbermode` option shows absolute and relative line numbers in separate side-by-side gutter columns. `set number relativenumber linenumbermode=dual` renders both simultaneously. Configurable via Settings UI, vimrc, or `vim.opt.linenumbermode` in Lua.
- **`statuscolumn` API** — Neovim-compatible format string for user-configurable gutter layout: `%l` (line number), `%r` (relative number), `%s` (signs), `%C` (folds), `%=` (separator), and literal text. When set, replaces all individual gutter columns with a unified layout. Configurable via `vim.opt.statuscolumn` in Lua or `set statuscolumn` in vimrc. ([#59](https://github.com/saberzero1/motions/issues/59))
- **Global vs local mark colors** — global marks (`A`–`Z`) and local marks (`a`–`z`) render in distinct colors. Click-to-navigate on mark labels moves the cursor to the marked line.
- **Status bar duplication fix** — fixed vim mode indicator and chord display being duplicated when non-default clipboard or textwidth settings were saved. ([#63](https://github.com/saberzero1/motions/issues/63))

See the [[changelog|full changelog]] for details.
