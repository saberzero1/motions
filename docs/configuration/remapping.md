---
title: Remapping keybindings
description: How to customize keybindings across editor, oil explorer, picker, and global workspace navigation contexts.
tags:
    - configuration
    - keybindings
---

Every keybinding in Vim Motions is user-remappable. The mechanism depends on the context — editor keybindings use `vim.keymap.set` / `nmap`, oil explorer uses autocmds, the picker uses a dedicated keymap API, and global workspace navigation uses `vim.obsidian.keymap.set` / `gmap`.

## Editor keybindings

All editor motions, actions, and operators have ex command aliases. Remap by mapping your preferred key to the ex command.

### Lua (recommended)

```lua
vim.keymap.set('n', 'gh', ':nextheading<CR>', { desc = 'Next heading' })
vim.keymap.set('n', 'gH', ':prevheading<CR>', { desc = 'Previous heading' })
vim.keymap.set('n', '<leader>s', ':splitvertical<CR>', { desc = 'Split vertical' })
```

### Vimrc

```vim
nmap gh :nextheading<CR>
nmap gH :prevheading<CR>
nmap <leader>s :splitvertical<CR>
```

### Removing a default binding

To move a binding to a different key and disable the original:

```lua
vim.keymap.del('n', ']h')
vim.keymap.set('n', 'gh', ':nextheading<CR>')
```

See [[ex-commands#Navigation and action commands]] for the full list of ex command aliases.

## Oil explorer keybindings

Oil keybindings are context-scoped — they only apply inside oil buffers. Use the `OilEnter` autocmd to set buffer-local keymaps.

### Lua (recommended)

```lua
vim.api.nvim_create_autocmd('OilEnter', {
    callback = function()
        vim.keymap.set('n', 'l', function()
            vim.obsidian.oil.open_entry()
        end, { buffer = 0 })
        vim.keymap.set('n', 'h', function()
            vim.obsidian.oil.parent()
        end, { buffer = 0 })
    end
})
```

### Vimrc

```vim
nmap <C-h> :oilparent<CR>
```

> [!info] Vimrc oil mappings are global
> Vimrc `nmap` cannot scope to oil buffers only. Mappings apply everywhere. Use Lua with `{ buffer = 0 }` for oil-only bindings.

### Oil Lua functions

| Function                           | Description                      |
| ---------------------------------- | -------------------------------- |
| `vim.obsidian.oil.open(path)`      | Open oil for a directory         |
| `vim.obsidian.oil.close()`         | Close oil buffer                 |
| `vim.obsidian.oil.parent()`        | Navigate to parent directory     |
| `vim.obsidian.oil.root()`          | Navigate to vault root           |
| `vim.obsidian.oil.refresh()`       | Refresh current listing          |
| `vim.obsidian.oil.toggle_hidden()` | Toggle dotfile visibility        |
| `vim.obsidian.oil.cycle_sort()`    | Cycle sort order                 |
| `vim.obsidian.oil.yank_path()`     | Copy file path to clipboard      |
| `vim.obsidian.oil.reveal()`        | Reveal in Obsidian file explorer |
| `vim.obsidian.oil.open_entry()`    | Open file/directory under cursor |

See [[oil-explorer#Remapping keybindings]] for the full ex command table.

## Picker keybindings

The picker operates outside the vim keymap system. Configure its keybindings via Lua:

```lua
vim.obsidian.pick_keymap({
    move_down = { 'ArrowDown', 'C-n' },
    move_up = { 'ArrowUp', 'C-p' },
    confirm = { 'Enter' },
    split_h = { 'C-s' },
    split_v = { 'C-v' },
    open_tab = { 'C-t' },
    scroll_down = { 'C-d' },
    scroll_up = { 'C-u' },
    close = { 'Escape', 'C-q' },
})
```

Key format: `ArrowDown`, `Enter`, `Escape` for special keys; `C-x` for Ctrl+x. Only specified fields are updated — omitted fields keep their defaults.

> [!info] Vimrc not supported
> Picker keybindings cannot be configured via vimrc. Use Lua.

## Global workspace navigation keybindings

Global keybindings apply in non-editor views (graph, PDF, canvas, etc.). Configure via `vim.obsidian.keymap.set` (Lua) or `gmap` (vimrc).

### Lua

```lua
vim.obsidian.keymap.set('H', ':files', { desc = 'Find files' })
vim.obsidian.keymap.del('L')
```

### Vimrc

```vim
gmap H :files
gunmap L
```

### Ex command line

```vim
:gmap H :files
:gunmap L
:gmaps          " list all global mappings
```

The rhs must start with `:` — either `:command` (ex command) or `:obcommand command-id` (Obsidian command).

See [[vimrc#Global key mappings]] for details.

## Summary

| Context              | Lua API                           | Vimrc                     | Ex command          |
| -------------------- | --------------------------------- | ------------------------- | ------------------- |
| Editor motions       | `vim.keymap.set`                  | `nmap key :excommand<CR>` | N/A                 |
| Oil explorer         | `OilEnter` autocmd + buffer-local | `nmap key :oilcmd<CR>`    | `:oilparent`, etc.  |
| Picker               | `vim.obsidian.pick_keymap(table)` | Not supported             | N/A                 |
| Global workspace nav | `vim.obsidian.keymap.set/del`     | `gmap` / `gunmap`         | `:gmap` / `:gunmap` |
