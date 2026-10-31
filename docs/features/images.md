---
title: Images
description: Select an embedded image with h and l, resize it with :image, and reach its buttons with hint mode, as Obsidian 1.13's own Vim mode does.
tags:
    - features
    - keybindings
---

Obsidian 1.13 treats an embedded image in Live Preview as one object you can select: it gets an accent outline and its **Zoom in** and **Edit this block** buttons stay visible. Obsidian's own Vim mode selects it from the keyboard. The plugin does the same when it runs its own engine.

> [!info]
> Requires Obsidian 1.13 or later. Under Obsidian's own **Vim key bindings**, Obsidian provides all of this itself.

## Selecting an image

In normal mode, `l` at the start of an image selects it instead of moving, and `l` again leaves it with the cursor at its end. `h` works the same way from the end of the image. Moving off the image any other way, such as `j`, clears the selection.

A count or a pending operator turns this off, so `2l` still moves two characters and `dl` still deletes one. The check is made on the physical key, before mappings, as Obsidian's is.

> [!note]
> This is a deliberate difference from Neovim, where `l` always moves. An embed is Obsidian syntax that Live Preview draws as one object, so the plugin follows Obsidian here.

## Resizing

`:image grow`, `:image shrink`, `:image reset` and `:image edit` act on the selected image. With no image selected, they select the one under the cursor first. See [[ex-commands#`:image` — resize or edit an image|`:image`]] for counts and mapping examples.

## Hint mode

[[hint-mode|Hint mode]] labels an image's buttons while they are visible, which is when the image is selected or hovered. A hidden button gets no label.

## Neovim backend

Under the [[neovim-backend|Neovim backend]], `:image` works from Neovim's command line. The resize is written into Neovim's buffer as one change, so `u` undoes it. Selecting an image with `h` and `l` is not available there, because Neovim owns those keys; put the cursor on the embed and run `:image` instead.
