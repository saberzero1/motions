---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
tags:
    - getting-started
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, a telescope-style fuzzy picker, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.ob` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn` (including `undotree()`), `vim.api` (buffer APIs, `nvim_set_hl`), `vim.ob` (68 Obsidian-specific functions: metadata, filesystem, UI, cursor, surround, leader), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.regex` (ECMAScript RegExp), `vim.schedule`/`vim.uv` timers, 19 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), async file reading (`vim.ob.fs.read`), multi-file configs via `require()`, fuzzy picker API, and hot-reload on save
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 75+ configurable settings and hot-reload on save
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

## What's new in 1.4.0

- **Repeated snippet tabstops survive typing in Live Preview** — with a body like `$1 *a$2* *b$2* $0`, Tab placed both cursors correctly, but the first keystroke moved them outside the emphasis and outside the snippet's own fields, so the session was dropped and a second keystroke produced `*az*y *ybz*` where `*azy* *bzy*` was wanted. The guard that covers a tabstop jump now also covers the first edit at a tabstop ([[snippets|snippets]])
- **`<Esc>` now honours your own mappings** — `:imap <Esc> …` and `:vmap <Esc> …` did nothing at all, because the built-in mode exit ran before the mapping table was ever consulted. Only exact matches win, matching Neovim; `<C-[>` follows the mapping because it _is_ Escape, while `<C-c>` stays a dependable escape hatch, and a recursive `imap <Esc> <Esc>` falls back to the built-in exit ([[remapping|remapping]], [[vimrc|vimrc]])
- **`:stopinsert` (`:stopi`) exists** — it had been documented in three places without being implemented, so the published recipes for handing insert mode to another plugin silently left the editor in insert mode. It lands the cursor where `<Esc>` would and is a no-op outside insert mode ([[ex-commands|ex commands]])
- **Two previously unreported table defects are now recorded** — a snippet tabstop inside a table in Live Preview, and `set tablewidget=raw` not accepting typed text inside a table in Live Preview, where a typed character lands at the end of the document instead ([[known-limitations|known limitations]])

See the [[changelog|full changelog]] for details.
