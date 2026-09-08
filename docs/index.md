---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
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

## What's new in 0.148.0

- **Lazy `require()` now works** — every `lua/` module is read into memory when the configuration loads, so `require('plugin.module')` resolves synchronously from inside a `vim.keymap.set` callback, the idiom nearly the whole modern Neovim plugin ecosystem is built on ([[lua-config#require() resolves synchronously|Lua configuration]]) ([#177](https://github.com/saberzero1/motions/issues/177))
- **`vim.ui.select`, `vim.ui.input`, and `vim.ui.open`** — Neovim's UI-hook namespace, backed by the built-in [[picker-api|picker]] and an input modal. Both are non-blocking, so they work from a keymap callback, and `vim.ui` is a plain mutable table that dressing.nvim-style plugins can replace and restore
- **Large Neovim API expansion** — LuaJIT's `bit` library, `nvim_set_decoration_provider`, extmark `hl_eol`/`strict`/priority ordering, indexed scope access (`vim.bo[buf]`, `vim.wo[win]`, `vim.t[tab]`, …), real window-local options via `vim.wo`, `vim.fn.wincol`/`winlayout`, Unicode index conversion (`strchars`/`charidx`/`byteidx`), and working `nvim_list_bufs`/`nvim_tabpage_list_wins`
- **Vim patterns in `vim.regex`, `vim.fn.searchpos`, and `vim.fn.split`** — these compiled their pattern as a JavaScript regex, so Vim syntax such as `\V`, `\zs`, or `\<` silently matched nothing. **Breaking**: at the default magic level `+`, `?`, `(`, `)` and `|` are literal, so a pattern written as `\d+` must become `\d\+`
- **Text object, surround, and mapping fixes** — `di(`/`di{`/`di[` find the next pair ahead of the cursor like Neovim ([[text-objects|text objects]], [#178](https://github.com/saberzero1/motions/issues/178)), `ys` reaches every registered Markdown text object (`ysi$`, `ysa$`, `ysi=`, …) including dot-repeat ([[surround|surround]], [#179](https://github.com/saberzero1/motions/issues/179)), and `vim.keymap.set("", …)` now maps normal, visual, select, and operator-pending instead of normal only ([#180](https://github.com/saberzero1/motions/issues/180))
- **[[animated-cursor|Animated cursor]] follows the text while scrolling** — no phantom character left behind, and the cursor returns in ~55 ms instead of stalling. Animated cursor, cursor shape, snippet, and undo tree settings also apply without restarting Obsidian ([#181](https://github.com/saberzero1/motions/issues/181))

See the [[changelog|full changelog]] for details.
