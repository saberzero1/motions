---
title: Undo tree
description: Branching undo history visualization with g+/g- navigation, sidebar view, and persistence.
tags:
    - features
---

# Undo tree

Vim Motions tracks branching undo history in a shadow tree parallel to CM6's linear undo stacks. When you undo and make a new edit, the old "future" becomes an alternative branch — accessible via `g-`/`g+` or `:earlier`/`:later`. Inspired by Neovim's [undotree](https://github.com/mbbill/undotree).

## Navigation

### Chronological (`g-`/`g+`)

`g-` moves to the chronologically older state across ALL branches. `g+` moves to the chronologically newer state. The buffer content changes — you see the document revert or advance.

Unlike `u`/`Ctrl-R` which only navigate the current branch, `g-`/`g+` traverse every state in the order it was created, regardless of which branch it's on.

### By count (`:earlier`/`:later`)

| Command       | Effect                         |
| ------------- | ------------------------------ |
| `:earlier N`  | Go back N changes              |
| `:later N`    | Go forward N changes           |
| `:earlier Ns` | Go to state from N seconds ago |
| `:earlier Nm` | Go to state from N minutes ago |
| `:earlier Nh` | Go to state from N hours ago   |
| `:earlier Nd` | Go to state from N days ago    |
| `:earlier Nf` | Go to Nth previous save point  |
| `:later Nf`   | Go to Nth next save point      |

### Undo list (`:undolist`)

`:undolist` opens a modal showing all undo tree nodes with their sequence number, timestamp, change summary, save status, and branch count. The current node is marked with `>`.

## Sidebar view

`:UndoTreeToggle` (or `:UndoTreeShow`/`:UndoTreeHide`) opens a sidebar panel showing the undo tree as a visual hierarchy.

### Keyboard navigation

| Key     | Action                    |
| ------- | ------------------------- |
| `j`     | Select next node          |
| `k`     | Select previous node      |
| `Enter` | Navigate to selected node |
| `q`     | Close sidebar             |

Click any node to navigate to it.

### Features

- **Relative timestamps** — "3m ago", "1h ago"
- **Change summary** — "+7 chars, -3 chars"
- **Branch indicators** — shows when a node has multiple children
- **Collapse/expand** — click the toggle to collapse alternate branches
- **Current node highlight** — the active state is visually distinct
- **Saved markers** — nodes where the file was saved are flagged

## Lua API

`vim.fn.undotree()` returns a Neovim-compatible dictionary:

```lua
local tree = vim.fn.undotree()
print(tree.seq_last)   -- highest sequence number
print(tree.seq_cur)    -- current position
print(tree.time_cur)   -- timestamp of current state (Unix seconds)
print(#tree.entries)   -- number of entries on the main branch
```

## Settings

Configure via **Settings → Vim Motions → Undo tree** or vimrc/Lua:

| Setting            | Default | Description                                     |
| ------------------ | ------- | ----------------------------------------------- |
| `enableUndoTree`   | `true`  | Enable undo tree tracking                       |
| `undoTreeMaxNodes` | `1000`  | Maximum nodes per file (oldest branches pruned) |
| `undoTreePosition` | `right` | Sidebar position (left/right)                   |
| `undoTreeAutoOpen` | `false` | Auto-open sidebar on branch creation            |
| `undoFile`         | `false` | Persist undo tree across sessions               |

### Vimrc

```vim
set undotree          " enable (default)
set noundotree        " disable
set undofile          " persist across sessions
set noundofile        " session-only (default)
```

### Lua

```lua
vim.opt.undotree = true
vim.opt.undofile = true
vim.opt.undotreemaxnodes = 500
```
