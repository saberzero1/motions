---
title: Installation
description: Install Vim Motions from the community directory or manually from GitHub releases.
tags:
    - getting-started
    - installation
---

## From community directory

1. Open **Settings → Community plugins**
2. Select **Browse** and search for "Vim Motions"
3. Select **Install**, then **Enable**

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/saberzero1/motions/releases)
2. Create a folder `vim-motions` in `<your-vault>/.obsidian/plugins/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**

## Verify installation

After enabling the plugin:

1. Open any Markdown file
2. Press `Esc` to enter Normal mode — the status bar should show **NORMAL**
3. Try `]h` to jump to the next heading — if it works, the plugin is active

## Next steps

See [[recommended-setup]] to configure Obsidian for the best experience, including whether to use the built-in vim engine or the enhanced bundled fork.
