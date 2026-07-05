---
title: Lua configuration
description: Optional init.lua support, conditional config, keymaps, and function callbacks with Neovim-compatible Lua syntax.
tags:
    - configuration
---

Vim Motions supports `.obsidian.init.lua` files using a sandboxed Lua 5.3 runtime. Enable it in **Settings → Vim Motions → Vimrc & key bindings → Enable Lua configuration**. The key value-add over vimrc is conditional logic and function-based keymaps.

## File location

By default, place an `.obsidian.init.lua` file in your vault root. For **Obsidian Sync** users (which skips dotfiles), configure a custom path in **Settings → Vim Motions → Vimrc & key bindings → Custom Lua config path**, for example, `init.lua` or `config/my.lua`.

> [!tip] Obsidian Sync
> Dotfiles are not synced by Obsidian Sync. Use a non-dotfile path like `init.lua` and configure it in settings to ensure your Lua config syncs across devices.

## Example init.lua

```lua
vim.g.mapleader = " "

vim.opt.scrolloff = 8
vim.opt.textobjects = true
vim.opt.clipboard = "unnamedplus"

-- Conditional config based on vault
if vim.vault_name() == "work" then
    vim.opt.clipboard = "unnamedplus"
else
    vim.opt.clipboard = ""
end

-- Keymaps with string RHS
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })
vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode" })

-- Keymap with function callback
vim.keymap.set("n", "<leader>t", function()
    vim.cmd("obcommand daily-notes:open-today")
end, { desc = "Open daily note" })

-- Remove a mapping
vim.keymap.del("n", "Q")

-- Ex commands
vim.cmd("set nohlsearch")

print("init.lua loaded for vault:", vim.vault_name())
```

## Supported APIs

| API                                     | Description                    | Example                              |
| --------------------------------------- | ------------------------------ | ------------------------------------ |
| `vim.opt.<name> = value`                | Set a plugin option            | `vim.opt.scrolloff = 8`              |
| `vim.o.<name> = value`                  | Alias for `vim.opt`            | `vim.o.scrolloff = 8`                |
| `vim.g.mapleader`                       | Set the leader key             | `vim.g.mapleader = " "`              |
| `vim.g.<name> = value`                  | Set a user variable            | `vim.g.my_var = true`                |
| `vim.cmd(string)`                       | Execute an ex command          | `vim.cmd("set nohlsearch")`          |
| `vim.vault_name()`                      | Returns the current vault name | `if vim.vault_name() == "work" then` |
| `vim.keymap.set(mode, lhs, rhs, opts?)` | Create a key mapping           | see example above                    |
| `vim.keymap.del(mode, lhs)`             | Remove a key mapping           | `vim.keymap.del("n", "Q")`           |
| `print(...)`                            | Print to developer console     | `print("loaded")`                    |

## Supported vim.opt options

All plugin options are available via `vim.opt`.

| Option                    | Type    | Example                                  |
| ------------------------- | ------- | ---------------------------------------- |
| `textobjects`             | boolean | `vim.opt.textobjects = true`             |
| `navigation`              | boolean | `vim.opt.navigation = true`              |
| `hardwrap`                | boolean | `vim.opt.hardwrap = true`                |
| `listcontinuation`        | boolean | `vim.opt.listcontinuation = true`        |
| `tablenav`                | boolean | `vim.opt.tablenav = true`                |
| `workspacenav`            | boolean | `vim.opt.workspacenav = true`            |
| `easymotion`              | boolean | `vim.opt.easymotion = true`              |
| `easymotiondimming`       | boolean | `vim.opt.easymotiondimming = true`       |
| `hintmode`                | boolean | `vim.opt.hintmode = true`                |
| `statusbar`               | boolean | `vim.opt.statusbar = true`               |
| `chorddisplay`            | boolean | `vim.opt.chorddisplay = true`            |
| `powerline`               | boolean | `vim.opt.powerline = true`               |
| `expandtab`               | boolean | `vim.opt.expandtab = true`               |
| `scrolloff`               | number  | `vim.opt.scrolloff = 8`                  |
| `scanlimit`               | number  | `vim.opt.scanlimit = 20`                 |
| `labelfontsize`           | number  | `vim.opt.labelfontsize = 14`             |
| `tabstop`                 | number  | `vim.opt.tabstop = 4`                    |
| `shiftwidth`              | number  | `vim.opt.shiftwidth = 4`                 |
| `textwidth`               | number  | `vim.opt.textwidth = 80`                 |
| `insertmodeescapetimeout` | number  | `vim.opt.insertmodeescapetimeout = 1000` |
| `clipboard`               | string  | `vim.opt.clipboard = "unnamedplus"`      |
| `insertmodeescape`        | string  | `vim.opt.insertmodeescape = "jk"`        |
| `easymotionlabels`        | string  | `vim.opt.easymotionlabels = "asdf"`      |
| `hintlabels`              | string  | `vim.opt.hintlabels = "asdf"`            |
| `tablewidget`             | string  | `vim.opt.tablewidget = "cursor"`         |
| `formattingmarkmode`      | string  | `vim.opt.formattingmarkmode = "cursor"`  |
| `whichkey`                | string  | `vim.opt.whichkey = "leader"`            |
| `whichkeygrouping`        | string  | `vim.opt.whichkeygrouping = "grouped"`   |
| `whichkeydelay`           | number  | `vim.opt.whichkeydelay = 300`            |

See [[settings]] for the full list of options and their descriptions.

## Mapping examples

```lua
-- Normal mode mapping
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })

-- Insert mode escape
vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode" })

-- Multiple modes
vim.keymap.set({"n", "v"}, "<leader>y", '"+y', { desc = "Yank to clipboard" })

-- Function callback
vim.keymap.set("n", "<leader>e", function()
    vim.cmd("obcommand file-explorer:reveal-active-file")
end, { desc = "Reveal in explorer" })

-- Remove default mapping
vim.keymap.del("n", "Q")
```

## vim.keymap.set options

| Option    | Type    | Default | Description                              |
| --------- | ------- | ------- | ---------------------------------------- |
| `desc`    | string  | (none)  | Description shown in which-key popup     |
| `noremap` | boolean | `true`  | Non-recursive mapping                    |
| `remap`   | boolean | `false` | Recursive mapping (inverse of `noremap`) |
| `silent`  | boolean | (none)  | Accepted but no effect in Obsidian       |
| `nowait`  | boolean | (none)  | Accepted but no effect in Obsidian       |
| `buffer`  | (none)  | (none)  | Not supported (console warning)          |
| `expr`    | (none)  | (none)  | Not supported (throws error)             |

## When to use Lua vs Vimrc

- Use **init.lua** (recommended) when you need conditional logic (per-vault config), function-based keymaps, or prefer Neovim-style Lua syntax
- Use **vimrc** for simple key mappings and option settings if you prefer traditional Vimscript syntax
- Both can be used together — init.lua loads after vimrc, and Lua values override vimrc values on conflict

## Loading order

The plugin follows a specific override hierarchy:

1. Settings UI values (base)
2. Vimrc values override Settings UI
3. init.lua values override both

> [!warning] Override hierarchy
> This hierarchy differs from Neovim, which typically uses either `init.lua` or `.vimrc`, but not both simultaneously. In Vim Motions, they are additive.

## Unsupported Neovim APIs

Obsidian is not Neovim. Many Neovim-specific APIs are not available in this sandboxed environment.

> [!info] Obsidian is not Neovim
> The following Neovim APIs are not available: `require()`, `vim.api`, `vim.fn`, `vim.lsp`, `vim.treesitter`, `vim.ui`, `vim.diagnostic`. Attempting to use them produces a clear error message. The Lua runtime is sandboxed — `os`, `io`, `debug`, `load`, `dofile`, `loadfile`, and `require` are not available.

## Error handling

Syntax errors and runtime errors show an Obsidian Notice with the error message. The plugin continues to load normally. Check the developer console for details.
