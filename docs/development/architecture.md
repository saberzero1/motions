---
title: Architecture
description: Dual-vim architecture, module structure, and design patterns for contributors to the Vim Motions plugin.
tags:
    - development
---

## Overview

Vim Motions provides an enhanced Vim experience for Obsidian, built on a specialized fork of `codemirror-vim`. It extends Obsidian's editing capabilities with Markdown-aware text objects, structural navigation, and advanced workspace control while maintaining compatibility with the existing Vim ecosystem.

## Dual-vim architecture

The plugin operates in two distinct modes to ensure flexibility and stability:

- **Built-in vim mode**: When Obsidian's native Vim mode is enabled, the plugin uses the bundled `codemirror-vim` instance via `window.CodeMirrorAdapter.Vim`.
- **Bundled fork mode**: When native Vim is disabled, the plugin registers its own fork as a CodeMirror 6 extension. It installs a bridge at `window.CodeMirrorAdapter.Vim` so other plugins (like `obsidian-vimrc-support`) can still discover the Vim API.

The bundled fork is preferred for its advanced features, including async motion support for EasyMotion, Neovim-correct cursor positioning in Live Preview, and various behavioral fixes not present in the upstream library.

## Module structure

The `src/` directory is organized into focused modules:

- `main.ts`: Entry point handling plugin lifecycle and feature orchestration.
- `settings.ts`: Defines the settings interface, UI tab, and default values.
- `vim/`: Core engine integration, including registration logic, API detection, and the bundled fork provider.
- `easymotion/`: Implementation of EasyMotion/Hop navigation.
- `motions/`: Structural navigation for headings, lists, links, and tables.
- `text-objects/`: Markdown-specific text objects (e.g., code blocks, callouts).
- `operators/`: Custom operators like hard-wrap (`gq`).
- `actions/`: Custom actions such as smart list continuation.
- `workspace/`: Global navigation, pane management, and Ex commands.
- `ui/`: UI components including WhichKey, hint mode, and command suggestions.
- `vimrc/`: Logic for loading and parsing `.obsidian.vimrc` files.

## Lua runtime (`src/lua/`)

The plugin includes a sandboxed Lua 5.3 runtime via a browser-only fork of [fengari](https://github.com/saberzero1/fengari). The `src/lua/` directory is organized into focused modules:

- `engine.ts`: Lua VM lifecycle — sandboxed state creation, instruction-limit timeout (config load: 1M instructions; runtime callbacks: 500K; snippet nodes: 100K), `withInstructionGuard` helper, throttled error notices, code evaluation, registered cleanup before Lua close.
- `api.ts`: Registers the `vim.*` API surface — `vim.opt`, `vim.o`/`vim.go` (engine → shadow → defaults), shared `operatorfunc` option routes, `vim.g`, `vim.cmd`, `vim.keymap`, `vim.api` (60 real `nvim_*` implementations including extmarks, current-buffer/window calls, and non-floating window config), `vim.notify`, `vim.obsidian`/`vim.ob`, `vim.env`, `vim.log.levels`.
- `fn.ts`: Registers `vim.fn.*` functions (79 real implementations) with callbacks bridging to Obsidian's vault and editor APIs.
- `iter.ts`: Embedded Lua iterator implementation (26 methods); replaces the namespace stub. `rpop`, `count`, and `size` are extensions rather than Neovim 0.12 methods.
- `on-key.ts`: Namespace-scoped key observer registration, dispatch, and teardown. `src/workspace/key-observer.ts` feeds physical input from existing desktop/popout and mobile listeners. Observation is pre-mapping, with identical `key`/`typed` arguments and no key-discard support.
- `termcodes.ts`: Neovim key-byte encoder and decoder at the notation-based fork boundary, used by `nvim_replace_termcodes` and `nvim_feedkeys`.
- `window-info.ts`: CM6 viewport measurements for `vim.fn.getwininfo()` — inclusive visible lines, dimensions, and gutter offset.
- `stdlib.ts`: Pure-Lua standard library utilities — `vim.tbl_*` (12 table functions), `vim.split`/`vim.trim`/`vim.startswith`/`vim.endswith`/`vim.inspect`, `vim.json` (JS-bridged encode/decode), `vim.validate` (full Neovim spec), `vim.version` (11 functions), `vim.keycode`, `vim.notify_once`.
- `extmarks.ts`: Neovim extmark system — CM6 StateField-based registry with effects for set/delete/clear, VirtualTextWidget for inline/overlay/EOL decorations, position tracking that survives text edits, range query APIs for `nvim_buf_get_extmarks`.
- `timers.ts`: Async primitives — `vim.schedule`, `vim.defer_fn`, `vim.uv`/`vim.loop` timer subset. Managed by `TimerManager` for cleanup on plugin unload.
- `autocmd.ts`: Autocommand system — `AutocmdManager` handles 12 events (`InsertEnter`, `CursorMoved`, `BufWritePre`, etc.) with augroup management and pattern matching.
- `buffer.ts`: Buffer-local keymaps — `BufferKeymapManager` stores per-file keymaps and swaps them on active leaf change.
- `highlight.ts`: Highlight group → CSS bridge — `HighlightManager` maps `nvim_set_hl` calls to CSS custom properties (plugin-defined groups) or dynamic CSS classes (user-defined groups).
- `loader.ts`: Orchestrates Lua config loading — reads `.obsidian.init.lua`, creates the sandboxed state, injects all API modules, awaits Treesitter/query initialization, evaluates user code, and returns collected keymaps/commands/settings. Normalizes the fork's returned `Error` for unknown options.

The injection order matters: `injectIterApi()` must run after `injectNamespaceStubs()` so the real iterator replaces the stub. The loader awaits `initTreesitterRuntime(app.vault.adapter)` before evaluating user code, allowing synchronous named-query calls during configuration. Key observers and owned compiled queries register cleanup before the Lua state closes.

### Named Treesitter queries

- `src/treesitter/bundled-queries.ts`: Bundled `textobjects` constants for Markdown, Markdown inline, and HTML.
- `src/treesitter/query-files.ts`: Preloaded `.scm` snapshot with user → lexically ordered plugin → bundled precedence, `;; extends`, recursive `;; inherits:`, cycle detection, and resource limits (128 KiB/file, 4 MiB/snapshot, 512 KiB/combined query, 64 sources, 16 inheritance levels).
- `src/treesitter/named-queries.ts`: Per-Lua-state `query.set()` overrides, lazy compilation, revision-based cache invalidation, and owned-query cleanup.
- `src/lua/treesitter/query-api.ts`: Lua query bindings; capture/match iterators use the supplied source or parsed node's retained document text for predicates and take row bounds after the source argument.

User queries live at `lua/queries/{lang}/{name}.scm`; plugin queries live at `lua/{plugin}/queries/{lang}/{name}.scm`. Auto-fetch retains `.scm` files under isolated `lua/{owner}__{repo}/queries/` roots and refreshes the snapshot before Lua resumes. Older cached plugins need re-fetching to obtain formerly discarded queries. `.scm` edits require configuration reload, and `query.get_files()` omits bundled constants because they have no physical path. Named queries do not yet drive `LanguageTree` injection loading. See [[lua-config#Query files and resolution]] for user-facing conventions.

## Feature registration pattern

Features are registered using the `VimRegistration` class. This provides a unified interface for defining motions, actions, operators, and Ex commands:

- `defineMotion()`, `defineAction()`, `defineOperator()`, `defineExCommand()`
- `mapCommand()` for keybindings

This abstraction allows for clean "hot-reload" functionality. During a settings update or plugin reload, `unregisterAll()` is called to clear existing definitions before re-registering features based on the new configuration.

## Vim API bridge

To maintain ecosystem compatibility, the plugin uses a `getVimApi()` helper that prioritizes the built-in API but falls back to the bundled fork.

When the fork is active, a bridge is installed using a property descriptor (getter) on `window.CodeMirrorAdapter.Vim`. This ensures the fork's Vim singleton is always returned, even if other plugins attempt to overwrite the property, ensuring a consistent experience regardless of load order.

## Settings hot-reload

The plugin supports dynamic configuration changes without requiring an Obsidian restart. When settings are modified, `reloadFeatures()` orchestrates a full teardown and setup cycle:

1. Unregisters all custom Vim commands.
2. Resets the internal keymap.
3. Re-registers features and applies `.obsidian.vimrc` mappings based on the updated settings.

## Testing

Vim Motions uses a robust testing strategy centered on Neovim parity. Tier 1 commands are verified against a headless Neovim instance using the `testWithNeovim()` helper.

- **Golden files**: Recorded Neovim output used for CI comparison.
- **Deviation registry**: Tracks intentional differences where Obsidian's behavior purposefully diverges from Neovim.
- **E2E tests**: WebDriverIO tests running against a real Obsidian instance.

For more details on the testing infrastructure, see `AGENTS.md`.
