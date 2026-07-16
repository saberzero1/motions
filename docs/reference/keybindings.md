---
title: Keybinding reference
description: Complete keybinding cheat sheet for all Vim Motions commands, motions, text objects, and operators.
tags:
    - reference
    - keybindings
    - cheat-sheet
---

## Markdown text objects

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
| `ir` / `ar`         | Inside/around table row (raw markdown only)                          |
| `i\|` / `a\|`       | Inside/around table cell (between `\|` pipes)                        |

## Structural navigation

Jump between document structures. Works with counts (e.g., `3]h` jumps 3 headings) and operators (e.g., `d]h` deletes to the next heading).

| Keybinding            | Description                                 |
| --------------------- | ------------------------------------------- |
| `]h` / `[h`           | Next/previous heading (any level)           |
| `]1`–`]6` / `[1`–`[6` | Next/previous heading of specific level     |
| `]l` / `[l`           | Next/previous list item (same indent level) |
| `]n` / `[n`           | Next/previous link                          |
| `]b` / `[b`           | Next/previous open buffer (tab)             |

## Table navigation

Navigate Markdown table cells without leaving Vim mode.

| Keybinding    | Description                         |
| ------------- | ----------------------------------- |
| `]\|` or `]c` | Move to the next table cell         |
| `[\|` or `[c` | Move to the previous table cell     |
| `]r`          | Move to same column in next row     |
| `[r`          | Move to same column in previous row |

## Table text objects

Operate on table cells with standard Vim operators.

| Keybinding | Description                                    |
| ---------- | ---------------------------------------------- |
| `i\|`      | Inside table cell (content between pipes)      |
| `a\|`      | Around table cell (content plus trailing pipe) |

## Table manipulation

Manage table structure using the `<leader>t` prefix.

| Keybinding    | Description             |
| ------------- | ----------------------- |
| `<leader>tm`  | Insert table            |
| `<leader>to`  | Add row below           |
| `<leader>tO`  | Add row above           |
| `<leader>tJ`  | Move row down           |
| `<leader>tK`  | Move row up             |
| `<leader>tdd` | Delete row              |
| `<leader>tiL` | Add column to the right |
| `<leader>tiH` | Add column to the left  |
| `<leader>tL`  | Move column right       |
| `<leader>tH`  | Move column left        |
| `<leader>tdc` | Delete column           |
| `<leader>tr`  | Realign table columns   |

## Embedded table navigation

Available when the table widget is set to "Embedded" and the cursor enters a table. These keybindings are active in the table navigation layer (before entering a cell).

| Keybinding                      | Description                            |
| ------------------------------- | -------------------------------------- |
| `h` / `l`                       | Move cell highlight left / right       |
| `j` / `k`                       | Move cell highlight down / up          |
| `i` / `a` / `c` / `s` / `Enter` | Enter cell editing                     |
| `Escape`                        | Exit table                             |
| `o` / `O`                       | Add row below / above                  |
| `dd`                            | Delete row                             |
| `dc`                            | Delete column                          |
| `J` / `K`                       | Move row down / up                     |
| `H` / `L`                       | Move column left / right               |
| `I` / `A`                       | Add column left / right                |
| `=`                             | Realign table                          |
| `Tab` / `Shift-Tab`             | Next / previous cell (in cell editing) |

## Picker shortcuts

Open picker sources with the `<leader>f` prefix.

| Keybinding   | Description              |
| ------------ | ------------------------ |
| `<leader>ff` | Find files               |
| `<leader>fg` | Live grep (vault search) |
| `<leader>fb` | Switch buffers           |
| `<leader>fh` | Search headings          |
| `<leader>fo` | Document outline         |
| `<leader>fk` | Backlinks                |
| `<leader>ft` | Search tags              |
| `<leader>fr` | Recent files             |
| `<leader>fm` | Jump to mark             |
| `<leader>fR` | Registers                |
| `<leader>fp` | Resume last picker       |

## Harpoon

Pin files to numbered slots for instant switching. See [[harpoon]] for details.

| Keybinding              | Description         |
| ----------------------- | ------------------- |
| `<leader>ha`            | Pin current file    |
| `<leader>hr`            | Remove current file |
| `<leader>ht`            | Toggle pin          |
| `<leader>hp`            | Open harpoon picker |
| `<leader>1`–`<leader>9` | Jump to slot 1–9    |
| `<leader>hn`            | Next pin            |
| `<leader>hN`            | Previous pin        |

### Keyboard shortcuts inside picker

| Key                  | Action                   |
| -------------------- | ------------------------ |
| `<C-n>` / `<C-p>`    | Navigate down/up         |
| `<C-j>` / `<C-k>`    | Navigate down/up         |
| `<Up>` / `<Down>`    | Navigate down/up         |
| `<Enter>`            | Select item              |
| `<Escape>` / `<C-c>` | Close picker             |
| `<C-x>`              | Open in horizontal split |
| `<C-v>`              | Open in vertical split   |
| `<C-t>`              | Open in new tab          |
| `<C-d>` / `<C-u>`    | Scroll preview down/up   |

## Hard-wrap operators

Reformat paragraphs with Markdown-aware line wrapping.

| Keybinding         | Description                                     |
| ------------------ | ----------------------------------------------- |
| `gqq` / `gwq`      | Reformat current line at textwidth (default 80) |
| `gqj` / `gwj`      | Reformat current and next line                  |
| `gqip` / `gwip`    | Reformat paragraph                              |
| Visual `gq` / `gw` | Reformat selected lines                         |

## EasyMotion find motions

Jump to specific characters forward, backward, or in both directions.

| Keybinding                | Description                      |
| ------------------------- | -------------------------------- |
| `<leader><leader>f{char}` | Find `{char}` forward            |
| `<leader><leader>F{char}` | Find `{char}` backward           |
| `<leader><leader>s{char}` | Find `{char}` in both directions |
| `<leader><leader>t{char}` | Till before `{char}` forward     |
| `<leader><leader>T{char}` | Till after `{char}` backward     |

## EasyMotion word motions

Jump to word starts or ends across the visible editor.

| Keybinding           | Description          |
| -------------------- | -------------------- |
| `<leader><leader>w`  | Word start forward   |
| `<leader><leader>b`  | Word start backward  |
| `<leader><leader>e`  | End of word forward  |
| `<leader><leader>ge` | End of word backward |
| `<leader><leader>W`  | WORD start forward   |
| `<leader><leader>B`  | WORD start backward  |
| `<leader><leader>E`  | End of WORD forward  |
| `<leader><leader>gE` | End of WORD backward |

## EasyMotion line motions

Jump directly to lines above or below the cursor.

| Keybinding          | Description |
| ------------------- | ----------- |
| `<leader><leader>j` | Line down   |
| `<leader><leader>k` | Line up     |

## EasyMotion search motions

Jump to search matches forward or backward.

| Keybinding          | Description                |
| ------------------- | -------------------------- |
| `<leader><leader>n` | Next search match forward  |
| `<leader><leader>N` | Next search match backward |

## Surround

Add, change, or delete surrounding delimiters like brackets, quotes, and tags.

| Keybinding                | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `ds{target}`              | Delete surrounding (`ds"` on `"hello"` → `hello`)           |
| `dst`                     | Delete surrounding tag                                      |
| `cs{target}{replacement}` | Change surrounding (`cs"'` → `'hello'`)                     |
| `cst{replacement}`        | Change surrounding tag                                      |
| `ys{motion}{replacement}` | Add surround (`ysiw)` on `hello` → `(hello)`)               |
| `ys{motion}<tag>`         | Surround with HTML tag (`ysiw<em>` → `<em>hello</em>`)      |
| `ysiwf` + name + Enter    | Surround with function call (`print(hello)`)                |
| `ysiwF` + name + Enter    | Surround with spaced function call (`print( hello )`)       |
| `dsf`                     | Delete surrounding function call (`print(hello)` → `hello`) |
| `csf` + name + Enter      | Change surrounding function name (`foo(bar)` → `baz(bar)`)  |
| `yss{replacement}`        | Surround entire line (`yss"` → `"line content"`)            |
| `cS` / `yS` / `ySS`       | Newline surround variants (delimiters on separate lines)    |
| `S{replacement}`          | Surround visual selection (visual mode)                     |
| `S<tag>`                  | Surround selection with tag (visual mode)                   |
| `gS`                      | Newline surround selection (visual mode)                    |
| `2ds)`, `2cs)`            | Count: delete/change 2nd-level surrounding bracket          |
| `2ysiw*`                  | Count: repeat delimiter (`**hello**` for Markdown bold)     |
| `2ds*`                    | Count: delete repeated delimiter (unbold `**hello**`)       |
| `<C-G>s{char}`            | Insert mode: type inside delimiters, close on Esc           |

## Workspace navigation

Navigate Obsidian panes, tabs, and history following Neovim conventions.

| Keybinding          | Description                                                   | Global |
| ------------------- | ------------------------------------------------------------- | ------ |
| `<C-w>h/j/k/l`      | Focus pane left/down/up/right                                 | Yes    |
| `<C-w>v`            | Split vertical                                                | Yes    |
| `<C-w>s`            | Split horizontal                                              | Yes    |
| `<C-w>c` / `<C-w>q` | Close current tab                                             | Yes    |
| `<C-w>o`            | Close all other tabs                                          | Yes    |
| `gt` / `gT`         | Next/previous tab                                             | Yes    |
| `Ngt`               | Go to Nth tab (e.g., `3gt` goes to tab 3)                     | Yes    |
| `g<C-t>`            | Go to tab by number (e.g., `3g<C-t>` goes to tab 3)           | —      |
| `H` / `L`           | Previous/next tab (non-editor views only)                     | Yes    |
| `Ctrl-o` / `Ctrl-i` | Jump backward / forward through jump history (supports count) | Yes    |
| `gd`                | Go to definition — open the link under the cursor             | —      |
| `gD`                | Open link under cursor in a new tab                           | —      |
| `<C-w>gd`           | Open link under cursor in a horizontal split                  | —      |
| `<C-w>gD`           | Open link under cursor in a vertical split                    | —      |
| `gx`                | Open URL under cursor in browser                              | —      |
| `gf`                | Open file switcher (quick open)                               | —      |
| `grn`               | Rename current note                                           | —      |
| `grr`               | Show backlinks to current note                                | —      |
| `gra`               | Show context-aware actions for cursor position                | —      |
| `gO`                | Open document outline (searchable heading list)               | —      |
| `g<C-g>`            | Show document statistics (words, lines, characters)           | —      |
| `gp` / `gP`         | Paste and move cursor past pasted text                        | —      |
| `ga`                | Show character info under cursor (codepoint, hex)             | —      |
| `g;` / `g,`         | Jump to older/newer change position                           | —      |
| `za`                | Toggle fold at cursor                                         | —      |
| `zc` / `zo`         | Fold / unfold at cursor                                       | —      |
| `zO` / `zC` / `zA`  | Recursive fold open/close/toggle                              | —      |
| `zM` / `zR`         | Fold all / unfold all                                         | —      |
| `zf{motion}`        | Create fold over motion range                                 | —      |
| `zd` / `zD`         | Delete fold at cursor                                         | —      |
| `zE`                | Eliminate all folds                                           | —      |
| `zm` / `zr`         | Fold more / fold less (by heading level)                      | —      |

## Select mode

| Keybinding | Description                                              |
| ---------- | -------------------------------------------------------- |
| `gh`       | Enter select mode (charwise)                             |
| `gH`       | Enter select mode (linewise)                             |
| `g<C-h>`   | Enter select mode (blockwise)                            |
| `<C-g>`    | Toggle between visual and select mode (in visual/select) |
| `gV`       | Prevent select mode reselection after mapping            |

## Virtual replace mode

| Keybinding | Description                                           |
| ---------- | ----------------------------------------------------- |
| `gR`       | Enter virtual replace mode (replace by screen column) |

## Non-editor view bindings

Navigate and interact with non-editor views like PDFs, graphs, and canvases.

| Keybinding          | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `f`                 | Show hint labels, activate target (click/focus/navigate) |
| `F`                 | Show hint labels, open target in new pane                |
| `yf`                | Show hint labels, yank target URL or text to clipboard   |
| `df`                | Show hint labels, close target tab or pane               |
| `Nf`                | Activate N targets sequentially (e.g., `3f` activates 3) |
| `j` / `k`           | Scroll down/up one line                                  |
| `Nj` / `Nk`         | Scroll N lines (e.g., `5j` scrolls 5 lines down)         |
| `gg`                | Scroll to top                                            |
| `G`                 | Scroll to bottom                                         |
| `Ctrl-d` / `Ctrl-u` | Scroll half page down/up                                 |
| `Ctrl-f` / `Ctrl-b` | Scroll full page down/up                                 |

All non-editor bindings can be customized via `gmap`, `gnoremap`, and `gunmap` in your `.obsidian.vimrc`. Use `:gmap` to list all active global bindings. See [[vimrc#Global key mappings]] for syntax.

## Ex commands

Execute commands via the `:` command line, grouped by function.

### File and buffer

| Command                        | Description                              |
| ------------------------------ | ---------------------------------------- |
| `:w` / `:write`                | Save current file                        |
| `:update` / `:up`              | Save current file (alias for `:w`)       |
| `:q` / `:quit`                 | Close current tab                        |
| `:wq`                          | Save and close                           |
| `:x` / `:xit`                  | Write if modified and close              |
| `:xa` / `:xall`                | Write if modified all and close all      |
| `:e {file}` / `:edit {file}`   | Open file by name in vault               |
| `:e!` / `:edit!`               | Revert current file to saved version     |
| `:enew`                        | Create new untitled note                 |
| `:saveas {file}`               | Save current buffer as new file          |
| `:find {file}` / `:fin`        | Find and open file by partial name match |
| `:read {file}` / `:r`          | Insert file contents at cursor position  |
| `:bn` / `:bp`                  | Next / previous tab                      |
| `:b {name}` / `:buffer {name}` | Switch to tab matching name              |
| `:bf` / `:bfirst`              | Go to first tab                          |
| `:bl` / `:blast`               | Go to last tab                           |
| `:bd` / `:bc`                  | Close current tab                        |
| `:bw` / `:bwipeout`            | Close current tab                        |
| `:only`                        | Close all other tabs                     |
| `:qa`                          | Close all tabs                           |
| `:wa` / `:wall`                | Save all open files                      |

### Window and tab

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `:sp` / `:split`           | Horizontal split                    |
| `:vs` / `:vsplit`          | Vertical split                      |
| `:new`                     | Horizontal split with new note      |
| `:vnew`                    | Vertical split with new note        |
| `:tabnew` / `:tabedit`     | Open new tab (optionally with file) |
| `:tabclose` / `:tabc`      | Close current tab                   |
| `:tabonly` / `:tabo`       | Close all other tabs                |
| `:tabfirst` / `:tabrewind` | Go to first tab                     |
| `:tablast` / `:tabl`       | Go to last tab                      |

### Table

| Command                                                      | Description                             |
| ------------------------------------------------------------ | --------------------------------------- |
| `:tableinsert`                                               | Insert table                            |
| `:tablerowafter` / `:tablerowbefore`                         | Add row below / above                   |
| `:tablerowup` / `:tablerowdown`                              | Move row up / down                      |
| `:tablerowdelete`                                            | Delete row                              |
| `:tablecolafter` / `:tablecolbefore`                         | Add column right / left                 |
| `:tablecolleft` / `:tablecolright`                           | Move column left / right                |
| `:tablecoldelete`                                            | Delete column                           |
| `:tablealignleft` / `:tablealigncenter` / `:tablealignright` | Set column alignment                    |
| `:tablerealign`                                              | Realign table columns to uniform widths |

### Navigation and search

| Command         | Short    | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| `:explorer`     |          | Reveal active file in file explorer          |
| `:files`        |          | Find files by name                           |
| `:buffers`      | `:buf`   | Switch between open buffers                  |
| `:ls`           |          | Alias for `:buffers`                         |
| `:headings`     |          | Search all headings across vault             |
| `:outline`      |          | Jump to heading in current file              |
| `:backlinks`    | `:backl` | Show files linking to current file           |
| `:tags`         |          | Browse vault tags (opens sub-picker)         |
| `:recent`       |          | Recently opened files                        |
| `:marks`        |          | Jump to vim marks (grouped by buffer/global) |
| `:grep {query}` | `:gre`   | Search vault content (pre-computed results)  |
| `:livegrep`     | `:liveg` | Real-time vault content search               |
| `:resume`       | `:res`   | Reopen last picker with same query           |
| `:jumps`        |          | Display the jump list                        |
| `:Picker`       | `:Pick`  | Open meta-picker listing all sources         |
| `:snippets`     |          | Search and insert snippets                   |
| `:snippet name` | `:snip`  | Insert a snippet by name                     |
| `:Picker {src}` |          | Open a named picker source directly          |
| `:back`         |          | Navigate back in history                     |
| `:forward`      |          | Navigate forward in history                  |
| `:changes`      |          | Show change list in modal                    |

### Harpoon

| Command            | Short       | Description                                            |
| ------------------ | ----------- | ------------------------------------------------------ |
| `:HarpoonAdd`      | `:HarpoonA` | Pin current file to next slot                          |
| `:HarpoonRemove`   | `:HarpoonR` | Remove current file (or `:HarpoonRemove N` for slot N) |
| `:Harpoon`         |             | Open harpoon picker                                    |
| `:HarpoonSelect N` | `:HarpoonS` | Jump to pin slot N                                     |
| `:HarpoonNext`     | `:HarpoonN` | Next pin                                               |
| `:HarpoonPrev`     | `:HarpoonP` | Previous pin                                           |

### Input method

| Command     | Short  | Description                          |
| ----------- | ------ | ------------------------------------ |
| `:IMToggle` | `:IMT` | Toggle input method switching on/off |
| `:IMStatus` | `:IMS` | Show current input method identifier |

### Utility

| Command                            | Description                            |
| ---------------------------------- | -------------------------------------- |
| `:ob {command-id}`                 | Execute any Obsidian command by ID     |
| `:ob`                              | List all available command IDs         |
| `:commands`                        | Search and execute Obsidian commands   |
| `:sidebar left` / `:sidebar right` | Toggle left/right sidebar              |
| `:reg` / `:registers`              | Browse vim registers (paste on select) |
| `:delmarks {marks}`                | Delete specified marks                 |
| `:version` / `:ve`                 | Show plugin version                    |
| `:gmap`                            | List all active global bindings        |

## Snippets

Snippet keybindings are active during snippet expansion (after a snippet has been triggered).

| Keybinding  | Description                                     |
| ----------- | ----------------------------------------------- |
| `Tab`       | Move to next tabstop / expand snippet at prefix |
| `Shift+Tab` | Move to previous tabstop                        |
| `Escape`    | Exit snippet mode                               |
| `Ctrl+N`    | Cycle to next choice (on choice fields)         |
| `Ctrl+P`    | Cycle to previous choice (on choice fields)     |

## Oil explorer

Oil keybindings are only active when an oil buffer is focused. All keybindings are user-remappable via Lua or vimrc — see [[oil-explorer#Remapping keybindings]] for details.

| Keybinding | Ex command         | Description                                           |
| ---------- | ------------------ | ----------------------------------------------------- |
| `<CR>`     | `:oilopen`         | Open file under cursor / navigate into directory      |
| `-`        | `:oilparent`       | Navigate to parent directory                          |
| `~`        | `:oilroot`         | Navigate to vault root                                |
| `q`        | `:oilclose`        | Close oil buffer                                      |
| `<C-l>`    | `:oilrefresh`      | Refresh directory listing                             |
| `g.`       | `:oiltogglehidden` | Toggle hidden files (dotfiles)                        |
| `gs`       | `:oilcyclesort`    | Cycle sort order (name → modified time → size)        |
| `y.`       | `:oilyankpath`     | Yank vault-relative file path to clipboard            |
| `gf`       | `:oilreveal`       | Reveal file under cursor in Obsidian file explorer    |
| `dd`       |                    | Stage file deletion (commit with `:w`)                |
| `o`        |                    | Stage file creation — type filename, commit with `:w` |
| `cw`       |                    | Stage file rename — edit filename, commit with `:w`   |
| `:w`       |                    | Commit all staged changes (create/rename/delete)      |
| `:Oil`     |                    | Open oil explorer for current file's directory        |

## Quality of life

Enhanced Vim behavior and Obsidian-specific improvements.

| Keybinding | Description                                            |
| ---------- | ------------------------------------------------------ |
| `o` / `O`  | Smart list continuation (bullets, numbers, checkboxes) |
| `Y`        | Yank to end of line (`y$`)                             |
| `Q`        | Replay last recorded macro (`@@`)                      |

## Remapping

All keybindings above are user-remappable. See [[remapping]] for instructions and examples covering editor, oil explorer, picker, and global workspace navigation contexts.
