---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, a telescope-style fuzzy picker, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.ob` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn` (including `undotree()`), `vim.api` (buffer APIs, `nvim_set_hl`), `vim.ob` (68 Obsidian-specific functions: metadata, filesystem, UI, cursor, surround, leader), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.regex` (ECMAScript RegExp), `vim.schedule`/`vim.uv` timers, 19 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), async file reading (`vim.ob.fs.read`), multi-file configs via `require()`, and fuzzy picker API
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 75+ configurable settings
- **[[flash|Flash motions]]** — enhanced `f`/`F`/`t`/`T` with jump labels, incremental `s` search, post-commit `/`/`?` labels, clever-f
- **[[easymotion|EasyMotion / Hop]]** — jump to any visible position with two keystrokes
- **[[workspace-navigation|Workspace keyboard control]]** — navigate panes, tabs, and sidebar without a mouse
- **[[surround|Surround]]** — add, change, or delete surrounding delimiters (nvim-surround parity, custom pairs)
- **[[hardwrap|Hard-wrap formatting]]** — Markdown-aware `gq`/`gw` operators
- **[[ex-commands|100+ ex commands]]** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, fuzzy picker commands, and more
- **[[hint-mode|Vimium-style hints]]** — navigate the entire Obsidian UI with keyboard hints
- **[[undo-tree|Undo tree]]** — branching undo history visualization with `g-`/`g+` chronological navigation, `:earlier`/`:later` time travel, sidebar tree view, and optional persistence

## Get started

> [!tip] New to Vim Motions?
> Start with [[installation]] to install the plugin, then follow [[recommended-setup]] to configure Obsidian for the best experience.

## Quick links

- **[[keybindings|Keybinding cheat sheet]]** — complete reference for all motions, text objects, operators, and commands
- **[[settings|Settings reference]]** — all 100 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.141.0

- **Workspace nav no longer disables global keybindings** — turning off [[workspace-navigation|workspace navigation]] previously also disabled the `:` ex command line in reading view, `vim.obsidian.keymap.set` mappings, and [[hint-mode|hint mode]] global hotkeys. These now work independently of the workspace navigation setting ([#164](https://github.com/saberzero1/motions/issues/164))
- **Lua `vim.keymap.del` survives settings reload** — Lua keymap deletions (e.g., removing the default `<leader><leader>h` hint mode mapping) are now re-applied after every settings change, and all leader-based mappings include proper mode context for reliable per-mode removal ([#162](https://github.com/saberzero1/motions/issues/162))
- **Fork: per-mode `unmap` of context-less mappings** — `Vim.unmap(lhs, 'normal')` now correctly splits context-less `:map` entries into per-mode entries for the remaining modes, matching Neovim's `:nunmap` behavior
- **Command palette no longer lags in visual-line mode** — opening the palette from visual-line mode previously dispatched 400+ CM6 transactions for availability checks; now skips unnecessary selection expansion during the checking path ([#163](https://github.com/saberzero1/motions/issues/163))
- **Stale visual-line selection cache fix** — cached visual-line selections are now validated against document length, preventing `RangeError` crashes after document replacement

See the [[changelog|full changelog]] for details.
