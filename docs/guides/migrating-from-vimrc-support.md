---
title: Migrating from obsidian-vimrc-support
description: Transition from obsidian-vimrc-support to Vim Motions' built-in vimrc loader.
tags:
    - guide
    - configuration
---

Vim Motions includes a built-in `.obsidian.vimrc` loader that is compatible with [obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support) syntax. You can either use both plugins side by side or migrate entirely to Vim Motions' loader.

## Coexistence

Both plugins can be installed simultaneously. They register their `:ob` commands independently — there is no conflict. Your existing `.obsidian.vimrc` file works with both.

## Full migration

To switch entirely to Vim Motions' vimrc loader:

1. **Keep your `.obsidian.vimrc` file** — Vim Motions reads the same file in the same format
2. **Disable obsidian-vimrc-support** in **Settings → Community plugins** — Vim Motions takes over vimrc loading
3. **Verify your mappings work** — reload Obsidian and test your key bindings

## What's the same

| Feature                                    | obsidian-vimrc-support | Vim Motions |
| ------------------------------------------ | ---------------------- | ----------- |
| `map`/`nmap`/`imap`/`vmap`                 | ✅                     | ✅          |
| `noremap`/`nnoremap`/`inoremap`/`vnoremap` | ✅                     | ✅          |
| `unmap`/`nunmap`/`iunmap`/`vunmap`         | ✅                     | ✅          |
| `exmap` + `obcommand`                      | ✅                     | ✅          |
| `let mapleader`                            | ✅                     | ✅          |
| `source` (include other files)             | ✅                     | ✅          |

## What Vim Motions adds

| Feature                             | obsidian-vimrc-support | Vim Motions |
| ----------------------------------- | ---------------------- | ----------- |
| `set` options (35+ plugin settings) | ❌                     | ✅          |
| `whichkeygroup` / `whichkeylabel`   | ❌                     | ✅          |
| `let g:mode_prompt_*`               | ❌                     | ✅          |
| Settings override indicators in UI  | ❌                     | ✅          |
| Custom vimrc path (Obsidian Sync)   | ❌                     | ✅          |

## Custom vimrc path

The plugin automatically searches for vimrc files in the vault root (`vimrc`, `.vimrc`, `init.vim`, `.init.vim`, `obsidian.vimrc`, `obsidian.vim`, `.obsidian.vimrc`, `.obsidian.vim`). The first match is used. You can also set a custom path in **Settings → Vim Motions → Vimrc & key bindings → Custom vimrc path**.

## Troubleshooting

- **Mappings not applied**: The vimrc is loaded once during startup. If mappings aren't working, try reloading the plugin (disable and re-enable in Settings → Community plugins).
- **Duplicate `:ob` commands**: If both plugins are active, both register `:ob`. This is harmless — they produce the same result.

See [[vimrc]] for the full vimrc reference and [[known-limitations#Vimrc]] for known timing issues.
