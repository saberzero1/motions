---
title: Lua recipes
description: Copy-paste Lua snippets for common Vim workflows in Obsidian — display-line navigation, clipboard sync, leader bindings, auto-save, and more.
tags:
    - guide
    - configuration
---

A collection of ready-to-use `init.lua` snippets for common workflows. Each recipe is self-contained — copy it into your vault's `init.lua` and it works. For the full API reference, see [[lua-config]].

## Starter config

A minimal starting point that covers the most common Neovim defaults:

```lua
vim.g.mapleader = " "

vim.opt.scrolloff = 8
vim.opt.clipboard = "unnamedplus"
vim.opt.relativenumber = true

vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode" })
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })
```

See [[quickstart#7. Set up your configuration]] for the guided walkthrough.

## Display-line navigation with counted jumps

Obsidian wraps long lines visually. Remapping `j`/`k` to `gj`/`gk` makes navigation follow display lines — but breaks counted jumps (`5j` lands on the wrong line when wraps exist in between). This expr mapping gives you the best of both:

```lua
vim.keymap.set("n", "j", function()
    if vim.v.count == 0 then
        return "gj"
    else
        return vim.v.count1 .. "j"
    end
end, { expr = true, silent = true })

vim.keymap.set("n", "k", function()
    if vim.v.count == 0 then
        return "gk"
    else
        return vim.v.count1 .. "k"
    end
end, { expr = true, silent = true })
```

Without a count, `j`/`k` move by display line. With a count (`5j`), they move by actual lines — so relative line numbers always match. See [[lua-config#Example: expr mapping with count]] for details on count forwarding.

## System clipboard

### Sync all yanks and pastes

```lua
vim.opt.clipboard = "unnamedplus"
```

Every `y`, `d`, `p` reads from and writes to the system clipboard. See [[settings#Vim engine]] for the full clipboard options.

### Yank to clipboard on demand

Keep vim registers separate from the system clipboard, but add a dedicated mapping:

```lua
vim.keymap.set({"n", "v"}, "<leader>y", '"+y', { desc = "Yank to clipboard" })
vim.keymap.set({"n", "v"}, "<leader>Y", '"+Y', { desc = "Yank line to clipboard" })
vim.keymap.set({"n", "v"}, "<leader>p", '"+p', { desc = "Paste from clipboard" })
```

## Insert mode escape

### Two-key escape

```lua
vim.keymap.set("i", "jk", "<Esc>", { desc = "Exit insert mode" })
```

Or use the built-in setting which also handles timeout:

```lua
vim.opt.insertmodeescape = "jk"
vim.opt.insertmodeescapetimeout = 200  -- ms (default: 100)
```

See [[lua-config#Supported vim.opt options]] for all escape options. For mobile, see [[mobile#Input tips]].

## Centered scrolling

Keep the cursor vertically centered at all times:

```lua
vim.opt.scrolloff = 999
```

Or keep a comfortable margin without full centering:

```lua
vim.opt.scrolloff = 8
```

See [[quality-of-life#Scrolloff]] for details.

## Leader key bindings

### Quick Obsidian command bindings

The simplest way to bind leader keys to Obsidian commands — automatically registers which-key labels:

```lua
vim.g.mapleader = " "

vim.obsidian.leader.add({
    { "e", "file-explorer:reveal-active-file", desc = "Reveal in explorer" },
    { "f", "switcher:open",                    desc = "Find files" },
    { "g", "global-search:open",               desc = "Global search" },
    { "d", "daily-notes:open-today",           desc = "Daily note" },
    { "r", "app:go-back",                      desc = "Go back" },
})
```

See [[lua-config#Leader bindings (vim.obsidian.leader)]] for the full API.

### Function callback bindings

For conditional logic or multi-step actions, use `vim.keymap.set` with a function callback:

```lua
vim.keymap.set("n", "<leader>p", function()
    if vim.fn.expand("%:e") == "md" then
        vim.cmd("obcommand markdown:toggle-preview")
    end
end, { desc = "Toggle preview" })
```

> [!tip] Which-key labels
> `vim.obsidian.leader.add` auto-registers which-key labels from the `desc` field. `vim.keymap.set` with function callbacks requires an explicit `desc` option — function callbacks are opaque and cannot be introspected. See [[which-key#Function callbacks and which-key labels]] for details.

## Auto-save on focus lost

```lua
local g = vim.api.nvim_create_augroup("autosave", { clear = true })

vim.api.nvim_create_autocmd("FocusLost", {
    group = g,
    callback = function()
        vim.cmd("w")
    end,
})
```

For debounced auto-save (avoids rapid saves during window switches):

```lua
local g = vim.api.nvim_create_augroup("autosave", { clear = true })
local timer = vim.uv.new_timer()

vim.api.nvim_create_autocmd("FocusLost", {
    group = g,
    callback = function()
        timer:stop()
        timer:start(500, 0, vim.schedule_wrap(function()
            vim.cmd("w")
        end))
    end,
})
```

See [[lua-config#Async and timers]] for timer APIs.

## Per-vault configuration

```lua
local vault = vim.obsidian.vault_name()

if vault == "work" then
    vim.opt.clipboard = "unnamedplus"
    vim.opt.scrolloff = 5
elseif vault == "personal" then
    vim.opt.clipboard = ""
    vim.opt.scrolloff = 999
end
```

## Per-folder settings via autocmd

Apply different settings based on file location:

```lua
local g = vim.api.nvim_create_augroup("folder-settings", { clear = true })

vim.api.nvim_create_autocmd("BufEnter", {
    group = g,
    pattern = "projects/**",
    callback = function()
        vim.opt.shiftwidth = 4
    end,
})

vim.api.nvim_create_autocmd("BufEnter", {
    group = g,
    pattern = "journal/**",
    callback = function()
        vim.opt.scrolloff = 999
    end,
})
```

See [[lua-config#Autocommands]] for all supported events and patterns.

## Mobile-specific config

```lua
if vim.fn.has("mobile") == 1 then
    vim.opt.easymotion = false
    vim.opt.hintmode = false
    vim.opt.insertmodeescape = "jk"
    vim.opt.relativenumber = false
end
```

See [[mobile]] for mobile-specific tips.

## Which-key group labels

Organize your leader bindings into named groups:

```lua
local wk = vim.obsidian.whichkey

wk.set_group("<leader>f", "Find",  { icon = "search",     color = "blue" })
wk.set_group("<leader>g", "Git",   { icon = "git-branch", color = "orange" })
wk.set_group("<leader>t", "Table", { icon = "table",      color = "green" })
```

See [[which-key#Lua configuration]] for the full which-key API.

## Clear search highlight

```lua
vim.keymap.set("n", "<Esc>", ":noh<CR>", { desc = "Clear search highlight" })
```

Or with `<leader>`:

```lua
vim.keymap.set("n", "<leader>h", ":noh<CR>", { desc = "Clear search highlight" })
```

## Open daily note

```lua
vim.keymap.set("n", "<leader>d", function()
    vim.obsidian.run_command("daily-notes:open-today")
end, { desc = "Open daily note" })
```

Or via the leader convenience API (shorter, auto-registers which-key label):

```lua
vim.obsidian.leader.set("d", "daily-notes:open-today", { desc = "Daily note" })
```

## Toggle preview mode

```lua
vim.keymap.set("n", "<leader>p", function()
    vim.obsidian.run_command("markdown:toggle-preview")
end, { desc = "Toggle preview" })
```

## Navigate panes without `<C-w>` prefix

If you prefer single-chord pane navigation:

```lua
vim.keymap.set("n", "<C-h>", "<C-w>h", { desc = "Focus left pane" })
vim.keymap.set("n", "<C-j>", "<C-w>j", { desc = "Focus down pane" })
vim.keymap.set("n", "<C-k>", "<C-w>k", { desc = "Focus up pane" })
vim.keymap.set("n", "<C-l>", "<C-w>l", { desc = "Focus right pane" })
```

> [!warning] Hotkey conflicts
> These may conflict with Obsidian's default hotkeys. Unbind them in **Settings → Hotkeys** first. See [[ecosystem-compatibility#Potential conflicts]].

## Quick file switching

Open the fuzzy picker with a leader binding:

```lua
vim.keymap.set("n", "<leader>ff", function()
    vim.obsidian.pick("files")
end, { desc = "Find files" })

vim.keymap.set("n", "<leader>fg", function()
    vim.obsidian.pick("livegrep")
end, { desc = "Live grep" })

vim.keymap.set("n", "<leader>fb", function()
    vim.obsidian.pick("buffers")
end, { desc = "Open buffers" })

vim.keymap.set("n", "<leader>fr", function()
    vim.obsidian.pick("recent")
end, { desc = "Recent files" })
```

See [[ex-commands#Picker commands]] for all available picker sources.

## Putting it all together

A complete `init.lua` combining the most popular recipes:

```lua
-- Leader key (set before any keymaps)
vim.g.mapleader = " "

-- Options
vim.opt.scrolloff = 8
vim.opt.clipboard = "unnamedplus"
vim.opt.relativenumber = true
vim.opt.insertmodeescape = "jk"

-- Display-line navigation with counted jumps
vim.keymap.set("n", "j", function()
    if vim.v.count == 0 then return "gj" else return vim.v.count1 .. "j" end
end, { expr = true, silent = true })

vim.keymap.set("n", "k", function()
    if vim.v.count == 0 then return "gk" else return vim.v.count1 .. "k" end
end, { expr = true, silent = true })

-- Common bindings
vim.keymap.set("n", "<Esc>", ":noh<CR>", { desc = "Clear search highlight" })

-- Leader bindings (auto-registers which-key labels)
vim.obsidian.leader.add({
    { "e", "file-explorer:reveal-active-file", desc = "Reveal in explorer" },
    { "d", "daily-notes:open-today",           desc = "Daily note" },
    { "r", "app:go-back",                      desc = "Go back" },
})

-- Picker
vim.keymap.set("n", "<leader>ff", function() vim.obsidian.pick("files") end, { desc = "Find files" })
vim.keymap.set("n", "<leader>fg", function() vim.obsidian.pick("livegrep") end, { desc = "Live grep" })

-- Which-key groups
vim.obsidian.whichkey.set_group("<leader>f", "Find", { icon = "search", color = "blue" })

-- Mobile overrides
if vim.fn.has("mobile") == 1 then
    vim.opt.easymotion = false
    vim.opt.hintmode = false
end
```

For community plugin integrations (Better Paste, etc.), see [[plugin-integration]].
