---
title: Lua configuration
description: Optional init.lua support, conditional config, keymaps, and function callbacks with Neovim-compatible Lua syntax.
tags:
    - configuration
---

Vim Motions supports Lua configuration files using a sandboxed Lua 5.3 runtime. Enable it in **Settings → Vim Motions → Vimrc & key bindings → Configuration mode → Lua only** (or **Lua + Vimrc**). The key value-add over vimrc is conditional logic and function-based keymaps.

## File location

The plugin searches the vault root for the first matching file in this order:

1. `init.lua`
2. `.init.lua`
3. `obsidian.init.lua`
4. `.obsidian.init.lua`
5. `obsidian.lua`

The first file found is used. Override this with a custom path in **Settings → Vim Motions → Vimrc & key bindings → Custom init.lua path**. The settings UI shows which file is currently active.

> [!tip] Obsidian Sync
> Obsidian Sync skips dotfiles. Use a non-dotfile name like `init.lua` (the first candidate in the fallback chain) to ensure your Lua config syncs across devices.

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

| API                                                  | Description                                        | Example                              |
| ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `vim.opt.<name> = value`                             | Set a plugin option (string options accept tables) | `vim.opt.scrolloff = 8`              |
| `vim.o.<name> = value`                               | Alias for `vim.opt`                                | `vim.o.scrolloff = 8`                |
| `vim.g.mapleader`                                    | Set the leader key                                 | `vim.g.mapleader = " "`              |
| `vim.g.<name> = value`                               | Set a user variable                                | `vim.g.my_var = true`                |
| `vim.cmd(string)`                                    | Execute an ex command                              | `vim.cmd("set nohlsearch")`          |
| `vim.vault_name()`                                   | Returns the current vault name                     | `if vim.vault_name() == "work" then` |
| `vim.fn.has(feature)`                                | Platform/feature detection                         | `vim.fn.has("mac")`                  |
| `vim.fn.expand(expr)`                                | Active file path (vault-relative)                  | `vim.fn.expand("%:t")`               |
| `vim.fn.fnamemodify(path, mods)`                     | Path manipulation                                  | `vim.fn.fnamemodify(path, ":t:r")`   |
| `vim.fn.exists(expr)`                                | Check variable/option existence                    | `vim.fn.exists("g:my_var")`          |
| `vim.fn.localtime()`                                 | Unix timestamp                                     | `vim.fn.localtime()`                 |
| `vim.fn.strftime(fmt)`                               | Format date/time                                   | `vim.fn.strftime("%Y-%m-%d")`        |
| `vim.fn.filereadable(path)`                          | Check vault file exists                            | `vim.fn.filereadable("config.md")`   |
| `vim.fn.isdirectory(path)`                           | Check vault directory exists                       | `vim.fn.isdirectory("templates")`    |
| `vim.fn.glob(pattern)`                               | Find matching vault files                          | `vim.fn.glob("*.md")`                |
| `vim.fn.mode()`                                      | Current vim mode                                   | `vim.fn.mode()`                      |
| `vim.fn.line(expr)`                                  | Cursor line (1-based, callbacks)                   | `vim.fn.line(".")`                   |
| `vim.fn.col(expr)`                                   | Cursor column (1-based, callbacks)                 | `vim.fn.col(".")`                    |
| `vim.notify(msg)`                                    | Show Obsidian notification                         | `vim.notify("Saved!")`               |
| `vim.api.nvim_create_user_command(name, cmd, opts)`  | Define custom ex command                           | see below                            |
| `vim.api.nvim_create_autocmd(event, opts)`           | Register autocommand                               | see Autocommands section             |
| `vim.api.nvim_create_augroup(name, opts)`            | Create/get autocommand group                       | see Autocommands section             |
| `vim.keymap.set(mode, lhs, rhs, opts?)`              | Create a key mapping                               | see example above                    |
| `vim.keymap.del(mode, lhs)`                          | Remove a key mapping                               | `vim.keymap.del("n", "Q")`           |
| `vim.obsidian.keymap.set(lhs, rhs, opts?)`           | Create a global (non-editor) keymap                | see Obsidian namespace               |
| `vim.obsidian.keymap.del(lhs)`                       | Remove a global keymap                             | see Obsidian namespace               |
| `vim.obsidian.whichkey.set_group(key, label, opts?)` | Name a which-key group                             | see Obsidian namespace               |
| `vim.obsidian.whichkey.set_label(key, label, opts?)` | Label a which-key binding                          | see Obsidian namespace               |
| `vim.obsidian.whichkey.add(entries)`                 | Batch-add group and command labels                 | see Obsidian namespace               |
| `print(...)`                                         | Print to developer console                         | `print("loaded")`                    |

## Supported vim.opt options

All plugin options are available via `vim.opt`. `vim.o` is an alias.

| Option                    | Type    | Default                                           | Valid range / values               | Example                                            |
| ------------------------- | ------- | ------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `textobjects`             | boolean | `true`                                            |                                    | `vim.opt.textobjects = true`                       |
| `navigation`              | boolean | `true`                                            |                                    | `vim.opt.navigation = true`                        |
| `hardwrap`                | boolean | `true`                                            |                                    | `vim.opt.hardwrap = true`                          |
| `listcontinuation`        | boolean | `true`                                            |                                    | `vim.opt.listcontinuation = true`                  |
| `tablenav`                | boolean | `true`                                            |                                    | `vim.opt.tablenav = true`                          |
| `workspacenav`            | boolean | `true`                                            |                                    | `vim.opt.workspacenav = true`                      |
| `easymotion`              | boolean | `true`                                            |                                    | `vim.opt.easymotion = true`                        |
| `easymotiondimming`       | boolean | `true`                                            |                                    | `vim.opt.easymotiondimming = true`                 |
| `hintmode`                | boolean | `true`                                            |                                    | `vim.opt.hintmode = true`                          |
| `statusbar`               | boolean | `true`                                            |                                    | `vim.opt.statusbar = true`                         |
| `chorddisplay`            | boolean | `true`                                            |                                    | `vim.opt.chorddisplay = true`                      |
| `powerline`               | boolean | `false`                                           |                                    | `vim.opt.powerline = true`                         |
| `expandtab`               | boolean | `true`                                            |                                    | `vim.opt.expandtab = true`                         |
| `scrolloff`               | number  | `5`                                               | 0–9999                             | `vim.opt.scrolloff = 8`                            |
| `scanlimit`               | number  | `20`                                              | 5–200                              | `vim.opt.scanlimit = 20`                           |
| `labelfontsize`           | number  | `14`                                              | 10–20                              | `vim.opt.labelfontsize = 14`                       |
| `tabstop`                 | number  | `4`                                               |                                    | `vim.opt.tabstop = 4`                              |
| `shiftwidth`              | number  | `4`                                               |                                    | `vim.opt.shiftwidth = 4`                           |
| `textwidth`               | number  | `80`                                              |                                    | `vim.opt.textwidth = 80`                           |
| `insertmodeescapetimeout` | number  | `1000`                                            | 100–5000 ms                        | `vim.opt.insertmodeescapetimeout = 1000`           |
| `clipboard`               | string  | `""`                                              | `""`, `"unnamed"`, `"unnamedplus"` | `vim.opt.clipboard = "unnamedplus"`                |
| `insertmodeescape`        | string  | `""`                                              |                                    | `vim.opt.insertmodeescape = "jk"`                  |
| `easymotionlabels`        | string  | `"asdghklqwertyuiopzxcvbnmfj"`                    |                                    | `vim.opt.easymotionlabels = "asdf"`                |
| `hintlabels`              | string  | `"asdfghjkl"`                                     |                                    | `vim.opt.hintlabels = "asdf"`                      |
| `tablewidget`             | string  | `"cursor"`                                        | `"off"`, `"cursor"`, `"always"`    | `vim.opt.tablewidget = "cursor"`                   |
| `formattingmarkmode`      | string  | `"cursor"`                                        | `"off"`, `"cursor"`                | `vim.opt.formattingmarkmode = "cursor"`            |
| `whichkey`                | string  | `"off"`                                           | `"off"`, `"leader"`, `"all"`       | `vim.opt.whichkey = "leader"`                      |
| `whichkeygrouping`        | string  | `"grouped"`                                       | `"flat"`, `"grouped"`              | `vim.opt.whichkeygrouping = "grouped"`             |
| `whichkeydelay`           | number  | `500`                                             | 0–2000 ms                          | `vim.opt.whichkeydelay = 300`                      |
| `workspacenavviewtypes`   | string  | `""`                                              | Comma-separated view types         | `vim.opt.workspacenavviewtypes = "markdown,graph"` |
| `guicursor`               | string  | `"n:block,i:bar,v:block,r:underline,o:underline"` | see Cursor shapes                  | `vim.opt.guicursor = "n:bar,i:block"`              |
| `updatetime`              | number  | `4000`                                            | ms (CursorHold delay)              | `vim.opt.updatetime = 4000`                        |

> [!tip] Table syntax for string options
> String options that accept comma-separated values can also be set using Lua tables. The elements are joined with commas automatically.
>
> ```lua
> -- These are equivalent:
> vim.opt.workspacenavviewtypes = "markdown,graph,pdf,canvas"
> vim.opt.workspacenavviewtypes = {"markdown", "graph", "pdf", "canvas"}
> ```

See [[settings]] for the full list of options and their descriptions.

## Supported vim.fn functions

A subset of Neovim's `vim.fn.*` functions is available for conditional configuration and platform detection.

| Function                                | Returns                       | Example                                          |
| --------------------------------------- | ----------------------------- | ------------------------------------------------ |
| `vim.fn.has(feature)`                   | `1` or `0`                    | `if vim.fn.has("mac") == 1 then`                 |
| `vim.fn.expand("%")`                    | Vault-relative file path      | `vim.fn.expand("%")` → `"folder/note.md"`        |
| `vim.fn.expand("%:t")`                  | Filename only                 | `vim.fn.expand("%:t")` → `"note.md"`             |
| `vim.fn.expand("%:e")`                  | Extension only                | `vim.fn.expand("%:e")` → `"md"`                  |
| `vim.fn.expand("%:r")`                  | Path without extension        | `vim.fn.expand("%:r")` → `"folder/note"`         |
| `vim.fn.fnamemodify(path, mods)`        | Modified path                 | `vim.fn.fnamemodify("a/b.md", ":t:r")` → `"b"`   |
| `vim.fn.exists(expr)`                   | `1` if exists, `0` otherwise  | `vim.fn.exists("g:my_var")`                      |
| `vim.fn.localtime()`                    | Unix timestamp (seconds)      | `vim.fn.localtime()`                             |
| `vim.fn.strftime(fmt)`                  | Formatted date string         | `vim.fn.strftime("%Y-%m-%d")`                    |
| `vim.fn.filereadable(path)`             | `1` if vault file exists      | `vim.fn.filereadable("config.md")`               |
| `vim.fn.isdirectory(path)`              | `1` if vault directory exists | `vim.fn.isdirectory("templates")`                |
| `vim.fn.glob(pattern)`                  | Newline-separated file list   | `vim.fn.glob("*.md")`                            |
| `vim.fn.mode()`                         | Current mode string           | `vim.fn.mode()` → `"n"`, `"i"`, `"v"`            |
| `vim.fn.line(expr)`                     | Cursor line (1-based)         | `vim.fn.line(".")` (callbacks only)              |
| `vim.fn.col(expr)`                      | Cursor column (1-based)       | `vim.fn.col(".")` (callbacks only)               |
| `vim.fn.getline(expr)`                  | Line content string           | `vim.fn.getline(".")` (callbacks only)           |
| `vim.fn.tolower(s)`                     | Lowercase string              | `vim.fn.tolower("Hello")` → `"hello"`            |
| `vim.fn.toupper(s)`                     | Uppercase string              | `vim.fn.toupper("Hello")` → `"HELLO"`            |
| `vim.fn.trim(s)`                        | Trimmed string                | `vim.fn.trim("  hi  ")` → `"hi"`                 |
| `vim.fn.strlen(s)`                      | String length                 | `vim.fn.strlen("hello")` → `5`                   |
| `vim.fn.strwidth(s)`                    | Display width                 | `vim.fn.strwidth("hello")` → `5`                 |
| `vim.fn.stridx(s, needle)`              | First index of needle         | `vim.fn.stridx("hello", "ll")` → `2`             |
| `vim.fn.strridx(s, needle)`             | Last index of needle          | `vim.fn.strridx("abab", "ab")` → `2`             |
| `vim.fn.strpart(s, start, len?)`        | Substring                     | `vim.fn.strpart("hello", 1, 3)` → `"ell"`        |
| `vim.fn.substitute(s, pat, sub, flags)` | Regex replace                 | `vim.fn.substitute("hi", "h", "H", "")` → `"Hi"` |
| `vim.fn.nr2char(n)`                     | Character from code point     | `vim.fn.nr2char(65)` → `"A"`                     |
| `vim.fn.char2nr(c)`                     | Code point from character     | `vim.fn.char2nr("A")` → `65`                     |
| `vim.fn.split(s, sep?)`                 | List (table) of parts         | `vim.fn.split("a,b", ",")`                       |
| `vim.fn.join(list, sep?)`               | Joined string                 | `vim.fn.join({"a","b"}, "-")` → `"a-b"`          |

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

All other feature strings return `0`. Use `vim.fn.has("obsidian-1.7")` to check for a minimum Obsidian version.

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

## Table and string utilities

A subset of Neovim's `vim.*` utility functions is available for table manipulation, string operations, and debugging.

| Function                             | Description                                                                                                                                          | Example                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `vim.tbl_deep_extend(behavior, ...)` | Recursive table merge. `"force"` = rightmost wins, `"keep"` = leftmost wins, `"error"` = throw on conflict. Lists are atomic (replaced, not merged). | `vim.tbl_deep_extend("force", {a=1}, {a=2, b=3})`       |
| `vim.tbl_extend(behavior, ...)`      | Shallow table merge (same behaviors as above)                                                                                                        | `vim.tbl_extend("force", defaults, opts)`               |
| `vim.tbl_contains(t, value, opts?)`  | Check if table contains value. With `{predicate=true}`, value is called as a function.                                                               | `vim.tbl_contains({1,2,3}, 2)`                          |
| `vim.tbl_keys(t)`                    | Returns list of all keys                                                                                                                             | `vim.tbl_keys({a=1, b=2})`                              |
| `vim.tbl_values(t)`                  | Returns list of all values                                                                                                                           | `vim.tbl_values({a=1, b=2})`                            |
| `vim.tbl_map(fn, t)`                 | Map function over table values                                                                                                                       | `vim.tbl_map(function(v) return v*2 end, {1,2,3})`      |
| `vim.tbl_filter(fn, t)`              | Filter table by predicate                                                                                                                            | `vim.tbl_filter(function(v) return v > 1 end, {1,2,3})` |
| `vim.tbl_count(t)`                   | Count entries in table                                                                                                                               | `vim.tbl_count({a=1, b=2})` → `2`                       |
| `vim.tbl_isempty(t)`                 | Check if table is empty                                                                                                                              | `vim.tbl_isempty({})` → `true`                          |
| `vim.tbl_get(t, ...)`                | Safe nested access                                                                                                                                   | `vim.tbl_get({a={b=42}}, "a", "b")` → `42`              |
| `vim.list_extend(dst, src)`          | Append elements from src to dst                                                                                                                      | `vim.list_extend({1,2}, {3,4})`                         |
| `vim.deepcopy(t)`                    | Deep copy a table                                                                                                                                    | `local copy = vim.deepcopy(original)`                   |
| `vim.split(s, sep, opts?)`           | Split string. `{plain=true}` for literal sep, `{trimempty=true}` to trim empty parts.                                                                | `vim.split("a,b,c", ",")`                               |
| `vim.trim(s)`                        | Strip whitespace from both ends                                                                                                                      | `vim.trim("  hi  ")` → `"hi"`                           |
| `vim.startswith(s, prefix)`          | Check if string starts with prefix                                                                                                                   | `vim.startswith("hello", "hel")` → `true`               |
| `vim.endswith(s, suffix)`            | Check if string ends with suffix                                                                                                                     | `vim.endswith("hello", "lo")` → `true`                  |
| `vim.pesc(s)`                        | Escape Lua pattern special characters                                                                                                                | `vim.pesc("a.b")` → `"a%.b"`                            |
| `vim.inspect(value)`                 | Human-readable string representation of any value. Useful for debugging.                                                                             | `print(vim.inspect({1,2,{nested=true}}))`               |
| `vim.stricmp(a, b)`                  | Case-insensitive string comparison. Returns `-1` (a < b), `0` (equal), or `1` (a > b).                                                               | `vim.stricmp("Hello", "hello")` → `0`                   |

## JSON

| Function                 | Description                     | Example                                |
| ------------------------ | ------------------------------- | -------------------------------------- |
| `vim.json.encode(value)` | Encode Lua value to JSON string | `vim.json.encode({a=1})` → `'{"a":1}'` |
| `vim.json.decode(str)`   | Decode JSON string to Lua value | `vim.json.decode('{"x":42}').x` → `42` |

## Notifications

| Function                       | Description                                                                                       | Example                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `vim.notify(msg, level?)`      | Show notification. Level from `vim.log.levels` (default: INFO). ERROR/WARN show Notice + console. | `vim.notify("Saved!", vim.log.levels.INFO)` |
| `vim.notify_once(msg, level?)` | Same as `vim.notify` but only shows once per message                                              | `vim.notify_once("Migration complete")`     |

### vim.log.levels

| Level                  | Value | Behavior                        |
| ---------------------- | ----- | ------------------------------- |
| `vim.log.levels.TRACE` | 0     | Console only                    |
| `vim.log.levels.DEBUG` | 1     | Console only                    |
| `vim.log.levels.INFO`  | 2     | Obsidian Notice + console       |
| `vim.log.levels.WARN`  | 3     | Obsidian Notice + console.warn  |
| `vim.log.levels.ERROR` | 4     | Obsidian Notice + console.error |
| `vim.log.levels.OFF`   | 5     | No output                       |

## Async and timers

| Function                    | Description                                                                                | Example                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `vim.schedule(fn)`          | Defer function to next event loop iteration. Useful for breaking recursive autocmd loops.  | `vim.schedule(function() vim.g.x = true end)`           |
| `vim.schedule_wrap(fn)`     | Returns a function that wraps `fn` with `vim.schedule`, passing all arguments through.     | `timer:start(100, 0, vim.schedule_wrap(callback))`      |
| `vim.defer_fn(fn, timeout)` | Defer function by `timeout` ms. Returns a handle with `stop()`, `close()`, `is_closing()`. | `vim.defer_fn(function() vim.notify("Done") end, 1000)` |

### vim.uv (timers)

A subset of Neovim's `vim.uv` (libuv bindings) is available for timer operations. `vim.loop` is an alias.

| Function             | Description                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `vim.uv.new_timer()` | Create a timer with `start(delay, repeat, callback)`, `stop()`, `close()`, `is_closing()`, `is_active()` |
| `vim.uv.hrtime()`    | High-resolution time in nanoseconds                                                                      |
| `vim.uv.now()`       | Current time in milliseconds                                                                             |

```lua
-- Debounced autosave
local timer = vim.uv.new_timer()
vim.api.nvim_create_autocmd("FocusLost", {
    callback = function()
        timer:stop()
        timer:start(500, 0, vim.schedule_wrap(function()
            vim.cmd("w")
        end))
    end,
})
```

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

## Buffer-local keymaps

Keymaps can be scoped to specific files using the `buffer` option:

```lua
vim.api.nvim_create_autocmd("BufEnter", {
    pattern = "*.md",
    callback = function()
        vim.keymap.set("n", "gd", function()
            vim.cmd("obcommand editor:follow-link")
        end, { buffer = 0, desc = "Follow link" })
    end,
})
```

Use `buffer = 0` for the current file. Buffer-local keymaps are automatically swapped when switching between files.

> [!info] Buffer numbers
> Obsidian does not use Neovim-style buffer numbers. Only `buffer = 0` (current file) is supported. Positive buffer numbers produce an error.

> [!warning] Keymap accumulation
> When setting buffer-local keymaps inside a `BufEnter` autocmd, always use `nvim_create_augroup` with `{ clear = true }` (as shown above). Without an augroup, each file switch adds another copy of the keymap.

## Buffer content

Read and modify editor content from Lua callbacks:

| Function                                                   | Description                                  | Example                                              |
| ---------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `vim.api.nvim_buf_get_lines(0, start, end, strict)`        | Get lines (0-based, end-exclusive, -1 = EOF) | `vim.api.nvim_buf_get_lines(0, 0, -1, true)`         |
| `vim.api.nvim_buf_set_lines(0, start, end, strict, lines)` | Set lines (empty table = delete)             | `vim.api.nvim_buf_set_lines(0, 0, 0, true, {"new"})` |
| `vim.api.nvim_get_current_buf()`                           | Returns 0 (current buffer)                   | `local buf = vim.api.nvim_get_current_buf()`         |
| `vim.api.nvim_buf_get_name(0)`                             | Vault-relative file path                     | `vim.api.nvim_buf_get_name(0)`                       |
| `vim.api.nvim_buf_line_count(0)`                           | Total line count                             | `vim.api.nvim_buf_line_count(0)`                     |

> [!info] Buffer argument
> Only `buffer = 0` (current buffer) is supported. These functions operate on the active editor.

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

## Autocommands

Vim Motions supports a Neovim-compatible autocommand system for reacting to editor events.

### Supported events

| Event          | When it fires                                           | Pattern support                                       |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `InsertEnter`  | Entering insert or replace mode                         | No                                                    |
| `InsertLeave`  | Leaving insert or replace mode                          | No                                                    |
| `CursorMoved`  | After cursor moves in normal mode                       | No                                                    |
| `CursorHold`   | After cursor is idle for `updatetime` ms (default 4000) | No                                                    |
| `ModeChanged`  | Any mode transition                                     | `"old:new"` with `*` wildcard                         |
| `BufEnter`     | A file becomes the active note                          | Vault-relative path globs (`"*.md"`, `"projects/**"`) |
| `BufLeave`     | A file is deactivated (switching away)                  | Vault-relative path globs                             |
| `BufWritePre`  | Before saving a file                                    | Vault-relative path globs                             |
| `BufWritePost` | After saving a file                                     | Vault-relative path globs                             |
| `LeafEnter`    | A leaf (tab/pane) gains focus (debounced 50ms)          | No                                                    |
| `LeafLeave`    | A leaf (tab/pane) loses focus                           | No                                                    |
| `FileType`     | After `BufEnter` when filetype is detected              | No                                                    |
| `FocusGained`  | Obsidian window gains focus                             | No                                                    |
| `FocusLost`    | Obsidian window loses focus                             | No                                                    |
| `TextYankPost` | After yank, delete, or change operation                 | No                                                    |

> [!tip] CursorHold timing
> Configure the idle timeout with `vim.opt.updatetime = 1000` (milliseconds). Default is 4000ms, matching Neovim.

> [!info] FileType detection
> FileType detection is based on file extension (e.g. `md` → `markdown`, `ts` → `typescript`, `py` → `python`). If a filetype is unknown, the `FileType` event does not fire.

### Usage examples

```lua
-- Augroup with clear (recommended for config reloads)
local g = vim.api.nvim_create_augroup("my-config", { clear = true })

-- Notify on insert mode
vim.api.nvim_create_autocmd("InsertEnter", {
    group = g,
    callback = function()
        vim.notify("Insert mode")
    end,
})

-- Per-folder settings
vim.api.nvim_create_autocmd("BufEnter", {
    group = g,
    pattern = "projects/**",
    callback = function(ev)
        vim.opt.shiftwidth = 4
    end,
})

-- React to mode changes
vim.api.nvim_create_autocmd("ModeChanged", {
    group = g,
    pattern = "*:i",
    callback = function(ev)
        -- ev.data.old_mode and ev.data.new_mode available
    end,
})

-- Auto-save on focus lost
vim.api.nvim_create_autocmd("FocusLost", {
    group = g,
    callback = function()
        vim.cmd("w")
    end,
})

-- Track yank operations
vim.api.nvim_create_autocmd("TextYankPost", {
    group = g,
    callback = function(ev)
        -- ev.data.operator ("y", "d", "c")
        -- ev.data.regcontents (table of lines)
        -- ev.data.regtype ("V" linewise, "v" charwise)
        -- ev.data.regname (register name, e.g. "a", "" for default)
        -- ev.data.visual (boolean)
    end,
})
```

### Callback event data

The callback receives a table with the following fields:

```lua
{
    event = "BufEnter",
    file = "projects/todo.md",  -- vault-relative
    match = "projects/todo.md",
    buf = 0,                    -- always 0
    id = 42,                    -- autocmd ID
    group = 1,                  -- group ID or nil
    data = nil,                 -- event-specific (TextYankPost, ModeChanged)
}
```

For `LeafEnter` and `LeafLeave`, `data` includes `{ type = "markdown", leaf_id = "..." }` and `match` is set to the leaf type. For `FileType`, `match` is the detected filetype (for example, `markdown`).

### Augroup management

```lua
local g = vim.api.nvim_create_augroup("name", { clear = true })
vim.api.nvim_del_autocmd(id)
vim.api.nvim_del_augroup_by_name("name")
vim.api.nvim_clear_autocmds({ group = g, event = "InsertEnter" })
```

### ModeChanged pattern format

- `"n:i"`: normal to insert
- `"*:i"`: any mode to insert
- `"i:*"`: insert to any mode
- `"*:*"`: any transition

## vim.keymap.set options

| Option    | Type           | Default | Description                                                                                                 |
| --------- | -------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `desc`    | string         | (none)  | Description shown in which-key popup                                                                        |
| `noremap` | boolean        | `true`  | Non-recursive mapping                                                                                       |
| `remap`   | boolean        | `false` | Recursive mapping (inverse of `noremap`)                                                                    |
| `silent`  | boolean        | (none)  | Accepted but no effect in Obsidian                                                                          |
| `nowait`  | boolean        | (none)  | Accepted but no effect in Obsidian                                                                          |
| `buffer`  | number/boolean | (none)  | Buffer-local keymap (`0` or `true` = current file). See Buffer-local keymaps above. Non-zero numbers error. |
| `expr`    | (none)         | (none)  | Not supported (throws error)                                                                                |

## Obsidian namespace

Obsidian-specific APIs that don't exist in Neovim. Available as `vim.obsidian` or `vim.ob`.

| Function                        | Returns                                          | Example                                   |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `vim.obsidian.vault_name()`     | Vault name                                       | `vim.obsidian.vault_name()`               |
| `vim.obsidian.app_version()`    | Obsidian version string                          | `vim.obsidian.app_version()`              |
| `vim.obsidian.plugin_version()` | Plugin version string                            | `vim.obsidian.plugin_version()`           |
| `vim.obsidian.run_command(id)`  | Execute Obsidian command by ID                   | `vim.obsidian.run_command("app:reload")`  |
| `vim.obsidian.list_commands()`  | Table of `{id, name}`                            | `vim.obsidian.list_commands()`            |
| `vim.obsidian.open_file(path)`  | Open a vault file                                | `vim.obsidian.open_file("notes/todo.md")` |
| `vim.obsidian.current_file()`   | Table `{path, name, extension, basename}` or nil | `vim.obsidian.current_file().path`        |
| `vim.obsidian.vault_path()`     | Vault absolute path (desktop only)               | `vim.obsidian.vault_path()`               |

### Workspace and leaf management

| Function                         | Returns                               | Example                                       |
| -------------------------------- | ------------------------------------- | --------------------------------------------- |
| `vim.ob.get_active_leaf()`       | Table `{id, type, pinned}`            | `local leaf = vim.ob.get_active_leaf()`       |
| `vim.ob.get_leaf_type()`         | View type string (e.g., `"markdown"`) | `if vim.ob.get_leaf_type() == "pdf" then`     |
| `vim.ob.list_leaves()`           | Table of leaf info tables             | `for _, leaf in ipairs(vim.ob.list_leaves())` |
| `vim.ob.is_markdown_view()`      | Boolean                               | `if vim.ob.is_markdown_view() then`           |
| `vim.ob.get_leaf_for_file(path)` | Leaf info table or nil                | `vim.ob.get_leaf_for_file("note.md")`         |
| `vim.ob.focus(direction)`        | Boolean (success)                     | `vim.ob.focus("right")`                       |
| `vim.ob.split(direction)`        | Boolean (success)                     | `vim.ob.split("vertical")`                    |
| `vim.ob.close_leaf()`            | Boolean (success)                     | `vim.ob.close_leaf()`                         |

### Note operations

| Function                   | Description                     | Example                    |
| -------------------------- | ------------------------------- | -------------------------- |
| `vim.ob.follow_link()`     | Follow link under cursor        | `vim.ob.follow_link()`     |
| `vim.ob.backlinks()`       | Open backlinks for current note | `vim.ob.backlinks()`       |
| `vim.ob.daily()`           | Open today's daily note         | `vim.ob.daily()`           |
| `vim.ob.search()`          | Open global search              | `vim.ob.search()`          |
| `vim.ob.tags()`            | Open tags view                  | `vim.ob.tags()`            |
| `vim.ob.new_note()`        | Create new note                 | `vim.ob.new_note()`        |
| `vim.ob.rename()`          | Rename current note             | `vim.ob.rename()`          |
| `vim.ob.toggle_checkbox()` | Toggle checkbox on current line | `vim.ob.toggle_checkbox()` |
| `vim.ob.template()`        | Open template picker            | `vim.ob.template()`        |

### Global keymaps (`vim.obsidian.keymap`)

Define key bindings for non-editor contexts (graph view, canvas, PDF viewer, file explorer, reading mode). These bindings work when no editor is focused.

| Function                                   | Description                 |
| ------------------------------------------ | --------------------------- |
| `vim.obsidian.keymap.set(lhs, rhs, opts?)` | Create a global key mapping |
| `vim.obsidian.keymap.del(lhs)`             | Remove a global key mapping |

The `rhs` must be either `:obcommand <command-id>` or `:<ex-command>`:

```lua
vim.obsidian.keymap.set("<leader>f", ":obcommand switcher:open", { desc = "Open file" })
vim.obsidian.keymap.set("<leader>e", ":obcommand file-explorer:reveal-active-file", { desc = "Reveal in explorer" })
vim.obsidian.keymap.set("<leader>s", ":sidebar left", { desc = "Toggle sidebar" })

vim.obsidian.keymap.del("<leader>f")
```

The `desc` option automatically creates a label in the global which-key popup.

> [!info] String-only RHS
> Only string commands are supported as RHS (`:obcommand ...` or `:ex-command`). Lua function callbacks are not supported for global keymaps. Use `vim.api.nvim_create_user_command` to define a named command, then reference it.

> [!info] No mode parameter
> Global keymaps are mode-agnostic — they don't use vim modes. The `noremap` option is accepted for compatibility but has no effect.

### Which-key labels (`vim.obsidian.whichkey`)

Set group and command labels for the which-key popup. Labels from `vim.keymap.set`'s `desc` option are applied automatically for editor keymaps, but this API adds group labels, labels for keys you didn't create, and global context labels.

| Function                                             | Description                           |
| ---------------------------------------------------- | ------------------------------------- |
| `vim.obsidian.whichkey.set_group(key, label, opts?)` | Name a which-key group by prefix      |
| `vim.obsidian.whichkey.set_label(key, label, opts?)` | Label an individual which-key binding |
| `vim.obsidian.whichkey.add(entries)`                 | Batch-add group and command labels    |

```lua
vim.obsidian.whichkey.set_group("<leader>t", "Table")
vim.obsidian.whichkey.set_group("<leader>g", "Git")
vim.obsidian.whichkey.set_label("<leader>w", "Save file")

-- For global (non-editor) which-key:
vim.obsidian.whichkey.set_group("<leader>", "+leader", { context = "global" })
vim.obsidian.whichkey.set_label("<leader>f", "Open file", { context = "global" })
```

The `context` option defaults to `"editor"`. Use `{ context = "global" }` for labels in the non-editor which-key overlay.

The `add()` function accepts a table of entries for batch configuration, similar to [which-key.nvim](https://github.com/folke/which-key.nvim)'s `wk.add()`:

```lua
local wk = vim.obsidian.whichkey
wk.add({
    { "<leader>f", group = "Find" },
    { "<leader>g", group = "Git" },
    { "<leader>t", group = "Table" },
    { "<leader>w", desc = "Save file" },
    { "<leader>q", desc = "Close tab" },
})
```

Each entry uses `group` for prefix labels or `desc` for individual binding labels. The `context` and `mode` fields are supported per entry (`mode` is reserved for future use).

See [[which-key#Batch labels (`add()`)]] for details.

### Cursor shapes (`vim.obsidian.cursor`)

Set cursor shapes for each vim mode using a structured table instead of the `guicursor` format string.

| Function                         | Description                                |
| -------------------------------- | ------------------------------------------ |
| `vim.obsidian.cursor.set(table)` | Set cursor shapes (partial tables allowed) |

```lua
vim.obsidian.cursor.set({
    normal = "block",
    insert = "bar",
    visual = "block",
    replace = "underline",
    operator_pending = "underline",
})
```

Valid shapes: `"block"`, `"bar"`, `"underline"`, `"hollow"`. Modes not specified keep their current value. This is equivalent to `vim.opt.guicursor` but uses a table instead of Neovim's format string.

See [[cursor-shapes]] for the full list of modes and shapes.

### Mode prompts (`vim.obsidian.modeprompt`)

Set the status bar mode text for multiple modes in a single call.

| Function                             | Description                               |
| ------------------------------------ | ----------------------------------------- |
| `vim.obsidian.modeprompt.set(table)` | Set mode prompts (partial tables allowed) |

```lua
vim.obsidian.modeprompt.set({
    normal = "NOR",
    insert = "INS",
    visual = "VIS",
    visual_line = "V-LN",
    visual_block = "V-BLK",
})
```

Valid mode keys: `normal`, `insert`, `visual`, `replace`, `visual_line`, `visual_block`, `select`, `vreplace`, `command`, `search`, `insert_normal`. This is equivalent to setting individual `vim.g.mode_prompt_*` variables but allows batch configuration.

See [[status-bar]] for details on status bar customization.

### Custom surround pairs (`vim.obsidian.surround`)

Define custom character-to-delimiter mappings for surround operations (`ys`, `ds`, `cs`).

| Function                                   | Description                          |
| ------------------------------------------ | ------------------------------------ |
| `vim.obsidian.surround.set(trigger, opts)` | Register a custom surround pair      |
| `vim.obsidian.surround.del(trigger)`       | Remove a custom surround pair        |
| `vim.obsidian.surround.add(entries)`       | Batch-register custom surround pairs |

```lua
vim.obsidian.surround.set("l", { left = "[[", right = "]]" })
vim.obsidian.surround.set("m", { left = "$$", right = "$$" })

vim.obsidian.surround.add({
    { "l", left = "[[", right = "]]" },
    { "m", left = "$$", right = "$$" },
    { "e", left = "\\begin{equation}", right = "\\end{equation}" },
})
```

After registration, `ysiw l` wraps a word in `[[word]]`, `ds l` removes surrounding `[[...]]`, and `cs l m` changes `[[...]]` to `$$...$$`.

The trigger must be a single character. Built-in surround characters (`(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`, `b`, `B`, `r`, `a`, `t`, `T`, `f`, `F`, `"`, `'`, `` ` ``) are reserved and cannot be overridden.

> [!info] Fork mode required
> Custom surround pairs require the plugin's bundled fork mode. Disable Obsidian's built-in Vim mode in **Settings → Editor → Vim key bindings** for full support.

### Leader bindings (`vim.obsidian.leader`)

Convenience API for binding leader key sequences to Obsidian commands. Automatically prepends the leader key, adds the `:ob` command prefix, and registers a which-key label from the `desc` option.

| Function                                         | Description                    |
| ------------------------------------------------ | ------------------------------ |
| `vim.obsidian.leader.set(key, commandId, opts?)` | Bind leader+key to a command   |
| `vim.obsidian.leader.del(key)`                   | Remove a leader binding        |
| `vim.obsidian.leader.add(entries)`               | Batch-register leader bindings |

```lua
vim.g.mapleader = " "

vim.obsidian.leader.set("e", "file-explorer:reveal-active-file", { desc = "Reveal in explorer" })
vim.obsidian.leader.set("p", "command-palette:open", { desc = "Command palette" })

vim.obsidian.leader.add({
    { "ff", "switcher:open", desc = "Find file" },
    { "fg", "global-search:open", desc = "Grep" },
    { "t", "daily-notes:open-today", desc = "Today" },
})
```

The second argument is an Obsidian command ID (the same IDs shown by `:ob` with no arguments). For general-purpose keymaps or Lua function callbacks, use `vim.keymap.set` instead.

## Environment variables

`vim.env` provides a sandboxed environment variable proxy:

| Key                        | Value                         |
| -------------------------- | ----------------------------- |
| `vim.env.HOME`             | Vault absolute path (desktop) |
| `vim.env.VIMRUNTIME`       | `"obsidian"`                  |
| `vim.env.VIM`              | `"motions"`                   |
| `vim.env.TERM`             | `"obsidian"`                  |
| `vim.env.OBSIDIAN_VERSION` | Obsidian version string       |
| `vim.env.MYVIMRC`          | `"init.lua"`                  |

Custom variables can be set: `vim.env.MY_VAR = "value"`. Unknown keys return `nil`.

## Mode prompt customization

Customize the text shown in the status bar for each vim mode using `vim.g.mode_prompt_*`:

| Variable                          | Mode            | Default     |
| --------------------------------- | --------------- | ----------- |
| `vim.g.mode_prompt_normal`        | Normal          | `NORMAL`    |
| `vim.g.mode_prompt_insert`        | Insert          | `INSERT`    |
| `vim.g.mode_prompt_visual`        | Visual          | `VISUAL`    |
| `vim.g.mode_prompt_replace`       | Replace         | `REPLACE`   |
| `vim.g.mode_prompt_visual_line`   | Visual Line     | `V-LINE`    |
| `vim.g.mode_prompt_visual_block`  | Visual Block    | `V-BLOCK`   |
| `vim.g.mode_prompt_select`        | Select          | `SELECT`    |
| `vim.g.mode_prompt_vreplace`      | Virtual Replace | `V-REPLACE` |
| `vim.g.mode_prompt_command`       | Command         | `COMMAND`   |
| `vim.g.mode_prompt_search`        | Search          | `SEARCH`    |
| `vim.g.mode_prompt_insert_normal` | Insert-Normal   | `(insert)`  |

```lua
vim.g.mode_prompt_normal = "N"
vim.g.mode_prompt_insert = "I"
vim.g.mode_prompt_visual = "V"
vim.g.mode_prompt_replace = "R"
```

## Highlight groups

Customize plugin styling from Lua using Neovim's `nvim_set_hl` API:

```lua
-- Change EasyMotion label colors
vim.api.nvim_set_hl(0, "EasyMotionTarget", { fg = "#ff5555", bg = "#282a36", bold = true })

-- Change status bar mode colors
vim.api.nvim_set_hl(0, "StatusLineNormal", { bg = "#282a36", fg = "#f8f8f2" })
vim.api.nvim_set_hl(0, "StatusLineInsert", { bg = "#50fa7b", fg = "#282a36" })
```

### Plugin-defined highlight groups

These map directly to plugin UI elements via CSS custom properties:

| Group                | Controls                  |
| -------------------- | ------------------------- |
| `EasyMotionTarget`   | EasyMotion jump labels    |
| `EasyMotionShade`    | EasyMotion dimmed text    |
| `HintTarget`         | Hint mode labels          |
| `StatusLineNormal`   | Normal mode status bar    |
| `StatusLineInsert`   | Insert mode status bar    |
| `StatusLineVisual`   | Visual mode status bar    |
| `StatusLineReplace`  | Replace mode status bar   |
| `StatusLineVLine`    | V-Line mode status bar    |
| `StatusLineVBlock`   | V-Block mode status bar   |
| `StatusLineCommand`  | Command mode status bar   |
| `StatusLineSearch`   | Search mode status bar    |
| `StatusLineSelect`   | Select mode status bar    |
| `StatusLineVReplace` | V-Replace mode status bar |

> [!info] Case-sensitive group names
> Highlight group names are case-sensitive. Use the exact casing shown in the table above (e.g., `EasyMotionTarget`, not `easymotiontarget`). This differs from Neovim, where highlight group names are case-insensitive.

### User-defined highlight groups

Custom groups generate CSS classes (`.vim-hl-GroupName`) that can be used in CSS snippets:

```lua
vim.api.nvim_set_hl(0, "MyHighlight", { fg = "#00ff00", bold = true })
```

### Supported attributes

| Attribute           | Type           | CSS mapping                             |
| ------------------- | -------------- | --------------------------------------- |
| `fg` / `foreground` | string         | `color`                                 |
| `bg` / `background` | string         | `background-color`                      |
| `sp` / `special`    | string         | `text-decoration-color`                 |
| `bold`              | boolean        | `font-weight: bold`                     |
| `italic`            | boolean        | `font-style: italic`                    |
| `underline`         | boolean        | `text-decoration-line: underline`       |
| `undercurl`         | boolean        | `text-decoration: underline wavy`       |
| `underdouble`       | boolean        | `text-decoration: underline double`     |
| `underdotted`       | boolean        | `text-decoration: underline dotted`     |
| `underdashed`       | boolean        | `text-decoration: underline dashed`     |
| `strikethrough`     | boolean        | `text-decoration-line: line-through`    |
| `reverse`           | boolean        | Swaps fg/bg                             |
| `blend`             | number (0-100) | `opacity`                               |
| `link`              | string         | Inherit from another group              |
| `default`           | boolean        | Only apply if group not already defined |
| `update`            | boolean        | Merge with existing (don't replace)     |

> [!info] Namespace
> Only `ns_id = 0` (global namespace) is supported. `vim.api.nvim_create_namespace()` always returns `0`.

> [!info] Underline styles
> Only one underline style can be active per highlight group. If multiple underline attributes (`undercurl`, `underdouble`, `underdotted`, `underdashed`) are set, only the first one takes effect.

## When to use Lua vs Vimrc

- Use **init.lua** (recommended) when you need conditional logic (per-vault config), function-based keymaps, or prefer Neovim-style Lua syntax
- Use **vimrc** for simple key mappings and option settings if you prefer traditional Vimscript syntax
- Both can be used together: init.lua loads after vimrc, and Lua values override vimrc values on conflict

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
> The following Neovim APIs are not available: `require()`, `vim.lsp`, `vim.treesitter`, `vim.ui`, `vim.diagnostic`. Attempting to use them produces a clear error message. `vim.api` is partially supported (`nvim_create_user_command`, `nvim_create_autocmd`, `nvim_create_augroup`, `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds`, `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, and `nvim_buf_del_keymap` work, other functions error with a helpful message). `vim.fn` is partially supported (see above). The Lua runtime is sandboxed: only 6 standard libraries are loaded (`_G`, `string`, `table`, `math`, `coroutine`, `utf8`). The `io`, `os`, `debug`, and `package` libraries are not available. Global functions `load`, `dofile`, `loadfile`, `require`, `rawget`, `rawset`, and `rawequal` are disabled.

## Keymapping mode reference

| Mode string | Context          | Description                    |
| ----------- | ---------------- | ------------------------------ |
| `'n'`       | Normal           | Normal mode mappings           |
| `'i'`       | Insert           | Insert mode mappings           |
| `'v'`       | Visual           | Visual mode (same as `'x'`)    |
| `'x'`       | Visual           | Visual mode (alias for `'v'`)  |
| `'s'`       | Select           | Select mode only               |
| `'o'`       | Operator-pending | Maps to normal mode internally |

> [!info] Difference from Neovim
> In Neovim, `'v'` maps to both visual and select mode. In Vim Motions, `'v'` maps to visual mode only. Use `{"v", "s"}` to map in both visual and select modes.

> [!info] Unsupported modes
> Command-line (`'c'`), terminal (`'t'`), and insert+command (`'!'`) modes are not supported.

Multiple modes can be specified as a table: `vim.keymap.set({"n", "v"}, ...)`.

## Autocmd event data reference

Every autocmd callback receives an event table with these common fields:

| Field   | Type          | Description                     |
| ------- | ------------- | ------------------------------- |
| `event` | string        | Event name (e.g., `"BufEnter"`) |
| `file`  | string        | Vault-relative file path        |
| `match` | string        | Pattern match string            |
| `buf`   | number        | Buffer number (always `0`)      |
| `id`    | number        | Autocmd ID                      |
| `group` | number or nil | Augroup ID (nil if no group)    |
| `data`  | table or nil  | Event-specific data (see below) |

### Per-event data fields

Most events set `data = nil`. Only these events provide event-specific data:

**TextYankPost**:

| Field         | Type    | Description                                   |
| ------------- | ------- | --------------------------------------------- |
| `operator`    | string  | Operator used (`"y"`, `"d"`, `"c"`)           |
| `regcontents` | table   | Table of yanked lines                         |
| `regtype`     | string  | `"V"` (linewise), `"v"` (charwise)            |
| `regname`     | string  | Register name (e.g., `"a"`, `""` for default) |
| `visual`      | boolean | Whether the yank was from visual mode         |

**ModeChanged**:

| Field      | Type   | Description            |
| ---------- | ------ | ---------------------- |
| `old_mode` | string | Mode before transition |
| `new_mode` | string | Mode after transition  |

All other events (`InsertEnter`, `InsertLeave`, `CursorMoved`, `CursorHold`, `BufEnter`, `BufLeave`, `BufWritePre`, `BufWritePost`, `FocusGained`, `FocusLost`): `data = nil`.

## Highlight group CSS reference

Plugin-defined highlight groups map to CSS custom properties. User-defined groups generate CSS classes.

### Plugin groups → CSS variables

| Group                | CSS variable             | Controls                  |
| -------------------- | ------------------------ | ------------------------- |
| `EasyMotionTarget`   | `--vim-motions-em`       | EasyMotion jump labels    |
| `EasyMotionShade`    | `--vim-motions-em-shade` | EasyMotion dimmed text    |
| `HintTarget`         | `--vim-motions-hint`     | Hint mode labels          |
| `StatusLineNormal`   | `--vim-pl-normal`        | Normal mode status bar    |
| `StatusLineInsert`   | `--vim-pl-insert`        | Insert mode status bar    |
| `StatusLineVisual`   | `--vim-pl-visual`        | Visual mode status bar    |
| `StatusLineReplace`  | `--vim-pl-replace`       | Replace mode status bar   |
| `StatusLineVLine`    | `--vim-pl-v-line`        | V-Line mode status bar    |
| `StatusLineVBlock`   | `--vim-pl-v-block`       | V-Block mode status bar   |
| `StatusLineCommand`  | `--vim-pl-command`       | Command mode status bar   |
| `StatusLineSearch`   | `--vim-pl-search`        | Search mode status bar    |
| `StatusLineSelect`   | `--vim-pl-select`        | Select mode status bar    |
| `StatusLineVReplace` | `--vim-pl-vreplace`      | V-Replace mode status bar |

Plugin groups update CSS custom properties on the document root (`:root`). For example, setting `fg` on `StatusLineNormal` updates `--vim-pl-normal-fg`.

### User-defined groups

Custom highlight groups generate a CSS class `.vim-hl-{GroupName}`. Use these in CSS snippets to style custom elements:

```lua
vim.api.nvim_set_hl(0, "MyHighlight", { fg = "#00ff00", bold = true })
-- Generates: .vim-hl-MyHighlight { color: #00ff00; font-weight: bold }
```

### Attribute → CSS property mapping

| Attribute       | CSS property                         |
| --------------- | ------------------------------------ |
| `fg`            | `color`                              |
| `bg`            | `background-color`                   |
| `sp`            | `text-decoration-color`              |
| `bold`          | `font-weight: bold`                  |
| `italic`        | `font-style: italic`                 |
| `underline`     | `text-decoration-line: underline`    |
| `undercurl`     | `text-decoration: underline wavy`    |
| `underdouble`   | `text-decoration: underline double`  |
| `underdotted`   | `text-decoration: underline dotted`  |
| `underdashed`   | `text-decoration: underline dashed`  |
| `strikethrough` | `text-decoration-line: line-through` |
| `reverse`       | Swaps fg/bg values                   |
| `blend`         | `opacity` (0–100 → 0.0–1.0)          |
| `link`          | Inherit from another group           |
| `default`       | Only apply if group not defined      |
| `update`        | Merge with existing (don't replace)  |

## Lua sandbox reference

The Lua runtime runs in a sandboxed Lua 5.3 environment ([fengari](https://github.com/saberzero1/fengari)).

### Available standard libraries

Only 6 standard libraries are loaded:

| Library     | Description                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `_G` (base) | Core functions (`type`, `tostring`, `tonumber`, `pcall`, `xpcall`, `error`, `select`, `pairs`, `ipairs`, `next`, `unpack`, `assert`) |
| `string`    | String manipulation (`format`, `find`, `gsub`, `sub`, `rep`, `byte`, `char`, `len`, `lower`, `upper`, `match`, `gmatch`, `reverse`)  |
| `table`     | Table manipulation (`insert`, `remove`, `sort`, `concat`, `move`, `pack`, `unpack`)                                                  |
| `math`      | Math functions (`floor`, `ceil`, `abs`, `max`, `min`, `random`, `sqrt`, `sin`, `cos`, `pi`, `huge`, etc.)                            |
| `coroutine` | Coroutine support (`create`, `resume`, `yield`, `wrap`, `status`)                                                                    |
| `utf8`      | UTF-8 support (`char`, `codepoint`, `codes`, `len`, `offset`, `charpattern`)                                                         |

### Not available

| Library/function               | Reason                                  |
| ------------------------------ | --------------------------------------- |
| `io`                           | Stripped from fork (file system access) |
| `os`                           | Not loaded by plugin (security)         |
| `debug`                        | Not loaded by plugin (security)         |
| `package` / `require()`        | Stripped from fork (no module system)   |
| `load`, `dofile`, `loadfile`   | Disabled (no code loading)              |
| `rawget`, `rawset`, `rawequal` | Disabled (sandbox integrity)            |

> [!info] Fork vs plugin
> The [fengari fork](https://github.com/saberzero1/fengari) retains browser-safe `os` functions (`os.date`, `os.time`, etc.) and the `debug` library in its compiled VM. However, the plugin's sandbox deliberately does not load these libraries. Only the 6 libraries listed above are available to Lua scripts.

### Execution limits

- **Instruction limit**: 1,000,000 Lua VM instructions per execution. Scripts exceeding this limit are terminated with a timeout error.
- **Error handling**: Syntax errors and runtime errors are caught and displayed as an Obsidian Notice. The plugin continues to load normally.

## Error handling

Syntax errors and runtime errors show an Obsidian Notice with the error message. The plugin continues to load normally. Check the developer console for details.
