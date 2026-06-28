# Vim Motions

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, and a built-in `.obsidian.vimrc` loader.

## Features

### Markdown text objects

Operate on Markdown structures with standard Vim operators (`d`, `c`, `y`, `v`).

| Keybinding          | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `i*` / `a*`         | Inside/around **bold** (`**...**`) or _italic_ (`*...*`)             |
| `i_` / `a_`         | Inside/around _italic_ (`_..._`)                                     |
| `` i` `` / `` a` `` | Inside/around `inline code`                                          |
| `i$` / `a$`         | Inside/around math (`$...$` or `$$...$$`), with smart disambiguation |
| `i~` / `a~`         | Inside/around ~~strikethrough~~ (`~~...~~`)                          |
| `i=` / `a=`         | Inside/around ==highlight== (`==...==`)                              |
| `il` / `al`         | Inside/around links (`[[wikilink]]` or `[text](url)`)                |
| `iC` / `aC`         | Inside/around fenced code blocks                                     |
| `iB` / `aB`         | Inside/around blockquotes (`>`)                                      |
| `io` / `ao`         | Inside/around callouts (`> [!type]`)                                 |
| `it` / `at`         | Inside/around HTML/XML tags                                          |
| `i\|` / `a\|`       | Inside/around table cell (between `\|` pipes)                        |

All delimiter-based text objects work across multiple lines (configurable scan range, default: 20 lines in each direction). Delimiters inside fenced code blocks are excluded from the scan.

### Structural navigation

Jump between document structures. Works with counts (e.g., `3]h` jumps 3 headings) and operators (e.g., `d]h` deletes to the next heading).

| Keybinding            | Description                                 |
| --------------------- | ------------------------------------------- |
| `]h` / `[h`           | Next/previous heading (any level)           |
| `]1`–`]6` / `[1`–`[6` | Next/previous heading of specific level     |
| `]l` / `[l`           | Next/previous list item (same indent level) |
| `]n` / `[n`           | Next/previous link                          |
| `]b` / `[b`           | Next/previous open buffer (tab)             |

### Hard-wrap operators (`gq` / `gw`)

Reformat paragraphs with Markdown-aware line wrapping — something Obsidian's built-in Vim mode does not support.

| Keybinding         | Description                                     |
| ------------------ | ----------------------------------------------- |
| `gqq` / `gwq`      | Reformat current line at textwidth (default 80) |
| `gqj` / `gwj`      | Reformat current and next line                  |
| `gqip` / `gwip`    | Reformat paragraph                              |
| Visual `gq` / `gw` | Reformat selected lines                         |

`gq` moves the cursor to the start of the formatted range. `gw` keeps the cursor at its original position. Both use the same wrapping engine.

The default wrap width is 80 columns. You can change it at runtime via Obsidian's developer console: `CodeMirrorAdapter.Vim.setOption('textwidth', 100)`. Note: `set textwidth=N` in `.obsidian.vimrc` is parsed but does not currently propagate to the `gq`/`gw` operators due to a [known limitation](KNOWN_LIMITATIONS.md#set-textwidth-via-vimrc-does-not-affect-gq).

Behavior:

- Splits lines exceeding the textwidth at word boundaries.
- Preserves Markdown structural prefixes on continuation lines:
    - **Blockquotes** (`>`) — wrapped lines keep the `> ` prefix.
    - **Bullet lists** (`- `, `* `, `+ `) — wrapped lines are indented to align with the text.
    - **Numbered lists** (`1. `) — same alignment behavior.
    - **Nested structures** (`> - text`) — both prefixes are preserved.
- Merges short lines with matching prefixes back into the preceding line when they fit within the textwidth, producing a proper paragraph-reflow effect.
- Blank lines act as paragraph separators — wrapping stops and resumes at each paragraph.

### Table navigation

Navigate Markdown table cells without leaving Vim mode. In Live Preview, the plugin renders tables as themed HTML when the cursor is outside and switches to raw Markdown when editing — all vim motions work naturally on table content. Configurable via **Settings → Vim Motions → Table widget in live preview** (cursor-aware / always raw / off).

| Keybinding    | Description                         |
| ------------- | ----------------------------------- |
| `]\|` or `]c` | Move to the next table cell         |
| `[\|` or `[c` | Move to the previous table cell     |
| `]r`          | Move to same column in next row     |
| `[r`          | Move to same column in previous row |

Wraps to the next/previous row when reaching the end/start of a row. Skips separator rows (`|---|---|`).

> **Note:** On keyboard layouts where `|` requires AltGr or a modifier key (e.g. German, Dutch, Nordic), the `]\|`/`[\|` bindings may not work. Use `]c`/`[c` instead — they do the same thing and work on all keyboard layouts.

**Table text objects:**

| Keybinding | Description                                    |
| ---------- | ---------------------------------------------- |
| `i\|`      | Inside table cell (content between pipes)      |
| `a\|`      | Around table cell (content plus trailing pipe) |

Works with all operators: `di|` deletes cell content, `ci|` changes it, `yi|` yanks it, `vi|` selects it.

**Table manipulation** (via `<Leader>t` prefix):

| Keybinding    | Description             |
| ------------- | ----------------------- |
| `<Leader>tm`  | Insert table            |
| `<Leader>to`  | Add row below           |
| `<Leader>tO`  | Add row above           |
| `<Leader>tJ`  | Move row down           |
| `<Leader>tK`  | Move row up             |
| `<Leader>tdd` | Delete row              |
| `<Leader>tiL` | Add column to the right |
| `<Leader>tiH` | Add column to the left  |
| `<Leader>tL`  | Move column right       |
| `<Leader>tH`  | Move column left        |
| `<Leader>tdc` | Delete column           |
| `<Leader>tr`  | Realign table columns   |

**Table auto-formatting:**

- Typing `|` in insert mode on a table line automatically realigns all columns.
- Typing `||` on a new line within a table generates a separator row (`|---|---|`).

Table manipulation commands are also available as ex commands (e.g. `:tablerowafter`, `:tablecoldelete`, `:tablealignleft`, `:tablerealign`). See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md#table-widget-suppression-in-live-preview) for details on table widget suppression.

### Workspace keyboard control

Navigate Obsidian without a mouse, following Neovim window management conventions.

| Keybinding          | Description                                         |
| ------------------- | --------------------------------------------------- |
| `<C-w>h/j/k/l`      | Focus pane left/down/up/right                       |
| `<C-w>v`            | Split vertical                                      |
| `<C-w>s`            | Split horizontal                                    |
| `<C-w>c` / `<C-w>q` | Close current tab                                   |
| `<C-w>o`            | Close all other tabs                                |
| `gt` / `gT`         | Next/previous tab                                   |
| `g<C-t>`            | Go to tab by number (e.g., `3g<C-t>` goes to tab 3) |
| `gd`                | Go to definition — open the link under the cursor   |
| `gD`                | Open link under cursor in a new tab                 |
| `<C-w>gd`           | Open link under cursor in a horizontal split        |
| `<C-w>gD`           | Open link under cursor in a vertical split          |
| `gx`                | Open URL under cursor in browser                    |
| `gf`                | Open file switcher (quick open)                     |
| `grn`               | Rename current note                                 |
| `grr`               | Show backlinks to current note                      |
| `gra`               | Show context-aware actions for cursor position      |
| `gO`                | Open document outline (searchable heading list)     |
| `g<C-g>`            | Show document statistics (words, lines, characters) |
| `gp` / `gP`         | Paste and move cursor past pasted text              |
| `ga`                | Show character info under cursor (codepoint, hex)   |
| `g;` / `g,`         | Jump to older/newer change position                 |
| `za`                | Toggle fold at cursor                               |
| `zc` / `zo`         | Fold / unfold at cursor                             |
| `zO` / `zC` / `zA`  | Recursive fold open/close/toggle                    |
| `zM` / `zR`         | Fold all / unfold all                               |

> **Note:** The `<C-w>` prefix may conflict with Obsidian's default "Close current tab" hotkey. To use `<C-w>` bindings, go to **Settings → Hotkeys**, search for "Close current tab", and remove or rebind the Ctrl+W hotkey. The close-tab functionality remains available via `:q` or `:quit`.

### Surround (vim-surround)

Add, change, or delete surrounding delimiters — brackets, quotes, tags, and more.

| Keybinding                | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `ds{target}`              | Delete surrounding (`ds"` on `"hello"` → `hello`)        |
| `dst`                     | Delete surrounding tag                                   |
| `cs{target}{replacement}` | Change surrounding (`cs"'` → `'hello'`)                  |
| `cst{replacement}`        | Change surrounding tag                                   |
| `ys{motion}{replacement}` | Add surround (`ysiw)` on `hello` → `(hello)`)            |
| `ys{motion}<tag>`         | Surround with HTML tag (`ysiw<em>` → `<em>hello</em>`)   |
| `ysiwf` + name + Enter    | Surround with function call (`print(hello)`)             |
| `ysiwF` + name + Enter    | Surround with spaced function call (`print( hello )`)    |
| `yss{replacement}`        | Surround entire line (`yss"` → `"line content"`)         |
| `cS` / `yS` / `ySS`       | Newline surround variants (delimiters on separate lines) |
| `S{replacement}`          | Surround visual selection (visual mode)                  |
| `S<tag>`                  | Surround selection with tag (visual mode)                |
| `gS`                      | Newline surround selection (visual mode)                 |
| `2ds)`, `2cs)`            | Count: delete/change 2nd-level surrounding bracket       |
| `2ysiw*`                  | Count: repeat delimiter (`**hello**` for Markdown bold)  |
| `2ds*`                    | Count: delete repeated delimiter (unbold `**hello**`)    |
| `<C-G>s{char}`            | Insert mode: type inside delimiters, close on Esc        |

**Targets**: `"`, `'`, `` ` ``, `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`, `t` (tag), `b`→`)`, `B`→`}`, `r`→`]`, `a`→`>`

Opening brackets `(`, `[`, `{` add inner spaces. Closing brackets `)`, `]`, `}`, `>` don't. `<` in replacement position triggers tag prompting (use `>` for angle brackets). `f`/`F` in replacement position triggers function wrapping. Count-prefix repeats the delimiter character for quotes (`2ysiw*` → `**word**`, `2ysiw~` → `~~word~~`, `2ysiw=` → `==word==`). All surround commands support dot-repeat (`.`). Requires bundled fork mode.

### Ex commands

| Command                                                      | Description                                    |
| ------------------------------------------------------------ | ---------------------------------------------- |
| `:ob {command-id}`                                           | Execute any Obsidian command by ID             |
| `:ob`                                                        | List all available command IDs                 |
| `:sidebar left` / `:sidebar right`                           | Toggle left/right sidebar                      |
| `:explorer`                                                  | Reveal active file in file explorer            |
| `:w` / `:write`                                              | Save current file                              |
| `:update` / `:up`                                            | Save current file (alias for `:w`)             |
| `:q` / `:quit`                                               | Close current tab                              |
| `:wq`                                                        | Save and close                                 |
| `:x` / `:xit`                                                | Write if modified and close                    |
| `:xa` / `:xall`                                              | Write if modified all and close all            |
| `:e {file}` / `:edit {file}`                                 | Open file by name in vault                     |
| `:e!` / `:edit!`                                             | Revert current file to saved version           |
| `:enew`                                                      | Create new untitled note                       |
| `:saveas {file}`                                             | Save current buffer as new file                |
| `:find {file}` / `:fin`                                      | Find and open file by partial name match       |
| `:read {file}` / `:r`                                        | Insert file contents at cursor position        |
| `:bn` / `:bp`                                                | Next / previous tab                            |
| `:b {name}` / `:buffer {name}`                               | Switch to tab matching name                    |
| `:bf` / `:bfirst`                                            | Go to first tab                                |
| `:bl` / `:blast`                                             | Go to last tab                                 |
| `:bd` / `:bc`                                                | Close current tab                              |
| `:bw` / `:bwipeout`                                          | Close current tab                              |
| `:only`                                                      | Close all other tabs                           |
| `:qa`                                                        | Close all tabs                                 |
| `:sp` / `:split`                                             | Horizontal split                               |
| `:vs` / `:vsplit`                                            | Vertical split                                 |
| `:new`                                                       | Horizontal split with new note                 |
| `:vnew`                                                      | Vertical split with new note                   |
| `:tabnew` / `:tabedit`                                       | Open new tab (optionally with file)            |
| `:tabclose` / `:tabc`                                        | Close current tab                              |
| `:tabonly` / `:tabo`                                         | Close all other tabs                           |
| `:tabfirst` / `:tabrewind`                                   | Go to first tab                                |
| `:tablast` / `:tabl`                                         | Go to last tab                                 |
| `:buffers` / `:ls`                                           | Show all open buffers in a modal               |
| `:backlinks`                                                 | Show backlinks to the current note in a modal  |
| `:grep {pattern}`                                            | Search vault for text, show results in a modal |
| `:wa` / `:wall`                                              | Save all open files                            |
| `:back` / `:forward`                                         | Navigate back / forward in history             |
| `:reg` / `:registers`                                        | Show register contents in a modal              |
| `:marks`                                                     | Show marks and their positions in a modal      |
| `:delmarks {marks}`                                          | Delete specified marks                         |
| `:changes`                                                   | Show change list in modal                      |
| `:version` / `:ve`                                           | Show plugin version                            |
| `:tableinsert`                                               | Insert table                                   |
| `:tablerowafter` / `:tablerowbefore`                         | Add row below / above                          |
| `:tablerowup` / `:tablerowdown`                              | Move row up / down                             |
| `:tablerowdelete`                                            | Delete row                                     |
| `:tablecolafter` / `:tablecolbefore`                         | Add column right / left                        |
| `:tablecolleft` / `:tablecolright`                           | Move column left / right                       |
| `:tablecoldelete`                                            | Delete column                                  |
| `:tablealignleft` / `:tablealigncenter` / `:tablealignright` | Set column alignment                           |
| `:tablerealign`                                              | Realign table columns to uniform widths        |

### EasyMotion / Hop

Jump to any visible position with two keystrokes.

**Find motions:**
| Keybinding | Description |
| --- | --- |
| `<leader><leader>f{char}` | Find `{char}` forward |
| `<leader><leader>F{char}` | Find `{char}` backward |
| `<leader><leader>s{char}` | Find `{char}` in both directions |
| `<leader><leader>t{char}` | Till before `{char}` forward |
| `<leader><leader>T{char}` | Till after `{char}` backward |

**Word motions:**
| Keybinding | Description |
| --- | --- |
| `<leader><leader>w` | Word start forward |
| `<leader><leader>b` | Word start backward |
| `<leader><leader>e` | End of word forward |
| `<leader><leader>ge` | End of word backward |
| `<leader><leader>W` | WORD start forward |
| `<leader><leader>B` | WORD start backward |
| `<leader><leader>E` | End of WORD forward |
| `<leader><leader>gE` | End of WORD backward |

**Line motions:**
| Keybinding | Description |
| --- | --- |
| `<leader><leader>j` | Line down |
| `<leader><leader>k` | Line up |

**Search motions:**
| Keybinding | Description |
| --- | --- |
| `<leader><leader>n` | Next search match forward |
| `<leader><leader>N` | Next search match backward |

All easymotion motions work in visual mode — `v` + easymotion extends the character selection, `V` + easymotion extends the line selection. Operator-pending mode (`d` + easymotion, `c` + easymotion, `y` + easymotion) works natively via the fork's async motion support.

**Live Preview aware**: in Live Preview mode, hidden markdown syntax (e.g., the URL in `[text](url)`, collapsed formatting marks) is excluded from target scanning — labels only appear on visible text. When targets are close together, labels stack vertically instead of overlapping.

All easymotion actions can be remapped in `.obsidian.vimrc`. Bidirectional variants (`easyMotionBdWord`, `easyMotionBdFind`, etc.) and repeat (`easyMotionRepeat`) are also available as named actions.

### Hint mode (Vimium-style navigation)

Navigate the entire Obsidian interface without a mouse. Press `<leader><leader>h` (or a configurable global hotkey) to label every clickable element on screen — buttons, tabs, sidebar items, settings controls, editor panes, links — then type the label to activate it.

- **Works everywhere**: editor, sidebar, tab bar, settings modal, modals, popout windows
- **Smart labels**: single-character labels when few targets, two-character (home-row first) when many
- **Keyboard recovery**: Backspace resets after a wrong first character, Escape cancels
- **Pane navigation**: select an editor pane label to focus it (uses `setActiveLeaf` for proper Obsidian focus)
- **Modifier support**: hold Ctrl/Cmd while selecting a link to open in a new pane
- **Internal links**: `[[wikilinks]]` and `[markdown](links)` are opened via Obsidian's link resolver, not raw click
- **Scroll-aware**: only visible elements are labeled — items scrolled out of view in containers are excluded
- **Global hotkey**: configure a key combination in **Settings → Vim Motions → Hint mode global hotkey** that works even when modals (settings, command palette) have focus
- **Registered as Obsidian command**: `vim-motions:show-hint-labels` — assign a hotkey in **Settings → Hotkeys** or trigger from the command palette

### Quality of life

- **Neovim defaults** — `Y` yanks to end of line (`y$`) and `Q` replays last recorded macro (`@@`), matching Neovim's defaults instead of CM Vim's legacy behavior.
- **Vim mode status bar** — shows NORMAL / INSERT / VISUAL / REPLACE in the status bar. Customizable per-mode text (including emoji) via settings.
- **Vim chord display** — shows pending keystrokes (e.g. `2d`, `gq`) in the status bar as you type a multi-key command.
- **Powerline-style status bar** — optional colored mode indicator with per-mode background colors and a triangular separator. No special fonts required. Override colors via CSS custom properties (`--vim-pl-normal-bg`, etc.).
- **Which-key hints** — shows available key continuations in a popup after a short delay. Configurable: off, leader key only, or all partial keys. In "all" mode, pressing `d` shows available motions/text objects, `g` shows g-prefixed commands, etc. Leader bindings can be grouped by prefix (like Neovim's which-key plugin) — pressing `<leader>` shows `t` → `Table (+11)` instead of listing all table commands. Drill into a group by pressing its key. Grouping mode (grouped/flat) and custom group labels are configurable in settings.
- **Ex command completion** — Tab-complete ex commands as you type in the `:` command line.
- **Macro recording indicator** — shows RECORDING @{register} in the status bar when recording a macro.
- **Scrolloff** — configurable number of lines to keep visible above/below the cursor. Adapts to your font size automatically.
- **Configurable insert escape** — set `jk`, `jj`, or any two-key sequence to exit insert mode via `set insertmodeescape=jk` in your vimrc.
- **Settings hot-reload** — toggle features on and off without restarting Obsidian.
- **Built-in `.obsidian.vimrc`** — load key mappings and settings without needing obsidian-vimrc-support.

## Vimrc support

Vim Motions has built-in support for `.obsidian.vimrc` files, compatible with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) syntax. Place a `.obsidian.vimrc` file in your vault root:

```vim
" Example .obsidian.vimrc
let mapleader = " "

" Key mappings
nnoremap j gj
nnoremap k gk
nmap Y y$

" Leader key mappings
exmap saveFile obcommand editor:save-file
nmap <leader>w :saveFile

" Execute Obsidian commands
nmap <C-s> :saveFile

" Settings
set clipboard=unnamed
set tabstop=4
set textwidth=80
set shiftwidth=2
set expandtab
set insertmodeescape=jk
```

Supported commands: `map`, `nmap`, `imap`, `vmap`, `noremap`, `nnoremap`, `inoremap`, `vnoremap`, `unmap`, `nunmap`, `iunmap`, `vunmap`, `set`, `let mapleader`, `exmap`, `obcommand`, `source`.

Supported `set` options: `clipboard` (`unnamed`/`unnamedplus` — syncs yank/delete/paste with system clipboard), `tabstop`/`ts`, `textwidth`/`tw`, `shiftwidth`/`sw`, `expandtab`/`et`, `insertmodeescape`/`ime`. Use `set noexpandtab` to disable boolean options.

If obsidian-vimrc-support is also installed, Vim Motions skips its own `:ob` command registration to avoid conflicts.

## Settings

All features can be toggled independently in **Settings → Vim Motions**. Changes take effect immediately without restarting.

- Text objects (on/off)
- Structural navigation (on/off)
- Hard-wrap operators `gq`/`gw` (on/off)
- Table navigation (on/off)
- Workspace navigation (on/off)
- Load `.obsidian.vimrc` (on/off)
- Vim mode status bar (on/off)
- Vim chord display (on/off, default: on)
- Powerline-style status bar (on/off, default: off)
- Vim mode display prompt — customizable text per mode (normal, insert, visual, replace)
- EasyMotion (on/off)
- EasyMotion dimming (on/off, default: on)
- Label font size (10–20px, default: 14) — shared by EasyMotion and hint mode
- Label colors (via CSS: `--vim-motions-em-bg`/`em-fg` for EasyMotion, `--vim-motions-hint-bg`/`hint-fg` for hint mode)
- Hint mode (on/off)
- Hint mode label characters (customizable)
- Hint mode global hotkey (press-to-record, works in modals)
- Scrolloff lines (0–20, default: 5)
- Multi-line text object scan range (5–200, default: 20)
- EasyMotion label characters (customizable)
- Which-key hints (off / leader key only / all partial keys, default: off)
- Which-key leader grouping (grouped / flat, default: grouped) — collapse bindings by prefix with drill-down
- Which-key group labels — name groups by prefix key (e.g. `\t` → Table); supports `<leader>` expansion
- Leader key bindings (add/remove key-to-command mappings without editing vimrc)

## Installation

### From community directory

Search for "Vim Motions" in **Settings → Community plugins → Browse**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/saberzero1/motions/releases).
2. Create a folder `vim-motions` in `<your-vault>/.obsidian/plugins/`.
3. Copy the downloaded files into that folder.
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**.

## Requirements

- Obsidian v1.1.1 or later
- Desktop only (mobile support planned for a future release)

### Recommended setup

**Disable** Obsidian's built-in Vim mode (**Settings → Editor → Vim key bindings → off**). When built-in vim is off, Vim Motions provides its own enhanced vim engine (a [fork of codemirror-vim](https://github.com/saberzero1/codemirror-vim)) with:

- **Neovim-correct behavior** for `dd` cursor positioning, `J` join whitespace, `di{` multiline brackets, `dj`/`dk` at document boundaries, `:s` cursor, `%` string-awareness, `db`/`d2w` cross-line whitespace, and more
- **Async motion support** enabling native operator-pending easymotion (`d` + easymotion, `c` + easymotion, `y` + easymotion)
- **Improved vim state reliability** — default keymaps are protected from accidental removal, partial key prefixes reset on focus loss, and async motion races are guarded by generation tracking
- **Theme-aligned cursor styling** using Obsidian's CSS variables (`--interactive-accent`)

The plugin also works with built-in vim mode enabled — it extends whatever vim engine is active. But the fork provides a more accurate Vim experience.

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# E2E tests (requires nix develop on NixOS, or system libraries for Electron)
npm run test:e2e

# Coverage report (command-level test status)
npm run test:coverage
```

### Testing strategy

The plugin uses a Neovim-backed golden comparison system inspired by [Zed editor's Vim test architecture](https://github.com/zed-industries/zed/blob/main/crates/vim/src/test/neovim_backed_test_context.rs). Every Tier 1 Vim command (motions, operators, text objects, insert mode, visual mode) is tested against a real headless Neovim instance to verify behavioral parity.

**How it works:**

1. A headless Neovim is spawned via `nvim --embed --headless` and connected over msgpack-RPC.
2. The same keystrokes are sent to both Obsidian (via WebDriverIO) and Neovim.
3. The resulting editor state (content, cursor position, mode) is compared.
4. Expected Neovim output is pre-recorded as golden JSON files — CI compares against these without needing Neovim installed.

**Test types:**

- **`[nvim]` tests** — Neovim-compared via golden files. No hand-written expected values; Neovim's output is the spec.
- **`[obsidian]` tests** — viewport-dependent behavior (H/M/L, scroll, folds) that headless Neovim cannot verify.
- **Tier 2 tests** — plugin-specific features (Markdown text objects, structural navigation, workspace commands) with hand-written assertions.

**Available commands:**

```bash
# Run Neovim smoke test (verify client works)
npm run test:neovim-smoke

# Record golden files from Neovim (requires nvim binary)
npm run test:neovim-record

# Run tests with live Neovim comparison (requires nvim binary)
npm run test:neovim-compare
```

Intentional behavioral deviations from Neovim are documented in `test/neovim/deviations.ts` and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The deviation registry serves as the roadmap toward full Neovim parity — when it's empty (minus intentional overrides like `Y`→`y$`), the goal is achieved.

## License

[MIT](LICENSE) — Emile Bangma
