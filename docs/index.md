---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn`, `vim.api` (buffer APIs, `nvim_set_hl`), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.schedule`/`vim.uv` timers, 12 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), and `vim.obsidian` namespace
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 35+ configurable settings
- **[[easymotion|EasyMotion / Hop]]** — jump to any visible position with two keystrokes
- **[[workspace-navigation|Workspace keyboard control]]** — navigate panes, tabs, and sidebar without a mouse
- **[[surround|Surround]]** — add, change, or delete surrounding delimiters (vim-surround)
- **[[hardwrap|Hard-wrap formatting]]** — Markdown-aware `gq`/`gw` operators
- **[[ex-commands|60+ ex commands]]** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, and more
- **[[hint-mode|Vimium-style hints]]** — navigate the entire Obsidian UI with keyboard hints

## Get started

> [!tip] New to Vim Motions?
> Start with [[installation]] to install the plugin, then follow [[recommended-setup]] to configure Obsidian for the best experience.

## Quick links

- **[[keybindings|Keybinding cheat sheet]]** — complete reference for all motions, text objects, operators, and commands
- **[[settings|Settings reference]]** — all 43 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.37.0

- **Batch which-key labels** — `vim.obsidian.whichkey.add({ { "<leader>f", group = "Find" }, { "<leader>w", desc = "Save" } })` defines multiple group and command labels in a single call, matching [which-key.nvim](https://github.com/folke/which-key.nvim) `wk.add()` syntax.
- **Config file fallback chains** — vimrc and Lua config files are now resolved via a fallback chain instead of a single hardcoded path. The plugin searches the vault root for `vimrc`, `.vimrc`, `init.vim`, `init.lua`, `.init.lua`, and more — non-dotfile names are preferred since Obsidian Sync skips dotfiles. Existing `.obsidian.vimrc` and `.obsidian.init.lua` files still work.

See the [[changelog|full changelog]] for details.
