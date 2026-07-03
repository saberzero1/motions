---
title: Configuration
description: Configure Vim Motions through the Settings UI, .obsidian.vimrc, or both.
tags:
    - configuration
---

Vim Motions can be configured through two mechanisms: the **Settings UI** and a **vimrc file**. Both support all plugin settings, and changes take effect immediately without restarting Obsidian.

## Settings UI

Open **Settings → Vim Motions** to access all 43 configurable items organized into 12 groups. On Obsidian 1.13+, all settings are indexed by Obsidian's global settings search — type a setting name in the search bar to find it instantly.

See the [[settings|Settings reference]] for a complete list of all options with types, defaults, ranges, and vimrc equivalents.

## Vimrc

Vim Motions has built-in support for `.obsidian.vimrc` files, compatible with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) syntax. All plugin settings can be configured via `set` commands in vimrc. When vimrc is enabled (the default), vimrc values override the corresponding Settings UI values for the current session.

See [[vimrc]] for the full vimrc reference (Phase 2).

## Override hierarchy

When both Settings UI and vimrc configure the same option:

1. **Vimrc wins** — vimrc values take precedence for the current session
2. **Settings UI is preserved** — the on-disk settings file always reflects UI-set values
3. **Visual indicator** — overridden settings appear as disabled controls in the Settings tab with a note showing the vimrc directive (e.g., "Set by vimrc: `set scrolloff=10`")

## Quick links

- **[[settings]]** — complete settings reference (all 43 items across 12 groups)
- **[[which-key]]** — which-key hints setup and configuration (Phase 2)
- **[[cursor-shapes]]** — per-mode cursor shape configuration (Phase 3)
- **[[status-bar]]** — mode display, chord display, and powerline styling (Phase 3)
