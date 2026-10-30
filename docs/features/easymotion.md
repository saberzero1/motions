---
title: EasyMotion
description: Jump to any visible position with two keystrokes — find, word, line, and search motions with operator-pending and visual mode support.
tags:
    - features
    - keybindings
---

EasyMotion (inspired by [vim-easymotion](https://github.com/easymotion/vim-easymotion) and [hop.nvim](https://github.com/smoka7/hop.nvim)) provides a way to jump to any visible position in the editor with minimal keystrokes. Instead of repeating `w` or `f` to reach a target, you trigger a motion, type a search character (if required), and then type a one or two-character label that appears over the target.

## Find motions

![[keybindings#EasyMotion find motions]]

Find motions allow jumping to specific characters. When triggered, you type a single character to search for, and labels appear over every occurrence of that character within the visible viewport. Capital letters work — press Shift+key to search for an uppercase character.

## Word motions

![[keybindings#EasyMotion word motions]]

Word motions target the beginning of words. Like standard Vim, these distinguish between "words" (sequences of letters, numbers, and underscores) and "WORDS" (sequences of non-blank characters).

## Line motions

![[keybindings#EasyMotion line motions]]

Line motions target the beginning of lines, allowing for rapid vertical navigation.

## Search motions

![[keybindings#EasyMotion search motions]]

Search motions use the last search pattern (from `/` or `?`) to generate jump targets. This is useful for jumping between complex patterns or specific terms already in the search register.

## Visual mode

EasyMotion integrates natively with visual mode. Pressing `v` or `V` followed by an EasyMotion trigger allows you to extend the selection to the jump target.

- `v` + EasyMotion: Extends the character-wise selection head to the target.
- `V` + EasyMotion: Extends the line-wise selection to include the target line.

## Operator-pending mode

EasyMotion supports operator-pending mode for `d`, `c`, `y`, and `ys` (surround). This allows for powerful combinations like `d` + `<leader><leader>w` + `{label}` to delete from the cursor to a specific word.

Motions follow native Vim inclusivity semantics — `f`, `t`, `e`, `s` are inclusive (the target character is included in the operation), while `w`, `b`, `F`, `T` are exclusive (matching their Vim counterparts). For example, `y<leader><leader>fk{label}` yanks text including the target `k`.

> [!info]
> Operator-pending support requires the **bundled fork mode** (Obsidian's built-in Vim mode disabled). It uses the fork's async motion support to resolve the jump target before applying the operator.

Dot-repeat (`.`) works with operator-pending EasyMotion — the fork stores the resolved position and replays the operator to the same relative offset without re-showing the label overlay.

## Repeat last motion

![[keybindings#EasyMotion repeat]]

`<leader><leader>.` repeats the most recent EasyMotion motion, showing a fresh label overlay. This works in operator-pending mode — for example, after using `<leader><leader>j` to jump to a line, `d<leader><leader>.` deletes to a new line target chosen from the same motion type. The repeat inherits the original motion's `motionArgs` (linewise, inclusive, forward), so operators behave correctly.

## Mapping your own keys

Every EasyMotion motion has vim-easymotion's `<Plug>` name, so a key mapped to it behaves exactly like the built-in trigger: it works after an operator, in visual mode, and with dot-repeat. The bidirectional motions have no default key, as in vim-easymotion, and are reached this way:

```vim
" .obsidian.vimrc
nmap <leader>w <Plug>(easymotion-bd-w)
```

```lua
-- init.lua
vim.keymap.set({ 'n', 'x', 'o' }, '<leader>w', '<Plug>(easymotion-bd-w)')
```

| `<Plug>` name                  | Motion                            |
| ------------------------------ | --------------------------------- |
| `<Plug>(easymotion-f)` / `-F`  | Find character forward / backward |
| `<Plug>(easymotion-s)`         | Find character in both directions |
| `<Plug>(easymotion-bd-f)`      | Same as `easymotion-s`            |
| `<Plug>(easymotion-t)` / `-T`  | Till character forward / backward |
| `<Plug>(easymotion-bd-t)`      | Till character in both directions |
| `<Plug>(easymotion-w)` / `-b`  | Word start forward / backward     |
| `<Plug>(easymotion-bd-w)`      | Word start in both directions     |
| `<Plug>(easymotion-e)` / `-ge` | Word end forward / backward       |
| `<Plug>(easymotion-bd-e)`      | Word end in both directions       |
| `<Plug>(easymotion-W)` / `-B`  | WORD start forward / backward     |
| `<Plug>(easymotion-bd-W)`      | WORD start in both directions     |
| `<Plug>(easymotion-E)` / `-gE` | WORD end forward / backward       |
| `<Plug>(easymotion-bd-E)`      | WORD end in both directions       |
| `<Plug>(easymotion-j)` / `-k`  | Line below / above                |
| `<Plug>(easymotion-bd-jk)`     | Line in both directions           |
| `<Plug>(easymotion-n)` / `-N`  | Next / previous search match      |
| `<Plug>(easymotion-repeat)`    | Repeat the last EasyMotion motion |

A `<Plug>` name is reached from `nnoremap` and from a plain `vim.keymap.set`, which are non-recursive, as in Vim and Neovim; the keys after it in the mapping stay non-recursive.

## Label positioning

EasyMotion labels appear **after** the target character (one character to the right), matching the label positioning used by [[flash|Flash motions]]. This prevents labels from obscuring the character they target. Match highlights also render behind each label for visual consistency.

## Live Preview awareness

The EasyMotion engine is specifically tuned for Obsidian's Live Preview mode:

- **Syntax exclusion**: Hidden Markdown syntax (like URLs in `[text](url)` or formatting marks) is excluded from target scanning to prevent jumping to invisible characters.
- **Hidden prefix skipping**: Line motions (`<leader><leader>j`/`k`) skip hidden formatting prefixes (heading markers `## `, bold `**`, etc.) and target the first visually visible character on each line.
- **Label collision detection**: If multiple targets are close together, labels are automatically offset vertically to prevent overlap.
- **Vertical stacking**: Labels for nearby targets are stacked to ensure every jump target remains reachable and legible.

## Configuration

You can customize EasyMotion behavior in **Settings → Vim Motions → Jump navigation**:

- **Label characters**: Define the characters used for jump labels (default: `asdghklqwertyuiopzxcvbnmfj`).
- **Dimming**: Toggle whether the editor text dims when EasyMotion is active.
- **Font size**: Adjust the size of the jump labels.
- **Scale labels to line height**: When enabled (`set labelmatchfontsize`), labels scale to match the font size of the target line — labels on headings are larger than labels on body text.

To put an EasyMotion motion on another key, map the key to its `<Plug>` name; see [[#Mapping your own keys]].

---

> [!tip]
> Looking for enhanced `f`/`F`/`t`/`T`? See [[flash|Flash motions]] — labels appear on all visible matches when you press `f{char}`, with automatic single-match jumping.

See [[known-limitations#EasyMotion]] for detailed technical limitations.
