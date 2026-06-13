# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-14

### Fixed

- `gd` on wiki links with display names (`[[file|display name]]`) now correctly navigates to the file instead of creating a new file with the display name in the path
- `gd` on wiki links with heading fragments (`[[file#heading|display]]`) correctly preserves the heading target
- EasyMotion keybindings (`<leader><leader>w/j/f`) now work — previously registered as literal `<leader>` strings in `mapCommand` which could never match typed input
- Hint mode (`<leader><leader>h`) same fix as EasyMotion
- Leader key bindings configured via settings UI or `.obsidian.vimrc` now work when workspace navigation is disabled — `:ob` ex command is registered unconditionally instead of only when workspace nav is on
- Leader key bindings no longer silently fail when obsidian-vimrc-support is installed — removed unnecessary guard that skipped `:ob` registration
- Leader key bindings survive settings hot-reload — `:ob` is re-registered in `reloadFeatures()` so it isn't left as a noop after toggling any setting
- Which-key overlay now dismisses when a key is pressed after it appears — previously `show()` reset `pendingLeader` state, preventing dismissal
- Which-key overlay no longer leaks `active-leaf-change` event listeners on destroy
- `ExCommandSuggest` is rebuilt after settings hot-reload so the completion list stays current

### Added

- `]c` / `[c` as alternative keybindings for table cell navigation, for keyboards where `|` requires AltGr or modifier keys
- EasyMotion and hint mode bindings now appear in the which-key overlay
- Which-key overlay rebuilds after settings hot-reload

### Changed

- Plugin initialization order restructured: leader key resolution (vimrc loading) now happens before feature registration, so EasyMotion and hint mode receive the correct leader key
- `registerObCommand` extracted as a standalone function, called unconditionally in both `onload()` and `reloadFeatures()`
- `LeaderBinding` now tracks `source` (`'builtin'` or `'user'`) to support selective clearing during hot-reload
- `LeaderRegistry` gains `clearBuiltinBindings()` for clean re-registration during `reloadFeatures()`
- `registerEasyMotion()` and `registerWorkspaceNavigation()` accept `LeaderRegistry` parameter

## [0.2.0] - 2026-06-13

### Fixed

- Vimrc path now uses `Vault.configDir` instead of hardcoded `.obsidian`, supporting custom config directories
- Setting descriptions use dynamic config directory path
- `:ob` with no arguments now opens a searchable modal listing all command IDs instead of logging to the developer console
- Coexistence E2E test now opens a file before assertions, fixing CI race condition
- Removed deprecated `setDynamicTooltip()` call on scrolloff slider

## [0.1.0] - 2026-06-13

### Added

#### Markdown text objects

- `i*` / `a*` — inside/around bold (`**...**`) or italic (`*...*`), with smart disambiguation
- `i_` / `a_` — inside/around italic (`_..._`)
- `` i` `` / `` a` `` — inside/around inline code
- `i$` / `a$` — inside/around math (`$...$`)
- `i~` / `a~` — inside/around strikethrough (`~~...~~`)
- `i=` / `a=` — inside/around highlight (`==...==`)
- `il` / `al` — inside/around links (`[[wikilink]]` or `[text](url)`)
- `iC` / `aC` — inside/around fenced code blocks
- `iB` / `aB` — inside/around blockquotes
- `io` / `ao` — inside/around callouts
- All delimiter-based text objects work across multiple lines (20-line scan limit)

#### Structural navigation

- `]h` / `[h` — next/previous heading (any level)
- `]1`–`]6` / `[1`–`[6` — next/previous heading by specific level
- `]l` / `[l` — next/previous list item (same indent level)
- `]n` / `[n` — next/previous link
- `]b` / `[b` — next/previous open buffer (tab), with fallback to recent files
- `]|` / `[|` — next/previous table cell

#### Operators

- `gq` — hard-wrap text at textwidth (default 80) with Markdown-aware prefix preservation (blockquotes, lists, nested structures)
- `gw` — same as `gq` but keeps cursor at original position

#### Workspace navigation

- `<C-w>h/j/k/l` — focus pane left/down/up/right
- `<C-w>v` / `<C-w>s` — split vertical/horizontal
- `<C-w>c` / `<C-w>q` — close current tab
- `<C-w>o` — close all other tabs
- `gt` / `gT` — next/previous tab
- `gd` — go to definition (follow link under cursor)
- `gx` — open URL under cursor in browser
- `gf` — open file switcher (quick open)
- `gO` — document outline navigator (searchable heading list)
- `grn` — rename current note
- `grr` — show backlinks to current note
- `gra` — context-aware actions for cursor position
- `g<C-g>` — show document statistics (words, lines, characters)
- `za` / `zc` / `zo` — toggle/close/open fold at cursor
- `zM` / `zR` — fold all / unfold all

#### Ex commands

- `:w` / `:write` — save current file
- `:q` / `:quit` — close current tab
- `:wq` — save and close
- `:bn` / `:bp` — next/previous tab
- `:bd` / `:bc` — close current tab
- `:only` — close all other tabs
- `:qa` / `:quitall` — close all tabs
- `:wa` / `:wall` — save all
- `:ob {command-id}` — execute any Obsidian command by ID
- `:ob` — list all available command IDs
- `:sidebar left` / `:sidebar right` — toggle sidebar
- `:explorer` — reveal active file in file explorer
- `:buffers` / `:ls` — show all open buffers in a modal
- `:backlinks` — show backlinks to current note in a modal
- `:grep {pattern}` — search vault for text, show results in a modal
- `:back` / `:forward` — navigate back/forward in history
- `:reg` / `:registers` — show register contents in a modal
- `:marks` — show marks and their positions in a modal

#### EasyMotion / Hop

- `<leader><leader>w` — label every word start in the viewport
- `<leader><leader>j` — label every non-empty line
- `<leader><leader>f{char}` — label every occurrence of a character
- `<leader><leader>h` — hint mode (Vimium-style labels for clickable UI elements)

#### Quality of life

- Vim mode status bar showing NORMAL / INSERT / VISUAL / REPLACE
- Macro recording indicator showing RECORDING @{register} in status bar
- Which-key hints overlay when leader key is pressed
- Ex command tab completion via Tab key
- Scrolloff (configurable visible lines above/below cursor)
- Configurable insert escape sequence (e.g., `jk` to exit insert mode via `set insertmodeescape=jk`)
- Settings hot-reload (toggle features without restarting Obsidian)

#### Vimrc loader

- Built-in `.obsidian.vimrc` support compatible with obsidian-vimrc-support syntax
- Supported commands: `map`, `nmap`, `imap`, `vmap`, `noremap`, `nnoremap`, `inoremap`, `vnoremap`, `unmap`, `set`, `let mapleader`, `exmap`, `obcommand`, `source`
- Supported `set` options: `clipboard`, `tabstop`/`ts`, `textwidth`/`tw`, `shiftwidth`/`sw`, `expandtab`/`et`, `insertmodeescape`/`ime`
- Leader key replacement in mappings (`<leader>` token)
- Leader key propagation to sourced files

#### Settings

- Independent toggles for all feature groups
- Leader key bindings table (add/remove key-to-command mappings without editing vimrc)
- Scrolloff slider (0–20 lines)
- EasyMotion label character customization
