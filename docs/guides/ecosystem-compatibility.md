---
title: Ecosystem compatibility
description: How Vim Motions coexists with other Vim-related Obsidian plugins — obsidian-vimrc-support, vim-im-control, Latex Suite, and more.
tags:
    - guide
---

# Ecosystem compatibility

Vim Motions is designed to coexist with other Vim-related Obsidian plugins. When the bundled fork is active, the plugin installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins can discover the Vim API at its canonical location.

## How compatibility works

Vim Motions is compatible with other Vim-related plugins by design, not through per-plugin special-casing. The compatibility approach is generic:

- **Vim API bridge**: When the bundled fork is active (built-in vim disabled), the plugin installs a property descriptor at `window.CodeMirrorAdapter.Vim` that returns the fork's Vim singleton. Any plugin that discovers the Vim API via this standard path — the same path Obsidian's own code uses — automatically works with the fork's enhanced API.
- **Extension priority**: The bundled vim extension is registered at `Prec.highest` so its keydown handler fires before other extensions, preventing double key consumption.
- **Global key handler**: Non-editor views (PDF, graph, canvas, etc.) are handled by a global key handler that intercepts workspace-relevant keystrokes. This works regardless of what plugin rendered the view.

These mechanisms are not targeted at specific plugins — they ensure compatibility with the entire ecosystem of plugins that use the standard Vim API discovery path.

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
