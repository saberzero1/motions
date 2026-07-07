# Neovim Plugin Ecosystem Analysis for Vim Motions

_A comprehensive reference document analyzing the Neovim plugin ecosystem to identify features, architectural patterns, and implementation strategies that could benefit the Vim Motions plugin._

**Date**: July 2025

---

## Introduction

The Vim Motions plugin bridges the modal editing power of Neovim and the knowledge management environment of Obsidian. By leveraging a specialized codemirror-vim fork and a browser-safe fengari Lua 5.3 runtime, the plugin provides a first-class Vim experience within Electron-based environments.

This document catalogs extensive research into the Neovim plugin ecosystem to identify high-value functionality that can be ported or adapted to Obsidian. The analysis is constrained by the browser environment: there is no shell access, no native binaries, and all filesystem interactions must occur through Obsidian's internal Vault API. Each feature area is assessed for architectural patterns worth borrowing, implementation feasibility in-browser, and priority relative to user demand.

The five primary areas investigated are: picker/fuzzy finder, snippets, file explorer, folding, and a broad sweep of additional high-value plugin categories (marks, registers, motions, editing enhancements, undo, etc.). For each area, the document covers the Neovim plugin landscape, identifies what architectural patterns are portable, evaluates browser-compatible alternatives, and recommends an implementation approach.

### Methodology and Scope

This analysis was conducted by surveying the [awesome-neovim](https://github.com/rockerBOO/awesome-neovim) curated list, GitHub star counts, and community discussion (Reddit r/neovim, Neovim Discourse). The following awesome-neovim categories were investigated in depth:

**Investigated**: Fuzzy Finder, File Explorer, Snippet, Fold, Motion, Marks, Registers, Search, Editing Support (auto-pairs, comment, text objects, increment/decrement, split/join), Session, Statusline, UI Enhancement, Undo, Window Management, Zen/Focus.

**Deliberately excluded**: Categories that are not applicable to Obsidian's environment or are already well-served by Obsidian core features -- Terminal Integration, Git, LSP, Completion, Debugging, Test, Color/Colorscheme, Note Taking (Obsidian itself is the note-taking tool), Media, Remote Development, Deployment, Collaborative Editing, Language-Specific plugins.

For each investigated plugin, feasibility was assessed against three constraints: (1) runs in Electron/browser (no shell, no native binaries), (2) compatible with CodeMirror 6 and the codemirror-vim fork, (3) interoperable with Obsidian's plugin API and vault model. Star counts were captured in July 2025 and may drift over time.

---

## Table of Contents

1. [Current Plugin Capabilities Inventory](#1-current-plugin-capabilities-inventory)
2. [Picker and Fuzzy Finder](#2-picker-and-fuzzy-finder)
3. [Snippets](#3-snippets)
4. [File Explorer](#4-file-explorer)
5. [Folding](#5-folding)
6. [Additional High-Value Areas](#6-additional-high-value-areas)
7. [Grand Priority Matrix](#7-grand-priority-matrix)
8. [Technical Feasibility Notes](#8-technical-feasibility-notes)
9. [Obsidian Community Plugin Overlap](#9-obsidian-community-plugin-overlap)
10. [Performance, Bundle Size, and Mobile Considerations](#10-performance-bundle-size-and-mobile-considerations)
11. [References](#11-references)

---

## 1. Current Plugin Capabilities Inventory

This section establishes the baseline of the Motions plugin's existing feature set, organized by feature area. It serves as the foundation for gap analysis throughout the rest of the document.

### 1.1 Vim Commands and Motions

The plugin provides full Vim modal editing via a codemirror-vim fork (`@replit/codemirror-vim` forked at `saberzero1/codemirror-vim`), which includes:

- **Basic motions**: `h`/`j`/`k`/`l`, `w`/`b`/`e`/`W`/`B`/`E`, `f`/`F`/`t`/`T`, `^`/`$`, `0`, `gg`/`G`, `{`/`}`, `(`/`)`, `%`, and more
- **Operators**: `d` (delete), `c` (change), `y` (yank), `v` (visual), with all motion combinations
- **Registers**: All standard registers (`a`-`z`, `0`-`9`, `"`, `-`, `/`, etc.)
- **Marks**: Full mark support (`a`-`z` buffer-local, `A`-`Z` global, `0`-`9` numbered)
- **Macros**: Record (`q{register}`) and replay (`@{register}`, `@@`)
- **Visual modes**: Characterwise (`v`), linewise (`V`), blockwise (`<C-v>`)
- **All modes**: Normal, Insert, Visual, Replace, Select, Virtual Replace, Operator-pending, Command-line, Search

The fork provides additional capabilities over stock codemirror-vim: async motion support (for EasyMotion operator-pending), Neovim-correct cursor positioning, and various behavioral fixes. There are 756 golden test cases comparing behavior against headless Neovim, of which 476 pass and 280 are known deviations tracked in `test/neovim/deviations.ts`.

### 1.2 Markdown Text Objects (12)

All text objects work with standard operators (`d`, `c`, `y`, `v`) and support count prefixes where applicable.

| Key                 | Target              | Description                                                                          |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `i*` / `a*`         | Bold/Italic         | Content inside `*` or `**` delimiters                                                |
| `i_` / `a_`         | Italic (underscore) | Content inside `_` delimiters                                                        |
| `` i` `` / `` a` `` | Inline code         | Content inside backtick delimiters                                                   |
| `i$` / `a$`         | Math                | Content inside `$` or `$$` with smart disambiguation between inline and display math |
| `i~` / `a~`         | Strikethrough       | Content inside `~~` delimiters                                                       |
| `i=` / `a=`         | Highlight           | Content inside `==` delimiters                                                       |
| `il` / `al`         | Links               | Both wikilinks `[[...]]` and markdown links `[text](url)`                            |
| `iC` / `aC`         | Code blocks         | Fenced code blocks (``` delimiters)                                                  |
| `iB` / `aB`         | Blockquotes         | `>` prefixed blocks                                                                  |
| `io` / `ao`         | Callouts            | Obsidian callout blocks (`> [!type]`)                                                |
| `it` / `at`         | HTML/XML tags       | Standard tag pairs                                                                   |
| `i\|` / `a\|`       | Table cells         | Content between pipe characters in markdown tables                                   |

**Source file**: `src/text-objects/register.ts`

### 1.3 Structural Navigation

Jump between document structures with count support and operator-pending compatibility:

- `]h` / `[h` -- Next/previous heading (any level)
- `]1` through `]6` / `[1` through `[6` -- Next/previous heading of a specific level (1-6)
- `]l` / `[l` -- Next/previous list item (at the same indent level)
- `]n` / `[n` -- Next/previous link
- `]b` / `[b` -- Next/previous open buffer (tab)

**Source file**: `src/motions/register.ts`

### 1.4 Table Navigation and Manipulation

**Navigation**:

- `]\|` or `]c` -- Next table cell
- `[\|` or `[c` -- Previous table cell
- `]r` -- Next row (same column)
- `[r` -- Previous row (same column)

**Text objects**: `i\|` / `a\|` (inside/around table cell)

**Manipulation** (with `<leader>t` prefix):

- `<leader>tm` -- Insert table
- `<leader>to` / `<leader>tO` -- Add row below/above
- `<leader>tJ` / `<leader>tK` -- Move row down/up
- `<leader>tdd` -- Delete row
- `<leader>tiL` / `<leader>tiH` -- Add column right/left
- `<leader>tL` / `<leader>tH` -- Move column right/left
- `<leader>tdc` -- Delete column
- `<leader>tr` -- Realign table columns

**Source files**: `src/motions/tables.ts`, `src/motions/register.ts`

### 1.5 EasyMotion

Jump to any visible position with two keystrokes. All motions support operator-pending mode (e.g., `d<leader><leader>w` to delete to an EasyMotion target).

**Find motions**:

- `<leader><leader>f{char}` -- Find char forward
- `<leader><leader>F{char}` -- Find char backward
- `<leader><leader>s{char}` -- Find char bidirectional
- `<leader><leader>t{char}` -- Till before char forward
- `<leader><leader>T{char}` -- Till after char backward

**Word motions**:

- `<leader><leader>w` / `<leader><leader>b` -- Word start forward/backward
- `<leader><leader>e` / `<leader><leader>ge` -- Word end forward/backward
- `<leader><leader>W` / `<leader><leader>B` -- WORD start forward/backward
- `<leader><leader>E` / `<leader><leader>gE` -- WORD end forward/backward

**Line motions**: `<leader><leader>j` / `<leader><leader>k` -- Line down/up

**Search motions**: `<leader><leader>n` / `<leader><leader>N` -- Next/previous search match

**Features**: Configurable labels (default: `asdghklqwertyuiopzxcvbnmfj`), optional dimming of non-target text, Live Preview aware, operator-pending support.

**Source files**: `src/easymotion/register.ts`, `src/easymotion/targets.ts`, `src/easymotion/overlay.ts`

### 1.6 Surround

Full vim-surround implementation via the codemirror-vim fork, with Markdown delimiter support.

- `ds{target}` -- Delete surrounding (e.g., `ds*` removes bold markers)
- `dst` -- Delete surrounding HTML tag
- `cs{target}{replacement}` -- Change surrounding
- `cst{replacement}` -- Change surrounding tag
- `ys{motion}{replacement}` -- Add surround around motion target
- `ys{motion}<tag>` -- Surround with HTML tag
- `ysiwf` + name + Enter -- Surround with function call
- `ysiwF` + name + Enter -- Surround with spaced function call
- `yss{replacement}` -- Surround entire line
- `cS` / `yS` / `ySS` -- Newline surround variants
- `S{replacement}` -- Surround visual selection
- `S<tag>` -- Surround selection with HTML tag
- `gS` -- Newline surround selection
- Insert mode: `<C-G>s{char}` -- Type inside delimiters
- Count support: `2ds)`, `2cs)`, `2ysiw*`, `2ds*`
- Dot-repeatable

Surround requires fork mode (not available with Obsidian's built-in Vim mode). Markdown delimiter mappings are configurable via `surroundmap` in `.obsidian.vimrc`.

**Source files**: `src/vimrc/loader.ts`, `src/vimrc/parser.ts`

### 1.7 Hard-wrap Formatting

Markdown-aware line wrapping with structural prefix preservation:

- `gqq` / `gwq` -- Reformat current line at textwidth (default 80)
- `gqj` / `gwj` -- Reformat current and next line
- `gqip` / `gwip` -- Reformat paragraph
- Visual `gq` / `gw` -- Reformat selected lines

Preserves blockquote prefixes (`>`), list prefixes (bullets, numbers, checkboxes), and nested structural prefixes. Textwidth is configurable (default 80).

**Source file**: `src/operators/hardwrap.ts`

### 1.8 Hint Mode (Vimium-style)

Keyboard navigation for the entire Obsidian UI, not just the editor:

- `f` -- Show hint labels, activate target
- `F` -- Show hint labels, open target in new pane
- `yf` -- Show hint labels, yank target URL/text
- `df` -- Show hint labels, close target tab/pane
- `Nf` -- Activate N targets sequentially

Works in editor, sidebar, tab bar, settings, popout windows. Configurable hint characters (default: `asdfghjkl`), configurable hotkey. Targets standard HTML elements plus Obsidian-specific UI selectors.

**Source file**: `src/ui/hint-mode.ts`

### 1.9 Workspace Navigation

Neovim-style window and tab management mapped to Obsidian's pane/leaf system:

**Pane navigation**: `<C-w>h`/`j`/`k`/`l` (focus direction), `<C-w>v` (split vertical), `<C-w>s` (split horizontal), `<C-w>c` / `<C-w>q` (close tab), `<C-w>o` (close all other tabs)

**Tab navigation**: `gt` / `gT` (next/previous tab), `Ngt` (go to Nth tab), `g<C-t>` (go to tab by number), `H` / `L` (previous/next tab in non-editor views)

**History**: `Ctrl-o` / `Ctrl-i` (navigate back/forward)

**Link navigation**: `gd` (open link under cursor), `gD` (open in new tab), `<C-w>gd` (open in horizontal split), `<C-w>gD` (open in vertical split), `gx` (open URL in browser)

**File/note operations**: `gf` (file switcher / quick open), `grn` (rename current note), `grr` (show backlinks), `gra` (context-aware actions), `gO` (document outline), `g<C-g>` (document statistics)

**Paste operations**: `gp` / `gP` (paste and move cursor past pasted text)

**Character info**: `ga` (show character codepoint and hex)

**Change navigation**: `g;` / `g,` (jump to older/newer change position)

**Source files**: `src/workspace/navigation.ts`, `src/workspace/global-key-handler.ts`

### 1.10 Folding (Basic)

Current fold command support:

| Key  | Command           | Mechanism                            |
| ---- | ----------------- | ------------------------------------ |
| `zc` | Fold at cursor    | CM6 `foldCode`                       |
| `zo` | Unfold at cursor  | CM6 `unfoldCode`                     |
| `za` | Toggle fold       | CM6 `toggleFold`                     |
| `zM` | Fold all headings | Obsidian `editor:fold-all` command   |
| `zR` | Unfold all        | Obsidian `editor:unfold-all` command |
| `zO` | Recursive open    | Same as `zo`                         |
| `zC` | Recursive close   | Same as `zc`                         |
| `zA` | Recursive toggle  | Same as `za`                         |

**Not implemented**: `zf` (create fold), `zd`/`zD` (delete fold), `zE` (eliminate all folds), `zr`/`zm` (incremental fold level), custom fold text, markdown-aware fold providers.

**Important**: The codemirror-vim fork has ZERO fold commands in its default keymap. The `z` prefix is only used for scroll commands (`zz`, `zt`, `zb`). All fold support comes from the plugin via `reg.mapCommand()` in `navigation.ts`.

**Source file**: `src/workspace/navigation.ts`

### 1.11 Ex Commands (50+)

**File and buffer operations**: `:w` / `:write`, `:update` / `:up`, `:q` / `:quit`, `:wq`, `:x` / `:xit`, `:xa` / `:xall`, `:e {file}` / `:edit {file}`, `:e!` / `:edit!`, `:enew`, `:saveas {file}`, `:find {file}` / `:fin`, `:read {file}` / `:r`, `:bn` / `:bp`, `:b {name}` / `:buffer {name}`, `:bf` / `:bfirst`, `:bl` / `:blast`, `:bd` / `:bc`, `:bw` / `:bwipeout`, `:only`, `:qa`, `:wa` / `:wall`

**Window and tab management**: `:sp` / `:split`, `:vs` / `:vsplit`, `:new`, `:vnew`, `:tabnew` / `:tabedit`, `:tabclose` / `:tabc`, `:tabonly` / `:tabo`, `:tabfirst` / `:tabrewind`, `:tablast` / `:tabl`

**Table manipulation**: `:tableinsert`, `:tablerowafter` / `:tablerowbefore`, `:tablerowup` / `:tablerowdown`, `:tablerowdelete`, `:tablecolafter` / `:tablecolbefore`, `:tablecolleft` / `:tablecolright`, `:tablecoldelete`, `:tablealignleft` / `:tablealigncenter` / `:tablealignright`, `:tablerealign`

**Navigation and search**: `:explorer`, `:buffers` / `:ls`, `:backlinks`, `:grep {pattern}`, `:back` / `:forward`, `:marks`, `:changes`

**Obsidian integration**: `:ob {command-id}` (execute any Obsidian command by ID), `:ob` (list all available command IDs), `:sidebar left` / `:sidebar right`

**Utility**: `:reg` / `:registers`, `:delmarks {marks}`, `:version` / `:ve`, `:gmap`

**Source file**: `src/workspace/commands.ts`

### 1.12 Lua Configuration API

The plugin exposes a comprehensive Lua API through the fengari runtime, enabling `.obsidian.init.lua` configuration files.

**vim.opt** (40+ options): All plugin settings are accessible, including `textobjects`, `navigation`, `hardwrap`, `listcontinuation`, `tablenav`, `workspacenav`, `easymotion`, `easymotiondimming`, `hintmode`, `statusbar`, `chorddisplay`, `powerline`, `scrolloff`, `scanlimit`, `labelfontsize`, `tabstop`, `shiftwidth`, `textwidth`, `insertmodeescapetimeout`, `updatetime`, `clipboard`, `insertmodeescape`, `easymotionlabels`, `hintlabels`, `tablewidget`, `formattingmarkmode`, `whichkey`, `whichkeygrouping`, `whichkeydelay`, `workspacenavviewtypes`, `guicursor`.

**vim.g**: Global variables including `vim.g.mapleader` for leader key configuration.

**vim.cmd**: Execute any ex command as a string.

**vim.keymap**: `vim.keymap.set(mode, lhs, rhs, opts?)` for creating keymaps (supports function callbacks), `vim.keymap.del(mode, lhs)` for removal.

**vim.fn** (26 functions):

- Feature detection: `has(feature)` for platform/feature detection
- File operations: `expand(expr)`, `fnamemodify(path, mods)`, `filereadable(path)`, `isdirectory(path)`, `glob(pattern)`
- Mode/cursor: `mode()`, `line(expr)`, `col(expr)`, `getline(expr)`
- String functions: `tolower(s)`, `toupper(s)`, `trim(s)`, `strlen(s)`, `strwidth(s)`, `stridx(s, needle)`, `strridx(s, needle)`, `strpart(s, start, len?)`, `substitute(s, pat, sub, flags)`, `nr2char(n)`, `char2nr(c)`, `split(s, sep?)`, `join(list, sep?)`
- Time: `localtime()`, `strftime(fmt)`
- Variable checking: `exists(expr)`

**vim.api** (16 nvim\_\* functions):

- User commands: `nvim_create_user_command(name, cmd, opts)`
- Autocommands: `nvim_create_autocmd(event, opts)`, `nvim_create_augroup(name, opts)`, `nvim_del_autocmd(id)`, `nvim_del_augroup_by_name(name)`, `nvim_clear_autocmds(opts)`
- Highlights: `nvim_set_hl(ns, name, attrs)`, `nvim_get_hl(ns, name)`
- Buffer keymaps: `nvim_buf_set_keymap(buf, mode, lhs, rhs, opts)`, `nvim_buf_del_keymap(buf, mode, lhs)`
- Buffer lines: `nvim_buf_get_lines(buf, start, end, strict_indexing)`, `nvim_buf_set_lines(buf, start, end, strict_indexing, lines)`
- Buffer info: `nvim_get_current_buf()`, `nvim_buf_get_name(buf)`, `nvim_buf_line_count(buf)`
- Namespaces: `nvim_create_namespace(name)`

**vim.tbl\_\*** (12 table utilities): `tbl_extend`, `tbl_deep_extend`, `tbl_contains`, `tbl_keys`, `tbl_values`, `tbl_map`, `tbl_filter`, `tbl_count`, `tbl_isempty`, `tbl_get`

**Utilities**: `vim.json.encode(value)` / `vim.json.decode(str)`, `vim.inspect(value)`, `vim.split(s, sep, opts?)`, `vim.trim(s)`, `vim.startswith(s, prefix)`, `vim.endswith(s, suffix)`, `vim.deepcopy(value)`

**Async/timers**: `vim.schedule(fn)`, `vim.schedule_wrap(fn)`, `vim.defer_fn(fn, timeout)`, `vim.uv.new_timer()` with `start(delay, repeat, callback)` / `stop()` / `close()` / `is_closing()` / `is_active()`, `vim.uv.hrtime()`, `vim.uv.now()`, `vim.loop` (alias for `vim.uv`)

**Notifications**: `vim.notify(msg, level?)`, `vim.notify_once(msg, level?)`, with log levels `vim.log.levels.TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`

**vim.obsidian / vim.ob** (Obsidian-specific namespace):

- Vault info: `vault_name()`, `app_version()`, `plugin_version()`, `vault_path()`
- File operations: `open_file(path)`, `current_file()` returning `{path, name, extension, basename}`
- Commands: `run_command(id)`, `list_commands()` returning `[{id, name}]`
- Leaf management: `get_active_leaf()`, `get_leaf_type()`, `list_leaves()`, `focus_direction(dir)`, `close_active_leaf()`, `split_direction(dir)`, `get_leaf_for_file(path)`
- Metadata: `get_file_frontmatter(path?)`, `get_file_tags(path?)`, `get_file_links(path?)`, `get_file_backlinks(path?)`, `get_file_headings(path?)`, `get_file_embeds(path?)`, `get_file_aliases(path?)`, `get_file_tasks(path?)`
- Editor state: `get_selection()`, `get_cursor_position()`, `set_cursor_position(line, col)`, `get_mode()`
- Filesystem: `fs_files(pattern?)`, `fs_all_files()`, `fs_folders()`, `fs_exists(path)`, `fs_stat(path?)`, `fs_create(path, content?)`, `fs_write(path, content)`, `fs_append(path, content)`, `fs_rename(path, newPath)`, `fs_move(path, dest)`, `fs_trash(path?)`
- Keymaps: `keymap.set(lhs, rhs, opts?)`, `keymap.del(lhs)`
- Which-key: `whichkey.set_group(key, label, opts?)`, `whichkey.set_label(key, label, opts?)`, `whichkey.add(entries)`
- Notifications: `notice(msg)`, `ui.notice(msg)`

**Autocommands** (12 events): `BufEnter`, `BufWritePre`, `BufWritePost`, `InsertEnter`, `InsertLeave`, `ModeChanged`, `CursorMoved`, `CursorMovedI`, `TextChanged`, `TextChangedI`, `FocusLost`, `FocusGained`

**Source files**: `src/lua/api.ts`, `src/lua/fn.ts`, `src/lua/stdlib.ts`, `src/lua/autocmd.ts`, `src/lua/timers.ts`, `src/lua/highlight.ts`, `src/lua/obsidian-api.ts`

### 1.13 Vimrc Support

`.obsidian.vimrc` loader supporting: `set`/`let` directives, `map`/`noremap`/`unmap` (editor and global), `exmap`/`exunmap` (ex command definitions), `surroundmap`/`surroundunmap` (surround pair configuration), `whichkeygroup`/`whichkeycommand` (which-key labels), comment support (`"`).

**Source files**: `src/vimrc/loader.ts`, `src/vimrc/parser.ts`

### 1.14 Which-Key Integration

Configurable which-key mode (`off`, `leader`, `all`), configurable delay (default 500ms), group labels and command labels, supports both vimrc and Lua configuration, flat or grouped display.

**Source files**: `src/ui/which-key.ts`, `src/ui/global-which-key.ts`

### 1.15 Quality of Life Features

- **Neovim defaults**: `Y` remapped to `y$`, `Q` remapped to `@@`
- **Smart list continuation**: `o`/`O` preserves bullet/number/checkbox prefixes
- **Scrolloff**: Configurable lines above/below cursor (default 5)
- **Insert escape sequences**: Configurable (e.g., `jk` to exit insert mode)
- **Chord display**: Show key sequences as you type them
- **Status bar**: Vim mode indicator with optional powerline styling
- **Mode prompts**: Customizable mode display text
- **Cursor shapes**: Configurable per mode (block, bar, underline, hollow)
- **Clipboard integration**: Configurable (`unnamed`, `unnamedplus`)
- **Change list**: `g;` / `g,` navigation through edit positions

### 1.16 Additional Features

- **Table widget**: Cursor-aware table rendering in Live Preview (configurable: off, cursor, always)
- **Formatting marks**: Visual indicators for formatting in Live Preview (configurable: off, cursor)
- **Table auto-format**: Automatic table alignment on edit
- **Global key handler**: Non-editor view support (PDF, graph, canvas, etc.)
- **Context actions**: `gra` for context-aware actions
- **Outline modal**: `gO` for searchable heading list
- **Vim info modal**: Display registers, marks, buffers, backlinks, commands

### 1.17 Dual-Vim Architecture

The plugin operates in two modes:

- **Built-in vim mode**: When Obsidian's vim mode is enabled, the plugin uses Obsidian's bundled codemirror-vim via `window.CodeMirrorAdapter.Vim`.
- **Bundled fork mode**: When built-in vim is disabled, the plugin registers the fork as a CM6 extension via `registerEditorExtension()` and installs a bridge at `window.CodeMirrorAdapter.Vim`.

Both modes expose an identical API surface. The fork provides additional capabilities: async motion support (for EasyMotion operator-pending), Neovim-correct cursor positioning, and various behavioral fixes.

### 1.18 Settings (40+)

All features can be toggled independently. Categories include:

- **Feature toggles**: textobjects, navigation, hardwrap, listcontinuation, tablenav, workspacenav, easymotion, hintmode, statusbar, chorddisplay, powerline
- **Numeric**: scrolloff, scanlimit, labelfontsize, tabstop, shiftwidth, textwidth, insertmodeescapetimeout, updatetime
- **String**: clipboard, insertmodeescape, easymotionlabels, hintlabels, tablewidget, formattingmarkmode, whichkey, whichkeygrouping, workspacenavviewtypes, guicursor
- **Configuration mode**: lua-vimrc, lua, vimrc, settings
- **Paths**: vimrcPath, luaConfigPath

**Source file**: `src/settings.ts`

---

## 2. Picker and Fuzzy Finder

### 2.1 telescope.nvim

**Repository**: [nvim-telescope/telescope.nvim](https://github.com/nvim-telescope/telescope.nvim) | **Stars**: ~16k | **Language**: Pure Lua | **License**: MIT

#### Architecture

Telescope's core is a **Picker** class that orchestrates five components via dependency injection:

| Component       | Purpose                                                                        | Required? |
| --------------- | ------------------------------------------------------------------------------ | --------- |
| **Finder**      | Data source that generates results (async job, static table, dynamic function) | Yes       |
| **Sorter**      | Ranks and filters entries based on user query                                  | No        |
| **Previewer**   | Shows content preview for the currently selected entry                         | No        |
| **Entry Maker** | Transforms raw data into `{value, ordinal, display}` structs                   | No        |
| **Actions**     | What happens when the user selects an entry (open file, split, tab, etc.)      | No        |

**Data pipeline**: `Finder --> Entry Maker --> Sorter --> Entry Manager --> Display`

#### Key Design Patterns

1. **Lazy loading via metatable proxy**: Builtin pickers use a Lua metatable to defer module loading until the picker is actually invoked, keeping startup fast.
2. **Async pipeline**: Uses `plenary.async` with libuv channels for non-blocking finders, so the UI never freezes even when scanning thousands of files.
3. **Config hierarchy**: Runtime overrides > per-picker config > global defaults > builtin defaults. This allows users to set global themes while customizing individual pickers.
4. **Multi-select**: Independent of primary selection, tracked in a separate data structure. Users can `<Tab>` to mark multiple entries and act on all of them.
5. **Picker caching/resume**: `cache_picker` saves the entire picker state. `:Telescope resume` reopens the last picker with the same query and selection.

#### Built-in Pickers and External Dependencies

| Picker        | Data Source                              | External Dependency                     |
| ------------- | ---------------------------------------- | --------------------------------------- |
| `find_files`  | Uses `fd` (default) or `find` (fallback) | `fd` recommended, not strictly required |
| `live_grep`   | Uses `rg` (ripgrep) for real-time search | **rg required**                         |
| `grep_string` | Like live_grep but for word under cursor | **rg required**                         |
| `buffers`     | `vim.api.nvim_list_bufs()`               | None                                    |
| `help_tags`   | Parses help tagfiles                     | None                                    |
| `oldfiles`    | `vim.v.oldfiles`                         | None                                    |
| `commands`    | `vim.api.nvim_get_commands()`            | None                                    |
| `keymaps`     | `vim.api.nvim_get_keymap()`              | None                                    |
| `registers`   | `vim.fn.getreginfo()`                    | None                                    |
| `marks`       | `vim.api.nvim_buf_get_mark()`            | None                                    |
| `diagnostics` | `vim.diagnostic.get()`                   | None                                    |
| `git_*`       | Shell git CLI commands                   | **git required**                        |
| `lsp_*`       | LSP protocol via Neovim API              | Requires LSP client                     |
| `resume`      | Cached picker state                      | None                                    |

#### Extension System

Extensions register via `require("telescope").register_extension(mod)` and receive setup calls during `telescope.setup({extensions={...}})`. A large ecosystem of extensions exists: `telescope-file-browser.nvim`, `telescope-ui-select.nvim`, `telescope-fzf-native.nvim`, `telescope-dap.nvim`, etc.

#### Strengths

- Unified interface: every picker uses the same UX pattern (floating window, prompt at top, results list, preview pane)
- Massive ecosystem of extensions and community pickers
- Highly configurable at every level

#### Weaknesses

- Slower than fzf-lua for very large codebases (pure Lua vs native binary)
- Relatively heavy: 40+ pickers, many utility modules
- `live_grep` is fundamentally dependent on `rg` with no pure-Lua fallback

### 2.2 fzf-lua

**Repository**: [ibhagwan/fzf-lua](https://github.com/ibhagwan/fzf-lua) | **Stars**: ~4.2k | **Language**: Lua (wraps fzf CLI) | **License**: MIT

fzf-lua is architecturally different from telescope: it is a **wrapper** around the `fzf` binary. It launches `fzf` as a terminal process in a Neovim floating window and communicates via stdin/stdout.

#### telescope.nvim vs fzf-lua Comparison

| Aspect             | telescope.nvim                                              | fzf-lua                                                      |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Matching engine    | Pure Lua (with optional `telescope-fzf-native` C extension) | Native `fzf` binary (Go/C)                                   |
| Performance        | Fast, slows on very large lists                             | Faster (native matching)                                     |
| Dependency         | `plenary.nvim`                                              | **Requires fzf binary**                                      |
| Extensibility      | Huge ecosystem                                              | Smaller ecosystem                                            |
| Default in LazyVim | Was default (pre-v14)                                       | **Now default** (LazyVim 14+)                                |
| Keybinding UX      | Custom Neovim keymaps                                       | Matches CLI fzf bindings                                     |
| Built-in profiles  | Manual configuration                                        | `default`, `telescope`, `fzf-vim`, `max-perf`, `skim`, `ivy` |

#### Key UX Features

- VS-Code-like combined picker (files + buffers + LSP symbols in one view)
- Builtin previewer (no external dependencies needed; uses a native Neovim buffer)
- Skim support: can use the Rust `skim` binary instead of `fzf` via `profile = "skim"`
- Actions system for custom keybindings per picker

#### Browser Feasibility: POOR

fzf-lua fundamentally requires spawning a native binary (`fzf`). There is no WASM equivalent for the full fzf interactive TUI. The matching algorithm has been ported to JS (see section 2.5), but the integrated terminal experience cannot be replicated.

### 2.3 mini.pick

**Repository**: Part of [echasnovski/mini.nvim](https://github.com/echasnovski/mini.nvim) | **Language**: Pure Lua | **License**: MIT

mini.pick takes the opposite approach from telescope: minimalism.

- **Single window** instead of three (prompt, results, and preview occupy one floating window)
- **6 built-in pickers** instead of 40+ (relies on `mini.extra` for more)
- **Pure Lua matching** with no C/native dependency
- **100K+ items lag-free** performance

#### Source Abstraction

```lua
MiniPick.start({
  source = {
    items = {...},         -- array, callable, or manual push
    match = nil,           -- custom matcher function (optional)
    show = nil,            -- custom display (optional)
    preview = nil,         -- custom preview (optional)
    choose = nil,          -- what happens on pick
    choose_marked = nil,   -- what happens with multi-select
  }
})
```

#### Match Algorithm

- `'term` -- exact match
- `^term` -- exact at start
- `term$` -- exact at end
- `*term` -- force fuzzy
- `term` -- fuzzy (default)

Sorting minimizes match width first, then match start position. Uses prefix caching for repeated prompts.

#### Built-in Pickers

`files` (uses `git ls-files` or `fd` or Lua directory walker), `buffers`, `help_tags`, `pattern` (grep, requires `rg` or `grep`), `resume`, `cli` (shell command output)

#### Browser Feasibility: EXCELLENT

mini.pick demonstrates that a pure-language matcher can handle 100K+ items. The `source` abstraction cleanly separates data from UI and is trivially portable to TypeScript.

### 2.4 snacks.nvim Picker

**Repository**: [folke/snacks.nvim](https://github.com/folke/snacks.nvim) | **Stars**: ~8k | **Language**: Pure Lua | **License**: MIT

The newest entry (2025), building on lessons from telescope.

#### Architecture

```
snacks.Picker
  |-- finder    (async generator)
  |-- matcher   (fuzzy matching engine)
  |-- format    (item formatter with icons)
  |-- sort      (sort function)
  |-- input     (input window controller)
  |-- list      (results list with virtual scrolling)
  |-- preview   (preview window)
  |-- layout    (multi-window manager)
```

#### Key Innovations

1. **Full fzf search syntax support**: `'exact`, `^prefix`, `suffix$`, `!negation`, AND field searches like `file:lua$ 'function`
2. **Virtual scrolling** for large lists -- only renders visible items in the DOM
3. **40+ built-in sources** with treesitter highlighting
4. **Async matcher** -- never blocks the UI thread
5. **Multiple layouts**: `ivy`, `vertical`, `sidebar`, `dropdown`, `select`, `default`
6. **Built-in SQLite** for frecency scoring and history
7. **`Snacks.picker.smart()`** -- context-aware picker that auto-selects the right source

#### Browser Feasibility: VERY GOOD

Pure Lua like telescope. The virtual scrolling, async matcher, and layout system are architectural patterns that translate directly to a TypeScript implementation.

### 2.5 WASM and Pure JS Options for Browser Environments

This section covers browser-compatible matching and search technologies -- critical for making pickers work without shell access.

#### nucleo-matcher-wasm

**Repository**: [idleberg/nucleo-matcher-wasm](https://github.com/idleberg/nucleo-matcher-wasm) | **NPM**: `nucleo-matcher-wasm` | **Size**: ~100KB WASM | **License**: MPL-2.0

The Helix editor's fuzzy matcher compiled to WASM with TypeScript bindings.

```typescript
import { NucleoMatcher } from 'nucleo-matcher-wasm';

const nucleo = new NucleoMatcher(items, {
    matchPaths: true,
    caseMatching: 'smart',
});
```

**Benchmarks** (M2 Pro, 10K items):

| Library           | ms/iter   |
| ----------------- | --------- |
| **nucleo (WASM)** | **0.047** |
| fuzzy-search      | 0.087     |
| fzy.js            | 0.175     |
| fuzzaldrin-plus   | 0.187     |
| fzf-for-js        | 0.430     |
| fast-fuzzy        | 0.535     |
| fuse.js           | 1.743     |

Key advantages: significantly faster than all pure JS alternatives, used in the Helix editor (real-world tested), bounded heap for top-N results (avoids full sort), case matching options (smart/sensitive/insensitive).

#### ripgrep WASM

**Repository**: [jonathanpv/ripgrep](https://github.com/jonathanpv/ripgrep) | **NPM**: `ripgrep` | **Version**: 0.3.1 (April 2026)

ripgrep compiled to `wasm32-wasip1` with SIMD (`simd128`). This is a significant recent development for browser-based search.

```typescript
import { ripgrep, rgPath } from 'ripgrep';

const { code, stdout, stderr } = await ripgrep(['--json', 'TODO', 'src'], {
    buffer: true,
});
```

Key facts:

- Ships as pure ESM with no separate `.wasm` asset file (z85+brotli encoded in JS)
- Uses `node:wasi` on Node.js, bundled WASI shim on Bun/Deno
- SIMD-enabled via `cargo zigbuild` with Zig compiler
- Caches decompressed WASM to temp directory on first run
- ~20 syscalls in the minimal WASI shim

**Caveat for Obsidian**: Obsidian runs in Electron, which supports `node:wasi`. However, ripgrep WASM accesses the filesystem via WASI syscalls. To use it with Obsidian's vault, a virtual filesystem adapter would be needed that maps WASI file operations to `app.vault.*` API calls. This is feasible but non-trivial.

#### Pure JS Fuzzy Libraries

| Library       | Size       | Init Time | 86 searches on 162K items | Stars | Notes                        |
| ------------- | ---------- | --------- | ------------------------- | ----- | ---------------------------- |
| **uFuzzy**    | **7.5KB**  | **0.5ms** | **434ms**                 | 2.3k  | Best pure JS speed + quality |
| **fuzzysort** | **6.2KB**  | 50ms      | 1321ms                    | 3.4k  | Great for command palettes   |
| fuzzysearch   | 0.2KB      | 0.1ms     | 529ms                     | 2.7k  | Tiny, simple, no scoring     |
| fzf-for-js    | 15.4KB     | 50ms      | 6290ms                    | 831   | Port of fzf algorithm        |
| fzy.js        | 1.5KB      | 0.1ms     | 3932ms                    | 133   | Port of fzy algorithm        |
| sifter.js     | 7.5KB      | 3ms       | 1070ms                    | 1.1k  | Used by Select2              |
| **fuse.js**   | **24.2KB** | 31ms      | 33875ms                   | 16.6k | Most popular, **slowest**    |

**Recommendation**: **uFuzzy** for pure JS (fastest, most accurate, 7.5KB) or **fuzzysort** (good balance, TypeScript support). For maximum performance, use **nucleo-matcher-wasm**.

#### Other WASM Fuzzy Libraries

| Library                                                  | WASM Size         | Algorithm             | Notes                                          |
| -------------------------------------------------------- | ----------------- | --------------------- | ---------------------------------------------- |
| [rapid-fuzzy](https://github.com/derodero24/rapid-fuzzy) | ~195KB            | 10 algorithms         | Auto-fallback to WASM, persistent `FuzzyIndex` |
| [FlashFuzzy](https://github.com/RafaCalRob/FlashFuzzy)   | ~3KB (1.5KB gzip) | Bitap + Bloom filters | Tiny, zero deps                                |
| [fuzzr](https://github.com/repomaa/fuzzr)                | Rust to WASM      | skim algorithm        | Browser-focused                                |
| [wafu](https://github.com/heyimalex/wafu)                | Rust to WASM      | Fuse.js port          | Drop-in replacement for Fuse                   |

### 2.6 Browser Feasibility Matrix

#### Fully Feasible (No Shell Access Needed)

| Feature                | Obsidian API Data Source                    | Strategy                        |
| ---------------------- | ------------------------------------------- | ------------------------------- |
| **Fuzzy file finding** | `app.vault.getFiles()`                      | JS array into fuzzy matcher     |
| **Buffer switching**   | `app.workspace.getLeavesOfType("markdown")` | Direct API access               |
| **Recent files**       | `app.metadataCache` or custom history       | Track in plugin settings        |
| **Command palette**    | `app.commands.listCommands()`               | Direct API access               |
| **Backlinks**          | `app.metadataCache.getBacklinks()`          | Obsidian API                    |
| **Tags**               | `app.metadataCache.getTags()`               | Obsidian API                    |
| **Headings/outline**   | `app.metadataCache.getCache(path).headings` | Obsidian API into fuzzy matcher |
| **Bookmarks**          | Obsidian bookmarks API                      | Obsidian API                    |
| **Quick switcher**     | Combined files + recent                     | Combination of above            |

#### Feasible via ripgrep WASM

| Feature           | Strategy                                     |
| ----------------- | -------------------------------------------- |
| **Grep in vault** | ripgrep WASM with virtual filesystem adapter |
| **Live grep**     | Debounced ripgrep calls as user types        |

#### Needs Special Handling

| Feature                                   | Challenge           | Alternative                              |
| ----------------------------------------- | ------------------- | ---------------------------------------- |
| **Git integration**                       | Needs `git` binary  | `isomorphic-git` (JS git implementation) |
| **LSP features**                          | Obsidian has no LSP | Use Obsidian API as substitute           |
| **File preview with syntax highlighting** | N/A                 | CM6 read-only view (native support)      |
| **Large file virtual scrolling**          | DOM performance     | Only render visible items                |

### 2.7 Recommended Architecture

#### Core Design (telescope-inspired, mini.pick-simplified)

```
Picker
  |-- Source      (data provider -- files, buffers, grep, etc.)
  |     |-- items[]  --> raw data
  |-- Matcher     (nucleo-wasm or uFuzzy)
  |     |-- score(query, items) --> ranked items[]
  |-- Preview     (CM6 read-only view)
  |     |-- preview(item) --> rendered content
  |-- UI
        |-- Input     (prompt bar with cursor)
        |-- List      (virtual-scrolled results)
        |-- Preview   (side panel or overlay)
```

#### Source Abstraction (from mini.pick)

```typescript
interface PickerSource<T> {
    name: string;
    items: () => Promise<T[]> | T[];
    match?: (query: string, items: T[]) => ScoredItem<T>[];
    preview?: (item: T) => string | Promise<string>;
    onChoose: (item: T) => void;
}
```

#### Key Design Decisions

1. **Matcher choice**: Use `nucleo-matcher-wasm` as primary matcher. Fall back to `uFuzzy` (pure JS, 7.5KB) if WASM loading fails. This gives Helix-level matching speed with a zero-dependency fallback.

2. **Virtual scrolling**: Essential for large vaults (thousands of files). Only render visible items in the results list DOM.

3. **Deferred preview**: Throttle preview updates to ~60ms (same pattern as snacks.nvim) to avoid expensive rendering on every keystroke.

4. **ripgrep WASM integration**: For vault grep, the ripgrep WASM approach requires a WASI filesystem adapter. An alternative MVP approach: read file contents via `app.vault.read()` and search with JS regex, which avoids the WASM complexity entirely.

5. **Source registration**: Allow Lua users to register custom picker sources via `vim.obsidian.picker.register(source)`, enabling community-contributed pickers.

#### Implementation Priority

1. **File finder** (easiest, highest impact) -- `app.vault.getFiles()` + uFuzzy
2. **Buffer switcher** -- `workspace.getLeaves()` + uFuzzy
3. **Command palette** -- `app.commands.listCommands()` + uFuzzy
4. **Vault grep** -- JS regex search for MVP, ripgrep WASM later
5. **Headings/outline** -- `metadataCache` into fuzzy match
6. **Backlinks picker** -- metadataCache into fuzzy match
7. **Tags picker** -- metadataCache into fuzzy match
8. **Recent files** -- custom history into fuzzy match

### 2.8 Summary Matrix

| Plugin             | Architecture                   | External Deps    | Browser Port Feasibility                     | Key Inspiration                                     |
| ------------------ | ------------------------------ | ---------------- | -------------------------------------------- | --------------------------------------------------- |
| **telescope.nvim** | 5-component DI, async pipeline | rg, fd, git      | **Excellent** -- pure Lua design ports to TS | Component model, extension system, config hierarchy |
| **fzf-lua**        | Wraps fzf binary               | **fzf required** | **Poor** -- needs native binary              | Profile system, multi-source pickers                |
| **mini.pick**      | Single window, minimal         | rg, git          | **Excellent** -- simplest architecture       | Source abstraction, pure-Lua matcher, match modes   |
| **snacks.nvim**    | Modular async pipeline         | rg, fd, git      | **Very Good** -- clean modularity            | Virtual scrolling, fzf syntax, 40+ sources          |
| **nucleo-wasm**    | Rust to WASM                   | None in browser  | **Perfect** -- designed for this             | Use as matching engine                              |
| **ripgrep WASM**   | Rust to WASM to WASI           | None in browser  | **Good** (needs adapter)                     | Use for grep search                                 |

---

## 3. Snippets

### 3.1 LSP Snippet Format (The Common Denominator)

The **LSP snippet syntax** (also called TextMate/VS Code snippet format) is the de facto standard defined in the [LSP specification](https://github.com/microsoft/language-server-protocol/blob/main/snippetSyntax.md). Its EBNF grammar:

```
any         ::= tabstop | placeholder | choice | variable | text
tabstop     ::= '$' int | '${' int '}'
placeholder ::= '${' int ':' any '}'
choice      ::= '${' int '|' text (',' text)* '|}'
variable    ::= '$' var | '${' var '}' | '${' var '/' regex '/' format '/' options '}'
var         ::= [_a-zA-Z] [_a-zA-Z0-9]*
```

**Features in the spec**:

- **Tabstops**: `$1`, `$2`, `$0` (final position)
- **Placeholders**: `${1:default text}` -- can be nested: `${1:outer ${2:inner}}`
- **Choice placeholders**: `${1|one,two,three|}` -- user picks from options
- **Variables**: `$TM_FILENAME`, `${CURRENT_YEAR}`, etc.
- **Variable transforms**: `${TM_FILENAME/^(.*)\.(.*)$/$1/}` with ECMAScript regex
- **Placeholder transforms**: `${1/pattern/replacement/}` -- transform text when tabbing away
- **Format strings**: `/upcase`, `/downcase`, `/capitalize`, conditional inserts (`:+`, `:?`, `:-`)

**Portability**: The LSP format is pure text -- no editor APIs needed for parsing. It is the most portable snippet format and is what friendly-snippets uses.

### 3.2 LuaSnip

**Repository**: [L3MON4D3/LuaSnip](https://github.com/L3MON4D3/LuaSnip) | **Stars**: ~4k | **Language**: Pure Lua | **License**: Apache-2.0

#### Architecture

Pure Lua, node-based AST. Snippets are trees of typed nodes:

```lua
local s = ls.snippet        -- s(trigger, nodes)
local sn = ls.snippet_node  -- sn(jump_index, nodes)
local t = ls.text_node      -- t("text")
local i = ls.insert_node    -- i(jump_index, "default")
local f = ls.function_node  -- f(args, fn)
local c = ls.choice_node    -- c(jump_index, choices)
local d = ls.dynamic_node   -- d(jump_index, fn, args)
local r = ls.restore_node   -- r(jump_index, key, nodes)
```

**Node types**:

| Node                       | Purpose                                             | Example                                                |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `t("text")`                | Static text                                         | `t("Hello ")`                                          |
| `i(1, "default")`          | Editable insertion field (tabstop)                  | `i(1, "name")`                                         |
| `f(fn, argNodes)`          | Function node (programmatically generated text)     | `f(function(args) return args[1][1]:upper() end, {1})` |
| `c(1, {choice1, choice2})` | Choice node (pick between sub-nodes)                | `c(1, {t("public"), t("private")})`                    |
| `d(1, fn, args)`           | Dynamic node (generates snippetNode at runtime)     | For computed structures                                |
| `r(1, "key", nodes)`       | Restore node (preserves input across regenerations) | For stateful snippets                                  |
| `sn(nil, nodes)`           | Snippet node (group of nodes)                       | Used inside choices/dynamics                           |

**What depends on Neovim**: Extmarks for highlighting active/inactive tabstops, `vim.api` for buffer manipulation and cursor positioning, treesitter for filetype resolution in embedded code blocks, nvim-cmp for completion integration, event system (`TextChanged`, `TextChangedI`, `InsertLeave`).

**What is portable**: The **node-based AST model** (composable snippet construction), the **function/dynamic node concept** (generate content from other tabstops), the **choice node concept**, the **LSP snippet parser** (string to AST), the **loader architecture** (`from_vscode`, `from_snipmate`, `from_lua`), the **extras system** (lambda, partial, match, fmt).

### 3.3 nvim-snippets (garymjr)

A thin wrapper over Neovim's built-in `vim.snippet` API with a three-tier architecture:

1. **Discovery** -- Scan search paths, parse `package.json` manifests, build snippet registry
2. **Loading** -- Three-tier merge: global snippets, extended filetypes, filetype-specific
3. **Caching** -- Memoize merged snippets per filetype with `vim.deepcopy()`
4. **Expansion** -- Variable resolution then `vim.snippet.expand()`

**Heavily Neovim-dependent**: Relies on `vim.snippet`, `vim.lsp._snippet_grammar`, `vim.api.nvim_create_autocmd()`, etc.

**Portable pattern**: The discovery-to-cache-to-expand pipeline and the three-tier merge (global to extended to filetype) can be replicated in any language.

### 3.4 vim-vsnip

Pure VimScript, works in both Vim 8.0+ and Neovim. Supports LSP/VS Code snippet format. Unique feature: VimScript interpolation `${VIM:...expr...}` for arbitrary VimScript evaluation. Aging (last commit 9+ months ago), minimal maintenance.

**Portability lesson**: The least powerful but most portable snippet engine. Its simplicity (pure text format, minimal API requirements) is instructive for a browser-targeting plugin.

### 3.5 mini.snippets

Part of mini.nvim. Clean pipeline architecture:

```
config.snippets
    --> prepare()   -- resolve raw snippets to current context
    --> match()     -- find matching snippets at cursor (exact + fuzzy)
    --> select()    -- choose among matches (vim.ui.select or auto-pick)
    --> insert()    -- insert text + start snippet session
```

LSP format only, no transformation support. Key quote from docs: _"It does not support variable/tabstop transformations in default snippet session. This requires ECMAScript Regular Expression parser which can not be implemented concisely."_ This is important: even Neovim's ecosystem struggles with ECMAScript regex transforms. The Obsidian plugin, running in a browser with native JS regex, has an advantage here.

### 3.6 UltiSnips (Legacy)

Python-based (requires Python 3 host). The original Vim snippet engine that established patterns now standard across the ecosystem:

- `$1`, `$2`, `$0` tabstop numbering convention
- Mirrors (same tabstop number = synchronized text)
- Transformations (`${1/regex/format/}` when jumping away)
- Regex triggers (`r` option)
- Context conditions (`e` option)
- Priority system for snippet overrides

The core concepts are now baked into the LSP snippet format. UltiSnips's architecture itself is not portable (Python dependency), but its conceptual contributions are universal.

### 3.7 friendly-snippets

**Repository**: [rafamadriz/friendly-snippets](https://github.com/rafamadriz/friendly-snippets) | **Format**: VS Code JSON

Per-filetype `.json` files with the structure: `{ "name": { "prefix": "...", "body": ["..."], "description": "..." } }`. Uses `scope` field for filetype filtering.

**Zero Neovim dependencies** -- it is just JSON files. This is the most portable collection in the ecosystem.

**Markdown snippets from friendly-snippets include**:

- `h1` through `h6` -- heading templates (`# ${0}` through `###### ${0}`)
- `l` / `link` -- `[${1:text}](${2:url}) ${0}`
- `img` -- `![${1:alt text}](${2:path}) ${0}`
- `bold` / `b` -- `**${1}** $0`
- `italic` / `i` -- `*${1}* $0`
- `code` -- `` `${1}` $0 ``
- `codeblock` -- multi-line fenced code block with language tabstop
- `table`, `2x2table`, `3x3table` -- table templates with tabstops
- `task`, `task2` through `task5` -- task lists with choice nodes (`${1| ,x|}`)
- `note`, `tip`, `warning`, `caution`, `important` -- callout block templates
- `ordered list`, `unordered list` -- list templates

### 3.8 CodeMirror 6 Snippet Support

CM6 **already has a full snippet subsystem** in `@codemirror/autocomplete`.

#### What CM6 Handles (Built-in)

- `Snippet.parse(template)` -- parses `$1`, `${1:default}`, `${}` using regex
- `snippet(template)` -- creates an apply function for use in completions
- `snippetCompletion(template, completion)` -- combines template with completion metadata
- `ActiveSnippet` StateField -- tracks active snippet state, field positions, decorations
- `nextSnippetField` / `prevSnippetField` -- Tab/Shift-Tab navigation between tabstops
- `snippetKeymap` facet -- configurable keybindings
- Tabstops with numbers (`$1`, `$2`, `$0`)
- Placeholders with defaults (`${1:default}`)
- Linked/synchronized tabstops (same number = same content)
- Automatic indentation (tab characters in templates become indentUnit)
- Field selection range on activation
- Change mapping via `ChangeDesc.mapPos()`
- Decoration-based highlighting for field markers

#### What CM6 Does NOT Handle (Gaps to Fill)

- **Choice nodes** (`${1|a,b|}`) -- no UI for choosing between options
- **Variables** (`$TM_FILENAME`, `${CURRENT_YEAR}`) -- no variable resolution
- **Transformations** (`${1/regex/format/}`) -- no regex transform engine
- **Function/dynamic nodes** -- no runtime code evaluation
- **Nested placeholders** (`${1:outer ${2:inner}}`) -- parser does not handle these
- **Multi-line placeholder expanding** -- not supported

#### CM6 Parser Internals

The built-in parser regex:

```typescript
while (m = /[#$]\{(?:(\d+)(?::([^{}]*))?|((?:\\[{}]|[^{}])*))\}/.exec(line))
```

This handles `$1`, `${1}`, `${1:default}`, and `${name}` (nameless fields). It is relatively simple and does not cover the full LSP snippet grammar.

#### Existing CM6 Ecosystem Plugins

| Plugin                                   | Purpose                                          | Notes                                               |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `codemirror-6-snippetbuilder`            | Convert VS Code JSON snippets to CM6 completions | ~50 stars, basic converter                          |
| `@marimo-team/codemirror-languageserver` | LSP client with snippet support                  | Full LSP protocol, handles snippet completion items |
| `@emmetio/codemirror6-plugin`            | Emmet abbreviation expansion                     | Different paradigm (CSS-selectors to HTML)          |

### 3.9 VS Code Snippet Engine Architecture

VS Code's implementation consists of four components:

1. **`SnippetParser.ts`** -- Tokenizer/parser for the LSP snippet grammar. Produces an AST of `Text`, `Placeholder`, `Choice`, `Variable`, `Marker` nodes.
2. **`snippetSession.ts`** -- `OneSnippet` class manages a single active snippet: placeholder groups, offset tracking, decoration management, `_placeholderGroups` for multi-cursor support.
3. **`snippetController2.ts`** -- Controller orchestrating the session lifecycle.
4. **`snippetVariables.ts`** -- Variable resolvers (`TM_SELECTED_TEXT`, `CURRENT_YEAR`, etc.)

**Key architectural insight**: VS Code handles snippet variables by pre-resolving them _before_ the snippet session starts, using a `BasedVariableResolver`. This is the same approach Neovim's `vim.snippet` and nvim-snippets take -- variables get their text values before expansion, not during.

### 3.10 Neovim Built-in vim.snippet

Neovim 0.10+ includes a built-in snippet engine at `runtime/lua/vim/snippet.lua`.

**Architecture**: LPEG grammar (`vim.lsp._snippet_grammar`) for parsing (compiled C parser, very fast), `Session` object tracking tabstops with ranges and extmark IDs, autocommands (`TextChanged`, `TextChangedI`, `InsertLeave`, `TextChangedP`) for session management, choice popups via Vim's built-in completion menu.

**What it handles**: Tabstops with numbering order (any order OK, including non-consecutive), placeholders with defaults, choice nodes (via completion menu), linked tabstops (same index = synced text), base indentation preservation, session auto-stop when cursor leaves snippet range, text deletion detection, nested sessions (via PR #29340).

**What it explicitly does NOT do** (by design): No `TM_SELECTED_TEXT` support (snippets expand in insert mode per LSP spec), no variable transformations, no placeholder transformations, no function/dynamic nodes (those are LuaSnip-only), no snippet collection management.

### 3.11 Portability Analysis

| Feature                              | Neovim-Specific?                                   | Portable to Browser CM6?                  | Effort |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------- | ------ |
| LSP snippet **parser**               | No (pure algorithm)                                | **Yes** -- implement in TypeScript        | Low    |
| **Tabstops** with navigation         | Partial                                            | **Yes** -- CM6 has this built-in          | Free   |
| **Placeholders** with defaults       | Partial                                            | **Yes** -- CM6 has this built-in          | Free   |
| **Linked tabstops** (mirrors)        | Partial                                            | **Yes** -- CM6 has this built-in          | Free   |
| **Choice nodes** `${1\|a,b\|}`       | Partially (uses vim's pum)                         | **Yes** -- implement via CM6 tooltip/menu | Medium |
| **Variables** (`CURRENT_YEAR`, etc.) | No (just text lookup)                              | **Yes** -- JS Date, etc.                  | Low    |
| **Transformations** `${1/regex/}`    | Partially (Neovim LPEG cannot do ECMAScript regex) | **Yes** -- JS regex is native             | Medium |
| **Function nodes** (programmatic)    | Yes (Lua evaluation)                               | **Yes** -- fengari Lua runtime            | High   |
| **Dynamic nodes** (generate nodes)   | Yes (Lua evaluation)                               | **Yes** -- fengari Lua runtime            | High   |
| **Regex triggers**                   | No                                                 | **Yes** -- JS regex                       | Low    |
| **Visual highlights** (extmarks)     | Yes                                                | **Yes** -- CM6 decorations                | Medium |
| **Treesitter context**               | Yes (Neovim C library)                             | **No** -- would need tree-sitter WASM     | High   |
| **friendly-snippets loading**        | No (just JSON)                                     | **Yes** -- JSON parser                    | Low    |
| **Completion integration**           | Yes (cmp protocol)                                 | **Yes** -- CM6 CompletionSource           | Medium |

**Key insight**: LuaSnip's node-based AST is the most portable architecture. It is just a tree data structure:

```typescript
type SnippetNode =
    | { type: 'text'; content: string }
    | { type: 'insert'; index: number; default: string }
    | { type: 'function'; fn: (args: string[][]) => string; argNodes: number[] }
    | { type: 'choice'; index: number; choices: SnippetNode[] }
    | {
          type: 'dynamic';
          fn: (args: string[][]) => SnippetNode;
          argNodes: number[];
      }
    | { type: 'snippet-group'; nodes: SnippetNode[] };
```

The evaluation becomes traversal of this tree, and fengari can provide the `function(...)` implementations that Lua users write.

**Browser advantage**: The plugin running in a browser has native ECMAScript regex, meaning variable/placeholder transformations are _easier_ to implement than in Neovim (where mini.snippets explicitly punted on this because "ECMAScript regex parser cannot be implemented concisely" in Lua).

### 3.12 Recommended Architecture

#### Phase 1: Foundation (MVP)

Leverage CM6's built-in `snippet()` and `snippetCompletion()`. Add:

- **friendly-snippets JSON loader**: Parse markdown.json, group by scope/filetype, convert each entry into a `snippetCompletion()`
- **Variable pre-resolution**: Replace `$CURRENT_YEAR`, `$TM_FILENAME`, etc. with resolved values before passing to `snippet()`
- **Choice node flattening**: For MVP, flatten `${1|a,b|}` to `${1:a}` (use first option as default)

This gives ~20 markdown snippets with full tabstop navigation using minimal custom code.

#### Phase 2: Full LSP Compatibility

- **Full LSP snippet parser** (EBNF grammar to TypeScript AST)
- **Choice node UI**: CM6 tooltip widget showing options when cursor enters a choice field
- **Placeholder transform engine**: `${1/regex/format/}` using JS native regex
- **User-defined snippet files**: Load VS Code JSON format from vault, configurable paths

#### Phase 3: Lua-Powered (LuaSnip-like)

- **Node-based snippet DSL in Lua**: `s()`, `t()`, `i()`, `f()`, `c()`, `d()` API matching LuaSnip
- **Fengari evaluation**: Function and dynamic nodes execute user-provided Lua code
- **Completion integration**: CM6 `CompletionSource` that suggests snippets as you type

### 3.13 Summary Table

| Engine                | Power     | Neovim Deps | Portable Ideas                                               |
| --------------------- | --------- | ----------- | ------------------------------------------------------------ |
| **LuaSnip**           | Very High | Very High   | Node AST, function/dynamic/choice nodes, loader architecture |
| **nvim-snippets**     | Medium    | Extreme     | Three-tier discovery pipeline, caching pattern               |
| **vim-vsnip**         | Low       | Very Low    | Pure text format approach, LSP-only focus                    |
| **mini.snippets**     | Medium    | Moderate    | Prepare/Match/Select/Insert pipeline, wrap-jumping           |
| **UltiSnips**         | High      | Extreme     | Established tabstop/mirror/transform concepts (now standard) |
| **CM6 built-in**      | Low       | None        | `snippet()`, `snippetCompletion()`, field navigation         |
| **friendly-snippets** | N/A       | None        | JSON format -- most portable collection                      |

---

## 4. File Explorer

### 4.1 neo-tree.nvim

**Repository**: [nvim-neo-tree/neo-tree.nvim](https://github.com/nvim-neo-tree/neo-tree.nvim) | **Stars**: ~5k | **Language**: Lua | **Depends on**: nui.nvim, plenary.nvim

#### Architecture (5-layer)

| Layer                | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| **Source Plugin**    | Data providers implementing `M.navigate` and `M.setup`                         |
| **Component System** | Functions returning `{text, highlight}` pairs -- composable UI building blocks |
| **Renderer**         | `show_nodes()` pipeline: component rendering, window management                |
| **Command System**   | Hierarchical lookup: source-specific, then global, then built-in               |
| **Event System**     | Pub/sub with `BEFORE_*` / `AFTER_*` variants, debounced execution              |

Supports three source types: `filesystem`, `buffers`, `git_status`. The source abstraction is the key architectural pattern -- any hierarchical data can be rendered through the same component system.

#### Key Vim-Style Interactions

| Mapping     | Action         | Notes                           |
| ----------- | -------------- | ------------------------------- |
| `<space>`   | Toggle node    | Expand/collapse directory       |
| `<CR>`      | Open           | Open in closest window          |
| `S`         | Open split     | Horizontal split                |
| `P`         | Toggle preview | Preview in float window         |
| `H`         | Toggle hidden  | Hide dotfiles                   |
| `/`         | Fuzzy finder   | Filter tree with fuzzy search   |
| `]g` / `[g` | Next/prev git  | Jump between git-modified items |
| `o{key}`    | Order by       | Sort by name/size/type/date/git |

#### Obsidian Applicability: HIGH

The **source abstraction** maps well to Obsidian: one source for vault files, one for backlinks, one for open buffers, one for tags. The **component rendering system** is implementable in Obsidian's DOM. **Fuzzy filtering in-tree** (`/` to filter) is a vim-native pattern that Obsidian lacks.

### 4.2 nvim-tree.lua

**Repository**: [nvim-tree/nvim-tree.lua](https://github.com/nvim-tree/nvim-tree.lua) | **Stars**: ~7k | **Status**: Feature-complete, maintenance-only

Left-docked tree view, filesystem-only (no "sources" abstraction). Now in maintenance mode -- the maintainers have stated no new major features will be added.

| Dimension    | nvim-tree                   | neo-tree                                    |
| ------------ | --------------------------- | ------------------------------------------- |
| Architecture | Singleton explorer, layered | Plugin-based sources, component UI          |
| Positions    | Left (docked) or float      | Left, right, top, bottom, float, current    |
| Sources      | Filesystem only             | Filesystem, buffers, git_status, extensible |
| Maintenance  | Stable, no new features     | Active development                          |

Key patterns: **decorator system** for additive highlight/icon layers (Git, Open, Hidden, Modified, Bookmark, Diagnostics, Copied, Cut), **layered unidirectional flow** (User to API to Actions to State to Renderer to Buffer).

**Obsidian Applicability: MEDIUM** -- The decorator system for showing git status, tags, or metadata on vault files is interesting, but the singleton architecture is less flexible than neo-tree's source system.

### 4.3 oil.nvim

**Repository**: [stevearc/oil.nvim](https://github.com/stevearc/oil.nvim) | **Stars**: ~7k | **Author**: stevearc

This is the most architecturally novel and most interesting for Obsidian.

#### Core Paradigm: Directories as Editable Buffers

You do not browse a tree -- you open a directory, see its contents as lines in a buffer, and edit them with normal vim commands:

- **Add a line** -- creates a file
- **Rename text in-place** -- renames the file
- **Delete a line** -- deletes the file
- **Cut/paste lines between buffers** -- moves files between directories
- **`:w` to commit** all changes atomically

#### Key Architecture

- **Adapter abstraction**: All filesystem access goes through adapters. Ships with `local` and `ssh`. Community could write `s3`, `dropbox`, etc.
- **Buffer lifecycle**: `BufReadCmd` loads directory listing, `BufWriteCmd` commits edits, mutation system diffs buffer against filesystem state
- **Staging model**: Changes are staged in-buffer until `:w`. Supports discard via `discard_all_changes()`
- **Columns system**: Configurable per-file metadata columns (icon, permissions, size, mtime)
- **Constraint system**: `constrain_cursor = "name"` keeps cursor on the editable filename area, preventing accidental corruption of metadata columns

#### Key Interactions

| Mapping | Action                           |
| ------- | -------------------------------- |
| `<CR>`  | Open file/directory under cursor |
| `-`     | Go up to parent directory        |
| `~`     | Jump to home directory           |
| `_`     | Open current working directory   |
| `` ` `` | Change directory                 |
| `gs`    | Change sort order                |
| `g.`    | Toggle hidden files              |
| `g?`    | Show help popup                  |

#### Obsidian Applicability: VERY HIGH

This is the most translatable paradigm for Obsidian:

1. **"Vault as buffer"** -- The vault (or a folder subtree) could be rendered as an editable buffer. Each line = one note.
2. **Editing notes by editing the buffer** -- Create, rename, delete notes with standard vim commands (`i`, `d`, `dd`, `p`). Changes commit on `:w`.
3. **No tree UI needed** -- oil.nvim proves a tree widget is unnecessary. The existing Obsidian tree is preserved; oil gives a keyboard-first _alternative_.
4. **Adapter abstraction = vault abstraction** -- The adapter pattern maps directly: `VaultAdapter` handles `app.vault.create()`, `app.vault.delete()`, `app.vault.rename()`, `app.vault.read()`.
5. **Cross-directory editing** -- Open two oil buffers for different directories, cut lines from one, paste in the other. In Obsidian: moving notes between folders by editing text.
6. **Constrained cursor** -- Perfect for Obsidian. The cursor stays on the editable filename area, preventing accidental corruption of metadata columns.
7. **Backlink-aware rename** -- oil handles `willRenameFiles` from LSP. In Obsidian, this translates to updating wikilinks/backlinks when a note is renamed through buffer editing, using `app.metadataCache.resolvedLinks`.

### 4.4 mini.files

**Part of**: [echasnovski/mini.nvim](https://github.com/echasnovski/mini.nvim) | **Language**: Pure Lua

#### Core Paradigm: Miller Columns + Buffer Editing

Side-by-side floating windows showing nested directories in a horizontal cascade. The focused directory is wider (`width_focus` default 50), ancestors/parents are narrower (`width_nofocus` default 15).

Combined with oil-style buffer editing: `MiniFiles.synchronize()` applies buffer edits to filesystem.

#### Key Interactions

| Mapping   | Action                                  |
| --------- | --------------------------------------- |
| `j`/`k`   | Navigate within directory               |
| `l`       | Go into (expand directory / open file)  |
| `L`       | Go in and close parent column           |
| `h`       | Go out to parent directory              |
| `H`       | Go out and trim child columns           |
| `<` / `>` | Trim left/right columns                 |
| `<BS>`    | Reset to anchor directory               |
| `m{char}` | Set bookmark for current directory      |
| `'{char}` | Jump to bookmarked directory            |
| `=`       | Synchronize (apply edits to filesystem) |

#### Obsidian Applicability: VERY HIGH

The **Miller columns pattern** is natural for Obsidian's folder hierarchy. **Bookmarks** (`m{char}`) are a powerful vim-native pattern for vault navigation. The **trim left/right** pattern for focusing portions of the hierarchy is unique and useful for deep vault structures.

### 4.5 telescope-file-browser.nvim

**Repository**: [nvim-telescope/telescope-file-browser.nvim](https://github.com/nvim-telescope/telescope-file-browser.nvim) | **Stars**: ~2k

Extension of telescope using the picker UI for file browsing and manipulation. Dual-mode: `file_browser` (files + dirs) and `folder_browser` (dirs only).

#### Key Operations

| Keys          | Action                               |
| ------------- | ------------------------------------ |
| `<CR>`        | Open file or create from prompt text |
| `<C-c>` / `c` | Create file/folder at current path   |
| `<C-r>` / `r` | Rename (multi-select aware)          |
| `<C-m>` / `m` | Move to current directory            |
| `<C-y>` / `y` | Copy (multi-select aware)            |
| `<C-d>` / `d` | Remove/delete                        |
| `<C-f>` / `f` | Toggle between file/folder mode      |
| `<C-h>` / `h` | Toggle hidden files                  |
| `<bs>`        | Parent directory (when prompt empty) |

**Killer feature: `create_from_prompt`** -- type a filename that does not exist and it gets created. This is how Neovim users think about file creation -- through intent to navigate to something that should exist, not through a "New note" button.

**Obsidian Applicability: HIGH** -- Obsidian's Quick Switcher (`Ctrl-O`) is read-only. telescope-file-browser's approach adds create-on-type, rename/move from picker, and multi-select batch operations. The `prepareFuzzySearch()` API is already used in the motions plugin's `vault-search.ts`.

### 4.6 dirvish.vim and vinegar.vim (Minimalist Legacy)

**dirvish** ([justinmk/vim-dirvish](https://github.com/justinmk/vim-dirvish)): Each line is a filepath (concealed for cleanliness). Visual selection opens multiple files. `:Shdo` generates shell scripts from selections. 96% smaller than netrw, 2x faster. Never modifies the filesystem by itself (view-only by design).

**vinegar** ([tpope/vim-vinegar](https://github.com/tpope/vim-vinegar)): The plugin that defined key patterns still used today:

- `-` in any buffer -- hop to directory listing, seek to current file
- `.` on a file -- pre-populate `:` command line with the file path
- `y.` -- yank absolute path
- `~` -- go home
- `gh` -- toggle hidden files

**Key UX lessons**:

1. The `-` key to "go up to directory" is the single most impactful file explorer mapping.
2. Showing a directory listing in your current window (not a sidebar) is faster for "where am I?" context.
3. Visual mode + file operations is powerful.
4. Yanking file paths (`y.`) is a small thing that vim users use constantly.

**Obsidian Applicability: MODERATE** -- `-` mapping, `y.` yank path, and the "minimal, no UI chrome" philosophy are all directly applicable.

### 4.7 yazi.nvim

**Repository**: [mikavilpas/yazi.nvim](https://github.com/mikavilpas/yazi.nvim) | **Stars**: ~2k

Embeds yazi (a standalone Rust TUI file manager) inside Neovim as a floating terminal window. Not a Neovim-native plugin -- it delegates all file management to yazi.

**Obsidian Applicability: LOW** -- There is no terminal API in Obsidian's plugin API. The "embed a standalone file manager" approach is not feasible.

### 4.8 Gap Analysis

#### What Exists in Motions Today

| Feature              | Implementation                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| `:explorer`          | Reveals active file in file explorer (`file-explorer:reveal-active-file`) |
| `:sidebar`           | Toggle left/right sidebar                                                 |
| `:grep`              | Content search with preview modal                                         |
| `:find`              | File name search                                                          |
| `:edit` / `:e`       | Open file by path                                                         |
| `:buffer` / `:b`     | Switch open buffers                                                       |
| `:ob`                | Execute any Obsidian command                                              |
| Workspace nav        | `<C-w>h/j/k/l`, `gt`/`gT`                                                 |
| Hint mode            | `f`/`F` for UI element hints                                              |
| `:back` / `:forward` | Navigation history                                                        |

#### What is Missing

| Missing Pattern                  | Neovim Source            | Effort     | Vim User Value |
| -------------------------------- | ------------------------ | ---------- | -------------- |
| File picker with create-on-type  | telescope-file-browser   | Low-Medium | Very High      |
| `-` to go up directory           | vinegar, oil, mini.files | Low        | Very High      |
| Vim keybindings in file explorer | neo-tree, nvim-tree      | Medium     | High           |
| File operations via vim commands | oil, neo-tree            | Medium     | High           |
| `y.` yank file path              | vinegar                  | Low        | High           |
| Mark vault locations (`m{char}`) | mini.files               | Low-Medium | Medium         |
| Edit vault as buffer (oil-style) | oil.nvim                 | High       | Very High      |
| Miller columns view              | mini.files               | High       | Medium         |
| Preview from file explorer       | neo-tree                 | Medium     | Medium         |
| Fuzzy filter in tree (`/`)       | neo-tree                 | Medium     | High           |
| Batch file operations            | telescope-file-browser   | Medium     | Medium         |
| Sort by date/size                | multiple                 | Low-Medium | Low            |

### 4.9 Implementation Tiers

#### Tier 1: Easy Wins (Low Effort, High Impact)

**File picker with create-on-type**: Enhance `:find`/`:e` to show fuzzy completions as you type. If the typed path does not exist, offer to create it. The infrastructure already exists in `vault-search.ts` (`prepareFuzzySearch()`, `app.vault.getMarkdownFiles()`).

**`-` to go up**: A key that shows the vault folder containing the current file, like vinegar's `-`. Could show a buffer listing sibling files, or open the containing folder in a panel.

**`y.` / `yP` yank file path**: `y.` yanks vault-relative path, `yP` yanks absolute filesystem path. Uses `app.workspace.getActiveFile()` and `navigator.clipboard`.

**Vim keybindings on existing file explorer**: Intercept keyboard events on the file-explorer leaf and map `j`/`k` for navigation, `/` for search, `R` for rename, `d` for delete. Can be done via `registerDomEvent` on the file explorer container without replacing the view.

#### Tier 2: Medium Investment

**File operations via ex commands**: `:rename <newname>`, `:delete`, `:mkdir`, `:move <target>`. Maps directly to `app.vault.rename()`, `app.vault.delete()`, `app.vault.createFolder()`.

**Fuzzy filter in vault view**: In any file context, `/` starts a type-to-filter that narrows visible files. Uses the existing fuzzy search infrastructure.

**Mark vault locations**: `m{char}` marks a vault folder or file, `'{char}` jumps to it. Persist in plugin data. Uses `app.vault.getAbstractFileByPath()`.

#### Tier 3: Major Feature

**Oil-style vault-as-buffer**: Register a custom `VaultOilView extends ItemView` that renders a vault directory as an editable buffer. Each line = one note. Edit with vim commands, `:w` commits changes through `app.vault.*` API. Key design decisions: one buffer per directory (like oil, not entire vault), constrain cursor to filename column, update wikilinks on rename via `app.metadataCache.resolvedLinks`.

### 4.10 Summary Table

| Plugin                     | UX Paradigm           | Key Vim Patterns                 | Obsidian Fit |
| -------------------------- | --------------------- | -------------------------------- | ------------ |
| **neo-tree.nvim**          | Tree in sidebar/float | hjkl, `/` filter, marks, preview | HIGH         |
| **nvim-tree.lua**          | Docked tree           | hjkl, file ops, decorators       | MEDIUM       |
| **oil.nvim**               | Editable buffer       | `i`/`d`/`p`, `:w`, `-` parent    | VERY HIGH    |
| **mini.files**             | Miller columns        | `h`/`l`, `m{char}` marks, trim   | VERY HIGH    |
| **telescope-file-browser** | Fuzzy picker          | Fuzzy search, create-on-type     | HIGH         |
| **dirvish / vinegar**      | Minimal in-window     | `-`, `y.`, visual + ops          | MODERATE     |
| **yazi.nvim**              | Embedded terminal     | Terminal-native                  | LOW          |

---

## 5. Folding

### 5.1 Current State in the Plugin

The plugin implements basic fold keybindings in `src/workspace/navigation.ts`:

| Key                | Command            | Mechanism                    |
| ------------------ | ------------------ | ---------------------------- |
| `zc`               | Fold at cursor     | CM6 `foldCode`               |
| `zo`               | Unfold at cursor   | CM6 `unfoldCode`             |
| `za`               | Toggle fold        | CM6 `toggleFold`             |
| `zM`               | Fold all headings  | Obsidian `editor:fold-all`   |
| `zR`               | Unfold all         | Obsidian `editor:unfold-all` |
| `zO` / `zC` / `zA` | Recursive variants | Aliases to zo/zc/za          |

**Not implemented**: `zf` (create fold in visual mode), `zd`/`zD` (delete fold / delete folds recursively), `zE` (eliminate all folds), `zr`/`zm` (reduce/increase fold level incrementally), custom fold text/preview, markdown-aware fold providers.

**Important**: The codemirror-vim fork has **ZERO fold commands** in its default keymap. The `z` prefix is only used for scroll commands (`zz`, `zt`, `zb`). All fold support comes entirely from the plugin's side via `reg.mapCommand()`.

### 5.2 nvim-ufo

**Repository**: [kevinhwang91/nvim-ufo](https://github.com/kevinhwang91/nvim-ufo) | **Stars**: ~3k

#### Architecture

```
nvim-ufo provider system

provider_selector(bufnr, filetype, buftype)
    --> returns provider name or function

    +----------+  +----------+  +----------+
    | lsp      |  |treesitter|  | indent   |
    | provider |  | provider |  | provider |
    +----------+  +----------+  +----------+
    +----------+  +----------+
    | marker   |  | custom   |  (user-defined)
    +----------+  +----------+
```

#### Key Concepts

1. **Provider chain** (main + fallback): `{'treesitter', 'indent'}` means try treesitter first, fall back to indent
2. **Provider selector**: A function `(bufnr, filetype, buftype) --> '{provider}'` per buffer, enabling filetype-specific fold strategies
3. **`foldmethod` override**: ufo always sets `foldmethod = manual` internally, computing folds asynchronously through its provider pipeline
4. **Close-by-kind**: Auto-close specific fold types on buffer open (e.g., `imports`, `comments`). For markdown, this could be `frontmatter` or `code_blocks`.

#### Built-in Providers

| Provider       | Source                      | Applicable to Markdown?               |
| -------------- | --------------------------- | ------------------------------------- |
| **lsp**        | `textDocument/foldingRange` | No (no Markdown LSP)                  |
| **treesitter** | `queries/<lang>/folds.scm`  | Yes (Markdown has TS folding queries) |
| **indent**     | Custom indent-based folding | Works but suboptimal for Markdown     |
| **marker**     | `{{{` / `#region` markers   | Not relevant for Markdown             |

#### Portability

**Portable**: The provider selector pattern maps directly to CM6's `foldService` facet with fallback logic. The close-by-kind concept could fold frontmatter or code blocks on file open.

**Not portable**: LSP fold provider (not applicable), treesitter queries (CM6 uses Lezer grammar instead), async promise-based fold resolution, `foldmethod` manipulation.

### 5.3 Other Neovim Fold Plugins

#### pretty-fold.nvim

[anuvyklack/pretty-fold.nvim](https://github.com/anuvyklack/pretty-fold.nvim) -- Customizes fold text display only (does NOT create folds). Features: section-based display with left-aligned content and right-aligned metadata (line count, percentage), content extraction showing first non-blank line, `add_close_pattern` appending closing brackets to fold text, filetype-specific config.

**CM6 equivalent**: `foldConfig.preparePlaceholder` (added in CM6 v6.9.0) allows computing custom placeholder text. This is the direct equivalent.

#### fold-preview.nvim

[anuvyklack/fold-preview.nvim](https://github.com/anuvyklack/fold-preview.nvim) -- Auto-opens a float window with fold contents when cursor hovers on a folded line.

**Obsidian translation**: Could be implemented as a CM6 tooltip extension, or as temporary fold expansion while the cursor stays on the folded line.

#### nvim-origami

[chrisgrieser/nvim-origami](https://github.com/chrisgrieser/nvim-origami) -- Lightweight fold QoL. **Key insight**: It overloads `h` to close a fold when on the first column, and `l` to open a fold. This eliminates dedicated fold keys by making navigation keys fold-aware.

**Portable concept**: Fold-aware navigation -- auto-open folds when entering them, close when leaving.

### 5.4 Neovim Built-in Fold Methods

| Method     | Mechanism                          | Markdown Applicability                                     |
| ---------- | ---------------------------------- | ---------------------------------------------------------- |
| **manual** | `zf`/`zd` to define/delete         | Requires user action                                       |
| **indent** | Folds at same indent level         | Partial -- headings have consistent indent in some formats |
| **expr**   | Custom expression per line         | Can parse `# ` heading markers                             |
| **syntax** | Vim syntax regions with `fold` arg | Works but CM5-era approach                                 |
| **diff**   | Fold unchanged diff lines          | Diff-only                                                  |
| **marker** | `{{{` / `}}}` markers              | Requires file modification                                 |

**Best for markdown in Neovim**: `foldmethod=expr` with heading-level detection, or treesitter-based `foldexpr()` using `folds.scm` queries.

### 5.5 CodeMirror 6 Folding API (Deep Dive)

#### Architecture

```
CM6 Folding System

Detection:
  foldService (facet)  --> checked FIRST per line
  foldNodeProp (NodeProp) --> checked SECOND via syntax tree
  foldable(state, lineStart, lineEnd) --> {from, to} | null

Storage:
  foldState (StateField) --> DecorationSet of replace decorations
  foldEffect --> add fold range
  unfoldEffect --> remove fold range

UI:
  foldGutter --> gutter markers
  codeFolding --> placeholder DOM
  foldKeymap --> Ctrl-Shift-[, Ctrl-Alt-[, etc.

Commands:
  foldCode --> fold line at cursor
  unfoldCode --> unfold line at cursor
  toggleFold --> toggle fold at cursor
  foldAll --> fold all top-level ranges
  unfoldAll --> unfold all folded ranges
```

#### Two Ways to Register Fold Providers

**Method 1: `foldService` (Facet)** -- Most portable, checked first:

```typescript
import { foldService } from '@codemirror/language';

const myFoldService = foldService.of((state, lineStart, lineEnd) => {
    const line = state.doc.lineAt(lineStart);
    if (line.text.startsWith('## ')) {
        let end = findSectionEnd(state, line);
        if (end > lineEnd) return { from: lineEnd, to: end };
    }
    return null;
});
```

**Method 2: `foldNodeProp` (NodeProp)** -- Syntax tree based:

```typescript
import { foldNodeProp, foldInside } from '@codemirror/language';

const myLang = parser.configure({
    props: [
        foldNodeProp.add({
            Block: (tree, state) => ({
                from: state.doc.lineAt(tree.from).to,
                to: tree.to,
            }),
            FencedCode: foldInside,
        }),
    ],
});
```

#### What `@codemirror/lang-markdown` Already Does

The markdown language package provides two fold mechanisms:

1. **`headerIndent` foldService**: Heading sections fold from end of heading line to start of next same/higher-level heading.
2. **`Block` foldNodeProp**: All `Block` nodes that are NOT `Document`, NOT headings, and NOT lists get foldable ranges from line-end to node-end.

#### What is Foldable by Default in CM6 Markdown

| Element          | Foldable?                    | How                                    |
| ---------------- | ---------------------------- | -------------------------------------- |
| Heading sections | Yes                          | Via `headerIndent` foldService         |
| Code blocks      | Yes                          | Via `Block` foldNodeProp               |
| Blockquotes      | Yes                          | Via `Block` foldNodeProp               |
| Lists            | **No** (explicitly disabled) | List nodes shadow first list item fold |
| List items       | Yes                          | Each item is foldable via `Block`      |
| Frontmatter      | Depends on parser            | YAML frontmatter is a Block if parsed  |
| Callouts         | Depends on parser            | If parsed as a Block, yes              |
| GFM Tables       | Yes                          | Via `foldNodeProp.add({ Table: ... })` |

**Important: Lists are NOT foldable.** From the CM6 lang-markdown changelog: _"Disable folding for list nodes (since it will shadow the folding on the first list item)."_

#### Fold Commands Exported by CM6

| Command      | Function              | Default Keybinding |
| ------------ | --------------------- | ------------------ |
| `foldCode`   | Fold line at cursor   | `Ctrl-Shift-[`     |
| `unfoldCode` | Unfold line at cursor | `Ctrl-Shift-]`     |
| `toggleFold` | Toggle fold at cursor | None               |
| `foldAll`    | Fold all top-level    | `Ctrl-Alt-[`       |
| `unfoldAll`  | Unfold all            | `Ctrl-Alt-]`       |

### 5.6 Obsidian's Current Folding

**Built-in behavior**: Toggle arrow next to headings (folds content until next same/higher heading), toggle arrow next to indented content (folds sub-items), commands `editor:fold-all`, `editor:unfold-all`, `editor:fold-more`, `editor:fold-less`.

**Why this is problematic for vim users**:

1. **Focus issues**: `:obcommand editor:toggle-fold` checks if the editor has focus, but during vim ex-mode the command line has focus, so it toggles the wrong element.
2. **Cursor position after fold**: When `editor:fold-more` folds a heading, the cursor stays at its old position (now inside a hidden fold), causing it to auto-unfold on the next keystroke.
3. **No cursor-relative folding**: Obsidian's fold commands are all document-level (fold one level across the entire doc) rather than cursor-local (fold this section). The plugin sidesteps this by using CM6's `foldCode`/`unfoldCode`/`toggleFold` directly.

### 5.7 Implementation Recommendations

#### Priority 1: Custom Markdown Fold Provider

Register a `foldService` that adds foldable regions for elements not covered by the default CM6 markdown setup:

```typescript
import { foldService, syntaxTree } from '@codemirror/language';

function markdownFoldProvider() {
    return foldService.of((state, lineStart, lineEnd) => {
        const tree = syntaxTree(state);
        const node = tree.resolveInner(lineEnd, -1);

        // Fold frontmatter
        if (node.name === 'Frontmatter') {
            const docLine = state.doc.lineAt(node.from);
            if (lineStart === docLine.from) {
                return { from: lineEnd, to: node.to };
            }
        }

        // Fold callouts
        if (node.name === 'Callout') {
            return { from: lineEnd, to: node.to };
        }

        return null;
    });
}
```

#### Priority 2: Missing Fold Commands

| Vim Key            | CM6 Equivalent | Implementation                                                          |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| `zf` (visual mode) | `foldEffect`   | Select range in visual mode, dispatch `foldEffect.of(range)`            |
| `zd`               | `unfoldEffect` | Find fold at cursor, dispatch `unfoldEffect`                            |
| `zD`               | Same as `zd`   | CM6 folds do not nest in the same way as Neovim                         |
| `zE`               | `unfoldAll`    | Already available from CM6                                              |
| `zr`               | Custom         | CM6 lacks fold levels -- needs custom StateField tracking current depth |
| `zm`               | Custom         | Same -- incrementally fold by heading depth                             |

#### Priority 3: Fold Text Enhancement

Using `preparePlaceholder` (CM6 v6.9.0+):

````typescript
codeFolding({
    preparePlaceholder: (state, range) => {
        const startLine = state.doc.lineAt(range.from);
        const endLine = state.doc.lineAt(range.to);
        const lineCount = endLine.number - startLine.number;

        const headingMatch = startLine.text.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            return `${headingMatch[2]} -- ${lineCount} lines`;
        }

        if (startLine.text.match(/^```/)) {
            const lang = startLine.text.slice(3).trim() || 'code';
            return `${lang} block -- ${lineCount} lines`;
        }

        return `${lineCount} lines`;
    },
});
````

#### Priority 4: Fold-Aware Navigation

Port nvim-origami's concept: `]h`/`[h` heading navigation should auto-open folds covering the target. CM6 already partially handles this -- when the cursor enters a folded range during editing, the fold auto-opens. But navigation motions that jump into a fold do not trigger this behavior.

### 5.8 Portability Analysis

| Concept                          | Portable to CM6? | How                                            |
| -------------------------------- | ---------------- | ---------------------------------------------- |
| Provider selector pattern        | Yes              | `foldService` facet with fallback logic        |
| Indent-based folding             | Yes              | Custom `foldService` checking indentation      |
| Markdown section folding         | Yes              | Already built into `@codemirror/lang-markdown` |
| Treesitter fold queries          | No               | Neovim-specific; CM6 uses Lezer grammar        |
| LSP folding range                | No               | Not applicable (no Markdown LSP)               |
| Fold preview float window        | Partial          | Tooltip-based preview possible                 |
| Custom fold text                 | Yes              | `preparePlaceholder` in `codeFolding()`        |
| Fold by syntax node type         | Yes              | `foldNodeProp` on Lezer node types             |
| Persistent folds                 | Yes              | `foldState` supports `toJSON`/`fromJSON`       |
| Fold-level increment (`zr`/`zm`) | Partial          | CM6 lacks fold levels; needs custom StateField |

---

## 6. Additional High-Value Areas

Beyond the five primary areas, the following Neovim plugin categories were assessed for feasibility, demand, Obsidian overlap, and implementation complexity.

### 6.1 Flash/Leap-Style Motions (HIGHEST PRIORITY)

**Plugins**: [flash.nvim](https://github.com/folke/flash.nvim) (~5.3k stars), [leap.nvim](https://github.com/ggandor/leap.nvim) (~5k stars), [hop.nvim](https://github.com/smoka7/hop.nvim) (~3.3k stars)

**What they add over EasyMotion**: When you press `f` then a character, instead of jumping to just the first match, labels appear on ALL visible matches. Press a label to jump directly. Additionally, flash supports "remote operations" (`df{char}{label}` deletes to the labeled position) and treesitter-aware word/paragraph motions.

**Community evolution**: EasyMotion (VimScript) --> hop.nvim (first Lua port) --> leap.nvim (two-char jump) --> flash.nvim (unified approach, now dominant). Combined ~13k stars across these plugins represents the clearest signal of community demand.

**Feasibility**: **HIGH** -- Builds directly on the existing EasyMotion infrastructure. The plugin already has async motion support, label rendering, and operator-pending integration. Flash adds: (1) enhanced `f`/`F`/`t`/`T` with multi-match labels, (2) remote operations with operators, (3) two-char jump mode (`s`/`S` like leap). Items 1-2 are achievable with the existing infrastructure.

**Obsidian Overlap**: NONE -- Obsidian has no vim-style jump navigation.

**Complexity**: MEDIUM -- Modify `f`/`F`/`t`/`T` to enter a "flash mode" showing labels on all visible matches. Reuse the existing label painting mechanism from EasyMotion. Add remote operator support (execute an operator at the labeled position).

### 6.2 Marks and Bookmarks

**Plugins**: [harpoon](https://github.com/ThePrimeagen/harpoon) (~9.1k stars), [marks.nvim](https://github.com/chentoast/marks.nvim) (~1.2k stars), [grapple.nvim](https://github.com/cbochs/grapple.nvim) (~710 stars), [arrow.nvim](https://github.com/otavioschwanck/arrow.nvim) (~743 stars)

Vim marks (`m{a-z}`, `'{a-z}`) already work via codemirror-vim. What is missing is **visibility**: users do not know what marks they have set or what they point to.

**Feasibility**: **HIGH** -- Mark storage and navigation are free (already in CM6). A marks sidebar (`MarksView` as an Obsidian `ItemView`) listing all marks with line content preview is ~200 lines of code. Per-vault marks (harpoon-style: mark files, not just positions) adds project-level navigation.

**Demand**: HIGH -- harpoon alone has 9.1k stars, making it one of the most popular Neovim plugins.

**Obsidian Overlap**: MEDIUM -- Obsidian has bookmarks (starred files) and recent files, but not per-position marks. The vim mark system and Obsidian's bookmark system serve different purposes.

**Complexity**: LOW-MEDIUM -- Mark visualization is a list view + position storage. harpoon-style per-file marks require additional persistence.

### 6.3 Increment/Decrement (dial.nvim)

**Plugin**: [dial.nvim](https://github.com/monaqa/dial.nvim) (~1.1k stars)

`<C-a>`/`<C-x>` currently increment/decrement numbers in codemirror-vim. dial.nvim extends this to handle: hex colors (`#ff0000` to `#ff0001`), dates (`2024-01-01` to `2024-01-02`), CSS values, boolean cycling (`true`/`false`), and user-defined patterns.

**Feasibility**: **HIGH** -- Small implementation scope. Override `<C-a>`/`<C-x>`, detect word under cursor, match against patterns (number, hex color, date, CSS unit, boolean), apply appropriate increment/decrement, replace text.

**Demand**: MEDIUM (1.1k stars).

**Obsidian Overlap**: NONE -- Obsidian has no numeric increment/decrement feature.

**Complexity**: LOW -- A few regex-based handlers.

### 6.4 Registers and Clipboard

**Plugins**: [yanky.nvim](https://github.com/gbprod/yanky.nvim) (~1.5k stars), nvim-neoclip

Enhanced yank/paste with history. yanky's "yank-ring" allows cycling through previous yanks with `<C-p>` after pasting. Register visualization provides a browsable history of all yank/delete operations.

**Feasibility**: MEDIUM -- Requires hooking into CM6's clipboard event pipeline and maintaining a separate register history. The yank-ring (`<C-p>` to cycle) is achievable; a telescope-style register browser needs picker infrastructure first.

**Demand**: MEDIUM (1.5k stars).

**Obsidian Overlap**: LOW -- Obsidian does not expose registers. System clipboard is separate from vim registers.

**Complexity**: MEDIUM-HIGH -- Register history storage + picker UI for browsing.

### 6.5 Enhanced Text Objects (mini.ai)

**Plugin**: Part of [mini.nvim](https://github.com/echasnovski/mini.nvim)

mini.ai extends the text object system with additional targets: argument text objects (`ia`/`aa` for function arguments), block text objects, and user-defined custom targets. The plugin already has 12 markdown text objects; mini.ai-style enhancements are additive.

**Feasibility**: **HIGH** -- Builds on existing text object infrastructure. New text objects need CM6 selection extensions.

**Demand**: MEDIUM (part of the highly-starred mini.nvim ecosystem).

**Obsidian Overlap**: NONE.

**Complexity**: MEDIUM.

### 6.6 Subword Motions (spider.nvim)

**Plugin**: [nvim-spider](https://github.com/chrisgrieser/nvim-spider) (~893 stars)

Smarter `w`/`b`/`e`/`ge` word motions with two behavioral changes: subword awareness and insignificant punctuation skipping.

**Subword motion** stops at segments within compound identifiers:

```
--  vim's w:   local myVariableName = FOO_BAR_BAZ
--                  ^              ^ ^
-- spider w:   local myVariableName = FOO_BAR_BAZ
--                  ^ ^       ^    ^ ^   ^   ^
```

Patterns used (from `pattern-variants.lua`): `%d+` (numbers), `%u?%l+` (camelCase segments forward), `%l+%u?` (camelCase segments backward), `%u%u+` (ALL_CAPS segments). These are pure Lua patterns (equivalent to JS regex) with no treesitter dependency.

**Insignificant punctuation skipping**: Skips punctuation that is not surrounded by whitespace (e.g., `:` in `foo:find()` is skipped, but `==` is significant). Configurable via `skipInsignificantPunctuation`.

**Dependencies**: Pure Lua, zero external dependencies. No treesitter, no Neovim-specific APIs beyond basic cursor/buffer operations. Optional `luautf8` rock for UTF-8 support.

**CM6 Feasibility**: **VERY HIGH** -- The entire algorithm is: get line text, apply regex patterns to find word boundaries, find closest match relative to cursor, set cursor. The Lua patterns translate nearly 1:1 to JavaScript regex (`%d+` becomes `/\d+/g`, `%u?%l+` becomes `/[A-Z]?[a-z]+/g`, etc.). Can be implemented as custom motion handlers in the codemirror-vim fork.

**Obsidian Overlap**: NONE.

**Complexity**: LOW-MEDIUM -- Four motion handlers (`w`/`b`/`e`/`ge`) with pattern matching. Core logic is ~100 lines.

### 6.7 Additional Text Objects (various-textobjs.nvim)

**Plugin**: [nvim-various-textobjs](https://github.com/chrisgrieser/nvim-various-textobjs) (~771 stars)

A bundle of 30+ text objects, all implemented with pure Lua pattern matching (no treesitter dependency). The existing Motions plugin has 12 markdown-specific text objects; various-textobjs provides general-purpose text objects that complement them.

**Dependencies**: Pure Lua, zero external dependencies. All core text objects use `string.find()` and `gmatch()` for pattern matching. Some deprecated filetype-specific text objects were redirected to treesitter, but all current text objects are pattern-based.

#### Complete Text Object Inventory

**Charwise (pattern-based, 100% CM6-feasible)**:

| Key       | Name                 | What it matches                                                       |
| --------- | -------------------- | --------------------------------------------------------------------- |
| `iD`/`aD` | doubleSquareBrackets | Text between `[[` and `]]` -- extremely useful for Obsidian wikilinks |
| `iq`/`aq` | anyQuote             | Between any unescaped `"`/`'`/`` ` `` on one line                     |
| `in`/`an` | number               | Digits (inner), sign+decimal (outer includes `-` and `.`)             |
| `L`       | url                  | `http(s)://` or other protocol URLs                                   |
| `iF`/`aF` | filepath             | UNIX filepath, supports `~`/`$HOME`                                   |
| `i,`/`a,` | argument             | Comma-separated argument                                              |
| `iv`/`av` | value                | RHS of `=`/`:` assignment, excludes trailing comment                  |
| `ik`/`ak` | key                  | LHS of `=`/`:` assignment                                             |
| `im`/`am` | chainMember          | Chain segment connected with `.` or `:`                               |
| `i#`/`a#` | color                | HEX, RGB, HSL, ANSI color codes                                       |
| `.`       | emoji                | Single emoji or NerdFont glyph                                        |
| `C`       | toNextClosingBracket | Cursor to next `]`/`)`/`}` (multiline)                                |
| `Q`       | toNextQuotationMark  | Cursor to next unescaped quote (multiline)                            |
| `n`       | nearEoL              | Cursor to end of line excluding last char                             |
| `g;`      | lastChange           | Last non-deletion change region                                       |

**Subword**:

| Key       | Name    | What it matches                                                                      |
| --------- | ------- | ------------------------------------------------------------------------------------ |
| `iS`/`aS` | subword | Segment of camelCase/snake*case/kebab-case (outer includes trailing/leading `*`/`-`) |

**Linewise**:

| Key                 | Name              | What it matches                                |
| ------------------- | ----------------- | ---------------------------------------------- |
| `ii`/`ai`/`aI`/`iI` | indentation       | Surrounding lines with same/higher indentation |
| `R`                 | restOfIndentation | Lines downward with same/higher indentation    |
| `r`                 | restOfParagraph   | Like `}` but linewise                          |
| `gG`                | entireBuffer      | Full buffer content                            |
| `gw`                | visibleInWindow   | All lines visible in window                    |

**Not applicable to Obsidian/CM6**: `closedFold` (Neovim fold API), `diagnostic` (Neovim diagnostic API), `notebookCell` (Jupyter-style `# %%` delimiters).

#### Key Conflicts with Existing Motions Text Objects

| Key         | Motions Plugin Uses For | various-textobjs Uses For | Resolution                                              |
| ----------- | ----------------------- | ------------------------- | ------------------------------------------------------- |
| `io`/`ao`   | Callouts                | anyBracket                | Keep callouts (Obsidian-specific), skip anyBracket      |
| `i_`/`a_`   | Italic (underscore)     | lineCharacterwise         | Keep italic (markdown-specific), skip lineCharacterwise |
| `i\|`/`a\|` | Table cell              | column (blockwise)        | Keep table cell (markdown-specific), skip column        |

#### Recommended Additions (No Conflicts)

**Tier 1 -- High value, Obsidian-relevant**:

- `iD`/`aD` (doubleSquareBrackets) -- Obsidian's core `[[wikilink]]` syntax. This is the single most valuable addition.
- `iS`/`aS` (subword) -- Complements spider.nvim subword motions.
- `in`/`an` (number) -- Universally useful, trivial to implement.

**Tier 2 -- Medium value**:

- `iq`/`aq` (anyQuote) -- Handle any quote type with one key.
- `L` (url) -- Forward-seeking URL selection, different from existing `il`/`al` (markdown links).
- `i,`/`a,` (argument) -- Useful for Lua config editing.

**Tier 3 -- Lower priority**:

- `iv`/`av` and `ik`/`ak` (value/key) -- For key-value config editing.
- `im`/`am` (chainMember) -- For `foo.bar()` chain editing.
- `i#`/`a#` (color) -- For theme/CSS editing.
- `.` (emoji) -- Note-taking involves emoji frequently.

#### mini.ai Framework Concept

[mini.ai](https://github.com/echasnovski/mini.nvim) (part of mini.nvim, ~9.3k stars for the suite) takes a different approach: instead of bundling fixed text objects, it provides a **framework** for creating them via `gen_spec.pair()`:

```lua
gen_spec.pair('*', '*', { type = 'greedy' })     -- for **bold**
gen_spec.pair('_', '_', { type = 'greedy' })     -- for __underline__
gen_spec.pair('[[', ']]', { type = 'non-balanced' })  -- for [[wikilinks]]
```

This pattern is worth borrowing: a `gen_spec.pair()`-style API would let Lua users define their own markdown text objects without writing selection logic. mini.ai also provides `g[`/`g]` motions to jump to text object edges, which would complement the text object system.

**CM6 Feasibility**: **VERY HIGH** -- All text objects in various-textobjs use `string.find()` / `gmatch()` which map directly to JavaScript `String.match()` / `String.matchAll()`. The one Lua-specific construct (`%b()` for balanced matching) requires a simple stack-based counter in JS instead.

### 6.8 Search Enhancement (hlslens)

**Plugin**: nvim-hlslens

Adds a match counter decoration (e.g., `[3/15]`) when searching with `/` or `?`, showing the current match index and total count. A quality-of-life improvement for search navigation.

**Feasibility**: **HIGH** -- Counting search matches and displaying `[3/15]` as a CM6 decoration or in the status bar is a small, self-contained feature.

**Demand**: LOW-MEDIUM.

**Obsidian Overlap**: PARTIAL -- Obsidian's search pane shows match counts but not inline in the editor during vim `/` search.

**Complexity**: LOW.

### 6.9 Commenting (Comment.nvim)

**Plugin**: [Comment.nvim](https://github.com/numToStr/Comment.nvim) (~4.7k stars)

Enhanced commenting with `gc`/`gcc` (line comments) and `gb`/`gbc` (block comments). codemirror-vim already has basic `gc`/`gcc` support.

**Feasibility**: MEDIUM -- Enhancing the existing `gc`/`gcc` to support block comments and more intelligent toggling in markdown (HTML comments) is achievable.

**Demand**: HIGH (4.7k stars), but partially covered.

**Obsidian Overlap**: PARTIAL -- Obsidian has `Toggle comment` (`Ctrl+/`), and `gc`/`gcc` are already available in CM6 vim.

**Complexity**: LOW-MEDIUM.

### 6.10 Undo Tree

**Plugin**: [undotree](https://github.com/mbbill/undotree) (~4.5k stars)

Visual undo tree showing the full branching history of edits. CM6 has robust undo/redo history (it is internally a tree structure), but traversing and visualizing it is non-trivial.

**Feasibility**: MEDIUM -- CM6's undo history exists but is complex to traverse. Rendering a tree visualization in Obsidian's view API is significant work. Maintaining correctness across vim operations (`u`, `<C-r>`, `g+`, `g-`) is error-prone.

**Demand**: MEDIUM (4.5k stars).

**Obsidian Overlap**: MEDIUM -- Obsidian has native undo/redo. Some community plugins provide undo tree views. But vim-specific undo branches (`g+`, `g-`) are not surfaced.

**Complexity**: HIGH.

### 6.11 Categories to Skip

**Session/Project** ([persistence.nvim](https://github.com/folke/persistence.nvim) ~1k stars): Obsidian is its own workspace manager. It already opens the last vault and restores pane layout. Vim sessions (`:mksession`) are not a concept in Obsidian. **Complete overlap.**

**Window Management** ([smart-splits.nvim](https://github.com/mrjones2014/smart-splits.nvim) ~1.5k stars): Obsidian panes are not vim windows. There is a fundamental paradigm mismatch between `<C-w>` motions in Neovim (grid-aligned windows) and Obsidian's `WorkspaceLeaf`/`WorkspaceSplit` model. The plugin already maps `<C-w>h/j/k/l` to Obsidian pane navigation, which is the best possible approximation. **Paradigm mismatch.**

**Zen/Focus Mode** (zen-mode.nvim, twilight.nvim): Obsidian has built-in "Focus mode" toggling sidebar visibility. Community plugins like "Focus Mode", "Hider", and "Minimal" theme's focus mode fully cover this. **Complete overlap.**

**Auto-pairs** ([nvim-autopairs](https://github.com/windwp/nvim-autopairs) ~4.1k stars): Obsidian already auto-pairs brackets and quotes natively. CM6 has built-in `closeBrackets`. **Complete overlap.**

**Split/Join** ([treesj](https://github.com/Wansmer/treesj)): Splits or joins code blocks using treesitter to understand balanced syntax structures. **Infeasible** -- treesj fundamentally depends on treesitter for understanding syntax node boundaries (function arguments, table constructors, conditional branches). CM6 uses Lezer, not treesitter, and Lezer's markdown grammar does not expose the same node types. A limited version (split/join list items, split/join pipe-separated table cells) could be implemented with regex, but would not match treesj's generality. Not worth pursuing without tree-sitter WASM.

**Statusline/UI** ([noice.nvim](https://github.com/folke/noice.nvim) ~5.8k stars, lualine.nvim): Obsidian controls its own status bar, command palette, and notifications. A full lualine/noice replacement would fight Obsidian's design. Incremental improvements (mode indicator, recording indicator) are small scope and already partially covered by the plugin's status bar. **High overlap.**

**Note on noice.nvim's command-line popup**: While noice as a whole is not applicable, one specific pattern is worth noting: noice replaces Neovim's command-line (`:`) with a floating popup that provides autocompletion, inline documentation, and a preview of what the command will do. The Motions plugin's `:ob`, `:grep`, and `:find` commands already use custom `SuggestModal` popups for completion. A unified enhanced command-line experience -- showing ex-command autocompletion, inline help for available commands, and parameter hints -- could be implemented as an enhancement to the existing ex-command infrastructure. This is a quality-of-life improvement rather than a priority feature, but worth keeping in mind as the ex-command surface grows.

---

## 7. Grand Priority Matrix

All features across all areas combined into a single prioritized view:

### Tier 1: High-Impact, Proven Feasible

| Feature                                                         | Area         | Mobile   | Why                                                           |
| --------------------------------------------------------------- | ------------ | -------- | ------------------------------------------------------------- |
| Picker/fuzzy finder (file, buffer, command, headings)           | Picker       | Yes (JS) | All data via Obsidian API; uFuzzy is 7.5KB                    |
| Snippets Phase 1 (friendly-snippets + CM6 built-in)             | Snippets     | Yes      | CM6 handles 60%; just load JSON                               |
| Flash-style label motions                                       | Motions      | Yes      | Extends existing EasyMotion infra; ~13k combined stars        |
| File explorer quick wins (`-`, `y.`, `:rename`, create-on-type) | Explorer     | Yes      | Builds on existing `:find`/`:e` infrastructure                |
| Fold text enhancement (`preparePlaceholder`)                    | Folding      | Yes      | Single config, high visual impact                             |
| `iD`/`aD` wikilink text object                                  | Text Objects | Yes      | Obsidian's core `[[]]` syntax; trivial to implement           |
| Subword `w`/`b`/`e` motions (spider.nvim)                       | Motions      | Yes      | Pure regex; daily-driver improvement for camelCase/snake_case |

### Tier 2: Medium Effort, High Value

| Feature                                                              | Area         | Mobile | Why                                                    |
| -------------------------------------------------------------------- | ------------ | ------ | ------------------------------------------------------ |
| Marks sidebar/UI                                                     | Marks        | Yes    | Marks already work; need visibility. Zero competition. |
| dial.nvim-style increment (`<C-a>`/`<C-x>` for hex, dates, booleans) | Editing      | Yes    | Small scope, regex handlers. Zero competition.         |
| Custom fold providers (frontmatter, callouts)                        | Folding      | Yes    | `foldService` facet                                    |
| `zf`/`zd` fold commands                                              | Folding      | Yes    | `foldEffect`/`unfoldEffect`                            |
| Snippets Phase 2 (choice nodes, transforms, user snippets)           | Snippets     | Yes    | JS regex advantage over Neovim                         |
| Yank history / register picker                                       | Registers    | Yes    | Needs picker infrastructure first. Zero competition.   |
| Additional text objects (`iS`, `in`, `iq`, `L`, `i,`)                | Text Objects | Yes    | Pure regex; complements existing 12                    |
| Subword text object (`iS`/`aS`)                                      | Text Objects | Yes    | Complements spider.nvim motions                        |

### Tier 3: Flagship, Significant Effort

| Feature                                               | Area         | Mobile  | Why                                                 |
| ----------------------------------------------------- | ------------ | ------- | --------------------------------------------------- |
| Oil-style vault-as-buffer view                        | Explorer     | Partial | Custom ItemView, staging model. Unique in Obsidian. |
| Snippets Phase 3 (Lua-powered function/dynamic nodes) | Snippets     | Yes     | Fengari integration                                 |
| Vault grep via ripgrep WASM                           | Picker       | No      | WASI-to-Vault adapter needed; desktop only          |
| Undo tree visualization                               | Editing      | Yes     | Zero competition; high differentiator               |
| `gen_spec.pair()` text object framework               | Text Objects | Yes     | User-defined text objects via Lua                   |

---

## 8. Technical Feasibility Notes

### WASM in Obsidian

Obsidian runs in Electron, which supports `node:wasi`. The ripgrep WASM package ships as pure ESM with brotli-compressed WASM. However, it expects filesystem paths via WASI syscalls. To use it with Obsidian's vault, a virtual filesystem adapter would be needed that maps WASI file operations (`fd_read`, `fd_seek`, `path_open`) to `app.vault.*` API calls. This is feasible but non-trivial. For MVP, a JS-based vault search using `app.vault.read()` + `uFuzzy` regex matching is simpler and has no WASM complexity.

The nucleo-matcher-wasm package is simpler: it takes string arrays as input and returns scored results. No filesystem access needed. It can be used immediately as a drop-in fuzzy matcher.

### CM6 Snippet Engine

The built-in snippet engine in `@codemirror/autocomplete` exposes public APIs: `snippet()`, `snippetCompletion()`, `ActiveSnippet` StateField, `snippetKeymap` facet, `nextSnippetField`/`prevSnippetField`. Extending it for choice nodes requires a custom tooltip widget that appears when the cursor enters a choice field. For variable transforms, the JS-native ECMAScript regex engine is available, giving the plugin an advantage over Neovim (where mini.snippets explicitly punted on transforms because implementing an ECMAScript regex parser in Lua is impractical).

### Fold Levels

CM6 has no concept of fold levels (unlike Neovim's `foldlevel`). The commands `zr` (reduce fold level) and `zm` (increase fold level) would require a custom StateField that tracks the current "fold depth" and selectively folds/unfolds by heading depth. `editor:fold-more` / `editor:fold-less` from Obsidian provide similar functionality but operate document-wide and have the focus/cursor issues described in section 5.6.

### Flash on CM6

The core requirement for flash-style motions is: "show labels on all visible matches of a character." The plugin already does this for EasyMotion. Flash adds: (1) enhanced `f`/`F`/`t`/`T` with multi-match labels -- when pressing `f{char}`, if there are multiple matches on screen, show labels instead of jumping to the first one; (2) remote operations -- `d<flash>{label}` executes the delete operator to the labeled position; (3) treesitter-aware word motions -- skip for now (not feasible without tree-sitter WASM). Items 1-2 are achievable with the existing async motion + label rendering infrastructure.

### Fuzzy Search Recommendation

For MVP: use **uFuzzy** (7.5KB, pure JS, fastest in class). For scale: add **nucleo-matcher-wasm** (~100KB, 10x faster than best pure JS). The recommendation is to ship with uFuzzy initially and add nucleo as an optional enhancement for large vaults (10K+ notes).

---

## 9. Obsidian Community Plugin Overlap

This section surveys existing Obsidian community plugins that attempt features proposed in this document. Understanding the competitive landscape helps decide where to build, integrate, or coexist.

### 9.1 Vim-Related Plugins

**obsidian-vimrc-support** ([esm7](https://github.com/esm7/obsidian-vimrc-support), ~147k downloads, 1.4k stars): The most-installed vim enhancement plugin for Obsidian. Loads `.obsidian.vimrc`, provides `surround`, `obcommand`, `jscommand`/`jsfile`, and motions (`[[`/`]]`, `gf`, `gl`). **Status: unmaintained** -- the README explicitly states the maintainer can no longer give it attention, with 94 open issues.

**Overlap with Motions**: Massive. The vimrc loader, surround, and markdown motions are all already built into Motions. **Recommendation: Supersede entirely.** Motions is the natural successor. The 147k user base is an acquisition opportunity. Ensure vimrc-support config files are importable.

**Other vim plugins**: More Vim (colinlienard), Better Vim (NilsGke), Vim KeyNav (guoang), Vim Scrolling (xlongfeng), Flash Navigator (iyioon), Vim Yank Highlight (aleksey-rowan). These are small, single-feature plugins that each do one thing Motions already covers or could trivially add. The fragmentation is Motions' opportunity: offer a unified experience that subsumes all of them.

**Vim IM Control / Vim IM Select**: Automatically switches system input method (IME) when entering/exiting insert mode. **Recommendation: Coexist.** This is orthogonal to Motions -- it solves a system-level input method problem. Motions should ensure it fires the same CM events that trigger IM switching.

**Flash Navigator** (iyioon): Flash.nvim-inspired label navigation. Early stage, minimal adoption. **Recommendation: Supersede.** Motions already has EasyMotion; Flash-style labels are a natural extension.

### 9.2 File Navigation and Picker Plugins

**Omnisearch** (Simon Cambier, ~1.5M downloads, 2k stars): BM25-ranked full-text search across vault, PDFs, images. The gold standard for vault search. **Recommendation: Coexist.** Do not build a full-text search engine. Provide keybindings to invoke Omnisearch (e.g., `<leader>s`). Consider exposing Omnisearch results as a picker source.

**Quick Switcher++** (darlal): Enhanced Quick Switcher with headings, symbols, canvas nodes, tags, links, open editors, workspaces. **Recommendation: Coexist / integrate.** QS++ is the incumbent for file switching. Motions should provide vim-friendly keybindings to invoke it, not rebuild it. A lightweight `:find` / `:b` command within the vim paradigm can coexist.

**Another Quick Switcher** (tadashi-aikawa, 397 stars, 249 releases): Configurable search commands with token-order-independent matching, grep support, and a public API (`api.pickFile()`). **Recommendation: Coexist.** The public API is interesting -- Motions could consume it.

**Lemons Search** (mProjectsCode): Fast fuzzy file finder with Rust matcher in web worker. **Recommendation: Coexist.**

### 9.3 Snippet Plugins

**Templater** (SilentVoid13/zachatoo, ~4.7M downloads, 5.1k stars): A **template engine**, not a text-expansion snippet engine. Creates dynamic file templates with `tp.file.*`, `tp.date.*` functions, cursor placement, and JS scripting. **Recommendation: Coexist.** Templater is about creating new notes from templates. Motions' proposed snippet feature is about inline text expansion while typing -- entirely different use cases.

**Snipsy** (Dimagious): Hotstrings (type `:todo` then expansion occurs), markdown-aware, Espanso-compatible packs, community catalog. Actively developed (2026). **Recommendation: Tread carefully.** This is the closest competitor to a Motions snippet feature. Motions' unique angle would be vim-style abbreviations (`:ab` command) and register-based expansion -- things Snipsy does not do.

**Text Snippets** (ArianaKhit): Hotkey-triggered (`Ctrl+Tab`), `$end$`/`$tb$` cursors, tabstop support. Older but functional. **Recommendation: Coexist.**

### 9.4 File Explorer Plugins

The file explorer space is **crowded**: Sidebar Keyboard Navigation (denvolok, NERDTree-style j/k/h/l), Quick Explorer (pjeby, menu-based, mature), File Tree Alternative (ozntel), Notebook Navigator (Johan Sandberg), Tree Navigator (brweinstein), Dired (gapmiss, Emacs-style text-buffer file manager), Enhance Navigate Pane (usero2).

**Recommendation: Do not build a full file explorer.** The ecosystem is saturated. Instead: provide vim keybindings to invoke existing explorers, and consider a lightweight oil-style `:E` command that opens a transient file list in the editor buffer. The oil-style "vault as buffer" concept is unique enough to stand out, but a full NERDTree replacement is not worth the effort.

### 9.5 Folding Plugins

**Creases** (liamcain, 287 stars, active): Fold state management using `%% fold %%` comment markers. Commands for toggle, fold-along-creases, iron-out. Supports fold levels (vim-style `zm`/`zr`). **Recommendation: Integrate tightly.** Motions should adopt the `%% fold %%` convention for fold persistence and provide first-class vim keybindings for fold-level management. Do not recreate Creases entirely.

### 9.6 Undo, Marks, and Other Gaps

**Undo tree**: **No undo-tree visualization exists for Obsidian.** Time Machine (dsebastien) visualizes file recovery snapshots and git commits, but not the per-edit branching undo tree. This is a completely unserved niche. **Recommendation: Build.** High-value differentiator.

**Marks/harpoon**: Obsidian Harpoon (maskdotdev, limited to 4 files), Tether Marks (Zetaniis, vim global marks inspired), Grappling Hook (bookmark cycler). All are limited implementations. **Recommendation: Build proper vim marks** (`m{a-zA-Z}`, `'{a-zA-Z}`) as a first-class feature with sidebar visualization. No existing plugin does this correctly.

**Increment/decrement**: No Vim-style `<C-a>`/`<C-x>` plugin exists. Existing plugins (obsidian-utils, TextToolsPlugin) operate on selections, not the word under cursor. **Recommendation: Build. Easy, zero competition.**

**Register history**: ClipFlow (helalsoft) is a general clipboard manager, not vim-register-aware. No plugin visualizes vim registers (`"a`-`"z`, `"0`-`"9`). **Recommendation: Build.** Unique differentiator.

### 9.7 Strategic Summary

| Proposed Feature                   | Competition Level                            | Verdict                                                                                  |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Vimrc loader, surround, EasyMotion | Fragmented, unmaintained                     | **Supersede** -- already built                                                           |
| Picker / fuzzy finder              | Heavily competed (QS++, Omnisearch, Lemons)  | **Integrate** -- provide vim keybindings to existing tools, add lightweight `:find`/`:b` |
| Snippets (inline expansion)        | Moderately competed (Snipsy, Text Snippets)  | **Build with unique angle** -- vim abbreviations, register-based                         |
| File explorer                      | Crowded (7+ plugins)                         | **Do not build** -- provide keybindings, consider oil-style as unique alternative        |
| Folding                            | Creases (active, conventions established)    | **Integrate** -- adopt `%% fold %%`, add fold-level commands                             |
| Flash-style motions                | Minimal (Flash Navigator, early stage)       | **Build** -- extend existing EasyMotion                                                  |
| Marks sidebar                      | Limited (3 harpoon-style plugins, all rough) | **Build** -- proper vim marks is unique                                                  |
| Increment/decrement                | None (no vim-style `<C-a>`/`<C-x>`)          | **Build** -- easy, zero competition                                                      |
| Register history                   | None (no vim register plugin)                | **Build** -- blue ocean                                                                  |
| Undo tree                          | None (no CM6 undo tree)                      | **Build** -- biggest opportunity                                                         |

---

## 10. Performance, Bundle Size, and Mobile Considerations

### 10.1 Bundle Size Budget

Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) emphasize keeping plugins small. The current Motions `main.js` bundle already includes a full codemirror-vim fork and the fengari Lua runtime. Adding WASM dependencies must be carefully considered:

| Dependency                     | Size                            | Load Strategy                                       |
| ------------------------------ | ------------------------------- | --------------------------------------------------- |
| uFuzzy (pure JS fuzzy matcher) | 7.5KB                           | Bundle directly -- negligible impact                |
| fuzzysort (pure JS)            | 6.2KB                           | Bundle directly -- negligible impact                |
| nucleo-matcher-wasm            | ~100KB WASM                     | Lazy-load on first picker invocation                |
| ripgrep WASM                   | ~2MB (brotli-compressed in ESM) | Lazy-load on first grep command, cache decompressed |
| friendly-snippets JSON         | ~50KB (markdown.json is small)  | Lazy-load on first snippet expansion                |

**Recommendation**: Pure JS dependencies (uFuzzy, fuzzysort) can be bundled directly. WASM dependencies (nucleo, ripgrep) must be lazy-loaded -- do not inflate startup time for features the user may not invoke in a session. Consider making WASM features opt-in via settings.

### 10.2 Startup Performance

Obsidian plugin `onload()` should be fast. Current best practices:

- **Defer heavy initialization**: Register commands and settings immediately; initialize fuzzy matchers, snippet loaders, and fold providers lazily on first use.
- **WASM loading**: Never load WASM during `onload()`. Initialize on first invocation of the feature that needs it.
- **Snippet collection**: Parse friendly-snippets JSON on first snippet trigger, not on plugin load.
- **Fold providers**: Register `foldService` facets immediately (they are cheap), but defer any heavy fold state computation.

### 10.3 Mobile Compatibility

The Motions plugin supports mobile (iOS/Android with physical keyboard). Not all proposed features work on mobile:

| Feature                       | Mobile Compatible? | Notes                                                                                                                                              |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picker/fuzzy finder (pure JS) | Yes                | uFuzzy/fuzzysort work in any JS environment                                                                                                        |
| Picker/fuzzy finder (WASM)    | Uncertain          | `node:wasi` is Electron-specific; mobile Obsidian uses a different runtime. nucleo-matcher-wasm may work if it supports browser WASM without WASI. |
| ripgrep WASM                  | No                 | Requires `node:wasi` or WASI polyfill; not available on mobile                                                                                     |
| Snippets (CM6 built-in)       | Yes                | Pure CM6 extension                                                                                                                                 |
| Snippets (fengari Lua)        | Yes                | fengari is pure JS                                                                                                                                 |
| Flash-style motions           | Yes                | Pure editor overlay                                                                                                                                |
| Fold enhancements             | Yes                | Pure CM6 fold API                                                                                                                                  |
| Marks sidebar (ItemView)      | Yes                | Obsidian views work on mobile                                                                                                                      |
| Oil-style vault buffer        | Uncertain          | Custom ItemView should work, but editing UX on mobile touchscreen is poor                                                                          |
| Increment/decrement           | Yes                | Pure editor command                                                                                                                                |
| Register history              | Yes                | Pure plugin state                                                                                                                                  |
| Undo tree visualization       | Yes                | Custom view + CM6 history                                                                                                                          |

**Policy**: Mobile compatibility is not the deciding factor for feature decisions. Desktop is the vast majority of the user base, and significant desktop improvements should not be blocked by mobile limitations. Features that happen to work on mobile are a bonus; features that require Electron-specific APIs (WASM with WASI, `node:wasi`) should gracefully degrade on mobile (disable the feature, fall back to pure JS alternative).

### 10.4 Lazy Loading Strategy

For features with heavy dependencies, the recommended pattern:

```
User invokes feature (e.g., opens picker)
  --> Check if dependency is loaded
  --> If not: show brief "Loading..." indicator, async-load dependency
  --> Cache loaded dependency for session
  --> Execute feature
```

This ensures zero startup cost for features the user does not use, while keeping subsequent invocations instant.

---

## 11. References

### Neovim Plugins

| Plugin                                                    | Stars | URL                                                           |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| telescope.nvim                                            | ~16k  | https://github.com/nvim-telescope/telescope.nvim              |
| harpoon                                                   | ~9.1k | https://github.com/ThePrimeagen/harpoon                       |
| snacks.nvim                                               | ~8k   | https://github.com/folke/snacks.nvim                          |
| oil.nvim                                                  | ~7k   | https://github.com/stevearc/oil.nvim                          |
| nvim-tree.lua                                             | ~7k   | https://github.com/nvim-tree/nvim-tree.lua                    |
| noice.nvim                                                | ~5.8k | https://github.com/folke/noice.nvim                           |
| flash.nvim                                                | ~5.3k | https://github.com/folke/flash.nvim                           |
| neo-tree.nvim                                             | ~5k   | https://github.com/nvim-neo-tree/neo-tree.nvim                |
| leap.nvim                                                 | ~5k   | https://github.com/ggandor/leap.nvim                          |
| Comment.nvim                                              | ~4.7k | https://github.com/numToStr/Comment.nvim                      |
| undotree                                                  | ~4.5k | https://github.com/mbbill/undotree                            |
| fzf-lua                                                   | ~4.2k | https://github.com/ibhagwan/fzf-lua                           |
| nvim-autopairs                                            | ~4.1k | https://github.com/windwp/nvim-autopairs                      |
| LuaSnip                                                   | ~4k   | https://github.com/L3MON4D3/LuaSnip                           |
| hop.nvim                                                  | ~3.3k | https://github.com/smoka7/hop.nvim                            |
| nvim-ufo                                                  | ~3k   | https://github.com/kevinhwang91/nvim-ufo                      |
| telescope-file-browser.nvim                               | ~2k   | https://github.com/nvim-telescope/telescope-file-browser.nvim |
| yazi.nvim                                                 | ~2k   | https://github.com/mikavilpas/yazi.nvim                       |
| yanky.nvim                                                | ~1.5k | https://github.com/gbprod/yanky.nvim                          |
| smart-splits.nvim                                         | ~1.5k | https://github.com/mrjones2014/smart-splits.nvim              |
| marks.nvim                                                | ~1.2k | https://github.com/chentoast/marks.nvim                       |
| dial.nvim                                                 | ~1.1k | https://github.com/monaqa/dial.nvim                           |
| persistence.nvim                                          | ~1k   | https://github.com/folke/persistence.nvim                     |
| mini.nvim (mini.pick, mini.files, mini.ai, mini.snippets) | N/A   | https://github.com/echasnovski/mini.nvim                      |
| friendly-snippets                                         | N/A   | https://github.com/rafamadriz/friendly-snippets               |
| pretty-fold.nvim                                          | N/A   | https://github.com/anuvyklack/pretty-fold.nvim                |
| fold-preview.nvim                                         | N/A   | https://github.com/anuvyklack/fold-preview.nvim               |
| nvim-origami                                              | N/A   | https://github.com/chrisgrieser/nvim-origami                  |
| vim-dirvish                                               | N/A   | https://github.com/justinmk/vim-dirvish                       |
| vim-vinegar                                               | N/A   | https://github.com/tpope/vim-vinegar                          |
| nvim-spider                                               | ~893  | https://github.com/chrisgrieser/nvim-spider                   |
| nvim-various-textobjs                                     | ~771  | https://github.com/chrisgrieser/nvim-various-textobjs         |
| treesj                                                    | N/A   | https://github.com/Wansmer/treesj                             |
| targets.vim                                               | ~2.6k | https://github.com/wellle/targets.vim                         |

### WASM and JS Libraries

| Library             | NPM Package           | URL                                             |
| ------------------- | --------------------- | ----------------------------------------------- |
| nucleo-matcher-wasm | `nucleo-matcher-wasm` | https://github.com/idleberg/nucleo-matcher-wasm |
| ripgrep WASM        | `ripgrep`             | https://github.com/jonathanpv/ripgrep           |
| uFuzzy              | `@leeoniya/ufuzzy`    | https://github.com/leeoniya/uFuzzy              |
| fuzzysort           | `fuzzysort`           | https://github.com/farzher/fuzzysort            |
| fuse.js             | `fuse.js`             | https://github.com/krisk/Fuse                   |
| rapid-fuzzy         | `rapid-fuzzy`         | https://github.com/derodero24/rapid-fuzzy       |
| FlashFuzzy          | `flash-fuzzy`         | https://github.com/RafaCalRob/FlashFuzzy        |
| fuzzr               | `fuzzr`               | https://github.com/repomaa/fuzzr                |

### CodeMirror 6 Packages

| Package                       | Purpose                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `@codemirror/autocomplete`    | Snippet engine (`snippet()`, `snippetCompletion()`, `ActiveSnippet`)   |
| `@codemirror/language`        | Folding API (`foldService`, `foldNodeProp`, `foldCode`, `codeFolding`) |
| `@codemirror/lang-markdown`   | Markdown-specific folding (`headerIndent`, block fold props)           |
| `@lezer/markdown`             | Markdown parser producing the syntax tree                              |
| `codemirror-6-snippetbuilder` | VS Code JSON to CM6 snippet converter                                  |

### Obsidian Community Plugins (Overlap Analysis)

| Plugin                 | Author                  | Downloads | URL                                              |
| ---------------------- | ----------------------- | --------- | ------------------------------------------------ |
| obsidian-vimrc-support | esm7                    | ~147k     | https://github.com/esm7/obsidian-vimrc-support   |
| Omnisearch             | Simon Cambier           | ~1.5M     | https://github.com/scambier/obsidian-omnisearch  |
| Templater              | SilentVoid13 / zachatoo | ~4.7M     | https://github.com/SilentVoid13/Templater        |
| Quick Switcher++       | darlal                  | N/A       | https://github.com/darlal/obsidian-switcher-plus |
| Creases                | liamcain                | N/A       | https://github.com/liamcain/obsidian-creases     |
| Snipsy                 | Dimagious               | N/A       | https://github.com/Dimagious/snipsy              |
| Obsidian Harpoon       | maskdotdev              | N/A       | https://github.com/maskdotdev/obsidian-harpoon   |

### Obsidian API References

| API                                                       | Purpose                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `app.vault.getFiles()`                                    | List all vault files                                   |
| `app.vault.getMarkdownFiles()`                            | List markdown files only                               |
| `app.vault.create()` / `delete()` / `rename()` / `read()` | File operations                                        |
| `app.metadataCache.getCache(path)`                        | File metadata (headings, links, tags)                  |
| `app.metadataCache.getBacklinks()`                        | Backlink data                                          |
| `app.metadataCache.getTags()`                             | Tag data                                               |
| `app.commands.listCommands()`                             | All registered commands                                |
| `app.workspace.getLeavesOfType()`                         | Open buffers/panes                                     |
| `prepareFuzzySearch()`                                    | Obsidian's built-in fuzzy search utility               |
| `SuggestModal`                                            | Modal with fuzzy suggestions (used in vault-search.ts) |
