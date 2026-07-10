# Vim Motions

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.tbl_*` / autocommands / timers / highlight groups, and a built-in `.obsidian.vimrc` loader.

**[Full documentation →](https://saberzero1.github.io/motions)**

## Features

- **Markdown text objects** — operate on bold, italic, code, math, links, blockquotes, code blocks, callouts, tags, and table cells with `d`, `c`, `y`, `v`
- **Structural navigation** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **Lua configuration** — `.obsidian.init.lua` with conditional logic, function keymaps, `vim.fn.*`, `vim.api.*` (buffer APIs, `nvim_set_hl`), `vim.tbl_*`, `vim.json`, `vim.inspect`, `vim.schedule`/`vim.defer_fn`/`vim.uv` timers, autocommands (17 events), `vim.obsidian` namespace, buffer-local keymaps, and Neovim-compatible syntax
- **Built-in vimrc** — `.obsidian.vimrc` loader with 35+ configurable settings and which-key support
- **EasyMotion / Hop** — jump to any visible position with two keystrokes, with operator-pending support
- **Workspace keyboard control** — navigate panes, tabs, and sidebar without a mouse (`<C-w>`, `gt`/`gT`, `:sp`/`:vs`)
- **Surround** — add, change, or delete surrounding delimiters (vim-surround with Markdown support)
- **Hard-wrap formatting** — Markdown-aware `gq`/`gw` operators with prefix preservation
- **Table editing** — cell navigation, text objects, manipulation commands, auto-formatting, and cursor-aware table widget
- **Oil explorer** — [oil.nvim](https://github.com/stevearc/oil.nvim)-inspired file manager: edit directories as buffers, create/rename/delete files with vim commands
- **100+ ex commands** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, `:Oil`, `:sidebar`, navigation/action aliases, and more
- **Vimium-style hints** — navigate the entire Obsidian UI with keyboard hints (`f`, `F`, `yf`, `df`)
- **Fully remappable keybindings** — every keybinding can be customized via Lua or vimrc across all contexts (editor, oil explorer, picker, workspace)
- **Quality of life**: Neovim defaults (`Y`/`Q`), smart list continuation, scrolloff, insert escape sequences, chord display, powerline status bar, and settings hot-reload

## Installation

### From community directory

Search for "Vim Motions" in **Settings → Community plugins → Browse**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/saberzero1/motions/releases).
2. Create a folder `vim-motions` in `<your-vault>/.obsidian/plugins/`.
3. Copy the downloaded files into that folder.
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**.

## Recommended setup

**Disable** Obsidian's built-in Vim mode (**Settings → Editor → Vim key bindings → off**). Vim Motions provides its own enhanced vim engine — a [fork of codemirror-vim](https://github.com/saberzero1/codemirror-vim) — with Neovim-correct behavior, async motion support, correct cursor positioning in Live Preview, and theme-aligned styling.

The plugin also works with built-in vim mode enabled, but the fork provides a more accurate Vim experience. See the [recommended setup guide](https://saberzero1.github.io/motions/getting-started/recommended-setup) for details.

## Documentation

Full documentation: **https://saberzero1.github.io/motions**

- [Getting started](https://saberzero1.github.io/motions/getting-started/)
- [Features](https://saberzero1.github.io/motions/features/)
- [Lua configuration](https://saberzero1.github.io/motions/configuration/lua-config)
- [Settings reference](https://saberzero1.github.io/motions/configuration/settings)
- [Keybinding cheat sheet](https://saberzero1.github.io/motions/reference/keybindings)
- [Remapping guide](https://saberzero1.github.io/motions/configuration/remapping)
- [Known limitations](https://saberzero1.github.io/motions/reference/known-limitations)
- [Changelog](https://saberzero1.github.io/motions/reference/changelog)

## Requirements

- Obsidian v1.6.6 or later
- Desktop and mobile (physical keyboard recommended on mobile)

## Development

```bash
npm install      # Install dependencies
npm run dev      # Development build (watch mode)
npm run build    # Production build
npm run lint     # Lint
npm run test:e2e # E2E tests (requires nix develop)
```

See [AGENTS.md](AGENTS.md) for the full development guide, testing strategy, and contribution guidelines.

## License

[MIT](LICENSE) — Emile Bangma
