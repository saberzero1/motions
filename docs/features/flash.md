---
title: Flash motions
description: Enhanced f/F/t/T character motions with labels on all visible matches — inspired by flash.nvim.
tags:
    - features
    - keybindings
---

Flash motions (inspired by [flash.nvim](https://github.com/folke/flash.nvim)) enhance Vim's built-in `f`, `F`, `t`, and `T` character search commands. When you press `f{char}` and multiple matches are visible, jump labels appear on every match. Press a label key to jump directly — no need to repeat `;` to reach distant targets.

When only one match exists, flash behaves identically to stock Vim: the cursor jumps immediately without showing labels.

## How it works

1. Press `f` (or `F`, `t`, `T`) followed by a search character.
2. If **one match** exists → cursor jumps directly (stock Vim behavior).
3. If **two or more matches** exist → labels appear on all matches. Press a label key to jump.
4. Press `Escape` to cancel without moving.

## Multi-line search

By default, flash searches the entire visible viewport — not just the current line. This means `f{char}` can jump to matches on other lines.

To restrict `f`/`F`/`t`/`T` to the current line (stock Vim behavior), disable multi-line in **Settings → Vim Motions → Jump navigation → Flash multi-line**, or:

```vim
set noflashmultiline
```

```lua
vim.opt.flashmultiline = false
```

## Operator-pending mode

Flash works with operators. `df{char}` deletes from cursor to the target — either by autojump (single match) or label selection (multiple matches).

- `df{char}{label}` — delete to labeled target
- `cf{char}{label}` — change to labeled target
- `yf{char}{label}` — yank to labeled target

> [!info]
> Operator-pending flash requires the **bundled fork mode** (Obsidian's built-in Vim mode disabled). With built-in Vim mode, flash works for navigation but operator-pending falls back to stock behavior.

## Visual mode

`vf{char}{label}` extends the visual selection to the labeled target.

## Repeat with `;` and `,`

After a flash jump, `;` repeats the search forward and `,` repeats backward — the same as stock Vim's character search repeat.

## Jump mode (`s`)

Flash can also provide a standalone bidirectional character jump, bound to a configurable key (default: `s`). Press `s{char}` to search for `{char}` in both directions, then select a label.

Jump mode is **disabled by default** because `s` overrides substitute (`cl`) in normal mode. Enable it in **Settings → Vim Motions → Jump navigation → Flash jump mode**, or:

```vim
set flashjump
set flashjumpkey=s   " default key
```

```lua
vim.opt.flashjump = true
vim.opt.flashjumpkey = 's'
```

> [!tip]
> Jump mode only overrides the key in normal mode. In visual mode, `s` retains its default `c` (change selection) behavior.

## Clever-f

When clever-f is enabled, pressing `f{char}` where `{char}` matches the last flash search character falls through to the stock `f` behavior — effectively repeating the search as `;` would. This avoids showing labels when you're just continuing a search sequence.

```vim
set flashcleverf     " enable
set noflashcleverf   " disable (default)
```

```lua
vim.opt.flashcleverf = true
```

## Coexistence with EasyMotion

Flash and EasyMotion are independent features that work simultaneously:

- `f{char}` → flash (enhanced built-in motion)
- `<leader><leader>f{char}` → EasyMotion (explicit label-based jump)

Both share the same label characters setting.

## Configuration

Configure flash in **Settings → Vim Motions → Jump navigation**:

| Setting                     | Default                      | Description                                          |
| --------------------------- | ---------------------------- | ---------------------------------------------------- |
| Flash-style f/F/t/T         | `true`                       | Enable flash labels on character motions.            |
| Flash multi-line            | `true`                       | Search beyond the current line.                      |
| Flash jump mode (s)         | `false`                      | Bidirectional character jump with configurable key.  |
| Flash jump key              | `s`                          | Key to trigger flash jump mode.                      |
| Flash clever-f              | `false`                      | Repeating `f{same-char}` falls through to stock `f`. |
| EasyMotion label characters | `asdghklqwertyuiopzxcvbnmfj` | Shared label characters for flash and EasyMotion.    |
| EasyMotion dimming          | `true`                       | Dim non-target text during flash and EasyMotion.     |

### Vimrc

```vim
set flash              " enable (default)
set noflash            " disable
set flashmultiline     " multi-line search (default)
set noflashmultiline   " current line only
set flashjump          " enable jump mode
set flashjumpkey=s     " jump mode key (default: s)
set flashcleverf       " enable clever-f
```

### Lua

```lua
vim.opt.flash = true
vim.opt.flashmultiline = true
vim.opt.flashjump = true
vim.opt.flashjumpkey = 's'
vim.opt.flashcleverf = true
```

---

See also: [[easymotion|EasyMotion]] for the `<leader><leader>` label-based motions.
