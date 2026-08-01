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
- `:Oil /` opens the vault root.

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

| Ex command         | Short        | Default key  | Description                      |
| ------------------ | ------------ | ------------ | -------------------------------- |
| `:oilopen`         | `:oilo`      | `<CR>`       | Open file / enter directory      |
| `:oilopentab`      | `:oilopent`  | `<C-t>`      | Open file in new tab             |
| `:oilopensv`       | `:oilopensv` | `<C-s>`      | Open file in vertical split      |
| `:oilopensh`       | `:oilopensh` | `<C-h>`      | Open file in horizontal split    |
| `:oilparent`       | `:oilp`      | `-`          | Navigate to parent directory     |
| `:oilroot`         | `:oilro`     | `~`          | Navigate to vault root           |
| `:oilrefresh`      | `:oilref`    | `<C-l>`      | Refresh directory listing        |
| `:oilclose`        | `:oilcl`     | `q`, `<C-c>` | Close oil buffer                 |
| `:oiltogglehidden` | `:oilt`      | `g.`         | Toggle hidden files              |
| `:oilcyclesort`    | `:oilcy`     | `gs`         | Cycle sort order                 |
| `:oilyankpath`     | `:oily`      | `y.`         | Yank file path to clipboard      |
| `:oilreveal`       | `:oilrev`    | `gf`         | Reveal in Obsidian file explorer |
| `:oilopenexternal` | `:oilopene`  | `gx`         | Open in default app              |
| `:oilhelp`         | `:oilh`      | `g?`         | Show keybinding help modal       |

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

## Behavior

### Mode restoration

When you close Oil (via `q`, `:q`, `:wq`, or `vim.ob.oil.close()`), the editor reopens your previous file in the same mode you were in when you opened Oil — source mode, live preview, or reading mode.

### Obsidian hotkey handling

Oil's Ctrl-key keybindings (`<C-t>`, `<C-s>`, `<C-h>`, `<C-l>`, `<C-c>`) are registered on the editor's Obsidian Scope, which fires before Obsidian's default hotkeys. This means `<C-t>` correctly opens in a new tab instead of triggering Obsidian's "New tab" hotkey, `<C-s>` opens a vertical split instead of saving, and `<C-h>` opens a horizontal split instead of opening search & replace. No manual hotkey unbinding is required for Oil keybindings to work.

### Focus on tab switch

If you switch away from the Oil tab and then switch back (via `gT`, `gt`, or clicking the tab), the Oil editor automatically regains focus. You can start typing vim commands immediately without needing to click.

### Focus after commit

When committing changes with `:w`, the Oil editor retains focus after the operation completes — whether the commit succeeds, the confirmation dialog is cancelled, or the dialog is dismissed with `Esc`. You can continue editing or navigating immediately without needing to re-focus the editor.

### Opening from non-editor contexts

Oil works correctly when opened from any context — including empty panes, settings, graph view, or the command palette with no file open. The plugin automatically primes the workspace leaf with editor infrastructure before creating the Oil view, ensuring vim keybindings, conceal decorations, and which-key all function as expected.

### Hidden files (dotfiles)

When **Show hidden files** is enabled in **Settings → Vim Motions → File explorer**, Oil shows dotfiles and hidden folders (`.gitignore`, `.git/`, etc.) that Obsidian normally hides. These are discovered via the Obsidian adapter API, which accesses the filesystem directly.

> [!bug] View-only limitation
> Hidden files appear in the listing and can be opened, but renaming, deleting, or moving them via Oil buffer editing may fail because Obsidian's Vault API does not index dotfiles. Full CRUD operations on hidden files are not yet supported.

## How it works

When you open Oil, the plugin creates a dedicated Oil explorer view with an embedded Markdown editor. The directory listing is rendered as editable text directly in the view — no temporary files are created in the vault.

Because Oil uses a full CodeMirror 6 editor, all existing Vim features like EasyMotion, surround, and text objects work natively within the Oil view. The view state (current directory and previous file's editor mode) persists across workspace restarts.

> [!warning]
> **Cross-directory moves**: Moving a file from one directory to another (e.g., `dd` in one Oil buffer and `p` in another) is supported but requires both directories to be open in separate Oil buffers simultaneously. See [[known-limitations#Oil explorer]] for details.
