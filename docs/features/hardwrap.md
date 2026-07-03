---
title: Hard-wrap formatting
description: Markdown-aware gq/gw operators that reformat paragraphs with structural prefix preservation.
tags:
    - features
    - keybindings
---

# Hard-wrap formatting

Reformat paragraphs with Markdown-aware line wrapping — something Obsidian's built-in Vim mode does not support.

## Keybindings

![[keybindings#Hard-wrap operators]]

`gq` moves the cursor to the start of the formatted range. `gw` keeps the cursor at its original position. Both use the same wrapping engine.

## Behavior

The hard-wrap operators split and merge lines at the configured text width (default: 80 columns):

- **Word-boundary splitting** — lines exceeding the text width are split at the last word boundary that fits
- **Prefix preservation** — continuation lines retain Markdown structural prefixes:
    - **Blockquotes** (`>`) — wrapped lines keep the `> ` prefix
    - **Bullet lists** (`- `, `* `, `+ `) — wrapped lines are indented to align with the text after the marker
    - **Numbered lists** (`1. `) — same alignment behavior as bullet lists
    - **Nested structures** (`> - text`) — both prefixes are preserved
- **Line merging** — short lines with matching prefixes are merged back into the preceding line when they fit within the text width, producing a paragraph-reflow effect
- **Paragraph separation** — blank lines act as paragraph separators; wrapping stops and resumes at each paragraph boundary

## Configuration

The wrap width can be set via:

- **Settings → Vim Motions → Vim engine → Text width** (default: 80)
- `set textwidth=100` in `.obsidian.vimrc`
- Runtime: `CodeMirrorAdapter.Vim.setOption('textwidth', 100)` in Obsidian's developer console

> [!note] Vimrc timing
> `set textwidth=N` in vimrc may not propagate to `gq`/`gw` if the vimrc file encounters I/O timing issues. If the value isn't taking effect, reload the plugin. See [[known-limitations#Vimrc]] for details.

Toggle the feature via **Settings → Vim Motions → Hard-wrap operator** or `set hardwrap` / `set nohardwrap` in vimrc.
