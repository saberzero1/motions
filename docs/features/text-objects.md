---
title: Text objects
description: 13 Markdown-aware text objects for bold, italic, code, math, strikethrough, highlight, links, blockquotes, callouts, code blocks, tags, table rows, and table cells.
tags:
    - features
    - keybindings
---

Markdown text objects allow you to operate on document structures using standard Vim operators like `d` (delete), `c` (change), `y` (yank), and `v` (visual select). These objects are aware of Markdown syntax, enabling precise editing of formatted text, links, and structural blocks.

![[keybindings#Markdown text objects]]

## Delimiter text objects

The following text objects operate on inline Markdown delimiters:

- `i*` / `a*`: Bold (`**...**`) or italic (`*...*`)
- `i_` / `a_`: Underscore italic (`_..._`)
- `` i` `` / `` a` ``: Inline code (`` `...` ``)
- `i$` / `a$`: Math (`$...$` or `$$...$$`)
- `i~` / `a~`: Strikethrough (`~~...~~`)
- `i=` / `a=`: Highlight (`==...==`)

These objects support multi-line scanning, allowing you to select content that spans across line breaks. To maintain performance, the scanner skips lines within fenced code blocks.

> [!note] Smart asterisk disambiguation
> `i*` tries to match `**bold**` first, then falls back to `*italic*`. In cases of nested formatting like `***bold italic***`, the `**` pair is matched first. Use `i_` for underscore italic to select the italic portion specifically.

> [!note] Smart dollar disambiguation
> `i$` / `a$` tries to match `$$` (block math) first, then falls back to `$` (inline math). For nested math like `$$ $inner$ $$`, the `$$` pair is matched first.

> [!tip] Configurable scan range
> The multi-line scanner searches a set number of lines in each direction (default: 20). You can adjust this in **Settings → Vim Motions → Advanced → Multi-line text object scan range** (5–200 lines).

## Link text objects

Link text objects (`il` / `al`) support both wikilinks and standard Markdown links:

- **Wikilinks**: `[[Link]]` or `[[Link|Alias]]`
- **Markdown links**: `[Text](URL)`

`il` selects the content inside the brackets or parentheses, while `al` selects the entire link structure.

## Block text objects

Block text objects operate on structural Markdown elements:

- **Code blocks** (`iC` / `aC`): Fenced code blocks starting and ending with ` ``` `.
- **Blockquotes** (`iB` / `aB`): Lines prefixed with `>`.
- **Callouts** (`io` / `ao`): Obsidian callouts (`> [!type]`).

The scanner for these blocks skips lines within fenced code blocks to avoid false positives. Note that fenced code blocks inside blockquotes (` > ``` `) are currently not detected as separate blocks.

## Tag text objects

Tag text objects (`it` / `at`) allow you to operate on HTML or XML tags within your Markdown files. These are implemented via raw text scanning rather than a full HTML parser to ensure compatibility with Markdown-mixed content.

## Table cell text objects

Table cell text objects (`i|` / `a|`) operate on individual cells within Markdown tables:

- `i|`: Selects the content inside the cell (between the `|` pipes).
- `a|`: Selects the content plus the trailing pipe.

These objects are particularly useful for quickly changing or deleting cell data without affecting the table structure.

See [[known-limitations#Text objects]] for detailed technical limitations.
