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

## What's new in 0.150.0

- **Gutter settings apply immediately again** — toggling `number`, `relativenumber`, `signcolumn`, `foldcolumn`, `statuscolumn` or `cursorline` from settings, vimrc or `vim.opt` stored the value but never touched the editor, so every gutter change needed an Obsidian restart. All five reconfigure paths now reach the live editor, and the "requires a restart" note is gone from the docs ([[settings|settings reference]], [#184](https://github.com/saberzero1/motions/issues/184))
- **`cursorlineopt` accepts Neovim's full grammar, including `screenline`** — comma-separated lists over `line`, `screenline`, `number` and `both`, in any order, with Neovim's own rejections preserved. `screenline` highlights only the cursor's display row of a wrapped line. The default becomes Neovim's `both`; existing vaults are pinned to `number` so nothing changes appearance ([[vimrc|vimrc]], [[lua-config|Lua config]])
- **`Open configuration directory in system explorer`** — reveals the folder containing your active `init.lua` / `.obsidian.vimrc` with the file selected. That folder is the one `require()` searches for a `lua/` directory. Both configuration commands now handle configurations stored outside the vault, which previously opened nothing at all. Desktop only ([#182](https://github.com/saberzero1/motions/issues/182))
- **Four broken ex commands** — `:changes` was recognized but did nothing, `:edit!` created a junk note named `!.md` instead of reverting the buffer, `:violations!` printed the list it was asked to clear, and `:fold` was reachable only by accident. All four now behave as documented ([[ex-commands|ex commands]])
- **`zz` centers wrapped lines correctly** — centering measured the line's first display row, so on a long wrapped line `zz` pushed the cursor down and, past a full viewport, off screen entirely. `zt`/`z<CR>`/`zb`/`z-` gained the same cursor-visibility clamp; unwrapped lines are unchanged ([#183](https://github.com/saberzero1/motions/issues/183))
- **Lua coordinate correctness and stricter option writes** — byte offsets, cursor/mark reads, text, legacy positions and extmark columns now go through one typed adapter across 23 enumerated APIs, and `vim.opt` validates string options exactly as `set` does instead of storing illegal values verbatim ([[lua-config|Lua config]], [[known-limitations|known limitations]])

See the [[changelog|full changelog]] for details.
