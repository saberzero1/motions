---
title: Oil explorer
description: Oil.nvim-inspired file explorer that lets you edit vault directories as buffers — create, rename, delete, and move files with standard vim commands.
tags:
    - features
    - keybindings
---

Oil explorer (inspired by [oil.nvim](https://github.com/stevearc/oil.nvim)) provides a keyboard-first way to manage your vault's file structure. Instead of using a sidebar or modal, Oil renders a directory's contents as an editable Markdown buffer. You can create, rename, delete, and move files using standard Vim operators like `o`, `cw`, `dd`, and `p`, then commit all changes at once with `:w`.

Oil is not intended to replace the Obsidian file explorer, but rather to provide a fast, keyboard-driven alternative for bulk file operations and rapid navigation.

## Opening

- `:Oil` opens the directory containing the current file.
- `:Oil path/to/dir` opens a specific directory.
- `:Oil .` opens the vault root.

## Keybindings

![[keybindings#Oil explorer]]

## File operations

All changes in an Oil buffer are staged and only applied to the filesystem when you save the buffer with `:w`.

- **Create**: Type a new line with the desired filename. Pressing `:w` creates the file. Filenames without an extension default to `.md`. Names ending with a `/` create folders.
- **Rename**: Edit the filename text on an existing line. Pressing `:w` renames the file. Obsidian backlinks are updated automatically.
- **Delete**: Delete a line using `dd` or any other Vim command. Pressing `:w` moves the file to the trash (respecting your Obsidian trash settings). A confirmation dialog is shown if the number of deleted files exceeds the configured threshold.

## Navigation

- `<CR>` opens the file under the cursor or enters the directory.
- `-` navigates to the parent directory.
- `~` navigates to the vault root.
- `q` closes the Oil buffer.

## Remapping keybindings

All oil keybindings can be remapped via Lua or vimrc. Each keybinding maps to an ex command that you can target from your own bindings.

### Oil ex commands

| Ex command         | Short     | Default key | Description                      |
| ------------------ | --------- | ----------- | -------------------------------- |
| `:oilopen`         | `:oilo`   | `<CR>`      | Open file / enter directory      |
| `:oilparent`       | `:oilp`   | `-`         | Navigate to parent directory     |
| `:oilroot`         | `:oilro`  | `~`         | Navigate to vault root           |
| `:oilrefresh`      | `:oilref` | `<C-l>`     | Refresh directory listing        |
| `:oilclose`        | `:oilcl`  | `q`         | Close oil buffer                 |
| `:oiltogglehidden` | `:oilt`   | `g.`        | Toggle hidden files              |
| `:oilcyclesort`    | `:oilcy`  | `gs`        | Cycle sort order                 |
| `:oilyankpath`     | `:oily`   | `y.`        | Yank file path to clipboard      |
| `:oilreveal`       | `:oilrev` | `gf`        | Reveal in Obsidian file explorer |

### Remap via Lua (recommended)

Use the `OilEnter` autocmd to set buffer-local keymaps that only apply in oil buffers:

```lua
vim.api.nvim_create_autocmd('OilEnter', {
    callback = function()
        vim.keymap.set('n', '<C-h>', function()
            vim.obsidian.oil.parent()
        end, { buffer = 0 })
        vim.keymap.set('n', 'l', function()
            vim.obsidian.oil.open_entry()
        end, { buffer = 0 })
    end
})
```

### Remap via vimrc

```vim
nmap <C-h> :oilparent<CR>
nmap l :oilopen<CR>
```

> [!info] Vimrc oil mappings are global
> Vimrc `nmap` cannot scope to oil buffers only. Mappings apply everywhere. Use Lua with `{ buffer = 0 }` for oil-only bindings.

### Lua functions

All oil actions are available as Lua functions under `vim.obsidian.oil`:

```lua
vim.obsidian.oil.open(path)       -- open oil for a directory
vim.obsidian.oil.close()          -- close oil buffer
vim.obsidian.oil.parent()         -- navigate to parent directory
vim.obsidian.oil.root()           -- navigate to vault root
vim.obsidian.oil.refresh()        -- refresh current listing
vim.obsidian.oil.toggle_hidden()  -- toggle dotfile visibility
vim.obsidian.oil.cycle_sort()     -- cycle sort order
vim.obsidian.oil.yank_path()      -- copy path to clipboard
vim.obsidian.oil.reveal()         -- reveal in Obsidian file explorer
vim.obsidian.oil.open_entry()     -- open file/directory under cursor
```

## Configuration

You can customize Oil explorer behavior in **Settings → Vim Motions → File explorer**:

- **Oil explorer**: Toggle the feature on or off.
- **Show hidden files**: Toggle visibility of dotfiles and hidden folders.
- **Confirm delete threshold**: Set the number of files that triggers a confirmation dialog on deletion.
- **Default sort order**: Choose between name, modified time, or size.

See [[settings#File explorer]] for details.

## How it works

When you open Oil, the plugin creates a temporary Markdown file (e.g., `oil~_root.md`) to render the directory listing. These files are hidden from the Obsidian file explorer via CSS and from search and graph views via `userIgnoreFilters`.

Because Oil uses a standard Markdown buffer, all existing Vim features like EasyMotion, surround, and text objects work natively within the Oil view. The temporary file is automatically deleted when the tab is closed or the plugin unloads.

> [!warning]
> **Cross-directory moves**: Moving a file from one directory to another (e.g., `dd` in one Oil buffer and `p` in another) is supported but requires both directories to be open in separate Oil buffers simultaneously. See [[known-limitations#Oil explorer]] for details.
