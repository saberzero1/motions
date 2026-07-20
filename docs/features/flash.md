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

Flash provides a bidirectional incremental search, bound to a configurable key (default: `s`). Press `s` then type characters — matches narrow incrementally as you type. Labels appear on matches and update in real-time. Press a label key to jump, or `Enter` to jump to the nearest match.

The incremental search also supports `Backspace` (remove last char, widen matches) and `Escape` (cancel).

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

> [!info] Surround coexistence
> When `s` is the jump key, it shares a key with surround operations (`cs`, `ys`, `ds`) in operator-pending mode. The operator-prefix shadow resolver handles this automatically: when you type `c` then `s`, the resolver waits for the next character to disambiguate between surround (`cs"`) and flash (`c` + `s`-motion). If no key arrives within `operatorshadowtimeout` (default 1000ms), the flash motion executes as fallback. Set `operatorshadowtimeout=0` to disable the resolver and always execute the motion immediately.

### Two-character labels

When the number of matches exceeds the available label characters (default: 27), some targets receive two-character labels. Typing the first character of a two-char label narrows the displayed labels to those matching the prefix. Typing the second character completes the jump. Single-character labels still jump immediately on the first keystroke.

## Clever-f

When clever-f is enabled, pressing `f{char}` where `{char}` matches the last flash search character falls through to the stock `f` behavior — effectively repeating the search as `;` would. This avoids showing labels when you're just continuing a search sequence.

```vim
set flashcleverf     " enable
set noflashcleverf   " disable (default)
```

```lua
vim.opt.flashcleverf = true
```

## Highlight and label rendering

Flash renders two visual layers when labels are visible:

1. **Match highlights** — colored rectangles behind each matched text, sized to the actual character dimensions (adapts to proportional fonts, CJK, and different font sizes).
2. **Labels** — jump hint characters positioned immediately **after** the matched text, matching [flash.nvim](https://github.com/folke/flash.nvim)'s default behavior.

During label narrowing (typing a label prefix), match highlights persist for all targets while only labels narrow to remaining candidates. Pressing `Backspace` restores all labels.

## Coexistence with EasyMotion

Flash and EasyMotion are independent features that work simultaneously:

- `f{char}` → flash (enhanced built-in motion)
- `<leader><leader>f{char}` → EasyMotion (explicit label-based jump)

Both share the same label characters setting.

## Configuration

Configure flash in **Settings → Vim Motions → Jump navigation**:

| Setting                     | Default                      | Description                                                      |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| Flash-style f/F/t/T         | `true`                       | Enable flash labels on character motions.                        |
| Flash multi-line            | `true`                       | Search beyond the current line.                                  |
| Flash jump mode (s)         | `false`                      | Bidirectional character jump with configurable key.              |
| Flash jump key              | `s`                          | Key to trigger flash jump mode.                                  |
| Flash clever-f              | `false`                      | Repeating `f{same-char}` falls through to stock `f`.             |
| Flash min pattern length    | `1`                          | Minimum chars before labels appear in jump mode (0 = immediate). |
| Flash search labels         | `true`                       | Show labels on search matches after committing `/` or `?`.       |
| EasyMotion label characters | `asdghklqwertyuiopzxcvbnmfj` | Shared label characters for flash and EasyMotion.                |
| EasyMotion dimming          | `true`                       | Dim non-target text during flash and EasyMotion.                 |

### Vimrc

```vim
set flash              " enable (default)
set noflash            " disable
set flashmultiline     " multi-line search (default)
set noflashmultiline   " current line only
set flashjump          " enable jump mode
set flashjumpkey=s     " jump mode key (default: s)
set flashcleverf       " enable clever-f
set flashminpatternlength=2  " require 2 chars before labels
set flashsearch        " labels on /? search matches (default)
```

### Lua

```lua
vim.opt.flash = true
vim.opt.flashmultiline = true
vim.opt.flashjump = true
vim.opt.flashjumpkey = 's'
vim.opt.flashcleverf = true
vim.opt.flashminpatternlength = 2
vim.opt.flashsearch = true
```

## Search mode (`/` and `?`)

After committing a search with `/pattern` + `Enter`, flash labels appear on all visible matches. Press a label key to jump directly to that match — no need to cycle with `n`/`N`.

Labels auto-clear when you press any non-label key, `Escape`, or `n`/`N`. This means the search dialog works exactly as expected during typing; labels only appear after you commit. Two-character labels are supported — typing the first character narrows the label set instead of dismissing labels.

Disable with `set noflashsearch` or in **Settings → Vim Motions → Jump navigation → Flash search labels**.

---

See also: [[easymotion|EasyMotion]] for the `<leader><leader>` label-based motions.
