---
title: Recommended setup
description: Configure Obsidian for the best Vim Motions experience by using the bundled vim engine.
tags:
    - getting-started
    - setup
---

## Disable built-in Vim mode

For the best experience, **disable** Obsidian's built-in Vim mode:

**Settings → Editor → Vim key bindings → off**

When built-in vim is off, Vim Motions provides its own enhanced vim engine — a [fork of codemirror-vim](https://github.com/saberzero1/codemirror-vim) — with significant improvements over the default.

## What the fork adds

The bundled fork provides:

- **Neovim-correct behavior** — `dd` cursor positioning, `J` join whitespace, `di{` multiline brackets, `dj`/`dk` at document boundaries, `:s` cursor, `%` string-awareness, `db`/`d2w` cross-line whitespace, `<<`/`>>` shiftwidth/expandtab support, block visual insert (`I`/`A`/`c`/`C`)
- **Correct cursor positioning in Live Preview** — prevents the cursor from snapping to delimiter boundaries when navigating into formatted content (`*`, `**`, `` ` ``, `~~`, `==`)
- **Async motion support** — enables native operator-pending EasyMotion (`d` + easymotion, `c` + easymotion, `y` + easymotion)
- **Improved vim state reliability** — default keymaps protected from accidental removal, partial key prefixes reset on focus loss, async motion races guarded by generation tracking, stale jumpList markers safely clamped
- **Theme-aligned styling** — cursor and selection colors use Obsidian's CSS variables (`--interactive-accent`, `--text-selection`)
- **Live Preview compatible visual-line mode** — `V` selection keeps collapsed markup collapsed instead of expanding hidden content

## Using built-in vim mode

> [!warning] The plugin's Vim features are off while built-in Vim mode is on
> With **Settings → Editor → Vim key bindings** on, Obsidian's own Vim engine owns the editor and Vim Motions stands its Vim layer down. None of its motions, text objects, operators, surround, flash, EasyMotion, hint mode, which-key, jump list, workspace keys, vimrc or Lua configuration are installed, and the **Toggle Vim mode** commands decline with "Disable Obsidian's built-in Vim mode first." Turning built-in Vim mode on while the plugin's Vim is running turns the plugin's off.

What still applies is what does not depend on the plugin's Vim engine: the [[tables#Reveal mode|reveal table mode]], which edits a table as lines of the note under whichever Vim is running, and the plugin's settings and commands that are not Vim keys.

Measured on Obsidian 1.13.7: with built-in Vim mode on, `]h` leaves the cursor where it was, where the plugin's engine moves to the next heading.

## Ecosystem compatibility

When the bundled fork is active, the plugin installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins can discover the Vim API at its canonical location. Any plugin that uses this standard discovery path — the same path Obsidian's own code uses — automatically works with the fork. See [[ecosystem-compatibility]] for details.

> [!warning] Hotkey conflicts
> Obsidian's default hotkeys for Ctrl+W, Ctrl+D, Ctrl+F and Ctrl+B conflict with workspace navigation keys, and those for Ctrl+O (Quick switcher) and Ctrl+I (Toggle italics) with the jump list's `<C-o>` and `<C-i>`. Normal-mode `<Tab>` is `<C-i>` too, and is not affected. Ctrl+E (Toggle reading view), Ctrl+T (New tab) and Ctrl+G (Open graph view) take `<C-e>` scrolling, insert-mode `<C-t>` indenting and `<C-g>`. Ctrl+N, Ctrl+P and Ctrl+6 also overlap Vim keys, but are left to Obsidian: `j`, `k` and `:e #` do the same. The plugin detects these conflicts on startup and shows a Notice with instructions. You can also check for conflicts anytime via **Settings → Vim Motions → Navigation → Check hotkey conflicts**.
