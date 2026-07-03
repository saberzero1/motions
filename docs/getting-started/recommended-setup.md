---
title: Recommended setup
description: Configure Obsidian for the best Vim Motions experience by using the bundled vim engine.
tags:
    - getting-started
    - setup
---

# Recommended setup

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

The plugin also works with built-in vim mode enabled — it extends whatever vim engine is active. You get all the plugin features (text objects, navigation, EasyMotion, workspace control, etc.) but without the fork's Neovim-correct behavior and async motion support.

> [!info] Fork-only features
> These features require the bundled fork (built-in vim disabled):
>
> - Operator-pending EasyMotion (`d` + easymotion)
> - Surround (vim-surround)
> - Per-mode cursor shapes
> - Neovim-correct cursor positioning
> - Visual-line mode Live Preview fixes

## Ecosystem compatibility

When the bundled fork is active, the plugin installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins can discover the Vim API at its canonical location. Any plugin that uses this standard discovery path — the same path Obsidian's own code uses — automatically works with the fork. See [[ecosystem-compatibility]] for details.

> [!warning] `<C-w>` hotkey conflict
> Obsidian's default "Close current tab" hotkey is Ctrl+W, which conflicts with the `<C-w>` window prefix. To use `<C-w>` bindings, go to **Settings → Hotkeys**, search for "Close current tab", and remove or rebind the Ctrl+W hotkey. Close-tab remains available via `:q` or `:quit`.
