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

## What's new in 0.53.0

- **[[snippets|Snippets]]** — VS Code-compatible snippet expansion with tabstop navigation, linked mirrors, variable resolution, and context-aware filtering (prose/code/frontmatter). Ships 40+ Obsidian-adapted snippets. Three trigger modes: CM6 completion menu, Tab expansion, and ex commands (`:snippet`, `:snippets` picker). User-defined snippets via JSON files or LuaSnip-inspired Lua DSL with reactive `f()`/`d()` nodes.
- **Snippet Lua DSL** — `vim.snippet.*` API: `s()`, `t()`, `i()`, `c()`, `rep()`, `fmt()` for static snippets, plus `f()` (function nodes), `d()` (dynamic nodes), `sn()` (snippet nodes), `r()` (restore nodes) for reactive snippets that execute Lua at edit time.
- **Which-key fix** — descriptions now display correctly for keymaps set via `vim.keymap.set` and `vim.obsidian.leader.set` with space as leader. ([#58](https://github.com/saberzero1/motions/issues/58))
- **`vim.opt.clipboard` fix** — setting `vim.opt.clipboard = "unnamed"` or `vim.opt.textwidth` in init.lua now works correctly. Previously these options were silently ignored. ([#56](https://github.com/saberzero1/motions/issues/56))
- **Vim option architecture** — side-effect options (clipboard, textwidth, guicursor) now use a unified `SideEffectOpt` table, eliminating silent failures when adding new options via Lua or vimrc.

See the [[changelog|full changelog]] for details.
