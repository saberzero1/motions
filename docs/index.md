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
- **[[settings|Settings reference]]** — all 66 configurable items with defaults and vimrc equivalents
- **[[known-limitations|Known limitations]]** — architectural constraints and workarounds

## What's new in 0.66.0

- **Async Lua execution** — Lua callbacks (keymaps, autocmds, timers, user commands) can now call async APIs via a coroutine↔Promise bridge. Top-level `init.lua` code supports async too. 10s timeout, 16-coroutine concurrency limit, `pcall`-compatible error handling.
- **`vim.ob.fs.read(path)` / `readlines(path)`** — read vault files from Lua. Both yield internally via the coroutine bridge and are catchable with `pcall`.
- **`require()` for multi-file Lua configs** — `require('mymodule')` loads `lua/mymodule.lua` from the vault root. Dot-separated names resolve to subdirectories. Module caching, circular-require detection, and path-traversal security.
- **`vim.regex()` — ECMAScript regular expressions in Lua** — `vim.regex(pattern, flags?)` creates a regex object with `match_str`, `match_line`, `match_pos`, `replace`, and `test` methods. Returns 0-based byte offsets matching Neovim's convention.
- **`load()` re-enabled** — `load(chunk)` compiles a Lua string and returns the compiled function (sandboxed; `dofile`/`loadfile` remain disabled).
- **Fengari fork: 53-bit integers** — `math.maxinteger` is now `9007199254740991` (2^53 − 1). `string.packsize("j")` returns 8. Bitwise operations remain 32-bit.
- **Fengari fork: `__gc` userdata finalization** — `__gc` metamethods on userdata are invoked via `FinalizationRegistry` when unreachable from JavaScript.
- **Fengari fork: zero runtime dependencies** — `sprintf-js` replaced with a custom `luaSprintf` formatter. Byte-identical output, no external packages.

See the [[changelog|full changelog]] for details.
