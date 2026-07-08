---
title: Vim Motions
description: A polished, Neovim-native experience inside Obsidian. Markdown-aware text objects, structural navigation, EasyMotion, workspace control, and more.
---

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, a telescope-style fuzzy picker, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.ob` / `vim.tbl_*` / autocommands / timers / highlight groups / global keymaps / which-key labels, and a built-in `.obsidian.vimrc` loader.

## Feature highlights

- **[[text-objects|Markdown text objects]]** — operate on bold, italic, code, math, links, blockquotes, code blocks, tables, and more with standard Vim operators
- **[[structural-navigation|Structural navigation]]** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt` (including `guicursor`), `vim.fn`, `vim.api` (buffer APIs, `nvim_set_hl`), `vim.ob` (68 Obsidian-specific functions: metadata, filesystem, UI, cursor, surround, leader), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.schedule`/`vim.uv` timers, 15 autocommand events, buffer-local keymaps, `vim.obsidian.keymap` (global keymaps), `vim.obsidian.whichkey` (which-key labels), and fuzzy picker API
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader with 35+ configurable settings
- **[[easymotion|EasyMotion / Hop]]** — jump to any visible position with two keystrokes
- **[[workspace-navigation|Workspace keyboard control]]** — navigate panes, tabs, and sidebar without a mouse
- **[[surround|Surround]]** — add, change, or delete surrounding delimiters (nvim-surround parity, custom pairs)
- **[[hardwrap|Hard-wrap formatting]]** — Markdown-aware `gq`/`gw` operators
- **[[ex-commands|60+ ex commands]]** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, fuzzy picker commands, and more
- **[[hint-mode|Vimium-style hints]]** — navigate the entire Obsidian UI with keyboard hints

## Get started

> [!tip] New to Vim Motions?
> Start with [[installation]] to install the plugin, then follow [[recommended-setup]] to configure Obsidian for the best experience.

## Quick links

- **[[keybindings|Keybinding cheat sheet]]** — complete reference for all motions, text objects, operators, and commands
- **[[settings|Settings reference]]** — all 54 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.42.0

- **Mobile opt-in setting** — the plugin is now disabled by default on mobile. A new `enableOnMobile` toggle and command (`Vim Motions: Toggle enable on mobile`) let hardware-keyboard users opt in without affecting soft-keyboard-only users. ([#52](https://github.com/saberzero1/motions/issues/52))
- **Config load notification control** — new `showConfigNotifications` toggle suppresses vimrc/init.lua success notifications on startup. Error notifications always show.
- **Rendered markdown in picker previews** — the fuzzy picker preview pane now renders headings, bold, images, code blocks, and other markdown formatting instead of raw text.
- **Rendered markdown in table widget** — inline formatting (images, bold, math, links) inside table cells now renders correctly in the cursor-aware table widget. ([#50](https://github.com/saberzero1/motions/issues/50))
- **`:obcommand` available in all config modes** — `vim.cmd('obcommand ...')` now works in Lua-only mode; `:obcommand` with no arguments opens the command picker.

### Recent highlights (0.38–0.41)

- **Telescope-style fuzzy picker** (0.41) — 11 sources (files, buffers, commands, headings, live grep, marks, registers, …), preview pane, frecency scoring, `<C-x>`/`<C-v>`/`<C-t>` split-open, `<leader>f*` mappings, `vim.obsidian.pick()` Lua API
- **External config file paths** (0.41) — absolute paths (`~/.config/obsidian/init.lua`) for shared config across vaults ([#51](https://github.com/saberzero1/motions/issues/51))
- **`vim.ob.*` API expansion** (0.39) — 68 Obsidian-specific functions across `vim.ob.meta.*`, `vim.ob.fs.*`, `vim.ob.ui.*`, and editor state
- **Custom surround pairs** (0.38) — `vim.obsidian.surround.set("l", { left = "[[", right = "]]" })` for user-defined delimiters ([#36](https://github.com/saberzero1/motions/issues/36))
- **Surround nvim-surround parity** (0.40) — 73/74 golden tests passing against nvim-surround ([#41](https://github.com/saberzero1/motions/issues/41))
- **Leader key bindings in which-key** (0.40) — `vim.keymap.set` with `desc` auto-populates which-key; space-as-leader fixed ([#27](https://github.com/saberzero1/motions/issues/27))
- **3 new autocmd events** (0.39) — `LeafEnter`, `LeafLeave`, `FileType` (total: 15 events)

See the [[changelog|full changelog]] for details.
