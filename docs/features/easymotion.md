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

Find motions allow jumping to specific characters. When triggered, you type a single character to search for, and labels appear over every occurrence of that character within the visible viewport.

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

EasyMotion supports operator-pending mode for `d`, `c`, and `y`. This allows for powerful combinations like `d` + `<leader><leader>w` + `{label}` to delete from the cursor to a specific word.

> [!info]
> Operator-pending support requires the **bundled fork mode** (Obsidian's built-in Vim mode disabled). It uses the fork's async motion support to resolve the jump target before applying the operator.

> [!note]
> Dot-repeat (`.`) does not currently replay operator-pending EasyMotion operations.

## Label positioning

EasyMotion labels appear **after** the target character (one character to the right), matching the label positioning used by [[flash|Flash motions]]. This prevents labels from obscuring the character they target. Match highlights also render behind each label for visual consistency.

## Live Preview awareness

The EasyMotion engine is specifically tuned for Obsidian's Live Preview mode:

- **Syntax exclusion**: Hidden Markdown syntax (like URLs in `[text](url)` or formatting marks) is excluded from target scanning to prevent jumping to invisible characters.
- **Label collision detection**: If multiple targets are close together, labels are automatically offset vertically to prevent overlap.
- **Vertical stacking**: Labels for nearby targets are stacked to ensure every jump target remains reachable and legible.

## Configuration

You can customize EasyMotion behavior in **Settings → Vim Motions → Jump navigation**:

- **Label characters**: Define the characters used for jump labels (default: `asdghklqwertyuiopzxcvbnmfj`).
- **Dimming**: Toggle whether the editor text dims when EasyMotion is active.
- **Font size**: Adjust the size of the jump labels.

To remap EasyMotion triggers in your `.obsidian.vimrc`, use the internal command names. See [[settings#Jump navigation]] for details.

---

> [!tip]
> Looking for enhanced `f`/`F`/`t`/`T`? See [[flash|Flash motions]] — labels appear on all visible matches when you press `f{char}`, with automatic single-match jumping.

See [[known-limitations#EasyMotion]] for detailed technical limitations.
