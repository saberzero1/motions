---
title: Cursor shapes
description: Configure per-mode cursor shapes — block, bar, underline, or hollow — for normal, insert, visual, replace, and operator-pending modes.
tags:
    - configuration
---

Vim Motions supports per-mode cursor shapes, letting you visually distinguish between Normal, Insert, Visual, Replace, and Operator-pending modes.

> [!info] Requires bundled fork mode
> Cursor shapes only work when Obsidian's built-in Vim mode is **disabled** (**Settings → Editor → Vim key bindings → off**). With built-in Vim enabled, Obsidian renders its own block cursor and the plugin has no control over its shape.

## Available shapes

| Shape       | Description                                      |
| ----------- | ------------------------------------------------ |
| `block`     | Solid block cursor (covers the character)        |
| `bar`       | Thin vertical line before the character          |
| `underline` | Thin horizontal line under the character         |
| `hollow`    | Outlined block cursor (character visible inside) |

## Defaults

| Mode             | Default shape |
| ---------------- | ------------- |
| Normal           | `block`       |
| Insert           | `bar`         |
| Visual           | `block`       |
| Replace          | `underline`   |
| Operator-pending | `underline`   |

## Configuration

### Settings UI

**Settings → Vim Motions → Cursor shapes** — select a shape for each mode from the dropdown.

### Lua configuration

Cursor shapes use `set guicursor` syntax which doesn't have a clean `vim.opt` equivalent.

> [!info] Cursor shapes via guicursor
> Cursor shapes are configured via the `set guicursor` vimrc syntax. A direct `vim.opt.guicursor` is not yet supported in Lua config — use `vim.cmd("set guicursor=n:block,i:bar,v:block")` as a workaround, or configure via the Settings UI or vimrc.

### Vimrc

Use the `guicursor` option with a comma-separated list of `mode:shape` pairs:

```vim
set guicursor=n:block,i:bar,v:block,r:underline,o:underline
```

Mode codes: `n` (normal), `i` (insert), `v` (visual), `r` (replace), `o` (operator-pending).

### Examples

```lua
-- Via Lua workaround
vim.cmd("set guicursor=n:hollow,i:bar,v:block,r:underline,o:underline")
```

```vim
" Or via vimrc:
set guicursor=n:hollow,i:bar,v:block,r:underline,o:underline
```

## Cursor colors

Cursor colors are derived from Obsidian's CSS variable `--interactive-accent`. Visual line highlights use `--text-selection`. These adapt automatically to your theme.

To customize cursor colors further, override the CSS variables in a CSS snippet:

```css
.cm-fat-cursor {
    caret-color: red;
}
```
