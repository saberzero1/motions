---
title: Ex commands
description: 100+ ex commands for file management, navigation, window management, table manipulation, oil explorer, and Obsidian integration.
tags:
    - features
    - keybindings
---

Vim Motions provides 100+ ex commands accessible via `:` in Normal mode. Commands cover file operations, buffer management, window splits, table manipulation, navigation actions, oil explorer, and Obsidian-specific integration.

## Command reference

![[keybindings#Ex commands]]

## Obsidian integration

### `:ob` / `:obcommand` — execute Obsidian commands

`:ob {command-id}` (or `:obcommand {command-id}`) executes any Obsidian command by its internal ID. Both commands are identical — `obcommand` is provided for compatibility with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support). Run either command without arguments to list all available command IDs in a modal (or open the command picker when enabled).

This is the bridge between Vim's ex command line and Obsidian's command palette. Use it to create custom key bindings for any Obsidian command:

```lua
vim.api.nvim_create_user_command("ToggleDarkMode", function()
    vim.obsidian.run_command("theme:use-dark")
end, {})
vim.keymap.set("n", "<leader>d", ":ToggleDarkMode<CR>", { desc = "Toggle dark mode" })
```

```vim
" Or via vimrc:
exmap toggleDarkMode obcommand theme:use-dark
nmap <leader>d :toggleDarkMode<CR>
```

## Picker commands

The unified fuzzy picker provides [telescope.nvim](https://github.com/nvim-telescope/telescope.nvim)-style search across vault content. The picker uses a terminal-inspired visual presentation with monospace fonts, compact item density, and floating border titles showing the source name (e.g. "Files"), "Results", and "Preview" on each section's top border. All colors use Obsidian CSS variables for full theme compatibility. All picker commands are available in both editor and non-editor views.

| Command         | Short    | Description                                     |
| --------------- | -------- | ----------------------------------------------- |
| `:files`        |          | Find files by name                              |
| `:buffers`      | `:buf`   | Switch between open buffers                     |
| `:commands`     |          | Search and execute Obsidian commands            |
| `:headings`     |          | Search all headings across vault                |
| `:outline`      |          | Jump to heading in current file                 |
| `:backlinks`    | `:backl` | Show files linking to current file              |
| `:tags`         |          | Browse vault tags (opens sub-picker with files) |
| `:recent`       |          | Recently opened files                           |
| `:marks`        |          | Jump to vim marks (editor context only)         |
| `:registers`    | `:reg`   | Browse vim registers (paste on select)          |
| `:grep <query>` | `:gre`   | Search vault content (pre-computed results)     |
| `:livegrep`     | `:liveg` | Real-time vault content search                  |
| `:resume`       | `:res`   | Reopen last picker with same query              |

### Keyboard shortcuts inside picker

| Key                  | Action                   | Remappable via             |
| -------------------- | ------------------------ | -------------------------- |
| `<C-n>` / `<C-j>`    | Navigate down            | `vim.obsidian.pick_keymap` |
| `<C-p>` / `<C-k>`    | Navigate up              | `vim.obsidian.pick_keymap` |
| `<Up>` / `<Down>`    | Navigate down/up         | `vim.obsidian.pick_keymap` |
| `<Enter>`            | Select item              | `vim.obsidian.pick_keymap` |
| `<Escape>` / `<C-c>` | Close picker             | `vim.obsidian.pick_keymap` |
| `<C-x>`              | Open in horizontal split | `vim.obsidian.pick_keymap` |
| `<C-v>`              | Open in vertical split   | `vim.obsidian.pick_keymap` |
| `<C-t>`              | Open in new tab          | `vim.obsidian.pick_keymap` |
| `<C-d>` / `<C-u>`    | Scroll preview down/up   | `vim.obsidian.pick_keymap` |

Picker keybindings can be customized via Lua:

```lua
vim.obsidian.pick_keymap({
    move_down = { 'ArrowDown', 'C-n' },
    move_up = { 'ArrowUp', 'C-p' },
    confirm = { 'Enter' },
    split_h = { 'C-s' },       -- changed from C-x
    split_v = { 'C-v' },
    open_tab = { 'C-t' },
    scroll_down = { 'C-d' },
    scroll_up = { 'C-u' },
    close = { 'Escape', 'C-c' },
})
```

Key format: `ArrowDown`, `ArrowUp`, `Enter`, `Escape` for special keys; `C-x` for Ctrl+x combinations. Only specified fields are updated — omitted fields keep their defaults.

### Lua API

```lua
vim.obsidian.pick('files')
vim.obsidian.pick('livegrep')
vim.obsidian.pick('grep', { query = 'search term' })
vim.obsidian.pick('resume')
```

### Leader mappings

When `pickerLeaderMappings` is enabled (default: on), the following bindings are registered under `<leader>f`:

| Key          | Picker    |
| ------------ | --------- |
| `<leader>ff` | Files     |
| `<leader>fg` | Live grep |
| `<leader>fb` | Buffers   |
| `<leader>fh` | Headings  |
| `<leader>fo` | Outline   |
| `<leader>fk` | Backlinks |
| `<leader>ft` | Tags      |
| `<leader>fr` | Recent    |
| `<leader>fm` | Marks     |
| `<leader>fR` | Registers |
| `<leader>fp` | Resume    |

### `:sidebar` — toggle sidebars

`:sidebar left` and `:sidebar right` toggle the left and right sidebars respectively.

### `:explorer` — reveal in file explorer

`:explorer` reveals the active file in the file explorer sidebar.

### `:grep` — vault search

`:grep {pattern}` searches the vault for text and shows results in a modal.

### `:backlinks` — show backlinks

`:backlinks` shows all backlinks to the current note in a modal.

### `:files` — find files

`:files` opens the fuzzy picker for vault files.

### `:commands` — run commands

`:commands` opens the fuzzy picker for Obsidian commands. Use `:ob` for a raw command list by ID.

### `:resume` — resume last picker

`:resume` reopens the most recent picker session with the same source and query.

## Navigation and action commands

Every navigation motion and workspace action has an ex command alias, enabling user remapping via `:nmap key :excommand<CR>` in vimrc or `vim.keymap.set('n', 'key', ':excommand<CR>')` in Lua.

### Structural navigation

| Command             | Default key | Description                |
| ------------------- | ----------- | -------------------------- |
| `:nextheading`      | `]h`        | Jump to next heading       |
| `:prevheading`      | `[h`        | Jump to previous heading   |
| `:nextheading1`–`6` | `]1`–`]6`   | Jump to next H1–H6         |
| `:prevheading1`–`6` | `[1`–`[6`   | Jump to previous H1–H6     |
| `:nextlistitem`     | `]l`        | Jump to next list item     |
| `:prevlistitem`     | `[l`        | Jump to previous list item |
| `:nextlink`         | `]n`        | Jump to next link          |
| `:prevlink`         | `[n`        | Jump to previous link      |
| `:nextbuffer`       | `]b`        | Switch to next buffer      |
| `:prevbuffer`       | `[b`        | Switch to previous buffer  |

### Table navigation

| Command          | Default key | Description             |
| ---------------- | ----------- | ----------------------- |
| `:tablenextcell` | `]c`        | Jump to next table cell |
| `:tableprevcell` | `[c`        | Jump to previous cell   |
| `:tablenextrow`  | `]r`        | Jump to next table row  |
| `:tableprevrow`  | `[r`        | Jump to previous row    |

### Workspace navigation

| Command                 | Default key | Description                     |
| ----------------------- | ----------- | ------------------------------- |
| `:focuspaneleft`        | `<C-w>h`    | Focus left pane                 |
| `:focuspanedown`        | `<C-w>j`    | Focus pane below                |
| `:focuspaneup`          | `<C-w>k`    | Focus pane above                |
| `:focuspaneright`       | `<C-w>l`    | Focus right pane                |
| `:splitvertical`        | `<C-w>v`    | Split vertically                |
| `:splithorizontal`      | `<C-w>s`    | Split horizontally              |
| `:closetab`             | `<C-w>c`    | Close current tab               |
| `:closeothertabs`       | `<C-w>o`    | Close all other tabs            |
| `:nexttab`              | `gt`        | Next tab                        |
| `:prevtab`              | `gT`        | Previous tab                    |
| `:gototab`              | `g<C-t>`    | Go to Nth tab                   |
| `:gotodefinition`       | `gd`        | Follow link under cursor        |
| `:gotodefinitionnewtab` | `gD`        | Follow link in new tab          |
| `:gotodefinitionsplith` | `<C-w>gd`   | Follow link in horizontal split |
| `:gotodefinitionsplitv` | `<C-w>gD`   | Follow link in vertical split   |
| `:foldclose`            | `zc`        | Close fold                      |
| `:foldopen`             | `zo`        | Open fold                       |
| `:foldtoggle`           | `za`        | Toggle fold                     |
| `:foldall`              | `zM`        | Close all folds                 |
| `:unfoldall`            | `zR`        | Open all folds                  |
| `:documentoutline`      | `gO`        | Open document outline           |
| `:openurl`              | `gx`        | Open URL under cursor           |
| `:docstats`             | `g<C-g>`    | Show document statistics        |
| `:renamenote`           | `grn`       | Rename current note             |
| `:showbacklinks`        | `grr`       | Show backlinks                  |
| `:opengotofile`         | `gf`        | Open file switcher              |
| `:contextactions`       | `gra`       | Show context actions            |
| `:charinfo`             | `ga`        | Show character info             |

### Hint mode

| Command         | Description             |
| --------------- | ----------------------- |
| `:hintactivate` | Activate hint labels    |
| `:hintopennew`  | Hint: open in new pane  |
| `:hintyank`     | Hint: yank link or text |
| `:hintclose`    | Hint: close tab or pane |

### Oil explorer

| Command            | Default key | Description                  |
| ------------------ | ----------- | ---------------------------- |
| `:oilopen`         | `<CR>`      | Open file / enter directory  |
| `:oilparent`       | `-`         | Navigate to parent directory |
| `:oilroot`         | `~`         | Navigate to vault root       |
| `:oilrefresh`      | `<C-l>`     | Refresh directory listing    |
| `:oilclose`        | `q`         | Close oil buffer             |
| `:oiltogglehidden` | `g.`        | Toggle hidden files          |
| `:oilcyclesort`    | `gs`        | Cycle sort order             |
| `:oilyankpath`     | `y.`        | Yank file path to clipboard  |
| `:oilreveal`       | `gf`        | Reveal in file explorer      |

## Global mapping commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `:gmap key :command` | Add a global (non-editor) keybinding |
| `:gunmap key`        | Remove a global keybinding           |
| `:gmaps`             | List all active global keybindings   |

`:gmap` binds a key sequence to an ex command or Obsidian command in non-editor views (graph, PDF, canvas, etc.):

```vim
:gmap H :files
:gmap <C-w>p :obcommand workspace:previous-tab
:gunmap L
```

The rhs must start with `:` — either `:command` (ex command) or `:obcommand command-id` (Obsidian command). These commands work from both the editor `:` command line and the standalone non-editor `:` modal.

See [[vimrc#Global key mappings]] for configuring global mappings in `.obsidian.vimrc`, or [[lua-config#Global keymaps]] for Lua configuration via `vim.obsidian.keymap.set`.

## Non-editor ex command line

Pressing `:` in a non-editor view (PDF, graph, canvas, etc.) opens a standalone command modal with tab-completion. Only globally-safe commands are available from this modal — commands that require an active editor (`:e!`, `:saveas`, `:read`, `:marks`) show a notice when invoked.

## Tab completion

Ex commands support tab-completion as you type in the `:` command line, matching available commands by prefix.

## Configuration

Ex commands are always enabled — there is no toggle setting. The `:ob` command is registered independently from [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support), so both plugins can coexist.

See [[known-limitations#Platform]] for Neovim ex commands that are not applicable in Obsidian.
