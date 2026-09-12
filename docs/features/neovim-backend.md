---
title: Neovim backend
description: Use Neovim as the editing engine for Markdown notes while Obsidian continues to own the workspace and vault.
tags:
    - features
    - configuration
---

# Neovim backend

The Neovim backend is an opt-in, desktop-only alternative to the bundled Vim engine. It starts a user-supplied Neovim 0.12+ process, connects over msgpack-RPC, and mirrors the active Markdown editor into a Neovim `acwrite` buffer.

## Enable

Configure the three options under **Settings → Vim Motions → Vim engine**:

- **Use Neovim backend** enables the connection. It is off by default.
- **Neovim binary path** selects the Neovim executable. Leave it empty to use `nvim` from your system `PATH`.
- **Neovim configuration path** optionally selects an Obsidian-specific `init.lua`. A configured file loads under `--clean`; an empty value loads your normal Neovim configuration.

## Security

> [!warning] Neovim is not sandboxed
> Enabling this backend runs the binary and configuration you supply as arbitrary code. That code can load native libraries through LuaJIT FFI and read or write files outside the vault. Vim Motions does not download or install Neovim or its plugins.

## Ownership

While connected, Neovim owns editor input, text, mode, cursor, registers, undo and redo, folds, dot-repeat, macros, persistent extmarks, floating windows, structural motions, Markdown text objects, and hard-wrap operations. Native IME preedit stays in a cursor-positioned host input; only committed text is sent through `nvim_input`.

Neovim errors, warnings, notifications, echoes, Lua prints, and shell output appear as Obsidian Notices. Identical messages are limited to one Notice every five seconds. Routine undo, search-count, progress, completion, and command-list messages remain silent.

The external command line renders `:`, `/`, and `?` input with byte-correct caret placement. Prompt text and nested command-line levels are preserved, so `vim.ui.input()` and the generic `vim.ui.select()` flow remain visible and cancellable.

Obsidian continues to own the vault, Markdown rendering, properties widgets, workspace panes and tabs, pickers, file navigation, Oil, Harpoon storage, cross-note jumps, and the undo-tree sidebar. `:w` routes through Obsidian's active-editor save command, while `:e` and `:e!` re-seed from the current Obsidian document rather than reading behind Obsidian's back.

Both **Settings → Editor → Properties in document** modes are supported. Source frontmatter remains navigable. Rendered frontmatter is protected by a Neovim fold while the properties widget remains owned by Obsidian.

## Supported keybindings

The backend uses the same documented bindings rather than a separate keymap.

![[keybindings#Markdown text objects]]

![[keybindings#Structural navigation]]

![[keybindings#Hard-wrap operators]]

![[keybindings#Fold commands]]

## Known limitations

- Only the active Markdown editor is mirrored; multi-leaf and multi-buffer ownership is deferred.
- Floating-window terminal cells are mapped onto proportional Markdown typography, so placement is approximate.
- Ephemeral extmarks and legacy non-extmark highlights are not mirrored.
- Fold persistence and the `i=` / `a=` highlight text object are unavailable in RPC mode.
- Uppercase cross-file mark motions are deferred. Lowercase within-buffer marks remain native to Neovim.
- Oil's embedded editor intentionally continues to use the bundled Vim engine.
- Neovim's popup-menu completion is not rendered yet. The command line and generic input/select prompts are rendered.

See [[known-limitations#Neovim RPC backend]] for the detailed compatibility boundary and current latency measurements.
