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

### Shared config across vaults (desktop only)

Two ways to share one `init.lua` across multiple vaults on desktop:

**Option A — Global config search toggle**: Enable **Settings → Vim Motions → Vimrc & key bindings → Search global config directory**. The plugin will automatically search the Obsidian user data folder after exhausting vault-root candidates:

- `~/.config/obsidian/` (Linux)
- `~/Library/Application Support/obsidian/` (macOS)
- `%APPDATA%\obsidian\` (Windows)

Place your `init.lua` in the appropriate directory and it will be found automatically. Vault-root files always take priority.

**Option B — Custom absolute path**: Set an absolute path in **Settings → Vim Motions → Vimrc & key bindings → Custom init.lua path**:

- `~/.config/obsidian/init.lua` (Linux)
- `~/Library/Application Support/obsidian/init.lua` (macOS)
- `C:\Users\<you>\.config\obsidian\init.lua` (Windows)

Any path starting with `/`, `~`, or a drive letter is read directly from the filesystem instead of through the vault.

Neither option is available on mobile.

> [!tip] Obsidian Sync
> Obsidian Sync skips dotfiles. Use a non-dotfile name like `init.lua` (the first candidate in the fallback chain) to ensure your Lua config syncs across devices.

## Multi-file configs with require()

Split your configuration across multiple files by placing Lua modules in a `lua/` directory at the vault root. The plugin supports both `lua/name.lua` and `lua/name/init.lua` patterns:

```
<vault>/
  lua/
    keymaps.lua
    utils/
      strings.lua
    plugin/
      init.lua
  init.lua
```

```lua
-- init.lua
local keymaps = require("keymaps")      -- loads lua/keymaps.lua
local strings = require("utils.strings") -- loads lua/utils/strings.lua
local plugin  = require("plugin")        -- loads lua/plugin/init.lua

keymaps.setup()
```

```lua
-- lua/keymaps.lua
local M = {}

function M.setup()
    vim.g.mapleader = " "
    vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save" })
end

return M
```

Modules are cached in `package.loaded` — calling `require("keymaps")` twice returns the same table. `load(chunk)` is available for dynamic string compilation. `dofile` and `loadfile` remain disabled.

Security: module names containing `..`, absolute paths (`/`, `\`), or null bytes are rejected.

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

## Soft-reload

The Lua configuration file is watched for changes. When you save the file, the old Lua state is torn down and the file is re-executed without reloading the plugin. This allows for rapid iteration on your configuration.

You can also manually trigger a reload of all configuration files (both Lua and vimrc) using the **Vim Motions: Reload configuration** command from the Obsidian command palette.

## External editor (desktop only)

On desktop, you can open your active configuration files in your system's default external editor using the **Vim Motions: Open configuration in default editor** command. This will open both `init.lua` and `.obsidian.vimrc` if both are enabled and found.

## Supported APIs

| API                                                  | Description                                        | Example                                     |
| ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `vim.opt.<name> = value`                             | Set a plugin option (string options accept tables) | `vim.opt.scrolloff = 8`                     |
| `vim.o.<name> = value`                               | Alias for `vim.opt`                                | `vim.o.scrolloff = 8`                       |
| `vim.o.operatorfunc`                                 | Function called by the `g@` operator               | see Custom operators                        |
| `vim.g.mapleader`                                    | Set the leader key                                 | `vim.g.mapleader = " "`                     |
| `vim.g.<name> = value`                               | Set a user variable                                | `vim.g.my_var = true`                       |
| `vim.cmd(string)`                                    | Execute an ex command                              | `vim.cmd("set nohlsearch")`                 |
| `vim.vault_name()`                                   | Returns the current vault name                     | `if vim.vault_name() == "work" then`        |
| `vim.fn.has(feature)`                                | Platform/feature detection                         | `vim.fn.has("mac")`                         |
| `vim.fn.expand(expr)`                                | Active file path (vault-relative)                  | `vim.fn.expand("%:t")`                      |
| `vim.fn.fnamemodify(path, mods)`                     | Path manipulation                                  | `vim.fn.fnamemodify(path, ":t:r")`          |
| `vim.fn.exists(expr)`                                | Check variable/option existence                    | `vim.fn.exists("g:my_var")`                 |
| `vim.fn.localtime()`                                 | Unix timestamp                                     | `vim.fn.localtime()`                        |
| `vim.fn.strftime(fmt)`                               | Format date/time                                   | `vim.fn.strftime("%Y-%m-%d")`               |
| `vim.fn.filereadable(path)`                          | Check vault file exists                            | `vim.fn.filereadable("config.md")`          |
| `vim.fn.isdirectory(path)`                           | Check vault directory exists                       | `vim.fn.isdirectory("templates")`           |
| `vim.fn.glob(pattern)`                               | Find matching vault files                          | `vim.fn.glob("*.md")`                       |
| `vim.fn.undotree()`                                  | Returns undo tree dictionary                       | `local tree = vim.fn.undotree()`            |
| `vim.fn.mode()`                                      | Current vim mode                                   | `vim.fn.mode()`                             |
| `vim.fn.line(expr)`                                  | Cursor line (1-based, callbacks)                   | `vim.fn.line(".")`                          |
| `vim.fn.col(expr)`                                   | Cursor column (1-based, callbacks)                 | `vim.fn.col(".")`                           |
| `vim.fn.setreg(regname, value [, opts])`             | Set register content                               | `vim.fn.setreg('"', "text")`                |
| `vim.fn.getreg(regname)`                             | Get register content                               | `vim.fn.getreg('"')`                        |
| `vim.fn.getpos(expr)`                                | Get position `[buf, lnum, col, off]`               | `vim.fn.getpos("'[")`                       |
| `vim.fn.cursor(lnum, col)`                           | Move cursor                                        | `vim.fn.cursor(5, 1)`                       |
| `vim.notify(msg)`                                    | Show Obsidian notification                         | `vim.notify("Saved!")`                      |
| `vim.api.nvim_create_user_command(name, cmd, opts)`  | Define custom ex command                           | see below                                   |
| `vim.api.nvim_create_autocmd(event, opts)`           | Register autocommand                               | see Autocommands section                    |
| `vim.api.nvim_create_augroup(name, opts)`            | Create/get autocommand group                       | see Autocommands section                    |
| `vim.keymap.set(mode, lhs, rhs, opts?)`              | Create a key mapping                               | see example above                           |
| `vim.keymap.del(mode, lhs)`                          | Remove a key mapping                               | `vim.keymap.del("n", "Q")`                  |
| `vim.obsidian.keymap.set(lhs, rhs, opts?)`           | Create a global (non-editor) keymap                | see Obsidian namespace                      |
| `vim.obsidian.keymap.del(lhs)`                       | Remove a global keymap                             | see Obsidian namespace                      |
| `vim.obsidian.pick(source, opts?)`                   | Open the unified picker                            | `vim.obsidian.pick("files")`                |
| `vim.obsidian.whichkey.set_group(key, label, opts?)` | Name a which-key group                             | see Obsidian namespace                      |
| `vim.obsidian.whichkey.set_label(key, label, opts?)` | Label a which-key binding                          | see Obsidian namespace                      |
| `vim.obsidian.whichkey.add(entries)`                 | Batch-add group and command labels                 | see Obsidian namespace                      |
| `vim.obsidian.oil.parent()`                          | Oil: navigate to parent directory                  | see Obsidian namespace                      |
| `vim.obsidian.oil.open_entry()`                      | Oil: open file/directory under cursor              | see Obsidian namespace                      |
| `vim.obsidian.pick_keymap(table)`                    | Configure picker keyboard shortcuts                | see Obsidian namespace                      |
| `vim.obsidian.im.get()`                              | Get current IM identifier (desktop only)           | see Obsidian namespace                      |
| `vim.obsidian.im.set(id)`                            | Switch to specific IM (desktop only)               | see Obsidian namespace                      |
| `vim.obsidian.im.save()`                             | Save current IM for active editor view             | see Obsidian namespace                      |
| `vim.plugins.add(spec)`                              | Register a Neovim plugin                           | see Plugin management                       |
| `vim.plugins.list()`                                 | List registered plugins                            | `for _, p in ipairs(vim.plugins.list()) do` |

## Custom operators

The `g@` operator calls a function stored in `vim.o.operatorfunc`. The function receives a string argument indicating the motion type: `'line'`, `'char'`, or `'block'`.

The range covered by the motion is marked by the `'[` and `']` marks.

```lua
vim.o.operatorfunc = function(type)
    local start_pos = vim.fn.getpos("'[")
    local end_pos = vim.fn.getpos("']")
    print("Operator called with type:", type)
    print("Range:", start_pos[2], start_pos[3], "to", end_pos[2], end_pos[3])
end

vim.keymap.set("n", "gz", "g@", { desc = "Custom operator" })
```

## vim.textobject

Define custom text objects from Lua configuration.

### vim.gen_spec.pair(open, close, opts?)

Creates a text object spec for delimiter pairs.

- `open` (string) — Opening delimiter (e.g., `"(("`, `"**"`, `"<"`)
- `close` (string) — Closing delimiter (e.g., `"))"`, `"**"`, `">"`)
- `opts.multiline` (boolean, default `true`) — Search across multiple lines

### vim.textobject.add(keys, spec)

Register a custom text object.

- `keys` (string) — Keybinding, must start with `i` (inner) or `a` (around), e.g., `"iX"`, `"a<"`
- `spec` — A spec table from `vim.gen_spec.*`

### vim.textobject.del(keys)

Remove a previously registered text object.

### Examples

```lua
-- Custom angle bracket text object
vim.textobject.add('i<', vim.gen_spec.pair('<', '>'))
vim.textobject.add('a<', vim.gen_spec.pair('<', '>'))

-- Custom double-asterisk text object
vim.textobject.add('iB', vim.gen_spec.pair('**', '**'))
vim.textobject.add('aB', vim.gen_spec.pair('**', '**'))

-- Single-line only
vim.textobject.add('iP', vim.gen_spec.pair('(', ')', { multiline = false }))
```

### Leader key

Set the leader key with `vim.g.mapleader`. Common choices:

```lua
vim.g.mapleader = " "   -- Space (recommended, matches most Neovim configs)
vim.g.mapleader = ","   -- Comma
vim.g.mapleader = "\\"  -- Backslash (default)
```

> [!warning] Set mapleader before keymaps
> Always set `vim.g.mapleader` before any `vim.keymap.set` or `vim.obsidian.leader.add` calls.
> The leader key is substituted at registration time — changing it later won't update existing mappings.

## `vim.v` — Predefined variables

Neovim-compatible read-only predefined variables. Available in keymap callbacks and autocmds.

#### Core variables (available in keymap callbacks)

| Variable         | Type    | Description                                                                      | Default |
| ---------------- | ------- | -------------------------------------------------------------------------------- | ------- |
| `vim.v.count`    | integer | Count given for the last Normal mode command. 0 when no count typed.             | `0`     |
| `vim.v.count1`   | integer | Like `count` but defaults to 1 when no count given.                              | `1`     |
| `vim.v.register` | string  | Register in effect for the current command. `'"'` (unnamed) when none specified. | `'"'`   |
| `vim.v.operator` | string  | Pending operator (e.g., `'d'`, `'y'`, `'c'`). Empty string when none.            | `''`    |

#### Search & mode variables

| Variable              | Type    | R/W | Description                                                          |
| --------------------- | ------- | --- | -------------------------------------------------------------------- |
| `vim.v.searchforward` | integer | R/W | Search direction: `1` forward, `0` backward                          |
| `vim.v.insertmode`    | string  | R   | Insert mode type: `'i'` insert, `'r'` replace, `'v'` virtual replace |
| `vim.v.hlsearch`      | integer | R   | Whether search highlighting is active                                |

#### Constants

| Variable           | Type    | Value               | Description                  |
| ------------------ | ------- | ------------------- | ---------------------------- |
| `vim.v.numbermax`  | integer | `9007199254740991`  | Maximum integer (53-bit)     |
| `vim.v.numbermin`  | integer | `-9007199254740991` | Minimum integer (53-bit)     |
| `vim.v.numbersize` | integer | `53`                | Number of bits in an integer |
| `vim.v.true`       | boolean | `true`              | Boolean true                 |
| `vim.v.false`      | boolean | `false`             | Boolean false                |
| `vim.v.null`       | nil     | `nil`               | Null value                   |

#### Context-dependent variables

These are only meaningful within specific evaluation contexts (fold expressions, statuscolumn, autocmds):

| Variable           | Type      | R/W | Context                 |
| ------------------ | --------- | --- | ----------------------- |
| `vim.v.foldstart`  | integer   | R   | Fold text evaluation    |
| `vim.v.foldend`    | integer   | R   | Fold text evaluation    |
| `vim.v.foldlevel`  | integer   | R   | Fold text evaluation    |
| `vim.v.folddashes` | string    | R   | Fold text evaluation    |
| `vim.v.lnum`       | integer   | R   | statuscolumn evaluation |
| `vim.v.relnum`     | integer   | R   | statuscolumn evaluation |
| `vim.v.virtnum`    | integer   | R   | statuscolumn evaluation |
| `vim.v.char`       | string    | R/W | `InsertCharPre` autocmd |
| `vim.v.event`      | table/nil | R   | Autocmd event data      |

#### Example: expr mapping with count

```lua
-- Use gj/gk for screen-line movement, j/k for counted movement
vim.keymap.set('n', 'j', function()
    if vim.v.count == 0 then
        return 'gj'
    else
        return vim.v.count1 .. 'j'
    end
end, { expr = true, silent = true })

vim.keymap.set('n', 'k', function()
    if vim.v.count == 0 then
        return 'gk'
    else
        return vim.v.count1 .. 'k'
    end
end, { expr = true, silent = true })
```

> [!info] Count is not auto-forwarded to expr mapping results
> Count is not auto-forwarded to expr mapping results. If you type `3j` and your expr callback returns `'j'`, it executes once. Concatenate the count yourself: `return vim.v.count1 .. 'j'`.

## Supported vim.opt options

All plugin options are available via `vim.opt`. `vim.o` is an alias.

| Option                       | Type    | Default                                           | Valid range / values                                                                     | Example                                            |
| ---------------------------- | ------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `textobjects`                | boolean | `true`                                            |                                                                                          | `vim.opt.textobjects = true`                       |
| `replacewithregister`        | boolean | `true`                                            |                                                                                          | `vim.opt.replacewithregister = true`               |
| `navigation`                 | boolean | `true`                                            |                                                                                          | `vim.opt.navigation = true`                        |
| `hardwrap`                   | boolean | `true`                                            |                                                                                          | `vim.opt.hardwrap = true`                          |
| `listcontinuation`           | boolean | `true`                                            |                                                                                          | `vim.opt.listcontinuation = true`                  |
| `tablenav`                   | boolean | `true`                                            |                                                                                          | `vim.opt.tablenav = true`                          |
| `workspacenav`               | boolean | `true`                                            |                                                                                          | `vim.opt.workspacenav = true`                      |
| `number`                     | boolean | `false`                                           |                                                                                          | `vim.opt.number = true`                            |
| `relativenumber`             | boolean | `false`                                           |                                                                                          | `vim.opt.relativenumber = true`                    |
| `flash`                      | boolean | `true`                                            |                                                                                          | `vim.opt.flash = true`                             |
| `flashmultiline`             | boolean | `true`                                            |                                                                                          | `vim.opt.flashmultiline = true`                    |
| `flashjump`                  | boolean | `false`                                           |                                                                                          | `vim.opt.flashjump = true`                         |
| `flashcleverf`               | boolean | `false`                                           |                                                                                          | `vim.opt.flashcleverf = true`                      |
| `flashsearch`                | boolean | `true`                                            |                                                                                          | `vim.opt.flashsearch = true`                       |
| `labelmatchfontsize`         | boolean | `false`                                           |                                                                                          | `vim.opt.labelmatchfontsize = true`                |
| `easymotion`                 | boolean | `true`                                            |                                                                                          | `vim.opt.easymotion = true`                        |
| `easymotiondimming`          | boolean | `true`                                            |                                                                                          | `vim.opt.easymotiondimming = true`                 |
| `hintmode`                   | boolean | `true`                                            |                                                                                          | `vim.opt.hintmode = true`                          |
| `statusbar`                  | boolean | `true`                                            |                                                                                          | `vim.opt.statusbar = true`                         |
| `chorddisplay`               | boolean | `true`                                            |                                                                                          | `vim.opt.chorddisplay = true`                      |
| `powerline`                  | boolean | `false`                                           |                                                                                          | `vim.opt.powerline = true`                         |
| `expandtab`                  | boolean | `true`                                            |                                                                                          | `vim.opt.expandtab = true`                         |
| `cursorline`                 | boolean | `true`                                            |                                                                                          | `vim.opt.cursorline = true`                        |
| `foldcolumn`                 | boolean | `false`                                           |                                                                                          | `vim.opt.foldcolumn = true`                        |
| `undotree`                   | boolean | `true`                                            |                                                                                          | `vim.opt.undotree = true`                          |
| `undofile`                   | boolean | `false`                                           |                                                                                          | `vim.opt.undofile = true`                          |
| `vimtextareas`               | boolean | `false`                                           |                                                                                          | `vim.opt.vimtextareas = true`                      |
| `yankring`                   | boolean | `true`                                            |                                                                                          | `vim.opt.yankring = true`                          |
| `harpoon`                    | boolean | `true`                                            |                                                                                          | `vim.opt.harpoon = true`                           |
| `dial`                       | boolean | `false`                                           |                                                                                          | `vim.opt.dial = true`                              |
| `jumplist`                   | boolean | `true`                                            |                                                                                          | `vim.opt.jumplist = true`                          |
| `foldawarenavigation`        | boolean | `true`                                            |                                                                                          | `vim.opt.foldawarenavigation = true`               |
| `foldopen`                   | string  | `block,hor,mark,percent,search,undo`              | `fdo`                                                                                    | `vim.opt.foldopen = "block,hor,search"`            |
| `foldpersistence`            | boolean | `false`                                           |                                                                                          | `vim.opt.foldpersistence = true`                   |
| `subword`                    | boolean | `false`                                           |                                                                                          | `vim.opt.subword = true`                           |
| `picker`                     | boolean | `true`                                            |                                                                                          | `vim.opt.picker = true`                            |
| `pickerleadermappings`       | boolean | `true`                                            |                                                                                          | `vim.opt.pickerleadermappings = true`              |
| `pickeromnisearch`           | boolean | `false`                                           |                                                                                          | `vim.opt.pickeromnisearch = true`                  |
| `pickertasks`                | boolean | `false`                                           |                                                                                          | `vim.opt.pickertasks = true`                       |
| `pickerdataview`             | boolean | `false`                                           |                                                                                          | `vim.opt.pickerdataview = true`                    |
| `ripgrep`                    | boolean | `false`                                           |                                                                                          | `vim.opt.ripgrep = true`                           |
| `oil`                        | boolean | `false`                                           |                                                                                          | `vim.opt.oil = true`                               |
| `oilhiddenfiles`             | boolean | `false`                                           |                                                                                          | `vim.opt.oilhiddenfiles = true`                    |
| `undotreeautoopen`           | boolean | `false`                                           |                                                                                          | `vim.opt.undotreeautoopen = true`                  |
| `imswitching`                | boolean | `false`                                           |                                                                                          | `vim.opt.imswitching = true`                       |
| `pcre`                       | boolean | `true`                                            |                                                                                          | `vim.opt.pcre = false`                             |
| `ignorecase`                 | boolean | `true`                                            | `ic`                                                                                     | `vim.opt.ignorecase = false`                       |
| `smartcase`                  | boolean | `true`                                            | `scs`                                                                                    | `vim.opt.smartcase = false`                        |
| `hlsearch`                   | boolean | `true`                                            | `hls`                                                                                    | `vim.opt.hlsearch = false`                         |
| `incsearch`                  | boolean | `true`                                            | `is`                                                                                     | `vim.opt.incsearch = false`                        |
| `wrapscan`                   | boolean | `true`                                            | `ws`                                                                                     | `vim.opt.wrapscan = false`                         |
| `gdefault`                   | boolean | `false`                                           | `gd`                                                                                     | `vim.opt.gdefault = true`                          |
| `startofline`                | boolean | `true`                                            | `sol`                                                                                    | `vim.opt.startofline = false`                      |
| `joinspaces`                 | boolean | `false`                                           | `js`                                                                                     | `vim.opt.joinspaces = true`                        |
| `shiftround`                 | boolean | `false`                                           | `sr`                                                                                     | `vim.opt.shiftround = true`                        |
| `whichwrap`                  | string  | `"b,s"`                                           | `ww`                                                                                     | `vim.opt.whichwrap = "b,s,h,l"`                    |
| `virtualedit`                | string  | `""`                                              | `ve` — `""`, `"onemore"`, `"all"`, `"block"`, `"insert"`                                 | `vim.opt.virtualedit = "onemore"`                  |
| `nrformats`                  | string  | `"bin,hex"`                                       | `nf` — `"bin"`, `"hex"`, `"octal"`                                                       | `vim.opt.nrformats = "bin,hex,octal"`              |
| `smoothcursor`               | boolean | `false`                                           |                                                                                          | `vim.opt.smoothcursor = true`                      |
| `smoothcursorglide`          | boolean | `true`                                            |                                                                                          | `vim.opt.smoothcursorglide = true`                 |
| `smoothcursorsmear`          | boolean | `true`                                            |                                                                                          | `vim.opt.smoothcursorsmear = true`                 |
| `scrolloff`                  | number  | `5`                                               | 0–9999                                                                                   | `vim.opt.scrolloff = 8`                            |
| `scanlimit`                  | number  | `20`                                              | 5–200                                                                                    | `vim.opt.scanlimit = 20`                           |
| `undotreemaxnodes`           | number  | `1000`                                            | 100–5000                                                                                 | `vim.opt.undotreemaxnodes = 500`                   |
| `jumplistsize`               | number  | `200`                                             | > 0                                                                                      | `vim.opt.jumplistsize = 100`                       |
| `yankhighlightduration`      | number  | `200`                                             | 0–5000 ms                                                                                | `vim.opt.yankhighlightduration = 300`              |
| `labelfontsize`              | number  | `14`                                              | 10–20                                                                                    | `vim.opt.labelfontsize = 14`                       |
| `tabstop`                    | number  | `4`                                               |                                                                                          | `vim.opt.tabstop = 4`                              |
| `shiftwidth`                 | number  | `4`                                               |                                                                                          | `vim.opt.shiftwidth = 4`                           |
| `textwidth`                  | number  | `80`                                              |                                                                                          | `vim.opt.textwidth = 80`                           |
| `insertmodeescapetimeout`    | number  | `1000`                                            | 100–5000 ms                                                                              | `vim.opt.insertmodeescapetimeout = 1000`           |
| `operatorshadowtimeout`      | number  | `1000`                                            | 0–5000 ms (0 = disabled). Aliases: `ost`, `timeoutlen`, `tm`                             | `vim.opt.operatorshadowtimeout = 1000`             |
| `numberwidth`                | number  | `2`                                               | 1–20                                                                                     | `vim.opt.numberwidth = 2`                          |
| `smoothcursorsmoothness`     | number  | `0.5`                                             | 0–1                                                                                      | `vim.opt.smoothcursorsmoothness = 0.3`             |
| `smoothcursorstiffness`      | number  | `0.6`                                             | 0.1–1                                                                                    | `vim.opt.smoothcursorstiffness = 0.6`              |
| `smoothcursortrailstiffness` | number  | `0.3`                                             | 0.1–1                                                                                    | `vim.opt.smoothcursortrailstiffness = 0.3`         |
| `smoothcursordamping`        | number  | `0.85`                                            | 0.1–0.99                                                                                 | `vim.opt.smoothcursordamping = 0.85`               |
| `smoothcursormaxlength`      | number  | `400`                                             | 50–800 px                                                                                | `vim.opt.smoothcursormaxlength = 400`              |
| `clipboard`                  | string  | `""`                                              | `""`, `"unnamed"`, `"unnamedplus"`                                                       | `vim.opt.clipboard = "unnamedplus"`                |
| `insertmodeescape`           | string  | `""`                                              |                                                                                          | `vim.opt.insertmodeescape = "jk"`                  |
| `flashjumpkey`               | string  | `"s"`                                             |                                                                                          | `vim.opt.flashjumpkey = "s"`                       |
| `flashminpatternlength`      | number  | `1`                                               | 0–10                                                                                     | `vim.opt.flashminpatternlength = 2`                |
| `easymotionlabels`           | string  | `"asdghklqwertyuiopzxcvbnmfj"`                    |                                                                                          | `vim.opt.easymotionlabels = "asdf"`                |
| `hintlabels`                 | string  | `"asdfghjkl"`                                     |                                                                                          | `vim.opt.hintlabels = "asdf"`                      |
| `yankhighlightmode`          | string  | `"solid"`                                         | `"off"`, `"solid"`, `"fade"`                                                             | `vim.opt.yankhighlightmode = "fade"`               |
| `tablewidget`                | string  | `"native"`                                        | `"native"`, `"raw"`                                                                      | `vim.opt.tablewidget = "native"`                   |
| `whichkey`                   | string  | `"off"`                                           | `"off"`, `"leader"`, `"all"`                                                             | `vim.opt.whichkey = "leader"`                      |
| `whichkeygrouping`           | string  | `"grouped"`                                       | `"flat"`, `"grouped"`                                                                    | `vim.opt.whichkeygrouping = "grouped"`             |
| `whichkeysort`               | string  | `"which-key"`                                     | `"which-key"`, `"groups-first"`                                                          | `vim.opt.whichkeysort = "which-key"`               |
| `whichkeyicons`              | boolean | `true`                                            |                                                                                          | `vim.opt.whichkeyicons = true`                     |
| `whichkeydelay`              | number  | `500`                                             | 0–2000 ms                                                                                | `vim.opt.whichkeydelay = 300`                      |
| `workspacenavviewtypes`      | string  | `""`                                              | Comma-separated view types (defaults: markdown, graph, pdf, canvas, empty, image, bases) | `vim.opt.workspacenavviewtypes = "markdown,graph"` |
| `guicursor`                  | string  | `"n:block,i:bar,v:block,r:underline,o:underline"` | see Cursor shapes                                                                        | `vim.opt.guicursor = "n:bar,i:block"`              |
| `cursorlineopt`              | string  | `"number"`                                        | `"number"`, `"line"`, `"both"`                                                           | `vim.opt.cursorlineopt = "both"`                   |
| `signcolumn`                 | string  | `"auto"`                                          | `"auto[:N]"`, `"yes[:N]"`, `"no"`                                                        | `vim.opt.signcolumn = "auto:3"`                    |
| `linenumbermode`             | string  | `"hybrid"`                                        | `"hybrid"`, `"dual"`, `"dual-rel-abs"`                                                   | `vim.opt.linenumbermode = "dual"`                  |
| `statuscolumn`               | string  | `""`                                              | format string (`%l`, `%r`, `%s`, `%C`, `%=`)                                             | `vim.opt.statuscolumn = "%s %l %r %C"`             |
| `oilconfirmdeletethreshold`  | number  | `1`                                               | 0–100                                                                                    | `vim.opt.oilconfirmdeletethreshold = 10`           |
| `updatetime`                 | number  | `4000`                                            | ms (CursorHold delay)                                                                    | `vim.opt.updatetime = 4000`                        |
| `pickermatcher`              | string  | `"ufuzzy"`                                        | `"ufuzzy"`, `"obsidian"`                                                                 | `vim.opt.pickermatcher = "obsidian"`               |
| `ripgreppath`                | string  | `""`                                              |                                                                                          | `vim.opt.ripgreppath = "/usr/bin/rg"`              |
| `ripgrepargs`                | string  | `""`                                              |                                                                                          | `vim.opt.ripgrepargs = "--hidden"`                 |
| `grepmode`                   | string  | `"ripgrep"`                                       | `"ripgrep"`, `"grep"`                                                                    | `vim.opt.grepmode = "grep"`                        |
| `oilsort`                    | string  | `"name"`                                          | `"name"`, `"mtime"`, `"size"`                                                            | `vim.opt.oilsort = "mtime"`                        |
| `hinthotkey`                 | string  | `""`                                              |                                                                                          | `vim.opt.hinthotkey = "f"`                         |
| `undotreeposition`           | string  | `"right"`                                         | `"left"`, `"right"`                                                                      | `vim.opt.undotreeposition = "left"`                |
| `impreset`                   | string  | `"custom"`                                        | `"custom"`, `"macism"`, `"im-select"`, `"fcitx5-remote"`, `"ibus"`                       | `vim.opt.impreset = "fcitx5-remote"`               |
| `imbinarypath`               | string  | `""`                                              |                                                                                          | `vim.opt.imbinarypath = "/usr/bin/fcitx5-remote"`  |
| `imobtainargs`               | string  | `""`                                              |                                                                                          | `vim.opt.imobtainargs = ""`                        |
| `imswitchargs`               | string  | `"{im}"`                                          |                                                                                          | `vim.opt.imswitchargs = "-t {im}"`                 |
| `imdefaultnormal`            | string  | `""`                                              |                                                                                          | `vim.opt.imdefaultnormal = "1"`                    |
| `imrestorebehavior`          | string  | `"restore"`                                       | `"restore"`, `"default"`                                                                 | `vim.opt.imrestorebehavior = "default"`            |
| `imdefaultinsert`            | string  | `""`                                              |                                                                                          | `vim.opt.imdefaultinsert = "2"`                    |

> [!tip] Hybrid line numbers
> Enabling both `vim.opt.number = true` and `vim.opt.relativenumber = true` activates hybrid mode: the current line shows its absolute number, while all other lines show their relative distance from the cursor.
>
> Example with cursor on line 8:
>
> ```
>  a   3   ## Introduction
>      2   Some text here.
>      1   More context.
>      8   ← cursor line (shows absolute number)
>      1   Additional notes.
>  b   2   Another paragraph.
>      3   Final thoughts.
> ```
>
> The sign column (`a`, `b`) appears to the left of line numbers. The fold column (if enabled) appears to the right. This layout matches Neovim's default gutter arrangement: **sign column → line numbers → fold column → content**.

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

77 Neovim `vim.fn.*` functions are available for configuration, buffer manipulation, register access, async key input, regex search, and platform detection.

| Function                                      | Returns                       | Example                                          |
| --------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| `vim.fn.has(feature)`                         | `1` or `0`                    | `if vim.fn.has("mac") == 1 then`                 |
| `vim.fn.expand("%")`                          | Vault-relative file path      | `vim.fn.expand("%")` → `"folder/note.md"`        |
| `vim.fn.expand("%:t")`                        | Filename only                 | `vim.fn.expand("%:t")` → `"note.md"`             |
| `vim.fn.expand("%:e")`                        | Extension only                | `vim.fn.expand("%:e")` → `"md"`                  |
| `vim.fn.expand("%:r")`                        | Path without extension        | `vim.fn.expand("%:r")` → `"folder/note"`         |
| `vim.fn.fnamemodify(path, mods)`              | Modified path                 | `vim.fn.fnamemodify("a/b.md", ":t:r")` → `"b"`   |
| `vim.fn.exists(expr)`                         | `1` if exists, `0` otherwise  | `vim.fn.exists("g:my_var")`                      |
| `vim.fn.localtime()`                          | Unix timestamp (seconds)      | `vim.fn.localtime()`                             |
| `vim.fn.strftime(fmt)`                        | Formatted date string         | `vim.fn.strftime("%Y-%m-%d")`                    |
| `vim.fn.filereadable(path)`                   | `1` if vault file exists      | `vim.fn.filereadable("config.md")`               |
| `vim.fn.isdirectory(path)`                    | `1` if vault directory exists | `vim.fn.isdirectory("templates")`                |
| `vim.fn.glob(pattern)`                        | Newline-separated file list   | `vim.fn.glob("*.md")`                            |
| `vim.fn.mode()`                               | Current mode string           | `vim.fn.mode()` → `"n"`, `"i"`, `"v"`            |
| `vim.fn.line(expr)`                           | Cursor line (1-based)         | `vim.fn.line(".")` (callbacks only)              |
| `vim.fn.col(expr)`                            | Cursor column (1-based)       | `vim.fn.col(".")` (callbacks only)               |
| `vim.fn.getline(expr)`                        | Line content string           | `vim.fn.getline(".")` (callbacks only)           |
| `vim.fn.tolower(s)`                           | Lowercase string              | `vim.fn.tolower("Hello")` → `"hello"`            |
| `vim.fn.toupper(s)`                           | Uppercase string              | `vim.fn.toupper("Hello")` → `"HELLO"`            |
| `vim.fn.trim(s)`                              | Trimmed string                | `vim.fn.trim("  hi  ")` → `"hi"`                 |
| `vim.fn.strlen(s)`                            | String length                 | `vim.fn.strlen("hello")` → `5`                   |
| `vim.fn.strwidth(s)`                          | Display width                 | `vim.fn.strwidth("hello")` → `5`                 |
| `vim.fn.stridx(s, needle)`                    | First index of needle         | `vim.fn.stridx("hello", "ll")` → `2`             |
| `vim.fn.strridx(s, needle)`                   | Last index of needle          | `vim.fn.strridx("abab", "ab")` → `2`             |
| `vim.fn.strpart(s, start, len?)`              | Substring                     | `vim.fn.strpart("hello", 1, 3)` → `"ell"`        |
| `vim.fn.substitute(s, pat, sub, flags)`       | Regex replace                 | `vim.fn.substitute("hi", "h", "H", "")` → `"Hi"` |
| `vim.fn.nr2char(n)`                           | Character from code point     | `vim.fn.nr2char(65)` → `"A"`                     |
| `vim.fn.char2nr(c)`                           | Code point from character     | `vim.fn.char2nr("A")` → `65`                     |
| `vim.fn.split(s, sep?)`                       | List (table) of parts         | `vim.fn.split("a,b", ",")`                       |
| `vim.fn.join(list, sep?)`                     | Joined string                 | `vim.fn.join({"a","b"}, "-")` → `"a-b"`          |
| `vim.fn.setreg(regname, value [, opts])`      | (none)                        | `vim.fn.setreg('"', "text", "l")` (linewise)     |
| `vim.fn.getreg(regname?)`                     | Register content string       | `vim.fn.getreg('"')` → `"yanked text"`           |
| `vim.fn.getregtype(regname?)`                 | `"v"`, `"V"`, or `"\x16"`     | `vim.fn.getregtype('"')` → `"V"` (linewise)      |
| `vim.fn.setline(lnum, text)`                  | (none)                        | `vim.fn.setline(1, "new content")`               |
| `vim.fn.append(lnum, text\|list)`             | (none)                        | `vim.fn.append(0, "first line")`                 |
| `vim.fn.indent(lnum)`                         | Indent column number          | `vim.fn.indent(1)` → `4`                         |
| `vim.fn.nextnonblank(lnum)`                   | Line number or 0              | `vim.fn.nextnonblank(3)`                         |
| `vim.fn.prevnonblank(lnum)`                   | Line number or 0              | `vim.fn.prevnonblank(3)`                         |
| `vim.fn.getpos(expr)`                         | `{buf, lnum, col, off}`       | `vim.fn.getpos("'[")` (operatorfunc range)       |
| `vim.fn.setpos(expr, list)`                   | (none)                        | `vim.fn.setpos(".", {0, 5, 1, 0})`               |
| `vim.fn.cursor(lnum, col)`                    | (none)                        | `vim.fn.cursor(5, 1)`                            |
| `vim.fn.getcurpos()`                          | `{buf, lnum, col, off, want}` | `vim.fn.getcurpos()`                             |
| `vim.fn.type(expr)`                           | Neovim type number            | `vim.fn.type("s")` → `1` (string)                |
| `vim.fn.len(expr)`                            | Length of string/list/dict    | `vim.fn.len({1,2,3})` → `3`                      |
| `vim.fn.empty(expr)`                          | `1` if empty, `0` otherwise   | `vim.fn.empty("")` → `1`                         |
| `vim.fn.matchstr(s, pat)`                     | Matched portion               | `vim.fn.matchstr("abc123", "\\d+")` → `"123"`    |
| `vim.fn.match(s, pat [, start])`              | Match position or `-1`        | `vim.fn.match("hello", "ll")` → `2`              |
| `vim.fn.matchlist(s, pat)`                    | Match groups list             | `vim.fn.matchlist("ab12", "(\\w+)(\\d+)")`       |
| `vim.fn.escape(s, chars)`                     | Escaped string                | `vim.fn.escape("a.b", ".")` → `"a\\.b"`          |
| `vim.fn.repeat(s\|list, count)`               | Repeated string/list          | `vim.fn.repeat("-", 5)` → `"-----"`              |
| `vim.fn.reverse(s\|list)`                     | Reversed string/list          | `vim.fn.reverse("abc")` → `"cba"`                |
| `vim.fn.range(n [, end [, stride]])`          | Number list                   | `vim.fn.range(1, 5)` → `{1, 2, 3, 4, 5}`         |
| `vim.fn.sort(list)`                           | Sorted list (in-place)        | `vim.fn.sort({"c","a","b"})` → `{"a","b","c"}`   |
| `vim.fn.uniq(list)`                           | Deduplicated list (in-place)  | `vim.fn.uniq({"a","a","b"})` → `{"a","b"}`       |
| `vim.fn.max(list)`                            | Maximum number                | `vim.fn.max({3,1,4})` → `4`                      |
| `vim.fn.min(list)`                            | Minimum number                | `vim.fn.min({3,1,4})` → `1`                      |
| `vim.fn.abs(n)`                               | Absolute value                | `vim.fn.abs(-5)` → `5`                           |
| `vim.fn.index(list, item)`                    | 0-based index or `-1`         | `vim.fn.index({"a","b"}, "b")` → `1`             |
| `vim.fn.count(list, val)`                     | Occurrence count              | `vim.fn.count({1,2,1}, 1)` → `2`                 |
| `vim.fn.add(list, item)`                      | Appended list (mutates)       | `vim.fn.add(t, "x")` (same as `table.insert`)    |
| `vim.fn.remove(list, idx)`                    | Removed item (0-based idx)    | `vim.fn.remove(t, 0)` removes first element      |
| `vim.fn.extend(list1, list2)`                 | Merged list (mutates list1)   | `vim.fn.extend(t1, t2)`                          |
| `vim.fn.copy(expr)`                           | Shallow copy                  | `vim.fn.copy({1,2,3})`                           |
| `vim.fn.deepcopy(expr)`                       | Deep copy                     | `vim.fn.deepcopy(nested_table)`                  |
| `vim.fn.keys(dict)`                           | Key list                      | `vim.fn.keys({a=1, b=2})`                        |
| `vim.fn.values(dict)`                         | Value list                    | `vim.fn.values({a=1, b=2})`                      |
| `vim.fn.items(dict)`                          | `{{key, val}, ...}` pairs     | `vim.fn.items({a=1})` → `{{"a", 1}}`             |
| `vim.fn.flatten(list)`                        | Flattened list                | `vim.fn.flatten({{1,2},{3}})` → `{1,2,3}`        |
| `vim.fn.visualmode()`                         | Last visual mode type         | `vim.fn.visualmode()` → `"v"`, `"V"`, `"\x16"`   |
| `vim.fn.winsaveview()`                        | View state table              | `local view = vim.fn.winsaveview()`              |
| `vim.fn.winrestview(view)`                    | (none)                        | `vim.fn.winrestview(view)`                       |
| `vim.fn.foldclosed(lnum)`                     | First line of fold, or `-1`   | `vim.fn.foldclosed(5)` → `3` or `-1`             |
| `vim.fn.foldclosedend(lnum)`                  | Last line of fold, or `-1`    | `vim.fn.foldclosedend(5)` → `8` or `-1`          |
| `vim.fn.shiftwidth()`                         | Effective shift width         | `vim.fn.shiftwidth()` → `4`                      |
| `vim.fn.strdisplaywidth(s)`                   | Display width (CJK-aware)     | `vim.fn.strdisplaywidth("你好")` → `4`           |
| `vim.fn.strcharpart(s, start, len?)`          | Substring by char index       | `vim.fn.strcharpart("hello", 1, 3)` → `"ell"`    |
| `vim.fn.maparg(name, mode?)`                  | RHS of mapping or `""`        | `vim.fn.maparg("<leader>w", "n")`                |
| `vim.fn.getcharstr()`                         | Single keystroke (async)      | `local ch = vim.fn.getcharstr()`                 |
| `vim.fn.getchar()`                            | Key code number (async)       | `local nr = vim.fn.getchar()`                    |
| `vim.fn.searchpos(pat, flags?)`               | `{line, col}` or `{0, 0}`     | `vim.fn.searchpos("\\bword\\b")` → `{3, 5}`      |
| `vim.fn.input(prompt, default?, completion?)` | User input string (async)     | `local name = vim.fn.input("Name: ")`            |

### vim.fn.getcharstr() and vim.fn.getchar()

These functions yield the Lua coroutine and wait for the user to press a key. They are the primary mechanism for interactive Lua plugins (mini.surround, mini.ai, leap.nvim):

```lua
-- Wait for a character and act on it
vim.keymap.set("n", "s", function()
    vim.notify("Press a key...")
    local ch = vim.fn.getcharstr()
    vim.notify("You pressed: " .. ch)
end)
```

Modifier-only keys (Shift, Ctrl, Alt, Meta) are ignored. Special keys return their vim notation (e.g., `<Esc>`, `<CR>`, `<BS>`). Cannot be used in `{ expr = true }` callbacks or snippet `f()`/`d()` nodes.

### vim.fn.searchpos()

Searches the current buffer for a regex pattern and returns the position:

```lua
-- Find next occurrence of "TODO"
local pos = vim.fn.searchpos("TODO")
if pos[1] > 0 then
    vim.api.nvim_win_set_cursor(0, pos)
end
```

The `flags` parameter supports `"b"` (backward search), `"n"` (no move), `"w"` (wrap around). Default is forward search with wrapping. Returns `{0, 0}` when no match is found.

### vim.fn.input()

Opens an Obsidian modal with a text input field:

```lua
vim.keymap.set("n", "<leader>r", function()
    local name = vim.fn.input("Rename to: ", vim.fn.expand("%:t:r"))
    if name then
        vim.ob.rename()
    end
end)
```

Returns `nil` if the user cancels (presses Escape). The optional `default` parameter pre-fills the input. The `completion` parameter is accepted but ignored.

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

## Regular expressions

`vim.regex(pattern, flags?)` creates a regex object wrapping JavaScript's `RegExp`. This uses ECMAScript regex syntax, not Vim regex syntax.

| Method                         | Description                                                            | Example                                                  |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `vim.regex(pattern, flags?)`   | Create a regex object. `flags` is optional (e.g. `"g"`, `"i"`, `"gi"`) | `local re = vim.regex("\\d+")`                           |
| `re:match_str(str)`            | Returns 0-based start, end byte offsets of first match, or `nil`       | `vim.regex("hello"):match_str("hello world")` → `0, 5`   |
| `re:match_line(str)`           | Alias for `match_str`                                                  | `vim.regex("world"):match_line("hello world")` → `6, 11` |
| `re:match_pos(str, start?)`    | Match starting from byte offset (default 0)                            | `vim.regex("o"):match_pos("hello world", 5)` → `7, 8`    |
| `re:replace(str, replacement)` | Replace match(es). Use `"g"` flag for global replace                   | `vim.regex("o", "g"):replace("foo", "0")` → `"f00"`      |
| `re:test(str)`                 | Returns `true` if pattern matches, `false` otherwise                   | `vim.regex("^hello"):test("hello world")` → `true`       |

Invalid patterns raise a Lua error catchable with `pcall`:

```lua
local ok, err = pcall(vim.regex, "[invalid")
-- ok = false, err contains "invalid regular expression"
```

> [!info] ECMAScript regex, not Vim regex
> `vim.regex()` uses JavaScript's `RegExp` engine (ECMAScript syntax), not Vim's regex syntax. This means patterns like `\d`, `\w`, `[A-Z]`, and lookahead/lookbehind work as in JavaScript. Vim-specific atoms like `\v`, `\m`, `\zs` are not supported.

> [!info] Return value convention
> All match methods return **0-based** byte offsets, matching Neovim's `vim.regex():match_str()` convention. This differs from Lua's `string.find()` which returns 1-based indices.

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

## Snippets

Define snippets using a LuaSnip-inspired DSL. Static snippets compile to VS Code JSON at load time.

| Function                              | Description                                              |
| ------------------------------------- | -------------------------------------------------------- |
| `vim.snippet.s(name, nodes, opts?)`   | Create a snippet definition                              |
| `vim.snippet.t(text)`                 | Static text node                                         |
| `vim.snippet.i(index, default?)`      | Editable tabstop (index 0 = final position)              |
| `vim.snippet.c(index, choices)`       | Choice node (list of `t()` nodes)                        |
| `vim.snippet.rep(index)`              | Mirror/repeat another tabstop                            |
| `vim.snippet.fmt(str, nodes, opts?)`  | Format string — `{}` replaced by nodes in order          |
| `vim.snippet.f(fn, deps)`             | Function node — computes text from dependency fields     |
| `vim.snippet.d(index, fn, deps)`      | Dynamic node — generates sub-snippet from field values   |
| `vim.snippet.sn(index, nodes, opts?)` | Snippet node — return value for `d()` callbacks          |
| `vim.snippet.r(index, type_name?)`    | Restore node — preserves edits across `d()` regeneration |
| `vim.snippet.add(trigger, snippet)`   | Register a snippet with a trigger prefix                 |
| `vim.snippet.add_all(table)`          | Register multiple snippets (`{trigger = snippet, ...}`)  |

```lua
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local fmt = vim.snippet.fmt

vim.snippet.add("meta", s("Frontmatter", fmt([[
---
title: {}
date: {}
tags: [{}]
---
{}
]], { i(1, "Title"), i(2, "2026-01-01"), i(3, "tag"), i(0) })))
```

Options for `vim.snippet.s()`:

- `context` — restrict snippet to `"prose"`, `"code:*"`, `"code:js"`, or `"frontmatter"`
- `description` — shown in the snippet picker

See [[snippets]] for the complete snippet reference.

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

> [!tip] Choosing between `vim.cmd()` and `vim.obsidian.leader.add()`
> For leader-prefixed commands that execute Obsidian commands, `vim.obsidian.leader.add()` is the simplest approach — it automatically registers which-key labels. `vim.keymap.set` with function callbacks gives you more flexibility (conditional logic, `vim.fn` checks, `vim.notify`) but requires an explicit `desc` option for which-key labels.

> [!warning] Which-key auto-resolution with function callbacks
> String RHS mappings like `vim.keymap.set("n", "<leader>r", ":ob app:go-back<CR>")` auto-resolve the Obsidian command name in the which-key popup. Function callbacks wrapping `vim.cmd("ob ...")` do **not** — Lua functions are opaque and cannot be introspected. Always provide a `desc` option when using function callbacks, or use a string RHS for automatic resolution.

## Buffer-local variables (`vim.b`)

Per-buffer variable storage, isolated by file path:

```lua
vim.b.my_flag = true
if vim.b.my_flag then
    vim.notify("Flag is set for this buffer")
end
vim.b.my_flag = nil  -- delete
```

Returns `nil` for unset variables. Variables persist for the session but are not saved across plugin reloads.

## Buffer-local options (`vim.bo`)

Read buffer-local options:

| Option          | Default (markdown) | Description                |
| --------------- | ------------------ | -------------------------- |
| `commentstring` | `%% %s %%`         | Comment format string      |
| `filetype`      | file extension     | Buffer filetype            |
| `expandtab`     | `true`             | Use spaces for indentation |
| `shiftwidth`    | Obsidian tab size  | Indent width               |
| `tabstop`       | Obsidian tab size  | Tab character width        |
| `modifiable`    | `true`             | Buffer is editable         |
| `buftype`       | `""`               | Buffer type                |
| `textwidth`     | `0`                | Hard-wrap width            |

```lua
local cs = vim.bo.commentstring  -- "%% %s %%"
local ft = vim.bo.filetype       -- "md" or file extension
```

## Plugin management (`vim.plugins`)

Register Neovim-compatible Lua plugins. The plugin supports automatic fetching from GitHub when **Settings → Vim Motions → Advanced → Auto-fetch plugins** is enabled.

```lua
-- Register a plugin (checks if files exist in lua/, fetches if enabled)
vim.plugins.add({ 'echasnovski/mini.nvim' })

-- Pin to a specific branch, tag, or commit
vim.plugins.add({ 'echasnovski/mini.comment', branch = 'main' })
vim.plugins.add({ 'folke/flash.nvim', tag = 'v1.0.0' })
vim.plugins.add({ 'nvim-lua/plenary.nvim', commit = 'abcdef1' })

-- Then use the plugin normally
require('mini.comment').setup({})
```

If the plugin files are not found and auto-fetch is disabled, a Notice is shown with download instructions. When auto-fetch is enabled, the plugin is downloaded as a tarball archive and extracted to `lua/`. A lock file at `lua/.plugin-lock.json` tracks installed versions.

```lua
-- List registered plugins
local plugins = vim.plugins.list()
for _, p in ipairs(plugins) do
    print(p.name, p.repo, p.available)
end
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

| Function                                                                            | Description                                  | Example                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `vim.api.nvim_get_current_buf()`                                                    | Returns 0 (current buffer)                   | `local buf = vim.api.nvim_get_current_buf()`         |
| `vim.api.nvim_buf_get_name(0)`                                                      | Vault-relative file path                     | `vim.api.nvim_buf_get_name(0)`                       |
| `vim.api.nvim_buf_line_count(0)`                                                    | Total line count                             | `vim.api.nvim_buf_line_count(0)`                     |
| `vim.api.nvim_buf_get_lines(0, start, end, strict)`                                 | Get lines (0-based, end-exclusive, -1 = EOF) | `vim.api.nvim_buf_get_lines(0, 0, -1, true)`         |
| `vim.api.nvim_buf_set_lines(0, start, end, strict, lines)`                          | Set lines (empty table = delete)             | `vim.api.nvim_buf_set_lines(0, 0, 0, true, {"new"})` |
| `vim.api.nvim_buf_set_text(0, start_row, start_col, end_row, end_col, replacement)` | Set text in range (0-indexed)                | `vim.api.nvim_buf_set_text(0, 0, 0, 0, 0, {"hi"})`   |
| `vim.api.nvim_buf_get_text(0, start_row, start_col, end_row, end_col, opts)`        | Get text in range (0-indexed)                | `vim.api.nvim_buf_get_text(0, 0, 0, 0, 5, {})`       |
| `vim.api.nvim_get_current_line()`                                                   | Get current line content                     | `local line = vim.api.nvim_get_current_line()`       |
| `vim.api.nvim_set_current_line(line)`                                               | Set current line content                     | `vim.api.nvim_set_current_line("new")`               |
| `vim.api.nvim_del_current_line()`                                                   | Delete current line                          | `vim.api.nvim_del_current_line()`                    |
| `vim.api.nvim_buf_is_valid(buf)`                                                    | Check if buffer handle is valid              | `vim.api.nvim_buf_is_valid(0)` → `true`              |
| `vim.api.nvim_buf_get_mark(0, name)`                                                | Get mark position `{line, col}` (0-indexed)  | `local pos = vim.api.nvim_buf_get_mark(0, "a")`      |
| `vim.api.nvim_buf_set_mark(0, name, line, col, opts)`                               | Set mark position (0-indexed)                | `vim.api.nvim_buf_set_mark(0, "a", 5, 0, {})`        |
| `vim.api.nvim_buf_del_mark(0, name)`                                                | Delete a mark                                | `vim.api.nvim_buf_del_mark(0, "a")`                  |
| `vim.api.nvim_buf_get_var(0, name)`                                                 | Get buffer-local variable                    | `local val = vim.api.nvim_buf_get_var(0, "x")`       |
| `vim.api.nvim_buf_set_var(0, name, value)`                                          | Set buffer-local variable                    | `vim.api.nvim_buf_set_var(0, "x", 1)`                |
| `vim.api.nvim_buf_get_option(0, name)`                                              | Get buffer-local option                      | `local val = vim.api.nvim_buf_get_option(0, "sw")`   |
| `vim.api.nvim_buf_set_option(0, name, value)`                                       | Set buffer-local option                      | `vim.api.nvim_buf_set_option(0, "sw", 4)`            |

> [!info] Buffer argument
> Only `buffer = 0` (current buffer) is supported. These functions operate on the active editor.

## Window and Cursor

| Function                                      | Description                                   | Example                                          |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `vim.api.nvim_get_current_win()`              | Returns 0 (current window)                    | `local win = vim.api.nvim_get_current_win()`     |
| `vim.api.nvim_win_get_cursor(0)`              | Get cursor position `{line, col}` (0-indexed) | `local pos = vim.api.nvim_win_get_cursor(0)`     |
| `vim.api.nvim_win_set_cursor(0, {line, col})` | Set cursor position (0-indexed)               | `vim.api.nvim_win_set_cursor(0, {5, 0})`         |
| `vim.api.nvim_win_get_buf(0)`                 | Returns 0 (current buffer)                    | `local buf = vim.api.nvim_win_get_buf(0)`        |
| `vim.api.nvim_get_current_tabpage()`          | Returns 0 (current tabpage)                   | `local tab = vim.api.nvim_get_current_tabpage()` |
| `vim.api.nvim_list_wins()`                    | Returns `{0}` (list of window handles)        | `local wins = vim.api.nvim_list_wins()`          |
| `vim.api.nvim_get_mode()`                     | Current mode `{mode, blocking}`               | `vim.api.nvim_get_mode().mode` → `"n"`           |
| `vim.api.nvim_strwidth(text)`                 | Display width of string                       | `vim.api.nvim_strwidth("hello")` → `5`           |

> [!info] Window and Tabpage handles
> Only `0` (current) is supported for window and tabpage handles.

## Keymaps

| Function                                               | Description                  | Example                                             |
| ------------------------------------------------------ | ---------------------------- | --------------------------------------------------- |
| `vim.api.nvim_set_keymap(mode, lhs, rhs, opts)`        | Create a global key mapping  | `vim.api.nvim_set_keymap("n", "x", "y", {})`        |
| `vim.api.nvim_del_keymap(mode, lhs)`                   | Remove a global key mapping  | `vim.api.nvim_del_keymap("n", "x")`                 |
| `vim.api.nvim_get_keymap(mode)`                        | Get list of global keymaps   | `local maps = vim.api.nvim_get_keymap("n")`         |
| `vim.api.nvim_buf_set_keymap(0, mode, lhs, rhs, opts)` | Create a buffer-local keymap | `vim.api.nvim_buf_set_keymap(0, "n", "x", "y", {})` |
| `vim.api.nvim_buf_del_keymap(0, mode, lhs)`            | Remove a buffer-local keymap | `vim.api.nvim_buf_del_keymap(0, "n", "x")`          |
| `vim.api.nvim_buf_get_keymap(0, mode)`                 | Get buffer-local keymaps     | `local maps = vim.api.nvim_buf_get_keymap(0, "n")`  |

## Custom ex commands

Define custom commands that are usable from the `:` ex command line.

| Function                                            | Description              | Example                                  |
| --------------------------------------------------- | ------------------------ | ---------------------------------------- |
| `vim.api.nvim_command(command)`                     | Execute an ex command    | `vim.api.nvim_command("set nu")`         |
| `vim.api.nvim_create_user_command(name, cmd, opts)` | Define custom ex command | see below                                |
| `vim.api.nvim_del_user_command(name)`               | Delete custom ex command | `vim.api.nvim_del_user_command("Today")` |

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

## Key injection

| Function                                   | Description                       | Example                                        |
| ------------------------------------------ | --------------------------------- | ---------------------------------------------- |
| `vim.api.nvim_feedkeys(keys, mode, remap)` | Inject keystrokes                 | `vim.api.nvim_feedkeys("j", "n", false)`       |
| `vim.api.nvim_replace_termcodes(str, ...)` | Identity function (returns input) | `vim.api.nvim_replace_termcodes("<Esc>", ...)` |

## Autocommands

Vim Motions supports a Neovim-compatible autocommand system for reacting to editor events.

| Function                                   | Description                  | Example                                         |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------- |
| `vim.api.nvim_create_autocmd(event, opts)` | Register autocommand         | see below                                       |
| `vim.api.nvim_create_augroup(name, opts)`  | Create/get autocommand group | see below                                       |
| `vim.api.nvim_del_autocmd(id)`             | Delete autocommand           | `vim.api.nvim_del_autocmd(42)`                  |
| `vim.api.nvim_del_augroup_by_name(name)`   | Delete autocommand group     | `vim.api.nvim_del_augroup_by_name("my-config")` |
| `vim.api.nvim_clear_autocmds(opts)`        | Clear autocommands           | `vim.api.nvim_clear_autocmds({ group = g })`    |

> [!tip] Per-view mode events
> Mode events (`InsertEnter`, `InsertLeave`, `ModeChanged`) and cursor/yank/cmdline events (`CursorMoved`, `CursorHold`, `TextYankPost`, `CmdlineEnter`, `CmdlineLeave`) fire per-view across all editors — split panes, popover editors, and canvas card text inputs — when using the bundled vim fork (recommended setup). This means autocmd callbacks work in every editor, not just the active leaf.

### Supported events

| Event          | When it fires                                           | Pattern support                                       |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `InsertEnter`  | Entering insert or replace mode (per-view)              | No                                                    |
| `InsertLeave`  | Leaving insert or replace mode (per-view)               | No                                                    |
| `CursorMoved`  | After cursor moves in normal mode (per-view)            | No                                                    |
| `CursorHold`   | After cursor is idle for `updatetime` ms (per-view)     | No                                                    |
| `ModeChanged`  | Any mode transition (per-view)                          | `"old:new"` with `*` wildcard                         |
| `BufEnter`     | A file becomes the active note                          | Vault-relative path globs (`"*.md"`, `"projects/**"`) |
| `BufLeave`     | A file is deactivated (switching away)                  | Vault-relative path globs                             |
| `BufWritePre`  | Before saving a file                                    | Vault-relative path globs                             |
| `BufWritePost` | After saving a file                                     | Vault-relative path globs                             |
| `LeafEnter`    | A leaf (tab/pane) gains focus (debounced 50ms)          | No                                                    |
| `LeafLeave`    | A leaf (tab/pane) loses focus                           | No                                                    |
| `FileType`     | After `BufEnter` when filetype is detected              | No                                                    |
| `FocusGained`  | Obsidian window gains focus                             | No                                                    |
| `FocusLost`    | Obsidian window loses focus                             | No                                                    |
| `TextYankPost` | After yank, delete, or change operation (per-view)      | No                                                    |
| `OilEnter`     | An oil explorer buffer becomes active                   | No                                                    |
| `OilLeave`     | Leaving an oil explorer buffer                          | No                                                    |
| `CmdlineEnter` | Opening `:`, `/`, or `?` prompt (per-view, active only) | No (`data.cmdtype` = `":"`, `"/"`, or `"?"`)          |
| `CmdlineLeave` | Closing a command-line prompt (per-view, active only)   | No (`data.cmdtype` = `":"`, `"/"`, or `"?"`)          |

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

| Option    | Type           | Default | Description                                                                                                                                                                                                    |
| --------- | -------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desc`    | string         | (none)  | Description shown in which-key popup. Required for function callbacks — string RHS with `:ob`/`:obcommand` auto-resolves the command name, but function callbacks are opaque and need an explicit description. |
| `noremap` | boolean        | `true`  | Non-recursive mapping                                                                                                                                                                                          |
| `remap`   | boolean        | `false` | Recursive mapping (inverse of `noremap`)                                                                                                                                                                       |
| `silent`  | boolean        | (none)  | Accepted but no effect in Obsidian                                                                                                                                                                             |
| `nowait`  | boolean        | (none)  | Accepted but no effect in Obsidian                                                                                                                                                                             |
| `buffer`  | number/boolean | (none)  | Buffer-local keymap (`0` or `true` = current file). See Buffer-local keymaps above. Non-zero numbers error.                                                                                                    |
| `expr`    | boolean        | `false` | If `true`, the callback must return a string that is fed as keystrokes. Sync only — async APIs cannot be used in expr callbacks. String rhs not supported for expr.                                            |

## Obsidian namespace

Obsidian-specific APIs that don't exist in Neovim. Available as `vim.obsidian` or `vim.ob`.

| Function                           | Returns                                          | Example                                   |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `vim.obsidian.vault_name()`        | Vault name                                       | `vim.obsidian.vault_name()`               |
| `vim.obsidian.app_version()`       | Obsidian version string                          | `vim.obsidian.app_version()`              |
| `vim.obsidian.plugin_version()`    | Plugin version string                            | `vim.obsidian.plugin_version()`           |
| `vim.obsidian.run_command(id)`     | Execute Obsidian command by ID                   | `vim.obsidian.run_command("app:reload")`  |
| `vim.obsidian.list_commands()`     | Table of `{id, name}`                            | `vim.obsidian.list_commands()`            |
| `vim.obsidian.open_file(path)`     | Open a vault file                                | `vim.obsidian.open_file("notes/todo.md")` |
| `vim.obsidian.pick(source, opts?)` | Open a picker source                             | `vim.obsidian.pick("files")`              |
| `vim.obsidian.current_file()`      | Table `{path, name, extension, basename}` or nil | `vim.obsidian.current_file().path`        |
| `vim.obsidian.vault_path()`        | Vault absolute path (desktop only)               | `vim.obsidian.vault_path()`               |

Picker sources include `files`, `buffers`, `commands`, `headings`, `outline`, `backlinks`, `tags`, `recent`, `marks`, `registers`, `grep`, and `resume` (reopen the last picker session).

```lua
-- Open files picker
vim.obsidian.pick('files')

-- Open grep with pre-filled query
vim.obsidian.pick('grep', { query = 'todo' })

-- Resume last session
vim.obsidian.pick('resume')
```

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

### vim.ob.meta — Note metadata

| Function                         | Returns                       | Description                            |
| -------------------------------- | ----------------------------- | -------------------------------------- |
| `vim.ob.meta.frontmatter(path?)` | table or nil                  | YAML frontmatter as key-value pairs    |
| `vim.ob.meta.tags(path?)`        | `string[]`                    | Combined body + frontmatter tags       |
| `vim.ob.meta.links(path?)`       | `{link, display, original}[]` | Outgoing wikilinks and markdown links  |
| `vim.ob.meta.backlinks(path?)`   | `string[]`                    | Source file paths linking to this note |
| `vim.ob.meta.headings(path?)`    | `{heading, level}[]`          | Headings with H1-H6 level              |
| `vim.ob.meta.embeds(path?)`      | `{link, display}[]`           | Embedded content (`![[...]]`)          |
| `vim.ob.meta.aliases(path?)`     | `string[]`                    | YAML aliases                           |
| `vim.ob.meta.tasks(path?)`       | `{text, status, line}[]`      | Checklist items with status char       |
| `vim.ob.meta.lists(path?)`       | `{text, line, indent}[]`      | All list items                         |

> All `meta.*` functions default to the current file when `path` is omitted.

### vim.ob.fs — Vault filesystem

| Function                                                 | Description                           | Async |
| -------------------------------------------------------- | ------------------------------------- | ----- |
| `vim.ob.fs.read(path)`                                   | Read file content as string           | Yes   |
| `vim.ob.fs.readlines(path)`                              | Read file content as table of lines   | Yes   |
| `vim.ob.fs.files(pattern?)`                              | Markdown files matching optional glob | No    |
| `vim.ob.fs.all_files()`                                  | All files in vault                    | No    |
| `vim.ob.fs.folders()`                                    | All folders                           | No    |
| `vim.ob.fs.exists(path)`                                 | Check if file exists                  | No    |
| `vim.ob.fs.stat(path?)`                                  | File stats `{ctime, mtime, size}`     | No    |
| `vim.ob.fs.create(path, content?)`                       | Create new file                       | No    |
| `vim.ob.fs.write(content)` or `write(path, content)`     | Overwrite file content                | No    |
| `vim.ob.fs.append(content)` or `append(path, content)`   | Append to file                        | No    |
| `vim.ob.fs.rename(new_path)` or `rename(path, new_path)` | Rename (updates backlinks)            | No    |
| `vim.ob.fs.move(dest)` or `move(path, dest)`             | Move to folder or new path            | No    |
| `vim.ob.fs.trash(path?)`                                 | Move to trash (user preference)       | No    |

Async functions yield the Lua coroutine internally and resume when the operation completes. They work in keymap callbacks, autocmd handlers, timer callbacks, user commands, and at the top level of `init.lua`. They are blocked in snippet `f()`/`d()` nodes. Errors from async functions are catchable with `pcall`.

```lua
local content = vim.ob.fs.read("notes/todo.md")
vim.notify("File has " .. #content .. " chars")

local lines = vim.ob.fs.readlines("notes/todo.md")
vim.notify("File has " .. #lines .. " lines")

local ok, err = pcall(vim.ob.fs.read, "nonexistent.md")
if not ok then vim.notify("Error: " .. err) end
```

> Write operations silently reject paths inside `.obsidian/`. Write/append/rename/move/trash default to the current file when path is omitted.

### vim.ob.ui — UI control

| Function                          | Description                                |
| --------------------------------- | ------------------------------------------ |
| `vim.ob.ui.sidebar(side, state?)` | Toggle sidebar (`"left"`, `"right"`)       |
| `vim.ob.ui.command_palette()`     | Open command palette                       |
| `vim.ob.ui.quickswitch()`         | Open quick switcher                        |
| `vim.ob.ui.notice(msg)`           | Show notification (alias for `vim.notify`) |

### vim.obsidian.oil — Oil explorer

Functions for controlling the [[oil-explorer|oil explorer]]. All functions are also available as ex commands (e.g., `:oilparent`).

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

Use `OilEnter` / `OilLeave` autocmd events to set buffer-local keymaps:

```lua
vim.api.nvim_create_autocmd('OilEnter', {
    callback = function()
        vim.keymap.set('n', 'l', function()
            vim.obsidian.oil.open_entry()
        end, { buffer = 0 })
    end
})
```

### Editor state

| Function                       | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `vim.ob.get_cursor()`          | Cursor position `{line, col}` (1-indexed)    |
| `vim.ob.set_cursor(line, col)` | Set cursor (1-indexed)                       |
| `vim.ob.get_selection()`       | Visual selection text or nil                 |
| `vim.ob.mode()`                | Current vim mode (alias for `vim.fn.mode()`) |
| `vim.ob.notice(msg)`           | Show notification (alias for `vim.notify`)   |

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

### Input method switching (`vim.obsidian.im`)

Programmatic control over input method (IM) switching for CJK users (per-view across all editors). Requires an external IM switching binary and configuration in **Settings → Vim Motions → Input method**. Desktop only.

| Function/Property           | Returns       | Description                                             |
| --------------------------- | ------------- | ------------------------------------------------------- |
| `vim.obsidian.im.get()`     | `string\|nil` | Current IM identifier (cached), or `nil` if unavailable |
| `vim.obsidian.im.set(id)`   |               | Switch to specific IM identifier                        |
| `vim.obsidian.im.save()`    |               | Save current IM for the active editor view              |
| `vim.obsidian.im.restore()` |               | Restore saved IM for the active editor view             |
| `vim.obsidian.im.enabled`   | `boolean`     | Read/write: master toggle for IM switching              |
| `vim.obsidian.im.auto`      | `boolean`     | Read/write: auto-wire to `InsertEnter`/`InsertLeave`    |

When `vim.obsidian.im.auto` is `true` (default), the plugin automatically saves/restores IM on mode changes across all editor views. Set it to `false` for manual control:

```lua
vim.obsidian.im.auto = false

vim.api.nvim_create_autocmd('InsertLeave', {
    callback = function()
        vim.obsidian.im.save()
        vim.obsidian.im.set('com.apple.keylayout.ABC')
    end
})

vim.api.nvim_create_autocmd('InsertEnter', {
    callback = function()
        vim.obsidian.im.restore()
    end
})
```

> [!info] Desktop only
> `vim.obsidian.im.get()` returns `nil` on mobile. All other functions are silent no-ops.

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
| `vim.g.mode_prompt_insert_normal` | Insert-Normal   | `NORMAL`    |

```lua
vim.g.mode_prompt_normal = "N"
vim.g.mode_prompt_insert = "I"
vim.g.mode_prompt_visual = "V"
vim.g.mode_prompt_replace = "R"
```

## Highlight groups

Customize plugin styling from Lua using Neovim's `nvim_set_hl` API:

| Function                              | Description                    | Example                                                |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `vim.api.nvim_create_namespace(name)` | Returns unique namespace ID    | `local ns = vim.api.nvim_create_namespace("my")`       |
| `vim.api.nvim_set_hl(ns, name, opts)` | Set highlight group attributes | `vim.api.nvim_set_hl(0, "MyHl", { fg = "red" })`       |
| `vim.api.nvim_get_hl(ns, opts)`       | Get highlight group attributes | `local hl = vim.api.nvim_get_hl(0, { name = "MyHl" })` |

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
> `vim.api.nvim_create_namespace()` returns a unique integer ID per namespace name (matching Neovim). The same name always returns the same ID. Namespace `0` is the global namespace. Namespaces are used for highlight groups, extmarks, and clearing decorations.

> [!info] Underline styles
> Only one underline style can be active per highlight group. If multiple underline attributes (`undercurl`, `underdouble`, `underdotted`, `underdashed`) are set, only the first one takes effect.

## UI

| Function                                   | Description                         | Example                                            |
| ------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| `vim.api.nvim_echo(chunks, history, opts)` | Show Obsidian notification (Notice) | `vim.api.nvim_echo({{"Hello", "None"}}, true, {})` |

## Options

| Function                                            | Description                          | Example                                              |
| --------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `vim.api.nvim_get_option(name)`                     | Get global option value (deprecated) | `local val = vim.api.nvim_get_option("sw")`          |
| `vim.api.nvim_set_option(name, value)`              | Set global option value (deprecated) | `vim.api.nvim_set_option("sw", 4)`                   |
| `vim.api.nvim_get_option_value(name, opts?)`        | Get option value (preferred)         | `vim.api.nvim_get_option_value("shiftwidth", {})`    |
| `vim.api.nvim_set_option_value(name, value, opts?)` | Set option value (preferred)         | `vim.api.nvim_set_option_value("shiftwidth", 4, {})` |
| `vim.api.nvim_get_vvar(name)`                       | Get a `vim.v` variable               | `vim.api.nvim_get_vvar("count")` → `0`               |
| `vim.api.nvim_set_vvar(name, value)`                | Set a `vim.v` variable               | `vim.api.nvim_set_vvar("searchforward", 0)`          |

## Extmarks

Neovim-compatible extmark API for virtual text, highlights, and sign text. Extmarks are anchored to buffer positions and move with text edits.

| Function                                                             | Description                           | Example                                                                         |
| -------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `vim.api.nvim_buf_set_extmark(buf, ns_id, line, col, opts)`          | Create/update an extmark              | `vim.api.nvim_buf_set_extmark(0, ns, 0, 0, { virt_text = {{"→", "Comment"}} })` |
| `vim.api.nvim_buf_get_extmarks(buf, ns_id, start, end, opts)`        | Get extmarks in range                 | `vim.api.nvim_buf_get_extmarks(0, ns, 0, -1, {})`                               |
| `vim.api.nvim_buf_get_extmark_by_id(buf, ns_id, id, opts)`           | Get single extmark by ID              | `vim.api.nvim_buf_get_extmark_by_id(0, ns, 1, {})`                              |
| `vim.api.nvim_buf_del_extmark(buf, ns_id, id)`                       | Delete an extmark                     | `vim.api.nvim_buf_del_extmark(0, ns, 1)`                                        |
| `vim.api.nvim_buf_clear_namespace(buf, ns_id, line_start, line_end)` | Clear all extmarks in namespace/range | `vim.api.nvim_buf_clear_namespace(0, ns, 0, -1)`                                |

### nvim_buf_set_extmark options

| Option          | Type                   | Description                                                                    |
| --------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `virt_text`     | `{{text, hl_group}[]}` | Virtual text chunks (list of `{text, highlight_group}` pairs)                  |
| `virt_text_pos` | string                 | Position: `"overlay"` (on top), `"eol"` (after line), `"inline"` (within text) |
| `hl_group`      | string                 | Highlight group for the extmark range                                          |
| `sign_text`     | string                 | Sign text (1-2 chars) shown in the sign column                                 |
| `priority`      | number                 | Priority for ordering (higher = on top, default: 4096)                         |
| `id`            | number                 | Reuse an existing extmark ID (update instead of create)                        |

```lua
local ns = vim.api.nvim_create_namespace("my-plugin")

-- Virtual text at end of line
vim.api.nvim_buf_set_extmark(0, ns, 0, 0, {
    virt_text = {{"← cursor here", "Comment"}},
    virt_text_pos = "eol",
})

-- Overlay text
vim.api.nvim_buf_set_extmark(0, ns, 2, 5, {
    virt_text = {{"FIXME", "WarningMsg"}},
    virt_text_pos = "overlay",
})

-- Clear all extmarks in namespace
vim.api.nvim_buf_clear_namespace(0, ns, 0, -1)
```

> [!info] Buffer argument
> Only `buffer = 0` (current buffer) is supported. Extmark positions are 0-indexed (line and column).

> [!info] Supported options subset
> Only the options listed above are implemented. Other Neovim extmark options (`end_row`, `end_col`, `spell`, `conceal`, `undo_restore`, etc.) are not yet available.

## vim.version

Version parsing and comparison utilities matching Neovim's `vim.version` module.

| Function                     | Returns                                   | Example                                                 |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `vim.version()`              | Plugin version as `{major, minor, patch}` | `vim.version()` → `{major=0, minor=147, patch=0}`       |
| `vim.version.parse(str)`     | Version object or `nil`                   | `vim.version.parse("1.2.3")` → `{major=1, ...}`         |
| `vim.version.cmp(v1, v2)`    | `-1`, `0`, or `1`                         | `vim.version.cmp("1.0.0", "2.0.0")` → `-1`              |
| `vim.version.lt(v1, v2)`     | boolean                                   | `vim.version.lt("1.0.0", "2.0.0")` → `true`             |
| `vim.version.gt(v1, v2)`     | boolean                                   | `vim.version.gt("2.0.0", "1.0.0")` → `true`             |
| `vim.version.eq(v1, v2)`     | boolean                                   | `vim.version.eq("1.0.0", "1.0.0")` → `true`             |
| `vim.version.range(spec)`    | Range object with `has(ver)`              | `vim.version.range(">=1.0.0"):has("1.5.0")` → `true`    |
| `vim.version.last(versions)` | Highest version from list                 | `vim.version.last({"1.0.0", "2.0.0"})` → `{major=2}...` |

Version objects have `__tostring` (`"1.2.3"`), `__eq`, and `__lt` metamethods for natural comparison:

```lua
local v = vim.version.parse("1.2.3")
print(v)           -- "1.2.3"
print(v.major)     -- 1
print(v >= vim.version.parse("1.0.0"))  -- true
```

Range specs support `>=`, `>`, `<=`, `<`, `=`, and two-constraint ranges:

```lua
local r = vim.version.range(">=1.0.0 <2.0.0")
print(r:has("1.5.0"))  -- true
print(r:has("2.0.0"))  -- false
```

## vim.validate

Argument validation matching Neovim's `vim.validate()`. Supports both the old table form and the new positional form (Neovim 0.11+).

### Positional form (recommended)

```lua
vim.validate("name", name, "string")
vim.validate("count", count, "number")
vim.validate("callback", callback, "function", true)  -- optional
vim.validate("mode", mode, {"string", "table"})        -- multiple types
```

### Old table form

```lua
vim.validate({
    name = { name, "string" },
    count = { count, "number" },
    callback = { callback, "function", true },  -- optional
})
```

Throws an error with a descriptive message on validation failure:

```lua
local ok, err = pcall(vim.validate, "x", nil, "string")
-- err: "x: expected string, got nil"
```

## vim.keycode

Translates Neovim key notation to the actual key character:

```lua
vim.keycode("<CR>")   -- "\r" (carriage return)
vim.keycode("<Esc>")  -- "\x1b" (escape)
vim.keycode("<Tab>")  -- "\t" (tab)
vim.keycode("<BS>")   -- "\x08" (backspace)
vim.keycode("<Space>") -- " "
```

Useful for comparing keys returned by `vim.fn.getcharstr()` against special key names.

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
> The following Neovim APIs are not available: `vim.lsp`, `vim.ui`, `vim.diagnostic`. Attempting to use them produces a clear error message. `vim.treesitter` is fully implemented — see [[#vim.treesitter]] below for the complete API reference. `vim.api` is partially supported (59 `nvim_*` functions — see sections above for the full list; unimplemented functions error with a helpful message). `vim.fn` is partially supported (77 functions — see above). `vim.version`, `vim.validate`, and `vim.keycode` are fully implemented. The Lua runtime is sandboxed: only 7 standard libraries are loaded (`_G`, `string`, `table`, `math`, `coroutine`, `utf8`, `os`). The `io`, `debug`, and `package` libraries are not available (but `package.loaded` and `package.path` are provided by the plugin's `require()` implementation). `require()` loads modules from `lua/` in the vault root. `load(chunk)` compiles string chunks. `dofile` and `loadfile` are disabled. `rawget`, `rawset`, and `rawequal` are available for Neovim compatibility.

### `collectgarbage` behavior

`collectgarbage()` is available with all standard modes. Since fengari has no garbage collector, behavior differs from PUC-Rio Lua:

| Mode          | Behavior                                                   |
| ------------- | ---------------------------------------------------------- |
| `"collect"`   | Drains the `__gc` finalizer queue for unreachable userdata |
| `"count"`     | Returns `0, 0` (no memory tracking)                        |
| `"isrunning"` | Returns `false`                                            |
| Other modes   | No-op, returns `0`                                         |

`__gc` metamethods on userdata are supported via `FinalizationRegistry`. Finalizers fire when userdata becomes unreachable from JavaScript and the queue is drained (at `collectgarbage("collect")`, outermost pcall return, or plugin unload). Finalization timing is non-deterministic and ordering is unspecified. `__gc` on tables is not supported. Errors in `__gc` are silently swallowed.

## Keymapping mode reference

| Mode string | Context          | Description                                                  |
| ----------- | ---------------- | ------------------------------------------------------------ |
| `'n'`       | Normal           | Normal mode mappings                                         |
| `'i'`       | Insert           | Insert mode mappings                                         |
| `'v'`       | Visual           | Visual mode (same as `'x'`)                                  |
| `'x'`       | Visual           | Visual mode (alias for `'v'`)                                |
| `'s'`       | Select           | Select mode only                                             |
| `'o'`       | Operator-pending | Operator-pending mode (e.g., text objects for `d`, `c`, `y`) |

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

The Lua runtime runs in a sandboxed Lua 5.3 environment (a browser-only version of fengari, absorbed into the monorepo and converted to TypeScript ESM).

### Available standard libraries

7 standard libraries are loaded:

| Library     | Description                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_G` (base) | Core functions (`type`, `tostring`, `tonumber`, `pcall`, `xpcall`, `error`, `select`, `pairs`, `ipairs`, `next`, `unpack`, `assert`, `rawget`, `rawset`, `rawequal`) |
| `string`    | String manipulation (`format`, `find`, `gsub`, `sub`, `rep`, `byte`, `char`, `len`, `lower`, `upper`, `match`, `gmatch`, `reverse`)                                  |
| `table`     | Table manipulation (`insert`, `remove`, `sort`, `concat`, `move`, `pack`, `unpack`)                                                                                  |
| `math`      | Math functions (`floor`, `ceil`, `abs`, `max`, `min`, `random`, `sqrt`, `sin`, `cos`, `pi`, `huge`, etc.)                                                            |
| `coroutine` | Coroutine support (`create`, `resume`, `yield`, `wrap`, `status`)                                                                                                    |
| `utf8`      | UTF-8 support (`char`, `codepoint`, `codes`, `len`, `offset`, `charpattern`)                                                                                         |
| `os`        | Date/time (`date`, `time`, `difftime`, `clock`, `setlocale`), environment (`getenv`), file operations (`remove`, `rename`, `tmpname`)                                |

> [!info] Desktop vs mobile
> `os.getenv`, `os.remove`, `os.rename`, and `os.tmpname` require desktop (Node.js). On mobile, they return `nil`. `os.execute` and `os.exit` are permanently blocked on all platforms.

### Not available

| Library/function     | Reason                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `io`                 | Stripped from runtime (file system access)                                                      |
| `debug`              | Not loaded by plugin (security)                                                                 |
| `package` (native)   | Stripped from runtime; plugin provides `package.loaded`/`package.path` and a custom `require()` |
| `dofile`, `loadfile` | Disabled (no direct file loading)                                                               |
| `os.execute`         | Permanently blocked (arbitrary shell execution is a security risk)                              |
| `os.exit`            | Permanently blocked (would terminate Obsidian)                                                  |

### Execution limits

- **Config load instruction limit**: 1,000,000 Lua VM instructions per execution. Scripts exceeding this limit are terminated with a timeout error.
- **Runtime callback instruction limit**: 500,000 instructions for function keymaps, user commands, autocmd handlers, and timer callbacks. 100,000 instructions for snippet dynamic nodes (`f()`/`d()`). An infinite loop in a callback shows a throttled error Notice (5-second cooldown) and Obsidian remains responsive.
- **Error handling**: Syntax errors, runtime errors, and instruction limit timeouts are caught and displayed as an Obsidian Notice. The plugin continues to load normally.

## Error handling

Syntax errors and runtime errors show an Obsidian Notice with the error message. The plugin continues to load normally. Check the developer console for details.
