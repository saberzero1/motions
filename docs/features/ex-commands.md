---
title: Ex commands
description: 60+ ex commands for file management, buffer navigation, window management, table manipulation, and Obsidian integration.
tags:
    - features
    - keybindings
---

Vim Motions provides 60+ ex commands accessible via `:` in Normal mode. Commands cover file operations, buffer management, window splits, table manipulation, and Obsidian-specific integration.

## Command reference

![[keybindings#Ex commands]]

## Obsidian integration

### `:ob` — execute Obsidian commands

`:ob {command-id}` executes any Obsidian command by its internal ID. Run `:ob` without arguments to list all available command IDs in a modal.

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

The unified fuzzy picker provides telescope.nvim-style search across vault content. All picker commands are available in both editor and non-editor views.

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

## Non-editor ex command line

Pressing `:` in a non-editor view (PDF, graph, canvas, etc.) opens a standalone command modal with tab-completion. Only globally-safe commands are available from this modal — commands that require an active editor (`:e!`, `:saveas`, `:read`, `:marks`) show a notice when invoked.

## Tab completion

Ex commands support tab-completion as you type in the `:` command line, matching available commands by prefix.

## Configuration

Ex commands are always enabled — there is no toggle setting. The `:ob` command is registered independently from [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support), so both plugins can coexist.

See [[known-limitations#Platform]] for Neovim ex commands that are not applicable in Obsidian.
