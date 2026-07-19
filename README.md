# Vim Motions

A polished, Neovim-native experience inside [Obsidian](https://obsidian.md). Vim Motions adds what's missing from Obsidian's built-in Vim mode: Markdown-aware text objects, structural navigation, hard-wrap formatting, workspace keyboard control, EasyMotion, Lua configuration with `vim.keymap.set` / `vim.opt` / `vim.fn` / `vim.api` / `vim.tbl_*` / autocommands / timers / highlight groups, and a built-in `.obsidian.vimrc` loader.

**[Full documentation →](https://saberzero1.github.io/motions)**

## Features

- **Markdown text objects** — operate on bold, italic, code, math, links, blockquotes, code blocks, callouts, tags, table cells, subwords, numbers, quotes, wikilinks, URLs, and arguments with `d`, `c`, `y`, `v`
- **Structural navigation** — jump between headings, lists, links, and buffers with `]h`, `]l`, `]n`, `]b`
- **Lua configuration** — `.obsidian.init.lua` with conditional logic, function keymaps, `vim.fn.*`, `vim.api.*` (buffer APIs, `nvim_set_hl`), `vim.tbl_*`, `vim.snippet.*`, `vim.json`, `vim.inspect`, `vim.regex` (ECMAScript RegExp), `vim.schedule`/`vim.defer_fn`/`vim.uv` timers, autocommands (19 events), `vim.obsidian` namespace (including `vim.obsidian.im` for input method control), buffer-local keymaps, async file reading (`vim.ob.fs.read`), multi-file configs via `require()`, `collectgarbage()` support, `__gc` userdata finalization, and Neovim-compatible syntax
- **Built-in vimrc** — `.obsidian.vimrc` loader with 75+ configurable settings and which-key support with Lucide icons
- **Flash motions** — enhanced `f`/`F`/`t`/`T` with labels on all visible matches ([flash.nvim](https://github.com/folke/flash.nvim)-inspired). Auto-jumps on single match. Operator-pending (`df`, `cf`, `yf`), visual mode, multi-line search. Incremental `s` jump mode (type multiple chars to narrow, labels update live), post-commit `/`/`?` search labels, clever-f repetition, label conflict skipping, `[3/15]` search match counter
- **EasyMotion / Hop** — jump to any visible position with two keystrokes, with operator-pending support
- **Workspace keyboard control** — navigate panes, tabs, and sidebar without a mouse (`<C-w>`, `gt`/`gT`, `:sp`/`:vs`)
- **Surround** — add, change, or delete surrounding delimiters (vim-surround with Markdown support, including `dsf`/`csf` for function calls, dot-repeat for `ys` with text objects)
- **Hard-wrap formatting** — Markdown-aware `gq`/`gw` operators with prefix preservation
- **Replace-with-register** — `gr{motion}` replaces text with register contents without clobbering the register ([vim-ReplaceWithRegister](https://github.com/inkarkat/vim-ReplaceWithRegister) parity)
- **Table editing** — cell navigation, text objects, manipulation commands, format-on-exit auto-alignment, cursor-aware table widget, and embedded per-cell editing with vim-enabled cell editors and direct table manipulation (`o`, `dd`, `J`/`K`, `H`/`L`, `=`)
- **Oil explorer** — [oil.nvim](https://github.com/stevearc/oil.nvim)-inspired file manager: edit directories as buffers, create/rename/delete files with vim commands
- **Telescope-style picker** — fuzzy finder with 14 built-in sources (files, buffers, commands, headings, outline, grep, live grep, marks, registers, tags, backlinks, recent, harpoon, snippets), preview pane, frecency scoring, bundled integrations for [Omnisearch](https://github.com/scambier/obsidian-omnisearch), [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks), and [Dataview](https://github.com/blacksmithgu/obsidian-dataview), and a [provider API](https://saberzero1.github.io/motions/development/picker-api) for external plugin integration
- **Snippets** — VS Code-compatible snippet expansion with tabstop navigation, variables, choice nodes, context filtering. 60+ bundled Obsidian snippets. User-defined snippets via JSON files or [LuaSnip](https://github.com/L3MON4D3/LuaSnip)-inspired Lua DSL with reactive `f()`/`d()` nodes
- **100+ ex commands** — `:sp`, `:vs`, `:e`, `:grep`, `:ob`, `:Oil`, `:sidebar`, navigation/action aliases, and more
- **Vimium-style hints** — navigate the entire Obsidian UI with keyboard hints (`f`, `F`, `yf`, `df`)
- **Line numbers** — configurable line number gutter with absolute, relative, and hybrid modes. Neovim-compatible `statuscolumn` API for custom gutter layouts (`vim.opt.statuscolumn = "%s %l %r %C"`). Cursor line highlight (`cursorline`/`cursorlineopt`), configurable number width, mobile-responsive gutter, and Obsidian's native line numbers suppressed when active
- **Marks** — dedicated sign column gutter showing mark letters next to marked lines, configurable via `signcolumn` (auto/always/off), consistent font size regardless of content, gutter layout matching Neovim (sign column → line numbers → fold column), global mark persistence across files and sessions (`A`–`Z`), and a grouped marks picker with cross-file navigation
- **Harpoon** — pin files to numbered slots for instant switching (`<leader>1`–`<leader>9`), cursor position tracking, persistence across sessions, auto-updating on file rename/delete
- **Fully remappable keybindings** — every keybinding can be customized via Lua or vimrc across all contexts (editor, oil explorer, picker, workspace)
- **Folding** — full Neovim-style fold commands: `zf` (create), `zd` (delete), `zE` (eliminate all), `zm`/`zr` (incremental level), custom fold providers for frontmatter and callouts, descriptive fold placeholder text, fold-aware navigation (auto-unfold on `]h`), cross-session fold persistence, and optional fold column gutter (`set foldcolumn`) with click-to-fold
- **Input method switching** — automatic IM switching for CJK users when entering/leaving insert mode. Supports macism, im-select, fcitx5-remote, ibus, and any external binary. Platform presets for one-click setup, per-editor state with session persistence, composition guard, `:IMToggle`/`:IMStatus` ex commands, Lua API (`vim.obsidian.im`). Desktop only.
- **Vim in text areas** — focused `<textarea>` elements in modals and plugin UIs are replaced with a vim-enabled editor overlay. Starts in insert mode for transparent typing; press Escape for normal mode, second Escape returns to modal. Experimental, disabled by default. Desktop only.
- **Cross-note jump list** — `<C-o>` and `<C-i>` navigate backward/forward through jump history across notes. Jumps recorded on `gd`, picker selection, harpoon, oil, EasyMotion, and 100+ other navigation paths. Persists across sessions. `:jumps` displays the list. `set jumplist`/`set jumplistsize` for configuration
- **Subword motions** — spider.nvim-style `w`/`b`/`e`/`ge` override stopping at camelCase, snake_case, and kebab-case boundaries. Opt-in setting.
- **Enhanced increment/decrement** — dial.nvim-style `<C-a>`/`<C-x>` cycling hex colors, booleans, dates, CSS values, and checkboxes
- **Custom text objects** — define delimiter-pair text objects from Lua via `vim.textobject.add()` + `vim.gen_spec.pair()`
- **External grep** — optional ripgrep or GNU grep binary for native-speed vault search in the picker. Desktop only with in-memory fallback.
- **Quality of life**: Neovim defaults (`Y`/`Q`), yank highlight, smart list continuation, scrolloff, insert escape sequences, chord display, powerline status bar, and settings hot-reload

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
- Desktop or mobile (physical keyboard recommended on mobile)

## Development

```bash
npm install      # Install dependencies
npm run dev      # Development build (watch mode)
npm run build    # Production build
npm run lint     # Lint
npm run test:e2e # E2E tests (requires nix develop)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide, testing strategy, and contribution guidelines.

## License

[MIT](LICENSE) — Emile Bangma
