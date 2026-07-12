---
title: Settings reference
description: Complete reference for all Vim Motions settings — defaults, valid ranges, and vimrc equivalents.
tags:
    - configuration
    - settings
    - reference
---

All features can be toggled independently in **Settings → Vim Motions**. Changes take effect immediately without restarting. On Obsidian 1.13.0+, all settings are indexed by Obsidian's global settings search.

## Mobile

| Name             | Type   | Default | Range/Options | Lua | Vimrc | Description                                                                                                    |
| ---------------- | ------ | ------- | ------------- | --- | ----- | -------------------------------------------------------------------------------------------------------------- |
| Enable on mobile | toggle | `false` | —             | —   | —     | Activate the plugin on mobile devices. Disabled by default because most mobile users lack a hardware keyboard. |

> [!tip]
> Changing this setting requires an Obsidian reload. You can also toggle it from the command palette: **Vim Motions: Toggle enable on mobile**.

## Vim features

| Name                           | Type     | Default  | Range/Options                         | Lua                             | Vimrc                       | Description                                                                                       |
| ------------------------------ | -------- | -------- | ------------------------------------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- | ----- | --------------- |
| Text objects                   | toggle   | `true`   | —                                     | `vim.opt.textobjects`           | `set textobjects`           | Enable Markdown-aware text objects (`i*`, `a*`, `il`, etc.).                                      |
| Structural navigation          | toggle   | `true`   | —                                     | `vim.opt.navigation`            | `set navigation`            | Enable heading, list, and link navigation motions (`]h`, `[h`, `]l`, etc.).                       |
| Hard-wrap operator (gq)        | toggle   | `true`   | —                                     | `vim.opt.hardwrap`              | `set hardwrap`              | Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.                      |
| Smart list continuation on o/O | toggle   | `true`   | —                                     | `vim.opt.listcontinuation`      | `set listcontinuation`      | Automatically continue list markers (bullets, numbers, checkboxes) when pressing o or O.          |
| Table navigation               | toggle   | `true`   | —                                     | `vim.opt.tablenav`              | `set tablenav`              | Enable table cell navigation motions (`]                                                          | `, `[ | `, `]c`, `[c`). |
| Table widget in live preview   | dropdown | `cursor` | `embedded`, `always`, `cursor`, `off` | `vim.opt.tablewidget`           | `set tablewidget`           | Controls how tables display in Live Preview.                                                      |
| Yank highlight                 | dropdown | `solid`  | `off`, `solid`, `fade`                | `vim.opt.yankhighlightmode`     | `set yankhighlightmode`     | Highlight yanked text. "Solid" appears and disappears (Neovim-style). "Fade" gradually fades out. |
| Yank highlight duration        | slider   | `200`    | 50–3000 ms                            | `vim.opt.yankhighlightduration` | `set yankhighlightduration` | How long the yank highlight stays visible.                                                        |
| Mark gutter indicators         | toggle   | `true`   | —                                     | `vim.opt.markgutter`            | `set markgutter`            | Show vim mark letters in the gutter next to marked lines.                                         |

> [!tip]
> Override the highlight color with a CSS snippet: set `--vim-motions-yank-bg` on `.theme-dark` or `.theme-light` (e.g., `--vim-motions-yank-bg: rgba(255, 200, 0, 0.4);`).

| Workspace navigation | toggle | `true` | — | `vim.opt.workspacenav` | `set workspacenav` | Enable pane/tab/sidebar control (`<C-w>h/j/k/l`, `gt`, `gT`, etc.). |
| Fuzzy picker for buffers | toggle | `true` | — | — | — | Use the unified fuzzy picker for `:buffers`, `:ls`, `:marks`, `:registers`, and `:grep`. |
| Picker leader mappings | toggle | `true` | — | — | — | Enable default `<leader>f*` picker mappings and which-key labels. |
| Picker matching engine | dropdown | `ufuzzy` | `ufuzzy`, `obsidian` | — | — | Fuzzy matching engine. uFuzzy is a fast pure-JS matcher with filename-aware ranking. Obsidian uses the built-in `prepareFuzzySearch` API. |
| Workspace navigation view types | text | `(empty)` | — | `vim.opt.workspacenavviewtypes` | `set workspacenavviewtypes` | Comma-separated view types where scroll and count keys are intercepted. Empty uses defaults. |
| Fold-aware navigation | toggle | `true` | — | `vim.opt.foldawarenavigation` | `set foldawarenavigation` | Automatically unfold sections when navigating into them (e.g., `]h` into a folded heading). Matches Neovim's default `foldopen` behavior. |
| Fold persistence | toggle | `false` | — | `vim.opt.foldpersistence` | `set foldpersistence` | Remember fold state across file switches and sessions. Capped at 500 files, 30-day TTL. |

> [!warning]
> **Workspace navigation**: `<C-w>` may conflict with Obsidian's "Close current tab" hotkey. Rebind it in **Settings → Hotkeys**.

## Vim engine

| Name                       | Type     | Default | Range/Options                     | Lua                               | Vimrc                         | Description                                              |
| -------------------------- | -------- | ------- | --------------------------------- | --------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Clipboard                  | dropdown | `(off)` | `unnamed`, `unnamedplus`, `(off)` | `vim.opt.clipboard`               | `set clipboard`               | Sync yank/delete/paste with the system clipboard.        |
| Tabstop                    | slider   | `4`     | 1–8                               | `vim.opt.tabstop`                 | `set tabstop`                 | Tab display width.                                       |
| Shiftwidth                 | slider   | `4`     | 1–8                               | `vim.opt.shiftwidth`              | `set shiftwidth`              | Indent width.                                            |
| Expand tab                 | toggle   | `true`  | —                                 | `vim.opt.expandtab`               | `set expandtab`               | Use spaces instead of tabs.                              |
| Insert mode escape         | text     | `(off)` | —                                 | `vim.opt.insertmodeescape`        | `set insertmodeescape`        | Two-key sequence to exit insert mode (e.g., `jk`).       |
| Insert mode escape timeout | number   | `1000`  | 100–5000                          | `vim.opt.insertmodeescapetimeout` | `set insertmodeescapetimeout` | Timeout in milliseconds for insert mode escape sequence. |
| Textwidth                  | number   | `80`    | 0–200                             | `vim.opt.textwidth`               | `set textwidth`               | Line wrap width for `gq`/`gw` (0 to disable).            |

## Jump navigation

| Name                        | Type   | Default                      | Range/Options | Lua                         | Vimrc                   | Description                                                   |
| --------------------------- | ------ | ---------------------------- | ------------- | --------------------------- | ----------------------- | ------------------------------------------------------------- |
| EasyMotion                  | toggle | `true`                       | —             | `vim.opt.easymotion`        | `set easymotion`        | Enable easymotion/hop navigation (`<leader><leader>w`, etc.). |
| EasyMotion dimming          | toggle | `true`                       | —             | `vim.opt.easymotiondimming` | `set easymotiondimming` | Dim non-target text when EasyMotion is active.                |
| EasyMotion label characters | text   | `asdghklqwertyuiopzxcvbnmfj` | —             | `vim.opt.easymotionlabels`  | `set easymotionlabels`  | Characters used for EasyMotion labels.                        |
| Hint mode                   | toggle | `true`                       | —             | `vim.opt.hintmode`          | `set hintmode`          | Enable vimium-style link hints to click UI elements.          |
| Hint mode label characters  | text   | `asdfghjkl`                  | —             | `vim.opt.hintlabels`        | `set hintlabels`        | Characters used for hint labels.                              |
| Hint mode global hotkey     | hotkey | `(off)`                      | —             | —                           | —                       | Key combination to trigger hint mode from anywhere.           |
| Label font size             | slider | `14`                         | 10–20         | `vim.opt.labelfontsize`     | `set labelfontsize`     | Font size for EasyMotion and hint mode labels.                |
| Harpoon file pinning        | toggle | `true`                       | —             | `vim.opt.harpoon`           | `set harpoon`           | Pin files to numbered slots for instant switching.            |

## File explorer

| Name                     | Type     | Default | Range/Options           | Lua                                 | Vimrc                           | Description                                              |
| ------------------------ | -------- | ------- | ----------------------- | ----------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Oil explorer             | toggle   | `true`  | —                       | `vim.opt.oilexplorer`               | `set oilexplorer`               | Enable the oil-style file explorer (`:Oil` command).     |
| Show hidden files        | toggle   | `false` | —                       | `vim.opt.oilshowhiddenfiles`        | `set oilshowhiddenfiles`        | Show dotfiles and hidden folders in oil views.           |
| Confirm delete threshold | slider   | `1`     | 1–20                    | `vim.opt.oilconfirmdeletethreshold` | `set oilconfirmdeletethreshold` | Show confirmation when deleting this many files or more. |
| Default sort order       | dropdown | `name`  | `name`, `mtime`, `size` | `vim.opt.oildefaultsort`            | `set oildefaultsort`            | Default sort order for oil directory listings.           |

## Status bar

| Name                       | Type   | Default | Range/Options | Lua                    | Vimrc              | Description                                                   |
| -------------------------- | ------ | ------- | ------------- | ---------------------- | ------------------ | ------------------------------------------------------------- |
| Vim mode status bar        | toggle | `true`  | —             | `vim.opt.statusbar`    | `set statusbar`    | Show current Vim mode in the status bar.                      |
| Vim chord display          | toggle | `true`  | —             | `vim.opt.chorddisplay` | `set chorddisplay` | Show pending keystrokes in the status bar.                    |
| Powerline-style status bar | toggle | `false` | —             | `vim.opt.powerline`    | `set powerline`    | Color the Vim mode indicator with per-mode background colors. |

## Vim mode display prompt

| Name                        | Type | Default     | Range/Options | Lua                               | Vimrc                             | Description                                                 |
| --------------------------- | ---- | ----------- | ------------- | --------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Normal mode prompt          | text | `NORMAL`    | —             | `vim.g.mode_prompt_normal`        | `let g:mode_prompt_normal`        | Status bar text for normal mode.                            |
| Insert mode prompt          | text | `INSERT`    | —             | `vim.g.mode_prompt_insert`        | `let g:mode_prompt_insert`        | Status bar text for insert mode.                            |
| Visual mode prompt          | text | `VISUAL`    | —             | `vim.g.mode_prompt_visual`        | `let g:mode_prompt_visual`        | Status bar text for visual mode.                            |
| V-Line mode prompt          | text | `V-LINE`    | —             | `vim.g.mode_prompt_visual_line`   | `let g:mode_prompt_visual_line`   | Status bar text for visual line mode.                       |
| V-Block mode prompt         | text | `V-BLOCK`   | —             | `vim.g.mode_prompt_visual_block`  | `let g:mode_prompt_visual_block`  | Status bar text for visual block mode.                      |
| Replace mode prompt         | text | `REPLACE`   | —             | `vim.g.mode_prompt_replace`       | `let g:mode_prompt_replace`       | Status bar text for replace mode.                           |
| Select mode prompt          | text | `SELECT`    | —             | `vim.g.mode_prompt_select`        | `let g:mode_prompt_select`        | Status bar text for select mode.                            |
| Virtual replace mode prompt | text | `V-REPLACE` | —             | `vim.g.mode_prompt_vreplace`      | `let g:mode_prompt_vreplace`      | Status bar text for virtual replace mode.                   |
| Command mode prompt         | text | `COMMAND`   | —             | `vim.g.mode_prompt_command`       | `let g:mode_prompt_command`       | Status bar text for command-line mode.                      |
| Search mode prompt          | text | `SEARCH`    | —             | `vim.g.mode_prompt_search`        | `let g:mode_prompt_search`        | Status bar text for search mode.                            |
| Insert-normal mode prompt   | text | `NORMAL`    | —             | `vim.g.mode_prompt_insert_normal` | `let g:mode_prompt_insert_normal` | Status bar text when in normal mode via Ctrl-O from insert. |

## Cursor shapes

> [!info]
> Cursor shapes require bundled fork mode. Disable Obsidian's built-in Vim key bindings to enable these options.

| Name             | Type     | Default     | Range/Options                         | Lua | Vimrc           | Description                             |
| ---------------- | -------- | ----------- | ------------------------------------- | --- | --------------- | --------------------------------------- |
| Normal mode      | dropdown | `block`     | `block`, `bar`, `underline`, `hollow` | —   | `set guicursor` | Cursor shape for normal mode.           |
| Insert mode      | dropdown | `bar`       | `block`, `bar`, `underline`, `hollow` | —   | `set guicursor` | Cursor shape for insert mode.           |
| Visual mode      | dropdown | `block`     | `block`, `bar`, `underline`, `hollow` | —   | `set guicursor` | Cursor shape for visual mode.           |
| Replace mode     | dropdown | `underline` | `block`, `bar`, `underline`, `hollow` | —   | `set guicursor` | Cursor shape for replace mode.          |
| Operator-pending | dropdown | `underline` | `block`, `bar`, `underline`, `hollow` | —   | `set guicursor` | Cursor shape for operator-pending mode. |

## Vimrc & key bindings

| Name                           | Type     | Default     | Range/Options                           | Lua | Vimrc | Description                                                                                                                                                                                                                                         |
| ------------------------------ | -------- | ----------- | --------------------------------------- | --- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration mode             | dropdown | `lua-vimrc` | `lua-vimrc`, `lua`, `vimrc`, `settings` | —   | —     | How the plugin loads config files. Lua + Vimrc loads both with Lua priority.                                                                                                                                                                        |
| Custom vimrc path              | text     | `(empty)`   | —                                       | —   | —     | Override path to a vimrc file. Vault-relative or absolute (desktop only, e.g. `~/.config/obsidian/vimrc`). Leave empty to search: `vimrc`, `.vimrc`, `init.vim`, `.init.vim`, `obsidian.vimrc`, `obsidian.vim`, `.obsidian.vimrc`, `.obsidian.vim`. |
| Custom init.lua path           | text     | `(empty)`   | —                                       | —   | —     | Override path to an init.lua file. Vault-relative or absolute (desktop only, e.g. `~/.config/obsidian/init.lua`). Leave empty to search: `init.lua`, `.init.lua`, `obsidian.init.lua`, `.obsidian.init.lua`, `obsidian.lua`.                        |
| Show config load notifications | toggle   | `on`        | —                                       | —   | —     | Show a notification when vimrc or init.lua is loaded on startup. Error notifications are always shown regardless of this setting.                                                                                                                   |

## Leader key bindings

Map leader key sequences to Obsidian commands. This UI allows you to add new bindings by specifying a key sequence and picking an Obsidian command from a searchable list. Existing bindings can be removed via the trash icon. These are applied in addition to any bindings defined in your vimrc.

## Which-key hints

| Name                      | Type     | Default     | Range/Options               | Lua                        | Vimrc                  | Description                                                                                                                                                                 |
| ------------------------- | -------- | ----------- | --------------------------- | -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which-key mode            | dropdown | `off`       | `off`, `leader`, `all`      | `vim.opt.whichkey`         | `set whichkey`         | Show available key continuations in a popup.                                                                                                                                |
| Which-key leader grouping | dropdown | `grouped`   | `grouped`, `flat`           | `vim.opt.whichkeygrouping` | `set whichkeygrouping` | How leader key bindings are displayed.                                                                                                                                      |
| Which-key sort order      | dropdown | `which-key` | `which-key`, `groups-first` | `vim.opt.whichkeysort`     | `set whichkeysort`     | How entries are sorted. `which-key` matches which-key.nvim (keys first, groups last, alphanumeric before special). `groups-first` shows groups before keys, alphabetically. |
| Which-key icons           | toggle   | `true`      | —                           | `vim.opt.whichkeyicons`    | `set whichkeyicons`    | Show icons next to entries in the which-key popup. Built-in groups show default Lucide icons.                                                                               |
| Which-key popup delay     | number   | `500`       | 0–2000                      | `vim.opt.whichkeydelay`    | `set whichkeydelay`    | Delay in milliseconds before the popup appears. Subsequent keystrokes update the popup instantly.                                                                           |

## Which-key group labels

Name groups by their full key prefix. Use the leader character + prefix for leader groups (e.g., `\t` for table), or a raw prefix for non-leader groups (e.g., `cs` for surround changes). The UI provides a list of existing labels with the ability to add new ones or delete custom entries. Built-in features register default labels that your entries can override.

## Which-key command labels

Describe individual bindings in the which-key popup. The UI shows a list of all active bindings (including those from vimrc) and allows you to provide a custom label for each. Entries set in vimrc appear as read-only rows.

## Advanced

| Name                              | Type   | Default | Range/Options | Lua                 | Vimrc           | Description                                                          |
| --------------------------------- | ------ | ------- | ------------- | ------------------- | --------------- | -------------------------------------------------------------------- |
| Scrolloff lines                   | number | `5`     | `0–9999`      | `vim.opt.scrolloff` | `set scrolloff` | Number of lines to keep visible above and below when scrolling.      |
| Multi-line text object scan range | slider | `20`    | `5–200`       | `vim.opt.scanlimit` | `set scanlimit` | Maximum lines to scan in each direction for multi-line text objects. |

> [!tip]
> Set **Scrolloff lines** to `9999` to keep the cursor vertically centered.

## Third-party integrations

Bundled picker sources for popular community plugins. Sources register automatically when the target plugin is detected and unregister when it is disabled.

| Name           | Type   | Default | Description                                                        |
| -------------- | ------ | ------- | ------------------------------------------------------------------ |
| Omnisearch     | toggle | `true`  | Register Omnisearch as a picker source for full-text vault search. |
| Obsidian Tasks | toggle | `true`  | Register Obsidian Tasks as a picker source for navigating tasks.   |
| Dataview       | toggle | `true`  | Register Dataview as a picker source for browsing indexed pages.   |

## Input method

| Name                          | Type     | Default   | Range/Options                                 | Description                                                                                                          |
| ----------------------------- | -------- | --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Enable input method switching | toggle   | `false`   |                                               | Automatically switch input methods when entering/leaving insert mode. Desktop only.                                  |
| IM binary path                | text     |           |                                               | Absolute path to the IM switching binary (e.g., `/opt/homebrew/bin/macism`, `/usr/bin/fcitx5-remote`). Supports `~`. |
| Obtain IM arguments           | text     |           |                                               | Arguments to query the current IM. Empty for macism/im-select. `-n` for fcitx5-remote.                               |
| Switch IM arguments           | text     | `{im}`    |                                               | Arguments to switch IM. Use `{im}` as placeholder. `-s {im}` for fcitx5-remote. `engine {im}` for ibus.              |
| Normal mode IM                | text     |           |                                               | IM identifier to switch to in normal mode (e.g., `com.apple.keylayout.ABC`, `keyboard-us`, `1033`).                  |
| Insert mode IM behavior       | dropdown | `restore` | `Restore previous IM`, `Use fixed default IM` | Restore: switch back to the IM before leaving insert. Default: always switch to a fixed IM.                          |
| Default insert mode IM        | text     |           |                                               | IM identifier for insert mode (only when behavior is "Use fixed default IM").                                        |

> [!tip]
> The Lua API `vim.obsidian.im` provides programmatic control. Set `vim.obsidian.im.auto = false` in your `init.lua` to disable auto-wiring and handle switching entirely via autocmds.

## Settings not available via vimrc

- **Configuration mode** (`configMode`): Cannot be set via vimrc or init.lua because it controls which config files are loaded (circular dependency).
- **Hint mode global hotkey** (`hintModeHotkey`): Requires a specialized recording UI to capture modifier keys and cannot be easily represented as a simple string in a vimrc file.
- **Leader key bindings** (`leaderBindings`): While the plugin provides a UI for this, the same functionality is already achievable via standard `nmap <leader>...` commands in your vimrc.
- **Fuzzy picker for buffers** (`picker`): Currently only configurable in settings.
- **Picker leader mappings** (`pickerLeaderMappings`): Currently only configurable in settings.
- **Picker matching engine** (`pickerMatcherEngine`): Currently only configurable in settings. Default is `ufuzzy` (fast pure-JS matcher with filename-aware ranking). `obsidian` uses Obsidian's built-in `prepareFuzzySearch` API (zero bundle cost, maintained by Obsidian).
