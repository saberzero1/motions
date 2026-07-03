---
title: Surround
description: vim-surround implementation with Markdown delimiter support: add, change, and delete surrounding brackets, quotes, tags, and formatting marks.
tags:
  - features
  - keybindings
---

# Surround

The surround feature brings the power of `vim-surround` to Obsidian. It allows you to add, change, and delete surrounding delimiters like brackets, quotes, and HTML tags. This implementation includes native support for Markdown formatting marks and function wrapping.

> [!info]
> For the best experience, disable Obsidian's built-in Vim mode in **Settings → Editor → Vim key bindings**. This enables the plugin's bundled fork mode, which provides full surround support and Neovim-correct behavior.

## Keybindings

![[keybindings#Surround]]

## Targets

Surround operations work with a wide range of targets.

- **Quotes**: `"`, `'`, `` ` ``
- **Brackets**: `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`
- **Tags**: `t` (HTML tags)
- **Aliases**: `b` for `)`, `B` for `}`, `r` for `]`, `a` for `>`

### Bracket spacing

Opening and closing brackets behave differently regarding whitespace:

- **Opening brackets** (`(`, `[`, `{`): Add a space inside the delimiters.
- **Closing brackets** (`)`, `]`, `}`): Do not add spaces.

## Tag surround

You can wrap text in HTML tags or change existing tags.

- **Add tag**: `ys{motion}t<tagname>` or `ys{motion}<` (triggers a prompt).
- **Change tag**: `cst<newtag>`.
- **Delete tag**: `dst`.

When prompted for a tag, typing `<` allows you to enter the tag name.

## Function surround

The `f` and `F` targets in replacement position allow you to wrap text in a function call.

- **`f`**: Wraps the target in `functionName()`.
- **`F`**: Wraps the target in `functionName( )` with internal spacing.

## Count-prefix

Markdown formatting marks use a count-prefix to distinguish between single and double delimiters.

- **Bold**: `2ysiw*` surrounds a word with `**`.
- **Strikethrough**: `2ysiw~` surrounds a word with `~~`.
- **Highlight**: `2ysiw=` surrounds a word with `==`.

To delete these repeated delimiters, use a count with the delete command, such as `2ds*`.

> [!tip]
> Use the count-prefix for fast Markdown formatting. It's often quicker than typing the marks manually.

## Newline variants

Several commands allow you to place delimiters on their own lines.

- **`yS`**: Adds surroundings on new lines and indents the content.
- **`ySS`**: Surrounds the current line on new lines.
- **`cS`**: Changes surroundings and moves them to new lines.
- **`gS`**: In visual mode, surrounds the selection on new lines.

## Insert mode

You can add surroundings while typing in insert mode using `<C-G>s{char}`. This inserts the pair and places the cursor inside. Pressing `Esc` moves the cursor past the closing delimiter.

## Dot-repeat

All surround commands support the `.` command. You can repeat your last add, change, or delete operation across different parts of your document.

See [[known-limitations#Vim engine]] for surround operator scope details.
