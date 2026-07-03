---
title: Settings reference
description: Complete reference for all Vim Motions settings — defaults, valid ranges, and vimrc equivalents.
tags:
    - configuration
    - settings
    - reference
---

# Settings reference

All features can be toggled independently in **Settings → Vim Motions**. Changes take effect immediately without restarting. On Obsidian 1.13.0+, all settings are indexed by Obsidian's global settings search.

## Vim features

| Name                             | Type     | Default  | Range/Options             | Vimrc                  | Description                                                                              |
| -------------------------------- | -------- | -------- | ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Text objects                     | toggle   | `true`   | —                         | `set textobjects`      | Enable Markdown-aware text objects (`i*`, `a*`, `il`, etc.).                             |
| Structural navigation            | toggle   | `true`   | —                         | `set navigation`       | Enable heading, list, and link navigation motions (`]h`, `[h`, `]l`, etc.).              |
| Hard-wrap operator (gq)          | toggle   | `true`   | —                         | `set hardwrap`         | Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.             |
| Smart list continuation on o/O   | toggle   | `true`   | —                         | `set listcontinuation` | Automatically continue list markers (bullets, numbers, checkboxes) when pressing o or O. |
| Table navigation                 | toggle   | `true`   | —                         | `set tablenav`         | Enable table cell navigation motions (`]\|`, `[\|`, `]c`, `[c`).                         |
| Table widget in live preview     | dropdown | `cursor` | `always`, `cursor`, `off` | `set tablewidget`      | Controls how tables display in Live Preview.                                             |
| Formatting marks in Live Preview | dropdown | `cursor` | `cursor`, `off`           | —                      | Corrects cursor positioning near formatting marks in Live Preview.                       |
| Workspace navigation             | toggle   | `true`   | —                         | `set workspacenav`     | Enable pane/tab/sidebar control (`<C-w>h/j/k/l`, `gt`, `gT`, etc.).                      |

> [!warning]
> **Workspace navigation**: `<C-w>` may conflict with Obsidian's "Close current tab" hotkey. Rebind it in **Settings → Hotkeys**.

## Vim engine

| Name                       | Type     | Default | Range/Options                     | Vimrc                         | Description                                              |
| -------------------------- | -------- | ------- | --------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Clipboard                  | dropdown | `(off)` | `unnamed`, `unnamedplus`, `(off)` | `set clipboard`               | Sync yank/delete/paste with the system clipboard.        |
| Tabstop                    | slider   | `4`     | 1–8                               | `set tabstop`                 | Tab display width.                                       |
| Shiftwidth                 | slider   | `4`     | 1–8                               | `set shiftwidth`              | Indent width.                                            |
| Expand tab                 | toggle   | `true`  | —                                 | `set expandtab`               | Use spaces instead of tabs.                              |
| Insert mode escape         | text     | `(off)` | —                                 | `set insertmodeescape`        | Two-key sequence to exit insert mode (e.g., `jk`).       |
| Insert mode escape timeout | number   | `1000`  | 100–5000                          | `set insertmodeescapetimeout` | Timeout in milliseconds for insert mode escape sequence. |
| Textwidth                  | number   | `80`    | 0–200                             | `set textwidth`               | Line wrap width for `gq`/`gw` (0 to disable).            |

## Jump navigation

| Name                        | Type   | Default                      | Range/Options | Vimrc                   | Description                                                   |
| --------------------------- | ------ | ---------------------------- | ------------- | ----------------------- | ------------------------------------------------------------- |
| EasyMotion                  | toggle | `true`                       | —             | `set easymotion`        | Enable easymotion/hop navigation (`<leader><leader>w`, etc.). |
| EasyMotion dimming          | toggle | `true`                       | —             | `set easymotiondimming` | Dim non-target text when EasyMotion is active.                |
| EasyMotion label characters | text   | `asdghklqwertyuiopzxcvbnmfj` | —             | `set easymotionlabels`  | Characters used for EasyMotion labels.                        |
| Hint mode                   | toggle | `true`                       | —             | `set hintmode`          | Enable vimium-style link hints to click UI elements.          |
| Hint mode label characters  | text   | `asdfghjkl`                  | —             | `set hintlabels`        | Characters used for hint labels.                              |
| Hint mode global hotkey     | hotkey | `(off)`                      | —             | —                       | Key combination to trigger hint mode from anywhere.           |
| Label font size             | slider | `14`                         | 10–20         | `set labelfontsize`     | Font size for EasyMotion and hint mode labels.                |

## Status bar

| Name                       | Type   | Default | Range/Options | Vimrc              | Description                                                   |
| -------------------------- | ------ | ------- | ------------- | ------------------ | ------------------------------------------------------------- |
| Vim mode status bar        | toggle | `true`  | —             | `set statusbar`    | Show current Vim mode in the status bar.                      |
| Vim chord display          | toggle | `true`  | —             | `set chorddisplay` | Show pending keystrokes in the status bar.                    |
| Powerline-style status bar | toggle | `false` | —             | `set powerline`    | Color the Vim mode indicator with per-mode background colors. |

## Vim mode display prompt

| Name                | Type | Default   | Range/Options | Vimrc                       | Description                       |
| ------------------- | ---- | --------- | ------------- | --------------------------- | --------------------------------- |
| Normal mode prompt  | text | `NORMAL`  | —             | `let g:mode_prompt_normal`  | Status bar text for normal mode.  |
| Insert mode prompt  | text | `INSERT`  | —             | `let g:mode_prompt_insert`  | Status bar text for insert mode.  |
| Visual mode prompt  | text | `VISUAL`  | —             | `let g:mode_prompt_visual`  | Status bar text for visual mode.  |
| Replace mode prompt | text | `REPLACE` | —             | `let g:mode_prompt_replace` | Status bar text for replace mode. |

## Cursor shapes

> [!info]
> Cursor shapes require bundled fork mode. Disable Obsidian's built-in Vim key bindings to enable these options.

| Name             | Type     | Default     | Range/Options                         | Vimrc           | Description                             |
| ---------------- | -------- | ----------- | ------------------------------------- | --------------- | --------------------------------------- |
| Normal mode      | dropdown | `block`     | `block`, `bar`, `underline`, `hollow` | `set guicursor` | Cursor shape for normal mode.           |
| Insert mode      | dropdown | `bar`       | `block`, `bar`, `underline`, `hollow` | `set guicursor` | Cursor shape for insert mode.           |
| Visual mode      | dropdown | `block`     | `block`, `bar`, `underline`, `hollow` | `set guicursor` | Cursor shape for visual mode.           |
| Replace mode     | dropdown | `underline` | `block`, `bar`, `underline`, `hollow` | `set guicursor` | Cursor shape for replace mode.          |
| Operator-pending | dropdown | `underline` | `block`, `bar`, `underline`, `hollow` | `set guicursor` | Cursor shape for operator-pending mode. |

## Vimrc & key bindings

| Name                   | Type   | Default   | Range/Options | Vimrc | Description                                          |
| ---------------------- | ------ | --------- | ------------- | ----- | ---------------------------------------------------- |
| Load `.obsidian.vimrc` | toggle | `true`    | —             | —     | Load key mappings and settings from .obsidian.vimrc. |
| Custom vimrc path      | text   | `(empty)` | —             | —     | Path to a vimrc file in your vault.                  |

## Leader key bindings

Map leader key sequences to Obsidian commands. This UI allows you to add new bindings by specifying a key sequence and picking an Obsidian command from a searchable list. Existing bindings can be removed via the trash icon. These are applied in addition to any bindings defined in your vimrc.

## Which-key hints

| Name                      | Type     | Default   | Range/Options          | Vimrc                  | Description                                  |
| ------------------------- | -------- | --------- | ---------------------- | ---------------------- | -------------------------------------------- |
| Which-key mode            | dropdown | `off`     | `off`, `leader`, `all` | `set whichkey`         | Show available key continuations in a popup. |
| Which-key leader grouping | dropdown | `grouped` | `grouped`, `flat`      | `set whichkeygrouping` | How leader key bindings are displayed.       |

## Which-key group labels

Name groups by their full key prefix. Use the leader character + prefix for leader groups (e.g., `\t` for table), or a raw prefix for non-leader groups (e.g., `cs` for surround changes). The UI provides a list of existing labels with the ability to add new ones or delete custom entries. Built-in features register default labels that your entries can override.

## Which-key command labels

Describe individual bindings in the which-key popup. The UI shows a list of all active bindings (including those from vimrc) and allows you to provide a custom label for each. Entries set in vimrc appear as read-only rows.

## Advanced

| Name                              | Type   | Default | Range/Options | Vimrc           | Description                                                          |
| --------------------------------- | ------ | ------- | ------------- | --------------- | -------------------------------------------------------------------- |
| Scrolloff lines                   | number | `5`     | `0–9999`      | `set scrolloff` | Number of lines to keep visible above and below when scrolling.      |
| Multi-line text object scan range | slider | `20`    | `5–200`       | `set scanlimit` | Maximum lines to scan in each direction for multi-line text objects. |

> [!tip]
> Set **Scrolloff lines** to `9999` to keep the cursor vertically centered.

## Settings not available via vimrc

- **Load .obsidian.vimrc** (`enableVimrc`): Cannot be set via vimrc because the setting itself determines whether the vimrc is loaded (circular dependency).
- **Hint mode global hotkey** (`hintModeHotkey`): Requires a specialized recording UI to capture modifier keys and cannot be easily represented as a simple string in a vimrc file.
- **Leader key bindings** (`leaderBindings`): While the plugin provides a UI for this, the same functionality is already achievable via standard `nmap <leader>...` commands in your vimrc.
