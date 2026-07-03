---
title: Quality of life
description: Neovim defaults, smart list continuation, scrolloff, insert escape, status bar, which-key hints, and other convenience features.
tags:
    - features
    - keybindings
---

# Quality of life

Vim Motions includes several convenience features that improve the day-to-day Vim experience in Obsidian.

## Keybindings

![[keybindings#Quality of life]]

## Smart list continuation

Pressing `o` or `O` on a list line automatically continues the list marker on the new line. Supports:

- Unordered lists (`-`, `*`, `+`)
- Ordered lists (`1.`, `2.`)
- Task lists (`- [ ]`, `- [x]`), including custom checkbox states (`[!]`, `[?]`, `[/]`)
- Indented and nested lists
- Blockquote lists (`> - `)

Works correctly on the first line after YAML frontmatter. Disable for plain Neovim behavior via **Settings → Vim Motions → Smart list continuation on o/O** or `set nolistcontinuation` in vimrc.

## Neovim defaults

- `Y` yanks to end of line (`y$`) instead of the entire line — matching Neovim's default
- `Q` replays the last recorded macro (`@@`) instead of entering Ex mode — matching Neovim's default

## Vim mode status bar

Shows the current mode (NORMAL / INSERT / VISUAL / REPLACE) in Obsidian's status bar. Customizable per-mode text (including emoji) via **Settings → Vim Motions → Vim mode display prompt** or `let g:mode_prompt_normal = "N"` in vimrc.

## Vim chord display

Shows pending keystrokes (e.g., `2d`, `gq`) in the status bar as you type a multi-key command. Toggle via **Settings → Vim Motions → Vim chord display** or `set nochorddisplay` in vimrc.

## Powerline-style status bar

Optional colored mode indicator with per-mode background colors and a triangular separator. No special fonts required.

Override colors via CSS custom properties (`--vim-pl-normal-bg`, `--vim-pl-insert-bg`, `--vim-pl-visual-bg`, `--vim-pl-replace-bg`) or via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin with separate light/dark mode defaults.

Toggle via **Settings → Vim Motions → Powerline-style status bar** or `set powerline` / `set nopowerline` in vimrc.

## Which-key hints

Shows available key continuations in a popup after a short delay. Three modes:

- **Off** — no popup (default)
- **Leader key only** — popup appears after pressing the leader key
- **All partial keys** — popup appears after any partial key sequence (`d` shows motions/text objects, `g` shows g-prefixed commands, etc.)

Leader bindings can be grouped by prefix — pressing `<leader>` shows `t → Table (+11)` instead of listing all table commands. Drill into a group by pressing its key.

Configure via **Settings → Vim Motions → Which-key hints** or `set whichkey=leader` in vimrc. See [[which-key]] for detailed setup.

## Scrolloff

Configurable number of lines to keep visible above and below the cursor when scrolling (0–9999, default: 5).

> [!tip] Centered cursor
> Set `scrolloff=999` in your vimrc to keep the cursor vertically centered while scrolling — the standard Vim pattern for centered scrolling.

Adapts to your font size automatically via `EditorView.defaultLineHeight`. Configure via **Settings → Vim Motions → Advanced → Scrolloff lines** or `set scrolloff=5` in vimrc.

## Configurable insert escape

Set a two-key sequence to exit insert mode (e.g., `jk`, `jj`):

- `set insertmodeescape=jk` in vimrc
- **Settings → Vim Motions → Vim engine → Insert mode escape**

Timeout is configurable via `set insertmodeescapetimeout=1000` (default: 1000ms, matching Neovim's `timeoutlen`).

## Macro recording indicator

Shows `RECORDING @{register}` in the status bar when recording a macro.

## Ex command completion

Tab-complete ex commands as you type in the `:` command line.

## Settings hot-reload

All feature toggles and vim engine settings take effect immediately when changed — no Obsidian restart required. This includes clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, insertmodeescapetimeout, and textwidth.

See [[known-limitations#UI & display]] for known display-related limitations and [[known-limitations#Vimrc]] for vimrc timing issues.
