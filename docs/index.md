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

## What's new in 0.99.0

- **`set nopcre` — Vim-style regular expressions** — switch from JavaScript/PCRE regexps to Vim-style regex syntax in search and substitution via `set nopcre`, `vim.opt.pcre = false`, or the Settings UI ([#111](https://github.com/saberzero1/motions/issues/111))
- **37 snippet variables** — expanded from 16 to 37 variables covering the full VSCode snippet spec, plus vim-ecosystem aliases (`$VISUAL`, `$WORD`). New: `$TM_SELECTED_TEXT` (wired), `$CLIPBOARD` (cache-ahead pattern), `$TM_CURRENT_LINE`, `$TM_LINE_NUMBER`, `$RELATIVE_FILEPATH`, `$WORKSPACE_NAME`, and more ([#110](https://github.com/saberzero1/motions/issues/110))
- **EasyMotion operator-pending inclusivity fix** — `y<leader><leader>fk{label}` now correctly includes the target character, matching native Vim semantics ([#109](https://github.com/saberzero1/motions/issues/109))
- **Cursor no longer stuck below YAML frontmatter** — fixed `k`/`gk`/`<Up>` unable to enter frontmatter in Live Preview with "Properties in document: Source" ([#77](https://github.com/saberzero1/motions/issues/77))
- **Embedded editor fixes** — Escape in operator-pending mode no longer exits textarea editors; keydown events no longer leak to parent modals; unmatched `<Space>` after failed multi-key sequences no longer inserts text ([#112](https://github.com/saberzero1/motions/issues/112))

See the [[changelog|full changelog]] for details.
