---
title: Ex commands
description: 60+ ex commands for file management, buffer navigation, window management, table manipulation, and Obsidian integration.
tags:
    - features
    - keybindings
---

Vim Motions provides 60+ ex commands accessible via `:` in Normal mode. Commands cover file operations, buffer management, window splits, table manipulation, and Obsidian-specific integration.

## Command reference

![[keybindings#Ex commands]]

## Obsidian integration

### `:ob` — execute Obsidian commands

`:ob {command-id}` executes any Obsidian command by its internal ID. Run `:ob` without arguments to list all available command IDs in a modal.

This is the bridge between Vim's ex command line and Obsidian's command palette. Use it with `exmap` in your vimrc to create custom key bindings for any Obsidian command:

```vim
exmap toggleDarkMode obcommand theme:use-dark
nmap <leader>d :toggleDarkMode<CR>
```

### `:sidebar` — toggle sidebars

`:sidebar left` and `:sidebar right` toggle the left and right sidebars respectively.

### `:explorer` — reveal in file explorer

`:explorer` reveals the active file in the file explorer sidebar.

### `:grep` — vault search

`:grep {pattern}` searches the vault for text and shows results in a modal.

### `:backlinks` — show backlinks

`:backlinks` shows all backlinks to the current note in a modal.

## Non-editor ex command line

Pressing `:` in a non-editor view (PDF, graph, canvas, etc.) opens a standalone command modal with tab-completion. Only globally-safe commands are available from this modal — commands that require an active editor (`:e!`, `:saveas`, `:read`, `:marks`) show a notice when invoked.

## Tab completion

Ex commands support tab-completion as you type in the `:` command line, matching available commands by prefix.

## Configuration

Ex commands are always enabled — there is no toggle setting. The `:ob` command is registered independently from [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support), so both plugins can coexist.

See [[known-limitations#Platform]] for Neovim ex commands that are not applicable in Obsidian.
