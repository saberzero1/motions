---
title: Workspace navigation
description: Navigate panes, tabs, splits, and sidebar with Neovim-style window management. This works across all Obsidian views.
tags:
    - features
    - keybindings
---

Vim Motions provides Neovim-style window management that works across all Obsidian views. This includes a global key handler that intercepts keystrokes even when no editor is focused, allowing you to control the entire workspace with your keyboard.

## Pane and split navigation

Manage your workspace layout using standard Vim window commands. The plugin supports splitting panes, navigating between them, and closing tabs using the `<C-w>` prefix.

![[keybindings#Workspace navigation]]

The `<C-w>` prefix allows for intuitive movement between splits. Use `<C-w>h`, `<C-w>j`, `<C-w>k`, and `<C-w>l` to move focus to the left, bottom, top, or right pane respectively.

### Pane cycling

- `<C-w>w`: Cycle to the next pane.
- `<C-w>W`: Cycle to the previous pane.
- `<C-w>p`: Focus the previously accessed pane (tracked via leaf ID).

## Alternate file and link navigation

- `<C-^>` / `<C-6>`: Switch between the current file and the alternate (previously edited) file. Matches Neovim's `<C-^>` behavior.
- `<C-]>`: Follow the link under the cursor (alias for `gd`).
- `<C-t>`: Pop from link follow — navigates backward through the jump list.

## Tab navigation

`gt` and `gT` cycle through tabs. `gt` supports a count prefix matching Neovim behavior:

- `gt` — go to the next tab (wraps around)
- `gT` — go to the previous tab
- `Ngt` — go to the Nth tab (e.g., `3gt` goes to the 3rd tab)

Tab numbering only counts main editor area tabs — sidebar panes are excluded. When the count exceeds the number of open tabs, the cursor stays on the current tab.

This works in both editor and non-editor views (graph, canvas, reading view, etc.).

> [!warning] Control-W Conflict
> Obsidian's default **Close current tab** hotkey is bound to `Ctrl+W`. You must unbind it in **Settings → Hotkeys** (search for "Close current tab") for the `<C-w>` prefix commands to work. Once unbound, you can close tabs using `:q`, `:quit`, `<C-w>c`, or `<C-w>q`.

## Go-to-definition

Navigate your notes by following links with Vim commands. These commands use Obsidian's internal link resolver to find the target file.

- `gd`: Follow the link under the cursor in the current pane.
- `gD`: Open the link under the cursor in a new tab.
- `<C-w>gd`: Open the link under the cursor in a horizontal split.
- `<C-w>gD`: Open the link under the cursor in a vertical split.

## Document commands

Vim Motions adds several document-level commands for quick access to Obsidian features:

- `gO`: Open the document outline (symbols).
- `g<C-g>`: Show document statistics (word count, character count).
- `ga`: Show information about the character under the cursor.
- `gm`: Go to the middle of the screen line (horizontal midpoint).
- `go`: Go to the Nth byte offset in the buffer (with count prefix).
- `g8`: Show the UTF-8 hex byte values for the character under the cursor.
- `gF`: Open the file path under the cursor, optionally jumping to a line number suffix (e.g., `file.md:42`).
- `<C-g>`: Show file info — filename, line count, cursor position, and percentage through the file.
- `gp` and `gP`: Paste and move cursor past pasted text.

> [!info] Workspace actions formerly on `grn`/`grr`/`gra`
> In earlier versions, `grn` (rename note), `grr` (show backlinks), and `gra`
> (context actions) were available as key bindings. These have been moved to
> `<leader>rn`, `<leader>rb`, and `<leader>ra` respectively (and are always
> available as ex commands — `:renamenote`, `:showbacklinks`, `:contextactions`)
> because the `gr` prefix is now used for the
> [[keybindings#Replace-with-register operator|replace-with-register operator]].
> You can re-bind them to their old keys in your vimrc or Lua config if you prefer:
>
> ```vim
> " .obsidian.vimrc
> nnoremap grn :renamenote<CR>
> nnoremap grr :showbacklinks<CR>
> nnoremap gra :contextactions<CR>
> ```

## Folds

Control Markdown folding with standard Vim fold commands:

- `za`: Toggle the fold at the current line.
- `zc`: Close the fold at the current line.
- `zo`: Open the fold at the current line.
- `zO`, `zC`, `zA`: Functionally equivalent to their non-recursive counterparts in Obsidian's flat heading structure.
- `zM`: Close all folds in the document.
- `zR`: Open all folds in the document.
- `zf{motion}`: Create a manual fold over the motion range (also works in visual mode).
- `zd` / `zD`: Delete the fold at the cursor.
- `zE`: Eliminate all folds in the document.
- `zm`: Fold one more heading level (incrementally folds h1, then h2, etc.).
- `zr`: Fold one less heading level (unfolds the most recently folded level).

### Fold motions

`zj` and `zk` move between foldable regions in the document. `zj` moves to the start of the next foldable region below the cursor; `zk` moves to the end of the previous foldable region above the cursor. Both work with counts (e.g., `3zj` skips to the 3rd fold) and operators (e.g., `dzj` deletes to the next fold).

`[z` and `]z` navigate within the current fold. `[z` jumps to the start of the enclosing foldable region; `]z` jumps to its end. If the cursor is not inside a foldable region, these are no-ops.

### Fold state

`zn` disables folding (opens all folds and prevents new folds from being created). `zN` re-enables folding. `zi` toggles between the two states. Configure via `set foldenable` / `set nofoldenable` in vimrc or `vim.opt.foldenable` in Lua.

`zv` opens just enough folds to make the cursor line visible. `zx` reapplies the current fold level (from `zm`/`zr`) and then reveals the cursor line. `zX` reapplies the fold level without revealing the cursor.

### Recursive fold operations

The uppercase fold commands (`zO`, `zC`, `zA`, `zD`) operate recursively on all folds within the cursor's fold region, while the lowercase variants (`zo`, `zc`, `za`, `zd`) operate on a single fold level.

In addition to heading-level folds, the plugin provides dedicated fold providers for **frontmatter** (`---` blocks) and **callouts** (`> [!type]`), making them foldable via `zc`/`zo`/`za`. Folded regions show descriptive placeholder text including the heading title, code language, or callout type.

When **Fold-aware navigation** is enabled (**Settings → Vim Motions → Fold-aware navigation**, on by default), jumping into a folded section with a categorized motion automatically unfolds it, matching Neovim's `foldopen` option. Plain vertical motions such as `j` and `k` leave folds closed — exactly as in Neovim. The default categories are `block,hor,mark,percent,search,undo`, which means structural motions (`]h`, `{`, `}`), horizontal motions (`w`, `f`, `$`), mark jumps (`'a`, `` `a ``), `%`, search (`n`, `/`), and undo/redo all trigger auto-unfold. Use `set foldopen=…` (alias `set fdo=…`) in your vimrc or Lua config for fine-grained control — for example, `set foldopen=all` to unfold on every motion, or `set foldopen=block,search` to unfold only on structural and search motions.

When **Fold persistence** is enabled (**Settings → Vim Motions → Fold persistence**), fold state is remembered across file switches and sessions. Folds are restored when re-opening a previously folded file.

The viewport automatically scrolls to keep the cursor visible after any fold or unfold operation, including Obsidian's **Toggle fold properties** command. The scroll is scoped to actual fold state changes (`is-collapsed` class toggle) — class mutations from third-party plugins (e.g., Meta Bind input fields in the properties panel) do not trigger unwanted scroll jumps.

When **Fold column** is enabled (`set foldcolumn` or **Settings → Vim Motions → Vim features → Fold column**), fold indicators appear in the gutter: `▸` for foldable regions and `▾` for folded regions. Clicking an indicator toggles the fold.

Clicking Obsidian's native fold gutter or the plugin's fold column to unfold a region always works — the plugin includes an unfold range normalizer that corrects mismatched `unfoldEffect` ranges from any source, ensuring unfolds succeed even when the dispatched range doesn't exactly match the stored fold decoration.

## Non-editor view support

The global key handler extends Vim control to non-editor views like PDFs, the graph view, canvas, and the file explorer.

> [!info] Global Key Handler
> When no editor is focused, the global key handler intercepts workspace-relevant keystrokes. If an editor is focused, events propagate to the Vim engine normally.

### Scrolling

You can scroll through any scrollable view using standard Vim keys:

- `j` and `k`: Scroll down or up by a few lines.
- `gg` and `G`: Jump to the top or bottom of the view.
- `Ctrl-u` and `Ctrl-d`: Scroll up or down by half a page.
- `Ctrl-b` and `Ctrl-f`: Scroll up or down by a full page.

> [!warning] Scrolling Hotkey Conflicts
> Obsidian's default hotkeys for `Ctrl-d` (delete paragraph), `Ctrl-f` (search), and `Ctrl-b` (toggle bold/sidebar) intercept these keys before the plugin can see them. To use these for scrolling, you must unbind the conflicting hotkeys in **Settings → Hotkeys**.

### Standalone Ex Command Line

Pressing `:` in a non-editor view opens a standalone command modal. This modal supports globally-safe Ex commands like `:q`, `:wq`, `:e`, and `:sp`.

![[keybindings#Non-editor view bindings]]

## Customizing global bindings

All non-editor key bindings can be customized via `.obsidian.init.lua` or `.obsidian.vimrc`. These commands define, override, or remove key bindings that work outside the editor.

```lua
-- Add a new binding in Lua
vim.keymap.set("n", "<leader>f", ":obcommand switcher:open", { desc = "Open file" })
```

```vim
" Or via vimrc:
gmap <leader>f :obcommand switcher:open

" Override a default binding
gmap H :obcommand app:go-back

" Remove a default binding entirely
gunmap L
```

The right-hand side supports `:obcommand <id>` for Obsidian commands and `:<ex-command>` for global ex commands (`:sidebar`, `:split`, `:grep`, etc.).

Use `:gmap` in the ex command line to list all active global bindings with their source (default or user).

The non-editor which-key overlay shows available completions when a partial key sequence is pending (e.g., pressing `<C-w>` shows all window commands). Label your bindings with the `desc` option in Lua or `gwhichkeylabel` and `gwhichkeygroup` in vimrc. See [[lua-config]] or [[vimrc#Global key mappings]] for full syntax.

## Plugin view compatibility

When a plugin view (such as Spaced Repetition flashcard review, Excalidraw, or any third-party plugin leaf) is active, Vim Motions automatically passes most keystrokes through to the plugin. Only structural navigation keys are intercepted:

| Keys               | Behavior in plugin views      |
| ------------------ | ----------------------------- |
| `<C-w>h/j/k/l`     | Navigate between panes        |
| `<C-w>v`, `<C-w>s` | Split vertically/horizontally |
| `<C-w>c`, `<C-w>q` | Close tab                     |
| `gt`, `gT`         | Next/previous tab             |
| `<C-o>`, `<C-i>`   | History back/forward          |
| `:`                | Open command line             |

Keys like `j`, `k`, `1`–`9`, `H`, `L`, and scroll commands pass through to the plugin view, allowing the plugin to handle them natively.

### Customizing the view type whitelist

By default, content-interaction keys (scrolling, count prefix, tab shortcuts) are intercepted in these view types: `markdown`, `graph`, `pdf`, `canvas`, `empty`, `image`, `bases`. All other view types are treated as plugin views.

Override this in **Settings → Vim Motions → Workspace navigation view types** or via vimrc/Lua:

```vim
set workspacenavviewtypes=markdown,graph,pdf,canvas,empty,image,bases,excalidraw
```

```lua
vim.opt.workspacenavviewtypes = "markdown,graph,pdf,canvas,empty,image,bases,excalidraw"
```

## Configuration

Workspace navigation is enabled by default. You can toggle it or configure it through the following methods:

- **Settings**: Toggle via **Settings → Vim Motions → Workspace navigation**.
- **Lua**: Add `vim.opt.workspacenav = true` to your `.obsidian.init.lua`.
- **Vimrc**: Add `set workspacenav` to your `.obsidian.vimrc`.

See [[known-limitations#Workspace & hint mode]] for detailed technical limitations.
