---
title: Quickstart
description: A 5-minute hands-on guide to get started with Vim Motions in Obsidian.
tags:
    - getting-started
---

Get up and running with Vim Motions in 5 minutes. This guide assumes you've already [[installation|installed the plugin]].

## 1. Disable built-in Vim mode

For the best experience, disable Obsidian's built-in Vim mode:

**Settings → Editor → Vim key bindings → off**

This lets Vim Motions use its enhanced vim engine with Neovim-correct behavior. See [[recommended-setup]] for details on what this enables.

## 2. Try text objects

Open any Markdown file and place your cursor inside some **bold text**. Press:

- `di*` — deletes the bold text, leaving the `**` delimiters
- `da*` — deletes the bold text and the delimiters
- `ci*` — changes the bold text (deletes and enters insert mode)
- `vi*` — visually selects the bold text

These work for all Markdown formatting: `i_` (italic), `` i` `` (code), `i$` (math), `i~` (strikethrough), `i=` (highlight).

## 3. Navigate by structure

Jump between document structures:

- `]h` / `[h` — next/previous heading
- `]l` / `[l` — next/previous list item (same indent)
- `]n` / `[n` — next/previous link
- `3]h` — jump 3 headings forward
- `d]h` — delete from cursor to next heading

## 4. Try EasyMotion

Press `<leader><leader>w` (default leader is `\`) to see EasyMotion labels on every word start. Type a label character to jump there. Try these:

- `<leader><leader>f{char}` — find a character forward
- `<leader><leader>j` — jump to a line below
- `d` + `<leader><leader>w` — delete to an EasyMotion target (operator-pending)

## 5. Navigate the workspace

Split and navigate panes:

- `<C-w>v` — split vertically
- `<C-w>s` — split horizontally
- `<C-w>h/j/k/l` — focus pane by direction
- `gt` / `gT` — next/previous tab
- `gd` — go to definition (follow link under cursor)

> [!warning]
> You may need to unbind Ctrl+W from "Close current tab" in **Settings → Hotkeys** for `<C-w>` bindings to work.

## 6. Use ex commands

Type `:` to enter the ex command line:

- `:e filename` — open a file by name
- `:sp` / `:vs` — horizontal/vertical split
- `:grep pattern` — search the vault
- `:ob command-id` — run any Obsidian command

## 7. Set up your configuration

Create an `.obsidian.init.lua` file in your vault root (recommended):

```lua
vim.g.mapleader = " "
vim.opt.scrolloff = 8
vim.opt.clipboard = "unnamed"
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save" })
vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode" })
```

Or use `.obsidian.vimrc` if you prefer traditional Vim syntax:

```vim
let mapleader = " "
set scrolloff=8
set clipboard=unnamed
set insertmodeescape=jk
nmap <leader>w :w<CR>
```

The plugin loads these automatically. See [[lua-config]] or [[vimrc]] for the full reference.

## Next steps

- **[[keybindings|Keybinding cheat sheet]]** — complete reference for all motions and commands
- **[[lua-config|Lua configuration]]** — recommended configuration method
- **[[settings|Settings reference]]** — configure every aspect of the plugin
- **[[features/index|Feature overview]]** — deep-dives into each feature
