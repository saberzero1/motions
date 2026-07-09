---
title: Configuration
description: Configure Vim Motions through the Settings UI, .obsidian.vimrc, or both.
tags:
    - configuration
---

Vim Motions can be configured through three mechanisms: the **Settings UI**, **Lua configuration**, and a **vimrc file**. All support plugin settings, and changes take effect immediately without restarting Obsidian.

## Lua configuration

Vim Motions supports `.obsidian.init.lua` for Neovim-style Lua configuration. This is the recommended configuration method — it provides conditional logic, function-based keymaps, and familiar Lua syntax for Neovim users.

See [[lua-config]] for the full Lua configuration reference.

## Vimrc

Vim Motions also supports `.obsidian.vimrc` files, compatible with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) syntax. This is a simpler alternative for users who prefer traditional Vim configuration syntax.

See [[vimrc]] for the vimrc reference.

## Settings UI

Open **Settings → Vim Motions** to access all configurable items organized into 12 groups. On Obsidian 1.13+, all settings are indexed by Obsidian's global settings search — type a setting name in the search bar to find it instantly.

See the [[settings|Settings reference]] for a complete list of all options with types, defaults, ranges, Lua, and vimrc equivalents.

## Override hierarchy

When Settings UI, vimrc, and init.lua configure the same option:

1. **init.lua wins** — Lua values take precedence over everything
2. **Vimrc wins over Settings UI** — vimrc values override Settings UI values
3. **Settings UI is preserved** — on-disk settings always reflect UI-set values
4. **Visual indicator** — overridden settings appear as disabled controls with a note showing the source (e.g., "Set by init.lua: `vim.opt.scrolloff = 10`")

## Quick links

- **[[lua-config]]**, Lua configuration with conditional logic and function keymaps
- **[[remapping]]**, how to remap any keybinding (editor, oil, picker, global)
- **[[settings]]**, complete settings reference (all items across 12 groups)
- **[[which-key]]**, which-key hints setup and configuration
- **[[cursor-shapes]]**, per-mode cursor shape configuration
- **[[status-bar]]**, mode display, chord display, and powerline styling
