---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, a telescope-style fuzzy picker, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.ob` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn`, `vim.api` (buffer APIs, `nvim_set_hl`), `vim.ob` (68 Obsidian-specific functions: metadata, filesystem, UI, cursor, surround, leader), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.regex` (ECMAScript RegExp), `vim.schedule`/`vim.uv` timers, 19 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), async file reading (`vim.ob.fs.read`), multi-file configs via `require()`, and fuzzy picker API
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 35+ configurable settings
- **[[flash|Flash motions]]** — enhanced `f`/`F`/`t`/`T` with jump labels, incremental `s` search, post-commit `/`/`?` labels, clever-f
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
- **[[settings|Settings reference]]** — all 71 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.67.0

- **Flash motions** — enhanced `f`/`F`/`t`/`T` with jump labels on all visible matches ([flash.nvim](https://github.com/folke/flash.nvim)-inspired). Single match auto-jumps. Works with operators (`df`, `cf`, `yf`), visual mode, and `;`/`,` repeat. Multi-line search enabled by default.
- **Jump mode (`s`)** — bidirectional incremental character search. Type multiple characters to narrow the match set; labels update in real-time. Supports Backspace, Enter (jump to nearest), and autojump on single match. Operator-pending (`ds{pattern}{label}`) and visual mode supported.
- **Flash search mode** — after committing a `/` or `?` search with Enter, labels appear on all visible matches. Press a label key to jump directly.
- **Clever-f** — pressing `f{same-char}` after a flash jump falls through to stock `f` behavior (acts as `;`). 5-second timeout window. Opt-in via `set flashcleverf`.
- **Search match counter** — hlslens-style `[3/15]` indicator in the status bar showing the current match index and total count after `/` search and `n`/`N` navigation.
- **Textarea Escape fix** — Escape in normal mode within the textarea vim overlay now returns to the textarea without closing the parent modal, preventing data loss in plugin dialogs.
- **7 new flash settings** — `flash`, `flashmultiline`, `flashjump`, `flashjumpkey`, `flashcleverf`, `flashminpatternlength`, `flashsearch` — all configurable via Settings UI, vimrc, or Lua.

See the [[changelog|full changelog]] for details.
