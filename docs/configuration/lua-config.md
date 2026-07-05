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

| API                                                 | Description                        | Example                              |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| `vim.opt.<name> = value`                            | Set a plugin option                | `vim.opt.scrolloff = 8`              |
| `vim.o.<name> = value`                              | Alias for `vim.opt`                | `vim.o.scrolloff = 8`                |
| `vim.g.mapleader`                                   | Set the leader key                 | `vim.g.mapleader = " "`              |
| `vim.g.<name> = value`                              | Set a user variable                | `vim.g.my_var = true`                |
| `vim.cmd(string)`                                   | Execute an ex command              | `vim.cmd("set nohlsearch")`          |
| `vim.vault_name()`                                  | Returns the current vault name     | `if vim.vault_name() == "work" then` |
| `vim.fn.has(feature)`                               | Platform/feature detection         | `vim.fn.has("mac")`                  |
| `vim.fn.expand(expr)`                               | Active file path (vault-relative)  | `vim.fn.expand("%:t")`               |
| `vim.fn.fnamemodify(path, mods)`                    | Path manipulation                  | `vim.fn.fnamemodify(path, ":t:r")`   |
| `vim.fn.exists(expr)`                               | Check variable/option existence    | `vim.fn.exists("g:my_var")`          |
| `vim.fn.localtime()`                                | Unix timestamp                     | `vim.fn.localtime()`                 |
| `vim.fn.strftime(fmt)`                              | Format date/time                   | `vim.fn.strftime("%Y-%m-%d")`        |
| `vim.fn.filereadable(path)`                         | Check vault file exists            | `vim.fn.filereadable("config.md")`   |
| `vim.fn.isdirectory(path)`                          | Check vault directory exists       | `vim.fn.isdirectory("templates")`    |
| `vim.fn.glob(pattern)`                              | Find matching vault files          | `vim.fn.glob("*.md")`                |
| `vim.fn.mode()`                                     | Current vim mode                   | `vim.fn.mode()`                      |
| `vim.fn.line(expr)`                                 | Cursor line (1-based, callbacks)   | `vim.fn.line(".")`                   |
| `vim.fn.col(expr)`                                  | Cursor column (1-based, callbacks) | `vim.fn.col(".")`                    |
| `vim.notify(msg)`                                   | Show Obsidian notification         | `vim.notify("Saved!")`               |
| `vim.api.nvim_create_user_command(name, cmd, opts)` | Define custom ex command           | see below                            |
| `vim.keymap.set(mode, lhs, rhs, opts?)`             | Create a key mapping               | see example above                    |
| `vim.keymap.del(mode, lhs)`                         | Remove a key mapping               | `vim.keymap.del("n", "Q")`           |
| `print(...)`                                        | Print to developer console         | `print("loaded")`                    |

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

## Supported vim.fn functions

A subset of Neovim's `vim.fn.*` functions is available for conditional configuration and platform detection.

| Function                         | Returns                       | Example                                        |
| -------------------------------- | ----------------------------- | ---------------------------------------------- |
| `vim.fn.has(feature)`            | `1` or `0`                    | `if vim.fn.has("mac") == 1 then`               |
| `vim.fn.expand("%")`             | Vault-relative file path      | `vim.fn.expand("%")` → `"folder/note.md"`      |
| `vim.fn.expand("%:t")`           | Filename only                 | `vim.fn.expand("%:t")` → `"note.md"`           |
| `vim.fn.expand("%:e")`           | Extension only                | `vim.fn.expand("%:e")` → `"md"`                |
| `vim.fn.expand("%:r")`           | Path without extension        | `vim.fn.expand("%:r")` → `"folder/note"`       |
| `vim.fn.fnamemodify(path, mods)` | Modified path                 | `vim.fn.fnamemodify("a/b.md", ":t:r")` → `"b"` |
| `vim.fn.exists(expr)`            | `1` if exists, `0` otherwise  | `vim.fn.exists("g:my_var")`                    |
| `vim.fn.localtime()`             | Unix timestamp (seconds)      | `vim.fn.localtime()`                           |
| `vim.fn.strftime(fmt)`           | Formatted date string         | `vim.fn.strftime("%Y-%m-%d")`                  |
| `vim.fn.filereadable(path)`      | `1` if vault file exists      | `vim.fn.filereadable("config.md")`             |
| `vim.fn.isdirectory(path)`       | `1` if vault directory exists | `vim.fn.isdirectory("templates")`              |
| `vim.fn.glob(pattern)`           | Newline-separated file list   | `vim.fn.glob("*.md")`                          |
| `vim.fn.mode()`                  | Current mode string           | `vim.fn.mode()` → `"n"`, `"i"`, `"v"`          |
| `vim.fn.line(expr)`              | Cursor line (1-based)         | `vim.fn.line(".")` (callbacks only)            |
| `vim.fn.col(expr)`               | Cursor column (1-based)       | `vim.fn.col(".")` (callbacks only)             |

### vim.fn.has() features

| Feature               | Returns 1 when                 |
| --------------------- | ------------------------------ |
| `"mac"` / `"macunix"` | macOS                          |
| `"linux"`             | Linux desktop                  |
| `"win32"` / `"win64"` | Windows                        |
| `"unix"`              | macOS or Linux                 |
| `"mobile"`            | Mobile device (iOS or Android) |
| `"desktop"`           | Desktop device                 |
| `"ios"`               | iOS                            |
| `"android"`           | Android                        |
| `"obsidian"`          | Always (running in Obsidian)   |
| `"obsidian-X.Y"`      | Obsidian version >= X.Y        |
| `"nvim"`              | Never (not Neovim)             |
| `"vim"`               | Never (not Vim)                |

### vim.fn.exists() expressions

| Expression    | Checks                                     |
| ------------- | ------------------------------------------ |
| `"g:varname"` | Whether `vim.g.varname` has been set       |
| `"&option"`   | Whether a `vim.opt` option exists          |
| `"*funcname"` | Whether a `vim.fn` function is implemented |

### vim.fn.fnamemodify() modifiers

| Modifier | Result                         | Example with `"folder/note.md"` |
| -------- | ------------------------------ | ------------------------------- |
| `:t`     | Filename with extension        | `"note.md"`                     |
| `:r`     | Remove last extension          | `"folder/note"`                 |
| `:e`     | Extension only                 | `"md"`                          |
| `:h`     | Directory part                 | `"folder"`                      |
| `:t:r`   | Filename without extension     | `"note"` (chained)              |
| `:p`     | Vault-relative path (identity) | `"folder/note.md"`              |

### vim.fn.line() and vim.fn.col()

These functions return cursor position (1-based) and are **only meaningful inside function callbacks**. At config-load time they return `0` because no editor is active.

```lua
vim.keymap.set("n", "<leader>h", function()
    if vim.fn.line(".") == 1 then
        vim.notify("Already at top!")
    else
        vim.cmd("normal! gg")
    end
end, { desc = "Smart go-to-top" })
```

### Conditional config examples

```lua
-- Per-platform settings
if vim.fn.has("mobile") == 1 then
    vim.opt.easymotion = false
    vim.opt.hintmode = false
end

-- Check if a templates directory exists
if vim.fn.isdirectory("templates") == 1 then
    vim.g.has_templates = true
end

-- Per-filetype keymaps (inside function callbacks)
vim.keymap.set("n", "<leader>p", function()
    if vim.fn.expand("%:e") == "md" then
        vim.cmd("obcommand markdown:toggle-preview")
    end
end, { desc = "Toggle preview" })

-- User feedback via vim.notify
vim.keymap.set("n", "<leader>r", function()
    vim.cmd("obcommand app:reload")
    vim.notify("Reloaded!")
end, { desc = "Reload" })

-- Check if a config file exists
if vim.fn.filereadable("vim-motions-config.md") == 1 then
    vim.opt.scrolloff = 10
end
```

> [!info] File paths are vault-relative
> `vim.fn.expand("%")`, `vim.fn.filereadable()`, `vim.fn.isdirectory()`, and `vim.fn.glob()` use vault-relative paths. Absolute filesystem paths and `..` path traversal are not supported for security.

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

## Custom ex commands

Define custom commands that are usable from the `:` ex command line.

```lua
-- Simple alias
vim.api.nvim_create_user_command("W", "w", {})
vim.api.nvim_create_user_command("Q", "q", {})

-- Command calling a Lua function
vim.api.nvim_create_user_command("Today", function()
    vim.cmd("obcommand daily-notes:open-today")
    vim.notify("Opened today's note")
end, {})

-- Command with arguments
vim.api.nvim_create_user_command("Open", function(opts)
    vim.cmd("obcommand switcher:open " .. opts.args)
end, {})

-- Toggle command
vim.api.nvim_create_user_command("SpellToggle", function()
    -- Toggle a user variable and notify
    if vim.g.spell_enabled then
        vim.g.spell_enabled = false
        vim.notify("Spell check disabled")
    else
        vim.g.spell_enabled = true
        vim.notify("Spell check enabled")
    end
end, {})
```

Registered commands are immediately available via `:CommandName` in the ex command line. The function callback receives an `opts` table with an `args` field containing the argument string.

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
> The following Neovim APIs are not available: `require()`, `vim.lsp`, `vim.treesitter`, `vim.ui`, `vim.diagnostic`. Attempting to use them produces a clear error message. `vim.api` is partially supported (`nvim_create_user_command` works, other functions error with a helpful message). `vim.fn` is partially supported (see above). The Lua runtime is sandboxed: `os`, `io`, `debug`, `load`, `dofile`, `loadfile`, and `require` are not available.

## Error handling

Syntax errors and runtime errors show an Obsidian Notice with the error message. The plugin continues to load normally. Check the developer console for details.
