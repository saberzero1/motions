---
title: Harpoon
description: Pin files to numbered slots for instant switching with cursor position tracking and persistence.
tags:
    - features
    - keybindings
---

Harpoon-style file pinning gives you instant access to a small set of frequently-used files. Pin files to numbered slots, jump to them with `<leader>1`–`<leader>9`, and the plugin remembers where your cursor was.

## Pinning files

Pin the current file with `<leader>ha` or `:HarpoonAdd`. The file is added to the next available slot. If the file is already pinned, nothing happens.

Toggle a pin with `<leader>ht` — pins the file if not pinned, unpins if already pinned.

Remove a pin with `<leader>hr` or `:HarpoonRemove`. To remove a specific slot: `:HarpoonRemove 3`.

## Jumping to pins

| Key                       | Action               |
| ------------------------- | -------------------- |
| `<leader>1` – `<leader>9` | Jump to pin slot 1–9 |
| `<leader>hn`              | Jump to next pin     |
| `<leader>hN`              | Jump to previous pin |
| `:HarpoonSelect N`        | Jump to pin slot N   |

Navigation reuses an existing tab if the file is already open. Otherwise, the file opens in the current pane (replacing the current buffer), matching harpoon's fast-switching behavior.

## Cursor position

The plugin tracks your cursor position in pinned files. When you leave a pinned file and return later, the cursor is restored to where you left off. Positions are updated automatically on every file switch.

> [!tip]
> Pin your daily note as `<leader>1`, your current project file as `<leader>2`, and your inbox as `<leader>3`. Three keystrokes to switch between your most important files.

## Picker

Open the harpoon picker with `<leader>hp` or `:Harpoon`. All pinned files are shown in slot order with file name and path. The picker supports fuzzy search, preview, and split-open (`<C-x>`/`<C-v>`/`<C-t>`).

## Persistence

Pins persist across file closes and plugin restarts. If a pinned file is renamed, the pin updates automatically. If a pinned file is deleted, the pin is removed.

## Keybindings

| Key                       | Action                        |
| ------------------------- | ----------------------------- |
| `<leader>ha`              | Pin current file              |
| `<leader>hr`              | Remove current file from pins |
| `<leader>ht`              | Toggle pin                    |
| `<leader>hp`              | Open harpoon picker           |
| `<leader>1` – `<leader>9` | Jump to slot 1–9              |
| `<leader>hn`              | Next pin                      |
| `<leader>hN`              | Previous pin                  |

## Ex commands

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `:HarpoonAdd`        | Pin current file                    |
| `:HarpoonRemove [N]` | Remove pin (current file or slot N) |
| `:Harpoon`           | Open harpoon picker                 |
| `:HarpoonSelect N`   | Jump to slot N                      |
| `:HarpoonNext`       | Next pin                            |
| `:HarpoonPrev`       | Previous pin                        |

## Settings

Toggle via **Settings → Vim Motions → Jump navigation → Harpoon file pinning** (default: on).
