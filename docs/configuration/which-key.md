---
title: Which-key
description: Configure which-key hints to show available key continuations in a popup as you type partial key sequences.
tags:
    - configuration
---

Which-key shows available key continuations in a popup after you press a partial key sequence. Similar to Neovim's [which-key.nvim](https://github.com/folke/which-key.nvim), it helps you discover and remember keybindings without consulting documentation.

## Modes

Configure via **Settings → Vim Motions → Which-key hints**, `vim.opt.whichkey = "mode"` in Lua, or `set whichkey=<mode>` in vimrc.

| Mode     | Behavior                                         |
| -------- | ------------------------------------------------ |
| `off`    | No popup (default)                               |
| `leader` | Popup appears only after pressing the leader key |
| `all`    | Popup appears after any partial key sequence     |

This setting controls which-key in **both** editor and non-editor contexts. In non-editor views (graph, canvas, PDF, reading mode), the which-key popup shows global binding completions — for example, pressing `<C-w>` shows available window commands (`h`, `j`, `k`, `l`, `v`, `s`, etc.).

In `all` mode, pressing `d` shows available motions and text objects, `g` shows g-prefixed commands, `z` shows fold commands, `[` and `]` show bracket motions, etc.

## Popup delay

Configure via **Settings → Vim Motions → Which-key popup delay**, `vim.opt.whichkeydelay = <ms>` in Lua, or `set whichkeydelay=<ms>` (alias `wkd`) in vimrc.

The delay controls how long to wait (in milliseconds) before the which-key popup first appears after a partial key sequence. The default is `500` ms. Set to `0` for instant display.

Once the popup is visible, subsequent keystrokes update it **instantly** — the delay only applies to the initial appearance. Single-key commands that resolve immediately (like `j`, `k`) never trigger the popup regardless of delay.

```lua
vim.opt.whichkeydelay = 300 -- show after 300ms
```

```vim
" Or via vimrc:
set whichkeydelay=300
set wkd=0
```

## Grouping

Configure via **Settings → Vim Motions → Which-key leader grouping**, `vim.opt.whichkeygrouping = "mode"` in Lua, or `set whichkeygrouping=<mode>` in vimrc.

| Mode      | Behavior                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grouped` | Collapse bindings by prefix (default). Pressing `<leader>` shows `t → Table (+11)` instead of listing all table commands. Press `t` to drill into the group. |
| `flat`    | Show all bindings in a flat list without grouping                                                                                                            |

## Sort order

Configure via **Settings → Vim Motions → Which-key hints → Which-key sort order**, `vim.opt.whichkeysort = "order"` in Lua, or `set whichkeysort=<order>` (alias `wks`) in vimrc.

| Mode           | Behavior                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `which-key`    | Matches which-key.nvim defaults (default). Individual keys first, groups last. Alphanumeric keys before special keys (`<…>`). Natural alphabetical tiebreaker. |
| `groups-first` | Groups appear before individual keys. Both categories sorted alphabetically.                                                                                   |

```lua
vim.opt.whichkeysort = "groups-first"
```

```vim
" Or via vimrc:
set whichkeysort=groups-first
set wks=which-key
```

## Icons

Configure via **Settings → Vim Motions → Which-key hints → Which-key icons**, `vim.opt.whichkeyicons = true` in Lua, or `set whichkeyicons` in vimrc.

When enabled, icons appear next to entries in the which-key popup. Built-in groups (Table, EasyMotion, Harpoon, etc.) show default icons automatically.

### Assigning icons to groups

Icons use [Lucide](https://lucide.dev/icons) icon names from Obsidian's built-in icon library.

```lua
vim.obsidian.whichkey.set_group("<leader>t", "Table", { icon = "table", color = "blue" })
vim.obsidian.whichkey.set_group("<leader>g", "Git", { icon = "git-branch", color = "orange" })
```

```vim
" Or via vimrc:
whichkeygroup <leader>t Table icon=table color=blue
whichkeygroup <leader>g Git icon=git-branch color=orange
```

### Assigning icons to individual bindings

```lua
vim.obsidian.whichkey.set_label("<leader>w", "Save file", { icon = "save", color = "green" })
```

```vim
whichkeylabel <leader>w Save file icon=save color=green
```

### Batch assignment with `add()`

```lua
vim.obsidian.whichkey.add({
    { "<leader>t", group = "Table", icon = "table", color = "blue" },
    { "<leader>w", desc = "Save file", icon = "save", color = "green" },
    { "<leader>f", group = "Find", icon = "search", color = "cyan" },
})
```

### Colors

Named colors map to Obsidian's theme variables and adapt to light/dark mode:

| Name     | CSS Variable     |
| -------- | ---------------- |
| `red`    | `--color-red`    |
| `orange` | `--color-orange` |
| `yellow` | `--color-yellow` |
| `green`  | `--color-green`  |
| `cyan`   | `--color-cyan`   |
| `blue`   | `--color-blue`   |
| `purple` | `--color-purple` |
| `pink`   | `--color-pink`   |

Arbitrary CSS colors are also accepted (e.g., `#ff6600`, `rgb(100, 200, 50)`). Named colors are recommended for theme compatibility.

If no color is specified, icons use `--text-muted` for a subtle appearance.

### Default icons

Built-in groups automatically receive icons when which-key icons are enabled:

| Group      | Icon     | Color  |
| ---------- | -------- | ------ |
| Table      | `table`  | blue   |
| EasyMotion | `zap`    | yellow |
| Harpoon    | `anchor` | orange |

These defaults can be overridden by setting a custom icon on the same group prefix.

Icons can also be configured in **Settings → Vim Motions → Which-key group labels** and **Which-key command labels** using the icon and color fields.

## Group labels

Name groups by their key prefix to give the collapsed group a descriptive label.

```lua
vim.obsidian.whichkey.set_group("<leader>t", "Table")
vim.obsidian.whichkey.set_group("<leader>g", "Git")
vim.obsidian.whichkey.set_group("<leader>f", "Find")
```

```vim
" Or via vimrc:
whichkeygroup <leader>t Table
whichkeygroup <leader>g Git
whichkeygroup <leader>f Find
```

Group labels can also be configured in **Settings → Vim Motions → Which-key group labels**. Use the leader character + prefix for leader groups (e.g., `\t` for table if leader is `\`), or a raw prefix for non-leader groups.

Built-in features register default group labels. Your entries override the defaults for the same prefix.

## Command labels

Describe individual bindings shown in the which-key popup.

In Lua, use the `desc` option in `vim.keymap.set`:

```lua
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })
-- The `desc` option automatically appears in which-key
```

In vimrc:

```vim
whichkeylabel <leader>w Save file
whichkeylabel <leader>q Close tab
whichkeylabel gd Go to definition
whichkeylabel gO Document outline
```

Command labels can also be configured in **Settings → Vim Motions → Which-key command labels**. Labels set in vimrc appear as read-only rows in the settings UI.

## Batch labels (`add()`)

Define multiple group and command labels at once with `vim.obsidian.whichkey.add()`, similar to Neovim's [which-key.nvim](https://github.com/folke/which-key.nvim) `wk.add()` syntax:

```lua
vim.obsidian.whichkey.add({
    { "<leader>f", group = "Find" },
    { "<leader>g", group = "Git" },
    { "<leader>t", group = "Table" },
    { "<leader>w", desc = "Save file" },
    { "<leader>q", desc = "Close tab" },
})
```

Each entry is a table where the first element is the key sequence. Use `group` to name a prefix group or `desc` to label an individual binding.

The `context` field works the same as in `set_group`/`set_label`:

```lua
vim.obsidian.whichkey.add({
    { "<leader>f", group = "Find", context = "global" },
    { "<leader>e", desc = "Reveal in explorer", context = "global" },
})
```

> [!tip] Neovim-style `wk` shorthand
> Assign `vim.obsidian.whichkey` to a local for a more familiar feel:
>
> ```lua
> local wk = vim.obsidian.whichkey
> wk.add({
>     { "<leader>f", group = "Find" },
>     { "<leader>g", group = "Git" },
>     { "<leader>t", group = "Table" },
> })
> ```

> [!info] Reserved fields
> The `mode` field is accepted but currently ignored. It is reserved for future mode-scoped label support.

## Merge behavior

Group and command labels from Lua, vimrc, and Settings are merged. If the same key appears in multiple sources, the hierarchy is: Lua > vimrc > Settings.

## Tips

> [!tip] Start with leader-only mode
> If you're new to which-key, start with `vim.opt.whichkey = "leader"` to see the popup only for leader bindings. Switch to `all` once you're comfortable.

> [!tip] Organize with groups
> Use the `desc` option in Lua or `whichkeygroup` in vimrc to name your custom leader binding groups. The grouped display is more readable when you have many bindings.

## Global (non-editor) labels

Label global bindings separately from editor bindings:

```lua
vim.obsidian.keymap.set("<leader>f", ":obcommand switcher:open", { desc = "Open file" })
vim.obsidian.whichkey.set_group("<leader>", "+leader", { context = "global" })
vim.obsidian.whichkey.set_label("<leader>e", "Reveal in explorer", { context = "global" })
```

The `desc` option in `vim.obsidian.keymap.set` automatically creates a global which-key label. Use `vim.obsidian.whichkey.set_group/set_label` with `{ context = "global" }` for additional labels.

```vim
" Or via vimrc:
gwhichkeygroup <leader> +leader bindings
gwhichkeylabel <leader>f Open file
gwhichkeylabel <leader>e Reveal in explorer
```

These labels appear in the non-editor which-key overlay. They are independent from editor which-key labels — the same key prefix can have different labels in each context.

See [[vimrc#Global key mappings]] for how to define global bindings with `gmap`, or [[lua-config#Global keymaps]] for the Lua equivalent.

## Automatic labels from leader bindings

The `vim.obsidian.leader` convenience API automatically registers which-key labels when you provide a `desc` option:

```lua
vim.g.mapleader = " "

-- desc automatically becomes a which-key command label
vim.obsidian.leader.set("e", "file-explorer:reveal-active-file", { desc = "Reveal in explorer" })
vim.obsidian.leader.set("p", "command-palette:open", { desc = "Command palette" })

-- Batch registration:
vim.obsidian.leader.add({
    { "ff", "switcher:open", desc = "Find file" },
    { "fg", "global-search:open", desc = "Grep" },
})
```

Each binding's `desc` is registered as a which-key command label for the resolved leader key sequence (e.g., `<Space>e` → "Reveal in explorer"). No separate `whichkeylabel` or `vim.obsidian.whichkey.set_label` call is needed.

### Automatic labels from vim.keymap.set

Leader-prefixed keymaps registered via `vim.keymap.set` with a `desc` option automatically appear in the which-key overlay:

```lua
vim.keymap.set("n", "<leader>ff", function()
    vim.cmd("obcommand switcher:open")
end, { desc = "Find file" })
-- "ff → Find file" appears in which-key when leader is pressed
```

Group labels set via `vim.obsidian.whichkey.add()` work with both `vim.keymap.set` and `vim.obsidian.leader.add` bindings:

```lua
local wk = vim.obsidian.whichkey
wk.add({
    { "<leader>f", group = "Find" },
})

vim.keymap.set("n", "<leader>ff", function()
    vim.cmd("obcommand switcher:open")
end, { desc = "Find file" })

vim.keymap.set("n", "<leader>fg", function()
    vim.cmd("obcommand global-search:open")
end, { desc = "Grep" })
-- Pressing leader shows: f → Find (+2)
-- Pressing leader then f shows: f → Find file, g → Grep
```

### Automatic descriptions for obcommand mappings

When a key is mapped to `:obcommand <id><CR>` or `:ob <id><CR>` without a `desc` option, the which-key popup automatically resolves and displays Obsidian's native command name instead of the raw ex command string:

```lua
-- No desc needed — which-key shows "Navigate back" (Obsidian's native name)
vim.keymap.set("n", "<leader>r", ":ob app:go-back<CR>")

-- Explicit desc still takes priority
vim.keymap.set("n", "<leader>r", ":ob app:go-back<CR>", { desc = "Go back" })
-- which-key shows: "Go back"
```

This also works for global mappings via `:gmap` in vimrc:

```vim
gmap <leader>q :obcommand workspace:close
" which-key shows: "Close current tab" (Obsidian's native name)
```

If the command ID doesn't exist (e.g., from an uninstalled plugin), the description falls back to the raw command string. Resolved names are automatically localized — Obsidian's built-in commands already have translated names, so descriptions match your Obsidian language setting.

See [[lua-config#Leader bindings]] for the full API reference.

## Oil explorer context

When the Oil file explorer is open and Obsidian's built-in vim mode is disabled (fork mode), the which-key popup shows Oil-specific keybindings (`g.`, `gs`, `gf`, `g?`) with descriptive labels alongside standard bindings. Oil bindings appear as individual completions when typing partial keys — they are dynamically mapped on `OilEnter` and removed on `OilLeave`, so they only appear in which-key while an Oil view is active. Press `g?` in Oil to toggle a static help overlay listing all Oil keybindings.

> [!info] Fork mode only
> Oil which-key integration requires fork mode (built-in vim disabled). With built-in vim enabled, the embedded Oil editor does not have access to the fork's CM adapter.
