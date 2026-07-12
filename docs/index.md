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

## What's new in 0.52.0

- **Line number gutter** — `set number`, `set relativenumber`, or both for hybrid mode. Matches Neovim semantics exactly. Runtime switching via `:set number` / `:set nonumber`. Configurable via settings, vimrc, or Lua (`vim.opt.number`, `vim.opt.relativenumber`).
- **Cursor line highlight** — `set cursorline` / `set nocursorline` with `cursorlineopt` (number/line/both).
- **Fold column** — `set foldcolumn` shows ▸/▾ indicators for foldable regions with click-to-fold.
- **Picker provider API** — external plugins can register custom picker sources via `window.VimMotions.picker.registerSource()`. Type definitions ship for consumer plugins.
- **Meta-picker** — `:Picker` (no arguments) opens a source browser listing all registered picker sources. `:Picker <source>` opens a named source directly.
- **Bundled picker integrations** — Omnisearch (full-text search), Obsidian Tasks (incomplete tasks by due date), and Dataview (indexed pages with tags/aliases). Gated by settings toggles in **Settings → Vim Motions → Third-party integrations**.
- **`signcolumn` option** — `enableMarkGutter` migrated to a dropdown with Auto/Always/Off modes matching Neovim's `signcolumn`. Existing settings auto-migrated.
- **Line numbers in table cells fix** — Obsidian's line number gutters no longer leak into embedded table cell editors. ([#19](https://github.com/saberzero1/motions/issues/19))

See the [[changelog|full changelog]] for details.
