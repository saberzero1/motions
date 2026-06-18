# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-18

### Added

#### New Vim commands

- `Q` — replay last recorded macro (Neovim default, maps to `@@`)
- `Y` — yank to end of line (Neovim default, maps to `y$`; overrides CM Vim's `yy` behavior)
- `ga` — show character info under cursor (codepoint, hex, octal) via Notice
- `gp` — paste and move cursor past pasted text
- `gn` / `gN` — select next/previous search match (CM Vim native, now tested)
- `g;` / `g,` — jump to older/newer change position (changelist navigation)
- `zO` / `zC` / `zA` — recursive fold open/close/toggle (maps to Obsidian's fold commands)
- `it` / `at` — HTML/XML tag text objects, implemented via raw text scanning since CM Vim's built-in `expandToTag` is inactive in Markdown mode. Supports single-line, multiline, and nested tags.
- `<C-v>` — visual block mode (CM Vim native, now tested)

#### New Ex commands

- `:e {file}` / `:edit {file}` — open file by name in vault
- `:e!` / `:edit!` — revert current file to saved version
- `:enew` — create new untitled note
- `:saveas {file}` — save current buffer as new file
- `:update` / `:up` — save current file (alias for `:w`)
- `:x` / `:xit` — write-if-modified and close
- `:xa` / `:xall` — write-if-modified all and close all
- `:find {file}` / `:fin` — find and open file by partial name match
- `:read {file}` / `:r` — insert file contents at cursor position
- `:b {name}` / `:buffer {name}` — switch to tab matching name
- `:bf` / `:bfirst` — go to first tab
- `:bl` / `:blast` — go to last tab
- `:bw` / `:bwipeout` — close current tab
- `:sp` / `:split` — horizontal split
- `:vs` / `:vsplit` — vertical split
- `:new` — horizontal split with new note
- `:vnew` — vertical split with new note
- `:tabnew` / `:tabedit` — open new tab (optionally with file)
- `:tabclose` / `:tabc` — close current tab
- `:tabonly` / `:tabo` — close all other tabs
- `:tabfirst` / `:tabrewind` — go to first tab
- `:tablast` / `:tabl` — go to last tab
- `:version` / `:ve` — show plugin version
- `:delmarks {marks}` — delete specified marks
- `:changes` — show change list in modal

#### Test infrastructure

- Shared test helpers module (`test/helpers.ts`) with `setupEditor`, `getCursorPos`, `getEditorValue`, `getRegisterContent`, `getVimMode`, `vimKeys`, and timing constants
- `unsupported()` and `deviation()` test helpers for documenting known limitations and behavioral differences in test reports
- Neovim command index manifest (`test/neovim-command-index.yaml`) tracking 227 commands with tier classification, test status, and test file references
- Coverage report script (`test/coverage-report.ts`) — run via `npm run test:coverage`
- 16 new test files in `test/specs/vim-builtin/` covering normal mode motions, search, editing, yank/put, insert entry, scroll, marks/jumps, g-commands, z-commands, bracket commands, text objects, operators, visual mode, insert mode, and Ex commands
- 6 new spike tests for register access, paste marks, editor extensions, tag text objects, CM Vim Ex command probing, and Ex command conflict checking
- Comprehensive E2E test coverage for `<C-w>h/j/k/l` pane focus, `H`/`M`/`L` screen-relative motions, `?` backward search, `zO`/`zC`/`zA` recursive folds, and all new Ex commands

### Changed

- Refactored 8 existing test files to use shared helpers from `test/helpers.ts` instead of locally defined `getEditorValue`, `getCursorLine`, and `vimKeys` functions
- Test-vault `hotkeys.json` now unbinds Obsidian shortcuts that conflict with Vim commands (`Ctrl+W`, `Ctrl+N`, `Ctrl+P`, `Ctrl+S`, `Ctrl+O`)
- Tag text objects (`it`/`at`) changed from `unsupported` skip to working plugin-implemented text objects
- `ChangeList` class gains `getEntries()` and `getIndex()` public accessors for the `:changes` Ex command

### Documentation

- `KNOWN_LIMITATIONS.md` expanded with comprehensive "Neovim Ex commands not applicable in Obsidian" section covering 30+ commands across 8 categories (shell, quickfix, tags, scripting, diff, etc.) with specific reasoning
- `KNOWN_LIMITATIONS.md` expanded with "Behavioral deviations" section documenting 6 commands that work differently from Neovim (`Y`, `Q`, `:wall`, `gf`, `zO`/`zC`/`zA`, `it`/`at`)

## [0.4.0] - 2026-06-14

### Changed

- **Lowered minimum Obsidian version from 1.13.0 to 1.1.1** — audited all Obsidian API usage and confirmed no API newer than 0.13.8 is required. Users on Obsidian 1.1.1 and later can now use the plugin.
- Replaced Obsidian's `setCssProps` prototype augmentation with standard `el.style.setProperty()` calls in EasyMotion and hint mode. Removes dependency on an undocumented global API whose introduction version is unknown, improving backward compatibility.
- Prefixed all plugin-owned CSS custom properties with `--vim-motions-` to avoid collisions with other plugins or themes:
    - `--em-left` → `--vim-motions-em-left`
    - `--em-top` → `--vim-motions-em-top`
    - `--hint-left` → `--vim-motions-hint-left`
    - `--hint-top` → `--vim-motions-hint-top`
    - `--hint-opacity` → replaced with `.is-dimmed` CSS class (avoids inline style assignment)

### Added

- E2E tests for blockquote text objects (`iB`/`aB`) and callout text objects (`io`/`ao`)
- E2E tests for buffer navigation (`]b`/`[b`)
- E2E tests for EasyMotion interaction (overlay appearance, dismissal, line/char label variants)
- E2E tests for workspace operations: splits (`<C-w>v`/`<C-w>s`), folds (`zc`/`zo`/`zM`/`zR`), tab navigation (`gT`), file switcher (`gf`), rename (`grn`), backlinks (`grr`), document stats (`g<C-g>`)
- E2E tests for ex commands with effect verification: `:q`, `:wq`, `:bp`, `:only`, `:back`, `:forward`, `:explorer`, `:ls`
- E2E tests for quality-of-life features: status bar mode display (NORMAL/INSERT/VISUAL), which-key overlay, ex command suggest
- E2E tests for settings hot-reload: toggling text objects, navigation, status bar, and EasyMotion on/off
- E2E tests for operator edge cases: bullet/numbered/nested list prefix preservation in `gq`, `gqj` (two-line wrap), `gqip` (paragraph reflow)
- E2E tests for text object edge cases: empty delimiters (`****`, `~~~~`, `====`), visual mode selection (`vi*`), yank (`yi*`)
- E2E tests for navigation edge cases: heading levels `]3`/`]4`/`[3`, ordered list navigation, last-heading boundary, cross-line link jumps

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
