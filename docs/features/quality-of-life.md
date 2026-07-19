---
title: Quality of life
description: Neovim defaults, smart list continuation, scrolloff, insert escape, status bar, which-key hints, and other convenience features.
tags:
    - features
    - keybindings
---

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

Works correctly on the first line after YAML frontmatter. Disable for plain Neovim behavior via **Settings → Vim Motions → Smart list continuation on o/O**, `vim.opt.listcontinuation = false` in Lua, or `set nolistcontinuation` in vimrc.

## Yank highlight

Yanked text is briefly highlighted to provide visual feedback on what was yanked. Three modes are available in **Settings → Vim Motions → Vim features → Yank highlight**:

- **Solid** (default) — highlight appears instantly and disappears after the configured duration, matching Neovim's `vim.highlight.on_yank()` behavior
- **Fade** — highlight gradually fades out over the configured duration
- **Off** — no highlight

Duration is configurable via the **Yank highlight duration** slider (50–3000ms, default 200ms), or in your config:

- `vim.opt.yankhighlightmode = "solid"` / `vim.opt.yankhighlightduration = 200` in Lua
- `set yankhighlightmode=solid` / `set yankhighlightduration=200` in vimrc

> [!tip]
> Override the highlight color with a CSS snippet: set `--vim-motions-yank-bg` on `.theme-dark` or `.theme-light` (e.g., `--vim-motions-yank-bg: rgba(255, 200, 0, 0.4);`).

> [!info]
> Yank highlight requires bundled fork mode (built-in vim mode OFF). The built-in vim does not emit the `vim-yank` event used for detection. Works with remapped yank keys — detection is based on the actual yank operation, not keypress sniffing.

## Change list navigation

`g;` and `g,` jump to older and newer change positions respectively, letting you quickly revisit locations where you made edits. The `:changes` ex command displays the full change list in a modal.

## Undo tree navigation

| Key  | Action                                                         |
| ---- | -------------------------------------------------------------- |
| `g-` | Navigate to chronologically older undo state (across branches) |
| `g+` | Navigate to chronologically newer undo state (across branches) |

## Undo tree

Use `g-` and `g+` to move to older/newer undo states (branch-aware). Open the sidebar with `:UndoTreeToggle` (or `:UndoTreeShow` / `:UndoTreeHide`) to visualize branches, see relative timestamps, and preview the change summary for the selected node. Branch points include a toggle to collapse alternate histories.

Saved states can be navigated by count with `:earlier Nf` / `:later Nf` (where `N` is the number of saved states to move).

## Neovim defaults

- `Y` yanks to end of line (`y$`) instead of the entire line — matching Neovim's default
- `Q` replays the last recorded macro (`@@`) instead of entering Ex mode — matching Neovim's default

## Vim mode status bar

Shows the current mode (NORMAL / INSERT / VISUAL / REPLACE) in Obsidian's status bar. Customizable per-mode text (including emoji) via **Settings → Vim Motions → Vim mode display prompt**, `vim.g.mode_prompt_normal = "N"` in Lua, or `let g:mode_prompt_normal = "N"` in vimrc.

## Vim chord display

Shows pending keystrokes (e.g., `2d`, `gq`) in the status bar as you type a multi-key command. Toggle via **Settings → Vim Motions → Vim chord display**, `vim.opt.chorddisplay = false` in Lua, or `set nochorddisplay` in vimrc.

## Powerline-style status bar

Optional colored mode indicator with per-mode background colors and a triangular separator. No special fonts required.

Override colors via CSS custom properties (`--vim-pl-normal-bg`, `--vim-pl-insert-bg`, `--vim-pl-visual-bg`, `--vim-pl-replace-bg`) or via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin with separate light/dark mode defaults.

Toggle via **Settings → Vim Motions → Powerline-style status bar**, `vim.opt.powerline = true` in Lua, or `set powerline` / `set nopowerline` in vimrc.

## Which-key hints

Shows available key continuations in a popup after a short delay. Three modes:

- **Off** — no popup (default)
- **Leader key only** — popup appears after pressing the leader key
- **All partial keys** — popup appears after any partial key sequence (`d` shows motions/text objects, `g` shows g-prefixed commands, etc.)

Leader bindings can be grouped by prefix — pressing `<leader>` shows `t → Table (+11)` instead of listing all table commands. Drill into a group by pressing its key.

Configure via **Settings → Vim Motions → Which-key hints**, `vim.opt.whichkey = "leader"` in Lua, or `set whichkey=leader` in vimrc. See [[which-key]] for detailed setup.

## Scrolloff

Configurable number of lines to keep visible above and below the cursor when scrolling (0–9999, default: 5).

> [!tip] Centered cursor
> Set `vim.opt.scrolloff = 999` in your Lua config or `set scrolloff=999` in your vimrc to keep the cursor vertically centered while scrolling — the standard Vim pattern for centered scrolling.

Adapts to your font size automatically via `EditorView.defaultLineHeight`. Configure via **Settings → Vim Motions → Advanced → Scrolloff lines**, `vim.opt.scrolloff = 5` in Lua, or `set scrolloff=5` in vimrc.

## Configurable insert escape

Set a two-key sequence to exit insert mode (e.g., `jk`, `jj`):

- `vim.opt.insertmodeescape = "jk"` in Lua
- `set insertmodeescape=jk` in vimrc
- **Settings → Vim Motions → Vim engine → Insert mode escape**

Timeout is configurable via `vim.opt.insertmodeescapetimeout = 1000` in Lua or `set insertmodeescapetimeout=1000` in vimrc (default: 1000ms, matching Neovim's `timeoutlen`).

## Macro recording indicator

Shows `RECORDING @{register}` in the status bar when recording a macro.

## Ex command completion

Tab-complete ex commands as you type in the `:` command line.

## Settings hot-reload

All feature toggles and vim engine settings take effect immediately when changed — no Obsidian restart required. This includes clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, insertmodeescapetimeout, and textwidth.

See [[known-limitations#UI & display]] for known display-related limitations and [[known-limitations#Vimrc]] for vimrc timing issues.
