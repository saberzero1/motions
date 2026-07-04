---
title: Which-key
description: Configure which-key hints to show available key continuations in a popup as you type partial key sequences.
tags:
    - configuration
---

Which-key shows available key continuations in a popup after you press a partial key sequence. Similar to Neovim's [which-key.nvim](https://github.com/folke/which-key.nvim), it helps you discover and remember keybindings without consulting documentation.

## Modes

Configure via **Settings → Vim Motions → Which-key hints** or `set whichkey=<mode>` in vimrc.

| Mode     | Behavior                                         |
| -------- | ------------------------------------------------ |
| `off`    | No popup (default)                               |
| `leader` | Popup appears only after pressing the leader key |
| `all`    | Popup appears after any partial key sequence     |

This setting controls which-key in **both** editor and non-editor contexts. In non-editor views (graph, canvas, PDF, reading mode), the which-key popup shows global binding completions — for example, pressing `<C-w>` shows available window commands (`h`, `j`, `k`, `l`, `v`, `s`, etc.).

In `all` mode, pressing `d` shows available motions and text objects, `g` shows g-prefixed commands, `z` shows fold commands, `[` and `]` show bracket motions, etc.

## Popup delay

Configure via **Settings → Vim Motions → Which-key popup delay** or `set whichkeydelay=<ms>` (alias `wkd`) in vimrc.

The delay controls how long to wait (in milliseconds) before the which-key popup first appears after a partial key sequence. The default is `500` ms. Set to `0` for instant display.

Once the popup is visible, subsequent keystrokes update it **instantly** — the delay only applies to the initial appearance. Single-key commands that resolve immediately (like `j`, `k`) never trigger the popup regardless of delay.

```vim
set whichkeydelay=300   " show after 300ms
set wkd=0               " show instantly
```

## Grouping

Configure via **Settings → Vim Motions → Which-key leader grouping** or `set whichkeygrouping=<mode>` in vimrc.

| Mode      | Behavior                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grouped` | Collapse bindings by prefix (default). Pressing `<leader>` shows `t → Table (+11)` instead of listing all table commands. Press `t` to drill into the group. |
| `flat`    | Show all bindings in a flat list without grouping                                                                                                            |

## Group labels

Name groups by their key prefix to give the collapsed group a descriptive label:

```vim
whichkeygroup <leader>t Table
whichkeygroup <leader>g Git
whichkeygroup <leader>f Find
```

Group labels can also be configured in **Settings → Vim Motions → Which-key group labels**. Use the leader character + prefix for leader groups (e.g., `\t` for table if leader is `\`), or a raw prefix for non-leader groups.

Built-in features register default group labels. Your entries override the defaults for the same prefix.

## Command labels

Describe individual bindings shown in the which-key popup:

```vim
whichkeylabel <leader>w Save file
whichkeylabel <leader>q Close tab
whichkeylabel gd Go to definition
whichkeylabel gO Document outline
```

Command labels can also be configured in **Settings → Vim Motions → Which-key command labels**. Labels set in vimrc appear as read-only rows in the settings UI.

## Merge behavior

Group and command labels from vimrc are merged with labels configured in Settings. If the same key appears in both, the vimrc value takes precedence.

## Tips

> [!tip] Start with leader-only mode
> If you're new to which-key, start with `set whichkey=leader` to see the popup only for leader bindings. Switch to `all` once you're comfortable.

> [!tip] Organize with groups
> Use `whichkeygroup` to name your custom leader binding groups. The grouped display is more readable when you have many bindings.

## Global (non-editor) labels

Label global bindings separately from editor bindings using `gwhichkeylabel` and `gwhichkeygroup`:

```vim
gwhichkeygroup <leader> +leader bindings
gwhichkeylabel <leader>f Open file
gwhichkeylabel <leader>e Reveal in explorer
```

These labels appear in the non-editor which-key overlay. They are independent from editor which-key labels — the same key prefix can have different labels in each context.

See [[vimrc#Global key mappings]] for how to define global bindings with `gmap`.
