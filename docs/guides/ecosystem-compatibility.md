---
title: Ecosystem compatibility
description: How Vim Motions coexists with other Vim-related Obsidian plugins — obsidian-vimrc-support, vim-im-control, Latex Suite, and more.
tags:
    - guide
---

# Ecosystem compatibility

Vim Motions is designed to coexist with other Vim-related Obsidian plugins. When the bundled fork is active, the plugin installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins can discover the Vim API at its canonical location.

## Plugin compatibility

| Plugin                                                                   | Compatible | Notes                                                                                                                                           |
| ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) | ✅         | Both register `:ob` independently. Can coexist or you can migrate fully — see [[migrating-from-vimrc-support]].                                 |
| [vim-im-control](https://github.com/hideakitai/obsidian-vim-im-control)  | ✅         | Discovers the Vim API via the bridge. Works in both built-in and bundled fork modes.                                                            |
| [Latex Suite](https://github.com/artisticat1/obsidian-latex-suite)       | ✅         | The bundled vim extension is registered at `Prec.highest` so auto-snippets, tabstop navigation, and math-mode features work in vim insert mode. |
| [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus)                 | ✅         | Non-editor views are handled by the global key handler. Workspace navigation (`<C-w>`, `gt`/`gT`) works in PDF views.                           |

## Vim API bridge

When the bundled fork is active (built-in vim disabled), the plugin installs a property descriptor at `window.CodeMirrorAdapter.Vim` that returns the fork's Vim singleton. This uses a getter rather than a static value, ensuring the fork always wins regardless of plugin load order.

Ecosystem plugins that access the Vim API via `window.CodeMirrorAdapter.Vim` (the standard discovery path) will automatically use the fork's enhanced API.

## Built-in vim mode

When built-in vim is enabled, the plugin extends Obsidian's bundled codemirror-vim instance. The Vim API is accessed via `window.CodeMirrorAdapter.Vim` without any bridge — it's the standard path. All ecosystem plugins work as expected.

The difference is that fork-only features (async motions, surround, cursor shapes) are not available in this mode.

## Potential conflicts

### `<C-w>` hotkey

Obsidian's default "Close current tab" hotkey (`Ctrl+W`) conflicts with the `<C-w>` window prefix. Rebind it in **Settings → Hotkeys**.

### `Ctrl-d`, `Ctrl-f`, `Ctrl-b`

These scroll keys require unbinding Obsidian's default hotkeys for them in **Settings → Hotkeys**. `Ctrl-u` works without changes.

### Other Vim plugins

If another plugin registers its own Vim motions, operators, or keymaps, conflicts are possible. Vim Motions' `reloadFeatures()` mechanism uses `resetKeymap()` to restore defaults during hot-reload, which may clear mappings from other plugins. Reload Obsidian if mappings from other plugins stop working after changing Vim Motions settings.
