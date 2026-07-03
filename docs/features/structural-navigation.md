---
title: Structural navigation
description: Jump between headings, list items, links, and open buffers with bracket motions that work with counts and operators.
tags:
    - features
    - keybindings
---

Jump between document structures using bracket motions. All navigation motions work with counts (e.g., `3]h` jumps 3 headings forward) and operators (e.g., `d]h` deletes to the next heading).

## Keybindings

![[keybindings#Structural navigation]]

## Headings

`]h` and `[h` jump to the next and previous heading of any level. For level-specific navigation, use `]1`–`]6` and `[1`–`[6` to jump to headings of that exact level (e.g., `]2` jumps to the next `##` heading).

Heading detection uses Markdown syntax — lines starting with `#` characters. Works in both Source mode and Live Preview.

## List items

`]l` and `[l` jump between list items at the **same indentation level**. This means nested list items are skipped when navigating at the parent level, and vice versa. Supports all Markdown list types: unordered (`-`, `*`, `+`), ordered (`1.`), and task lists (`- [ ]`).

## Links

`]n` and `[n` jump between links in the document. Matches both wikilinks (`[[...]]`) and standard Markdown links (`[text](url)`).

## Buffers

`]b` and `[b` cycle through open tabs (buffers), equivalent to `gt` and `gT`. Useful in combination with operators or counts.

## Configuration

Toggle via **Settings → Vim Motions → Structural navigation** or `set navigation` / `set nonav` in vimrc.
