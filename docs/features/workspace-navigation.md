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
- `gp` and `gP`: Paste and move cursor past pasted text.
- `grn`: Rename the current file.
- `grr`: Show backlinks for the current file.
- `gra`: Show context actions (code actions).

## Folds

Control Markdown folding with standard Vim fold commands:

- `za`: Toggle the fold at the current line.
- `zc`: Close the fold at the current line.
- `zo`: Open the fold at the current line.
- `zO`, `zC`, `zA`: Functionally equivalent to their non-recursive counterparts in Obsidian's flat heading structure.
- `zM`: Close all folds in the document.
- `zR`: Open all folds in the document.

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

All non-editor key bindings can be customized via `.obsidian.vimrc` using `gmap`, `gnoremap`, and `gunmap`. These commands define, override, or remove key bindings that work outside the editor.

```vim
" Add a new binding
gmap <leader>f :obcommand switcher:open

" Override a default binding
gmap H :obcommand app:go-back

" Remove a default binding entirely
gunmap L
```

The right-hand side supports `:obcommand <id>` for Obsidian commands and `:<ex-command>` for global ex commands (`:sidebar`, `:split`, `:grep`, etc.).

Use `:gmap` in the ex command line to list all active global bindings with their source (default or user).

The non-editor which-key overlay shows available completions when a partial key sequence is pending (e.g., pressing `<C-w>` shows all window commands). Label your bindings with `gwhichkeylabel` and `gwhichkeygroup` in vimrc. See [[vimrc#Global key mappings]] for full syntax.

## Configuration

Workspace navigation is enabled by default. You can toggle it or configure it through the following methods:

- **Settings**: Toggle via **Settings → Vim Motions → Workspace navigation**.
- **Vimrc**: Add `set workspacenav` to your `.obsidian.vimrc` to ensure it is enabled.

See [[known-limitations#Workspace & hint mode]] for detailed technical limitations.
