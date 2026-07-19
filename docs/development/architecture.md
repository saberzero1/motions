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

- `engine.ts`: Lua VM lifecycle — sandboxed state creation, instruction-limit timeout (config load: 1M instructions; runtime callbacks: 500K; snippet nodes: 100K), `withInstructionGuard` helper, throttled error notices, code evaluation.
- `api.ts`: Registers the `vim.*` API surface — `vim.opt`, `vim.g`, `vim.cmd`, `vim.keymap`, `vim.api` (16 `nvim_*` functions), `vim.notify`, `vim.obsidian`/`vim.ob`, `vim.env`, `vim.log.levels`.
- `fn.ts`: Registers `vim.fn.*` functions (26 functions) with callbacks bridging to Obsidian's vault and editor APIs.
- `stdlib.ts`: Pure-Lua standard library utilities — `vim.tbl_*` (12 table functions), `vim.split`/`vim.trim`/`vim.startswith`/`vim.endswith`/`vim.inspect`, and `vim.json` (JS-bridged encode/decode).
- `timers.ts`: Async primitives — `vim.schedule`, `vim.defer_fn`, `vim.uv`/`vim.loop` timer subset. Managed by `TimerManager` for cleanup on plugin unload.
- `autocmd.ts`: Autocommand system — `AutocmdManager` handles 12 events (`InsertEnter`, `CursorMoved`, `BufWritePre`, etc.) with augroup management and pattern matching.
- `buffer.ts`: Buffer-local keymaps — `BufferKeymapManager` stores per-file keymaps and swaps them on active leaf change.
- `highlight.ts`: Highlight group → CSS bridge — `HighlightManager` maps `nvim_set_hl` calls to CSS custom properties (plugin-defined groups) or dynamic CSS classes (user-defined groups).
- `loader.ts`: Orchestrates Lua config loading — reads `.obsidian.init.lua`, creates the sandboxed state, injects all API modules, evaluates user code, and returns collected keymaps/commands/settings.

The injection order matters: `createSandboxedState()` → `injectVimApi()` → `injectVimFn()` → `injectStdlib()` → `injectTimers()` → `evalLua(userCode)`.

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
