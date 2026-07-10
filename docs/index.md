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
- **[[settings|Settings reference]]** — all 60 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.47.0

- **Yank highlight** — yanked text is briefly highlighted, giving visual feedback on what was yanked. Three modes: "Solid" (Neovim-style), "Fade" (gradual fade-out), or "Off". Duration is configurable (50–3000 ms). Works with remapped yank keys. Replaces the external [obsidian-vim-yank-highlight](https://github.com/aleksey-rowan/obsidian-vim-yank-highlight) plugin. Requires bundled fork mode.
- **Embedded table editing mode** — new `'embedded'` option for the table widget. Tables render as themed HTML with cell-level navigation (`h`/`j`/`k`/`l`), vim-enabled cell editors (`i`/`a`/`c`/`s`/`Enter`), and direct table manipulation (`o`/`O` add rows, `dd` delete row, `dc` delete column, `J`/`K`/`H`/`L` move rows/columns, `I`/`A` add columns, `=` realign). Cell edits have per-cell undo granularity.
- **Oil explorer rewritten** — oil no longer creates temporary `oil~*.md` files in the vault. The directory listing now uses a dedicated `oil-explorer` view type with an embedded CodeMirror 6 editor, eliminating temp file visibility in tabs, search, and graph. Includes a new reusable `EmbeddableMarkdownEditor` abstraction for mounting full CM6 + vim editors in any DOM container.

See the [[changelog|full changelog]] for details.
