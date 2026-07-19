---
title: Getting started
description: Learn what Vim Motions does and how to set it up for the best experience.
tags:
    - getting-started
---

Vim Motions is an [Obsidian](https://obsidian.md) community plugin that enhances Vim mode with features tailored for Markdown editing. It bridges the gap between Neovim's capabilities and Obsidian's editor, giving you a polished Vim experience without leaving your vault.

## Who is it for?

Vim Motions is designed for **experienced Vim users** who use Obsidian as their primary editor. It assumes familiarity with Vim motions, operators, text objects, and ex commands. If you're new to Vim, consider learning the basics first — Obsidian's built-in Vim mode is a good starting point.

## What does it add?

Obsidian's built-in Vim mode provides basic motions and operators, but lacks Markdown-aware features. Vim Motions fills these gaps:

- **[[text-objects|Markdown text objects]]** — `i*`, `il`, `iC`, `iB`, `io`, `i|` and more — operate on bold, links, code blocks, blockquotes, callouts, and table cells
- **[[structural-navigation|Structural navigation]]** — `]h`/`[h` for headings, `]l`/`[l` for lists, `]n`/`[n` for links, `]b`/`[b` for buffers
- **[[tables|Table editing]]** — cell navigation, text objects, manipulation commands, format-on-exit auto-alignment, and a cursor-aware table widget
- **[[hardwrap|Hard-wrap formatting]]** — `gq`/`gw` operators with Markdown-aware prefix preservation
- **[[easymotion|EasyMotion]]** — jump to any visible position with two keystrokes, with operator-pending support
- **[[hint-mode|Hint mode]]** — Vimium-style keyboard navigation for the entire Obsidian UI
- **[[workspace-navigation|Workspace navigation]]** — `<C-w>` splits, `gt`/`gT` tabs, `:sp`/`:vs` ex commands
- **[[surround|Surround]]** — vim-surround with Markdown delimiter support (count-prefix for `**bold**`, `~~strike~~`)
- **[[ex-commands|100+ ex commands]]** — file, buffer, window, table, and navigation commands
- **[[lua-config|Lua configuration]]** — `.obsidian.init.lua` with `vim.keymap.set`, `vim.opt`, `vim.api`, `vim.tbl_*`, autocommands, timers, highlight groups, and `vim.obsidian` namespace
- **[[vimrc|Built-in vimrc]]** — `.obsidian.vimrc` loader compatible with obsidian-vimrc-support syntax

## Requirements

- Obsidian v1.6.6 or later
- Desktop and mobile (physical keyboard recommended on mobile — see [[known-limitations#Mobile support|mobile limitations]])

## Next steps

1. **[[installation]]** — install from the community directory or manually
2. **[[recommended-setup]]** — configure Obsidian for the best Vim Motions experience
