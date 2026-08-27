---
title: Community plugin integration
description: Lua recipes for integrating Vim Motions with popular Obsidian community plugins using vim.obsidian.run_command and vim.keymap.set.
tags:
    - guide
    - configuration
---

Vim Motions can invoke any Obsidian command from Lua via `vim.obsidian.run_command(id)`. This makes it straightforward to wire vim keybindings to community plugin actions — no plugin-specific support needed on either side.

## General pattern

Every Obsidian plugin registers commands with a unique ID in the format `plugin-id:command-name`. You can discover available IDs by running `:ob` without arguments (opens a list) or calling `vim.obsidian.list_commands()` in Lua.

The basic recipe is:

```lua
vim.keymap.set("n", "<key>", function()
    vim.obsidian.run_command("plugin-id:command-name")
end, { desc = "Description for which-key" })
```

> [!tip] Finding command IDs
> Open the command palette (`Ctrl+P`), type the plugin name, and note the command text. Then run `:ob` to find the matching ID. Alternatively, inspect the plugin's source code for `addCommand({ id: '...' })` calls.

> [!tip] Timing with async commands
> Some plugin commands are async (they fetch data, open dialogs, or modify the document after a delay). If you need to run something _after_ the command completes, wrap it in `vim.schedule`:
>
> ```lua
> vim.obsidian.run_command("plugin-id:command-name")
> vim.schedule(function()
>     -- runs on the next event loop tick
> end)
> ```

## Better Paste

[Better Paste](https://github.com/johansan/better-paste/) by Johan Sanneblad cleans up pasted text — stripping invisible characters, straightening curly quotes, removing URL tracking parameters, and optionally downloading images. By default it hooks `Ctrl+V` / `Cmd+V`, but vim's `p`/`P` operators bypass that hook because they paste from vim registers, not the system clipboard.

The recipes below route vim paste through Better Paste's formatting pipeline using its registered commands.

### Available commands

| Command ID                              | What it does                                     |
| --------------------------------------- | ------------------------------------------------ |
| `better-paste:paste`                    | Paste clipboard through full formatting pipeline |
| `better-paste:paste-raw`                | Paste as plain text, no transforms               |
| `better-paste:selection-clean`          | Clean up current selection                       |
| `better-paste:selection-clean-terminal` | Clean up terminal output in selection            |
| `better-paste:selection-clean-pdf`      | Clean up PDF text in selection (opens dialog)    |
| `better-paste:selection-run-snippet`    | Run a user-defined snippet on selection          |
| `better-paste:toggle-cleanup`           | Toggle automatic cleanup on/off                  |

### Option 1: Remap `p` and `P` to Better Paste

Replace vim's native paste with Better Paste in normal mode. This enters insert mode at the correct position (after cursor for `p`, before for `P`), fires the paste command, then returns to normal mode:

```lua
-- p -- paste after cursor through Better Paste
vim.keymap.set("n", "p", function()
    vim.cmd("normal! a")
    vim.obsidian.run_command("better-paste:paste")
    vim.schedule(function()
        vim.cmd("stopinsert")
    end)
end, { desc = "Paste after (Better Paste)" })

-- P -- paste before cursor through Better Paste
vim.keymap.set("n", "P", function()
    vim.cmd("normal! i")
    vim.obsidian.run_command("better-paste:paste")
    vim.schedule(function()
        vim.cmd("stopinsert")
    end)
end, { desc = "Paste before (Better Paste)" })
```

`vim.schedule` defers the `stopinsert` to the next event loop tick, giving the synchronous part of Better Paste's pipeline time to insert text before the mode switches back. Async post-processing (image downloads, link title fetches) runs independently and does not need insert mode.

> [!warning] Register behavior
> This reads from the **system clipboard**, not vim registers. Yanking into a named register (`"ay`) and pressing `p` will paste whatever is on the system clipboard, not register `a`. If you use named registers frequently, consider Option 2 instead.

### Option 2: Leader mappings (keep native `p`/`P`)

Keep vim's native paste for register operations and add leader-prefixed mappings for Better Paste:

```lua
-- <leader>p -- paste through Better Paste
vim.keymap.set("n", "<leader>p", function()
    vim.obsidian.run_command("better-paste:paste")
end, { desc = "Paste (Better Paste)" })

-- <leader>P -- paste raw (no formatting)
vim.keymap.set("n", "<leader>P", function()
    vim.obsidian.run_command("better-paste:paste-raw")
end, { desc = "Paste raw (Better Paste)" })
```

### Option 3: Clean selection after native paste

Paste normally with `p`, then clean up the pasted text on demand:

```lua
-- <leader>c -- clean up selection with Better Paste rules
vim.keymap.set("n", "<leader>c", function()
    vim.obsidian.run_command("better-paste:selection-clean")
end, { desc = "Clean selection (Better Paste)" })
```

This preserves vim's full register and linewise/charwise behavior, then applies Better Paste's text cleanup as a separate step.

### Toggle automatic cleanup

```lua
-- <leader>bt -- toggle Better Paste auto-cleanup
vim.keymap.set("n", "<leader>bt", function()
    vim.obsidian.run_command("better-paste:toggle-cleanup")
end, { desc = "Toggle auto-cleanup (Better Paste)" })
```

## Writing your own integration

Any plugin that registers commands can be integrated the same way:

1. **Find the command ID** — run `:ob` or check the plugin's source for `addCommand` calls.
2. **Create a keymap** — use `vim.keymap.set` with a function callback that calls `vim.obsidian.run_command(id)`.
3. **Add a description** — the `desc` option appears in which-key popups.
4. **Handle timing** — if you need to act after the command, use `vim.schedule` to defer to the next tick.

```lua
-- Generic template
vim.keymap.set("n", "<leader>x", function()
    vim.obsidian.run_command("my-plugin:my-command")
end, { desc = "Do something (My Plugin)" })
```

For commands that need insert mode context (like paste), enter insert mode first with `vim.cmd("normal! a")` or `vim.cmd("normal! i")` and exit afterward with `vim.cmd("stopinsert")` inside a `vim.schedule` callback.

See [[lua-config#Obsidian namespace]] for the full `vim.obsidian` API reference, and [[ex-commands#ob--obcommand--execute-obsidian-commands]] for the vimrc equivalent using `:obcommand`.
