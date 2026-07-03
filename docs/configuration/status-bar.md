---
title: Status bar
description: Configure the Vim mode status bar — mode display, chord display, powerline styling, and custom mode prompts.
tags:
    - configuration
---

Vim Motions shows the current Vim mode and pending keystrokes in Obsidian's status bar. All status bar features can be toggled and customized independently.

## Vim mode display

Shows `NORMAL`, `INSERT`, `VISUAL`, or `REPLACE` in the status bar. Toggle via **Settings → Vim Motions → Status bar → Vim mode status bar** or `set statusbar` / `set nostatusbar` in vimrc.

### Custom mode text

Customize the text shown for each mode via **Settings → Vim Motions → Vim mode display prompt** or in vimrc:

```vim
let g:mode_prompt_normal = "N"
let g:mode_prompt_insert = "I"
let g:mode_prompt_visual = "V"
let g:mode_prompt_replace = "R"
```

Supports any text including emoji — e.g., `let g:mode_prompt_normal = "🟢"`.

## Chord display

Shows pending keystrokes as you type a multi-key command (e.g., `2d`, `gq`, `<leader>t`). This helps confirm your input is being registered, especially for long sequences.

Toggle via **Settings → Vim Motions → Status bar → Vim chord display** or `set chorddisplay` / `set nochorddisplay` in vimrc.

## Macro recording indicator

When recording a macro, the status bar shows `RECORDING @{register}` (e.g., `RECORDING @q`). This is always active when the status bar is enabled.

## Powerline-style mode indicator

Optional colored mode indicator with per-mode background colors and a triangular separator. No special fonts required — the separator is a Unicode character.

Toggle via **Settings → Vim Motions → Status bar → Powerline-style status bar** or `set powerline` / `set nopowerline` in vimrc.

### Color customization

Override powerline colors via CSS custom properties in a CSS snippet:

```css
body {
    --vim-pl-normal-bg: #a3be8c;
    --vim-pl-insert-bg: #88c0d0;
    --vim-pl-visual-bg: #b48ead;
    --vim-pl-replace-bg: #bf616a;
}
```

These properties can also be configured via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin, which provides separate light and dark mode defaults.
