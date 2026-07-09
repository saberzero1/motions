---
title: Oil explorer
description: Oil.nvim-inspired file explorer that lets you edit vault directories as buffers — create, rename, delete, and move files with standard vim commands.
tags:
    - features
    - keybindings
---

Oil explorer (inspired by [oil.nvim](https://github.com/stevearc/oil.nvim)) provides a keyboard-first way to manage your vault's file structure. Instead of using a sidebar or modal, Oil renders a directory's contents as an editable Markdown buffer. You can create, rename, delete, and move files using standard Vim operators like `o`, `cw`, `dd`, and `p`, then commit all changes at once with `:w`.

Oil is not intended to replace the Obsidian file explorer, but rather to provide a fast, keyboard-driven alternative for bulk file operations and rapid navigation.

## Opening

- `:Oil` opens the directory containing the current file.
- `:Oil path/to/dir` opens a specific directory.
- `:Oil .` opens the vault root.

## Keybindings

![[keybindings#Oil explorer]]

## File operations

All changes in an Oil buffer are staged and only applied to the filesystem when you save the buffer with `:w`.

- **Create**: Type a new line with the desired filename. Pressing `:w` creates the file. Filenames without an extension default to `.md`. Names ending with a `/` create folders.
- **Rename**: Edit the filename text on an existing line. Pressing `:w` renames the file. Obsidian backlinks are updated automatically.
- **Delete**: Delete a line using `dd` or any other Vim command. Pressing `:w` moves the file to the trash (respecting your Obsidian trash settings). A confirmation dialog is shown if the number of deleted files exceeds the configured threshold.

## Navigation

- `<CR>` opens the file under the cursor or enters the directory.
- `-` navigates to the parent directory.
- `~` navigates to the vault root.
- `q` closes the Oil buffer.

## Configuration

You can customize Oil explorer behavior in **Settings → Vim Motions → File explorer**:

- **Oil explorer**: Toggle the feature on or off.
- **Show hidden files**: Toggle visibility of dotfiles and hidden folders.
- **Confirm delete threshold**: Set the number of files that triggers a confirmation dialog on deletion.
- **Default sort order**: Choose between name, modified time, or size.

See [[settings#File explorer]] for details.

## How it works

When you open Oil, the plugin creates a temporary Markdown file (e.g., `oil~_root.md`) to render the directory listing. These files are hidden from the Obsidian file explorer via CSS and from search and graph views via `userIgnoreFilters`.

Because Oil uses a standard Markdown buffer, all existing Vim features like EasyMotion, surround, and text objects work natively within the Oil view. The temporary file is automatically deleted when the tab is closed or the plugin unloads.

> [!warning]
> **Cross-directory moves**: Moving a file from one directory to another (e.g., `dd` in one Oil buffer and `p` in another) is supported but requires both directories to be open in separate Oil buffers simultaneously. See [[known-limitations#Oil explorer]] for details.
