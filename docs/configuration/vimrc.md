---
title: Vimrc
description: Built-in vimrc support — key mappings, set options, leader bindings, and which-key labels with fallback file resolution.
tags:
    - configuration
---

Vim Motions has built-in vimrc support, compatible with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) syntax. When both plugins are installed, they coexist — Vim Motions registers its own `:ob` command independently.

> [!tip] Lua configuration available
> Vim Motions also supports Lua configuration with Neovim-compatible syntax. Lua config provides conditional logic and function-based keymaps. See [[lua-config]] for details.

## File location

The plugin searches the vault root for the first matching file in this order:

1. `vimrc`
2. `.vimrc`
3. `init.vim`
4. `.init.vim`
5. `obsidian.vimrc`
6. `obsidian.vim`
7. `.obsidian.vimrc`
8. `.obsidian.vim`

The first file found is used. Override this with a custom path in **Settings → Vim Motions → Vimrc & key bindings → Custom vimrc path**. The settings UI shows which file is currently active.

### Shared config across vaults (desktop only)

On desktop, the custom path can be an absolute filesystem path — useful for sharing one vimrc across multiple vaults:

- `~/.config/obsidian/vimrc` (Linux)
- `~/Library/Application Support/obsidian/vimrc` (macOS)
- `C:\Users\<you>\.config\obsidian\vimrc` (Windows)

Any absolute path (starting with `/`, `~`, or a drive letter) is read directly from the filesystem instead of through the vault. This is not available on mobile.

> [!tip] Obsidian Sync
> Obsidian Sync skips dotfiles. Use a non-dotfile name like `vimrc` (the first candidate in the fallback chain) to ensure your config syncs across devices.

## Example vimrc

```vim
" Leader key
let mapleader = " "

" Key mappings
nnoremap j gj
nnoremap k gk

" Settings (override Settings UI values)
set scrolloff=5
set textwidth=80
set clipboard=unnamed
set expandtab
set tabstop=4
set shiftwidth=2
set insertmodeescape=jk
set insertmodeescapetimeout=1000
set easymotion
set nopowerline
set easymotionlabels=asdghklqwertyuiopzxcvbnmfj

" Cursor shapes (bundled fork mode only)
set guicursor=n:block,i:bar,v:block,r:underline,o:underline

" Mode prompts
let g:mode_prompt_normal = "N"
let g:mode_prompt_insert = "I"

" Leader key mappings
exmap saveFile obcommand editor:save-file
nmap <leader>w :saveFile<CR>

" Which-key labels
whichkeygroup <leader>t Table
whichkeylabel <leader>w Save file

" Global mappings (non-editor contexts)
gmap <leader>f :obcommand switcher:open
gmap <leader>e :obcommand file-explorer:reveal-active-file
gnoremap <leader>s :sidebar left
gunmap H

" Global which-key labels
gwhichkeygroup <leader> +leader
gwhichkeylabel <leader>f Open file

" Custom surround pairs
surroundmap l [[ ]]
surroundmap m $$ $$
```

## Supported commands

| Command                                          | Description                                        |
| ------------------------------------------------ | -------------------------------------------------- |
| `map` / `nmap` / `imap` / `vmap`                 | Mode-specific key mappings                         |
| `noremap` / `nnoremap` / `inoremap` / `vnoremap` | Non-recursive mappings                             |
| `unmap` / `nunmap` / `iunmap` / `vunmap`         | Remove mappings                                    |
| `set`                                            | Set plugin options (see tables below)              |
| `let mapleader`                                  | Set the leader key                                 |
| `exmap`                                          | Define a named command from an Obsidian command    |
| `obcommand`                                      | Execute an Obsidian command by ID (alias of `:ob`) |
| `source`                                         | Source another vimrc file                          |
| `gmap` / `gnoremap`                              | Global key mapping for non-editor contexts         |
| `gunmap`                                         | Remove a global mapping                            |
| `whichkeygroup`                                  | Name a which-key group by prefix                   |
| `whichkeylabel`                                  | Label an individual binding in which-key           |
| `gwhichkeygroup`                                 | Name a global which-key group by prefix            |
| `gwhichkeylabel`                                 | Label a global binding in which-key                |
| `surroundmap`                                    | Register a custom surround pair                    |
| `surroundunmap`                                  | Remove a custom surround pair                      |

## Leader key

`let mapleader` supports any key: space (`let mapleader = " "`), comma, semicolon, backslash (default). The leader key's default Vim binding is automatically unmapped so leader-prefixed sequences work correctly.

## Boolean options

Use `set <option>` to enable, `set no<option>` to disable.

| Option                | Alias | Description                             | Default |
| --------------------- | ----- | --------------------------------------- | ------- |
| `textobjects`         | `to`  | Markdown-aware text objects             | on      |
| `replacewithregister` | `rwr` | Replace-with-register operator          | on      |
| `navigation`          | `nav` | Heading, list, and link navigation      | on      |
| `hardwrap`            | `hw`  | `gq`/`gw` hard-wrap operators           | on      |
| `listcontinuation`    | `lc`  | Smart list continuation on `o`/`O`      | on      |
| `tablenav`            | `tn`  | Table cell navigation                   | on      |
| `workspacenav`        | `wn`  | Pane/tab/sidebar control                | on      |
| `number`              | `nu`  | Show absolute line numbers              | off     |
| `relativenumber`      | `rnu` | Show relative line numbers              | off     |
| `easymotion`          | `em`  | EasyMotion/Hop navigation               | on      |
| `easymotiondimming`   | `emd` | Dim non-target text during EasyMotion   | on      |
| `hintmode`            | `hm`  | Vimium-style hint labels                | on      |
| `statusbar`           | `sb`  | Vim mode in status bar                  | on      |
| `chorddisplay`        | `cd`  | Pending keystrokes in status bar        | on      |
| `powerline`           | `pl`  | Colored powerline status bar            | off     |
| `expandtab`           | `et`  | Use spaces instead of tabs              | on      |
| `cursorline`          | `cul` | Cursor line highlight                   | on      |
| `foldcolumn`          | `fdc` | Fold column indicators                  | off     |
| `markgutter`          | —     | Alias for `signcolumn` (compat)         | on      |
| `snippets`            | —     | Enable snippet expansion                | on      |
| `snippetbundled`      | —     | Include bundled Obsidian snippets       | on      |
| `vimtextareas`        | `vta` | Vim keybindings in text areas           | off     |
| `jumplist`            | —     | Vim-style jump list for `<C-o>`/`<C-i>` | on      |

## Number options

Use `set <option>=<value>`.

| Option                    | Alias  | Description                              | Default | Range    |
| ------------------------- | ------ | ---------------------------------------- | ------- | -------- |
| `scrolloff`               | `so`   | Lines to keep visible above/below cursor | 5       | 0-9999   |
| `scanlimit`               | `sl`   | Max lines to scan for text objects       | 20      | 5-200    |
| `labelfontsize`           | `lfs`  | Font size for EasyMotion/hint labels     | 14      | 10-20    |
| `tabstop`                 | `ts`   | Tab display width                        | 4       | 1-8      |
| `shiftwidth`              | `sw`   | Indent width                             | 4       | 1-8      |
| `textwidth`               | `tw`   | Line wrap width for `gq`/`gw`            | 80      | 0-200    |
| `insertmodeescapetimeout` | `imet` | Timeout (ms) for insert escape sequence  | 1000    | 100-5000 |
| `numberwidth`             | `nuw`  | Minimum line number column width         | 2       | 1-20     |
| `jumplistsize`            | —      | Maximum jump list entries                | 200     | 1-1000   |

## String options

Use `set <option>=<value>`.

| Option                  | Alias    | Description                                            | Default                                                                    |
| ----------------------- | -------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `clipboard`             | `clip`   | System clipboard sync (`unnamed`/`unnamedplus`)        | (off)                                                                      |
| `insertmodeescape`      | `ime`    | Two-key sequence to exit insert mode                   | (off)                                                                      |
| `easymotionlabels`      | `eml`    | Characters for EasyMotion labels                       | `asdghklqwertyuiopzxcvbnmfj`                                               |
| `hintlabels`            | `hl`     | Characters for hint mode labels                        | `asdfghjkl`                                                                |
| `guicursor`             | —        | Per-mode cursor shapes                                 | (block/bar/block/underline/underline)                                      |
| `tablewidget`           | —        | Table widget mode (`off`/`cursor`/`always`/`embedded`) | `cursor`                                                                   |
| `whichkey`              | `wk`     | Which-key hints (`off`/`leader`/`all`)                 | `off`                                                                      |
| `whichkeygrouping`      | `wkg`    | Which-key grouping (`flat`/`grouped`)                  | `grouped`                                                                  |
| `whichkeysort`          | `wks`    | Which-key sort order (`which-key`/`groups-first`)      | `which-key`                                                                |
| `whichkeyicons`         | `wki`    | Which-key icons (`on`/`off`)                           | `on`                                                                       |
| `workspacenavviewtypes` | `wnvt`   | View types for workspace nav interception              | (empty — uses defaults: markdown, graph, pdf, canvas, empty, image, bases) |
| `cursorlineopt`         | `culopt` | Cursor line highlight mode (`number`/`line`/`both`)    | `number`                                                                   |
| `signcolumn`            | `scl`    | Sign column visibility (`auto[:N]`/`yes[:N]`/`no`)     | `auto`                                                                     |
| `linenumbermode`        | `lnm`    | Line number display (deprecated — use `statuscolumn`)  | `hybrid`                                                                   |
| `statuscolumn`          | `stc`    | Custom gutter layout format string                     | (empty — plugin-managed)                                                   |
| `snippetdir`            | —        | Path to user snippet JSON directory                    | (off)                                                                      |
| `snippettrigger`        | —        | Snippet trigger mode (`completion`/`tab`/`both`)       | `both`                                                                     |

## Mode prompt customization

```vim
let g:mode_prompt_normal = "N"
let g:mode_prompt_insert = "I"
let g:mode_prompt_visual = "V"
let g:mode_prompt_replace = "R"
```

## Which-key labels

```vim
" Group labels — collapse bindings under a named prefix
whichkeygroup <leader>t Table
whichkeygroup <leader>g Git

" Command labels — describe individual bindings
whichkeylabel <leader>w Save file
whichkeylabel gd Go to definition
```

Group and command labels from vimrc are merged with labels configured in Settings. If the same key appears in both, the vimrc value takes precedence.

## Global key mappings

`gmap` and `gnoremap` define key bindings for non-editor contexts — graph view, canvas, PDF viewer, reading mode, file explorer, and any other view where no editor is focused. These bindings use the same `<leader>` key as editor mappings.

```vim
" Map <leader>f to open the quick switcher in non-editor views
gmap <leader>f :obcommand switcher:open

" Map <leader>e to reveal the active file in the explorer
gmap <leader>e :obcommand file-explorer:reveal-active-file

" Map a key to an ex command
gnoremap <leader>s :sidebar left

" Remove a default global binding
gunmap H
```

The right-hand side must be either `:obcommand <command-id>` (to execute an Obsidian command) or `:<ex-command> [args]` (to execute a global ex command like `:sidebar`, `:split`, `:grep`, etc.). Key-to-key remapping is not supported in global context.

`gnoremap` is functionally identical to `gmap` — both are accepted for familiarity with Vim syntax.

Use `gunmap` to remove any global binding, including built-in defaults like `H` (previous tab) or `L` (next tab). After `gunmap`, the key is no longer intercepted and propagates to Obsidian's native handlers.

`:gmap` and `:gunmap` also work from the editor's `:` command line:

```vim
:gmap H :files
:gunmap L
:gmaps          " list all active global bindings
```

### Global which-key labels

Label your global bindings for the non-editor which-key overlay:

```vim
gwhichkeygroup <leader> +leader bindings
gwhichkeylabel <leader>f Open file
gwhichkeylabel <leader>e Reveal in explorer
```

These labels appear in the which-key overlay when a partial global key sequence is pending (e.g., pressing `<leader>` in a non-editor view shows all `<leader>*` global bindings).

## Override behavior

When configuration mode includes vimrc (Lua + Vimrc or Vimrc only), vimrc values override the corresponding Settings UI values for the current session. Overrides are in-memory only — the on-disk settings file always reflects UI-set values.

Settings overridden by vimrc appear as disabled controls in the settings tab with a note showing the vimrc directive (e.g., "Set by vimrc: `set scrolloff=10`").

## Settings not available via vimrc

| Setting          | Reason                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `configMode`     | Circular dependency — cannot control config file loading from vimrc |
| `hintModeHotkey` | Requires modifier key capture UI (press-to-record widget)           |
| `leaderBindings` | Already achievable via `nmap <leader>x :command` in vimrc           |

Unknown `set` options are silently ignored.

## Known issues

- Changing the vimrc file requires reloading the plugin — the file is loaded once during startup
- `nmap L $` and similar mappings may not apply if the vimrc file encounters I/O timing issues — reload the plugin as a workaround

See [[known-limitations#Vimrc]] for detailed technical limitations.
