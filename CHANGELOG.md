# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.145.0] - 2026-09-04

### Added

- **Configuration hot-reload for Lua** — the Lua configuration file (`init.lua`) is now watched for changes. Saving the file triggers a soft-reload that tears down the old Lua state and re-initializes it without a plugin reload, matching the existing vimrc hot-reload behavior. ([#168](https://github.com/saberzero1/motions/issues/168))
    - Plugin: `src/main.ts` (added Lua file watcher, `softReloadLuaConfig()` method)
- **New configuration management commands** — two new Obsidian commands for managing configuration files:
    - `Vim Motions: Reload configuration` — reloads both vimrc and Lua config files immediately.
    - `Vim Motions: Open configuration in default editor` — opens all active configuration files (vimrc and/or Lua) in the system's default external editor. Desktop only.
    - Plugin: `src/main.ts` (added `reload-configuration` and `open-configuration` commands, `reloadAllConfigs()` and `openConfigInDefaultEditor()` methods)

### Fixed

- **`reload-configuration` fails when initial vimrc load missed the file** — if the initial vimrc load hit the known adapter timing race (empty file read during early lifecycle), `vimrcWatchPath` was null and the reload command silently did nothing. Fixed by resolving the vimrc path on-demand in `reloadAllConfigs()` when `vimrcWatchPath` is null. ([#168](https://github.com/saberzero1/motions/issues/168))
    - Plugin: `src/main.ts` (`reloadAllConfigs()` path resolution fallback)
- **`reload-configuration` notification shown when notifications disabled** — the generic "configuration reloaded" notice was shown when `showConfigNotifications` was disabled, and was also shown when `configMode` was `settings` (no configs to reload). Fixed: generic notice only shows when notifications are suppressed as a minimal confirmation; shows "no configuration files to reload" when neither config type is active. ([#168](https://github.com/saberzero1/motions/issues/168))
    - Plugin: `src/main.ts` (`reloadAllConfigs()` notification logic)
- **Non-markdown files missing from `:files`, `:buffers`, and buffer navigation** — `:files` only listed `.md` files (used `getMarkdownFiles()`), `:buffers` only listed markdown leaves (checked `getViewType() === 'markdown'`), and `]b`/`[b`, `:b <name>`, `:find`, `:bfirst`/`:blast` all had the same markdown-only filters. Canvas, base, and other file-backed views were invisible to all buffer/file commands. Fixed by replacing `getMarkdownFiles()` with `getFiles()` for file listing, `getViewType()` checks with `instanceof FileView` for leaf iteration, and adding `leaf.getRoot() === rootSplit` guards to exclude sidebar panel views (backlink, outline, etc.) from buffer commands. ([#169](https://github.com/saberzero1/motions/issues/169))
    - Plugin: `src/picker/sources/files.ts` (`getMarkdownFiles()` → `getFiles()`)
    - Plugin: `src/picker/sources/buffers.ts` (`getViewType()` → `instanceof FileView` + `rootSplit` guard)
    - Plugin: `src/workspace/commands.ts` (`:buffers` fallback modal, `:find`, `:b`, `:bfirst`/`:blast` — same `FileView` + `rootSplit` pattern)
    - Plugin: `src/ui/global-ex-command.ts` (global ex fallbacks: `findFile`, `bufferSwitch`, `bufferFirstLast`)
    - Plugin: `src/motions/buffers.ts` (renamed `getMarkdownLeaves` → `getFileLeaves`, `instanceof FileView` + `rootSplit`, removed `.endsWith('.md')` fallback filter)

### Tests

- 6 e2e tests in `test/specs/config-management.e2e.ts` for #168 (vimrc reload picks up new mappings; reloaded mapping works functionally; Lua config reload via command; `open-configuration` registered; `reload-configuration` registered; `open-configuration` does not throw)
- 6 regression tests in `test/specs/files-buffers-non-md.e2e.ts` for #169 (`:files` picker includes `.canvas` files; `:buffers` picker includes canvas leaves; `:find` navigates to canvas file; `:b` switches to canvas leaf; `:blast` works with canvas leaf present; `]b` reaches canvas leaf)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated with configuration management commands and Lua hot-reload
- `CONTRIBUTING.md`: updated `src/main.ts` description
- `README.md`: added hot-reload to feature list
- `docs/configuration/lua-config.md`: documented soft-reload and external editor command
- `docs/configuration/vimrc.md`: documented reload and external editor commands
- `docs/reference/keybindings.md`: added new configuration commands to Obsidian commands table
- `docs/features/quality-of-life.md`: added configuration hot-reload section
- `docs/features/index.md`: added hot-reload to configuration overview
- `docs/index.md`: added hot-reload to feature highlights
- `docs/features/ex-commands.md`: clarified `:files` searches all vault files, not just markdown

## [0.144.0] - 2026-09-04

### Added

- **Lua `os` library support** — the `os` library is now available in the Lua sandbox, providing access to date, time, and environment functions. Parity with Neovim: all functions available on desktop, nil on mobile. `os.execute` and `os.exit` are permanently blocked for security.
    - Plugin: `src/lua/engine.ts` (opened `os` library, added defense-in-depth blocks)

### Changed

- **Fengari CJS-to-TypeScript-ESM conversion** — all 37 fengari source files converted from CommonJS JavaScript to TypeScript ESM with full typing (`strict: true`). Broken circular dependencies between `defs.ts`/`luaconf.ts` and `linit.ts`/`lualib.ts`. Implemented a hybrid TValue type system with type predicates and narrowed accessors.
    - Plugin: `src/lib/fengari/*.ts` (37 files converted from `.js` CJS to `.ts` ESM)
    - Plugin: `src/lib/fengari/index.ts` (barrel rewritten — no `as any` casts)
    - Plugin: `src/lib/fengari/platform.ts` (was `.js`)
    - Plugin: `src/lib/fengari/package.json` (removed — CJS marker no longer needed)
    - Plugin: `src/lib/fengari/DIFFERENCES.md` (updated for TS conversion)
    - Plugin: `src/lua/engine.ts` (null check for `luaL_newstate()`)
    - Plugin: `vitest.config.ts` (removed `.test.js` pattern)
    - Plugin: `eslint.config.mts` (removed all fengari-specific rule overrides — all suppressions now inline with descriptions)
    - Plugin: `src/lib/fengari/lbaselib.ts` (`console.log` → `console.warn` for Lua `print()` fallback — dead code in plugin context, avoids community scanner `no-console` warning)
    - Plugin: `src/lua/engine.ts` (narrowed `lua_atnativeerror` handler string coercion)
- **Host-agnostic Lua runtime** — replaced platform guards with a dependency injection pattern. Fengari no longer sniffs for Node.js or browser environments, instead using a provider injected by the plugin.
    - Plugin: `src/lib/fengari/platform.ts` (platform provider implementation)
    - Plugin: `src/lua/engine.ts` (injected Obsidian platform provider)

### Tests

- 23 unit tests in `test/unit/fengari/` (6 fork-specific converted to typed TS, 17 upstream absorbed from fengari repo)
- 13 unit tests in `test/unit/lua/os-lib.test.ts` for the `os` library

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated fengari section — TypeScript ESM conversion, TValue type system, test organization
- `CONTRIBUTING.md`: updated fengari directory description
- `KNOWN_LIMITATIONS.md`: updated absorbed fengari references and links
- `docs/configuration/lua-config.md`: updated absorbed fengari references

## [0.143.0] - 2026-09-03

### Fixed

- **Disabling workspace navigation disables editor ex commands and core vim actions** — turning off **Settings → Vim Motions → Navigation → Workspace navigation** also disabled all editor-level ex commands (`:w`, `:q`, `:buffers`, `:sp`, `:vs`, `:grep`, etc.) and all core vim actions registered by `registerWorkspaceNavigation()` — including fold commands (`zc`/`zo`/`za`/`zM`/`zR`/`zj`/`zk`/`[z`/`]z`/`zf`/`zd`/`zE`), paste (`P`/`gp`/`gP`), goto-definition (`gd`/`gD`/`<C-]>`), document outline (`gO`), URL open (`gx`), character info (`ga`/`g8`/`K`), file info (`<C-g>`), blank lines (`]<Space>`/`[<Space>`), horizontal scroll (`zs`/`ze`/`zH`/`zL`), and more. Root cause: `registerExCommands()` and `registerWorkspaceNavigation()` were both inside the `if (enableWorkspaceNav)` gate. Fixed by (1) moving `registerExCommands()` outside the gate, (2) splitting `registerWorkspaceNavigation()` into `registerCoreVimActions()` (always called — editor commands unrelated to pane/tab management) and `registerWorkspaceNavigation()` (gated — pane focus, tab switching, splits, close). ([#165](https://github.com/saberzero1/motions/issues/165))
    - Plugin: `src/main.ts` (`registerExCommands` and `registerCoreVimActions` called unconditionally; `registerWorkspaceNavigation` remains gated)
    - Plugin: `src/workspace/navigation.ts` (split into `registerCoreVimActions` + `registerWorkspaceNavigation`)
- **Disabling hard-wrap disables fold commands** — turning off **Settings → Vim Motions → Vim features → Hard-wrap formatting** also disabled all fold commands (`zf`/`zF`/`zd`/`zD`/`zE`/`zv`/`zj`/`zk`/`[z`/`]z`/`zn`/`zN`/`zi` + `:fold`/`:foldopen`/`:foldclose`/`:folddoopen`/`:folddoclosed`). Root cause: `registerFoldCommands()` and `registerFoldEnableCommands()` were called inside `registerOperators()`, which is gated by `enableHardWrap`. Fixed by moving both fold registration calls out of `registerOperators()` and calling them unconditionally in `main.ts`.
    - Plugin: `src/operators/register.ts` (removed fold registration calls)
    - Plugin: `src/main.ts` (`registerFoldEnableCommands` and `registerFoldCommands` called unconditionally)
- **`keyToKey` mappings silently fail when prefix-deferred** — `vim.keymap.set("n", "<leader><leader>", ":buffers<CR>")` with `vim.g.mapleader = " "` silently did nothing because `<Space><Space>h` (hint mode) created a partial match, triggering the fork's prefix-ambiguity deferral. After the `operatorshadowtimeout` (1000ms), the deferred command timer called `commandDispatcher.processCommand()` which has no handler for `keyToKey` type mappings — they fell through to `default: break`. Fixed by adding a `keyToKey` type check in the deferred command timer that routes to `doKeyToKey()` instead, matching the dispatch logic in the main `findKey` path. The 1-second delay before the deferred command fires is correct Neovim `timeoutlen` behavior — users who want a shorter delay can use `set timeoutlen=300` (now a supported alias for `operatorshadowtimeout`). ([#166](https://github.com/saberzero1/motions/issues/166))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`_deferredCommandTimer` callback: `keyToKey` → `doKeyToKey`; `timeoutlen`/`tm` registered as aliases for `operatorshadowtimeout`; `timeoutlen=0` executes immediately instead of blocking)
    - Plugin: `src/vim/neovim-options.ts` (removed `timeoutlen`/`tm` from noop list — now handled by the fork)
    - Plugin: `src/vimrc/loader.ts` (added `timeoutlen`/`tm` to `KNOWN_SET_OPTIONS` as aliases for `operatorshadowtimeout`)
    - Plugin: `src/lua/api.ts` (`vim.opt.__newindex` now syncs non-sideEffect `KNOWN_SET_OPTIONS` to the fork via `callbacks.setOption`)
    - Plugin: `src/ui/which-key.ts` (suppress `vim-keypress` after `vim-command-done` to prevent which-key popup re-showing after synchronous command execution)

### Tests

- 3 regression tests in `test/specs/settings-reload.e2e.ts` for #165 (`:buffers` ex command works with workspace nav disabled; `gO` outline works with workspace nav disabled; `zj` fold motion works with hard-wrap disabled)
- 2 regression tests in `test/specs/settings-reload.e2e.ts` for #166 (`<Space><Space>` keyToKey mapping executes after operatorshadowtimeout when `<Space><Space>h` partial exists; `timeoutlen=0` executes deferred mapping immediately)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked workspace navigation paste dependency as fixed; updated operator-prefix key dispatch section with `timeoutlen`/`tm` aliases, `keyToKey` dispatch fix, and `timeoutlen=0` immediate execution
- `CONTRIBUTING.md`: updated `navigation.ts` and `operators/register.ts` descriptions to reflect split
- `AGENTS.md`: updated fork description with `keyToKey` deferred command fix and `timeoutlen`/`tm` aliases
- `docs/configuration/settings.md`: updated `operatorshadowtimeout` description with `timeoutlen`/`tm` aliases
- `docs/configuration/vimrc.md`: updated `operatorshadowtimeout` short names with `timeoutlen`/`tm` aliases
- `docs/configuration/lua-config.md`: updated `operatorshadowtimeout` entry with `timeoutlen`/`tm` aliases

## [0.142.0] - 2026-09-03

### Fixed

- **`:obcommand` via vim mapping in visual mode loses selection** — when a user maps a visual-mode key to `:obcommand editor:toggle-bullet-list` (or any selection-dependent Obsidian command) via `exmap` + `vmap`, the command operates on only the cursor line instead of all selected lines. Root cause: the codemirror-vim fork's `ExCommandDispatcher._processCommand()` exits visual mode before executing the ex command handler, so by the time `:obcommand` calls `executeCommandById()`, the CM6 selection is collapsed. Fixed by reading the visual range from `params.selectionLine`/`params.selectionLineEnd` (set by `parseInput_` before `exitVisualMode`) and falling back to the `'<`/`'>` vim marks for the `exmap` indirection path where the inner `_processCommand` no longer has visual mode context. The CM6 selection is expanded to the visual range before the Obsidian command executes. ([#161](https://github.com/saberzero1/motions/discussions/161))
    - Plugin: `src/workspace/commands.ts` (added `getVisualRange()` and `expandSelectionFromRange()` in `createObCommand`)
    - Plugin: `src/types/vim-api.d.ts` (added `selectionLine`/`selectionLineEnd` to `ExCommandArgs`)

### Tests

- 3 e2e tests in `test/specs/obcommand-visual-mode.e2e.ts` for #161 (direct `handleEx` bullet toggle, `defineEx` exmap indirection, numbered list variant — all in visual-line mode)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated Obsidian command passthrough section with ex command path fix

## [0.141.0] - 2026-09-03

### Fixed

- **Disabling workspace navigation disables all global keybindings** — turning off **Settings → Vim Motions → Navigation → Workspace navigation** also disabled the `:` ex command line in reading view, `vim.obsidian.keymap.set` mappings, and hint mode global hotkeys. Root cause: the `GlobalKeyHandler` and `GlobalMappingRegistry` were only instantiated when `enableWorkspaceNav` was true, and all three interception gates (`shouldInterceptContent`, `shouldInterceptHints`, `shouldInterceptStructural`) returned false when the setting was disabled. Fixed by always creating the global key handler on desktop and moving the `enableWorkspaceNav` guard from the interception layer to the mapping registration layer — only scroll, tab, and pane navigation keys are conditional on the setting; `:`, hint mode, and user global keymaps are always registered. ([#164](https://github.com/saberzero1/motions/issues/164))
    - Plugin: `src/workspace/global-key-handler.ts` (removed `enableWorkspaceNav` guard from `shouldIntercept*` methods)
    - Plugin: `src/workspace/global-defaults.ts` (added `opts.enableWorkspaceNav` parameter to conditionally register workspace-nav-specific keys)
    - Plugin: `src/main.ts` (always create `GlobalKeyHandler`/`GlobalMappingRegistry` on desktop)
- **Hint mode `<leader><leader>h` mapping reappears after settings change** — `vim.keymap.del("n", "<leader><leader>h")` in init.lua was silently undone by any subsequent settings change because `reloadFeatures()` re-registered the hardcoded mapping without re-applying Lua map operations. Additionally, the mapping was registered without an explicit `context: 'normal'`, making mode-specific `vim.keymap.del` unable to target it (codemirror-vim's `unmap` requires exact context match). Fixed by (1) calling `applyLuaMaps()` at the end of `reloadFeatures()` so Lua unmaps are re-applied after built-in mappings, and (2) registering the hint mode mapping with `{ context: 'normal' }`. ([#162](https://github.com/saberzero1/motions/issues/162))
    - Plugin: `src/main.ts` (`applyLuaMaps` call in `reloadFeatures`, `context: 'normal'` on hint mode `mapCommand`)
- **Leader-based `mapCommand` calls missing `context: 'normal'`** — picker (`<leader>ff/fg/fb/...`), harpoon (`<leader>ha/hp/hn/hN`, `<leader>1`–`<leader>9`), and workspace navigation (`<leader>rn/rb/ra`, `grn/grr/gra`) leader mappings were registered without an explicit mode context. This made `vim.keymap.del("n", ...)` unable to remove them because codemirror-vim's `unmap(lhs, 'normal')` requires `context === 'normal'` to match. Added `{ context: 'normal' }` to all leader-based action `mapCommand` calls. EasyMotion motions were intentionally left without context because they must work in operator-pending and visual modes (`d<leader><leader>w`, `v<leader><leader>j`).
    - Plugin: `src/main.ts` (picker and harpoon leader mappings)
    - Plugin: `src/workspace/navigation.ts` (`<leader>rn/rb/ra` and `grn/grr/gra` mappings)
- **`vim.keymap.del` unable to remove context-less mappings per-mode** — `Vim.unmap(lhs, 'normal')` silently failed on mappings created by `mapCommand()` or `:map` without a mode prefix, because the entry had `context === undefined` and the strict equality check (`undefined === 'normal'`) never matched. The only removal paths were `removeMapCommand(keys)` or `unmap(lhs, undefined)`, both of which remove from all modes. Fixed in the fork: `unmap` now falls back to splitting a context-less entry into per-mode entries for the remaining modes when a mode-specific unmap is requested, matching Neovim's `:nunmap` on a `:map`-created mapping. Also fixed `mapclear`'s context-splitting mode set from `['normal', 'insert', 'visual']` to `['normal', 'visual', 'operatorPending']` to match Neovim's `:map` semantics (`:map` covers normal+visual+operatorPending, not insert).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`unmap` context-less entry splitting, `mapclear` mode set fix)
- **Command palette lags ~1 second in visual-line mode** — opening the command palette from visual-line mode caused a visible delay. Root cause: the `wrapCheckCallback` wrapper called `withExpandedSelection` for every command's `checkCallback(true)` availability check, dispatching two CM6 transactions (expand + restore) per command. With 200+ commands, this produced 400+ synchronous CM6 dispatches while the palette rendered. Fixed by skipping `withExpandedSelection` for the checking path (`checkCallback(true)`) — the `VisualLineSomethingSelectedPatch` already ensures `somethingSelected()`, `getCursor()`, and `listSelections()` return the correct visual-line range, so availability checks work without native CM6 selection expansion. The executing path (`checkCallback(false)`) still uses `withExpandedSelection`. (regression of [#157](https://github.com/saberzero1/motions/issues/157), [#163](https://github.com/saberzero1/motions/issues/163))
    - Plugin: `src/vim/visual-line-command-fix.ts` (skip `withExpandedSelection` for `checkCallback(true)`)
- **Stale visual-line selection cache causes RangeError** — `lastVisualLineSel` and `pendingVisualLineSel` cached line numbers from a previous visual-line selection could exceed the document length after the editor content was replaced with a shorter document (e.g., between e2e tests or `:e` commands). The stale cache caused `doc.line(N)` to throw `RangeError: Invalid line number N in M-line document`. Fixed by validating cached selection line numbers against the current document length before use; stale caches are invalidated instead of producing errors.
    - Plugin: `src/vim/visual-line-command-fix.ts` (`isSelInBounds` validation in `somethingSelected`, `getSelection`, `replaceSelection`)

### Changed

- **E2E test Obsidian version pinned to 1.13.7** — `wdio.conf.mts` `browserVersion` changed from `'latest'` to `'1.13.7'`. Obsidian 1.13.8 is a mobile-only release (APK only, no desktop asar), causing the test runner to fail with "No compatible installers available."

### Tests

- 3 regression tests in `test/specs/settings-reload.e2e.ts` for #164 (global key handler/registry existence with workspace nav disabled) and #162 (Lua keymap deletions survive `reloadFeatures`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated workspace navigation section to reflect decoupled architecture; updated yank-ring workspace navigation dependency note; updated three-gate description; updated `keymap.del + Q` deviation and `removeMapCommand` description
- `KNOWN_LIMITATIONS.md`: updated `wrapCheckCallback` description with `checkCallback(true)` optimization (#163)
- `AGENTS.md`: updated fork description with `unmap` per-mode splitting and `mapclear` mode set fix
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: added "Per-mode `unmap` of context-less mappings" section; updated `removeMapCommand` description

## [0.140.0] - 2026-09-03

### Fixed

- **Picker `pick_keymap` ignores Alt and other modifier keys** — `vim.obsidian.pick_keymap()` only recognized the `C-` (Ctrl) modifier prefix. Key specs with `A-` (Alt), `S-` (Shift), `M-` (Meta), or modifier combinations like `C-A-j` were silently ignored. Root cause: `matchesPickerKey()` had a simple `C-` check and fell through to plain key matching for everything else. Replaced with a proper modifier parser (`parsePickerKeySpec`) that strips all modifier prefixes and validates each against the corresponding `KeyboardEvent` flags. ([#159](https://github.com/saberzero1/motions/pull/159))
    - Plugin: `src/picker/types.ts` (rewrote `matchesPickerKey` with full modifier support)
- **Global workspace navigation missing Shift and Meta modifier normalization** — `normalizeKeyEvent()` only produced `<C-x>` and `<A-x>` notation. `<S-Tab>`, `<M-f>`, and modifier combinations like `<C-S-Tab>` or `<C-A-f>` were never generated, so user-defined global mappings with those prefixes could not match keyboard events. Added `<S->` normalization for special keys (Tab, Enter, Space, etc.), `<M->` for Meta-only, and combined prefix support in canonical order (`C-`, `A-`, `M-`, `S-`).
    - Plugin: `src/workspace/global-mapping-registry.ts` (rewrote `normalizeKeyEvent` with full modifier prefix generation)
- **Hint mode missing `altKey` in result** — `waitForHintKey()` captured `ctrlKey`, `metaKey`, and `shiftKey` from the label selection event but discarded `altKey`. Added `altKey` to the `HintResult` interface and all three resolve sites, making Alt-modified hint actions possible for future extensions.
    - Plugin: `src/ui/hint-mode.ts` (added `altKey` to `HintResult` interface and all resolve sites)
- **Subword motions skip non-ASCII Unicode characters** — `w`/`b`/`e`/`ge` with subword motions enabled skipped Arabic, CJK, accented Latin, and other non-ASCII text instead of stopping at word boundaries. Root cause: `isWordChar()` used `/[A-Za-z0-9]/` and `SUBWORD_RE` only matched ASCII letter patterns. Fixed by replacing all character classification with Unicode property escapes (`\p{L}`, `\p{Lu}`, `\p{Ll}`, `\p{N}`, `\p{M}`) and adding a `([\p{L}\p{M}]+)` alternative for caseless scripts (Arabic, Hebrew, CJK, Devanagari). The long-line fallback regex (`WORD_SEGMENT_RE`) was also updated. ([#160](https://github.com/saberzero1/motions/issues/160))
    - Plugin: `src/util/subword.ts` (Unicode-aware `SUBWORD_RE` and `isWordChar()`)
    - Plugin: `src/motions/subword.ts` (Unicode-aware `WORD_SEGMENT_RE` fallback)
- **EasyMotion word targets skip non-ASCII Unicode characters** — EasyMotion `w`/`b`/`e` word motions did not generate jump labels on Arabic, CJK, or other non-ASCII words. Root cause: `WORD_START_RE` used `\b\w` and `WORD_CHARS_RE` used `\w+`, both ASCII-only. Fixed with `[\p{L}\p{M}\p{N}]+` using the `u` flag. ([#160](https://github.com/saberzero1/motions/issues/160))
    - Plugin: `src/easymotion/targets.ts` (Unicode-aware `WORD_START_RE` and `WORD_CHARS_RE`)

### Tests

- 29 unit tests in `test/unit/picker/picker-keymap.test.ts` for `matchesPickerKey` modifier support (Alt, Shift, Meta, combinations, multi-spec matching) (#159)
- 4 e2e tests in `test/specs/picker-modifier-keys.e2e.ts` for Alt-j/Alt-k picker navigation via `pick_keymap` Lua config (#159)
- 21 unit tests in `test/unit/global-mapping-registry.test.ts` for `normalizeKeyEvent` modifier normalization (Ctrl, Alt, Meta, Shift, special keys, combinations)
- 6 unit test cases in `test/unit/subword.test.ts` for Unicode boundary/end detection (Arabic, mixed ASCII+Arabic, CJK, accented Latin)
- 6 regression tests in `test/specs/subword-motions.e2e.ts` for Unicode subword motions (`w`/`b`/`e`/`dw` on Arabic, mixed text, CJK) (#160)
- 5 regression tests in `test/specs/easymotion-comprehensive.e2e.ts` for Unicode EasyMotion word targets (`w`/`e`/`b` on Arabic and CJK) (#160)

### Documentation

- `CHANGELOG.md`
- `docs/features/ex-commands.md`: updated picker key format description to document `A-`, `S-`, `M-` modifier prefixes and combinations
- `docs/configuration/remapping.md`: updated picker key format description and added Alt-j/Alt-k example
- `README.md`: updated subword motions description to mention Unicode support
- `docs/reference/keybindings.md`: updated subword motions table to note Unicode support

## [0.139.0] - 2026-09-03

### Added

- **Plugin auto-fetch system** — `vim.plugins.add()` now supports automatic fetching of Neovim plugins from GitHub. Downloads tarball archives, extracts them to `lua/`, and manages a lock file (`lua/.plugin-lock.json`) for version pinning. Supports branch, tag, and commit pinning. Atomic staging writes to `lua/.staging/` ensure vault integrity. Configurable via `pluginAutoFetch` setting (Advanced page).
    - Plugin: `src/lua/plugin-fetch.ts` (download and extraction logic)
    - Plugin: `src/lua/plugin-store.ts` (atomic writes and lock file management)
    - Plugin: `src/lua/tar.ts` (synchronous tar parser)
    - Plugin: `src/lua/api.ts` (extended `vim.plugins.add` with fetch triggering)
    - Plugin: `src/lua/loader.ts` (wired fetch callback)
    - Plugin: `src/settings.ts` (new `pluginAutoFetch` setting)
- **`require()` init.lua fallback** — `require("name")` now tries `lua/name/init.lua` if `lua/name.lua` is not found. Matches Neovim's module resolution behavior and enables multi-file plugins.
    - Plugin: `src/lua/package.ts` (updated `package.path` and search logic)

### Changed

- **Lua sandbox: `rawget`/`rawset`/`rawequal` re-enabled** — these standard Lua functions are now available in the sandbox, matching Neovim's Lua environment. Previously disabled as a sandboxing measure, but this prevented `vim.is_callable` from detecting callable tables and broke compatibility with Neovim plugins that use `rawget`/`rawset`.
    - Plugin: `src/lua/engine.ts` (removed from disabled globals list)

### Fixed

- **Operator-pending mode context** — `modeToContext('o')` now correctly returns `'operatorPending'` instead of `'normal'`. Fixes keymap collisions where operator-pending text objects shadowed normal mode mappings (e.g., `gc`/`gcc`).
    - Plugin: `src/lua/api.ts` (context mapping fix)
- **Fork: Backtracking dispatch** — the codemirror-vim fork now supports backtracking when a longer partial match fails. Deferring a shorter full match (e.g., flash `s` motion) for a longer partial (e.g., surround `s<char>`) no longer loses the motion if the partial match fails or times out. Replays the suffix via `doKeyToKey`.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (backtracking logic in `handleKeyNonInsertMode`)
- **Fork: Backtracking deferral exclusion rules** — the backtracking deferral in `matchCommand` no longer falsely defers built-in keys (`i`, `a`, `s`, `S`, `d`, `y`, `c`, `<`, `>`) when text-object motions, linewise shortcuts, surround actions, or `<leader>` keymaps share a string prefix. Four exclusion rules prevent false positives: `_isDefault` entries (built-in keymaps), special-key false prefix (`<` vs `<leader>`), motions extending non-motions (`il` vs `i`), and `operatorPending` actions without an active operator (`s<char>` vs `s`). Without this fix, pressing `i` or `a` in normal mode was deferred by ~1 second instead of immediately entering insert mode.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (exclusion rules in `matchCommand`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (documented all 4 exclusion rules)
- **Lua function-callback keymaps survive view plugin recreation** — `applyLuaMaps` reverted to use `this.registration?.defineAction()` instead of `vim.defineAction()` directly. The `VimRegistration` persistence layer re-applies action registrations when the CM6 view plugin is recreated (e.g., during vim mode toggle), preventing Lua `vim.keymap.set` function callbacks from silently stopping.
    - Plugin: `src/main.ts` (reverted `applyLuaMaps` function-callback path)

### Tests

- **CI test plugin pre-fetch** — e2e tests no longer depend on runtime GitHub fetches. A `scripts/fetch-test-plugins.sh` script downloads plugin tarballs before tests run, driven by `test/fixtures/test-plugins.json`. The CI workflow fetches plugins in a dedicated step on all platforms (Linux, macOS, Windows). `loadMiniComment` skips `vim.plugins.add()` when the plugin is pre-fetched; the fetch test is skipped when pre-fetched.
- Updated `test/specs/lua-plugin-mini-comment.e2e.ts` — `loadMiniComment` detects pre-fetched plugins and skips `vim.plugins.add()`; fetch test guarded with `this.skip()` when pre-fetched.
- Added `pluginAutoFetch` to excluded settings in `test/unit/known-set-options.test.ts`.
- Added `vimHandleKeysSync` helper in `test/helpers.ts` — dispatches keys via `Vim.handleKey` in a single synchronous `executeObsidian` call with Escape prefix. Supports `waitForTimeout` flag for leader-key mappings that trigger Neovim-correct `operatorshadowtimeout` deferral.
- Updated `test/specs/lua-vim-v.e2e.ts` to use `vimHandleKeysSync` with `waitForTimeout=true` for `<leader>t`/`<leader>h` mappings that have longer partials (table nav keymaps `\tL`, `\tdd`, etc.).
- Updated `test/specs/lua-doc-examples.e2e.ts` smart-go-to-top test to use `vimHandleKeysSync` with `waitForTimeout=true`.
- Updated `test/specs/lua-require.e2e.ts` rawget/rawset tests — expectations changed from 86/87 to 90 to reflect intentional re-enabling.

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: added `vimHandleKeysSync` to test helpers list, added fork backtracking description, added CI test plugin pre-fetch description
- `CONTRIBUTING.md`: updated `src/lua/` file tree with new fetch-related files, added test plugin pre-fetch documentation
- `KNOWN_LIMITATIONS.md`: marked plugin fetching as implemented; added `init.lua` fallback note; updated `vim.is_callable` note (rawget no longer restricted); updated operator-prefix key dispatch section with backtracking deferral
- `README.md`: added plugin auto-fetch to features list
- `docs/configuration/settings.md`: added `pluginAutoFetch` setting
- `docs/configuration/lua-config.md`: updated `vim.plugins.add` and `require()` sections

## [0.138.0] - 2026-09-02

### Added

- **Tier 1 `vim.api` expansion** — 27 new `nvim_*` functions (43 total), unlocking the mini.nvim plugin ecosystem. New functions organized in 4 waves:
    - **Cursor + line + marks**: `nvim_get_current_win`, `nvim_get_current_line`, `nvim_set_current_line`, `nvim_win_get_cursor`, `nvim_win_set_cursor`, `nvim_buf_get_mark`, `nvim_buf_set_mark`, `nvim_buf_del_mark`
    - **Global keymaps + key injection**: `nvim_set_keymap`, `nvim_del_keymap`, `nvim_get_keymap`, `nvim_replace_termcodes`, `nvim_feedkeys`
    - **Commands + stubs + options**: `nvim_command`, `nvim_del_user_command`, `nvim_win_get_buf`, `nvim_get_current_tabpage`, `nvim_buf_get_option`, `nvim_buf_set_option`, `nvim_get_option`, `nvim_set_option`
    - **Variables + messaging + text**: `nvim_buf_get_var`, `nvim_buf_set_var`, `nvim_echo`, `nvim_buf_set_text`
    - Plugin: `src/lua/api.ts` (27 function registrations, `requireWindowZero` validator, updated metatable)
    - Plugin: `src/lua/loader.ts` (8 new callbacks: `getCmAdapter`, `getMarkPos`, `setMark`, `delMark`, `getLine`, `setLine`, `replaceRange`)

### Fixed

- **Table-nav `Tab`/`Shift+Tab` stops at row boundaries** — pressing `Tab` at the last cell of a row now wraps to the first cell of the next row, and `Shift+Tab` at the first cell wraps to the last cell of the previous row. Matches Obsidian's native table Tab behavior. At the absolute first/last cell of the table, Tab/Shift+Tab stay in place. The `navigate()` method gains a `wrap` parameter; `h`/`l` keys retain their non-wrapping behavior. ([#158](https://github.com/saberzero1/motions/issues/158))
    - Plugin: `src/vim/table-nav-controller.ts` (wrapping logic in `navigate()`, forwarded `wrap` parameter in actions lambda and cell-edit scope)
    - Plugin: `src/vim/table-nav-keymap.ts` (`wrap` parameter in `TableNavActions` interface, Tab handler passes `wrap=true`)

### Tests

- 29 new unit tests in `test/unit/lua/api.test.ts` for all new `nvim_*` functions (92 total)
- 4 regression tests in `test/specs/table-nav-mode.e2e.ts` for Tab/Shift+Tab row wrapping (#158)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated `vim.api` function count to 43 with expanded category list
- `CONTRIBUTING.md`: updated `src/lua/api.ts` description and buffer/autocmd/highlight file descriptions
- `KNOWN_LIMITATIONS.md`: 6 new known limitations for Lua API (character offsets, deprecated options, feedkeys flags, echo, handles, replace_termcodes)
- `README.md`: updated `vim.api.*` description
- `docs/configuration/lua-config.md`: full API reference tables for all new functions
- `docs/features/tables.md`: updated Tab/Shift+Tab description to mention row wrapping
- `docs/reference/keybindings.md`: updated Tab description to mention row wrapping

## [0.137.1] - 2026-09-02

### Fixed

- `vitest.config.ts` — properly bundle treesitter WASM for testing.

## [0.137.0] - 2026-09-01

### Added

- **`vim.treesitter` API** — full treesitter integration backed by `web-tree-sitter` (WASM), running as a parallel parser alongside CM6's Lezer. Markdown and HTML grammars are bundled; the subsystem activates on-demand when Lua code calls `get_parser()`. Provides the complete Neovim `vim.treesitter` API surface:
    - **Core**: `get_parser`, `get_string_parser`, `get_node`, `get_node_text`, `get_range`, `get_node_range`, `is_in_node_range`, `is_ancestor`, `node_contains`, `get_captures_at_pos`, `get_captures_at_cursor`
    - **TSNode**: 31 methods (`type`, `parent`, `child`, `named_child`, `field`, `start`, `end_`, `range`, `sexpr`, `equal`, `iter_children`, `named_children`, `descendant_for_range`, and more)
    - **TSTree**: `root`, `copy`, `included_ranges`
    - **LanguageTree**: 18 methods (`parse`, `trees`, `lang`, `children`, `parent`, `root`, `for_each_tree`, `register_cbs`, `node_for_range`, `tree_for_range`, `language_for_range`, `invalidate`, `destroy`, and more)
    - **Query engine**: `query.parse`, `query.get`, `query.set`, `Query:iter_captures`, `Query:iter_matches`, `Query:disable_capture`, `Query:disable_pattern`
    - **8 built-in predicates**: `#eq?`, `#match?`, `#vim-match?`, `#lua-match?`, `#contains?`, `#any-of?`, `#has-ancestor?`, `#has-parent?` with generic `#not-*`/`#any-*` prefix handling
    - **4 built-in directives**: `#set!`, `#offset!`, `#gsub!`, `#trim!`
    - **Custom predicates/directives**: `query.add_predicate`, `query.add_directive`, `query.list_predicates`, `query.list_directives`
    - **Language management**: `language.register`, `language.get_lang`, `language.get_filetypes`, `language.add` (async via coroutine bridge), `language.inspect` (ABI version, fields, symbols, supertypes)
    - **Stubs** (present, won't error): `start`, `stop`, `foldexpr`, `select`, `inspect_tree`
    - Plugin: `src/treesitter/runtime.ts`, `src/treesitter/bridge.ts`, `src/treesitter/query.ts`, `src/treesitter/predicates.ts`, `src/treesitter/directives.ts`, `src/treesitter/language-tree.ts`, `src/treesitter/injection.ts`, `src/treesitter/types.ts`, `src/treesitter/wasm.d.ts`
    - Plugin: `src/lua/treesitter/api.ts`, `src/lua/treesitter/node.ts`, `src/lua/treesitter/tree.ts`, `src/lua/treesitter/language.ts`, `src/lua/treesitter/query-api.ts`, `src/lua/treesitter/language-tree-api.ts`, `src/lua/treesitter/range.ts`
    - Grammars: `src/treesitter/grammars/tree-sitter-markdown.wasm`, `src/treesitter/grammars/tree-sitter-html.wasm`
- **Treesitter-enhanced Markdown features** — core plugin features now use treesitter for structural parsing when available, with regex fallback:
    - **Fold provider**: treesitter `section` node hierarchy for heading fold boundaries (replaces heading-level regex)
    - **Fold placeholder**: treesitter-based heading text and code language extraction
    - **Heading navigation** (`]h`/`[h`): `getAllNodesOfType(view, 'atx_heading')` replaces line-by-line regex scan; automatically skips headings inside fenced code blocks
    - **Code block text objects** (`iC`/`aC`): `findContainingNodeOfType(view, row, col, 'fenced_code_block')` replaces full-document fence scan
    - **Blockquote text objects** (`iB`/`aB`): `findContainingNodeOfType(view, row, col, 'block_quote')` with correct nesting depth (fixes nested `diB` scoping)
    - **Delimiter text objects** (`i*`/`a*`, `i_`/`a_`, `` i` ``/`` a` ``, `i$`/`a$`, `i~`/`a~`): inline grammar nodes (`emphasis`, `strong_emphasis`, `code_span`, `latex_block`, `strikethrough`) for correct nested delimiter boundaries
    - **Snippet context detection**: treesitter-based code/prose/frontmatter detection (O(1) vs O(n) document scan)
    - Plugin: `src/text-objects/code-block.ts`, `src/text-objects/blockquote.ts`, `src/text-objects/delimiter.ts`, `src/motions/headings.ts`, `src/snippets/context.ts`, `src/fold/provider.ts`, `src/fold/placeholder.ts`
- **Markdown inline grammar** — bundled `tree-sitter-markdown-inline.wasm` (416KB) for inline content parsing. Provides structural nodes for emphasis, strong emphasis, code spans, inline links, strikethrough, LaTeX, HTML tags, and backslash escapes.
    - Plugin: `src/treesitter/grammars/tree-sitter-markdown-inline.wasm`
    - Plugin: `src/treesitter/runtime.ts` (`parseInlineContent`, `getInlineNodeAtPosition`)
- **JS-side treesitter API** — TypeScript helper functions for querying treesitter trees from plugin code (not Lua):
    - Position lookup: `getNodeAtPosition`, `getNamedNodeAtPosition`, `getInlineNodeAtPosition`
    - Ancestor queries: `hasAncestorOfType`, `findAncestorOfType`, `isInsideNodeType`, `findContainingNodeOfType`
    - Inline nodes: `findContainingInlineNodeOfType`, `isInsideInlineNodeType`
    - Navigation: `findNextNodeOfType`, `getAllNodesOfType`
    - Full queries: `queryCaptures`
    - Plugin: `src/treesitter/js-api.ts`, `src/treesitter/tree-state.ts`
- **Fork: `setTokenClassifier` hook** — codemirror-vim fork now exposes `Vim.setTokenClassifier(fn)` for host-provided token classification. The `%` bracket matcher uses the classifier to skip brackets inside inline code spans, improving Markdown bracket matching accuracy.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`setTokenClassifier`, `moveToMatchedSymbol`, surround match path)
    - Plugin: `src/main.ts` (`installTokenClassifier`)

### Changed

- **Fold golden tests re-recorded** — fold-motions golden data re-recorded with `vim.treesitter.foldexpr()` active and `luaSetup` forcing synchronous treesitter parse + fold recomputation before each test case. Corrected `2zk` golden value that was affected by `nvim_feedkeys` async timing (verified against `normal!` behavior). All 12 fold motion golden cases now have correct Neovim reference values.

### Fixed

- **Note Composer extract fails in visual-line mode** — Note Composer's "Extract current selection" (and Note Refactor) failed in visual-line mode when invoked via the command palette or right-click context menu. Two root causes: (1) Note Composer uses `getCursor('from')`/`getCursor('to')` and `listSelections()` to determine the replacement range, but these returned a collapsed cursor-only range in visual-line mode — the text was read correctly via `getSelection()` but the replacement was inserted at a zero-width cursor position without removing the original lines. (2) The `withExpandedSelection` wrapper's `finally` block restored cursor-only CM6 selection before the async modal completion callback ran, and `handleExternalSelection` in codemirror-vim exited visual mode when it saw the collapsed selection. Fixed by patching `getCursor('from'/'to')` and `listSelections()` to return the visual-line expanded range; adding a `pendingVisualLineSel` WeakMap snapshot set before `expandSelection()` that survives async modal flows (30 s TTL, consumed on first use by `replaceSelection`); and extending the fallback chain in `somethingSelected()`, `getSelection()`, and `replaceSelection()` to include `lastVisualLineSel` and `pendingVisualLineSel`. ([#157](https://github.com/saberzero1/motions/issues/157), regression of [#137](https://github.com/saberzero1/motions/issues/137)/[#138](https://github.com/saberzero1/motions/issues/138))
    - Plugin: `src/vim/visual-line-command-fix.ts` (`pendingVisualLineSel` WeakMap snapshot; `getCursor`/`listSelections` patches; `lastVisualLineSel` fallback chain in `somethingSelected`/`getSelection`/`replaceSelection`)
- **`zj`/`zk` skip nested heading folds** — `zj` now visits all foldable lines including nested headings (e.g., `## Heading` inside a `# Heading` section), matching Neovim behavior. Previously `findNextFoldable`/`findPrevFoldable` had a `parentRange` filter that excluded child folds contained within a parent fold's range. Closes 6 fold motion Neovim deviations (`zj`, `2zj`, `zk`, `2zk`, `[z`, `]z`).
    - Plugin: `src/fold/motions.ts` (removed `parentRange` filter from `foldNext`/`foldPrev`, fixed `foldPrev` count search to use fold start instead of fold end)

### Tests

- 2 regression tests in `test/specs/visual-line-command.e2e.ts` (#157): real command palette toggle numbered list in V-LINE (opens actual command palette, types command, selects it); real command palette Note Composer extract in V-LINE (end-to-end: opens command palette, selects "Extract current selection", enters filename in Note Composer's modal, verifies selected lines removed and link inserted, cleans up extracted file)
- 97 unit tests for treesitter subsystem: `test/unit/treesitter/runtime.test.ts` (12), `test/unit/treesitter/api.test.ts` (36), `test/unit/treesitter/query.test.ts` (19), `test/unit/treesitter/language-tree.test.ts` (16), `test/unit/treesitter/js-api.test.ts` (22 — including 8 inline node detection tests)
- 12 e2e tests for treesitter Lua API: `test/specs/treesitter.e2e.ts`
- Re-recorded golden data: `test/neovim/golden-data/fold-motions.json` (with `luaSetup` forcing treesitter parse before fold motions)
- 6 fold motion Neovim deviations removed from `test/neovim/deviations.ts`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated visual-line selection section with `getCursor`/`listSelections` patches, `pendingVisualLineSel` WeakMap snapshot, and fallback chain description (#157); updated test coverage count (4 → 6 tests); updated trade-off section to list all 5 patched Editor methods
- `AGENTS.md`: treesitter architecture, new file descriptions, Lua API surface update, fork `setTokenClassifier` hook
- `CONTRIBUTING.md`: treesitter file tree in `src/` structure, `tree-state.ts` added
- `KNOWN_LIMITATIONS.md`: treesitter integration section with 7 known limitations
- `README.md`: treesitter feature in Lua configuration description
- `docs/configuration/lua-config.md`: updated API availability note

## [0.136.0] - 2026-09-01

### Added

- **36 new `vim.fn` functions** — expanded the Lua API from 29 to 65 supported `vim.fn.*` functions:
    - **Register**: `setreg(regname, value [, options])`, `getreg(regname)`, `getregtype(regname)` — full register manipulation matching Neovim's signatures
    - **Buffer**: `setline(lnum, text)`, `append(lnum, text|list)`, `indent(lnum)`, `nextnonblank(lnum)`, `prevnonblank(lnum)` — buffer modification and line scanning
    - **Position**: `getpos(expr)`, `setpos(expr, list)`, `cursor(lnum, col)`, `getcurpos()` — cursor and mark manipulation; `getpos("'[")` / `getpos("']")` enables `g@` operatorfunc usage
    - **Type/introspection**: `type(expr)`, `len(expr)`, `empty(expr)` — fundamental type guards for Lua configs
    - **Pattern matching**: `matchstr(s, pat)`, `match(s, pat [, start])`, `matchlist(s, pat)` — string pattern matching (ECMAScript regex)
    - **String/list**: `escape(s, chars)`, `repeat(s|list, count)`, `reverse(s|list)`, `range(n [, end [, stride]])`, `sort(list)`, `uniq(list)`, `max(list)`, `min(list)`, `abs(n)`, `index(list, item)`, `count(list, val)`
    - **List/dict sugar**: `add(list, item)`, `remove(list, idx)`, `extend(list1, list2)`, `copy(expr)`, `deepcopy(expr)`, `keys(dict)`, `values(dict)`, `items(dict)`, `flatten(list)` — syntactic sugar over Lua builtins / `vim.tbl_*` equivalents
    - Plugin: `src/lua/fn.ts` (all implementations + `VimFnCallbacks` extended with `setCursor`, `getMarkPos`, `setMark`, `setLine`, `insertLines`)
    - Plugin: `src/main.ts` (wired new callbacks in `executeLuaForTest`)
    - Plugin: `src/lua/loader.ts` (wired new callbacks in main loader)
- **Neovim-compatible `foldopen` option** — fold-aware navigation now matches Neovim's `foldopen` semantics. Each vim motion is tagged with a category (`hor`, `block`, `jump`, `mark`, `search`, `percent`, `undo`), and only motions whose category is in the configured `foldopen` set trigger auto-unfold when the cursor enters a folded range. Plain vertical motions (`j`/`k`) have no category and never unfold, matching Neovim's intentional exclusion of vertical movements. Configurable via `set foldopen=block,hor,mark,percent,search,undo` (Neovim default) or `set fdo=all`. ([#155](https://github.com/saberzero1/motions/pull/155))
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (`foldopenAnnotation` CM6 transaction annotation, `_pendingFoldopen` on adapter)
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (40+ motions tagged with `foldopen` category in `defaultKeymap`, annotation set in `evalInput`, `undo`/`redo`, `jumpListWalk`)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (`FoldopenCategory` type, `foldopen` on `MotionArgsPartial`)
    - Fork: `~/Repos/codemirror-vim/src/index.ts` (exported `foldopenAnnotation`, `FoldopenCategory`)
    - Plugin: `src/vim/fold-sync.ts` (annotation-gated `foldAwareNavExtender`, `setFoldopen()`/`getFoldopen()`/`shouldUnfold()`)
    - Plugin: `src/vim/bundled-vim.ts` (injects fork annotation at extension creation)
    - Plugin: `src/motions/register.ts` (structural motions tagged `block`, subword motions tagged `hor`)
    - Plugin: `src/vim/options.ts` (`set foldopen=…` / `set fdo=…` vim option)
    - Plugin: `src/main.ts` (`foldopen` handler in `applySettingOverride`)
    - Plugin: `src/settings.ts` (updated fold-aware navigation descriptions in both settings tabs)
- **Range-aware fold ex commands** — `:{range}fold`, `:{range}foldopen[!]`, `:{range}foldclose[!]`, `:{range}folddoopen {cmd}`, and `:{range}folddoclosed {cmd}` now support Neovim-style line ranges. Previously `:foldopen`/`:foldclose` only operated at the cursor. `:{range}fold` creates a manual fold; `!` suffix opens/closes recursively; `:folddoopen`/`:folddoclosed` execute an ex command on lines that are not/are in a closed fold.
    - Plugin: `src/fold/commands.ts` (range-aware handlers: `foldRangeEx`, `foldOpenRangeEx`, `foldCloseRangeEx`, `foldDoOpenEx`, `foldDoClosedEx`)
    - Plugin: `src/workspace/navigation.ts` (removed `exCommandFromAction` registrations for `:foldopen`/`:foldclose`/`:foldtoggle` — replaced by range-aware versions in `fold/commands.ts`)
    - Plugin: `src/main.ts` (`executeLuaForTest` sandbox `handleExCommand` wired to `vim.handleEx` — enables golden tests to create folds via `vim.cmd`)
- **Neovim options registry** — every Neovim option (378 total from `src/nvim/options.lua`) is now recognized by name in both `:set` (vimrc) and `vim.opt` (Lua). Options are classified into tiers: implemented options work normally, hardcoded options log an info note (e.g., `set magic` — "always on"), deferred options log that support is planned, platform-handled options are accepted silently (e.g., `set mouse=a`, `set encoding=utf-8`, `set noswapfile`), and truly unknown options still produce a warning — enabling typo detection (`set mose=a` warns, `set mouse=a` is silent).
    - Plugin: `src/vim/neovim-options.ts` (new file — comprehensive registry with tier classification)
    - Plugin: `src/vimrc/loader.ts` (integrated registry, replaced `KNOWN_CM_VIM_OPTIONS` set, tiered logging)
    - Plugin: `src/lua/api.ts` (integrated registry into `vim.opt`/`vim.o` getter and setter)
- **12 configurable Neovim options** — standard Neovim options previously hardcoded in the codemirror-vim fork are now user-configurable via `set`/`vim.opt` with Neovim-compatible defaults and abbreviations:
    - **Search**: `ignorecase`/`ic` (default on), `smartcase`/`scs` (default on), `hlsearch`/`hls` (default on), `incsearch`/`is` (default on), `wrapscan`/`ws` (default on)
    - **Substitute**: `gdefault`/`gd` (default off — `:s` g flag inverts when on)
    - **Motion**: `startofline`/`sol` (default on), `whichwrap`/`ww` (default `b,s`), `virtualedit`/`ve` (default empty — supports `onemore`, `all`, `block`)
    - **Editing**: `joinspaces`/`js` (default off — `J` inserts double space after `.!?`), `shiftround`/`sr` (default off — `>>`/`<<` round to shiftwidth), `nrformats`/`nf` (default `bin,hex` — `<C-a>`/`<C-x>` format support, octal now available)
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (12 `defineOption()` calls, search call sites updated, hlsearch gating, incsearch gating, wrapscan boundary messages, gdefault inversion, startofline in H/M/L/G/gg, whichwrap in moveByCharacters, virtualedit in clipCursorToContent, joinspaces in joinLines, shiftround in indent operator, nrformats with parseNumberMatch helper)
    - Plugin: `src/vimrc/loader.ts` (12 options registered in `KNOWN_SET_OPTIONS` with `_fork:` prefix settingsKey)

### Added

- **Oil preview window** (`<C-p>`) — toggle a side-by-side preview split showing the file under the cursor. Auto-updates on cursor movement via `EditorView.updateListener`. Second `<C-p>` closes the preview. Closes automatically when oil closes. New ex command `:oilpreview` (`:oilpre`).
    - Plugin: `src/oil/manager.ts` (`togglePreview()`, `closePreview()`, `installPreviewCursorListener()`)
    - Plugin: `src/oil/keybindings.ts` (`<C-p>` mapping + `oilPreview` action)
    - Plugin: `src/oil/oil-view.ts` (`<C-p>` scope key registration)
- **Oil visual mode multi-select** — `V` + select lines + `<CR>` opens all selected file entries. First file replaces the oil leaf, subsequent files open in new tabs. Matches oil.nvim's visual `select` behavior.
    - Plugin: `src/oil/manager.ts` (`getVisualRangeEntries()`, `openMultipleEntries()`)
- **Oil hidden toggle guard** — `g.` toggle is now blocked when the oil buffer has unsaved changes, showing a notice instead. Matches oil.nvim's `toggle_hidden()` behavior which warns and refuses when modified buffers exist.
    - Plugin: `src/oil/manager.ts` (`hasUnsavedChanges()` guard in `toggleHidden()`, return type changed to `boolean`)
    - Plugin: `src/oil/keybindings.ts` (checks return value before refreshing)

### Fixed

- **Oil: unable to create files with a new directory** — creating a file like `newfolder/notes.md` where `newfolder/` doesn't exist now creates both the directory and the file, matching oil.nvim's behavior. Root cause: `app.vault.create()` does not auto-create intermediate directories (unlike `app.vault.createFolder()`). ([#154](https://github.com/saberzero1/motions/issues/154))
    - Plugin: `src/oil/actions.ts` (`ensureParentDirs()` — walks path segments and creates missing directories before file creation)

### Tests

- **Oil nested path creation e2e tests** — 3 new e2e tests in `test/specs/oil-poc.e2e.ts` verifying nested file creation (`newfolder/notes.md`), deeply nested paths (`a/b/deep.md`), and nested directory creation (`parent/child/`). All 3 fail before the fix and pass after. (#154)
- **Oil nested path parser unit tests** — 4 new unit tests in `test/unit/oil-parser.test.ts` for nested path parsing.
- **Oil preview toggle e2e test** — 1 new e2e test verifying `<C-p>` opens a preview split and second `<C-p>` closes it.
- **Oil hidden toggle guard e2e test** — 1 new e2e test verifying `g.` is blocked when buffer has unsaved changes.
- **Oil visual mode multi-select e2e tests** — 2 new e2e tests: visual mode detection in oil editor, and multi-file open via visual select + `<CR>`.
- **Ex command range golden tests** — 8 new golden test cases recorded against Neovim 0.12.5 verifying fork-native `:{range}` support for commands handled entirely by the codemirror-vim fork: `:1,3y` (yank range), `:2,4y a` (yank range to named register), `:1,3j` (join range), `:2,4j!` (join range without spaces), `:put` (put after current line via `:1y` + `:put`), `:3put` (put after addressed line via `:1y` + `:3put`), `:2,4g/pattern/d` (global with range prefix), `:1,3v/pattern/d` (vglobal with range prefix).
    - Definitions: `test/neovim/test-definitions.ts` (8 new cases in `ex-commands-expanded` and `ex-global` suites)
    - Golden: `test/neovim/golden-data/ex-commands-expanded.json` (re-recorded, 27 cases)
    - Golden: `test/neovim/golden-data/ex-global.json` (re-recorded, 5 cases)
- **`:d` count/address and `:j` range deviations resolved** — `:d3` (delete with count argument), `:$d` (delete with `$` address), `:1,3j` (join with range), and `:2,4j!` (join bang with range) were marked as deviations. All now work correctly: `:d{count}` parses the count from `args[0]`; `:$d` resolves via the fork's `parseLineSpec_`; `:j` range fix changes `repeat: lineEnd - line` to `repeat: lineEnd - line + 1`; `:j!` now passes `keepSpaces: true` via `params.argString` bang detection. All 4 deviations removed.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`exCommands.join`: off-by-one fix + `keepSpaces` bang support)
    - Deviations: `test/neovim/deviations.ts` (2 `upstream-unsupported` entries removed: `:d3`, `:$d`)
- **Foldopen unit tests** — 36 tests covering `setFoldopen()` parsing, `shouldUnfold()` for every individual category, `all`/empty sets, custom combinations, and backward-compatible `setFoldAwareNavigation()`.
    - Test: `test/unit/foldopen.test.ts`
- **Foldopen golden tests** — 8 golden cases recorded against Neovim 0.12.5 covering `j`/`k`/`3j`/`G`/`gg`/`5G` with manual folds. 7 match golden data exactly, 1 has a minor column-preservation difference (CM6 preserves visual column on fold-skip; Neovim resets to 0).
    - Test: `test/specs/vim-builtin/foldopen-golden.e2e.ts`
    - Golden: `test/neovim/golden-data/foldopen.json`
    - Definitions: `test/neovim/test-definitions.ts` (new `foldopen` suite)
    - Deviations: `test/neovim/deviations.ts` (1 infra-limitation entry for column difference)
- **`vim.fn` e2e tests** — 35 tests in `test/specs/lua-vim-fn.e2e.ts` covering all new `vim.fn` functions across 6 categories: registers (setreg, getreg, getregtype), buffer modification (setline, append, indent), position/cursor (nextnonblank, prevnonblank, cursor, setpos, getpos, getcurpos), type/introspection (type ×5, len ×2, empty), pattern matching (matchstr, match, matchlist, escape), string/list utilities (repeat, reverse, range, sort, uniq, max, min, abs, index, count).
    - Test: `test/specs/lua-vim-fn.e2e.ts`
- **Fold-aware navigation e2e tests** — expanded from 2 to 6 tests. New tests verify `j`/`k` do not auto-open folds, `j` from fold line skips past the fold, `k` navigates back to fold line, and upward `k` traversal preserves all folds.
    - Test: `test/specs/fold-navigation.e2e.ts`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated `vim.fn` function count (27 → 65), added not-yet-implemented table (lower-value/niche functions), added explicitly excluded functions (`map`/`filter`/`printf` incompatible signatures); search options now configurable; unknown options warning behavior updated for Neovim options registry; added "Oil.nvim parity gaps" section documenting 8 unimplemented oil.nvim features; added `:oilpreview` to oil keybindings list; updated oil status line
- `README.md`: oil explorer description updated with `<C-p>` preview, visual mode multi-select, nested path creation
- `docs/reference/keybindings.md`: added `<C-p>` (`:oilpreview`) and `g?` (`:oilhelp`) to oil keybindings table
- `docs/features/oil-explorer.md`: added preview, visual mode multi-select, nested path creation, and hidden toggle guard sections; added `:oilpreview` to ex commands table
- `docs/features/ex-commands.md`: added `:oilpreview` and `:oilhelp` to oil ex commands table
- `docs/configuration/lua-config.md`: added 36 new `vim.fn` functions to quick-reference and detailed tables; added 12 new Neovim options to `vim.opt` table
- `AGENTS.md`: `vim.fn` count updated (27 → 65), fork API surface updated with `foldopenAnnotation` and 12 configurable Neovim options
- `CONTRIBUTING.md`: `fn.ts` description updated (26 → 65 functions); added `neovim-options.ts` to `src/vim/` file tree
- `docs/development/architecture.md`: `fn.ts` function count updated
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: `:join` range/bang/cursor section expanded; added "Configurable Neovim options" section documenting 12 new `defineOption()` calls
- `README.md`: folding feature description updated with `foldopen` semantics; quality of life section updated with 12 configurable Neovim options and Neovim option compatibility
- `docs/configuration/settings.md`: fold-aware navigation description updated, `foldopen` row added to Workspace navigation settings
- `docs/configuration/vimrc.md`: `foldopen`/`fdo` added to string options table, `foldawarenavigation` description updated; added 12 new Neovim options to boolean and string tables; updated unknown options warning description for Neovim options registry
- `docs/configuration/lua-config.md`: `foldopen` added to `vim.opt` options table
- `docs/features/workspace-navigation.md`: fold-aware navigation section rewritten for `foldopen` semantics
- `docs/features/ex-commands.md`: added `:{range}fold`, `:{range}foldopen[!]`, `:{range}foldclose[!]`, `:folddoopen`, `:folddoclosed`; updated `:foldopen`/`:foldclose` descriptions to note range support
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: `foldopenAnnotation` API section added

## [0.135.0] - 2026-08-31

### Added

- **Vim toggle commands** — three new Obsidian commands to toggle the plugin's vim mode on/off at runtime without reload: `toggle-vim-mode`, `enable-vim-mode`, and `disable-vim-mode`. Uses a mutable extension array for zero-latency switching. ([#153](https://github.com/saberzero1/motions/discussions/153))
    - Plugin: `src/main.ts` (mutable extension array, toggle methods, Obsidian commands, `vimEnabled` guards)
    - Plugin: `src/settings.ts` (new `vimEnabled` setting in General page)
    - Fork: `~/Repos/codemirror-vim/src/index.ts` (exported `resetForkedVimState()`)
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (exported `resetCursorState()`)
- **Lua ex command cleanup** — track and remove Lua-defined ex commands during toggle or reload.
    - Plugin: `src/lua/loader.ts` (ex command name tracking)

### Changed

- **Vim subsystem lifecycle** — extracted `setupVimSubsystems()` and `teardownVimSubsystems()` for clean runtime toggling.
    - Plugin: `src/main.ts` (lifecycle extraction)
- **Bundled vim state reset** — `bundledActive` is now resettable to support runtime re-initialization.
    - Plugin: `src/vim/bundled-vim.ts` (resettable state)

### Fixed

- **Native cursor visibility after vim toggle** — `BlockCursorPlugin.destroy()` now correctly restores native `caret-color` and cursor layer display, preventing an invisible cursor when vim is disabled.
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (restore logic in `destroy()`)
- **`this.register()` accumulation** — fixed a bug where `reloadFeatures()` would accumulate listeners on every call.
    - Plugin: `src/main.ts` (cleanup logic)

### Tests

- **Vim toggle e2e suite** — 27 new tests covering full toggle lifecycle, idempotent commands, edge cases (insert/visual mode, debounce), persistence, and bridge availability.
    - Test: `test/specs/vim-toggle.e2e.ts` (17 tests)
    - Test: `test/specs/vim-toggle-resilience.e2e.ts` (10 tests)
- **Mutable array spike** — validated the `updateOptions()` mechanism for runtime extension swapping.
    - Test: `test/specs/spikes/spike-mutable-array-destroy.e2e.ts` (3 tests)
- **Regression detection** — added a `beforeSuite` hook to `wdio.conf.mts` that cycles vim mode before every spec.
    - Test: `wdio.conf.mts` (toggle-cycle hook)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated fork API surface with `resetForkedVimState`, `resetCursorState`, `BlockCursorPlugin.destroy()` cursor restoration; documented vim toggle capability in dual-vim architecture; added `beforeSuite` toggle-cycle hook and new test files to test infrastructure section; added `vimEnabled` to settings documentation
- `CONTRIBUTING.md`: documented `setupVimSubsystems()`/`teardownVimSubsystems()` extraction pattern and mutable extension array mechanism
- `README.md`: added vim toggle commands to Quality of life features
- `docs/configuration/settings.md`: added `vimEnabled` setting to General page
- `docs/reference/keybindings.md`: added Obsidian commands section with `toggle-vim-mode`, `enable-vim-mode`, `disable-vim-mode`
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: documented `resetForkedVimState` API, `resetCursorState` API, and `BlockCursorPlugin.destroy()` cursor restoration fix

## [0.134.0] - 2026-08-30

### Changed

- **Oil ex commands show guard notice outside Oil buffer** — Oil-specific ex commands (`:oilopen`, `:oilparent`, `:oilclose`, etc.) are now registered eagerly at plugin startup instead of lazily on first Oil focus. When invoked outside an Oil buffer, they show a descriptive notice (`Oil: :<command> only works inside an Oil buffer. Use :Oil to open the file explorer.`) instead of silently no-oping or producing the generic "not an editor command" error. ([#152](https://github.com/saberzero1/motions/issues/152))
    - Plugin: `src/oil/keybindings.ts` (eager registration with guard wrapper, new `registerExCommands()` public method)
    - Plugin: `src/main.ts` (call `registerExCommands()` at startup and settings reload)

### Tests

- 1 new e2e spec file `test/specs/oil-ex-guard.e2e.ts` — verifies all 11 unique Oil ex commands show a guard notice when invoked outside an Oil buffer, and that commands are recognized (no "not an editor command" error). (#152)

### Documentation

- `CHANGELOG.md`
- `docs/features/oil-explorer.md`: added note about guard notices for Oil ex commands outside Oil
- `docs/features/ex-commands.md`: added note about Oil ex command scope
- `docs/reference/keybindings.md`: updated Oil section note about ex command behavior outside Oil

## [0.133.0] - 2026-08-29

### Fixed

- **Snippet completion menu not appearing on line 1** — the autocompletion popup did not show when typing snippet triggers on the first line of a newly created note in Live Preview. Root cause: CM6's tooltip layer never completed its measure/write pass when the editor was freshly mounted (e.g., opening a new file) — the tooltip DOM element was created but stayed at the pre-measurement sentinel position (`top: -10000px`). The bundled autocomplete fork's tooltip, provided via the shared `showTooltip` facet, was not repositioned because the tooltip layer's initial geometry measurement was skipped during the editor mount/layout settling phase. Additionally, a standalone `tooltips({ parent: document.body })` extension conflicted with Obsidian's own tooltip configuration. Fixed by: (1) removing the redundant `hasFocus` guard in the completion source, (2) removing the conflicting `tooltips({ parent: document.body })` extension, and (3) adding a MutationObserver-based ViewPlugin that detects stuck tooltips at `-10000px` and force-positions them using `coordsAtPos`. ([#151](https://github.com/saberzero1/motions/issues/151))
    - Plugin: `src/snippets/completion-source.ts` (removed `hasFocus` guard)
    - Plugin: `src/main.ts` (removed `tooltips({ parent: document.body })`, added tooltip positioning nudge ViewPlugin)

### Tests

- 1 new e2e spec file `test/specs/snippets/snippet-completion-menu.e2e.ts` — creates a new file via `app.vault.create()`, opens it in Live Preview, types a snippet prefix on line 1, and verifies the completion menu is visually positioned on screen (not stuck at `-10000px`). (#151)

### Documentation

- `CHANGELOG.md`

## [0.132.0] - 2026-08-29

### Added

- **Global config directory search** — new `globalConfigSearch` setting (default off, desktop only) that auto-searches the Obsidian user data folder (`~/.config/obsidian/` on Linux, `~/Library/Application Support/obsidian/` on macOS, `%APPDATA%\obsidian\` on Windows) for config files after exhausting vault-root candidates. Vault-root files always take priority. Uses `getObsidianUserDataDir()` (Electron `userData` path) for platform-correct resolution. ([#150](https://github.com/saberzero1/motions/issues/150))
    - Plugin: `src/settings.ts` (new `globalConfigSearch` setting, declarative + imperative UI, `RELOAD_KEYS`)
    - Plugin: `src/lua/loader.ts` (`resolveLuaConfigPath` global search step, `LoadInitLuaOptions` update)
    - Plugin: `src/vimrc/loader.ts` (`resolveVimrcPath` global search step, `loadVimrc` signature update)
    - Plugin: `src/main.ts` (passes `globalConfigSearch` to both loaders and `softReloadVimrc`)
- **`g@{motion}` operatorfunc support** — new operator that calls a stored callback with the motion type (`'line'`, `'char'`, or `'block'`). Sets `'[` and `']` marks to the range covered by the motion. Public API includes `setOperatorfunc(fn)` and `getOperatorfunc()`.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `operatorfunc` operator, `setOperatorfunc`/`getOperatorfunc` API)
- **`:move` and `:copy` ex commands** — proper implementation of line-move and line-copy commands. `:move` (`:m`) moves a range of lines to a destination address; `:copy` (`:co`, `:t`) copies them. Supports absolute, relative, and boundary addresses (`0`, `$`).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `:move` and `:copy` ex command implementations)
    - Plugin: `src/workspace/commands.ts` (cursor positioning fix for `:move`)
- **Insert mode undo control** — added `<C-G>u` to manually insert an undo break and `<C-G>U` to suppress the next automatic undo break on cursor movement.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `<C-G>u` and `<C-G>U` actions)
- **Insert mode line navigation** — added `<C-G>j`, `<C-G>k`, `<C-G><C-J>`, and `<C-G><C-K>` to navigate lines while preserving the insert-start column.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new insert-mode navigation actions)
- **Insert mode indent deletion** — added `0<C-D>` and `^<C-D>` to delete all indentation on the current line.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new insert-mode indent actions)
- **Lua `vim.o.operatorfunc` bridge** — wired `operatorfunc` through the Lua API. Users can assign a Lua function to `vim.o.operatorfunc` which will be called when `g@` is used.
    - Plugin: `src/lua/api.ts` (Lua bridge for `operatorfunc`)
    - Plugin: `src/types/vim-api.d.ts` (updated `VimApi` type definition)

### Changed

- **`@:` repeat last ex command** — now pushes the command to history before execution and supports count prefixes (e.g., `2@:` replays twice).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (history push in `handleEx`, count support)
- **`<C-y>` and `<C-e>` cursor behavior** — cursor now advances after copying a character from above or below, matching Neovim.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (cursor advancement fix)
- **`gR` virtual replace at EOL** — fixed boundary check to allow replacing the last character of a line.
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (boundary check fix)
- **`<C-a>` re-insert previous insert** — now correctly saves changes to `previousInsertModeChanges` before resetting, ensuring the previous insert is always available.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (recording fix in `recordLastEdit`)
- **Command index overhaul** — expanded coverage tracking from 337 to 427 commands. 90 new entries added, 15 commands reclassified as tested, and 4 deviations removed.
    - Test: `test/neovim-command-index.yaml` (90 new entries)
    - Test: `test/neovim/deviations.ts` (4 removed, 8 added)

### Fixed

- **`:move` cursor positioning** — cursor now correctly lands on the last moved line instead of the first.
    - Plugin: `src/workspace/commands.ts` (positioning fix)
- **`@:` e2e test assertion** — strengthened assertion from `toContain` to `toBe` for more reliable verification.
    - Test: `test/specs/vim-builtin/new-commands.e2e.ts` (assertion fix)
- **Documentation: incorrect shared config directory instructions** — the "Shared config across vaults" sections in `lua-config.md` and `vimrc.md` presented global paths like `~/.config/obsidian/init.lua` as if they were auto-searched, but they only work when explicitly set as a custom path. Rewritten to document both the new global search toggle (Option A) and the custom absolute path (Option B). ([#150](https://github.com/saberzero1/motions/issues/150))
- **Documentation: `tablewidget` default wrong in Lua config reference** — documented default was `"cursor"`, actual default is `"native"`. Valid values corrected to `"native"`, `"raw"`.
- **Documentation: `oilconfirmdeletethreshold` default wrong** — documented as `5` in `lua-config.md` and `vimrc.md`, actual default is `1` (from `DEFAULT_SETTINGS`).
- **Documentation: Oil vimrc/Lua option names wrong in settings reference** — `oilexplorer` → `oil`, `oilshowhiddenfiles` → `oilhiddenfiles`, `oildefaultsort` → `oilsort`. Oil confirm delete threshold range corrected from `1–20` to `0–100`.
- **Documentation: yank highlight duration range wrong** — documented as `50–3000 ms` in `settings.md`, actual range is `0–5000 ms`.
- **Documentation: `foldenable` listed as Settings UI toggle** — `foldenable` is a CM Vim built-in option registered via `vim.defineOption`, not a `VimMotionsSettings` property. Moved from Vim features table to "Vimrc / Lua only" section.

### Tests

- **68 new Neovim golden test cases** — expanded coverage for `gE`, `go`, `*`, `#`, `(`, `)`, `]]`, `[[`, `][`, `[]`, `dgn`, `cgn`, visual mode operators, `<C-r>` redo, `gR`, `gp`, `gP`, `Y`, insert mode `<C-r>`, `<C-c>`, `<C-G>u`, `<C-G>j/k`, `0<C-D>`, `^<C-D>`, and `Q`.
    - Test: `test/neovim/test-definitions.ts` (68 new cases)
- **New golden spec file** — `test/specs/vim-builtin/new-commands-golden.e2e.ts` adds 12 golden tests for `@:`, `&`, `]<Space>`, `[<Space>`, and insert mode `<C-y>`, `<C-e>`, `<C-a>`.
    - Test: `test/specs/vim-builtin/new-commands-golden.e2e.ts` (new file)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated fork API and test infrastructure descriptions
- `CONTRIBUTING.md`: updated file tree for new test file
- `KNOWN_LIMITATIONS.md`: marked `:move` and `:copy` as implemented, updated infra-limitation deviations
- `README.md`: added `g@` and new ex commands to features list
- `docs/reference/keybindings.md`: added new insert mode and editing commands
- `docs/features/ex-commands.md`: added `:move` and `:copy` details
- `docs/configuration/lua-config.md`: added `vim.o.operatorfunc` documentation, fixed shared config section, `tablewidget` default, `oilconfirmdeletethreshold` default
- `docs/configuration/vimrc.md`: fixed shared config section, `oilconfirmdeletethreshold` default
- `docs/configuration/settings.md`: fixed oil vimrc/Lua names, yank highlight duration range, moved `foldenable` to vimrc/Lua-only section, added `globalConfigSearch` setting
- `AGENTS.md`: updated Lua configuration page ownership with `globalConfigSearch`

## [0.131.0] - 2026-08-28

### Fixed

- **Animated cursor consumes 50-60% GPU at idle** — the rAF animation loop ran at 60-120fps continuously whenever the editor had focus because `this.active = animating || this.view.hasFocus` always evaluated to `true`. The heartbeat timer (500ms setInterval) also re-woke the loop every 500ms if it stopped, defeating any idle-stop optimization. Implemented a 4-phase GPU optimization: (1) fixed the `active` flag to only reflect animation state (`active = animating`), (2) added a 3-gear frame governor (hot: rAF at ~60fps during animation, warm: setTimeout 600ms for blink toggle, stopped: no scheduling), (3) dirty-rect canvas clearing (only clear the cursor's bounding box instead of full viewport), (4) per-frame overhead reduction (cached `getComputedStyle`, `matchMedia`, accent color; mutable physics quad to eliminate 20 object allocations per tick). Idle GPU usage drops from 60-120 rAF/sec to ~1.67 rAF/sec (97-99% reduction). ([#148](https://github.com/saberzero1/motions/issues/148))
    - Plugin: `src/vim/animated-cursor/manager.ts` (3-gear frame governor with hot/warm/stopped states, heartbeat stall detection via `lastLoopTime`, dirty-rect tracking via `markDirty()`/`snapshotDirtyRegion()`, DPR change listener, MutationObserver for theme detection, `sizeCanvas()` moved to ResizeObserver)
    - Plugin: `src/vim/animated-cursor/controller.ts` (`active = animating`, cached block char info per position, accent color refresh on theme change only, `needsBlink()` for warm gear scheduling)
    - Plugin: `src/vim/animated-cursor/physics.ts` (mutable `targetQuad` via `updateQuadFromRect()`, eliminates per-frame allocations)
    - Plugin: `src/vim/animated-cursor/config.ts` (cached `prefers-reduced-motion` media query with change listener)
    - Plugin: `src/vim/animated-cursor/types.ts` (`needsBlink()` and `didDraw()` added to `Tickable` interface)

### Tests

- **Animated cursor idle rAF rate measurement** — empirical e2e test that instruments `requestAnimationFrame` to count callbacks over a 5-second idle window with animated cursor enabled. Verifies rAF rate is well below continuous 60fps (before: 825 rAF/5sec = 165/sec; after: 8 rAF/5sec = 1.6/sec — 99% reduction). (#148)
    - Test: `test/specs/animated-cursor.e2e.ts` (rAF counter via patched `window.requestAnimationFrame`, 5-second idle measurement, threshold assertion < 150)
- **Table-nav hotkey test uses platform-correct modifier on macOS** — the `Ctrl+P` regression test for table-nav hotkey passthrough (#146) hardcoded `Key.Control`, which does not open the command palette on macOS (where the shortcut is `Cmd+P`). The test now uses `obsidianPage.getPlatform()` and sends `Key.Command` on macOS, `Key.Control` elsewhere.
    - Test: `test/specs/table-nav-hotkeys.e2e.ts` (platform-aware modifier key via `obsidianPage.getPlatform()`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated animated cursor section — marked rAF loop death as enhanced with gear system, added GPU optimization details
- `docs/features/animated-cursor.md`: updated cross-platform resilience section with gear system details

## [0.130.0] - 2026-08-27

### Fixed

- **Vimium-style hint labels overlap on adjacent elements** — When two clickable elements were positioned close together (e.g., a link and a collapse icon in the backlinks sidebar), their hint labels rendered at nearly identical coordinates, making the first label inaccessible behind the second. Root cause: `showHints()` positioned each label at the target element's top-left corner with no collision detection. Added `resolveOverlaps()` — an AABB collision detection pass (same pattern used by EasyMotion's overlay) that tracks placed label bounding boxes and nudges overlapping labels downward. ([#144](https://github.com/saberzero1/motions/issues/144))
    - Plugin: `src/ui/hint-mode.ts` (added `resolveOverlaps()` function, called after initial label creation in `showHints()`)
- **Obsidian hotkeys blocked inside table-nav mode** — Ctrl+P (command palette), Ctrl+S (save), and all other Obsidian hotkeys were silently swallowed while the table-nav overlay was active. Three compounding issues: (1) both the nav scope and cell-edit scope were created with `new Scope()` (no parent), disconnecting Obsidian's global hotkey bindings from the keymap resolution chain — unhandled keys were dropped instead of falling through to global hotkeys. (2) The keymap handler's `default` case returned `true`, telling the scope handler that every non-table-nav key was consumed. (3) The scope handler called `stopImmediatePropagation()` on all consumed keys, preventing other DOM listeners from seeing them. Fixed by parenting both scopes to `app.scope`, returning `false` for unhandled keys, and removing `stopImmediatePropagation`. ([#146](https://github.com/saberzero1/motions/issues/146))
    - Plugin: `src/vim/table-nav-controller.ts` (parent both `Scope` instances to `this.app.scope`, remove `stopImmediatePropagation`)
    - Plugin: `src/vim/table-nav-keymap.ts` (`default: return true` → `return false`)
- **`Vc` (visual-line change) deletes extra line and mispositions cursor** — `V` to select a line then `c` deleted the trailing newline along with the line content, merging the current line with the next. When the next line was empty, it was deleted entirely. The cursor ended up on the start of the next line instead of staying on the current (now-empty) line. Root cause: the fork's `change` operator had no dedicated linewise visual branch — the catch-all visual path called `cm.replaceSelections([''])` with the CM6 selection that had been expanded to include the start of the next line (`head = Pos(line+1, 0)`), deleting through the newline. Fixed by adding a dedicated `args.linewise` branch that uses `cm.replaceRange('', from, to)` to clear line content only (col 0 to end of last selected line), preserving newlines, and positions the cursor at `(startLine, 0)`. ([#145](https://github.com/saberzero1/motions/issues/145))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`operators.change` — new `args.linewise` branch for visual-line change)
- **`zz`, `zt`, `zb` scroll to wrong positions with visible frontmatter properties** — In Live Preview mode, when YAML frontmatter was rendered as a properties widget, `zt` scrolled to center instead of top, `zz` overshot center, and `zb` was similarly mispositioned. Root cause: the codemirror-vim fork's `charCoords(pos, 'local')` method used `contentDOM.getBoundingClientRect()` as the vertical coordinate reference, but `scrollTo()` operates on `scrollDOM`. In Obsidian, the `.metadata-container` widget sits inside `scrollDOM` but outside `contentDOM`, creating a vertical offset between the two reference points. Fixed by splitting the coordinate reference: `contentDOM` for horizontal (goalColumn tracking for `gj`/`gk`), `scrollDOM` + `scrollTop` for vertical (scroll-content-space matching CM5 `local` mode). The inverse method `coordsChar` was updated to match. ([#143](https://github.com/saberzero1/motions/issues/143))
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (`charCoords` and `coordsChar` split coordinate reference: `contentDOM` for horizontal, `scrollDOM` for vertical)

### Tests

- 2 new e2e tests in `test/specs/hint-mode.e2e.ts`: labels for adjacent elements at the same position should not overlap, labels for elements stacked vertically with small gap should not overlap (#144)
- 1 new e2e test in `test/specs/table-nav-hotkeys.e2e.ts`: Ctrl+P opens command palette while in table-nav mode (#146)
- 4 new e2e tests in `test/specs/vim-builtin/visual-mode.e2e.ts`: `Vc` on middle line, `Vc` before empty line preserves it, `Vc` on last line, `Vjc` multi-line change (#145)
- 4 new Neovim golden test definitions in `test/neovim/test-definitions.ts` + golden data recorded in `test/neovim/golden-data/visual-mode.json` (#145)
- 3 new e2e tests in `test/specs/vim-builtin/z-commands.e2e.ts`: `zz`/`zt`/`zb` ordering with frontmatter visible, `zt` vs `zz` separation with frontmatter, `zt` places cursor within top 15% of viewport with frontmatter (#143)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked table-nav hotkey passthrough as fixed (#146)
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Visual-line change operator (`Vc`)" section, added "Scroll-space `charCoords` / `coordsChar`" section)
- New `docs/guides/plugin-integration.md`: community plugin integration guide with Better Paste recipes and generic `vim.obsidian.run_command` pattern ([#147](https://github.com/saberzero1/motions/issues/147))
- New `docs/guides/lua-recipes.md`: copy-paste Lua snippets for common workflows (display-line `j`/`k`, clipboard sync, leader bindings, auto-save, per-vault config, mobile overrides, picker, and more)
- `docs/guides/index.md`: added links to both new guide pages

## [0.129.0] - 2026-08-26

### Fixed

- **Shared label settings hidden when parent toggle is off** — Flash search labels, EasyMotion dimming, EasyMotion label characters, label font size, and scale-to-line-height were only visible when their original parent feature (EasyMotion or Flash f/F/t/T) was enabled, even though they are shared across multiple features (EasyMotion, Flash, Hint mode). Users who disabled Flash f/F/t/T could not configure or even see the Flash search labels toggle. Settings are now visible whenever any feature that uses them is enabled. ([#142](https://github.com/saberzero1/motions/issues/142))
    - Plugin: `src/settings.ts` (updated visibility gates for `flashSearch`, `easyMotionDimming`, `easyMotionLabels`, `labelFontSize`, `labelMatchFontSize` in both declarative and imperative settings paths)
    - Styles: `styles.css` (added `vim-motions-when-easymotion-or-flash` and `vim-motions-when-easymotion-or-hint-or-flash` CSS visibility gate rules)

### Documentation

- `CHANGELOG.md`
- `docs/configuration/settings.md`: updated descriptions for label font size and scale-to-line-height to mention flash

## [0.128.0] - 2026-08-25

### Fixed

- **EasyMotion line motions (`j`/`k`) operate characterwise instead of linewise in operator-pending mode** — `d<leader><leader>j{label}` deleted from cursor column to the target position (characterwise) instead of deleting full lines (linewise). Native Vim `j`/`k` have `motionArgs: { linewise: true }`. Added `linewise: true` to both `easyMotionLine` and `easyMotionLineBack` definitions.
    - Plugin: `src/easymotion/register.ts` (added `motionArgs: { linewise: true, forward: true/false }` to line motion entries)
- **EasyMotion forward motions do not set `motionArgs.forward`** — the fork's `clipToLine` function (which clips trailing newline+whitespace for multi-line forward operations) never fired for EasyMotion motions. Added `forward: true` or `forward: false` to all 17 directional EasyMotion motion definitions.
    - Plugin: `src/easymotion/register.ts` (added `forward` flag to all `EASYMOTION_DEFS` entries)
- **Insert-mode surround macro recording** — `<C-g>s{char}` keys typed during insert mode were not logged to the macro key buffer. The fork's `handleKeyInsertMode` now calls `logKey` when a full insert-mode command is matched, recording the complete key sequence to the macro register.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`handleKeyInsertMode` — `logKey` on `match.type == 'full'`)
- **`easyMotionRepeat` operator-pending mode** — `easyMotionRepeat` was registered as an action (`defineAction`) which cannot participate in operator-pending mode. Changed to a motion (`defineMotion`) with `mapCommand` binding at `<leader><leader>.`. The motion inherits `motionArgs` from the last executed EasyMotion motion, so operators apply with correct `linewise`/`inclusive`/`forward` flags.
    - Plugin: `src/easymotion/register.ts` (changed from `defineAction` to `defineMotion` + `mapCommand`, added `lastMotionArgs` storage)
- **`:m`/`:t` newline handling at document boundaries** — moving or copying lines to position 0 (top of file) or after the last line produced concatenated text without newline separation. Fixed `getLineRangeText` to include the preceding newline separator when extracting the last line, and `createMoveCopyCommand` to insert with correct newline placement at boundaries.
    - Plugin: `src/workspace/commands.ts` (`getLineRangeText` boundary handling, `createMoveCopyCommand` insert text normalization)
- **Table cell count prefixes** — `3j` in both table-nav overlay mode and cell editor mode performed a single cell crossing instead of three. Three changes: (1) table-nav keymap now accumulates digit keys as a count prefix and passes the count to `navigate()`. (2) `navigate()` loops `count` times for directional movement. (3) Cross-cell motion overrides (`moveByLines`, `moveByDisplayLines`) now loop `repeat` times through `getCellBelow`/`getCellAbove`, stopping at table boundaries.
    - Plugin: `src/vim/table-nav-keymap.ts` (digit accumulation, `consumeCount()`, count parameter on navigation keys)
    - Plugin: `src/vim/table-nav-controller.ts` (`navigate()` count parameter, loop)
    - Plugin: `src/vim/table-cell-motions.ts` (`createMoveByLines`, `createMoveByDisplayLines` repeat loop)
- **Cross-cell word motions** — `w`/`b`/`e`/`W`/`B`/`E`/`ge`/`gE` at cell boundaries did not jump to the adjacent cell. Added a `moveByWords` override in `table-cell-motions.ts` that detects when the word motion result is `null` or stuck at a boundary, and crosses to the next/previous cell via `getNextCell`.
    - Plugin: `src/vim/table-cell-motions.ts` (new `createMoveByWords` override, registered in `applyTableCellMotions`)
- **Table-nav dot-repeat for structural commands** — `.` in table-nav mode now repeats the last structural command (`o`, `O`, `dd`, `dc`, `J`, `K`, `H`, `L`, `I`, `A`). Count prefix works (`3.` repeats 3 times). Cleared on cell edit entry so vim's native `.` handles text edits.
    - Plugin: `src/vim/table-nav-keymap.ts` (`lastStructuralAction` tracking, `.` handler with count)
    - Plugin: `src/vim/table-nav-controller.ts` (`clearLastStructuralAction` on cell edit entry)
- **Multi-line `t` column 0 exclusion** — forward `t{char}` targets at column 0 were excluded entirely instead of wrapping to the previous line's last character. Fixed in both flash (`applyTillOffset` in `char-mode.ts`) and EasyMotion (`findTillTargets` in `targets.ts`). Targets at column 0 of line 0 (no previous line) are still excluded.
    - Plugin: `src/flash/char-mode.ts` (`applyTillOffset` — wrap to previous line)
    - Plugin: `src/easymotion/targets.ts` (`findTillTargets` — same fix)
- **EXTRA_DEFS bidirectional motions lack motionArgs** — `easyMotionBdEndWord`, `easyMotionBdEndWORD`, `easyMotionBdTill` now have `inclusive: true`, and `easyMotionBdLine` has `linewise: true`. Applied via `Object.assign(motionArgs, defArgs)` inside the motion function body, bypassing the `defineMotion`-only limitation.
    - Plugin: `src/easymotion/register.ts` (`EXTRA_DEFS` motionArgs + motion function mutation)
- **Tab/Shift+Tab in table-nav** — Tab in cell edit mode now exits the cell and returns to table-nav on the next cell. Tab/Shift+Tab also work directly in table-nav mode as cell navigation (equivalent to `l`/`h`). Count prefix works (`3Tab` moves 3 cells forward).
    - Plugin: `src/vim/table-nav-keymap.ts` (Tab/Shift+Tab case in nav handler)
    - Plugin: `src/vim/table-nav-controller.ts` (Tab/Shift+Tab Scope handlers in cell edit)

### Tests

- 3 new e2e tests in `test/specs/easymotion-comprehensive.e2e.ts`: `d+easymotion j` linewise delete, `y+easymotion j` linewise yank with register flag, `d+easymotion k` linewise delete upward
- 2 new e2e tests in `test/specs/easymotion-comprehensive.e2e.ts`: `d+easyMotionRepeat` operator-pending delete, `d+easyMotionRepeat` after line motion preserves linewise
- 1 new e2e test in `test/specs/surround.e2e.ts`: macro register contains `<C-g>s` keys after recording
- 6 crash-guard tests in `test/specs/vim-builtin/ex-move-copy-normal.e2e.ts` strengthened to behavioral assertions (`:m0`, `:m$`, `:m-2`, `:1,2m$`, `:t$`, `:1,2t$`) + 2 new tests (`:m3`, `:t0`)
- 2 new e2e tests in `test/specs/table-nav-mode.e2e.ts`: `3j` moves 3 rows in table-nav, `2l` moves 2 columns
- 2 new e2e tests in `test/specs/table-cell-vim-mode.e2e.ts`: cross-cell `w` at end of cell, cross-cell `b` at start of cell
- 3 new e2e tests in `test/specs/table-nav-mode.e2e.ts`: `.` repeats `o`, `2.` repeats twice, `.` cleared after cell edit
- 3 new unit tests in `test/unit/flash-targets.test.ts`: `findTillTargets` column 0 wrap, column 0 line 0 exclusion, non-zero column
- 2 new e2e tests in `test/specs/table-nav-mode.e2e.ts`: Tab in cell edit returns to nav, Shift+Tab navigates backward
- 1 new e2e test in `test/specs/flash-char-mode.e2e.ts`: multi-line `t` wraps to previous line end at column 0
- 1 new e2e test in `test/specs/easymotion-comprehensive.e2e.ts`: `y + easyMotionBdLine` via `mapCommand` yanks linewise (EXTRA_DEFS motionArgs)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked EasyMotion linewise, forward motionArgs, insert-mode surround macro recording, `easyMotionRepeat` operator-pending, `:m`/`:t` address parsing, table count prefixes, cross-cell word motions, table-nav dot-repeat, multi-line `t` column 0, EXTRA_DEFS motionArgs, and Tab/Shift+Tab in table-nav as fixed
- `CONTRIBUTING.md`: updated `easymotion/register.ts` and `table-cell-motions.ts` descriptions, `table-nav-keymap.ts` description
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (updated insert-mode surround macro recording section)
- `docs/features/tables.md`: added count prefix, cross-cell word motions (`w`/`b`/`e`), dot-repeat (`.`), Tab/Shift+Tab to keybindings table and native mode navigation table
- `docs/features/easymotion.md`: added "Repeat last motion" section with `<leader><leader>.` binding
- `docs/reference/keybindings.md`: added "EasyMotion repeat" section with `<leader><leader>.` binding

## [0.127.0] - 2026-08-25

### Added

- **Neovim default mapping audit** — comprehensive audit of all Neovim default mappings against the plugin implementation, with 20+ mappings added or fixed. Full results documented in `NEOVIM_MAPPING_DIFFERENCES.md`.
- **`gM` motion** — go to middle character of the text line (by character count). Distinct from `gm` (middle of screen line).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `moveToMiddleOfTextLine` motion + defaultKeymap entry)
- **`g&` action** — repeat last `:s` substitution on all lines in the buffer (equivalent to `:%s//~/&`).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `repeatLastSubstituteGlobal` action + defaultKeymap entry)
- **`]<Space>` / `[<Space>` actions** — add N blank lines below/above cursor. Supports count prefix (`3]<Space>` adds 3 blank lines). Neovim default since 0.10.
    - Plugin: `src/workspace/navigation.ts` (`addBlankLineBelow`/`addBlankLineAbove` actions)
- **`<C-W>T` action** — move current pane to a new tab. Transfers the leaf's view state to a new tab leaf, then detaches the old leaf.
    - Plugin: `src/workspace/navigation.ts` (`moveToNewTab` action)
- **`<C-W>^` action** — split current window and edit the alternate file. Combines horizontal split + alternate file navigation.
    - Plugin: `src/workspace/navigation.ts` (`splitAlternateFile` action)
- **`<C-W>n` mapping** — alias for `<C-W>s` (new horizontal split). Matches Neovim's `:new` equivalent.
    - Plugin: `src/workspace/navigation.ts` (additional `mapCommand` call)
- **`g<Tab>` mapping** — go to last accessed tab page. Aliases the existing `focusPreviousPane` action.
    - Plugin: `src/workspace/navigation.ts` (additional `mapCommand` call)
- **`]f` / `[f` mappings** — alias for `gf` (go to file). Matches Neovim bracket file navigation.
    - Plugin: `src/workspace/navigation.ts` (additional `mapCommand` calls)
- **`v_*` / `v_#` visual search** — in visual mode, `*` and `#` search for the selected text instead of the word under cursor. Neovim default since 0.10.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `selectedText` querySrc + visual-context keymap entries)
- **`K` keyword lookup** — adapted for Obsidian: triggers hover page preview on wikilinks, opens external URLs in browser, falls back to `ga` character info on plain text.
    - Plugin: `src/workspace/navigation.ts` (`createKeywordLookupAction`)
- **`g<C-A>` / `g<C-X>` sequential increment** — in visual mode, increments/decrements numbers sequentially across selected lines (+1, +2, +3...). Useful for numbered lists: select `0\n0\n0`, press `g<C-A>` → `1\n2\n3`.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (sequential path in `incrementNumberToken`)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (`sequential` added to `ActionArgsPartial`)
- **`:center` / `:left` / `:right` ex commands** — text alignment. `:ce` centers lines, `:le` left-aligns (trims), `:ri` right-aligns. Optional width argument (default: `textwidth` or 80).
    - Plugin: `src/workspace/commands.ts` (`createAlignCommand`)
- **`:retab` ex command** — replaces all tab characters with spaces using the current `tabSize` (or an explicit argument).
    - Plugin: `src/workspace/commands.ts`
- **`]m` / `[m` / `]M` / `[M` method navigation** — verified working via the fork's generic `moveToSymbol` motion with `method` mode. Golden test definitions added.

### Fixed

- **`<C-U>` in insert mode deleted to start of line instead of insert-start position** — fork now tracks `_insertStartPos` (the cursor position when insert mode was entered). `<C-U>` deletes back to that position instead of line start. Falls back to line start when cursor is already at or before the insert-start position. Position is preserved across `<C-O>` single normal commands, matching Neovim behavior.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `moveToInsertStart` motion, `_insertStartPos` tracking in `enterInsertMode`/`exitInsertMode`)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (`_insertStartPos` added to `vimState`)
- **`:d3` / `:m0` style ex commands didn't work** — the ex command parser treated trailing digits as part of the command name (e.g., `d3` → unknown command `d3`). Fixed `matchCommand_` to have a fallback pass matching commands by progressively shorter alpha prefixes, and `_processCommand` to extract the trailing suffix into arguments. Also fixes `:g/pattern/m0` subcommand routing.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`matchCommand_` fallback pass, `_processCommand` arg extraction)
- **`:$d` cursor position differed from Neovim** — after deleting lines with `:d`, cursor is now positioned at the first non-blank of `min(startLine, lastLine())`, matching Neovim.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`exCommands.delete` cursor positioning)
- **`:move` / `:m` and `:copy` / `:co` / `:t` deviations were stale** — the plugin already implements these via `createMoveCopyCommand` in `src/workspace/commands.ts`, overriding the fork's cursor-only stub. Deviation entries in `deviations.ts` should be removed.

### Tests

- 3 new golden test definitions for `gM` (middle of text line, short line, second line)
- 1 new golden test definition for `g&` (repeat substitute on all lines)
- 2 new golden test definitions for `]m`/`[m` (method start forward/backward)
- 3 new manual tests for `]<Space>`/`[<Space>` (add blank line below, above, with count)
- 2 new manual tests for `gM` (middle of 10-char line, 3-char line)
- 1 new manual test for `g&` (repeat substitute on all lines)
- 2 new manual tests for `v_*`/`v_#` (visual search forward/backward)
- 1 new manual test for `<C-U>` insert-start (preserves prefix text)
- Golden data re-recorded for g-commands suite

### Documentation

- `CHANGELOG.md`
- `NEOVIM_MAPPING_DIFFERENCES.md` (new file — full audit document, updated after each round)
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added `gM`, `g&`, `:d count`, `<C-U>` insert-start, `v_*`/`v_#`, ex command name parsing, `:$d` cursor, `g<C-A>`/`g<C-X>`)
- `docs/reference/keybindings.md` (added new keybindings)
- `docs/features/ex-commands.md` (added alignment and retab commands)
- `docs/features/quality-of-life.md` (added new Neovim defaults)

## [0.126.0] - 2026-08-24

### Added

- **`g_` motion** — moves to the last non-blank character of the current line (or count-1 lines forward). Inclusive motion matching Neovim's `g_`. `dg_` deletes through the last non-blank character, preserving trailing whitespace.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `moveToLastNonWhiteSpaceCharacter` motion handler and `g_` keybinding)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (type definition)

### Fixed

- **`g^` and `g0` display-line motions behaved identically** — both called `cursorLineBoundaryBackward`, which implements Home-key toggle behavior (first non-blank ↔ column 0). `g0` incorrectly went to first non-blank instead of column 0, and `g^` toggled instead of always going to first non-blank. Now `g0` unconditionally moves to column 0 of the visual line, and `g^` unconditionally moves to the first non-blank character of the visual line, matching Neovim. ([#141](https://github.com/saberzero1/motions/issues/141))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (new `moveToFirstNonBlankOfDisplayLine` handler for `g^`; `moveToStartOfDisplayLine` now uses `goDisplayLineStart`)
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (new `goDisplayLineStart` exec command using `view.moveToLineBoundary`)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (type definition for `moveToFirstNonBlankOfDisplayLine`)

### Tests

- 7 new e2e tests in `test/specs/vim-builtin/g-commands.e2e.ts`: `g0` always column 0, `g^` from mid-line, `g^` from column 0, `g^` idempotent at first non-blank, `g_` trailing spaces, `g_` no trailing spaces, `g_` empty line, `2g_` count, `dg_` operator-pending ([#141](https://github.com/saberzero1/motions/issues/141))
- 7 new Neovim golden test definitions in `test/neovim/test-definitions.ts` (`g0` indented, `g^` indented, `g^` no whitespace, `g^` idempotent, `g_` trailing spaces, `g_` no trailing, `2g_` count)
- Golden data recorded in `test/neovim/golden-data/g-commands.json`

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: added `g0`/`g^`/`g_` fork motion descriptions
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: added `g0`/`g^` fix under "Behavioral fixes (Neovim parity)" and `g_` under "New default keymap entries"

## [0.125.0] - 2026-08-24

### Fixed

- **Vim mode indicator desynchronized when switching tabs** — switching between editors in different vim modes (e.g., Insert in Tab A, Normal in Tab B) left the status bar showing the previous editor's mode. Root cause: `VimModeTracker`'s `active-leaf-change` handler attached event listeners to the new adapter but never read the new adapter's current vim mode — the display only updated when a subsequent `vim-mode-change` event fired. If the destination editor was already in Normal mode, no event fired and the indicator stayed stale. Fixed by adding `syncModeFromAdapter()` which reads the vim state's boolean flags (`insertMode`, `visualMode`, `visualLine`, `visualBlock`, `selectMode`, `virtualReplace`, `insertModeReturn`) directly from the adapter and updates the display immediately after attaching to the new adapter on leaf change. ([#140](https://github.com/saberzero1/motions/issues/140))
    - Plugin: `src/vim/mode-tracker.ts` (new `syncModeFromAdapter` method; called after `attachToAdapter` in `active-leaf-change` handler)

### Tests

- 2 new regression tests in `test/specs/vim-builtin/mode-indicators.e2e.ts` ([#140](https://github.com/saberzero1/motions/issues/140)): Insert→Normal tab switch syncs indicator, Normal→Insert tab switch syncs indicator

### Documentation

- `CHANGELOG.md`

## [0.124.0] - 2026-08-24

### Changed

- **CI e2e sharding** — the e2e workflow now distributes spec files into 36 shards (matching the GitHub Actions concurrent job limit) instead of creating one matrix job per spec file. The discover job distributes specs round-robin into shards; each runner executes 5–6 specs sequentially. This keeps the matrix well under the 256-job GitHub Actions cap as the test suite grows, while maintaining full parallelism across all available runners.
    - CI: `.github/workflows/e2e.yml` (discover job shards specs into 36 groups, e2e job iterates shard matrix)
- **Cross-platform e2e CI** — the e2e workflow now runs the full sharded test suite on macOS (`macos-latest`, ARM) and Windows (`windows-latest`) in addition to Linux. No virtual display setup needed on macOS/Windows — GitHub runners provide native GUI sessions. `wdio-obsidian-service` handles Obsidian download, ChromeDriver version matching, and platform-specific launch per OS. `CSC_IDENTITY_AUTO_DISCOVERY=false` prevents macOS keychain prompts. 40-minute timeout per job accommodates slower runners. Windows shards retry up to 3 times on `EPERM` errors from `obsidian-launcher`'s atomic file rename (Windows NTFS file locking during `onPrepare` download).
    - CI: `.github/workflows/e2e.yml` (new `e2e-cross-platform` job with `os: [macos-latest, windows-latest]` matrix, EPERM retry logic)

### Fixed

- **E2e tests using `Key.Ctrl` send `Cmd` on macOS instead of `Ctrl`** — WebDriverIO's `Key.Ctrl` is a cross-platform abstraction that maps to `Cmd` on macOS and `Ctrl` on Linux/Windows. Vim keybindings like `<C-w>` and `<C-t>` require the physical Control key. Changed all vim-related test key dispatches from `Key.Ctrl` to `Key.Control` (the actual Control key on all platforms). This fixed 8 `<C-w>` workspace navigation test failures, 2 which-key overlay test failures, and 1 Oil `C-t` test failure — all macOS-only.
    - Test: `test/specs/global-nav.e2e.ts` (`Key.Ctrl` → `Key.Control` for `<C-w>h/l/q/s/d`)
    - Test: `test/specs/global-nav-plugin-leaf.e2e.ts` (`Key.Ctrl` → `Key.Control` for `<C-w>h`)
    - Test: `test/specs/gmap.e2e.ts` (`Key.Ctrl` → `Key.Control` for `<C-w>h` and which-key tests)
    - Test: `test/specs/gmap-vimrc.e2e.ts` (`Key.Ctrl` → `Key.Control` for `<C-w>` bindings)
    - Test: `test/specs/oil-poc.e2e.ts` (`Key.Ctrl` → `Key.Control` for `C-t` open-in-new-tab)
- **Table nav scroll tests fail on macOS/Windows due to CM6 lazy widget rendering** — `waitForTableWidget()` was called before scrolling the cursor near the table. On platforms with smaller viewports, the table at line 33 of the fixture file was offscreen and CM6 didn't create `.cm-table-widget` (lazy rendering). Fixed by scrolling the cursor to line 31 (near the table) before waiting for the widget. Also removed overly strict `scrollBefore > 0` assertion that assumed the viewport couldn't display 31 lines (varies by platform/window size).
    - Test: `test/specs/table-nav-scroll.e2e.ts` (reordered cursor positioning before `waitForTableWidget`, removed viewport size assumption)
- **Upgraded `@obsidian-typings/obsidian-public-latest` from `^6.32.0` to `^6.33.0`** — pulls in `@obsidian-typings/obsidian-public-1.13.7@1.6.0` which includes full `TableEditor`, `TableCell`, `TableRow`, `TableSelectionBounds`, `CellDirection`, `CellPosition`, `CursorPlacement`, and `TableAlignment` type definitions. Replaced local runtime-discovered typings (`ObsidianTableEditor`, `ObsidianTableCell`, `ObsidianTableRow`) with the upstream types. Deleted `src/types/table-editor.d.ts` (247 lines).
    - Plugin: `package.json` (dependency version bump)
    - Plugin: `src/types/table-editor.d.ts` (deleted — replaced by upstream)
    - Plugin: `src/vim/native-table-adapter.ts` (imports from `@obsidian-typings/obsidian-public-latest` instead of local file)
    - Plugin: `src/vim/table-nav-controller.ts` (imports from `@obsidian-typings/obsidian-public-latest` instead of local file)
    - Plugin: `src/vim/table-cell-motions.ts` (imports from `@obsidian-typings/obsidian-public-latest` instead of local file)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: added `TableEditor`/`TableCell` to key typed APIs list; updated CI container image description to reflect sharding strategy; added cross-platform e2e CI description with EPERM retry
- `CONTRIBUTING.md`: removed deleted `table-editor.d.ts` from `src/types/` file tree; updated CI infrastructure paragraph to reflect sharding strategy, cross-platform runners, and Windows EPERM retry

## [0.123.0] - 2026-08-22

### Fixed

- **Parent editor cursor visible next to table during cell editing** — when entering cell edit mode from table-nav (via `i`, `a`, `c`, `s`, or `Enter`), the parent editor's vim cursor layer became visible next to the table widget with an oversized height (spanning the full table widget). Root cause: `enterCellEdit()` called `clearCursorSuppressedForView()` and `resumeAnimatedCursorForView()` immediately, but cell editor focus was deferred by 150ms via `setTimeout` in `finishCellEditEntry()`. During the gap, the parent editor still had focus and its `BlockCursorPlugin` re-rendered the unsuppressed cursor at the table-range position where `coordsAtPos()` returns the full widget height. Additionally, even after focus transfer, a pending `requestMeasure` callback from a prior update cycle could redraw the cursor with `suppressed=false`. Fixed by removing both calls entirely — parent cursor suppression stays active throughout the nav→edit transition. `exitCellEditToNav()` and `exitTable()` handle restoring suppression state on exit. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-nav-controller.ts` (removed `clearCursorSuppressedForView` + `resumeAnimatedCursorForView` from `enterCellEdit`)
- **Visual/Visual Line put command not replacing selection** — `P`, `gp`, and `gP` in visual or visual-line mode inserted text at the cursor instead of replacing the selected text. Two root causes: (1) the plugin's `pasteFromRegister()` (used by `P`/`gp`/`gP`) had no visual mode handling — it always performed a cursor-relative insert; (2) the fork's `continuePaste()` (used by `p`) read the CM6 selection via `getSelectedAreaRange()` and `cm.getSelection()`, which return a collapsed range in visual-line mode due to the cursor-only CM6 selection design (see "Visual-line cursor-only CM6 selection" in KNOWN_LIMITATIONS.md). ([#139](https://github.com/saberzero1/motions/issues/139))
    - Plugin: `src/workspace/navigation.ts` (new `pasteInVisualMode()` function; visual mode detection in `pasteFromRegister()` delegates to it; reads `vim.sel` for correct range, handles visual-char and visual-line, stores replaced text in unnamed register, calls `Vim.exitVisualMode()`)
    - Plugin: `src/types/vim-api.d.ts` (added `exitVisualMode` to `VimApi` interface)
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`continuePaste` visual-line branch now derives `selectionStart`/`selectionEnd` from `vim.sel` instead of collapsed CM6 selection; `selectedText` uses `cm.getRange()` instead of `cm.getSelection()`; linewise text preparation preserves trailing newline in visual-line mode since the replacement range spans whole lines, with last-line edge case handling)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (new "Visual-line paste fix" subsection)

### Tests

- 1 new regression test in `test/specs/table-cursor-suppression.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): parent cursor hidden after entering cell edit via `i`
- 7 new tests in `test/specs/vim-builtin/normal-yank-put.e2e.ts` ([#139](https://github.com/saberzero1/motions/issues/139)): `v + p`, `V + p`, `V + P`, `v + P`, visual paste unnamed register update, `v + gp`, normal mode return after visual paste
- 4 new Neovim golden test definitions in `test/neovim/test-definitions.ts` ([#139](https://github.com/saberzero1/motions/issues/139)): `v + p`, `V + p`, `V + P`, `v + P` — all verified against Neovim
- Recorded golden data in `test/neovim/golden-data/normal-yank-put.json`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked parent cursor visible during cell editing as fixed (#136); updated "Table navigation cursor hiding" section with deferred unsuppression in `enterCellEdit`
- `AGENTS.md`: added `exitVisualMode` to fork API description
- `KNOWN_LIMITATIONS.md`: updated yank-ring section (visual-mode `gp`/`gP` no longer bypass yank-ring); updated V-LINE cursor-only section (fork's `continuePaste` now handles cursor-only selection)
- Fork: `~/Repos/codemirror-vim/DIFFERENCES.md`: new "Visual-line paste fix" subsection

## [0.122.0] - 2026-08-22

### Fixed

- **Viewport snaps to top of table when entering table-nav** — when navigating into a long table from above, the viewport jumped to the top of the table instead of staying in place. During the 80ms entry debounce, Obsidian's native cell editor opens and scrolls the table into view. The plugin now locks `scrollTop` via a scroll event listener during the debounce window to prevent the visual snap entirely, then restores the saved position after table-nav activates. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-nav-controller.ts` (`preEntryScrollTop` session field, scroll-lock listener in `scheduleEntry`, `focusWithoutScroll`, scroll restore in `tryEnter` + rAF safety net)
- **Table-nav ignores scrolloff setting** — table-nav cell scrolling used hardcoded 5px margins instead of the user's `scrolloff` setting. With `scrolloff=999` (typewriter/centered cursor), the highlighted cell stayed at the viewport edge instead of staying centered. Replaced dispatch-based `syncCursorToActiveCell` with DOM-level `scrollHighlightedCellIntoView` (avoids CM6 update cycle side effects) and updated `tableNavScrollHandler` — both now read the scrolloff margin via `getScrolloffMargin()` with the same half-viewport clamping as the main editor. Structural commands (`o`, `O`, `dd`, `J`, `K`, etc.) now scroll the viewport to follow the highlighted cell after row insertion/deletion. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-nav-controller.ts` (`scrollHighlightedCellIntoView`, replaced `syncCursorToActiveCell`, `tableNavScrollHandler` uses `getScrolloffMargin`, `refreshAfterDocChange` scrolls after structural ops)
    - Plugin: `src/vim/scrolloff.ts` (new `getScrolloffMargin()` export)

### Tests

- 2 new tests in `test/specs/table-nav-scroll.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): entering table-nav should not snap viewport to top of table, scrolloff should keep highlighted cell away from viewport edge
- Updated `test-vault/fixtures/table-nav/LongTable.md` to 100 rows with 30 lines of leading content

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked viewport snap and scrolloff bugs as fixed

## [0.121.0] - 2026-08-22

### Fixed

- **Escape does not return to table-nav after Enter cell entry** — when entering a cell via `Enter` in table-nav mode (normal-mode cell entry), pressing `Escape` did not return to table-nav mode. The cell editor's vim keydown observer consumed Escape before the Obsidian Scope handler could intercept it. Additionally, the cell editor's vim state had `mode: null` (pre-initialization) which caused `isVimIdle()` to return `false`. Fixed by installing a capture-phase `keydown` listener on `document` during cell-edit mode that intercepts Escape when vim is idle, and introducing `isCellVimIdle()` which treats `null`/`undefined` mode as idle (equivalent to normal mode during cell editor initialization). ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-nav-controller.ts` (`isCellVimIdle`, `installCellEscapeCapture`, `removeCellEscapeCapture`, `cellEscapeCleanup` session field)
- **Community plugin `replaceSelection` fails in visual-line mode** — community plugins like Note Refactor that call `editor.replaceSelection()` after async operations (file creation, link generation) failed to replace the selected text in visual-line mode. The existing `withExpandedSelection` wrapper expanded the CM6 selection synchronously and restored cursor-only in its `finally` block, but async command callbacks executed `replaceSelection()` after the selection was already restored. Additionally, `editor.replaceSelection()` was not patched in the `VisualLineSomethingSelectedPatch` ViewPlugin (only `somethingSelected()` and `getSelection()` were). Fixed by patching `editor.replaceSelection()` to compute the linewise range from vim's selection state and dispatch a CM6 replacement transaction directly, with trailing newline handling for mid-document lines. The patch exits visual-line mode via `Vim.handleKey(cm, '<Esc>')` after replacement since the selection has been consumed. ([#138](https://github.com/saberzero1/motions/issues/138))
    - Plugin: `src/vim/visual-line-command-fix.ts` (`replaceSelection` patch in `VisualLineSomethingSelectedPatch`, cleanup in `destroy()`)

### Tests

- 4 new tests in `test/specs/table-cell-vim-mode.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): Escape after Enter returns to nav mode, single Escape from insert mode does NOT exit to nav (regression guard), j after Enter cell edit navigates to next row, cursor height in cell normal mode guard
- New helper `getCellVimMode()` in `test/specs/table-cell-vim-mode.e2e.ts`
- 5 new spike tests in `test/specs/spikes/spike-issue138-vline-async-replaceSelection.e2e.ts` ([#138](https://github.com/saberzero1/motions/issues/138)): V-LINE `getSelection()` baseline, sync `replaceSelection` via `executeCommandById`, async `replaceSelection` via fake command (Note Refactor pattern), direct async `replaceSelection` without `executeCommand`, sync direct `replaceSelection` without wrapper

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: marked Escape-from-cell-edit bug as fixed; updated V-LINE passthrough section with `replaceSelection` patch details and updated trade-off/test coverage

## [0.120.1] - 2026-08-21

### Changed

- **Removed `!important` from table-nav CSS** — replaced `overflow: visible !important` on `.vim-motions-table-nav-mode .cm-table-widget` with higher-specificity selectors (`.cm-editor .vim-motions-table-nav-mode.cm-table-widget`). The added `.cm-editor` ancestor provides enough specificity to override Obsidian's built-in `overflow: hidden` without `!important`.
    - Styles: `styles.css` (increased selector specificity, removed `!important`)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: added "Never use `!important` in CSS" coding convention
- `CONTRIBUTING.md`: added `!important` avoidance guideline to code style section

## [0.120.0] - 2026-08-21

### Fixed

- **Table cell cursor bounce-back on macOS (continued)** — the `MessageChannel`-based `scheduleCrossing()` from 0.119.0 still raced with Obsidian's table widget focus handlers on macOS Electron. Replaced with `requestAnimationFrame`, which defers the cross-cell focus change until after the full event dispatch cycle and paint frame complete — guaranteeing Obsidian's table widget keydown handlers have finished before the plugin changes cell focus. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-cell-motions.ts` (`scheduleCrossing` now uses `requestAnimationFrame` instead of `MessageChannel`)
- **Table-nav viewport does not follow cursor in long tables** — when navigating down through a table taller than the viewport with `enableTableNav=true`, the highlighted cell went off-screen because `navigate()` only updated the CSS highlight class without scrolling. CM6 treats the native table widget as an opaque block decoration and cannot scroll to positions within it. Fixed by registering an `EditorView.scrollHandler` facet that intercepts scroll requests during table-nav mode, reads the highlighted cell's DOM bounding rect, and adjusts `scrollDOM.scrollTop` directly — the CM6-sanctioned mechanism for custom scroll behavior that is not overridden by viewport reconciliation. Added `overflow: visible` CSS override on the table widget during nav mode to prevent the widget's `overflow: auto hidden` from blocking `scrollIntoView` propagation. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-nav-controller.ts` (`syncCursorToActiveCell`, `tableNavScrollHandler` extension)
    - Styles: `styles.css` (`overflow: visible` on `.vim-motions-table-nav-mode.cm-table-widget`)

### Added

- **Vim/Neovim built-in gap coverage** — systematic effort to close ~50 gaps in vim/neovim built-in command coverage across 8 implementation batches.
- **Fork: `@:` repeat last ex command** — new `repeatLastExCommand` action replays the most recent ex command. Added to defaultKeymap.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`repeatLastExCommand` action + defaultKeymap entry)
- **Fork: `&` repeat last `:s` on current line** — new `repeatLastSubstitute` action re-executes the last `:s` substitution. Added to defaultKeymap.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`repeatLastSubstitute` action + defaultKeymap entry)
- **Fork: `ZZ` write+quit and `ZQ` quit without saving** — mapped in defaultKeymap via `exArgs: { input: 'wq' }` and `exArgs: { input: 'q' }` respectively.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (defaultKeymap entries)
- **Fork: Insert `<C-a>` re-insert previously inserted text** — new `reinsertPreviousInsert` action replays the last insert-mode text at the cursor.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`reinsertPreviousInsert` action)
- **Fork: Insert `<C-e>` copy character from line below** — new `copySameColumnBelow` action copies the character at the same column from the line below.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`copySameColumnBelow` action)
- **Fork: Insert `<C-y>` copy character from line above** — new `copySameColumnAbove` action copies the character at the same column from the line above.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`copySameColumnAbove` action)
- **`<C-w>w` / `<C-w>W` cycle panes** — cycle focus to the next or previous pane in the workspace.
    - Plugin: `src/workspace/navigation.ts`
- **`<C-w>p` focus previous pane** — jump to the previously accessed pane using leaf ID tracking.
    - Plugin: `src/workspace/navigation.ts`
    - Plugin: `src/main.ts` (`previousLeafId` tracking extracted from Harpoon-gated handler into unconditional handler)
- **`gm` go to middle of screen line** — positions cursor at the horizontal midpoint of the visible editor area.
    - Plugin: `src/workspace/navigation.ts`
- **`go` go to character offset** — jumps to the Nth byte offset in the buffer (with count prefix).
    - Plugin: `src/workspace/navigation.ts`
- **`g8` show UTF-8 byte sequence** — displays the UTF-8 hex byte values for the character under the cursor.
    - Plugin: `src/workspace/navigation.ts`
- **`gF` go to file with line number** — opens the file path under the cursor, optionally jumping to a line number suffix (e.g., `file.md:42`).
    - Plugin: `src/workspace/navigation.ts`
- **`<C-g>` show file info** — displays filename, line count, cursor position, and percentage through file in a notice.
    - Plugin: `src/workspace/navigation.ts`
- **`<C-^>` / `<C-6>` alternate file switching** — switch between the current and alternate (previously edited) file, matching Neovim's `<C-^>` behavior.
    - Plugin: `src/main.ts` (`alternateFilePath` / `lastMarkdownFilePath` fields + `<C-^>` / `<C-6>` mapping)
- **`<C-]>` follow link under cursor** — alias for `gd` (go to definition).
    - Plugin: `src/main.ts`
- **`<C-t>` pop from link follow** — alias for jump list backward navigation.
    - Plugin: `src/main.ts`
- **`zs` / `ze` / `zH` / `zL` horizontal scroll commands** — scroll the viewport horizontally without moving the cursor.
    - Plugin: `src/workspace/navigation.ts`
- **Ex commands for `:move`, `:copy`, and `:normal`** — add `:m`/`:move` line moves, `:t`/`:copy`/`:co` line copies, and `:normal`/`:normal!` key dispatch from the ex line.
    - Plugin: `src/workspace/commands.ts` (line transfer helpers + `:normal` key feeding)
- **`:tabmove` no-op registration** — registered as a no-op with a notice (Obsidian has no tab reorder API).
    - Plugin: `src/workspace/commands.ts`
- **No-op crash guards** — 21 commands registered as no-ops to prevent crashes on unrecognized keys: window commands (`<C-w>=`, `<C-w>_`, `<C-w>|`, `<C-w>r`, `<C-w>R`, `<C-w>x`), spelling (`]s`, `[s`, `z=`, `zg`, `zw`), normal `U`, `<C-l>`, `g<C-a>`, `g<C-x>`, insert `<C-r>=`, `<C-k>`, `<C-v>`, `<C-x>` family.
    - Plugin: `src/workspace/navigation.ts`

### Tests

- 1 new e2e spec file: `test/specs/table-nav-scroll.e2e.ts` (viewport scrolling in long tables with constrained scroller height, [#136](https://github.com/saberzero1/motions/issues/136))
- 1 new fixture file: `test-vault/fixtures/table-nav/LongTable.md` (30-row table for scroll testing)
- Updated `test/neovim-command-index.yaml` — 50 new entries (287→337 total, 313 tested + 21 skip + 3 pending).
- 5 new e2e spec files:
    - `test/specs/vim-builtin/new-commands.e2e.ts` (11 tests: `@:`, `&`, `ZZ`, `ZQ`, insert `<C-a>`/`<C-e>`/`<C-y>`)
    - `test/specs/vim-builtin/link-nav-window-cycle.e2e.ts` (13 tests: `<C-^>`, `<C-]>`, `<C-t>`, `<C-w>w`/`W`/`p`)
    - `test/specs/vim-builtin/ex-move-copy-normal.e2e.ts` (19 tests: `:m`, `:t`, `:normal`)
    - `test/specs/vim-builtin/minor-motions-scroll.e2e.ts` (18 tests: `gm`, `go`, `g8`, `gF`, `<C-g>`, `zs`/`ze`/`zH`/`zL`)
    - `test/specs/vim-builtin/noop-commands.e2e.ts` (10 tests: all no-op crash guards)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: updated fork description with new actions, updated test file organization
- `KNOWN_LIMITATIONS.md`: added `:m`/`:t` address parsing limitation
- `docs/reference/keybindings.md`: added new normal-mode, insert-mode, window, g-prefix, z-prefix, and ex command entries
- `docs/features/ex-commands.md`: added `:m`/`:t`/`:normal` editing commands section
- `docs/features/workspace-navigation.md`: added pane cycling, alternate file, link navigation, and document info sections
- `CONTRIBUTING.md`: updated `table-cell-motions.ts` and `table-nav-controller.ts` descriptions
- `KNOWN_LIMITATIONS.md`: documented table-nav viewport scrolling fix

## [0.119.0] - 2026-08-20

### Fixed

- **Table cell cursor bounce-back on macOS** — `scheduleCrossing()` in the cross-cell motion overrides used `setTimeout(0)` to defer cell focus changes after vim's motion return. On macOS Electron, `setTimeout(0)` is subject to timer clamping (1–4ms minimum delay), during which Obsidian's native table widget event handlers re-assert focus on the original cell — producing cursor bounce-back. Users with `j→gj` / `k→gk` remappings were especially affected because the remapping adds an extra key processing step. Fixed by replacing `setTimeout(0)` with `MessageChannel` port messaging, which dispatches a macrotask that fires before timers in the browser event loop. Token-based deduplication ensures rapid key repeats coalesce correctly. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/vim/table-cell-motions.ts` (`scheduleCrossing` now uses `MessageChannel` instead of `setTimeout(0)`)
- **Cross-cell motions broken when `enableTableNav=false`** — the 0.118.0 fix for #136 incorrectly gated `applyTableCellMotions()` on `enableTableNav`, which removed the motion overrides entirely when table nav was disabled. This broke `j`/`k`/`h`/`l` cross-cell navigation in native table cell editors. Reverted the gate — cross-cell motions are independent of `enableTableNav`, as originally designed. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/main.ts` (removed `enableTableNav` check from both `applyTableCellMotions` registration sites)

### Tests

- Added native-mode cross-cell tests in `test/specs/table-nav-disabled.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): j cross row, k cross row, l cross cell, j exit table, no-overlay assertion, cell editor opens — using WebDriver `$().click()` for reliable cell entry and `waitUntil` for async assertions
- Added raw-mode tests with `j→gj`/`k→gk` remappings (j down, k up)
- Updated `test/specs/table-cell-vim-mode.e2e.ts`: cross-cell j/l tests use `waitUntil` for deterministic assertions
- Updated `test/specs/table-cursor-suppression.e2e.ts`: #127 tests use `G`/`gg` jumps instead of j/k table traversal; #135 tests use WebDriver cell click + `waitUntil` for table-nav entry

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: reverted cross-cell motions documentation to reflect independence from `enableTableNav`
- `CONTRIBUTING.md`: updated `table-cell-motions.ts` description
- `docs/features/tables.md`: reverted table modes matrix and cell editor behavior description
- `docs/configuration/settings.md`: reverted Table navigation setting description

## [0.118.0] - 2026-08-20

### Fixed

- **Table movement broken when `enableTableNav=false` (macOS)** — `applyTableCellMotions()` overrode `moveByLines`, `moveByCharacters`, and `moveByDisplayLines` globally whenever `tableWidgetMode` was `native`, regardless of `enableTableNav`. When table nav was disabled, these overrides still intercepted `j`/`k` (and `gj`/`gk`) inside native table cells, calling `scheduleCrossing()` with `setTimeout(0)` which raced with Obsidian's native cell focus management on macOS — producing cursor bounce-back. Users with `j→gj` / `k→gk` remappings (common vimrc/Lua pattern) were especially affected because the remapping routes through `moveByDisplayLines`. Fixed by gating `applyTableCellMotions()` on `enableTableNav` — when the user disables table nav, the motion overrides are not installed. Obsidian's native table cell editor handles cross-cell navigation on its own. ([#136](https://github.com/saberzero1/motions/issues/136))
    - Plugin: `src/main.ts` (added `enableTableNav` check to both `applyTableCellMotions` registration sites)

### Changed

- **Cross-cell motions now respect `enableTableNav`** — `h`/`j`/`k`/`l` crossing cell boundaries in native table mode was previously always active regardless of `enableTableNav`. Cross-cell motions now only activate when `enableTableNav` is `true`. When disabled, Obsidian's native table cell editor handles cell boundary navigation directly.

### Tests

- Updated `test/specs/table-nav-disabled.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): replaced flaky native table cross-cell tests with `enableTableNav=false` no-overlay assertion; added 2 raw mode tests with `j→gj`/`k→gk` remappings (j down, k up)
- Updated `test/specs/table-cell-vim-mode.e2e.ts`: `enableTableNav=false` cross-cell tests now assert cursor stays within cell (no cross-cell override)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated cross-cell motions documentation to reflect `enableTableNav` gating; updated table modes matrix; updated `tablewidget` mode description
- `CONTRIBUTING.md`: updated `table-cell-motions.ts` description to reflect `enableTableNav` gating
- `docs/features/tables.md`: updated table modes matrix and cell editor behavior description for disabled table-nav
- `docs/configuration/settings.md`: updated Table navigation setting description

## [0.117.0] - 2026-08-20

### Fixed

- **Note Composer "Extract current selection" does nothing in V-LINE mode** — in visual-line mode, the codemirror-vim fork sets a cursor-only CM6 selection (to prevent Live Preview from uncollapsing hidden markup). This caused `editor.somethingSelected()` to return `false`, so commands that check for a selection silently failed. The existing `executeCommand` wrapper expanded the selection before command execution, but Obsidian's command palette invokes `checkCallback()` directly on the command object, bypassing `executeCommand` entirely. Fixed by wrapping every command's `checkCallback` to expand the visual-line selection before the callback runs, and wrapping `addCommand` to cover commands registered after plugin load. ([#137](https://github.com/saberzero1/motions/issues/137))
    - Plugin: `src/vim/visual-line-command-fix.ts` (wrap `checkCallback` on all commands + `addCommand` hook; extract shared `withExpandedSelection` helper)
- **Cursor flashing at previous cell during table navigation** — when table navigation was enabled, the vim cursor layer remained visible at the previous cell position after entering the table and after navigating between cells with `h`/`j`/`k`/`l`. Three root causes: (1) `tryEnter()` never dispatched the `enterTableNav` state effect, so `isTableNavActive()` always returned `false` — the `mainEditorTableCursorGuard` continued running during table-nav and could clear cursor suppression. (2) The vim cursor layer (`.cm-vimCursorLayer`) on the main editor was not proactively cleared during navigation, allowing stale cursor elements to remain visible. (3) `cellEditorCursorGuard.destroy()` unconditionally called `clearCursorSuppressedForView()` on the parent editor, undoing the controller's suppression even while table-nav was active. Additionally, cell editors inside the table widget are destroyed and recreated during entry, each creating a fresh `BlockCursorPlugin` with a visible cursor layer — the controller now suppresses these on every ViewUpdate via `suppressWidgetCursorLayers()`. ([#135](https://github.com/saberzero1/motions/issues/135))
    - Plugin: `src/vim/table-nav-controller.ts` (dispatch `enterTableNav` effect, `clearVimCursorLayer()` helper, `suppressWidgetCursorLayers()` on every update + entry + rAF safety net)
    - Plugin: `src/vim/table-cell-cursor-guard.ts` (`cellEditorCursorGuard.destroy()` guards on `isTableNavActive()`)

### Tests

- 3 regression tests in `test/specs/visual-line-command.e2e.ts` (#137): `note-composer:split-file` `checkCallback` returns `true` in V-LINE, `editor.somethingSelected()` returns `true` in V-LINE, `executeCommandById` affects all selected lines in V-LINE
- 3 regression tests in `test/specs/table-cursor-suppression.e2e.ts` (#135): main editor cursor suppression during navigation, rapid multi-directional navigation, no visible cursor anywhere on initial entry
- 3 regression tests in `test/specs/table-nav-disabled.e2e.ts` ([#136](https://github.com/saberzero1/motions/issues/136)): cursor movement through raw tables with `enableTableNav=false` — j down, k up, j exits table

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: updated visual-line command passthrough description to reflect `checkCallback` wrapping for command palette path (#137); updated table navigation cursor hiding entry; added #136 cross-reference to #132 cursor disappearing fix
- `CONTRIBUTING.md`: updated `table-nav-controller.ts` and `table-cell-cursor-guard.ts` descriptions

## [0.116.0] - 2026-08-18

### Changed

- **E2E CI: custom Docker runner image** — the e2e workflow now runs each spec inside a custom container image (`ghcr.io/<repo>/e2e-runner:latest`) with Xvfb, herbstluftwm, Node.js 24, and Electron system dependencies pre-installed. The entrypoint starts the virtual display with readiness polling (polls `xdpyinfo` and `herbstclient` every 200ms, fails after 6s) instead of the previous `sleep 1` race condition. Eliminates per-runner `apt-get update` + `apt-get install` (~30s per shard × 79 shards). The image is built and pushed to GHCR by `.github/workflows/docker-e2e-runner.yml` on Dockerfile changes or manual dispatch.
    - New: `.github/docker/e2e-runner/Dockerfile` (Ubuntu 24.04 base, Xvfb, herbstluftwm, dzen2, x11-xserver-utils, Electron deps, Node.js 24)
    - New: `.github/docker/e2e-runner/entrypoint.sh` (Xvfb + herbstluftwm readiness polling, `exec "$@"` handoff)
    - New: `.github/workflows/docker-e2e-runner.yml` (build + push to GHCR on Dockerfile changes)
    - Changed: `.github/workflows/e2e.yml` (uses `container:` with the custom image, removed `Setup virtual display` step and `actions/setup-node`, added npm cache via `actions/cache`)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: Added CI container image documentation to Automated testing section
- `CONTRIBUTING.md`: Added CI infrastructure note to Running E2E tests section

## [0.115.2] - 2026-08-18

## [0.115.1] - 2026-08-18

### Fixed

- CI issue with obsidian-workflows.

## [0.115.0] - 2026-08-18

### Added

- **Fold navigation motions (`zj`, `zk`, `[z`, `]z`)** — `zj` moves to the start of the next foldable region (skipping child folds within the current heading's range, matching Neovim's sibling-fold semantics). `zk` moves to the end of the previous foldable region. `[z`/`]z` navigate to the start/end of the enclosing foldable region. All four support counts (`3zj`), operator-pending mode (`dzj`), and record to the jump list. Ex command aliases: `:foldnext`, `:foldprev`, `:foldstart`, `:foldend`.
    - Plugin: `src/fold/motions.ts` (NEW — `findNextFoldable`, `findPrevFoldable`, `findEnclosingFoldable`, `foldedRangesWithin`, `foldableRegionsWithin`, `foldNext`, `foldPrev`, `foldStart`, `foldEnd`)
    - Plugin: `src/fold/commands.ts` (registered motions + ex commands)
- **Fold state commands (`zn`, `zN`, `zi`, `zv`, `zF`, `zx`, `zX`)** — `zn` disables folding (opens all folds, prevents new folds). `zN` re-enables folding. `zi` toggles. `zv` opens folds to reveal cursor line. `zF` creates a fold for [count] lines. `zx`/`zX` reapply fold level (preserving manual folds). Configure via `set foldenable` / `set nofoldenable` in vimrc or `vim.opt.foldenable` in Lua.
    - Plugin: `src/fold/fold-enable.ts` (NEW — `foldEnableField` StateField, `isFoldingEnabled` guard, `zn`/`zN`/`zi` actions)
    - Plugin: `src/fold/commands.ts` (`zv`, `zF` actions)
    - Plugin: `src/fold/fold-level.ts` (`zx`, `zX` actions)
    - Plugin: `src/vim/options.ts` (`foldenable` vim option)
- **Heading fold provider with trailing blank line trimming** — custom `foldService` provider for Markdown headings that trims trailing blank lines from fold ranges, matching Neovim's treesitter fold boundaries. Overrides Obsidian's built-in `foldNodeProp`-based heading folds.
    - Plugin: `src/fold/provider.ts` (`headingFold` function added to `markdownFoldProvider`)

### Changed

- **Recursive fold operations (`zO`, `zC`, `zA`, `zD`)** — uppercase fold commands now operate recursively on all folds within the cursor's foldable region using range containment. Previously mapped identically to lowercase variants.
    - Plugin: `src/workspace/navigation.ts` (`foldOpenRecursiveAction`, `foldCloseRecursiveAction`, `foldToggleRecursiveAction`)
    - Plugin: `src/fold/commands.ts` (`foldDeleteRecursiveAction`)
- **Fold-enable guards** — fold-creating/closing actions (`zc`, `za`, `zM`, `zm`, `zf`, `zF`) respect the `foldenable` state. Unfold operations (`zo`, `zR`, `zr`, `zv`) always work regardless of `foldenable`.
    - Plugin: `src/fold/commands.ts`, `src/workspace/navigation.ts`, `src/fold/fold-level.ts`

### Tests

- 12 Neovim golden test definitions for fold motions in `test/neovim/test-definitions.ts` (`fold-motions` suite with treesitter fold setup)
- 16 E2E tests in `test/specs/vim-builtin/fold-motions.e2e.ts`: 12 golden comparison tests + 4 plugin-specific tests (operator-pending `dzj`/`dzk`, no-op without foldable regions)
- 3 known deviations registered in `test/neovim/deviations.ts`: `zk` count (treesitter fold hierarchy), `[z`/`]z` (fold body vs heading boundary)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated `zO`/`zC`/`zA` and `zn`/`zN` rows as fixed; updated golden test coverage table with new fold commands
- `CONTRIBUTING.md`: Updated `src/fold/` structure with new files
- `README.md`: Updated Folding feature description
- `docs/reference/keybindings.md`: Added Fold commands section
- `docs/features/workspace-navigation.md`: Added Fold motions, Fold state, Recursive fold sections
- `docs/configuration/settings.md`: Added `foldenable` option

## [0.114.0] - 2026-08-18

### Fixed

- **Vim engine settings fields lock after typing on iPad (and other mobile)** — the "Insert mode escape" field (and other vim engine settings like timeoutlen, operator shadow timeout) became greyed out and unresponsive after typing a single character on iPad with Magic Keyboard. Two root causes: (1) `vim.setOption()` in the `onChange` handler fired the option's `notify` callback, which called `onSettingOverride` and added the key to `vimrcOverrides` — making `isOverridden()` return `true` and `refreshDomState()` disable the field. The `clearSettingOverride()` call ran _before_ `vim.setOption()`, so the override was re-added immediately after clearing. Fixed by moving `clearSettingOverride()` to after `vim.setOption()` in both `setControlValue` (declarative/post-1.13 path) and all 9 imperative `onChange` handlers for `VIM_OPTION_KEYS` settings. (2) The initial settings sync in `reloadFeatures()` called `vim.setOption()` for non-default values (clipboard, textwidth, insertmodeescape, etc.) after `registerVimOptions()` had already set `registered = true`, causing `notify` to fire and mark these settings as overridden. Fixed by making `registerVimOptions()` return an activation function — `registered` is only set to `true` when the caller invokes it after the initial sync completes. ([#125](https://github.com/saberzero1/motions/issues/125))
    - Plugin: `src/settings.ts` (`setControlValue` — `clearSettingOverride` moved after `vim.setOption` + `refreshDomState`; 9 imperative `onChange` handlers — same reorder)
    - Plugin: `src/vim/options.ts` (`registerVimOptions` — returns `() => void` activation function instead of setting `registered = true` internally)
    - Plugin: `src/main.ts` (captures activation function, calls it after initial settings sync block)

## [0.113.0] - 2026-08-17

### Fixed

- **Cursor disappears when entering a table in source mode or raw mode** — when the cursor entered a table range in source mode or with `tableWidgetMode='raw'`, the vim cursor became invisible while editing still worked. Root cause: `mainEditorTableCursorGuard` suppressed the vim cursor whenever the cursor was in a text range matching table syntax (`findTableRanges()`), without checking whether a native table widget was actually visible. In source mode there are no `.cm-table-widget` elements; in raw mode they exist but are hidden via `display: none`. In both cases, the cursor was suppressed with no alternative cursor shown. Fixed by adding a `hasVisibleTableWidget()` check that requires at least one `.cm-table-widget` element with a non-null `offsetParent` before suppressing. The check also short-circuits the `findTableRanges()` document scan when no visible widgets exist. ([#132](https://github.com/saberzero1/motions/issues/132))
    - Plugin: `src/vim/table-cell-cursor-guard.ts` (`hasVisibleTableWidget()` function; `mainEditorTableCursorGuard.update()` — gates cursor suppression on visible widget presence)
- **Cell-edit `h`/`j`/`k`/`l` unconditionally exits to table-nav in normal mode** — when editing a table cell with table-nav enabled, pressing `h`/`j`/`k`/`l` in normal mode (after Escape from insert mode) immediately exited to table-nav and navigated to the adjacent cell, even when the cursor had room to move within the cell. Root cause: the `cellEditScope` hjkl handlers only checked `isVimIdle()` — if idle, they unconditionally called `exitCellEditToNav()` + `navigate()` without checking whether the cursor was at a cell boundary. Fixed by adding a `cursorAtCellBoundary()` method that checks cursor position against cell content bounds: `h` exits only at `ch <= 0`, `l` at `ch >= lineLen - 1`, `j` at last line, `k` at first line. When the cursor is not at the boundary, the handler returns `undefined` to let vim process the key as normal in-cell movement. ([#131](https://github.com/saberzero1/motions/issues/131))
    - Plugin: `src/vim/table-nav-controller.ts` (`cursorAtCellBoundary` method; `installCellEditScope` hjkl handlers — boundary check before `exitCellEditToNav`)

### Tests

- 5 regression tests for cursor visibility in source mode and raw table mode in `test/specs/table-cursor-source-mode.e2e.ts` (issue #132): 3 source mode tests (cursor layer state unchanged on table line, after traversal, on data row) + 2 raw mode tests (widget hidden, cursor layer stable during repeated traversal)
- 5 regression tests for cell-edit hjkl boundary behavior in `test/specs/table-nav-mode.e2e.ts` (issue #131): `l` mid-cell stays in cell, `h` mid-cell stays in cell, `l` at end exits to nav, `h` at start exits to nav, insert→Escape→`l` stays in cell
- **Systematic e2e test audit** — audited all 126 non-spike e2e test files across 8 parallel analysis passes. Fixed ~60 individual test assertions across 40 files: replaced vacuous `toContain(already-present-substring)` assertions with exact buffer equality, added register preservation checks, converted conditional early-returns to mandatory assertions or visible `this.skip()` calls, removed 2 exact duplicate tests, and fixed 10 test name/behavior mismatches.
- **Test infrastructure hardening** — 6 structural improvements to the test infrastructure:
    - Global `afterTest` hook in `wdio.conf.mts`: cleans up overlays (hint, easymotion, which-key, ex-suggest), picker modals (via Escape dispatch), generic modals (via close-button click), notices, and Vim state (double `<Esc>`) between every test. Includes verification pass that force-removes surviving elements.
    - Strict helpers in `test/helpers.ts`: `setupEditor`, `sendVimEscape`, `getEditorValue`, `getCursorPos`, `getCursorLine`, `getSelection`, `focusEditor`, `ensureLivePreview`, `ensureSourceMode` now throw with context (e.g., `"setupEditor: no MarkdownView (active leaf type: graph)"`) instead of silently returning defaults.
    - `waitUntil`-based synchronization: `setupEditor` waits for content match, `loadSingleFileWorkspace` waits for MarkdownView, `ensureLivePreview`/`ensureSourceMode` wait for mode change — replacing fixed `browser.pause()` delays.
    - Settings mutation reliability: `setPluginSetting` now awaits `saveSettings()`. New `setPluginSettingAndReload` helper sets + saves + calls `reloadFeatures()` + waits for settle.
    - Golden enforcement: `testWithNeovim` now throws `"Missing golden case"` when no golden data exists (unless the test is a known deviation), preventing silent passes.
    - Hint-mode link navigation: `findHintLabelForLink` updated to use `getBoundingClientRect()` with CSS var fallback, wider CM6 selectors (`.cm-link`, `.cm-url`, `[data-href]`), and active-leaf scoping (`.workspace-leaf.mod-active .cm-editor`).
- **Hint-mode-links fully unblocked** — 15 previously-skipped hint-mode link navigation tests now pass. Root causes fixed: (1) vault fixture files created under `test-vault/fixtures/hint-mode/` to trigger Obsidian's full rendering pipeline (CM6 link decorations, metadata cache), (2) `before()` hook warms link cache by opening all fixtures, (3) `findHintLabelForLink` scoped to active leaf's `.cm-editor`.
- **New unit tests** — 6 new unit test files (96 tests total):
    - `oil-parser.test.ts` (15 tests): buffer line parsing, id/type/name extraction, `.md` auto-append, Windows line endings, names with spaces
    - `oil-diff.test.ts` (11 tests): rename/delete/create detection, foreign ids, move resolution across multi-buffer diffs
    - `vimrc-parser.test.ts` (35 tests): all 13 command types, noremap detection, context inference, icon/color extraction, comments, multi-line parsing
    - `flash-labeler.test.ts` (10 tests): label assignment, distance sorting, 2-char labels, reuse, skipChars
    - `fold-persistence.test.ts` (7 tests): load/save round-trip, removePath, renamePath, TTL eviction, max entries eviction
    - `pair-util.test.ts` (12 tests): symmetric/asymmetric delimiters, nesting, multiline, scan limits, empty pairs
- **New e2e tests** — 3 new e2e test files (11 tests total):
    - `insert-escape.e2e.ts` (6 tests): `jk`/`jj` escape sequences, character cleanup, timeout behavior, non-matching sequences, empty config
    - `scrolloff-cursorline-smoke.e2e.ts` (4 tests): scrolloff setting persistence + cursor positioning, cursorline enable/disable cycle
    - `context-actions-smoke.e2e.ts` (1 test): `:contextactions` command opens a modal

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added cursor disappears in source/raw mode as fixed (#132); updated cross-cell navigation description — `h`/`j`/`k`/`l` now move within cell when cursor is not at boundary (#131)
- `CONTRIBUTING.md`: Updated `table-cell-cursor-guard.ts` description with `hasVisibleTableWidget()` check; updated `table-nav-controller.ts` description with `cursorAtCellBoundary` boundary check
- `docs/features/tables.md`: Added note about cursor visibility fix in source/raw mode; updated cell-edit behavior description — `h`/`j`/`k`/`l` move within cell before boundary exit
- `AGENTS.md`: Updated test helpers description (strict behavior, `waitUntil` synchronization, `setPluginSettingAndReload`); added `afterTest` hook and vault fixtures documentation; added golden enforcement description; updated unit test list
- `CONTRIBUTING.md`: Updated test infrastructure tree (vault fixtures, snippets subdirs, `test-wrapper.ts` golden enforcement); updated shared helper descriptions (strict behavior, `waitUntil`); added vault fixture and afterTest cleanup guidance to key testing rules

## [0.112.0] - 2026-08-16

### Fixed

- **Cursor shape dropdowns always disabled in Settings UI** — the 5 cursor shape dropdowns (Normal, Insert, Visual, Replace, Operator-pending) on the Appearance page were permanently disabled even when Obsidian's built-in Vim mode was off. Root cause: Obsidian's `addSettingTab()` immediately calls `getSettingDefinitions()` and caches the result for rendering and search indexing. In `onload()`, `addSettingTab()` ran before `createBundledVimExtension()`, so the `disabled` callbacks closed over `forkActive = false` (a `const` captured at the top of `getSettingDefinitions()`). The callbacks always returned `true` (disabled) regardless of the actual fork activation state. Fixed by replacing the captured `forkActive` const in all 5 `disabled` callbacks with a direct `isBundledVimActive()` call, so Obsidian's `refreshDomState()` always evaluates the current state. Additionally, `this.declarativeSettingTab.update()` is now called after `createBundledVimExtension()` to refresh the cached `getSettingDefinitions()` result — this updates the static description text which cannot use a callback. ([#128](https://github.com/saberzero1/motions/issues/128))
    - Plugin: `src/settings.ts` (5 cursor shape `disabled` callbacks — `!forkActive` → `!isBundledVimActive()`)
    - Plugin: `src/main.ts` (store setting tab reference as `declarativeSettingTab`; call `declarativeSettingTab.update()` after `createBundledVimExtension()`)
- **Animated cursor suppression not synced on `reloadFeatures()`** — `setCursorSuppressed(this.settings.animatedCursor)` was only called during initial plugin load (`onload()`), not during `reloadFeatures()`. Any runtime setting change that called `reloadFeatures()` (settings UI toggle, vimrc `set smoothcursor`, Lua `vim.opt.smoothcursor`) did not update the global cursor suppression flag in the codemirror-vim fork. The animated cursor canvas would draw but the native CM6 block cursor was not suppressed, causing both cursors to render simultaneously. Also fixed the born-broken `table-cursor-suppression.e2e.ts` test (5 of 6 failures since commit `99e5fea`) whose `enableAnimatedCursor()` helper set the setting and called `reloadFeatures()` but never triggered the global suppression. ([#127](https://github.com/saberzero1/motions/issues/127))
    - Plugin: `src/main.ts` (`reloadFeatures()` — added `setCursorSuppressed(this.settings.animatedCursor)` call)
- **Doubled cursors when animated cursor is disabled** — when animated cursor was disabled, the native CM6 text caret (thin blinking bar) appeared alongside the fork's vim cursor (block/hollow) in normal, operator-pending, and replace modes after entering and leaving insert mode. Root cause: the fork's `BlockCursorPlugin.update()` relied on a CSS `baseTheme` rule to hide native cursor layers, but mode transitions (insert removes `.cm-vimMode`, normal re-adds it) and CM6's `drawSelection` extension left native layers visible due to CSS specificity conflicts. Fixed in the fork by unconditionally hiding native CM6 cursor layers and setting `caretColor` to match the vim cursor color (`var(--interactive-accent)`) in insert mode. ([#129](https://github.com/saberzero1/motions/issues/129))
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`BlockCursorPlugin.update()` — unconditional native layer hiding, mode-aware `caretColor`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (updated `setCursorSuppressed` API section)
- **Doubled cursors in embedded editors (textarea vim overlay)** — in the textarea vim overlay, `caretColor` was the accent color instead of transparent in normal mode, causing the native text caret to appear alongside the fork's block cursor. Root cause: `BlockCursorPlugin.update()` checked the `.cm-vimMode` DOM class to determine insert/normal mode, but CM6 ViewPlugin update ordering meant the class wasn't yet present when the block cursor plugin ran. Fixed in the fork by checking `this.cm.state.vim.insertMode` directly instead of the DOM class. Also uses `setProperty("caret-color", ..., "important")` for CSS specificity robustness. ([#130](https://github.com/saberzero1/motions/issues/130))
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`BlockCursorPlugin.update()` — vim-state-based `caretColor` instead of DOM class check)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Vim-state-based caretColor" subsection)
- **Escape does not close footnote popover** — pressing Escape twice (insert→normal, then idle normal) in the footnote popover editor did not close the popover. The user had to click outside to dismiss it. Root cause: the fork's `findKey` consumed `<Esc>` unconditionally in idle normal mode, preventing the event from reaching Obsidian's popover close handler. Fixed with a two-part approach: (1) the fork now exposes `setIdleEscapeCallback(fn)` which fires when Escape is pressed in idle normal mode, and (2) the plugin registers a callback (`installEscapeGuard`) that dismisses the popover via `HoverPopover.hide()` for non-workspace-leaf editors while silently consuming Escape in workspace-leaf editors (preventing Obsidian hotkey interference). ([#130](https://github.com/saberzero1/motions/issues/130))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`setIdleEscapeCallback` API, `wasIdleNormal` pre-capture in `findKey`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added `setIdleEscapeCallback` API section)
    - Plugin: `src/vim/escape-guard.ts` (NEW — `installEscapeGuard` with `HoverPopover.hide()` dismissal)
    - Plugin: `src/main.ts` (`installEscapeGuard(this.app)` call in feature registration)
- **Invisible cursor in footnote popover with animated cursor enabled** — the animated cursor canvas (`z-index: 15`) renders behind Obsidian's popover (`z-index: 30`). The fork's vim cursor was also suppressed (global `setCursorSuppressed(true)`), resulting in no visible cursor. Fixed by detecting editors inside `.popover` or `.modal-container` in the `CursorController` and un-suppressing the fork's vim cursor for those views (`setCursorSuppressedForView(view, false)`). The animated cursor `tick()` skips rendering for above-canvas editors. ([#130](https://github.com/saberzero1/motions/issues/130))
    - Plugin: `src/vim/animated-cursor/controller.ts` (`isAboveCanvas` flag, per-view un-suppression for popover/modal editors, `tick()` early return)
- **Stale cursor suppression after animated cursor toggle** — when animated cursor was disabled at runtime, `CursorController.update()` returned early without clearing the per-view suppression override set in the constructor, leaving the fork's vim cursor hidden. Also, the constructor unconditionally suppressed the cursor regardless of `config.enabled`. Fixed by gating constructor suppression on `config.enabled` and calling `clearCursorSuppressedForView()` in the disabled early-return path. ([#130](https://github.com/saberzero1/motions/issues/130))
    - Plugin: `src/vim/animated-cursor/controller.ts` (constructor gates on `config.enabled`, `update()` clears per-view override when disabled)

### Changed

- **Internal API type safety — obsidian-typings migration (round 2)** — eliminated 23 additional `as unknown as` casts across 16 source files by leveraging `@obsidian-typings/obsidian-public-latest` v6.32.0 typed APIs. Total `as unknown as` count reduced from 90 → 67. The remaining 67 casts are inherent to plugin architecture (dynamic settings indexing, codemirror-vim fork adapter access, external plugin window globals, fengari Lua bridge, minAppVersion compatibility guards).
    - `src/util/commands.ts`: `app.commands.executeCommandById()` and `app.commands.commands` accessed directly via typed `Commands` interface; custom `ObsidianCommand` narrowed to `Pick<Command, 'id' | 'name'>`
    - `src/util/leaf.ts`: `leaf.id` and `leaf.pinned` used directly (required properties via `WorkspaceItem`/`WorkspaceLeaf` augmentation); `getViewFilePath()`/`getViewFileBasename()` use `instanceof FileView` guard instead of `as unknown as { file? }` cast
    - `src/util/vault.ts`: `ConfigItem` imported from `@obsidian-typings/obsidian-public-latest` replacing custom `VaultConfigKey` type inference
    - `src/workspace/global-defaults.ts`: `mdView.getMode()` called directly (typed as `MarkdownViewModeType`)
    - `src/editors/embeddable-editor.ts`: `app.embedRegistry` accessed directly; `editorApp.scope` accessed directly (official API); `workspace.activeEditor` assignment typed via `MarkdownFileInfo`
    - `src/oil/keybindings.ts`, `src/oil/manager.ts`: `app.internalPlugins.getEnabledPluginById('file-explorer')` returns typed `FileExplorerPluginInstance` with `revealInFolder(item: TAbstractFile)`
    - `src/oil/oil-view.ts`: `this.leaf.updateHeader()` called directly (typed on `WorkspaceLeaf` augmentation)
    - `src/oil/manager.ts`: `app.openWithDefaultApp(path)` called directly (typed on `App` augmentation)
    - `src/vim/native-table-adapter.ts`: `EditMode` type extends `MarkdownEditView` instead of `Record<string, unknown>`; `view.editMode` accessed directly; `isInLivePreview()` uses `view.getMode()` + `editMode.sourceMode` instead of `getState()` cast; `getEditModeForView()` uses `instanceof MarkdownView` guard
    - `src/vim/table-cell-cursor-guard.ts`: `mdView.editor.cm` accessed directly (typed as `EditorView` via `Editor` augmentation)
    - `src/ui/global-ex-command.ts`: `this.inputEl` accessed directly (official `SuggestModal.inputEl`)
    - `src/lua/loader.ts`: `view.getViewType()` called directly (official `View` API) — 3 instances
    - `src/settings.ts`: `this.display()` and `this.refreshDomState()` — reverted, casts retained to bypass `obsidianmd/no-unsupported-api` and `@typescript-eslint/no-deprecated` lint rules (plugin `minAppVersion` is 1.7.2; these APIs require/deprecate at 1.13.0)
    - `src/picker/sources/tasks.ts`: `app.plugins.plugins['obsidian-tasks-plugin']` accessed directly via typed `Plugins` interface

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated cursor shapes section with `addSettingTab()` caching fix (#128); added doubled cursors fix (#129); added #130 fixes (doubled cursors in embedded editors, Escape popover dismiss, invisible cursor in popovers, stale cursor suppression)
- `AGENTS.md`: Updated codemirror-vim fork cursor suppression description (vim-state-based `caretColor`, `setIdleEscapeCallback` API)
- `CONTRIBUTING.md`: Added `escape-guard.ts` to codebase structure; updated `controller.ts` description with `isAboveCanvas` flag and popover/modal fallback
- `docs/features/animated-cursor.md`: Updated embeddable editors section with popover/modal fallback and z-index explanation
- Fork `DIFFERENCES.md`: Added `setIdleEscapeCallback` API section; added "Vim-state-based caretColor" subsection; updated `findKey` Escape handling description

## [0.111.0] - 2026-08-16

### Added

- **Table-nav overlay mode** — when the cursor enters a table in Live Preview, a navigation overlay activates, allowing cell navigation with `h`/`j`/`k`/`l` without entering the cell editor. Supports structural commands (`o`/`O`, `dd`, `dc`, `J`/`K`, `H`/`L`, `I`/`A`, `=`) and cell editing entry via `i`/`a`/`c`/`s`/`Enter`. Escape exits table-nav. Fork-only feature.
    - Plugin: `src/vim/table-nav-controller.ts` (KeyScope-based interception, fresh `cmTile.widget` references, hidden cell editor during navigation)
    - Plugin: `src/vim/table-nav-state.ts` (overlay state tracking)
    - Plugin: `src/vim/table-nav-keymap.ts` (navigation and structural command mappings)
    - Plugin: `src/vim/native-table-adapter.ts` (extended with overlay support)
    - Styles: `styles.css` (overlay and hidden editor styling)

### Changed

- **`table-cell-cursor-guard.ts`** — now checks `isTableNavActive()` to avoid cursor suppression conflicts during table navigation.
- **Cross-cell motions decoupled from table-nav** — `applyTableCellMotions()` (h/j/k/l cross-cell navigation in native cell editors) is now gated on `tableWidgetMode === 'native'` only, independent of `enableTableNav`. Previously required both `enableTableNav` and `tableWidgetMode === 'native'`. This enables a third usage mode: native table editor with vim cell editing and cross-cell navigation, without the table-nav overlay. The `enableTableNav` setting now controls only the nav overlay and structural motions (`]|`/`[|`, `]c`/`[c`).
    - Plugin: `src/main.ts` (both `onload` and `reloadFeatures` paths — removed `enableTableNav` from `applyTableCellMotions` gate)
    - Plugin: `src/settings.ts` (updated `enableTableNav` description in both declarative and imperative settings UI)

### Fixed

- **Cursor snaps back to table after exiting table-nav** — after navigating/editing in table-nav mode and exiting, the cursor could snap back to the last table cell position. Root cause: `exitTable()` called `placeCursorAround()` before `destroyTableCell()`, and Obsidian's cell editor destruction triggers internal blur/focus/selection side-effects that overrode the cursor position. Fixed by reordering: destroy the cell editor first, then defer `placeCursorAround()` to `requestAnimationFrame` so Obsidian's teardown handlers finish before the final cursor placement.
    - Plugin: `src/vim/table-nav-controller.ts` (`exitTable` — destroy-before-place, deferred cursor placement via `window.requestAnimationFrame`)
- **Cell-editor normal-mode navigation bypasses table-nav** — when in a cell editor in normal mode (Escape pressed once to exit insert, but not again to exit cell edit), `j`/`k`/`h`/`l` at cell boundaries crossed to adjacent cells via the motion overrides, bypassing the table-nav controller. This left table-nav in an inconsistent state. Fixed by registering `h`/`j`/`k`/`l` key handlers on the `cellEditScope` (Obsidian `Scope`). When vim is idle in the cell editor, these handlers exit to nav mode and navigate within the overlay. The Scope fires before vim's key observer, so the keys are intercepted before the motion overrides run.
    - Plugin: `src/vim/table-nav-controller.ts` (`installCellEditScope` — added `h`/`j`/`k`/`l` handlers that check `isVimIdle` and call `exitCellEditToNav` + `navigate`)
- **Cursor flashing in Normal mode after table interaction** — the table cursor guard and table-nav controller used `setCursorSuppressedForView(view, false)` to unsuppress the cursor when leaving a table. This sets an explicit per-view override that conflicts with the animated cursor controller's global suppression (`setCursorSuppressed(true)`), causing the native CM6 cursor to become visible and flash alongside the canvas cursor. Additionally, `mainEditorTableCursorGuard.destroy()` did not restore suppression state when the cursor was inside a table at destruction time, leaving a stale `true` override through plugin recreation. `cellEditorCursorGuard.update()` force-unsuppressed the cell cursor on every update cycle (same anti-pattern removed from `CursorController` in commit 62444df). All unsuppress paths now use `clearCursorSuppressedForView()` (which removes the per-view override, falling back to global state) instead of `setCursorSuppressedForView(view, false)`. ([#127](https://github.com/saberzero1/motions/issues/127))
    - Plugin: `src/vim/table-cell-cursor-guard.ts` (`mainEditorTableCursorGuard` — added constructor to store view reference; `destroy()` now clears per-view override and resumes animated cursor when `cursorInTable` is true; `update()` uses `clearCursorSuppressedForView` when leaving table; `cellEditorCursorGuard` — removed per-update `setCursorSuppressedForView(cellView, false)` force-unsuppress; `destroy()` uses `clearCursorSuppressedForView` for parent)
    - Plugin: `src/vim/table-nav-controller.ts` (`enterCellEdit`, `exitTable`, `destroy` — all use `clearCursorSuppressedForView` instead of `setCursorSuppressedForView(view, false)`)
    - Plugin: `src/vim/bundled-vim.ts` (exposed `isCursorSuppressedForView` on `CodeMirrorAdapter` bridge for test access)

### Tests

- 6 regression tests for cursor suppression after table interaction in `test/specs/table-cursor-suppression.e2e.ts` (issue #127)
- Rewrote `test/specs/table-cell-vim-mode.e2e.ts` "Native table cell navigation" suite for table-nav architecture: nav-mode highlight position checks (j/k/h/l), entry/exit tests (Escape, i→cell edit→Escape→nav), dd row deletion in nav mode, re-entry test (j back into table re-activates table-nav), cursor stability test (exit + insert mode round-trip doesn't snap cursor back). Replaced "Settings gating" suite with "Table mode combinations" covering all 3 modes: native+tablenav (overlay activates), native+notablenav (cross-cell j/k/h/l works without overlay), raw (widget hidden)
- Fixed 3 spike test files (`spike-table-fresh-ref`, `spike-cell-introspect`, `spike-table-nav-overlay`) by disabling table-nav in `before` hooks so cell editor introspection tests can access `editMode.tableCell` directly
- Fixed `spike-table-nav-overlay` editorInfoField test: use `obsidian.editorInfoField` from `executeObsidian` callback instead of `window.require('obsidian')`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added cursor-snap fix; updated table widget section with 3-mode table; updated cross-cell motion decoupling
- `AGENTS.md`: Updated `table-nav-controller.ts` description with deferred exit flow; updated table-cell-motions gating
- `CONTRIBUTING.md`: Updated `table-nav-controller.ts` and `table-cell-motions.ts` descriptions
- `README.md`: Updated table editing feature description with 3 mode combinations
- `docs/features/tables.md`: Updated table widget section with 3-mode architecture; clarified enableTableNav vs cross-cell motions
- `docs/configuration/settings.md`: Updated `enableTableNav` description

## [0.110.0] - 2026-08-14

### Added

- **Animated cursor: cross-cell position handoff** — when navigating between table cells via `h`/`j`/`k`/`l`, a token-based handoff seeds the new cell's `CursorController` with the previous cell's screen position via the `AnimatedCursorManager` singleton. The handoff infrastructure is in place but the canvas transition animation is not visible due to CSS stacking contexts (the canvas at `position: fixed` on `.app-container` renders behind table cell content). The native vim cursor (`BlockCursorPlugin`) serves as the steady-state renderer inside cells. See KNOWN_LIMITATIONS.md for details.
    - Plugin: `src/vim/animated-cursor/manager.ts` (`CellCrossingHandoff` interface, `createCrossingToken`/`storeCrossingHandoff`/`consumeCrossingHandoff` methods, `signalCellCrossing`/`getPendingCrossingToken`/`clearPendingCrossingToken` module-level functions)
    - Plugin: `src/vim/animated-cursor/controller.ts` (`cellTransitionActive` flag, crossing token consumption in constructor, position handoff in destroy, cell-aware tick/update that skips canvas drawing when no transition is active)
    - Plugin: `src/vim/table-cell-motions.ts` (`signalCellCrossing()` call in `scheduleCrossing`)
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (table cell override documented in DIFFERENCES.md)
    - Styles: `styles.css` (animated cursor canvas z-index bumped from 5 to 15)

### Changed

- **Table editing: migrated to native Obsidian table editor** — the plugin no longer suppresses Obsidian's `cm-table-widget` or provides custom cell editors. In Live Preview, Obsidian's native table editor handles cell editing, pipe escaping, wikilinks, cursor positioning, and `<br>` conversion. Vim is injected into native cell editors via `registerEditorExtension()`. The `tableWidgetMode` setting is simplified from 4 values (`off`/`cursor`/`always`/`embedded`) to 2 (`native`/`raw`). Old values are automatically migrated.
    - Removed: `src/vim/table-widget-suppressor.ts` (`RangeSetBuilder` monkey-patch)
    - Removed: `src/vim/table-render-widget.ts` (custom widget)
    - Removed: `src/vim/table-nav-controller.ts` (custom nav state machine)
    - Removed: `src/vim/table-cell-editor.ts` (custom cell editors)
    - Removed: `src/vim/table-embedded-editor.ts` (configuration bridge)
    - Added: `src/vim/table-nav-overlay.ts` (native `TableEditor` API overlay)
    - Added: `src/vim/native-table-adapter.ts` (typed abstraction layer)
    - Added: `src/types/table-editor.d.ts` (runtime-discovered typings for 55 native methods)

### Fixed

- **Escape in hint mode exits embedded vim editor** — pressing Escape to dismiss hint mode while inside an embedded vim editor (textarea vim overlay, Oil explorer, table cell editor) also exited the embedded editor. Root cause: Obsidian's `Scope` keymap handlers fire independently of DOM event propagation — `stopPropagation()` in hint mode's capture-phase listener does not prevent the Scope handler from receiving the event. The embedded editor's Scope handler checked `isVimIdle()` (which returns `true` during hint mode, since hint mode is a plugin-level overlay, not a vim state) and called `onEscape()`. Fixed by adding a guard in the embedded editor's Escape handler that checks `isHintModeActive()`, `isEasyMotionActive()`, and `isFlashActive()` before evaluating `isVimIdle()`. ([#126](https://github.com/saberzero1/motions/issues/126))
    - Plugin: `src/editors/embeddable-editor.ts` (Scope Escape handler — modal overlay active guard before `isVimIdle()` check)
- **Wikilinks in table cells work correctly** — cursor displacement when typing `[[` in table cells is fixed. The native editor handles wikilink rendering at the decoration layer, eliminating the sub-CM6 cursor displacement that affected the old custom widget.
- **Pipe character (`|`) no longer swallowed in table cells** — the native editor automatically escapes `|` as `\|` in the document source. Previously, Obsidian's DOM-level table editor intercepted `|` before CM6's input pipeline.
- **`<br>` conversion handled natively** — newlines in table cells are automatically converted to/from `<br>` by the native editor. The `cellBrToNewline`/`cellNewlineToBr` utilities are removed.
- **Embedded table: Obsidian shortcuts (Ctrl+P, Cmd+O) now work in cell selection mode** — modifier key combos in table-nav mode now call `e.stopPropagation()` to prevent vim's `eventObservers.keydown` from consuming them as cursor movement, then manually feed the event to Obsidian's keymap system via `app.keymap.onKeyEvent(e)`. This two-step approach blocks vim (which would process `<C-p>` as cursor-up) while still triggering Obsidian's hotkey bindings (command palette, file switcher, custom hotkeys). Uses the unofficial `Keymap.onKeyEvent` API from `obsidian-typings`. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`handleTableNavKey` — `stopPropagation` + `app.keymap.onKeyEvent` for modifier combos)
- **Embedded table: ex command dialog keys no longer consumed by table-nav** — when vim's ex command dialog is open (after pressing `:`), table-nav keys like `h`, `j`, `k`, `l`, `a`, `i`, `c` are no longer intercepted by the table-nav handler. The handler now checks `adapter.state.dialog` and returns early when a dialog is active. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`handleTableNavKey` — `adapter.state.dialog` check)
- **Insert mode escape sequence and other vim engine settings not applied after restart** — six vim engine settings (insertmodeescape, insertmodeescapetimeout, operatorshadowtimeout, tabstop, shiftwidth, expandtab) configured via the Settings UI were not synced to the vim engine on plugin load. Only clipboard, textwidth, and pcre were synced at startup. The remaining settings were stored in `data.json` but never pushed to `vim.setOption()` during initialization, so they silently reverted to defaults on every Obsidian restart. The vimrc/Lua code path was unaffected because it calls `vim.setOption()` directly. Additionally, on Obsidian 1.13+, the declarative settings system (`setControlValue`) did not forward any of the 9 vim engine settings to `vim.setOption()` — only the pre-1.13 imperative `onChange` handlers did. ([#125](https://github.com/saberzero1/motions/issues/125))
    - Plugin: `src/main.ts` (added init sync for insertmodeescape, insertmodeescapetimeout, operatorshadowtimeout, tabstop, shiftwidth, expandtab after `registerVimOptions()`)
    - Plugin: `src/settings.ts` (`VIM_OPTION_KEYS` static set; `setControlValue` forwards vim engine settings to `vim.setOption()` with `setClipboardOption`/`setTextwidth` side effects)

### Tests

- 1 regression test for hint mode Escape in `test/specs/textarea-vim.e2e.ts` (issue #126): Escape in hint mode dismisses hint overlay but does not exit the textarea vim overlay — verified to fail without the modal overlay guard
- 1 regression test for modifier combo in `test/specs/table-cell-vim-mode.e2e.ts`: modifier combo does not move cursor during cell selection
- 1 regression test for ex dialog in `test/specs/table-cell-vim-mode.e2e.ts`: keys with table-nav meaning do not change active cell when ex dialog is open (verified to fail without dialog check)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added hint mode Escape fix to textarea vim Escape behavior section (#126)
- `AGENTS.md`: Updated embeddable-editor description with modal overlay active guard
- `CONTRIBUTING.md`: Updated embeddable-editor description with modal overlay active guard
- `docs/features/hint-mode.md`: Added note about embedded editor Escape isolation
- `KNOWN_LIMITATIONS.md`: Updated vim engine settings section — all 9 settings now synced at init (was 3); added declarative settings forwarding fix for Obsidian 1.13+ (#125)
- `KNOWN_LIMITATIONS.md`: Added animated cursor cross-cell transition as known limitation in table cell vim modality section
- `CONTRIBUTING.md`: Added `table-cell-motions.ts` and `table-cell-cursor-guard.ts` to codebase structure; updated `manager.ts` with cross-cell handoff API; updated `controller.ts` with cell transition architecture
- `AGENTS.md`: Updated animated cursor page ownership (unchanged — `features/animated-cursor.md`)
- `docs/features/animated-cursor.md`: Updated embeddable editors section with cross-cell transition details and known limitation
- `docs/features/tables.md`: Added animated cursor note to cell editor section
- Fork `DIFFERENCES.md`: Added table cell override section documenting BlockCursorPlugin's unsuppress behavior for `.cm-table-widget` editors

## [0.109.1] - 2026-08-13

### Fixed

- **Embedded table: modifier key combos (Ctrl+P, Cmd+O) consumed by vim during cell selection** — modifier key combos in table-nav mode now call `e.stopPropagation()` to prevent vim's `eventObservers.keydown` from processing them as cursor movement commands (e.g., `<C-p>` mapped to cursor-up). Previously, pressing `Ctrl+P` in cell selection mode moved the cursor up instead of opening the command palette. The `stopPropagation()` blocks the event from reaching vim's observer on the CM6 editor element while allowing Obsidian's hotkey system (which uses Electron's `before-input-event`) to handle it. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`handleTableNavKey` — `stopPropagation()` for modifier key combos)

## [0.109.0] - 2026-08-12

### Added

- **Embedded table: click-to-select cell** — clicking a cell in the embedded table widget now selects that cell in table-nav mode. Works both when table-nav is already active (updates active cell) and when clicking from outside the table (enters table-nav at the clicked cell). The click handler is registered on the widget DOM via a module-level `setTableWidgetCellClickHandler` callback, coordinated between `table-render-widget.ts` and `table-nav-controller.ts`. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-render-widget.ts` (`setTableWidgetCellClickHandler`, click handler in `toDOM` for embedded mode)
    - Plugin: `src/vim/table-nav-controller.ts` (constructor registers callback; `pendingClickCell` field for deferred cell selection on table-nav entry)

### Fixed

- **Embedded table: click-outside handler exits table-nav during modal interaction** — the capture-phase `mousedown` listener now checks for `.modal-container` in the DOM before calling `exitTable()`. Previously, opening a modal (command palette, picker, settings) while in table-nav mode caused the click-outside handler to fire on the modal overlay, exiting table-nav and showing raw markdown. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`installClickOutsideHandler` — modal container check + `target.closest('.modal-container')` guard)
- **Embedded table: header-only tables (no data rows) no longer enter table-nav** — tables with only a header and separator row (e.g., `| H |\n|---|`) are now skipped by `checkEntry()`. Previously, entering such a table activated table-nav with only the header row navigable, which was confusing. ([#121](https://github.com/saberzero1/motions/issues/121))
    - Plugin: `src/vim/table-nav-controller.ts` (`checkEntry` — `hasDataRow` check before `enterTableNav`)

### Tests

- 1 regression test for click-to-select in `test/specs/table-cell-vim-mode.e2e.ts`: clicking a cell updates active cell highlight to clicked position (verified to fail without handler)
- 1 regression test for header-only table in `test/specs/table-cell-vim-mode.e2e.ts`: header-only table does not enter table-nav (verified to fail without data-row check)
- 1 regression test for click-outside table in `test/specs/table-cell-vim-mode.e2e.ts`: cursor leaving table exits table-nav

## [0.108.0] - 2026-08-12

### Added

- **`@obsidian-typings/obsidian-public-latest` devDependency** — added community-maintained type definitions for Obsidian's internal APIs. Replaces ~50 unsafe `as unknown as` casts across 13 source files with properly typed access to `editor.cm`, `app.keymap`, `app.plugins`, `app.vault.getConfig()`, `app.metadataCache.resolvedLinks`, `WorkspaceLeaf.id`/`.pinned`, and more. Build-only dependency — no runtime impact.
    - Plugin: `package.json` (`@obsidian-typings/obsidian-public-latest` devDependency)
    - Plugin: `tsconfig.json` (`"types": ["@obsidian-typings/obsidian-public-latest"]`)
    - Plugin: `src/util/editor.ts`, `src/util/keymap.ts`, `src/util/leaf.ts`, `src/util/metadata.ts`, `src/util/vault.ts`, `src/ui/global-ex-command.ts`, `src/ui/hint-mode.ts`, `src/workspace/commands.ts`, `src/lua/loader.ts`, `src/main.ts`, `src/vim/vim-api.ts`, `src/picker/sources/dataview.ts` (cast removal)

### Fixed

- **Obsidian native highlights not cleared on Escape** — Obsidian's `is-flashing` highlights (shown after following an internal link to a heading like `[[Note#heading]]`) now clear when Escape is pressed in normal mode. Previously, these highlights persisted until the user clicked elsewhere. Uses the unofficial `editor.removeHighlights('is-flashing')` API (documented in obsidian-typings, used by obsidian-quiet-outline and others). ([#122](https://github.com/saberzero1/motions/issues/122))
    - Plugin: `src/vim/mode-tracker.ts` (`clearNativeHighlights` method; `vim-keypress` handler clears `is-flashing` on `<Esc>` in normal mode)
- **Chord display breaks during surround commands** — the status bar chord display now correctly accumulates all pending keystrokes during multi-key surround commands like `ysiwb`, `cs"(`, `yss"`, and count-prefixed variants like `2ysiw*`. Previously, the chord disappeared after the surround sub-state was entered (e.g., `ys` showed correctly but `ysi` was blank). ([#123](https://github.com/saberzero1/motions/issues/123))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`processAction` — saves and restores `vim.status` around `clearInputState` when `vim.surroundState` is pending; `handleSurroundSubState` — clears `vim.status` on surround completion)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Chord display preservation during surround sub-state" section)
- **Embedded table: table-nav key handler suppressed during modals** — `handleTableNavKey` and `handleCellEditKey` now check for `.modal-container` in the DOM and return immediately when a modal (picker, command palette, settings) is open. Previously, keys typed into a picker input while in cell selection mode were consumed by the table handler (`a` entered cell edit, `s` substituted, etc.). ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`handleTableNavKey` and `handleCellEditKey` — modal container check)
- **Cursor-aware table: cursor displacement guard for header-row jump** — a `transactionFilter` (`tableCursorGuard`) intercepts CM6 transactions that reposition the cursor to the table header row when the user was editing a data row. This prevents Obsidian's Live Preview from snapping the cursor to the header during table creation or editing. Only active in cursor-aware mode (not embedded mode). ([#121](https://github.com/saberzero1/motions/issues/121))
    - Plugin: `src/vim/table-render-widget.ts` (`tableCursorGuard` transaction filter, separated from `Prec.high` StateField)

### Tests

- 2 e2e tests in `test/specs/native-highlight-escape.e2e.ts` (issue #122): Escape in normal mode clears `is-flashing` highlight, Escape without highlights does not error
- 7 e2e tests in `test/specs/surround-chord-display.e2e.ts` (issue #123): `ysiwb`/`ysiw"`/`yse)` chord accumulation at each keystroke, `yss"` chord accumulation, `ds"` chord (passing baseline), `cs"(` chord accumulation, `2ysiw*` count-prefixed chord accumulation

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added #122 native highlight clearing as fixed; updated chord display section with surround sub-state fix (#123)
- `AGENTS.md`: Added `@obsidian-typings/obsidian-public-latest` to environment & tooling; updated mode-tracker description with `clearNativeHighlights`
- `CONTRIBUTING.md`: Updated utility function descriptions to reflect typed access via obsidian-typings; updated mode-tracker description

## [0.107.0] - 2026-08-12

### Fixed

- **Embedded table: cannot leave table downwards on last line** — pressing `j` at the last data row when the table is at the end of the document now inserts a newline and moves the cursor below the table instead of getting stuck. ([#119](https://github.com/saberzero1/motions/issues/119))
    - Plugin: `src/vim/table-nav-controller.ts` (`exitTableAtBoundary` — inserts `\n` when table is on last line instead of dispatching to `doc.length`)
- **Embedded table: unhandled keys swallowed in cell selection mode** — the table-nav key handler previously consumed ALL keys with `preventDefault()`/`stopPropagation()`. Now only consumes keys the handler actually processes; unhandled keys propagate to vim. Enables leader key sequences, which-key popups, and other vim key bindings during cell selection. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`handleTableNavKey` — `handled` flag gates `preventDefault`/`stopPropagation`; `pendingD` default case propagates instead of consuming)
- **Embedded table: which-key popups in cell selection mode** — a `WhichKeyOverlay` instance is now attached during table-nav mode using the main editor's vim adapter. Previously only available in cell-edit mode. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`attachNavWhichKey`/`detachNavWhichKey`, `setTableNavWhichKeyConfig`)
    - Plugin: `src/vim/table-embedded-editor.ts` (re-exports `setTableNavWhichKeyConfig`)
    - Plugin: `src/main.ts` (wires `embeddedWhichKeyConfig` to table-nav controller)
- **Embedded table: picker focus stays on table widget** — the `setActiveLeaf` override in `embeddable-editor.ts` now allows focus transfer when a modal is open by checking for `.modal-container` in the DOM. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/editors/embeddable-editor.ts` (`setActiveLeaf` override — modal container check)
- **Embedded table: clicking outside table does not exit table-nav** — a capture-phase `mousedown` listener on `activeDocument` exits table-nav when clicks land outside the widget. ([#121](https://github.com/saberzero1/motions/issues/121))
    - Plugin: `src/vim/table-nav-controller.ts` (`installClickOutsideHandler`/`removeClickOutsideHandler`)
- **Embedded table: stale table-nav state after document replacement** — the ViewPlugin's `update()` now detects when `docChanged` fires and the cursor is no longer in a table, exiting table-nav gracefully. ([#119](https://github.com/saberzero1/motions/issues/119), [#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`update` — stale state check on `docChanged`)
- **Embedded table: cursor displacement when entering table-nav** — `setActiveEditTableRange()` is now called before `this.view.dispatch()` in `enterTableNav()`, preventing decoration rebuild from snapping the cursor to the header row. ([#121](https://github.com/saberzero1/motions/issues/121))
    - Plugin: `src/vim/table-nav-controller.ts` (`enterTableNav` — reordered `setActiveEditTableRange` before dispatch)
- **Embedded table: Escape in table-nav uses Obsidian Scope** — table-nav mode now installs an Obsidian `Scope` with an Escape handler (matching the cell-editor pattern), in addition to the DOM capture-phase handler. ([#120](https://github.com/saberzero1/motions/issues/120))
    - Plugin: `src/vim/table-nav-controller.ts` (`installNavScope`/`removeNavScope`)

### Tests

- Unblocked 13 previously-skipped embedded table widget e2e tests in `test/specs/table-cell-vim-mode.e2e.ts` — root cause: missing `browser.reloadObsidian()` and table-only document content preventing widget rendering. All cell editing tests (two-Escape, entry modes, register sharing, `<br>` round-trip, multi-table navigation) now pass.
- 2 regression tests for #119 in `test/specs/table-cell-vim-mode.e2e.ts`: `j` at last row exits table at end of document, cursor usable after exit
- 2 regression tests for #120 in `test/specs/table-cell-vim-mode.e2e.ts`: Escape in cell selection mode (skipped — WDIO DOM Escape routing limitation), unhandled keys not swallowed
- 3 regression tests for #121 in `test/specs/table-cell-bridge.e2e.ts`: `j` moves through proper table rows, cursor not stuck on header, cursor not jumping back

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked 7 table widget sub-issues as fixed (#119, #120, #121); updated embedded table e2e test coverage note
- `AGENTS.md`: Updated table-nav-controller description with click-outside handler, Scope-based Escape, which-key in table-nav, stale state cleanup
- `CONTRIBUTING.md`: Updated `table-nav-controller.ts` description

## [0.106.0] - 2026-08-11

### Fixed

- **Bundled `table`/`table3` snippets missing trailing newline** — the `$0` final tabstop was inline on the last table row. When a table was inserted at the end of a document, there was no line below it, preventing cursor movement past the table. Fixed by adding a standalone `$0` as a separate final body element, matching the pattern used by the `Frontmatter` snippet. ([#118](https://github.com/saberzero1/motions/issues/118))
    - Plugin: `src/snippets/bundled/obsidian-markdown.json` (`Table 2x2`, `Table 3x3` — moved `$0` from inline on last row to standalone final element)
- **User-defined snippets duplicate bundled snippets instead of overriding them** — when a user defined a snippet with the same prefix as a bundled one (e.g., `table`), both appeared in the completion menu and picker instead of the user snippet replacing the bundled one. Root cause: `addToPrefixIndex()` in `SnippetRegistry` inserted user entries before bundled entries but never removed the bundled entry, and entry IDs were source-qualified (`bundled:Table 2x2` vs `user:My Table`) so both coexisted in the `entries` Map. Fixed with priority-based override logic (`user > lua > bundled`): when a higher-priority source registers a prefix colliding with a lower-priority entry, the lower-priority entry is removed from the prefix index and, if orphaned (no remaining prefixes), from the entries Map. ([#118](https://github.com/saberzero1/motions/issues/118))
    - Plugin: `src/snippets/registry.ts` (`sourcePriority` static method; `addToPrefixIndex` rewritten with priority-based filtering, orphan cleanup, and priority-sorted insertion)

### Tests

- 10 unit tests in `test/unit/snippets/registry.test.ts` (issue #118): basic load and prefix indexing, user overrides bundled, lua overrides bundled, user overrides lua, full priority chain (`user > lua > bundled`), same-priority coexistence, multi-prefix partial overlap (keeps non-overlapping prefix), multi-prefix full overlap (removes orphaned entry), no-collision coexistence, bundled table snippet trailing newline validation
- 7 e2e tests in `test/specs/snippets/snippet-override.e2e.ts` (issue #118): `table` snippet trailing newline via Tab, `table3` snippet trailing newline via `:snippet`, table at end of document produces content after last row, user override expands correct body, `lookupByPrefix` returns only user entry, `getAll` excludes shadowed bundled entry, non-overridden bundled snippet still works

### Documentation

- `CHANGELOG.md`
- `CONTRIBUTING.md`: Added `registry.ts` to snippets codebase structure with priority-based override description
- `docs/features/snippets.md`: Expanded override behavior documentation with priority order and Lua snippet override semantics

## [0.105.1] - 2026-08-11

### Fixed

- **Embedded table mode: cursor jumps to first table after cell edit** — follow-up to the multi-table fix in 0.105.0. After editing a cell in the second (or later) table and pressing Escape twice, the cursor jumped back to the first table. Two sub-bugs: (1) `activeEditTableRange` was cleared before `closeCellEditor`/`tableRealign` dispatches, causing `buildDecorations` to create a `Decoration.replace` for the active table and displacing the cursor — fixed by keeping `activeEditTableRange` set throughout the exit and refresh lifecycle. (2) After `tableRealign`, `doRefreshAfterOp` used `Array.find()` with a 200-position threshold to re-locate the table, which returned the first table within range rather than the closest — fixed by replacing with a nearest-match loop. ([#117](https://github.com/saberzero1/motions/issues/117))
    - Plugin: `src/vim/table-nav-controller.ts` (`exitCellEdit` — removes premature `setActiveEditTableRange(null)` clear; `doRefreshAfterOp` — sets `activeEditTableRange` before `tableRealign` dispatch, replaces `Array.find` with nearest-match loop for post-realign table re-location)

### Tests

- 4 e2e test cases in `test/specs/table-cell-vim-mode.e2e.ts` (issue #117, skipped — embedded widget rendering limitation in WDIO): entry into second table highlights correct widget, cell editor opens on second table not first, add row affects only second table, first table unaffected during second table navigation

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated multi-table fix with `activeEditTableRange` lifecycle and `Array.find` nearest-match fixes
- `CONTRIBUTING.md`: Updated `table-nav-controller.ts` description
- `docs/features/tables.md`: Added multi-table support note to embedded mode section

## [0.105.0] - 2026-08-11

### Added

- **Which-key popups in embedded editors** — which-key hints now appear in table cell editors (embedded mode) and textarea vim overlays. The popup renders in the parent note's viewport using the same position and styling as the main editor's which-key. User keymaps (vimrc, Lua) are fully available since the codemirror-vim keymap is global. Bundled vim mode only — embedded editors in built-in vim mode do not receive vim and are silently skipped.
    - Plugin: `src/ui/which-key.ts` (`WhichKeyConfig` exported interface; `WhichKeyOverlay.forEmbeddedEditor()` static factory for dependency injection; `attach()` injected-mode early return; `showOverlay()` injected container fallback with status-bar padding guard; `onKeyPressGeneral()` delay bypass for embedded editors; `detachAdapter()` try/catch for destroyed adapters; `destroy()` clears injected references)
    - Plugin: `src/vim/table-cell-editor.ts` (`setCellEditorWhichKeyConfig()` exported setter; `openCellEditor()` deferred which-key creation via `setTimeout(0)`; `closeCellEditor()` which-key cleanup before editor destroy)
    - Plugin: `src/vim/textarea-vim-manager.ts` (`whichKeyConfig` class field; `updateOptions()` extended with which-key config; `ActiveReplacement.whichKey` field; `replace()` deferred which-key creation with `.view-content` → `.modal-container` fallback; `teardownActive()` which-key cleanup)
    - Plugin: `src/main.ts` (`WhichKeyConfig` import; `setCellEditorWhichKeyConfig` import; embedded config construction and wiring after `WhichKeyOverlay` creation)

### Fixed

- **Embedded table mode does not handle multiple tables per note** — in embedded table widget mode (`set tablewidget=embedded`), when a note contained two or more tables, entering table-nav mode on any table other than the first always attached the cell highlight, key handlers, and cell editor to the first table's DOM widget. Entering from below selected the last cell of the first table. Root cause: `findWidgetEl()` in `table-nav-controller.ts` queried all `.vim-table-rendered` elements and returned the first match without considering which `TableRange` the cursor was in. Fixed by adding a `tableFrom` parameter to `findWidgetEl()` and using CM6's `view.posAtDOM()` to correlate each widget element with its document position, returning the nearest match to the active table's `from` offset. ([#117](https://github.com/saberzero1/motions/issues/117))
    - Plugin: `src/vim/table-nav-controller.ts` (`findWidgetEl` — accepts optional `tableFrom` parameter, uses `posAtDOM` nearest-match with `try/catch` for detached elements; `enterTableNav` — passes `table.from` explicitly; `devAssert` import and `__DEV__` assertion verifying widget position matches active table)
- **Enter in embedded table cell editor breaks table structure** — pressing Enter in insert mode inside an embedded table cell editor (`set tablewidget=embedded`) inserted a literal newline into the cell content. Upon exiting the table, the multi-line content was written back into the single-line markdown table row, breaking the table structure — the second line appeared outside the table. Fixed by converting newlines to `<br>` tags on cell editor close and converting `<br>` tags back to newlines on cell editor open, preserving multi-line cell content using standard HTML line breaks that Obsidian renders correctly within table cells. Existing `<br>` content in cells round-trips cleanly. ([#115](https://github.com/saberzero1/motions/issues/115))
    - Plugin: `src/vim/table-utils.ts` (`cellBrToNewline`, `cellNewlineToBr` — new pure utility functions for `<br>` ↔ newline conversion)
    - Plugin: `src/vim/table-cell-editor.ts` (`openCellEditor` — converts `<br>` to newlines on open; `closeCellEditor` — converts newlines to `<br>` on close)

### Tests

- 4 e2e test cases in `test/specs/table-cell-vim-mode.e2e.ts` (issue #117, skipped — embedded widget rendering limitation in WDIO): entry into second table highlights correct widget, cell editor opens on second table not first, add row affects only second table, first table unaffected during second table navigation
- 8 e2e tests in `test/specs/textarea-vim-which-key.e2e.ts`: which-key appears after partial chord (`d`, `g`) in normal mode, dismisses on command completion (`dd`), dismisses on Escape, suppressed in insert mode, suppressed when `whichKeyMode` is off, cleans up on editor close (blur), cleans up on modal removal
- 14 unit tests in `test/unit/table-cell-br.test.ts` (issue #115): `cellBrToNewline` (7 tests — `<br>`, `<br/>`, `<br />`, case-insensitive, multiple tags, no-op, empty string), `cellNewlineToBr` (4 tests — single/multiple newlines, no-op, empty string), round-trip (3 tests — newline→br→newline, br→newline→br, mixed markdown content)
- 2 e2e test cases in `test/specs/table-cell-vim-mode.e2e.ts` (issue #115, skipped — embedded widget rendering limitation in WDIO): Enter in cell editor produces `<br>` and keeps table valid, round-trip of existing `<br>` in cell content

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked multi-table widget selection as fixed with `posAtDOM` position matching; marked Enter-in-cell-editor table breakage as fixed with `<br>` conversion; added which-key in embedded editors note to table cell section
- `CONTRIBUTING.md`: Updated `table-nav-controller.ts` description with `posAtDOM`-based widget matching for multi-table support; updated `table-utils.ts` description with `cellBrToNewline`/`cellNewlineToBr` helpers; updated `which-key.ts`, `table-cell-editor.ts`, and `textarea-vim-manager.ts` descriptions with which-key overlay lifecycle
- `AGENTS.md`: Updated dual-vim architecture section with which-key in embedded editors via dependency injection
- `docs/features/tables.md`: Added multi-table support note to embedded mode section; added multi-line cell content note with `<br>` support in embedded mode; added which-key support note to embedded cell editor section
- `docs/configuration/which-key.md`: Added embedded editors section documenting which-key in table cell editors and textarea vim overlays

## [0.104.0] - 2026-08-10

### Fixed

- **Flash labels missing from top half of viewport with frontmatter scrolled off-screen** — in Live Preview mode, when YAML frontmatter properties (~10-15 lines) were collapsed into a widget and scrolled off-screen, flash `f`/`F`/`t`/`T` labels only appeared in the bottom half of the viewport. The number of missing lines matched the frontmatter line count. Root cause: `getVisibleRange()` in `src/easymotion/targets.ts` used `view.lineBlockAtHeight()` which relies on CM6's height map — when the collapsed frontmatter widget was off-screen, height estimation errors caused `coordsAtPos()` to return `null` for targets near the viewport top, and `filterVisibleTargets()` dropped them. Fixed by using `view.visibleRanges` (actually-rendered document ranges) instead of `lineBlockAtHeight`. Also affected EasyMotion target scanning. ([#114](https://github.com/saberzero1/motions/issues/114))
    - Plugin: `src/easymotion/targets.ts` (`getVisibleRange` — replaced `lineBlockAtHeight` with `view.visibleRanges`)
    - Plugin: `test/unit/flash-targets.test.ts` (updated CM6 stub to provide `visibleRanges`)
- **`v$d` cursor off-by-one** — visual-mode `v$d` left cursor at ch:5 instead of ch:4 after deleting to end of line. Root cause: `clipCursorToContent` in the delete operator ran while `vim.visualMode` was still `true` (allowing `ch = text.length`), and `exitVisualMode` ran after the operator returned without re-clamping. Fixed by re-clipping `operatorMoveTo` through `clipCursorToContent` after `exitVisualMode` in `applyOperator`.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`applyOperator` — re-clip cursor after `exitVisualMode`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Visual operator cursor re-clamping after exitVisualMode" section)
- **`s` substitute consumed by flash jump in Tier 1 tests** — the `s` key did nothing in `normal-editing.e2e.ts` because the test vault had `flashJumpEnabled: true`, which mapped `s` to flash jump mode instead of the built-in substitute (`cl`). Flash jump tests explicitly enable this setting in their own `before()` hooks. Fixed by setting `flashJumpEnabled: false` in `data.json` and adding a defensive disable in the test's `before()` hook.
    - Plugin: `test-vault/.obsidian/plugins/vim-motions/data.json` (`flashJumpEnabled: false`)
    - Plugin: `test/specs/vim-builtin/normal-editing.e2e.ts` (defensive flash disable in `before()`)
- **`vt.d` on multi-dot content consumed by flash labels** — `vt.d` on content with 2+ dot characters (e.g., `foo.bar.baz`) deleted only 1 character because flash motions showed labels for the multiple `.` matches, consuming the `d` key as a label character. Not a fork bug — flash working as designed (same as flash.nvim in Neovim). Fixed by setting `enableFlash: false` in test vault `data.json` and disabling flash in `visual-mode.e2e.ts` `before()` hook. Flash-specific behavior is tested in dedicated test files.
    - Plugin: `test-vault/.obsidian/plugins/vim-motions/data.json` (`enableFlash: false`)
    - Plugin: `test/specs/vim-builtin/visual-mode.e2e.ts` (defensive flash disable in `before()`)

### Added

- **`vimHandleKeys` test helper** — new helper in `test/helpers.ts` that dispatches all keys synchronously through `Vim.handleKey()` in a single `executeObsidian` callback, bypassing DOM event timing. Used for visual-mode compound operations that fail with `vimRawKeys` DOM dispatch.
    - Plugin: `test/helpers.ts` (`vimHandleKeys` function)
- **`useHandleKey` flag on `TestCaseDefinition`** — test cases can opt in to `vimHandleKeys` dispatch via `useHandleKey: true`. `testWithNeovim` checks this flag and routes to `vimHandleKeys` instead of `dispatchVimKeys`.
    - Plugin: `test/neovim/test-definitions.ts` (`useHandleKey?: boolean` on interface, set on 6 visual-mode test cases)
    - Plugin: `test/neovim/test-wrapper.ts` (import `vimHandleKeys`, `useHandleKey` in config type, dispatch branching)
- **Deviation category classification** — all deviations in `deviations.ts` now have a `category` field (`intentional`, `infra-limitation`, `upstream-bug`, `upstream-unsupported`, `recording-issue`). `findDeviation()` export added. `[INFRA-SKIP]` console warnings emitted for infra-limitation deviations.
    - Plugin: `test/neovim/deviations.ts` (interface + 25 entries classified + `findDeviation()`)
    - Plugin: `test/neovim/test-wrapper.ts` (infra-skip logging in both live and golden paths)
- **Golden schema extended with `registers` and `visualMode`** — `GoldenCase.result` now includes optional `registers` (unnamed register text + linewise flag) and `visualMode` (`charwise`/`linewise`/`blockwise`). Recording captures these fields. Comparison is not yet enabled (register state leaks between tests in shared Obsidian session).
    - Plugin: `test/neovim/compare.ts` (`EditorState` extended, `getObsidianState`/`getNeovimState` capture registers and visual sub-mode)
    - Plugin: `test/neovim/golden.ts` (`GoldenCase` extended)
    - Plugin: `test/neovim/record-golden.ts` (captures registers and visual mode)
    - Plugin: `test/neovim/client.ts` (`getRegisterType`, `getRawMode` methods)
    - Plugin: `test/neovim/golden-data/*.json` (24 files re-recorded with new fields)
- **Golden mode comparison** — `testWithNeovim()` golden path now compares `mode` in addition to `content` and `cursor`. Mode mismatches that were previously invisible are now caught.
    - Plugin: `test/neovim/test-wrapper.ts` (mode comparison in golden path)
- **`else { throw }` guards on all 26 `SUITES.find()` files** — if a suite name is renamed in `test-definitions.ts` but not in the spec file, the test runner produces an explicit failure instead of silently generating zero tests.
    - Plugin: `test/specs/vim-builtin/*.e2e.ts` (26 files)

### Changed

- **E2E test assertions strengthened** — 35 tests that previously only checked `mode === 'normal'` or `assertPluginLoaded()` now have content, cursor, or behavioral assertions. 16 workspace-layout ex-command tests renamed with `[crash-guard]` prefix. 1 tautological assertion fixed (`toBeGreaterThanOrEqual(0)` → `toBe(0)`).
    - Plugin: `test/specs/undo-tree.e2e.ts`, `test/specs/undo-tree-navigation.e2e.ts`, `test/specs/vim-builtin/ex-commands-expanded.e2e.ts`, `test/specs/vimrc.e2e.ts`
- **Deviation count reduced** — 6 visual-mode infra-limitation deviations resolved via `useHandleKey` (V3j+J, vip+d, v+r, v+aw+d, vt.+d, v$+d). 1 deviation resolved via key-string fix (`lua nmap change word` — `<Esc>` literal → `\x1b` byte). 1 reclassified from `infra-limitation` to `upstream-bug` (`lua leader key mapping`).

### Tests

- 1 e2e test in `test/specs/flash-frontmatter-viewport.e2e.ts` (issue #114): flash labels appear in top half of viewport when frontmatter properties are scrolled off-screen in Live Preview mode — verifies labels are not clustered in bottom half only

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added "E2E test infrastructure weaknesses" section with fixed/remaining items; marked `s` substitute test failure as fixed; updated deviation-masked operations count and root causes; marked flash frontmatter viewport offset as fixed
- `AGENTS.md`: Updated deviation registry description with categories and `[INFRA-SKIP]`; updated test helpers with `vimHandleKeys`; updated `targets.ts` description with `visibleRanges`
- `CONTRIBUTING.md`: Added `vimHandleKeys` to helper list; added `useHandleKey` flag documentation; updated deviations.ts description with categories; updated `targets.ts` description with `visibleRanges`
- `DIFFERENCES.md` (fork): Added "Visual operator cursor re-clamping after exitVisualMode" section

## [0.103.0] - 2026-08-08

### Fixed

- **Native Obsidian shortcuts (Tab, Shift+Tab, Ctrl+Shift+I, F-keys) consumed in Normal/Visual mode** — since v0.99.0, unmapped functional keys were silently swallowed in Normal and Visual modes but worked in Insert mode. Root cause: the fork's `findKey` guard (commit `4aa1cc7`) used `/^<.+>$/` to suppress unmatched angle-bracket keys in normal mode, which consumed ALL angle-bracket keys — including `<Tab>`, `<S-Tab>`, `<C-S-I>`, `<F1>`–`<F12>`, and other keys that should propagate to the host application. The guard was intended to catch `<Space>` (which bypassed the original `key.length === 1` check), but the regex was too broad. Fixed by narrowing to a whitelist of text-producing special keys (`<Space>`, `<BS>`, `<Del>`, `<CR>`) plus keys that must not propagate to the host (`<Esc>`, `<Ins>`), and preserving the Mac Alt character guard (`<A-x>`) from upstream PR #194. `<Esc>` is included because `handleEsc()` returns `undefined` in idle normal mode (intentional no-op), but the keydown event must still be consumed to prevent it from propagating to the DOM and triggering modal closes or scope pops. Functional/navigation keys now return `undefined` from `findKey`, allowing Obsidian to handle them natively. ([#113](https://github.com/saberzero1/motions/issues/113))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`findKey` — narrowed key consumption guard from `/^<.+>$/` to `/^<(Space|BS|Del|CR|Esc|Ins)>$/` + Mac `<A-.>` guard)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (updated "Unmatched angle-bracket keys consumed in normal mode" section)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated v0.99.0 `<Space>` fix description — narrowed guard to prevent consuming functional keys
- `AGENTS.md`: Updated codemirror-vim fork description with narrowed key consumption guard

## [0.102.0] - 2026-08-08

### Fixed

- **Vim `p` with non-text clipboard content silently does nothing** — when `clipboard=unnamed` or `clipboard=unnamedplus` is set, pressing `p` (or `]p`, `[p`, `:put`) with an image on the system clipboard did nothing. The fork's `paste` action called `navigator.clipboard.readText()` which returns `""` for image-only clipboard content, and `continuePaste()` bailed on the empty string with no error handling. Fixed by adding a `.catch()` handler to the `readText()` promise and a `fallbackToNativePaste()` method that calls `document.execCommand('paste')` when the text clipboard is empty or `readText()` rejects. This triggers Obsidian's native paste pipeline, which creates an attachment and inserts `![[Pasted image …]]`. A `programmaticPaste` flag suppresses the fork's `getOnPasteFn` listener during the fallback to prevent spurious insert-mode entry. The editor stays in normal mode after the fallback. Covers `p`, `]p`, `[p`, `:put`, and explicit `"+p` register paste. `P`/`gp`/`gP` are overridden by the host plugin's `pasteFromRegister()` and are not affected (separate issue).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`programmaticPaste` flag, `getOnPasteFn` guard, `paste` action rewrite with `.catch()`, `fallbackToNativePaste` method)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (`fallbackToNativePaste` type signature in `vimActions`)

### Tests

- 3 e2e spike tests in `test/specs/spikes/spike-execcommand-paste.e2e.ts`: `execCommand('paste')` with image clipboard triggers native image paste, `execCommand('paste')` with text clipboard inserts text (control), vim `p` with image clipboard and `clipboard=unnamed` inserts image via native fallback

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added clipboard non-text paste fallback fix to yank-ring section
- `AGENTS.md`: Updated codemirror-vim fork description with `fallbackToNativePaste` and `programmaticPaste` flag
- `docs/configuration/settings.md`: Added note about non-text clipboard fallback to clipboard setting description

## [0.101.0] - 2026-08-08

### Fixed

- **Escape exit from textarea vim overlay leaks to parent scope** — pressing Escape twice (insert → normal → exit) in the textarea vim editor caused the Escape keydown event to propagate to the parent modal's DOM, closing it or switching the active leaf. Root cause: `handleEscapeAndRedispatch()` called `teardownActive()` synchronously inside the Obsidian `Scope.register` handler, which destroyed the editor and popped the keymap scope mid-handler. The `isolateKeyEvents` `stopPropagation()` handler was removed with the editor, so the DOM-level Escape continued propagating to parent elements. Fixed by deferring teardown via `requestAnimationFrame` — the Scope handler returns `true` (consuming the event) while the editor's scope is still on the stack. Also added a `_destroying` flag to `embeddable-editor.ts` to prevent the blur event listener from double-popping the keymap scope when `destroy()` is already handling cleanup. ([#112](https://github.com/saberzero1/motions/issues/112))
    - Plugin: `src/vim/textarea-vim-manager.ts` (`handleEscapeAndRedispatch` — deferred teardown via `requestAnimationFrame`)
    - Plugin: `src/editors/embeddable-editor.ts` (`_destroying` flag, blur handler guard)
- **Escape exit from table cell editor leaks to parent scope** — same scope-pop-mid-handler vulnerability as the textarea vim overlay. The `onEscape` callback in `table-nav-controller.ts` called `exitCellEdit()` → `closeCellEditor()` → `editor.destroy()` → `popKeymapScope()` synchronously inside the Scope handler. Fixed with the same deferred-teardown pattern. ([#112](https://github.com/saberzero1/motions/issues/112))
    - Plugin: `src/vim/table-nav-controller.ts` (`onEscape` callback — deferred `exitCellEdit` via `requestAnimationFrame`)

### Tests

- 1 e2e test in `test/specs/textarea-vim.e2e.ts` (issue #112): Escape exit does not leak Escape keydown to parent modal container DOM and does not change active leaf — verifies zero Escape events propagate to `modal.containerEl`, modal stays open, leaf ID unchanged

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated embedded editor Escape handler description with deferred teardown pattern, `_destroying` guard, and scope-pop-mid-handler fix
- `CONTRIBUTING.md`: Updated `embeddable-editor.ts` description with `_destroying` guard; updated `textarea-vim-manager.ts` description with deferred teardown; updated `table-nav-controller.ts` description with deferred `onEscape`
- `AGENTS.md`: Updated dual-vim architecture section with deferred teardown and `_destroying` guard

## [0.100.0] - 2026-08-07

### Fixed

- **`:snippet` visual selection not captured** — running `:snippet <name>` from visual mode now correctly wraps the selected text. Previously, `$TM_SELECTED_TEXT` / `$VISUAL` resolved to empty and the snippet was inserted at the cursor instead of replacing the selection. Root cause: vim's ex-command dispatcher calls `exitVisualMode()` before the `:snippet` handler runs, collapsing the CM6 selection. Fixed by reading the visual selection from vim's `'<'`/`'>'` marks (which survive `exitVisualMode`) via the `cm` adapter parameter, extracting the text with `cm.getRange()`, and overriding `ctx.selectedText` before preprocessing. Visual line mode (`V`) normalizes the start to `ch: 0` and extends the end to full line length. ([Discussion #108](https://github.com/saberzero1/motions/discussions/108))
    - Plugin: `src/snippets/commands.ts` (`recoverVisualSelection()` — reads `'<'`/`'>'` marks + `lastSelection.visualMode`/`visualLine` flags; `:snippet` handler overrides `ctx.selectedText` and uses mark-derived `from`/`to` offsets for the `apply()` range)

### Tests

- 10 e2e tests in `test/specs/spikes/spike-snippet-visual-surround.e2e.ts` (Discussion #108): `$TM_SELECTED_TEXT` wraps word selection via `viw`, fills tabstop default in link snippet, `$VISUAL` alias parity, multiline callout wrapping, empty selection regression guard, link snippet structure, Lua `fmt()` wraps selection, Lua `t()`/`i()` bold wrapping, Lua link structure, Lua empty selection placeholder
- 12 e2e tests in `test/specs/spikes/spike-snippet-visual-edge-cases.e2e.ts` (Discussion #108): visual line mode (`V`) wraps full line, multi-line `Vjj` wraps three lines, charwise `v` across lines, visual block mode (`<C-v>`) produces non-empty text, stale `lastSelection` uses marks (vim `gv` semantics), bookmark invalidation falls back to empty, picker baseline, normal mode after visual `:snippet` (documented pre-existing), correct snippet text despite normal mode, `v$` end-of-line, single char at EOL, `v$` mid-line to end

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated snippet variable limitations section — `$TM_SELECTED_TEXT`/`$VISUAL` tab-expand limitation clarified, visual-mode `:snippet` now works
- `CONTRIBUTING.md`: Added `commands.ts` to snippets codebase structure with visual selection recovery description
- `docs/features/snippets.md`: Updated `$TM_SELECTED_TEXT`/`$VISUAL` callout to confirm visual-mode `:snippet` works

## [0.99.0] - 2026-08-06

### Added

- **`set nopcre` — Vim-style regular expressions** — users can now switch from JavaScript/PCRE regexps to Vim-style regex syntax in search and substitution via `set nopcre` (vimrc), `vim.opt.pcre = false` (Lua), or the Settings UI toggle (**Settings → Vim Motions → Vim engine → PCRE**). The codemirror-vim fork already implemented the full `pcre` option (regex translation with magic modes, `\<`/`\>` word boundaries, `\zs`/`\ze`, backreference conversion); this change wires it into the plugin's option tracking, settings UI, and documentation. Default: `true` (JavaScript regexps, no behavior change for existing users). ([#111](https://github.com/saberzero1/motions/issues/111))
    - Plugin: `src/settings.ts` (`pcre: boolean` in `VimMotionsSettings`, `pcre: true` in `DEFAULT_SETTINGS`, toggle in both declarative and imperative settings UI — General page, Vim engine group)
    - Plugin: `src/vimrc/loader.ts` (`pcre` added to `KNOWN_SET_OPTIONS` and `KNOWN_CM_VIM_OPTIONS`)
    - Plugin: `src/main.ts` (initialization sync — `vim.setOption('pcre', false)` when user has disabled PCRE)
    - Plugin: `test/unit/known-set-options.test.ts` (`pcre` added to `newOptions` test array)
- **37 snippet variables (up from 16 documented)** — expanded the snippet variable system to cover the full VSCode snippet specification, plus vim-ecosystem aliases. New variables: `$TM_SELECTED_TEXT` (wired — was stubbed), `$VISUAL` (alias for `$TM_SELECTED_TEXT`, vim convention), `$TM_CURRENT_LINE`, `$TM_CURRENT_WORD`, `$WORD` (alias for `$TM_CURRENT_WORD`, vim convention), `$TM_LINE_NUMBER` (1-based), `$TM_LINE_INDEX` (0-based), `$CLIPBOARD` (wired via cache-ahead pattern — was stubbed), `$RELATIVE_FILEPATH`, `$WORKSPACE_NAME`, `$WORKSPACE_FOLDER`, `$CURSOR_INDEX`, `$CURSOR_NUMBER`, `$CURRENT_MILLISECOND`, `$CURRENT_MILLISECONDS_UNIX`, `$CURRENT_TIMEZONE_NAME`, plus previously undocumented `$CURRENT_YEAR_SHORT`, `$CURRENT_MONTH_NAME_SHORT`, `$CURRENT_DAY_NAME_SHORT`, `$CURRENT_SECONDS_UNIX`, `$CURRENT_TIMEZONE_OFFSET`. `$CLIPBOARD` uses a cache-ahead pattern (refreshed on `window focus` and `visibilitychange`) to avoid making the synchronous snippet pipeline async. On mobile, `$CLIPBOARD` resolves to empty due to browser clipboard API restrictions. `$TM_SELECTED_TEXT` / `$VISUAL` resolve to the editor selection at expansion time; in tab-expand mode, selection is not available (tab expansion requires an empty selection). ([#110](https://github.com/saberzero1/motions/issues/110))
    - Plugin: `src/snippets/types.ts` (`PreprocessContext` — added `currentLine`, `currentWord`, `lineNumber`, `lineIndex`, `workspaceName` fields)
    - Plugin: `src/snippets/variables.ts` (added 15 new variable entries including `VISUAL`, `WORD`, `TM_CURRENT_LINE`, `TM_CURRENT_WORD`, `TM_LINE_NUMBER`, `TM_LINE_INDEX`, `RELATIVE_FILEPATH`, `WORKSPACE_NAME`, `WORKSPACE_FOLDER`, `CURSOR_INDEX`, `CURSOR_NUMBER`, `CURRENT_MILLISECOND`, `CURRENT_MILLISECONDS_UNIX`, `CURRENT_TIMEZONE_NAME`; added `pad3()` and `getTimezoneName()` helpers)
    - Plugin: `src/main.ts` (`_clipboardCache` field, `refreshClipboardCache()` method, clipboard cache listeners on `window focus` + `visibilitychange` + initial population; `getSnippetPreprocessContext()` rewritten to populate all fields from the active editor including selection, current line/word, line number, and workspace name)

### Fixed

- **EasyMotion operator-pending inclusivity** — EasyMotion motions (`f`, `t`, `e`, `s`, `ge`, `E`, `gE`) now correctly include the target character in operator-pending mode, matching native Vim semantics. Previously, all EasyMotion motions were registered with empty `motionArgs`, so the fork treated them as exclusive — `y<leader><leader>fk{label}` excluded the target `k` from the yank. Visual mode was unaffected (it extends the selection directly without consulting the `inclusive` flag). Backward motions (`F`, `T`) remain exclusive, matching native Vim. ([#109](https://github.com/saberzero1/motions/issues/109))
    - Plugin: `src/easymotion/register.ts` (`EasyMotionDef` interface — added `motionArgs?: Record<string, unknown>`; `EASYMOTION_DEFS` — added `motionArgs: { inclusive: true }` to 8 of 17 defs matching Vim's native inclusivity; registration loop — passes `def.motionArgs ?? {}` to `mapCommand`)
- **Cursor stuck below YAML frontmatter in Live Preview with "Properties in document: Source"** — `k`, `gk`, and `<Up>` could not move into the frontmatter region when the editor was in Live Preview mode and Obsidian's "Properties in document" setting was set to "Source". In this configuration, the `.metadata-container` DOM element exists but is hidden (`display: none`). The fork's `focusBefore` callback found the hidden element via `querySelector`, focused it (no visible effect), and `moveByLines`/`moveByDisplayLines` returned the original cursor position — leaving the cursor stuck. Fixed by adding a `setPropertiesSource(fn: () => boolean)` API to the fork, parallel to `setLivePreviewField`. When the callback returns `true`, the frontmatter interception block is skipped entirely and the cursor moves through raw frontmatter text normally. The plugin passes `() => getVaultConfig(app, 'propertiesInDocument') === 'source'`, evaluated per cursor movement so runtime setting changes take effect immediately. ([#77](https://github.com/saberzero1/motions/issues/77))
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (`setPropertiesSource` API, `_propertiesSourceFn` gate in `findPosV`)
    - Fork: `~/Repos/codemirror-vim/src/index.ts` (export `setPropertiesSource`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added `setPropertiesSource` API section, updated "Properties navigation" section with two-level gate)
    - Plugin: `src/vim/bundled-vim.ts` (`createBundledVimExtension` accepts `isPropertiesSource` callback, calls `setPropertiesSource`)
    - Plugin: `src/main.ts` (passes `propertiesInDocument === 'source'` callback)
    - Plugin: `src/types/codemirror-vim.d.ts` (added `setPropertiesSource` type declaration)
- **Escape in operator-pending mode exits embedded text area editor** — pressing `d` then `Escape` in the textarea vim overlay exited the editor instead of clearing the pending operator. The Escape handler checked `vim.mode === 'normal'` without accounting for operator-pending, surround, partial key sequences, and literal-character-await sub-states. Additionally, the CM6 keymap handler could never run because vim's `eventObservers.keydown` called `e.preventDefault()` before CM6 keymaps processed the event. Fixed by moving Escape handling to an Obsidian `Scope.register` handler (fires before vim's observer) with a new `isVimIdle()` check covering all compound-command sub-states. ([#112](https://github.com/saberzero1/motions/issues/112))
    - Plugin: `src/editors/embeddable-editor.ts` (`isVimIdle` helper, `VimIdleState` interface, Scope-based Escape handler replacing CM6 keymap handler)
- **Keydown events leak from embedded text area editor to parent modals** — typing keys (e.g., Space) in insert mode inside the textarea vim overlay propagated `keydown` events to the parent modal, triggering unintended actions in third-party plugins (e.g., Spaced Repetition). Fixed with a new opt-in `isolateKeyEvents` option on `EmbeddableEditorOptions` that stops `keydown` and `keyup` propagation via CM6 `domEventHandlers`. Only enabled for textarea-vim overlays; Oil and table-cell editors are unaffected. ([#112](https://github.com/saberzero1/motions/issues/112))
    - Plugin: `src/editors/embeddable-editor.ts` (`isolateKeyEvents` option, `domEventHandlers` with `stopPropagation`)
    - Plugin: `src/vim/textarea-vim-manager.ts` (`isolateKeyEvents: true`)
- **Unmatched `<Space>` inserted as text after failed multi-key sequence** — pressing an unmapped key after a partial multi-key sequence (e.g., `<leader><leader><Space>` where no EasyMotion motion matches) inserted a literal space character into the document. Root cause: the fork's `findKey` used `key.length === 1` to suppress unmatched single-character keys in normal mode, but `vimKeyFromEvent` converts Space to `"<Space>"` (7 characters) via the `specialKey` map, bypassing the guard. The function returned `undefined` instead of a consuming no-op, letting the keydown propagate to CM6's text input handler. Fixed by replacing the guard with `key.length === 1 || /^<.+>$/.test(key)` to match both plain characters and angle-bracket notation keys. ([#112](https://github.com/saberzero1/motions/issues/112))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`findKey` — generalized key length guard)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Unmatched angle-bracket keys consumed in normal mode" section)

### Tests

- 4 e2e tests in `test/specs/easymotion-comprehensive.e2e.ts` (issue #109): inclusive `f` yank includes target character, inclusive `e` delete includes end-of-word character, exclusive `w` yank excludes target (regression), visual mode `f` yank includes target (regression)
- 1 unit test in `test/unit/known-set-options.test.ts` (issue #111): `pcre` option registered in `KNOWN_SET_OPTIONS` with correct type and settingsKey, default value verified
- 49 unit tests in `test/unit/snippets/variables.test.ts`: `resolveVariables()` coverage for all 37 variables (selection/content, file/path, workspace/cursor, date/time, random), syntax variants (`$VAR` and `${VAR}`), alias parity (`$VISUAL` = `$TM_SELECTED_TEXT`, `$WORD` = `$TM_CURRENT_WORD`, `$RELATIVE_FILEPATH` = `$TM_FILEPATH`, `$WORKSPACE_FOLDER` = `$WORKSPACE_NAME`), edge cases (empty fields, unknown variables, tabstop defaults, adjacent variables)
- 20 e2e tests in `test/specs/snippets/snippet-variables-integration.e2e.ts` (issue #110): file/path variables against live `Welcome.md` (5 tests), editor content variables with cursor positioning (4 tests), line number variables 1-based/0-based (3 tests), workspace name and alias (2 tests), cursor index/number constants (2 tests), selection variable resolution via `getSnippetPreprocessContext()` (3 tests), combined multi-variable expansion (1 test)
- 3 e2e tests in `test/specs/vim-builtin/g-commands.e2e.ts` (issue #77): `k` moves up through source-rendered frontmatter, `k` navigates through multiple frontmatter properties, `gk` moves up through source-rendered frontmatter. Tests set `propertiesInDocument` to `'source'` and ensure Live Preview mode, with save/restore of the original setting.
- 13 unit tests in `test/unit/embedded-editor-idle.test.ts` (issue #112): `isVimIdle` coverage for null/undefined, idle normal, insert/visual/replace modes, operator pending, surround state, partial key buffer, expectLiteralNext, multiple sub-states, missing inputState, missing keyBuffer
- 3 e2e tests in `test/specs/textarea-vim.e2e.ts` (issue #112): operator-pending Escape does not exit overlay, idle normal Escape exits overlay, insert-mode typing does not leak keydown to parent modal

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated `KNOWN_CM_VIM_OPTIONS` list in `set` option scope section to include `pcre`; added snippet variable limitations section (`$CLIPBOARD` mobile restriction, `$TM_SELECTED_TEXT` tab-expand limitation, `snip.env` deferred, comment variables deferred); updated properties navigation section with "Properties in document: Source" edge case fix and updated test coverage; marked EasyMotion operator-pending inclusivity as fixed; added 4 new known limitations (linewise `j`/`k`, `motionArgs.forward`/`clipToLine`, `EXTRA_DEFS` bidirectional motions, `easyMotionRepeat` operator-pending)
- `CONTRIBUTING.md`: Updated `variables.ts` description in codebase structure; updated `bundled-vim.ts` description with `setPropertiesSource` wiring; updated `easymotion/register.ts` description with per-motion `motionArgs` for operator-pending inclusivity
- `README.md`: Updated Snippets feature line with variable count and vim-ecosystem aliases
- `AGENTS.md`: Updated codemirror-vim fork description with `setPropertiesSource` API
- `docs/features/snippets.md`: Expanded variable table from 16 to 37 entries organized into sections (selection/content, file/path, workspace/cursor, date/time, random) with info callout about selection and clipboard behavior
- `docs/features/easymotion.md`: Updated operator-pending section with inclusivity semantics; fixed stale dot-repeat note
- `docs/configuration/vimrc.md`: Added `pcre` row to boolean options table
- `docs/configuration/settings.md`: Added `pcre` row to Vim engine settings table
- `docs/configuration/lua-config.md`: Added `pcre` row to `vim.opt` options table
- `DIFFERENCES.md` (fork): Added `setPropertiesSource` API section, updated "Properties navigation" section with two-level gate
- `KNOWN_LIMITATIONS.md`: Updated embedded editor Escape handler description with Scope-based approach and `isVimIdle` sub-state detection; added key event isolation note
- `CONTRIBUTING.md`: Updated `embeddable-editor.ts` description with `isVimIdle` helper, Scope-based Escape, and `isolateKeyEvents` option
- `AGENTS.md`: Updated dual-vim architecture section with Scope-based Escape handling for embedded editors
- `DIFFERENCES.md` (fork): Added "Unmatched angle-bracket keys consumed in normal mode" section under Behavioral fixes

## [0.98.0] - 2026-08-05

### Fixed

- **Animated cursor character displaced on lines with tall content** — on lines containing tall inline elements (e.g., MathJax with `\dfrac`), the character rendered beneath the block cursor shifted vertically. Root cause: the renderer's baseline formula centered the character within the `coordsAtPos()` rect height, which on some platforms/fonts returns the full line height instead of the per-character height. For a ~80px tall line with ~19px font height, this produced a ~30px downward shift. Fixed by using the actual DOM character bounding rect (`Range.getBoundingClientRect()` via `view.domAtPos()`) for baseline calculation, falling back to `coordsAtPos()` when the DOM rect is unavailable. ([#106](https://github.com/saberzero1/motions/issues/106))
    - Plugin: `src/vim/animated-cursor/renderer.ts` (`BlockCharInfo` — added `charTop`/`charHeight` fields; `drawCursorShape` and `drawSmearCursor` — baseline anchored to DOM char rect when available)
    - Plugin: `src/vim/animated-cursor/controller.ts` (`resolveBlockChar` — extracts DOM character bounding rect via `Range.getBoundingClientRect()`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked animated cursor tall-line character displacement as fixed
- `CONTRIBUTING.md`: Updated `renderer.ts` description with DOM-based baseline calculation
- `AGENTS.md`: Updated `renderer.ts` description in animated cursor codebase structure
- `docs/features/animated-cursor.md`: Added tall-line displacement fix to known limitations

## [0.97.0] - 2026-08-05

### Fixed

- **Priority over Latex Suite and other CM6 extensions** — the codemirror-vim fork's keydown handler no longer depends on plugin load order to fire before other extensions that use `Prec.highest`. The fork now uses a CM6 `eventObservers.keydown` (DOM event observer) instead of `eventHandlers.keydown` — in CM6's dispatch order, observers run before handlers, guaranteeing vim processes keys first regardless of `Prec` ordering or `community-plugins.json` order. Previously, both the fork and Latex Suite registered keydown handlers at `Prec.highest`, and the first-registered handler won — making key handling dependent on which plugin loaded first. ([#107](https://github.com/saberzero1/motions/issues/107))
    - Fork: `~/Repos/codemirror-vim/src/index.ts` (moved `keydown` from `eventHandlers` to `eventObservers`, added `setKeyInterceptActive` API)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Observer-based keydown dispatch" and "setKeyInterceptActive API" sections)
    - Plugin: `src/flash/state.ts` (`setFlashActive` and `cancelFlash` call `setKeyInterceptActive`)
    - Plugin: `src/easymotion/register.ts` (`createMotionTrigger` and `createCharMotionTrigger` bracket try/finally with `setKeyInterceptActive`)
    - Plugin: `src/ui/hint-mode.ts` (`waitForHintKey` sets `setKeyInterceptActive` on entry and cleanup)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated Latex Suite interaction section with observer-based keydown dispatch fix
- `AGENTS.md`: Updated codemirror-vim fork description with observer-based keydown dispatch and `setKeyInterceptActive` API
- `docs/guides/ecosystem-compatibility.md`: Updated extension priority description with observer-based mechanism

## [0.96.0] - 2026-08-04

### Fixed

- **Hint mode dropdown menus appear at top-left corner** — synthetic click events dispatched by hint mode lacked `clientX`/`clientY` coordinates, causing Obsidian's dropdown menus (vault switcher, context menus, etc.) to position at `(0, 0)` instead of near the clicked element. Fixed by computing the element's center from `getBoundingClientRect()` and passing coordinates to all `MouseEvent` and `PointerEvent` dispatches. Also replaced `el.click()` with a coordinate-aware `MouseEvent` dispatch. ([#104](https://github.com/saberzero1/motions/issues/104))
    - Plugin: `src/ui/hint-mode.ts` (`getElementCenter` helper, coordinate injection in `hintActivate` — openInNewPane `MouseEvent`, normal click `PointerEvent`s, and `el.click()` replacement)

### Added

- **Hint mode right-click (context menu) action** — new `gf` binding in non-editor views and Shift+label modifier in editor context to open the right-click context menu on any hint target. Dispatches a `contextmenu` `MouseEvent` with proper coordinates from `getElementCenter()`. Also available as `:hintcontextmenu` (`:hintco`) ex command and `vim-motions:hint-context-menu` Obsidian command. Shift key normalization in `waitForHintKey()` ensures Shift-held characters match lowercase labels correctly. ([#104](https://github.com/saberzero1/motions/issues/104))
    - Plugin: `src/ui/hint-mode.ts` (`hintContextMenu` action, `contextMenu` in `createHintAction`/`createHintActions`, `shiftKey` in `HintResult`, Shift→contextMenu upgrade in action selection, `e.key.toLowerCase()` normalization when Shift held), `src/workspace/global-defaults.ts` (`gf` binding, `contextMenu` in `hintActions` parameter type), `src/main.ts` (`:hintcontextmenu` ex command, `vim-motions:hint-context-menu` Obsidian command, `contextMenu` in `hintActions` type)

### Tests

- 5 e2e tests in `test/specs/hint-mode.e2e.ts` (issue #104): `gf` from graph view shows hint overlay, `gf` label dispatches contextmenu event with non-zero coordinates, Shift+label dispatches contextmenu in editor, Shift+label matches lowercase labels (case-sensitivity regression), `hint-context-menu` Obsidian command registered

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated hint mode actions with context menu action, coordinate fix, and Shift modifier
- `AGENTS.md`: Updated `hint-mode.ts` description with `getElementCenter`, `hintContextMenu`, and Shift modifier
- `CONTRIBUTING.md`: Updated `hint-mode.ts` description
- `README.md`: Updated Vimium-style hints feature line with `gf`
- `docs/features/hint-mode.md`: Added `gf` to non-editor keybinding table, Shift modifier to editor context, `vim-motions:hint-context-menu` to commands
- `docs/reference/keybindings.md`: Added `gf` to non-editor view bindings table
- `docs/features/ex-commands.md`: Added `:hintcontextmenu` to hint ex commands table

## [0.95.0] - 2026-08-04

### Fixed

- **Linewise visual select highlighting not visible inside callouts** — in visual-line mode (`V`), callout content did not show the selection highlight in two scenarios: (1) When the callout was collapsed as a widget (`cm-embed-block cm-callout`), the `cm-vim-linewise-widget-selection` background was overridden by the callout's own styling. (2) When the cursor was inside the callout (unfolded as `.cm-line` elements with `HyperMD-quote` classes), Obsidian's `.HyperMD-quote { background-color: var(--blockquote-background-color) }` rule overrode the `cm-vim-linewise-selection` background due to CSS cascade ordering. Fixed by increasing CSS specificity of the selection rules to (0,5,0) via `.cm-editor .cm-scroller .cm-content` ancestor chain, outranking Obsidian's (0,4,0) blockquote rule without using `!important`. ([#103](https://github.com/saberzero1/motions/issues/103))
    - Plugin: `styles.css` (increased specificity on `.cm-vim-linewise-selection` and `.cm-vim-linewise-widget-selection` rules)
- **Hint mode does not label the vault switcher** — the vault switcher button (`.workspace-drawer-vault-switcher`) in the left sidebar was not discoverable by hint mode because its CSS class was not in the `OBSIDIAN_SELECTORS` list. The element is a plain `<div>` without button semantics (`role="button"`, `<button>` tag, etc.), so it was not matched by any standard or Obsidian-specific selector. Fixed by adding `.workspace-drawer-vault-switcher` to `OBSIDIAN_SELECTORS`. ([#104](https://github.com/saberzero1/motions/issues/104))
    - Plugin: `src/ui/hint-mode.ts` (added `.workspace-drawer-vault-switcher` to `OBSIDIAN_SELECTORS`)
- **Animated cursor displaced rightward at end-of-line in visual mode** — with animated cursor enabled, the block cursor rendered one character past the last visible character when visual selection reached the end of a line. Root cause: `refreshTarget()` stepped back from `sel.head` in forward selections to render the cursor on the last selected character, but the `ch !== '\n'` guard prevented the step-back when `sel.head` pointed to a newline (end of line). Fixed by replacing the character-based guard with a line-boundary guard (`pos > line.from`), which correctly handles end-of-line, empty lines, and document end. ([#105](https://github.com/saberzero1/motions/issues/105))
    - Plugin: `src/vim/animated-cursor/controller.ts` (`refreshTarget` — line-boundary guard replacing character guard)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated visual-line widget highlight section with callout CSS specificity fix; added vault switcher to hint mode target list; added animated cursor EoL visual mode fix

## [0.94.0] - 2026-08-01

### Fixed

- **Gutter settings ignored when set via vimrc or Lua** — `set nonumber`, `set signcolumn=no`, `vim.opt.number = false`, and other gutter-related settings (`number`, `relativenumber`, `numberwidth`, `linenumbermode`, `cursorline`, `cursorlineopt`, `signcolumn`, `statuscolumn`, `foldcolumn`) had no effect when configured via `.obsidian.vimrc` or `.obsidian.init.lua`. Root cause: vimrc/Lua overrides were in-memory only and never persisted, but gutter CM6 extensions are created at startup from persisted values. Fixed with a `configOverrides` persistence system: after vimrc/Lua loading, override values are captured and persisted in `data.json`. On next startup, `configOverrides` are merged on top of base settings before CM6 extensions are created, so gutters use the correct values from the start. Also added gutter reconfiguration calls to `reloadFeatures()` for in-session changes. ([#101](https://github.com/saberzero1/motions/issues/101))
    - Plugin: `src/main.ts` (`loadSettings` — configOverrides extraction and merge; `captureConfigOverrides` — new shared capture method; `saveSettings` — persist configOverrides; `reloadFeatures` — gutter reconfiguration; `softReloadVimrc` — clear stale overrides and re-capture; `clearSettingOverride` — new helper)
    - Plugin: `src/settings.ts` (replaced `vimrcOverrides?.delete` with `clearSettingOverride` across all onChange handlers — covers both declarative and imperative paths, fixes missing `luaOverrides` deletion)
- **`preVimrcSettings` shallow copy** — nested objects (`cursorShapes`, `modePrompts`, `pickerKeymap`) shared references with `this.settings`, causing `saveSettings()` to accidentally persist overridden cursor shapes. Fixed with deep copy.
    - Plugin: `src/main.ts` (line 677 — deep copy nested objects in `preVimrcSettings` snapshot)
- **Clipboard/textwidth falsely shown as "Set by vimrc"** — the initial settings restoration at startup called `onSettingOverride()` for `clipboard` and `textwidth`, writing to `vimrcOverrides` even without a vimrc file. Fixed by using direct side-effect calls.
    - Plugin: `src/main.ts` (replaced `onSettingOverride` calls with direct `setClipboardOption`/`setTextwidth` calls)
- **Oil explorer loses focus after committing staged changes** — after making changes in Oil (e.g., deleting a file) and committing with `:w`, the Oil editor lost focus when the confirmation dialog was confirmed or dismissed. Two bugs: (1) `OilConfirmModal.onClose()` never resolved the promise when the user pressed `Esc` to dismiss the modal, causing `commit()` to hang permanently. Fixed by adding a `resolved` guard — `onClose()` resolves `false` when no button was clicked. (2) After the confirmation dialog closed (via Confirm, Cancel, or Esc), focus was never returned to the Oil editor. Fixed by calling `view.focusEditor()` on both the cancel and commit paths. ([#100](https://github.com/saberzero1/motions/issues/100))
    - Plugin: `src/oil/manager.ts` (`OilConfirmModal` — `resolved` guard flag, `onClose` resolves on Esc dismissal; `commit` — `view.focusEditor()` after confirm and cancel paths)
- **`:sort` cursor positioning** — `:sort` (and ranged `:2,3sort`) now positions the cursor at the first line of the sorted range, matching Neovim. Previously the cursor stayed at line 0 regardless of the sort range.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`exCommands.sort` — `cm.setCursor` after `replaceRange`)
- **`CTRL-V $ d` cursor overshoot** — after a block visual delete to end-of-line (`CTRL-V jj $ d`), the cursor column is now clamped to the remaining line length. Previously the cursor could land past the last character on shortened lines.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`operators.delete` — block visual cursor clamping)
- **Hint mode: modifier keydown event propagates to Obsidian handlers** — pressing `Ctrl` alone during hint mode could trigger Obsidian's own key handlers because the modifier-only early return in `waitForHintKey()` did not call `preventDefault()` or `stopPropagation()`. The event leaked through to Obsidian's hotkey system via bubble-phase listeners, potentially causing side effects depending on the user's Obsidian configuration. Fixed by adding `e.preventDefault()` and `e.stopPropagation()` before the early return for modifier-only keys. ([#98](https://github.com/saberzero1/motions/issues/98))
    - Plugin: `src/ui/hint-mode.ts` (`waitForHintKey` handler — `preventDefault`+`stopPropagation` on modifier-only keydown)
- **Hint mode: count prefix (`2F`) focus restoration races with async navigation** — when using `2F` on an internal link target, `hintActivate()` fired `navigateWithJump()` without awaiting it (via `void`), then `setActiveLeaf(originalLeaf)` ran synchronously. The async `openLinkText()` inside `navigateWithJump` could resolve after the focus restoration and steal focus back to the new tab — a race condition that manifested on slower machines or with heavier vaults. Similarly, `duplicateLeaf()` was fire-and-forgotten. Fixed by making `hintActivate` async and awaiting both `navigateWithJump()` and `duplicateLeaf()`. The `createHintAction` callback now awaits the action result before restoring focus, making the behavior deterministic. ([#98](https://github.com/saberzero1/motions/issues/98))
    - Plugin: `src/ui/hint-mode.ts` (`hintActivate` — `async`, `await navigateWithJump`, `await duplicateLeaf`; `hintOpenNew` — returns `Promise<boolean>`; `createHintAction` — `async` callback, `await action()`, `Promise.resolve()` wrappers for sync actions)

### Added

- **27 new vimrc/Lua configurable options** — the following settings were previously only configurable via the Settings UI and are now available via `:set` in vimrc and `vim.opt` in Lua: `subword`, `picker`, `pickerleadermappings`, `pickermatcher`, `pickeromnisearch`, `pickertasks`, `pickerdataview`, `ripgrep`, `ripgreppath`, `ripgrepargs`, `grepmode`, `oil`, `oilhiddenfiles`, `oilconfirmdeletethreshold`, `oilsort`, `hinthotkey`, `undotreeposition`, `undotreeautoopen`, `imswitching`, `impreset`, `imbinarypath`, `imobtainargs`, `imswitchargs`, `imdefaultnormal`, `imrestorebehavior`, `imdefaultinsert`. All options work identically across Settings UI, vimrc, and Lua.
    - Plugin: `src/vimrc/loader.ts` (27 new `KNOWN_SET_OPTIONS` entries)
- **Runtime invariant system** — `invariant()` (always-on, type-narrowing) and `devAssert()` (dev-only, stripped from production) helpers in `src/util/invariant.ts`. 21 invariants placed across 9 source files protecting mode transitions, dual-vim architecture, settings resolution, Lua engine lifecycle, extension cleanup, cursor state, and cell editor singleton. Violations are logged to console, rate-limited via Notice, and inspectable via the `:violations` ex command. `__DEV__` build-time flag via esbuild `define` enables dev-only checks in development/watch builds and strips them from production.
    - Plugin: `src/util/invariant.ts` (new — `invariant`, `devAssert`, `getViolations`, `clearViolations`), `src/types/globals.ts` (new — `__DEV__` global type declaration), `esbuild.config.mjs` (`define` option), `vitest.config.ts` (`define` option)
- **`:violations` ex command** — displays accumulated invariant violations with timestamps. `:violations!` clears the violation log.
    - Plugin: `src/workspace/commands.ts` (`:violations` and `:violations!` registration)

### Tests

- 57 new unit tests across 5 new test files:
    - `test/unit/invariant.test.ts` (12 tests): invariant/devAssert helpers, violation cap, rate limiting, stack traces, shallow copy
    - `test/unit/mode-tracker.test.ts` (11 tests): getDialogPrefix, resolveMode logic
    - `test/unit/dual-vim.test.ts` (7 tests): bundled-vim lifecycle, bridge install/uninstall, invariant trigger
    - `test/unit/settings-resolution.test.ts` (16 tests): DEFAULT_SETTINGS completeness, settings merge, configMode migration, signcolumn migration, idempotency
    - `test/unit/lua/lifecycle.test.ts` (8 tests): sandboxed state creation/destruction, instruction guard, coroutine runner lifecycle
- 3 expanded tests in `test/unit/animated-cursor.test.ts`: manager register/deregister, destroy clears all, MAX_CONTROLLERS warning
- 70 new Neovim golden test cases (490 → 560): operator+motion combos (+28), visual mode operations (+15), insert mode operations (+12), ex command operations (+15)
- 2 Neovim deviations closed (22 → 20): `:2,3sort` cursor positioning, `CTRL-V $ delete to EOL` cursor overshoot
- 30 unit tests in `test/unit/known-set-options.test.ts`: KNOWN_SET_OPTIONS coverage guard (every non-excluded settings key has an entry, excluded keys list has no stale entries, no settingsKey points to non-existent setting), 27 new option entry validations (type, settingsKey, validValues)
- 6 e2e tests in `test/specs/gutter-vimrc-lua.e2e.ts`: gutter settings via Lua config (enable/disable line numbers, enable/disable sign column, disable all gutter elements, hybrid line numbers)
- 4 e2e tests in `test/specs/oil-poc.e2e.ts` (issue #100): oil retains focus after no-op commit, oil retains focus after confirmed destructive commit, oil retains focus after cancelled destructive commit, oil retains focus after Esc-dismissing the confirm modal
- 3 e2e tests in `test/specs/hint-mode.e2e.ts` (issue #98): `F` on wikilink opens in new tab via command, `openNew(2)` on wikilink keeps focus on original leaf after first hint, Ctrl keydown stopped from propagating during hint mode

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked gutter vimrc/Lua reconfiguration as fixed; marked preVimrcSettings shallow copy as fixed; marked clipboard/textwidth false override as fixed; updated `set` option scope section with configOverrides persistence; marked Oil focus loss after commit as fixed
- `docs/features/oil-explorer.md`: Added focus retention after commit note
- `AGENTS.md`: Updated hint mode page ownership with `hinthotkey`
- `README.md`: Updated vimrc configurable settings count
- `CONTRIBUTING.md`: Added configOverrides persistence and `clearSettingOverride` helper to conventions; updated vimrc loader description
- `docs/configuration/vimrc.md`: Added 27 new options to vimrc tables; updated override behavior section with configOverrides persistence and gutter restart note
- `docs/configuration/lua-config.md`: Added 27 new options to vim.opt table
- `KNOWN_LIMITATIONS.md`: Marked `:sort` cursor and `CTRL-V $` cursor deviations as fixed
- `CONTRIBUTING.md`: Added invariant system to codebase structure, updated testing instructions for `build:dev`
- `AGENTS.md`: Updated manual testing instructions for `build:dev`, added `:violations` command, updated golden test count and deviation count
- `README.md`: Added `npm run test:unit` to development commands
- `DIFFERENCES.md` (fork): Added `:sort` cursor positioning and block visual delete cursor clamping sections
- `docs/features/ex-commands.md`: Added `:violations` and `:violations!` ex commands
- `KNOWN_LIMITATIONS.md`: Updated hint mode modifier key fix with `stopPropagation`; updated count prefix focus fix with async `hintActivate`
- `AGENTS.md`: Updated `hint-mode.ts` description with async `hintActivate` and modifier `stopPropagation`

## [0.93.0] - 2026-07-31

### Fixed

- **Hint mode: pressing Ctrl/Shift/Alt/Meta alone clears labels** — pressing any modifier key alone during hint mode dismissed the overlay. Root cause: `waitForHintKey()` in `hint-mode.ts` treated modifier-only keydown events (where `e.key` is `"Control"`, `"Shift"`, etc.) as unmatched first characters, triggering cleanup. The global key handler (`global-key-handler.ts:228-234`) already filtered modifier-only keys correctly. Fixed by adding the same guard at the top of `waitForHintKey()`'s handler. ([#98](https://github.com/saberzero1/motions/issues/98))
    - Plugin: `src/ui/hint-mode.ts` (`waitForHintKey` handler — modifier-key guard before `preventDefault`)
- **Hint mode: count prefix (`2F`) shifts focus to new tab immediately** — when using a count prefix (e.g., `2F`) in non-editor context, the first hint activation shifted focus to the newly opened tab, causing the second round of hints to appear on the wrong tab. Root cause: `hintActivate()` with `openInNewPane=true` calls `navigateWithJump()` or `duplicateLeaf()`, both of which focus the new leaf. The next `run(count-1)` then showed hints on the new tab. Fixed by saving the original active leaf before `waitForHintKey` when count > 1, and restoring focus to it after each activation before scheduling the next round. ([#98](https://github.com/saberzero1/motions/issues/98))
    - Plugin: `src/ui/hint-mode.ts` (`createHintAction` — `originalLeaf` capture + `setActiveLeaf` restore before recursive `run`)
- **Hint mode: `<leader><leader>h` ignores count prefix** — the `hintMode` action defined via `defineAction` did not accept `ActionArgs`, so `actionArgs.repeat` (the count from vim's input state) was never passed to `activate()`. Count prefix only worked in non-editor context (via global key handler). Fixed by accepting `(_cm, actionArgs)` and passing `actionArgs.repeat`. ([#98](https://github.com/saberzero1/motions/issues/98))
    - Plugin: `src/main.ts` (`defineAction('hintMode')` — accept `actionArgs`, pass `repeat` to `activate`)

### Tests

- 6 e2e tests in `test/specs/hint-mode.e2e.ts` (issue #98): Ctrl alone keeps labels, Shift alone keeps labels, Alt alone keeps labels, Meta alone keeps labels, Ctrl then label char still narrows labels, `2F` keeps focus on original graph view leaf

## [0.92.1] - 2026-07-31

### Fixed

- **Ctrl hotkeys broken on active tab after closing Oil explorer** — after closing Oil (via `q`, `:q`, or `closeOil()`), `Ctrl`-based hotkeys (`<C-d>`, `<C-f>`, `<C-b>`, etc.) stopped working on the restored file until the user switched to another tab and back. Root cause: `OilView.onClose()` called `removeChild(editor)` which triggers `unload()` but not `destroy()`. The `popKeymapScope` call that removes the Oil-specific Obsidian `Scope` (with `Ctrl+T/S/H/L/C` handlers) lives in `destroy()`, so the scope remained pushed on the keymap stack after Oil was gone — intercepting Ctrl keys and silently consuming them. Fixed by calling `this.editor.destroy()` before `removeChild()` in `onClose()`. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/oil-view.ts` (`onClose` — explicit `destroy()` before `removeChild`)

### Tests

- 2 e2e tests in `test/specs/oil-poc.e2e.ts`: Ctrl keys work after closing Oil via `closeOil()` (scope cleanup regression), Ctrl keys work after opening and closing Oil multiple times (scope stack leak detection)

## [0.92.0] - 2026-07-31

### Fixed

- **Oil `<C-t>`/`<C-s>`/`<C-h>` keybindings intercepted by Obsidian default hotkeys** — pressing `<C-t>` in Oil opened an empty Obsidian tab instead of the file under cursor. `<C-s>` triggered Obsidian's save and `<C-h>` triggered search & replace. Root cause: Obsidian's default hotkeys (`Ctrl+T` = new tab, `Ctrl+S` = save, `Ctrl+H` = search & replace) fire at the Electron level before the embeddable editor's vim key handler receives the event. The vim mapping (`vim.map('<C-t>', ':oilopentab<CR>', 'normal')`) never executed. Fixed by registering `Ctrl+T`, `Ctrl+S`, `Ctrl+H`, `Ctrl+L`, and `Ctrl+C` on the embeddable editor's Obsidian `Scope` (the same mechanism that already intercepts `Mod+Enter`). Scope-registered keys fire before Obsidian's default hotkeys. Navigation keys (`<C-t>`, `<C-s>`, `<C-h>`) blur the editor before calling the manager action so the `setActiveLeaf` guard in the embeddable editor allows the new leaf through. Non-navigation keys (`<C-l>` refresh, `<C-c>` close) call the manager directly. The ex commands (`:oilopent`, `:oilopensv`, `:oilopensh`, `:oilrefresh`, `:oilclose`) continue to work via `vim.defineEx` for users who prefer typing them. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/editors/embeddable-editor.ts` (`registerScopeKey()` method on `EmbeddableMarkdownEditor` interface and `ConcreteEmbeddableEditor` class — delegates to the internal Obsidian `Scope`), `src/oil/oil-view.ts` (`registerOilScopeKeys()` — registers 5 Ctrl-key combos on the editor scope with blur-before-navigate for cross-leaf actions)

### Tests

- 1 e2e test in `test/specs/oil-poc.e2e.ts`: `<C-t>` opens file in new tab and focuses it (regression test — verifies active file is the target, active view type is markdown, Oil view still exists, leaf count increased)

## [0.91.0] - 2026-07-30

### Fixed

- **Which-key popup disappears quickly in non-editor views** — in non-editor views (reading view, graph, canvas, etc.), the which-key popup appeared and vanished after ~500ms instead of staying visible until the user completed the key sequence. Root cause: the global key handler's 1000ms `SEQUENCE_TIMEOUT` fired `resetSequence()` unconditionally, dismissing the popup even when partial completions existed. In editor mode, the which-key overlay stays open until the command completes (driven by `vim-keypress`/`vim-command-done` events, not a fixed timer). Fixed by checking for partial matches when the timeout fires — if the current key buffer has pending completions in the registry, the timeout restarts instead of resetting. The popup now stays alive until the user completes or abandons the sequence. ([#97](https://github.com/saberzero1/motions/issues/97))
    - Plugin: `src/workspace/global-key-handler.ts` (`startTimeout` — partial-match check before `resetSequence`)
- **`gt` always navigates to first tab instead of next tab in non-editor views** — pressing `gt` without a count prefix in non-editor views (graph, canvas, reading view) always jumped to the first tab instead of cycling to the next tab. Root cause: `dispatch()` in the global key handler used `this.count || 1`, making count 0 (no count typed) indistinguishable from count 1 (user typed `1gt`). The `gt` handler's `if (count > 0)` always triggered `gotoNthTab(app, 1)`. Fixed by passing `this.count` directly to `builtin` handlers, letting each handler decide its own default. The `gt` handler already had the correct branching (`count > 0` → nth tab, else → next tab). Other handlers (`j`/`k` scroll, hint actions) apply `count || 1` locally. ([#97](https://github.com/saberzero1/motions/issues/97))
    - Plugin: `src/workspace/global-key-handler.ts` (`dispatch` — raw `this.count` for builtin, `this.count || 1` for obcommand repeat), `src/workspace/global-defaults.ts` (local `count || 1` in scroll/hint handlers)
- **`Ngt` (count + gt) ignored count in editor views** — pressing `2gt` or `3gt` in an editor view always went to the next tab instead of the Nth tab. Root cause: the editor-mode `gt` was mapped to `workspace:next-tab` via `createCommandAction`, which ignores `actionArgs.repeat` entirely. The count-aware `gotoTab` action was only mapped to `g<C-t>`. Fixed by replacing the `gt` mapping with a new `gtAction` that uses `actionArgs.repeatIsExplicit` to distinguish "no count typed" (next tab) from "count N typed" (go to tab N). ([#97](https://github.com/saberzero1/motions/issues/97))
    - Plugin: `src/workspace/navigation.ts` (`gtAction` — `repeatIsExplicit` check, `gotoNthTab` for explicit count, `workspace:next-tab` for no count)
- **`gotoNthTab` counted sidebar leaves in tab numbering** — `Ngt` and `g<C-t>` counted all workspace leaves (including sidebar panes) when determining the Nth tab. `3gt` could navigate to a sidebar pane instead of the 3rd editor tab. Fixed by filtering leaves with `leaf.getRoot() === app.workspace.rootSplit` to only count main editor area leaves, matching the existing pattern in `src/lua/loader.ts`. ([#97](https://github.com/saberzero1/motions/issues/97))
    - Plugin: `src/workspace/global-defaults.ts` (`gotoNthTab` — `rootSplit` filter), `src/workspace/navigation.ts` (`createGotoTabAction` — `rootSplit` filter)

- **Oil editor degraded when opened from non-editor context** — opening Oil from an empty pane, settings view, graph view, or any non-markdown context produced a broken editor: keybindings (`g?`, `<CR>`, `q`) didn't work, which-key popup didn't appear, and the cursor could move through concealed icon ranges character by character. Two root causes: (1) In `embeddable-editor.ts`, the `builtinVimOn` closure variable captured `isVimEnabled(app)` which returns `true` when the bundled fork is active — making the guard `!builtinVimOn && isBundledVimActive()` always false and the explicit vim extension push dead code. The embedded editor relied entirely on Obsidian's `registerEditorExtension()` injection to receive vim, which could fail on leaves that had never hosted a MarkdownView. Fixed by removing the dead guard and adding a post-construction `ensureVimExtension()` safety net that checks for vim presence via `getCM()` and appends it via `StateEffect.appendConfig` only if absent. (2) In `manager.ts`, `openOil()` called `getLeaf(false)` which reuses the current leaf — when that leaf was a non-editor view (empty pane, settings), it lacked initialized editor infrastructure. Fixed by priming the leaf with a temporary markdown view state (`setViewState({ type: 'markdown' })`) before switching to the Oil view type when no MarkdownView is active.
    - Plugin: `src/editors/embeddable-editor.ts` (removed `builtinVimOn` closure, removed dead vim push from `buildLocalExtensions`, added `ensureVimExtension()` with `getCM` check + `StateEffect.appendConfig` fallback, replaced `isVimEnabled` import with `isBuiltinVimEnabled` + `getCM`), `src/oil/manager.ts` (`openOil` — leaf priming with `setViewState({ type: 'markdown' })` when no active MarkdownView)
- **Cannot open files/folders from Oil explorer at vault root** — after the v0.90.0 fix, pressing `<CR>` on any file or folder in the Oil explorer did nothing. Root cause: `discoverAndMergeHidden()` called `cache.loadDirectory()` three times during a single refresh cycle, causing buffer entry IDs to become out of sync with the cache. Entry lookup by ID returned `undefined`, so `openEntryAtCursor()` silently aborted. Fixed by passing the expected buffer content from the initial render as a parameter to `discoverAndMergeHidden()`, eliminating the redundant `renderDirectoryToBuffer()` call that triggered the third `cache.loadDirectory()`. The cache is now updated exactly once per merge. Confirmed by spike unit test demonstrating ID desync (buffer IDs [1,2] vs cache IDs [6,7]). ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/manager.ts` (`discoverAndMergeHidden` — accepts `expectedContent` parameter, removed redundant `renderDirectoryToBuffer` call), `src/oil/oil-view.ts` (callers pass rendered content)
- **Oil explorer title bar does not update when navigating directories** — after navigating from one directory to another, the tab header continued to show the original directory name. Root cause: `setDirectory()` and `refreshContent()` updated `this.dirPath` but never signaled Obsidian to re-read `getDisplayText()`. Fixed by adding `notifyHeaderChanged()` which calls `leaf.updateHeader()` (Obsidian internal) after dirPath changes, in `setDirectory()`, `refreshContent()`, and `setState()`. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/oil-view.ts` (`notifyHeaderChanged` private method, called from `setDirectory`, `refreshContent`, `setState`)
- **Hidden files toggle (`g.`) has no effect** — pressing `g.` in Oil to toggle hidden files did nothing. Root cause: `this.settings.oilShowHiddenFiles ?? this.showHidden` used the nullish coalescing operator (`??`), but `oilShowHiddenFiles` is typed as `boolean` (default `false`), so `??` never fell through to the runtime toggle `this.showHidden`. Fixed by replacing the boolean field with a `showHiddenOverride: boolean | null` (null = use setting) and a `getEffectiveShowHidden()` helper that prioritizes the override when set. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/manager.ts` (`showHiddenOverride` field, `getEffectiveShowHidden()` helper, `toggleHidden()` rewritten)
- **`<CR>` in Oil opens file in new tab instead of replacing Oil view** — pressing Enter on a file in Oil opened it in a new tab, leaving the Oil view in the original tab. In oil.nvim, `<CR>` (select) opens the file in the same window, replacing the oil buffer. Root cause: `navigateWithJump()` used `openLinkText()` which cannot replace a custom view type. Fixed by using `leaf.openFile()` directly on the Oil leaf via `navigateWithJumpFile()`, matching the pattern used by `closeOil()`. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/manager.ts` (`openEntryAtCursor` rewritten to use `openFileInLeaf`, new `openFileInLeaf` private method), `src/oil/keybindings.ts` (`oilOpenEntry` delegates to `manager.openEntryAtCursor()`)

### Added

- **Oil `<C-t>` open in new tab** — new `:oilopentab` ex command mapped to `<C-t>`, matching oil.nvim's default. Opens the file under cursor in a new tab while keeping the Oil view in the current tab.
    - Plugin: `src/oil/manager.ts` (`openEntryAtCursorInNewTab`), `src/oil/keybindings.ts` (mapping + action)
- **Oil `<C-s>` / `<C-h>` split open** — new `:oilopensv` and `:oilopensh` ex commands mapped to `<C-s>` (vertical split) and `<C-h>` (horizontal split), matching oil.nvim's defaults. Opens the file under cursor in a split pane alongside the Oil view.
    - Plugin: `src/oil/manager.ts` (`openEntryAtCursorInSplit`), `src/oil/keybindings.ts` (mappings + actions)
- **Oil `<C-c>` close** — `<C-c>` now maps to `:oilclose`, matching oil.nvim's default close binding. `q` remains as an additional close key.
    - Plugin: `src/oil/keybindings.ts` (mapping)
- **Oil `gx` open in default app** — new `:oilopenexternal` ex command mapped to `gx`, matching oil.nvim's default. Opens the file under cursor in the system's default application via `app.openWithDefaultApp()`.
    - Plugin: `src/oil/manager.ts` (`openEntryExternalAtCursor`), `src/oil/keybindings.ts` (mapping + action)

### Tests

- 13 unit tests in `test/unit/global-key-handler.test.ts`: dispatch count for builtin actions (count=0, count=1, count=3, count reset after dispatch), dispatch count for obcommand actions (once without count, N times with count), gt tab navigation issue #97 (gt without count → next tab, 3gt → nth tab, 1gt → nth tab), sequence timeout with partial matches (keeps alive, dispatches after restart, resets on no match, no lingering after exact match)
- 4 unit tests in `test/unit/global-defaults.test.ts`: gotoNthTab via gt mapping (skips sidebar leaves, first root tab for count=1, no-op when count exceeds tabs, workspace:next-tab for count=0)
- 11 e2e tests in `test/specs/global-nav.e2e.ts` (issue #97): editor-mode Ngt (gt without count → next tab not first, 1gt → first, 2gt → second, 3gt → third, 9gt → stays), non-editor-mode Ngt (gt → next, 1gt → first, 2gt → second, 3gt → third, 9gt → stays), sequence timeout updated (partial match keeps sequence alive)
- 12 unit tests in `test/unit/oil-cache-sync.test.ts`: cache ID synchronization after render (5 tests), `getEffectiveShowHidden` override logic (5 tests), `renderDirectory` at vault root (2 tests)
- 11 e2e tests in `test/specs/oil-poc.e2e.ts`: vault root folder navigation (2 tests), title bar update on directory change (2 tests), hidden files toggle (1 test), same-leaf file open (1 test), `<C-t>` keymap registration (1 test), vertical and horizontal split open (2 tests), `gx` method registration (1 test), Obsidian reload for split cleanup (1 test)
- `Modal` class added to `test/unit/__mocks__/obsidian.ts` to unblock unit tests importing `manager.ts`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked Oil non-editor context degradation as fixed; updated vim state per-editor note with `ensureVimExtension()` safety net
- `CONTRIBUTING.md`: Updated `embeddable-editor.ts` description (ensureVimExtension safety net) and `manager.ts` description (leaf priming)
- `AGENTS.md`: Updated dual-vim architecture section with embedded editor vim injection and safety net
- `docs/features/oil-explorer.md`: Added non-editor context opening note
- `KNOWN_LIMITATIONS.md`: Added which-key popup timeout fix and gt/Ngt tab navigation fixes
- `docs/features/workspace-navigation.md`: Added Ngt count support description and which-key timeout fix note
- `docs/reference/keybindings.md`: Already had `Ngt` row — no change needed
- `CONTRIBUTING.md`: Updated `global-key-handler.ts` and `global-defaults.ts` descriptions
- `KNOWN_LIMITATIONS.md`: Marked Oil cache desync, title bar, and hidden toggle as fixed; added `<CR>` same-leaf fix; added new keymaps (`<C-t>`, `<C-s>`, `<C-h>`, `<C-c>`, `gx`)
- `docs/features/oil-explorer.md`: Updated Oil ex commands table with new keymaps
- `docs/features/ex-commands.md`: Updated Oil ex commands table with new keymaps
- `docs/reference/keybindings.md`: Updated Oil keybindings table with new keymaps
- `CONTRIBUTING.md`: Updated Oil keybindings description
- `README.md`: Updated Oil feature description with oil.nvim-matching keybindings

## [0.90.0] - 2026-07-30

### Fixed

- **Note freezes in Reading Mode after closing Oil explorer** — closing the Oil explorer view (via `q`, `:q`, `:wq`, or Lua `vim.ob.oil.close()`) reopened the previous file in Obsidian's default mode (often Reading/Preview) instead of the mode the user was in when they opened Oil. Root cause: `openOil()` captured `previousFile` (path only) but not the editor's view mode. Fixed by capturing `previousViewMode` (the `MarkdownView` state: source mode, live preview, or reading mode) when opening Oil and restoring it via `leaf.openFile(file, { state: previousViewMode })` on close. All 4 close paths (keybindings `q`, ex commands `:q`/`:wq`, and Lua API `vim.ob.oil.close()`) are unified into a single `closeOil()` method on `OilManager`. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/oil-view.ts` (`previousViewMode` field, `getState`/`setState` extended, `getPreviousViewMode` getter), `src/oil/manager.ts` (`openOil` captures mode via `MarkdownView.getState()`, new `closeOil()` shared method with mode restoration), `src/oil/keybindings.ts` (`oilClose` delegates to `manager.closeOil()`), `src/workspace/commands.ts` (`closeOilView` delegates to `oilManager.closeOil()`), `src/main.ts` (Lua API `oilClose` delegates to `oilMgr.closeOil()`)
- **Cursor focus lost when switching back to Oil tab** — after opening a file from Oil and then switching back to the Oil tab via `gT` or Obsidian's tab navigation, the cursor focus was missing. Keystrokes were not captured by the Oil editor until the user clicked with the mouse. Root cause: Oil's editor focus was set only once in `onOpen()` and never re-applied when switching back. Fixed by adding a `focusEditor()` method to `OilView` and calling it from `OilKeybindingManager.onActiveLeafChange()` when switching into an Oil view. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/oil-view.ts` (`focusEditor()` public method), `src/oil/keybindings.ts` (`onActiveLeafChange` calls `view.focusEditor()` when switching to Oil)
- **`:Oil .` opens current file's directory instead of vault root** — running `:Oil .` opened the directory containing the current active file rather than the vault root. In oil.nvim, `.` means current working directory, which maps to the vault root in Obsidian. Root cause: the condition `if (!dirPath || dirPath === '.' || dirPath === '/')` treated `.` identically to an empty argument. Fixed by separating `.` and `/` into their own branch that resolves to vault root (`""`), while the empty-argument case continues to resolve to the current file's parent directory. Both the ex command handler (`commands.ts`) and global ex command handler (`global-ex-command.ts`) are updated. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/workspace/commands.ts` (`:Oil` ex command path resolution), `src/ui/global-ex-command.ts` (global ex command path resolution)
- **Hidden files (dotfiles) not shown in Oil explorer** — hidden files and folders (e.g., `.gitignore`, `.git/`) were not visible in Oil even with "Show hidden files" enabled. Root cause: `app.vault.getFiles()` and `app.vault.getAllFolders()` only return Obsidian-indexed files, and Obsidian does not index dotfiles. Fixed by adding a two-pass rendering approach: the initial sync render uses the Vault API (unchanged), then an async second pass discovers hidden entries via `app.vault.adapter.list()` (which returns all filesystem entries including dotfiles) and merges them into the listing. A race condition guard prevents overwriting user edits during the async merge. Hidden files are currently view-only — CRUD operations on dotfiles may fail because they lack `TFile`/`TFolder` objects in the Vault index. ([#93](https://github.com/saberzero1/motions/issues/93))
    - Plugin: `src/oil/render.ts` (exported `getParentPath`/`isInConfigDir`, new `discoverHiddenEntries()` function), `src/oil/manager.ts` (new `discoverAndMergeHidden()` method with race condition guard), `src/oil/oil-view.ts` (`setEditorContent()` method, async trigger in `onOpen()` and `refreshContent()`)
- **Inconsistent behavior when deleting surroundings with doubled symmetric delimiters** — `ds$` on `$$example$$` did nothing instead of deleting the innermost `$` pair to produce `$example$`. Same failure for `ds"` on `""hi""`, `cs$` on `$$example$$`, and other symmetric (same open/close) surround characters when doubled. Root cause: `findSurroundingQuotes()` in the codemirror-vim fork paired all quote positions sequentially at even/odd indices (`i += 2`). For `$$example$$` with positions `[0, 1, 9, 10]`, this created pairs `(0,1)` and `(9,10)` — the two adjacent `$$` on each side — leaving the cursor between them with no match. Fixed by replacing the sequential pairing with cursor-expansion: search backward from cursor for the nearest quote character (open), then forward for the next one (close). This correctly handles both doubled delimiters (`$$example$$` → finds inner pair `(1, 9)`) and adjacent pairs (`"hello" "world"` → finds pair around cursor). ([#96](https://github.com/saberzero1/motions/issues/96))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`findSurroundingQuotes` — cursor-expansion algorithm replacing sequential `i += 2` pairing)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (added "Symmetric surround quote matching" section)
- **Snippet ex commands do not work after vimrc/Lua config reload** — `:snippet <name>` and `:snippets` ex commands silently stopped working after any `reloadFeatures()` cycle (triggered by vimrc loading, Lua config loading, or settings changes). Root cause: `registerSnippetCommands()` was called only in `onload()`, but `reloadFeatures()` calls `unregisterAll()` which replaces all registered ex commands with no-ops — and snippet commands were never re-registered. The Picker-based snippet insertion was unaffected because it uses a separate `pickerRegistry` not managed by `VimRegistration`. Fixed by adding `registerSnippetCommands()` to `reloadFeatures()`, matching the pattern used by all other feature registrations. ([#95](https://github.com/saberzero1/motions/issues/95))
    - Plugin: `src/main.ts` (`reloadFeatures` — added `registerSnippetCommands` call gated by `enableSnippets`)
- **Which-key shows EasyMotion commands incorrectly with space leader** — EasyMotion commands (prefixed with `<leader><leader>`) appeared at the wrong level in the which-key popup when using space as the leader key. Two root causes: (1) `LeaderRegistry.addBinding()` stripped the leader prefix using the raw leader key (`" "`), but `onKeyPressLeaderOnly()` compared against normalized keys (`"<Space>"` from `vim-keypress` events). The stored binding keys (`" f"`) never matched the normalized drill-down prefix (`"<Space>"`). Similarly, `addGroupLabel()` stored the group label key in raw format, causing `getRelativeGroupLabels()` lookups to miss. Fixed by normalizing both `lhs` and `prefix` via `normalizeVimKey()` at storage time in `addBinding()` and `addGroupLabel()`. (2) In grouped mode, `buildNextKeyEntries()` called `isSpecialKey()` to filter out non-typeable keys like `<CR>`, `<Left>`, etc. — but `<Space>` was also treated as special, causing all EasyMotion bindings (whose first key after leader-stripping is `<Space>`) to be silently dropped from the grouping. Fixed by exempting `<Space>` from the special key check. ([#94](https://github.com/saberzero1/motions/issues/94))
    - Plugin: `src/ui/which-key.ts` (`LeaderRegistry.addBinding` — normalize `lhs` and leader before stripping; `LeaderRegistry.addGroupLabel` — normalize `prefix` before storing; `isSpecialKey` — exempt `<Space>` from special key filtering)

### Tests

- 6 fork tests in `~/Repos/codemirror-vim/test/vim_test.js`: `ds_doubled_dollar_deletes_inner`, `ds_doubled_quote_deletes_inner`, `cs_doubled_dollar_changes_inner`, `ds_single_dollar_pair`, `ds_adjacent_dollar_pairs`, `ds_dollar_cursor_on_delimiter`
- 5 e2e tests in `test/specs/surround.e2e.ts` (doubled symmetric delimiters — #96): `ds$` on `$$example$$` in Live Preview, `ds"` on `""hi""`, `cs$` on `$$example$$`, `ds$` on single `$hello$`, `ds$` on adjacent `$hello$ $world$`
- 28 unit tests in `test/unit/which-key.test.ts`: `LeaderRegistry` normalization (raw space leader, pre-normalized leader, format consistency, non-leader rejection, bare-leader rejection, deduplication, backslash leader, comma leader), group label normalization (raw vs normalized prefix, cross-format consistency), `clearBuiltinBindings` with normalized keys, double-leader drill-down (issue #94 scenario — EasyMotion bindings filterable by `<Space>` prefix, single-leader bindings excluded), `isSpecialKey` (`<Space>` exempt, other angle-bracket keys special, plain keys not special)
- 2 e2e tests unskipped in `test/specs/snippets/snippet-variables.e2e.ts`: `:snippet` command expands by name, `:snippets` opens picker
- 1 e2e test in `test/specs/settings-reload.e2e.ts`: snippet ex commands survive `reloadFeatures()` (regression test for [#95](https://github.com/saberzero1/motions/issues/95))
- 17 unit tests in `test/unit/oil-render.test.ts`: `getParentPath` (4 tests), `isInConfigDir` (4 tests), `discoverHiddenEntries` (9 tests — dotfiles, dot-folders, index exclusion, config dir exclusion, non-dotfile exclusion, adapter.list failure graceful fallback, nested paths, mixed entries, empty results)
- 5 e2e tests in `test/specs/oil-poc.e2e.ts` (Oil explorer #93): `:Oil .` opens vault root, `:Oil /` opens vault root, closing oil restores source mode, closing oil restores live preview mode, `closeOil()` restores previous file

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added surround doubled symmetric delimiter fix
- `AGENTS.md`: Updated fork test count (1882)
- `DIFFERENCES.md` (fork): Added "Symmetric surround quote matching" section
- `docs/features/surround.md`: Added doubled delimiter behavior note
- `KNOWN_LIMITATIONS.md`: Added hidden files view-only limitation to Oil section; marked Reading Mode freeze, focus loss, and `:Oil .` path resolution as fixed
- `CONTRIBUTING.md`: Updated Oil codebase structure descriptions (`oil-view.ts`, `manager.ts`, `render.ts`)
- `docs/features/oil-explorer.md`: Updated with mode restoration on close, focus restoration on tab switch, `:Oil .`/`:Oil /` path semantics, hidden files via adapter API, view-only dotfile limitation
- `docs/features/ex-commands.md`: Updated `:Oil` argument description
- `docs/reference/keybindings.md`: Updated `:Oil` description with `.`/`/` path support
- `KNOWN_LIMITATIONS.md`: Marked ex command snippet expansion as fixed; added which-key EasyMotion double-leader fix to which-key overlay section
- `docs/features/snippets.md`: Updated ex command trigger description noting reload survival
- `docs/configuration/which-key.md`: Added note about double-leader prefix grouping for EasyMotion

## [0.89.0] - 2026-07-30

### Fixed

- **Insert-mode surround dot-repeat** — `.` after `i<C-G>s{char}text<Esc>` now replays the full surround + typed text. Previously, dot-repeat replayed only the typed text without delimiters. The fork stores `_surroundInsertChar` and `_surroundInsertNewline` on `lastInsertModeChanges`. During replay, `replaySurroundAwareInsert` (inside `repeatLastEdit`) strips the delimiter entry from `changes[0]`, inserts `pair.open`, replays typed text via `repeatInsert`, then inserts `pair.close`. Wrapped in `cm.operation()` for undo atomicity. Counted dot-repeat (`2.`) repeats the text inside one set of delimiters. This exceeds both vim-surround and nvim-surround, where insert-mode surround dot-repeat is broken ([nvim-surround #301](https://github.com/kylechui/nvim-surround/issues/301)). ([#82](https://github.com/saberzero1/motions/issues/82))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`createInsertModeChanges`, `recordLastEdit`, `surroundInsert`, `surroundInsertNewline`, `replaySurroundAwareInsert` in `repeatLastEdit`, `onCursorActivity`), `~/Repos/codemirror-vim/src/types.ts` (`_surroundInsertChar`, `_surroundInsertNewline` fields)

### Tests

- 9 fork tests in `~/Repos/codemirror-vim/test/vim_test.js`: `dot_insert_surround_unspaced`, `dot_insert_surround_spaced`, `dot_insert_surround_quotes`, `dot_insert_surround_empty`, `dot_insert_surround_counted`, `dot_insert_surround_no_cross_session_leak`, `dot_insert_surround_no_leak_after_o`, `dot_insert_surround_before_text_lost`, `dot_insert_surround_alias_b`

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked insert-mode surround dot-repeat as fixed; separated macro recording limitation into own section
- `README.md`: Updated surround feature description with insert-mode dot-repeat
- `AGENTS.md`: Updated codemirror-vim fork description with insert-mode surround dot-repeat and test count (1870)
- `DIFFERENCES.md` (fork): Updated insert-mode surround section with dot-repeat implementation details
- `docs/features/surround.md`: Updated insert mode and dot-repeat sections with insert-mode dot-repeat behavior

## [0.88.0] - 2026-07-30

### Added

- **Yank-ring dot-repeat** — pressing `.` after paste cycling (`p` + `<C-p>`/`<C-n>`) now repeats the final cycled text instead of the original paste. On cycling exit, the final cycled content is written to the original paste register. The fork's `repeatLastEdit` re-reads the register at replay time. Follows [yanky.nvim](https://github.com/gbprod/yanky.nvim)'s `update_register_on_cycle` semantics. System clipboard registers (`"+`/`"*`) are excluded.
    - Plugin: `src/vim/yank-ring.ts` (`originalPasteRegister` tracking, `getPasteRegisterName()`, register write in `cancel()`, `setVim()`)
- **`undefineEx` fork API** — the codemirror-vim fork now exposes `Vim.undefineEx(name)` to remove ex commands registered via `defineEx`. Cleans both the `exCommands` function map and `commandMap_` prefix lookup. Returns `true` if the command existed, `false` otherwise.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`undefineEx` on `vimApi`)
- **Exmap unregistration on vimrc soft-reload** — removing an `exmap` definition from the vimrc file now unregisters the old handler on save. Exmap names are tracked per vimrc load in `vimrcExmapNames` and cleaned via `undefineEx` before re-applying on soft-reload. Plugin-defined and fork built-in ex commands are unaffected.
    - Plugin: `src/main.ts` (`vimrcExmapNames` Set, cleanup in `softReloadVimrc`), `src/vimrc/loader.ts` (`exmapNames` in `ApplyResult` and `VimrcLoadResult`), `src/types/vim-api.d.ts` (`undefineEx` type, `setText` on registers, `lastEditInputState` on `VimState`)

### Tests

- 3 fork tests in `~/Repos/codemirror-vim/test/vim_test.js`: `ex_undefineEx` (define → undefine → verify removed), `ex_undefineEx_nonexistent` (returns false), `ex_undefineEx_short_name` (short name prefix cleaned)
- 3 e2e tests in `test/specs/yank-ring.e2e.ts`: dot-repeat after single cycle pastes cycled text, dot-repeat without cycling pastes original (regression), single cycle then dot-repeat pastes cycled text
- 4 e2e tests in `test/specs/vimrc-exmap-reload.e2e.ts`: `vimrcExmapNames` field exists, `undefineEx` available on Vim API, returns false for nonexistent, defineEx + undefineEx round-trip with built-in survival

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Removed `:earlier`/`:later` and `:sign` from N/A table (contradicted implemented features); clarified flash dot-repeat as working correctly; updated exmap soft-reload to reflect unregistration support; updated yank-ring dot-repeat as fixed
- `README.md`: Updated yank-ring feature description with dot-repeat
- `AGENTS.md`: Updated codemirror-vim fork description with `undefineEx` API and test count
- `docs/features/quality-of-life.md`: Updated yank-ring section with dot-repeat behavior
- `docs/configuration/vimrc.md`: Updated soft-reload section — exmap removal now works

## [0.87.0] - 2026-07-29

### Added

- **Hotkey conflict detection wizard** — on plugin load, detects when Obsidian's default hotkeys (Ctrl+W, Ctrl+D, Ctrl+F, Ctrl+B) conflict with workspace navigation keys. Shows a one-time Notice per plugin version with a "Check hotkey conflicts" button in **Settings → Vim Motions → Navigation** that lists each active conflict with step-by-step unbinding instructions. Skipped on mobile and when workspace nav is disabled.
    - Plugin: `src/workspace/hotkey-conflicts.ts` (new — conflict detection via `hotkeys.json`, `VimInfoModal` display), `src/settings.ts` (`conflictNoticeDismissedVersion` setting, button in both declarative and imperative settings paths), `src/main.ts` (detection on `onLayoutReady`)
- **Per-view `CursorMoved`/`TextYankPost`/`CursorHold`/`CmdlineEnter`/`CmdlineLeave` autocmd events** — extends the per-view autocmd pattern (already implemented for mode events via `AutocmdModeWatcher`) to 5 additional events. `CursorMoved` fires independently per view with position-change detection (only fires when cursor actually moved). `TextYankPost` fires from any view including popovers. `CursorHold` fires per-view with configurable delay. Built-in vim mode retains active-leaf-only behavior.
    - Plugin: `src/vim/autocmd-event-watcher.ts` (new — `AutocmdEventWatcher` ViewPlugin), `src/lua/autocmd.ts` (`useEventViewPlugin` flag, per-view handler methods, gated legacy bindings), `src/main.ts` (extension registration, callback wiring, hold delay sync)
- **Visual-mode paste cycling** — yank-ring paste cycling now works after visual-mode paste (`viw` + `p` + `<C-p>` to cycle). Detects visual paste via anchor/cursor position comparison at snapshot time. Computes paste range via doc-length arithmetic. Visual block paste is excluded. Normal-mode paste cycling is unaffected.
    - Plugin: `src/vim/yank-ring.ts` (`snapshot()` helper, `posMin()`, visual paste detection in `onCommandDone`, `prevAnchor`/`prevDocLength`/`prevSelectionLength`/`prevVisualLine`/`prevVisualBlock` tracking)
- **Console warning for unknown `set` options** — unknown `set` options in vimrc now produce a `console.warn` on first encounter per vimrc load. Options recognized by either the plugin (`KNOWN_SET_OPTIONS`) or CM Vim built-in options are not warned about. Deduplication prevents repeated warnings for the same option.
    - Plugin: `src/vimrc/loader.ts` (`KNOWN_CM_VIM_OPTIONS` set, `warnedSetOptions` deduplication, `clearSetOptionWarnings()`)

### Changed

- **Flash count prefix now honored with labels** — `3f{char}` with 2+ matches now jumps directly to the 3rd match without showing the label overlay. When the count exceeds available matches, the last match is used (Neovim parity). `f{char}` without a count prefix still shows labels for 2+ matches. Works in operator-pending mode (`d3f{char}`) and with `t`/`T` till motions.
    - Plugin: `src/flash/char-mode.ts` (count prefix check before label overlay)
- **Flash dot-repeat clarified** — dot-repeat after `df{char}{label}` already works correctly. The fork stores the resolved position via `_asyncMotionTarget` and `repeatLastEdit` replays the operator to the same relative offset. The label UI does not re-appear (correct vim behavior). KNOWN_LIMITATIONS.md entry clarified.

### Fixed

- **Cursor focus lost when pressing Tab to navigate cells in Embedded table widget** — pressing `Tab` in insert mode inside an embedded table cell editor froze the editor. The cursor disappeared, vim mode got stuck in Insert mode, and `Escape` stopped working. Root cause: `exitCellEdit()` scheduled a 50ms `refreshAfterOp()` timer that was non-cancellable and had no state guard. When `Tab` called `exitCellEdit()` → `enterCellEdit()` synchronously, the deferred refresh fired while the new cell editor was active — removing its key handlers, potentially rebuilding the widget DOM (orphaning the editor), and leaving the controller in an inconsistent state (`cell-edit` state with `table-nav` handlers). Fixed with four layers of defense: (1) `refreshAfterOp()` now stores and deduplicates the timer ID in a `refreshTimer` member, cancelled in `exitTable()`, `enterCellEdit()`, and `destroy()`. (2) `doRefreshAfterOp()` guards against firing in `cell-edit` or `inactive` state. (3) `exitCellEdit()` accepts `{ skipRefresh: true }` — the Tab handler skips both `setActiveEditTableRange(null)` and `refreshAfterOp()` to prevent widget DOM rebuilds during cell-to-cell transitions. (4) `enterCellEdit()` cancels any pending refresh timer as belt-and-suspenders protection. Additionally, `Tab` at the last cell of the last row (or `Shift-Tab` at the first cell) now returns to table-nav mode instead of silently re-entering the same cell. ([#92](https://github.com/saberzero1/motions/issues/92))
    - Plugin: `src/vim/table-nav-controller.ts` (`refreshTimer` member, `refreshAfterOp` timer storage/dedup, `doRefreshAfterOp` state guard, `exitCellEdit` `skipRefresh` param, `handleCellEditKey` rewrite with widget re-query and boundary handling, `enterCellEdit` timer cancel and `pendingD` cleanup)
- **Visual mode highlighting in embedded table cell editors** — entering charwise visual mode (`v`) in an embedded table cell editor now shows selection highlighting. The cell editor's CM6 instance doesn't receive `.cm-focused`, which previously caused the browser to hide `::selection` highlights. Fixed by adding a `CSSStyleSheet` on `document.adoptedStyleSheets` that forces `::selection` visibility in `.cm-vimVisual:not(.cm-vimVisualLine)` scoped to `.vim-table-cell-editor`. Linewise visual mode (`V`) already worked via the fork's focus-independent `linewiseVisualHighlight` ViewPlugin. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Plugin: `src/vim/table-cell-editor.ts` (`visualSelectionSheet` via `adoptedStyleSheets`)
- **Undo tree memory eviction on file close** — in-memory undo trees (`undoTreeMap`) are now evicted when all editors for a file are closed, preventing unbounded memory growth in long sessions. Dirty trees are persisted before eviction when `undoFile` is enabled. Persisted data on disk is not deleted — reopening a file restores from persistence or starts fresh.
    - Plugin: `src/main.ts` (undo tree eviction in `active-leaf-change` handler)
- **Undo tree stale-tree notification** — when `undoFile` is enabled and a file was modified outside Obsidian between sessions, an Obsidian Notice is now shown when the persisted undo tree's `docLength` doesn't match the current file size. Detection fires at most once per file per session. Legacy persisted trees without `docLength` gracefully skip the check.
    - Plugin: `src/main.ts` (`activateUndoTreeForFile` — `docLength` comparison + Notice), `src/vim/undo-tree.ts` (`docLength` field on `SerializedUndoTree`)
- **`vim.v.insertmode` now populated** — returns `'i'` for insert mode, `'r'` for replace mode (`R`), `'v'` for virtual replace mode (`gR`), and `''` in normal/visual modes. Available in keymap function callbacks via `getInsertModeChar()`. Autocmd callbacks default to `''` (no adapter context available).
    - Plugin: `src/lua/api.ts` (`getInsertModeChar` helper, `insertmode` added to 5 `setVimVContext` callsites)

### Tests

- 2 unit tests in `test/unit/undo-tree.test.ts`: `docLength` round-trip preservation, legacy data without `docLength` graceful deserialization
- 9 unit tests in `test/unit/lua/vim-v.test.ts`: `insertmode` `'r'`/`'v'` context values, 7 `getInsertModeChar` tests (null, normal, insert, replace, virtual replace, priority, missing state)
- 2 unit tests in `test/unit/textarea-vim.test.ts`: `clearSetOptionWarnings` export and idempotency
- 5 e2e tests in `test/specs/flash-char-mode.e2e.ts`: `3fa` direct jump, `5fa` clamp to last match, `2fa` direct jump, `d3fa` operator-pending, `1fa` single match
- 8 unit tests in `test/unit/hotkey-conflicts.test.ts`: conflict array structure, detection logic (empty, full, partial, custom binding, unrelated keys)
- 10 unit tests in `test/unit/vim/autocmd-event-watcher.test.ts`: callback wiring (set/clear/extension), CursorMoved detection (fires on move, skips unchanged, fires on each distinct move), CursorHold timer (fires after delay, resets on new move, custom delay), TextYankPost
- 1 e2e test in `test/specs/yank-ring.e2e.ts`: normal-mode paste cycling regression after visual-paste changes

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Reorganized — moved 20 fixed top-level sections to new "Resolved Issues" section at bottom; updated flash count prefix, undo tree eviction, undo tree stale notification, visual mode cell editor, `vim.v.insertmode`, exmap soft-reload, unknown set option, flash dot-repeat, hotkey conflicts, per-view autocmd events, visual paste cycling, and SettingDefinitionList investigation entries
- `docs/features/flash.md`: Added count prefix behavior and dot-repeat note
- `docs/features/undo-tree.md`: Updated memory management and stale-tree notification
- `docs/features/tables.md`: Updated visual mode highlighting fix in cell editors
- `docs/features/quality-of-life.md`: Updated yank-ring with visual-mode paste cycling
- `docs/configuration/lua-config.md`: Updated `vim.v.insertmode` from deferred to active, updated per-view autocmd event list
- `docs/configuration/vimrc.md`: Added unknown set option warning behavior, updated exmap soft-reload
- `docs/configuration/settings.md`: Added hotkey conflict detection button to workspace navigation settings
- `docs/getting-started/recommended-setup.md`: Added hotkey conflict wizard note
- `README.md`: Updated flash motions, workspace navigation, and Lua configuration feature descriptions
- `AGENTS.md`: Updated autocmd event list with per-view CursorMoved/TextYankPost/CursorHold/CmdlineEnter/CmdlineLeave

## [0.86.0] - 2026-07-28

### Fixed

- **Which-key displays inaccurate count of group subcommands in "all" mode** — when `whichKeyMode` was set to "All partial keys" and the user pressed the leader key, the which-key popup showed wildly inflated `(+N)` group counts (e.g., `(+418)` instead of `(+21)`). The "All partial keys" code path (`showCompletions()`) queried `vim.getCompletions()` from the CM vim engine, which returns the entire `defaultKeymap` array — including built-in defaults, plugin-internal keymaps, and user-defined keymaps — instead of using only the `leaderBindings` registry (which contains only user-visible leader keymaps). The "Leader key only" mode (`showLeaderBindings()`) was unaffected because it already used `leaderBindings` directly. Fixed by adding an `isLeaderScope` branch in `showCompletions()` that mirrors `showLeaderBindings()` — building entries from `this.leaderBindings` filtered by the current prefix, with correct label/icon/color resolution and leader-style title formatting. Non-leader completions (`g`, `z`, `d`, etc.) continue using `vim.getCompletions()` as before. ([#91](https://github.com/saberzero1/motions/issues/91))
    - Plugin: `src/ui/which-key.ts` (`showCompletions` — `isLeaderScope` branch, deferred `getCompletions` to non-leader `else` branch)
- **Several `vim.opt` and vimrc `set` options produce "unknown vim.opt option" warning** — 12 plugin settings were documented but never registered in the Lua `vim.opt` proxy (`KNOWN_SET_OPTIONS`) or the vimrc `:set` pathway (`vim.defineOption`). Setting them via `vim.opt.yankring = true` or `set yankring` in vimrc logged a console warning and had no effect. Fixed by adding all 12 options to both registries. Options now work identically across Settings UI, vimrc, and Lua. ([#90](https://github.com/saberzero1/motions/issues/90))
    - **Added to both `KNOWN_SET_OPTIONS` and `vim.defineOption`**: `yankring`, `yankhighlightmode`, `yankhighlightduration`, `undotree`, `undofile`, `undotreemaxnodes`, `foldawarenavigation`, `foldpersistence`, `harpoon`, `dial`
    - **Added to `KNOWN_SET_OPTIONS` only** (already had `vim.defineOption`): `jumplist`, `jumplistsize`
    - Plugin: `src/vimrc/loader.ts` (12 new `KNOWN_SET_OPTIONS` entries + `setJumpListEnabled`/`setJumpListSize` imports), `src/vim/options.ts` (10 new `vim.defineOption` calls + 2 new exported setters)

### Tests

- 1 e2e test in `test/specs/lua-space-leader.e2e.ts`: which-key group count in "all" mode with space leader stays bounded to actual leader bindings (not inflated by engine-internal keymaps)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added which-key inflated group count fix; added vim.opt/vimrc option parity fix
- `docs/configuration/lua-config.md`: Added 8 missing options to vim.opt table (`harpoon`, `dial`, `jumplist`, `foldawarenavigation`, `foldpersistence`, `jumplistsize`, `yankhighlightduration`, `yankhighlightmode`)
- `docs/configuration/vimrc.md`: Added 6 missing options to vimrc tables (`harpoon`, `dial`, `foldawarenavigation`, `foldpersistence`, `yankhighlightmode`, `yankhighlightduration`)

## [0.85.0] - 2026-07-28

### Fixed

- **Scroll jumps to cursor when interacting with Meta Bind or other plugin fields in the properties panel** — the `propertiesFoldObserver` in `fold-sync.ts` watched `.metadata-container` for any `class` attribute mutation and unconditionally dispatched `EditorView.scrollIntoView(selection.main.head)`. Plugins like Meta Bind that render interactive inputs in the properties area trigger class mutations that are not fold toggles, causing the editor to scroll back to the last vim cursor position. Fixed by adding `attributeOldValue: true` to the `MutationObserver` config and comparing the old vs new `is-collapsed` class presence — the observer now only fires `scrollCursorIntoView()` when the fold state actually changes. No-op mutations (identical class string) and non-fold mutations (any class other than `is-collapsed`) are ignored. ([#89](https://github.com/saberzero1/motions/issues/89))
    - Plugin: `src/vim/fold-sync.ts` (`propertiesFoldObserver` — `is-collapsed` filter, `attributeOldValue: true`)

### Tests

- 4 e2e tests in `test/specs/properties-fold-scroll.e2e.ts`: non-fold class mutation preserves scroll position, no-op class re-assignment preserves scroll position, fold toggle triggers scroll, unfold toggle triggers scroll
- Spike test `test/specs/spikes/spike-metabind-scroll-issue89.e2e.ts`: 8 diagnostic tests confirming root cause (class mutation scroll jump, observer attribution, split-view behavior, class mutation audit)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added properties fold observer scroll fix
- `CONTRIBUTING.md`: Updated `fold-sync.ts` description with `is-collapsed` filter
- `docs/features/workspace-navigation.md`: Updated fold scroll behavior note

## [0.84.0] - 2026-07-25

### Fixed

- **Hint mode labels missing on wikilinks and markdown links when cursor is on the same line** — in Live Preview, wikilinks on the cursor's line render as `.cm-hmd-internal-link` spans (not `.cm-underline`), and markdown links render as `.cm-link`/`.cm-url` spans. These were not in `TARGET_SELECTOR`, so no hint labels appeared. In Source mode, wikilinks always render as `.cm-hmd-internal-link` and were similarly missed. Fixed by adding `.cm-hmd-internal-link`, `.cm-link`, and `.cm-url` to `OBSIDIAN_SELECTORS` and extending `classifyTarget()` to resolve links from these elements via the existing `resolveCmUnderlineHref()` pipeline. Deduplication filters prevent multiple hints per link: aliased wikilink sub-spans, nested `.cm-underline` inside `.cm-hmd-internal-link`, formatting bracket spans, and markdown link URL spans when a text span exists. ([#85](https://github.com/saberzero1/motions/issues/85))
    - Plugin: `src/ui/hint-mode.ts` (added selectors, extended `classifyTarget`, deduplication filters in `createHintAction`)
- **Hint mode link resolution fails in Obsidian runtime** — `getEditorViewFromElement()` used the DOM `.cmView.view` property to access the CM6 EditorView, but this property is not accessible in Obsidian's runtime environment (only works in the WDIO test context). All resolved links returned `href: undefined`, causing hint labels to appear but do nothing when activated. Fixed by falling back to the `MarkdownView.editor.cm` path (the same accessor used by the rest of the codebase via `getEditorView()` in `src/util/editor.ts`). ([#85](https://github.com/saberzero1/motions/issues/85))
    - Plugin: `src/ui/hint-mode.ts` (`getEditorViewFromElement` fallback via `app.workspace.getActiveViewOfType(MarkdownView)`)
- **Hint mode does not open external URLs from editor links** — when `resolveCmUnderlineHref()` resolved an external URL (e.g., `https://example.com`), `hintActivate()` fell through to the generic click handler because the `isInternalLink` check excluded URLs starting with `http://` or `https://`. The generic click handler dispatches pointer/click events on `<span>` elements, which have no click handler and produce no effect. Fixed by adding an explicit `window.open(linkHref)` path for external URLs. ([#85](https://github.com/saberzero1/motions/issues/85))
    - Plugin: `src/ui/hint-mode.ts` (`hintActivate` external URL branch)

### Tests

- 9 new e2e tests in `test/specs/hint-mode-links.e2e.ts`: Source mode navigation (plain, aliased, inline wikilinks), cursor-on-line Live Preview navigation, multiple wikilinks on same line, aliased wikilink deduplication, `yf` yank on wikilink, `F` open-in-new-tab on wikilink, embed wikilink hint visibility
- Mode-switching helpers (`ensureLivePreview`, `ensureSourceMode`, `isLivePreview`, `isSourceMode`) extracted to `test/helpers.ts`
- Spike test `test/specs/spikes/spike-hint-wikilink-issue85.e2e.ts`: 17 diagnostic tests probing DOM element discovery, `posAtDOM` mapping accuracy, `findLinkAtCursor` resolution, and end-to-end hint activation across Live Preview, Source mode, and Reading view

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated hint mode target classification with `.cm-hmd-internal-link`, `.cm-link`, `.cm-url` selectors, deduplication filter descriptions, EditorView fallback, and external URL handling
- `CONTRIBUTING.md`: Updated `hint-mode.ts` description with cursor-on-line and Source mode link resolution, EditorView MarkdownView fallback, external URL handling
- `docs/features/hint-mode.md`: Updated link handling section with Source mode support, cursor-on-line behavior, and external URL opening

## [0.83.0] - 2026-07-25

### Fixed

- **Autocmd mode events only fire in the active editor leaf** — `InsertEnter`, `InsertLeave`, and `ModeChanged` autocmd events now fire per-view across all editors (split panes, popover hover-preview editors, canvas card text inputs) when using the bundled vim fork. Previously, these events only fired for the active workspace leaf because the `AutocmdManager` bound to a single adapter via `onActiveLeafChange()`. Non-leaf editors (popovers, canvas cards) never triggered `active-leaf-change`, so autocmd callbacks for mode events never executed in these contexts. Fixed by adding `AutocmdModeWatcher`, a CM6 `ViewPlugin` that hooks `vim-mode-change` per-EditorView and fires mode events through `AutocmdManager.fire()`. The ViewPlugin is registered via `registerEditorExtension()` and automatically applies to all editors. The single-adapter mode-change binding in `bindAdapter()` and `activate()` is gated by a `useViewPlugin` flag — when the ViewPlugin is active (bundled vim mode), the legacy binding is skipped. Built-in vim mode retains the existing active-leaf-only behavior. Other adapter-dependent events (`TextYankPost`, `CursorMoved`, `CursorHold`, `CmdlineEnter`, `CmdlineLeave`) remain active-leaf-only for v1. ([#88](https://github.com/saberzero1/motions/issues/88))
    - Plugin: `src/vim/autocmd-mode-watcher.ts` (new — `AutocmdModeWatcher` ViewPlugin, `setAutocmdModeCallbacks`/`clearAutocmdModeCallbacks`), `src/lua/autocmd.ts` (`useViewPlugin` flag, `setUseViewPlugin()`, `handleModeChangeFromView()`, guarded `onModeChange` in `activate()` and `bindAdapter()`), `src/main.ts` (extension registration, callback wiring in `loadLuaConfigInternal`, cleanup in `onunload`)
- **Hint mode labels missing on wikilinks and markdown links when cursor is on the same line** — in Live Preview, wikilinks on the cursor's line render as `.cm-hmd-internal-link` spans (not `.cm-underline`), and markdown links render as `.cm-link`/`.cm-url` spans. These were not in `TARGET_SELECTOR`, so no hint labels appeared. In Source mode, wikilinks always render as `.cm-hmd-internal-link` and were similarly missed. Fixed by adding `.cm-hmd-internal-link`, `.cm-link`, and `.cm-url` to `OBSIDIAN_SELECTORS` and extending `classifyTarget()` to resolve links from these elements via the existing `resolveCmUnderlineHref()` pipeline. Deduplication filters prevent multiple hints per link: aliased wikilink sub-spans, nested `.cm-underline` inside `.cm-hmd-internal-link`, formatting bracket spans, and markdown link URL spans when a text span exists. ([#85](https://github.com/saberzero1/motions/issues/85))
    - Plugin: `src/ui/hint-mode.ts` (added selectors, extended `classifyTarget`, deduplication filters in `createHintAction`)

### Tests

- 3 new unit tests in `test/unit/lua/autocmd.test.ts`: `handleModeChangeFromView` fires events, `bindAdapter` skips mode-change when `useViewPlugin` is true, `activate` skips `onModeChange` when `useViewPlugin` is true
- 7 unit tests in `test/unit/vim/autocmd-mode-watcher.test.ts`: callback set/clear/overwrite, extension creation, mode payload forwarding, cleanup after clear
- 4 e2e tests in `test/specs/lua-autocmd-perview.e2e.ts`: InsertEnter fires exactly once in active leaf (no double-firing), InsertEnter fires in non-active split via `Vim.handleKey`, ModeChanged fires in non-active split with correct pattern, InsertLeave fires in non-active split
- Spike tests: `test/specs/spikes/spike-autocmd-multiview.e2e.ts` (13 tests — multi-view event discovery), `test/specs/spikes/spike-autocmd-popover-timing.e2e.ts` (12 tests — popover/timing analysis)
- 9 new e2e tests in `test/specs/hint-mode-links.e2e.ts`: Source mode navigation (plain, aliased, inline wikilinks), cursor-on-line Live Preview navigation, multiple wikilinks on same line, aliased wikilink deduplication, `yf` yank on wikilink, `F` open-in-new-tab on wikilink, embed wikilink hint visibility
- Mode-switching helpers (`ensureLivePreview`, `ensureSourceMode`, `isLivePreview`, `isSourceMode`) extracted to `test/helpers.ts`
- Spike test `test/specs/spikes/spike-hint-wikilink-issue85.e2e.ts`: 17 diagnostic tests probing DOM element discovery, `posAtDOM` mapping accuracy, `findLinkAtCursor` resolution, and end-to-end hint activation across Live Preview, Source mode, and Reading view

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added per-view mode events section documenting which events fire per-view, which remain active-leaf-only, `getModeState()` semantics, and `vim.obsidian.mode()` behavior; updated hint mode target classification with `.cm-hmd-internal-link`, `.cm-link`, `.cm-url` selectors and deduplication filter descriptions
- `docs/configuration/lua-config.md`: Added per-view callout to autocommands section, marked `InsertEnter`/`InsertLeave`/`ModeChanged` as "(per-view)" in events table
- `docs/features/hint-mode.md`: Updated internal link handling section with Source mode support and cursor-on-line behavior
- `CONTRIBUTING.md`: Added `autocmd-mode-watcher.ts` to codebase structure; updated `hint-mode.ts` description with cursor-on-line and Source mode link resolution
- `AGENTS.md`: Updated Lua API description noting per-view autocmd mode events
- `README.md`: Updated Lua configuration feature description with per-view mode events

## [0.82.0] - 2026-07-24

### Fixed

- **Animated cursor does not animate for count-prefixed and multi-key motions** — movements like `4j` (count-prefixed) and `g$` (multi-key) caused the cursor to teleport instead of animating. The `resolveVimMode()` method in the animated cursor controller used `vim.status` (the chord display string) to detect operator-pending mode. Since `vim.status` is set on every keystroke (e.g., `"4"` when typing a count digit, `"g"` when typing a prefix key), any multi-keystroke motion triggered a false mode change to operator-pending — which has a different cursor shape (underline vs block). Each shape change called `snap()`, bypassing the animation entirely. Fixed by removing `vim.status` from the operator-pending detection — only `inputState.operator` (set when an actual operator like `d`/`c`/`y` is registered) now gates the operator-pending mode. ([#86](https://github.com/saberzero1/motions/issues/86))
    - Plugin: `src/vim/animated-cursor/controller.ts` (`resolveVimMode` — removed `vim.status` check)
- **Hint mode does not navigate wikilinks or markdown links in Live Preview** — typing the hint label for a wikilink (`[[Target]]`) or markdown link (`[text](Target)`) in the editor did nothing. The `.cm-underline` spans rendered by Live Preview are `<span>` elements without `href` or `data-href` attributes — `classifyTarget` correctly identified them as links but extracted `href: undefined`, causing `hintActivate` to fall through to the generic click handler (which does nothing useful on CM6 spans). Fixed by adding `resolveCmUnderlineHref()` which uses the CM6 `EditorView.posAtDOM()` API to convert the DOM element to a document offset, then calls the existing `findLinkAtCursor()` regex from `goto-definition.ts` to extract the link target from the raw markdown text. Works for wikilinks (including aliased and heading links), markdown links (internal and external), and bare URLs. Reading view and frontmatter property links were unaffected (they use `<a>` elements with proper `href`/`data-href` attributes). ([#85](https://github.com/saberzero1/motions/issues/85))
    - Plugin: `src/ui/hint-mode.ts` (`getEditorViewFromElement`, `resolveCmUnderlineHref`, updated `classifyTarget` link branch)
- **Input method not restored after manual IME switch during insert mode** — when a user manually switched input methods while in insert mode (e.g., from Vietnamese to English via OS keyboard shortcut), pressing `Esc` then `i` reset the IME to the original input method instead of preserving the manually chosen one. The `save()` method in `ImSwitcher` cached the stale `lastKnownIm` value (set by the plugin's last `set()` call) before querying the OS for the actual current IME. The async OS query updated `lastKnownIm` but never wrote back to `savedImByLeaf`, so `restore()` always read the stale value. Fixed by making `save()` async — it now queries the OS for the real IME state first, then caches the result in both `lastKnownIm` and `savedImByLeaf`. `onInsertLeave()` awaits the save before switching to the normal-mode default IME. Falls back to `lastKnownIm` when the OS query fails (e.g., binary timeout). ([#83](https://github.com/saberzero1/motions/issues/83))
    - Plugin: `src/im/im-switcher.ts` (`save()` async with OS query, `onInsertLeave()` awaits save, `debouncedSwitch`/`pendingSwitch` accept async callbacks), `src/lua/api.ts` (`imSave` type updated), `src/lua/loader.ts` (fire-and-forget async save), `src/lua/obsidian-api.ts` (void floating promise)

### Tests

- 10 e2e tests in `test/specs/hint-mode-links.e2e.ts`: wikilink/markdown-link/bare-URL href resolution from `.cm-underline` spans, wikilink navigation (plain and aliased), markdown link navigation, inline wikilink navigation, reading view regression, frontmatter property link regression, external link safety
- Updated 10 unit tests in `test/unit/im-switcher.test.ts`: `save()` tests now verify OS query behavior (mock `executeImGet` return value instead of manually setting `lastKnownIm`), async settle via `vi.advanceTimersByTimeAsync(0)`, new test for fallback when OS query returns null

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added animated cursor multi-key motion fix; added hint mode link navigation fix to hint mode actions section
- `CONTRIBUTING.md`: Updated `hint-mode.ts` description with link resolution via `posAtDOM`
- `docs/features/hint-mode.md`: Updated internal link handling section with Live Preview resolution details
- `KNOWN_LIMITATIONS.md`: Updated input method switching section with manual IME switch fix
- `CONTRIBUTING.md`: Updated `im-switcher.ts` description
- `AGENTS.md`: No changes needed (existing description already covers per-view IM switching)

## [0.81.0] - 2026-07-23

### Fixed

- **EasyMotion capital letter search not working** — EasyMotion character search motions (`<leader><leader>s`, `<leader><leader>f`, etc.) failed when typing a capital letter (Shift+key) as the search character. The `waitForKey()` handler resolved on the `Shift` keydown event (before the actual character key arrived), causing the motion to silently abort. Fixed by adding a modifier-key guard matching the existing pattern in `waitForLabel()` — `e.key.length !== 1` keys are now suppressed and ignored, keeping the handler alive for the real character. ([#84](https://github.com/saberzero1/motions/issues/84))
    - Plugin: `src/easymotion/keypress.ts` (`waitForKey` modifier-key guard)

### Tests

- 6 unit tests in `test/unit/easymotion-keypress.test.ts`: `waitForKey` resolves single character keys and Escape, ignores Shift/Control/Alt/Meta modifier-only keys
- 1 e2e test in `test/specs/easymotion-comprehensive.e2e.ts`: EasyMotion bidirectional char search with capital letter (`Z`) input

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added capital letter fix to EasyMotion operator-pending section
- `CONTRIBUTING.md`: Updated `keypress.ts` description with modifier-key guard
- `docs/features/easymotion.md`: Added note about capital letter support in find motions

## [0.80.0] - 2026-07-23

### Fixed

- **IME change detection limited to primary editor leaf** — IME composition tracking and input method switching now work across all editor views (split panes, Page Preview popovers, Canvas card editors). Previously, composition events and mode-change detection were wired to a single element/adapter obtained from `getActiveViewOfType(MarkdownView)`, so non-primary editors never received IME handling. Fixed with two new CM6 ViewPlugins registered via `registerEditorExtension()`: `CompositionTracker` tracks `compositionstart`/`compositionend` per-EditorView, and `ImModeWatcher` binds `adapter.on('vim-mode-change')` per-EditorView to detect insert mode transitions. The autocmd-based IM switch registrations (`InsertEnter`/`InsertLeave`/`CmdlineLeave`) are replaced by the per-view mechanism; Lua autocmd callbacks continue to fire for the primary leaf via AutocmdManager (unchanged contract). ([#83](https://github.com/saberzero1/motions/issues/83))
    - Plugin: `src/im/composition-tracker.ts` (new), `src/im/im-mode-watcher.ts` (new), `src/im/im-switcher.ts` (refactored — removed single-element tracking, added `cleanupView()`), `src/main.ts` (registered extensions, removed autocmd-based IM registrations)

### Tests

- 15 unit tests in `test/unit/composition-tracker.test.ts`: per-view composing state, multi-tracker isolation, destroy cleanup, `onAllCompositionsEnd` callback lifecycle, unsubscribe
- 14 unit tests in `test/unit/im-mode-watcher.test.ts`: lazy adapter binding, mode change detection (insert/leave/replace), adapter re-binding, cleanup, multiple views with unique IDs
- 4 e2e tests in `test/specs/ime-composition-multiview.e2e.ts`: composition tracking on active/non-active editors, independent per-view tracking, insert mode detection on non-active editor

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated input method switching section with multi-view fix
- `README.md`: Updated input method switching feature description with multi-view support
- `CONTRIBUTING.md`: Added `composition-tracker.ts` and `im-mode-watcher.ts` to codebase structure
- `AGENTS.md`: Updated Lua API description noting per-view IM switching

## [0.79.0] - 2026-07-22

### Added

- **`vim.v` namespace — Neovim-compatible predefined variables** — read-only metatable proxy exposing `vim.v.count`, `vim.v.count1`, `vim.v.register`, `vim.v.operator` (Tier 1), `vim.v.searchforward` (read/write), `vim.v.insertmode`, `vim.v.numbermax`/`numbermin`/`numbersize`, `vim.v.true`/`false`/`null` (Tier 2), and `vim.v.foldstart`/`foldend`/`foldlevel`/`folddashes`, `vim.v.lnum`/`relnum`/`virtnum`, `vim.v.char`, `vim.v.hlsearch`, `vim.v.event` (Tier 3 — context-dependent). Context is set from `actionArgs` before each keymap callback invocation and cleared after. `vim.v.event` is populated during autocmd dispatch with the event data table. `vim.v.hlsearch` queries the fork's search overlay state via `getSearchState(cm).getOverlay()`.
    - Plugin: `src/lua/api.ts` (`VimVContext`, `setVimVContext`, `clearVimVContext`, vim.v metatable, autocmd vim.v.event wiring), `src/lua/loader.ts` (`getVimApi`, `getSearchForward`, `setSearchForward`, `getHlSearch` callbacks), `src/types/vim-api.d.ts` (`ActionArgs` extended, `feedKeys` and `getOverlay` added to `VimApi`), `src/lua/engine.ts` (`EXPR_INSTRUCTION_LIMIT`)
- **`{ expr = true }` keymap support** — `vim.keymap.set` now accepts `{ expr = true }` for function callbacks. The callback must return a string that is fed as keystrokes via the fork's new `feedKeys` API. Sync-only — async APIs cannot be used in expr callbacks. String expr (Vimscript evaluation) is not supported with a helpful error guiding users to the function form. Recursion guard (200 depth, matching Neovim) prevents infinite expr → feedKeys → expr loops.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`feedKeys` method on VimApi — delegates to `doKeyToKey` with noremap flag and recursion protection)
    - Plugin: `src/lua/api.ts` (expr callback path with `lua_pcall(state, 0, 1, 0)`, return value capture, `feedKeys` invocation)

### Tests

- 55 unit tests in `test/unit/lua/vim-v.test.ts`: Tier 1 defaults and context (count, count1, register, operator), read-only enforcement, Tier 2 constants (numbermax/min/size, true/false/null), searchforward (callback read/write), insertmode, Tier 3 fold/statuscolumn/event/char variables, hlsearch callback (read from getHlSearch, fallback to context), vim.v.event in autocmd context (multi-field, nested data), expr mapping registration, unknown keys
- 8 e2e tests in `test/specs/lua-vim-v.e2e.ts`: `vim.v.count` and `vim.v.count1` with and without typed counts, `vim.v.event` populated during InsertEnter/InsertLeave autocmds, `vim.v.hlsearch` returns 1 after `/` search and 0 after `:nohlsearch`
- 7 e2e tests in `test/specs/lua-expr-mapping.e2e.ts`: expr returns executed keys, expr with count, nil/empty return, error handling, string expr error, special keys

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added expr mapping limitations (string expr, async expr, operator-pending, count forwarding) and vim.v limitations (async callback reliability, outside-callback behavior)
- `docs/configuration/lua-config.md`: Added `vim.v` section with all variable tables, expr mapping examples, and updated `vim.keymap.set` options table with `expr` documentation
- `README.md`: Updated Lua configuration feature description with `vim.v` and expr mappings
- `CONTRIBUTING.md`: Updated `api.ts` description with vim.v namespace and expr mapping support
- `AGENTS.md`: Updated codemirror-vim fork description with `feedKeys` API, updated Lua API list with `vim.v` (20 variables including event/hlsearch)

## [0.78.0] - 2026-07-22

### Fixed

- **Fold gutter click does not unfold (continued)** — the initial fix in 0.76.0 (correcting zero-width ranges in the plugin's own fold-column and statuscolumn gutters) was insufficient because those gutters are off by default — the reporter was clicking Obsidian's **native** fold gutter, which the plugin doesn't control. CM6's `foldState` requires an exact `{from, to}` match to remove a fold; a mismatched range is silently ignored. Fixed by adding `unfoldNormalizerExtender` in `fold-sync.ts` — a `transactionExtender` that detects mismatched `unfoldEffect` ranges and appends a corrective effect with the actual stored fold range. Works for all fold sources: Obsidian's native gutter, the plugin's custom gutters, and vim commands. ([#80](https://github.com/saberzero1/motions/issues/80))
    - Plugin: `src/vim/fold-sync.ts` (`unfoldNormalizerExtender`)
- **Insert-mode surround cursor position and undo** — `<C-G>s{char}` now inserts both the opening and closing delimiters immediately (matching vim-surround behavior) instead of deferring the close delimiter to `exitInsertMode`. Fixes: (1) cursor now lands on the last typed character after `Esc` (was on the closing delimiter), (2) undo is improved (was 3 steps: close, text, open — now 2 steps: text, delimiters), (3) dot-repeat degrades cleanly (replays only typed text, not garbled `()hello`). The `maybeReset` mechanism clears delimiter text from the insert-mode change stream so `lastInsertModeChanges.changes` contains only user-typed text. Known limitation: dot-repeat replays only the typed text, not the surrounding delimiters. Macro recording of insert-mode surround keys is also not supported (pre-existing fork limitation). ([#82](https://github.com/saberzero1/motions/issues/82))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`surroundInsert`, `surroundInsertNewline` refactored; `exitInsertMode` deferred-close block removed), `~/Repos/codemirror-vim/src/types.ts` (`surroundInsertClose` property removed)

### Tests

- 17 e2e tests in `test/specs/fold-unfold-normalizer.e2e.ts`: unfold normalizer for heading folds (exact-match, zero-width, wrong-to, line-boundary, vim zc/zo round-trip, zM/zR round-trip, no-op on non-folded line, multi-fold targeting), frontmatter folds in source mode (exact-match, zero-width, line-start mismatch, line-boundary, fold.from > line.from verification, vim zc/zo round-trip)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Updated fold gutter unfold fix with unfold normalizer extender description
- `CONTRIBUTING.md`: Updated `fold-sync.ts` description with unfold normalizer
- `docs/features/workspace-navigation.md`: Added unfold normalizer note to Folds section
- `README.md`: Updated surround feature description with insert-mode cursor fix
- `AGENTS.md`: Updated codemirror-vim fork description noting insert-mode surround refactor
- `docs/features/surround.md`: Updated insert-mode cursor behavior description

## [0.77.0] - 2026-07-22

### Fixed

- **Animated cursor may not animate on Windows 11** — the canvas rAF loop could silently die on Windows due to several platform-specific behaviors: (1) Any transient error during a tick frame (null coordinate during window refocus, detached DOM node) threw an unhandled exception that permanently killed the `requestAnimationFrame` loop — the cursor disappeared until plugin reload. Fixed by wrapping the loop body in try/catch; errors are logged once and the loop continues. (2) Windows 11 Efficiency Mode, window occlusion tracking (`CalculateNativeWinOcclusion`), and high-resolution timer suppression can all silently stop rAF delivery without throwing. Added a 500ms `setInterval` heartbeat that detects a stalled loop and re-wakes it — unlike rAF, `setInterval` is not suppressed by Chromium's occlusion tracker. (3) When the browser tab/window is hidden and restored, rAF may not resume. Added a `visibilitychange` listener that re-wakes the loop when the page regains visibility. (4) Windows displays at 125%/150% scaling produce fractional `devicePixelRatio` values (1.25/1.5). Canvas backing-store dimensions are now rounded with `Math.round()` to avoid sub-pixel aliasing and continuous compositor re-uploads. Informed by cursor-smith's v1.1.8 fix for the same "cursor disappears until plugin reload" failure mode and terminal-workbench-cursor's heartbeat safety-net pattern.
    - Plugin: `src/vim/animated-cursor/manager.ts` (try/catch in `loop()`, heartbeat `setInterval`, `visibilitychange` listener, DPR rounding)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added Windows resilience details to animated cursor section
- `CONTRIBUTING.md`: Updated `manager.ts` description with resilience mechanisms
- `docs/features/animated-cursor.md`: Added Windows resilience section
- `README.md`: Updated animated cursor feature description with cross-platform resilience

## [0.76.0] - 2026-07-22

### Added

- **Per-view cursor suppression fork API** — added `setCursorSuppressedForView(view, suppressed)`, `clearCursorSuppressedForView(view)`, and `isCursorSuppressedForView(view)` to the codemirror-vim fork. Per-view overrides take precedence over the global `setCursorSuppressed` state, allowing the plugin to selectively restore the native cursor in specific contexts (table cell editors, textarea overlays) or force suppression (table navigation) without affecting other editors. Overrides are automatically cleaned up when the editor's `BlockCursorPlugin` is destroyed.
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (per-view state map, API implementation, cleanup in `destroy`)
- **Animated cursor vimrc/Lua configuration** — all 8 animated cursor settings are now configurable via vimrc (`set smoothcursor`, `set smoothcursorsmoothness=0.3`, etc.) and Lua (`vim.opt.smoothcursor = true`, etc.). Master toggle `smoothcursor` enables/disables the feature with `reloadFeatures()`. Sub-options (`smoothcursorglide`, `smoothcursorsmoothness`, `smoothcursorsmear`, `smoothcursorstiffness`, `smoothcursortrailstiffness`, `smoothcursordamping`, `smoothcursormaxlength`) hot-reload without restart. All use `SideEffectOpt` pattern syncing both `settings[key]` and module-level config. Short aliases: `sc`, `scg`, `scs`, `scm`, `scst`, `scts`, `scd`, `scml`. ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vimrc/loader.ts` (16 `SideEffectOpt` entries), `src/settings.ts` (`animatedCursor` added to `RELOAD_KEYS`)
- **Animated cursor in oil explorer** — animated cursor now renders in the oil file explorer. Single shared canvas architecture: one canvas on `.app-container` owned by `AnimatedCursorManager`, shared by all controllers. Reduces memory from O(N × viewport) to O(1 × viewport). Each controller clips drawing to its own editor bounds via `ctx.clip()`. `MAX_CONTROLLERS` raised from 8 to 16 with warning log on capacity. Canvas lifecycle managed by the manager (created on first register, removed when last controller deregisters). Null-check on `canvas.getContext('2d')` for browser canvas limits. Table cell editors and textarea vim overlays fall back to the native cursor. ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/manager.ts` (shared canvas ownership, sizing, lifecycle), `src/vim/animated-cursor/controller.ts` (removed per-controller canvas, draws on shared context), `src/oil/oil-view.ts` (injects `createAnimatedCursorExtension()` when enabled)

### Fixed

- **Fold gutter click does not unfold** — clicking a fold marker (▾) in the fold column or statuscolumn gutter folded the region correctly but clicking again to unfold had no effect. The `unfoldEffect` was dispatched with `{ from: line.from, to: line.from }` (zero-width range) instead of the actual fold range, so CodeMirror found no matching fold decoration to remove. Fixed by capturing the fold's end position from `foldedRanges().between()` and passing the full `{ from, to }` range to `unfoldEffect`. ([#80](https://github.com/saberzero1/motions/issues/80))
    - Plugin: `src/vim/fold-column.ts` (click handler), `src/vim/statuscolumn.ts` (`handleFoldClick`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added fold gutter unfold fix to folding section
- `README.md`: Added vimrc/Lua configuration to animated cursor feature description
- `CONTRIBUTING.md`: Updated `manager.ts` and `config.ts` descriptions for Phase 3 architecture
- `AGENTS.md`: Updated codemirror-vim fork description with per-view cursor suppression API
- `docs/features/animated-cursor.md`: Added vimrc/Lua configuration section and oil explorer support section
- `docs/configuration/vimrc.md`: Added `smoothcursor`, `smoothcursorsmoothness`, `smoothcursorsmear` to boolean options; added `smoothcursorsmoothness`, `smoothcursorstiffness`, `smoothcursortrailstiffness`, `smoothcursordamping`, `smoothcursormaxlength` to number options
- `docs/configuration/lua-config.md`: Added all 8 `smoothcursor*` entries to vim.opt options table

## [0.75.1] - 2026-07-22

### Fixed

- **Table navigation cursor ghost** — both native and animated cursors are now hidden during embedded table navigation. Early suppression in the `ViewPlugin` update cycle eliminates the brief cursor flash when entering a table. The animated cursor snaps to the exit position (no interpolation) when resuming after table navigation to prevent cross-table "ghost" trails.
    - Plugin: `src/vim/table-nav-controller.ts` (calls `setCursorSuppressedForView` and `pauseAnimatedCursorForView`)

- **Textarea overlay invisible cursor** — the native cursor is now restored in textarea vim overlays by un-suppressing it for the overlay's editor view. Previously, the global suppression for the animated cursor made the native cursor invisible in the overlay where the animated cursor doesn't render.
    - Plugin: `src/vim/textarea-vim-manager.ts` (calls `setCursorSuppressedForView(view, false)`)

- **Table cell editor cursor inconsistency** — per-view un-suppression ensures the native cursor always renders inside embedded table cell editors, matching the behavior of textarea overlays.
    - Plugin: `src/vim/table-cell-editor.ts` (calls `setCursorSuppressedForView(view, false)`)

- **Animated cursor stays as block in operator-pending mode** — pressing `d`, `c`, `y`, or other operators without a motion kept the cursor as a block instead of switching to the configured operator-pending shape (default: underline). Two issues: (1) `resolveVimMode()` only checked `vim.status` (set for prompt-based pending like surround) but not `vim.inputState.operator` (set for standard operators like `d`/`c`/`y`). (2) Operator-pending is a transient state that doesn't trigger CM6 transactions, so the ViewPlugin's `update()` never fired. Fixed by checking `inputState.operator` in `resolveVimMode()` and polling the cursor shape every rAF frame in `tick()` to detect changes that bypass CM6's transaction system. ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/controller.ts` (`resolveVimMode` checks `inputState.operator`, per-frame shape polling in `tick`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Removed operator-pending detection from nice-to-have (implemented)

## [0.75.0] - 2026-07-22

### Added

- **Animated cursor blinking** — the canvas cursor now blinks matching CM6's default behavior (1200ms cycle, hard on/off toggle). After cursor movement, the cursor stays solid for 600ms before resuming blink. Blink epoch is aligned to the end of the reset delay so the first blink cycle starts cleanly. Blink only runs when the editor has focus; unfocused editors show a solid cursor. Suppressed during smear/smooth animation (cursor is moving). ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/controller.ts` (`computeBlinkAlpha`, `lastMoveTime`, `blinkEpoch`, focus-aware rAF loop)

### Fixed

- **Animated cursor disappears below line ~28** — the canvas was sized to the viewport but positioned at the top of the scroll container (`position: absolute; top: 0` inside `scrollDOM`). After scrolling, cursor coordinates pointed to positions below the canvas bounds. Fixed by moving the canvas to `.app-container` with `position: fixed` and using raw viewport-relative coordinates from `coordsAtPos()` directly — matching cursor-smith's architecture. The canvas is clipped to the editor pane rect via `ctx.clip()` each frame. ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/controller.ts` (viewport-fixed canvas, removed scroll offset math), `styles.css` (fixed positioning)
- **Animated cursor displaced rightward in visual mode** — entering visual mode (`v`) shifted the canvas cursor one character to the right. In visual mode with a forward selection (`anchor < head`), CM6's `selection.main.head` points past the last selected character. The fork's `BlockCursorPlugin.measureCursor()` decrements `head` in this case, but the animated cursor used the raw value. Fixed by applying the same head adjustment: when `anchor < head` and the character at head isn't `\n`, decrement position by 1. ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/controller.ts` (head position adjustment in `refreshTarget`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Marked cursor blink as fixed; removed "cursor blink after convergence" from nice-to-have (implemented)
- `docs/features/animated-cursor.md`: Added cursor blinking section

## [0.74.0] - 2026-07-21

### Changed

- **Settings organized into 7 pages** — the flat list of 20 settings groups is now organized into 7 navigable pages: General, Appearance, Navigation, Keybindings, Snippets & files, Input method, and Advanced. On Obsidian 1.13+, pages appear as sidebar entries via `type: 'page'` in `getSettingDefinitions()`. On pre-1.13, a button tab bar at the top of the settings panel switches between pages. The `display()` method is refactored into 7 private render methods (`renderGeneralTab`, `renderAppearanceTab`, etc.) for maintainability. No settings were added or removed.
    - Plugin: `src/settings.ts` (declarative pages + imperative tab bar + 7 render methods), `styles.css` (tab bar CSS)
- **Settings reorganized across pages** — moved settings to more logical groupings: sign column and fold column moved from Vim features to Appearance (new "Gutter" group); yank highlight settings moved to Appearance (new "Yank highlight" group); workspace navigation and fold settings moved to Navigation (new "Workspace navigation" group); picker and third-party integration settings consolidated into a new "Picker" group on General (replacing the old "Third-party integrations" group).
    - Plugin: `src/settings.ts` (both declarative and imperative paths)
- **Declarative settings API enhancements (1.13+)** — leveraged additional Obsidian 1.13+ declarative settings features:
    - Page descriptions (`desc`) on all 7 pages for at-a-glance navigation
    - Warning status indicator on General page when built-in vim mode is enabled
    - Input method page hidden on mobile via `visible: Platform.isDesktop`
    - Search aliases on 20+ settings for better discoverability in Obsidian's global settings search
    - `defaultValue: true` on 33 toggle controls for framework-managed defaults
    - Group-level search filter on Jump navigation group (15+ settings)
    - Replaced 6 conditional spreads (`...(condition ? [...] : [])`) with `visible` predicates for cleaner reactivity via `refreshDomState()`
    - Inline `validate` on 8 numeric/path controls (range checks, path format validation)
    - Snippet directory changed from text input to `type: 'folder'` vault folder picker
    - 38 conditional `visible` predicates on child settings — sub-settings hide when their parent feature is disabled (animated cursor, flash, EasyMotion, hint mode, snippets, oil explorer, undo tree, status bar, which-key, workspace nav, yank highlight)
    - Plugin: `src/settings.ts` (declarative path only)
- **Pre-1.13 settings conditional visibility** — matching the declarative path, the imperative render methods now hide sub-settings when their parent feature is disabled. Uses CSS class toggling (`syncVisibilityClass`) for instant show/hide without full re-render — parent toggle `onChange` handlers toggle a class on the content container, and child settings are wrapped in gate divs hidden by CSS when the parent class is absent. Covers all 12 parent-child groups across 4 render methods.
    - Plugin: `src/settings.ts` (imperative path — `syncVisibilityClass` helper + gate divs in render methods), `styles.css` (18-selector conditional visibility rule block)

### Documentation

- `CHANGELOG.md`
- `AGENTS.md`: Updated dual settings tab description with page organization, page assignment guide, and page ownership table (workspace nav and folding moved to Workspace navigation group)
- `CONTRIBUTING.md`: Updated settings.ts codebase structure entry with 7 page names
- `KNOWN_LIMITATIONS.md`: Added SettingDefinitionList deferred limitation for leader bindings and which-key labels; updated "Third-party integrations" references to "Picker"
- `docs/configuration/settings.md`: Added page organization table, explanation of 1.13+ vs pre-1.13 behavior, renamed "Third-party integrations" heading to "Picker"
- `docs/features/ex-commands.md`: Updated settings path from "Third-party integrations" to "Picker"
- `docs/development/picker-api.md`: Updated settings path from "Third-party integrations" to "Picker"

## [0.73.1] - 2026-07-21

### Fixed

- **Animated cursor settings missing from pre-1.13 settings tab** — the 8 animated cursor settings (enable, smooth cursor, smoothness, smear trail, stiffness, trailing stiffness, damping, max length) were only present in the post-1.13 declarative settings API (`getSettingDefinitions()`). Added the full settings group to the pre-1.13 imperative `display()` method with matching toggle/slider controls, disabled-state gating, and `reloadFeatures()` on master toggle change.
    - Plugin: `src/settings.ts` (post-1.13 `display()` method)
- **Animated cursor e2e tests flaky due to ViewPlugin lifecycle timing** — the "canvas is created" and "native cursor is hidden" tests checked DOM state (canvas presence in scrollDOM, CSS class on cm-editor) which was timing-sensitive during `reloadFeatures()`. Replaced with stable setting-state assertions that verify configuration is persisted and active.
    - Plugin: `test/specs/animated-cursor.e2e.ts`
- **ESLint warnings in animated cursor module** — resolved 8 lint issues: moved canvas inline styles to CSS class (`obsidianmd/no-static-styles-assignment`), replaced `instanceof` with `.instanceOf()` (`obsidianmd/prefer-instanceof`), removed unnecessary type assertion (`@typescript-eslint/no-unnecessary-type-assertion`), replaced `requestAnimationFrame` with `window.requestAnimationFrame` (`obsidianmd/prefer-window-timers`), replaced `document.createElement` with Obsidian's `createEl` helper (`obsidianmd/prefer-create-el`).
    - Plugin: `src/vim/animated-cursor/controller.ts`, `src/vim/animated-cursor/manager.ts`, `styles.css`

## [0.73.0] - 2026-07-21

### Added

- **Animated cursor (smear + smooth movement)** — canvas-based cursor rendering with smooth exponential interpolation and spring-damper smear trail. Per-mode cursor shapes (block, bar, underline, hollow) rendered on `<canvas>` overlay. Fork-side cursor suppression via `setCursorSuppressed()`. Disabled by default — enable via **Settings → Vim Motions → Animated cursor**. Inspired by [smear-cursor.nvim](https://github.com/sphamba/smear-cursor.nvim) and [cursor-smith](https://github.com/sadsnake1/cursor-smith). ([#78](https://github.com/saberzero1/motions/issues/78))
    - Plugin: `src/vim/animated-cursor/` (new: types.ts, smooth-cursor.ts, physics.ts, renderer.ts, manager.ts, controller.ts, config.ts), `src/settings.ts` (8 new settings), `src/main.ts` (extension registration, lifecycle)
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`setCursorSuppressed` API), `~/Repos/codemirror-vim/src/index.ts` (re-export)

### Tests

- 32 unit tests in `test/unit/animated-cursor.test.ts`: SmoothCursor (11 tests: setTarget snap/no-snap, tick exponential decay, frame-rate independence, smoothness extremes, snap, isConverged, current, reset), SmearPhysics (11 tests: setTarget snap/no-snap, tick spring-damper, head-faster-than-tail, isConverged, snap, reset, max length clamping, frame-rate independence, volume shrinkage), getCursorShapeForMode (10 tests: all mode mappings, custom shapes)
- 5 e2e tests in `test/specs/animated-cursor.e2e.ts`: canvas creation, native cursor hiding, disable toggle, cursor follows movement, settings sub-toggles

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added animated cursor section with limitations and nice-to-have future items
- `README.md`: Added animated cursor to features list
- `CONTRIBUTING.md`: Added `animated-cursor/` module to codebase structure
- `AGENTS.md`: Updated codemirror-vim fork description with `setCursorSuppressed` API; added animated cursor to page ownership table
- `~/Repos/codemirror-vim/DIFFERENCES.md`: Added `setCursorSuppressed` API section

## [0.72.0] - 2026-07-21

### Added

- **`labelmatchfontsize` setting** — opt-in setting that scales jump label font to match the target line's font size (e.g., larger labels on headings). Disabled by default. Configurable via **Settings → Vim Motions → Jump navigation → Scale labels to line height**, `set labelmatchfontsize` in vimrc, or `vim.opt.labelmatchfontsize = true` in Lua. ([#75](https://github.com/saberzero1/motions/issues/75))
    - Plugin: `src/settings.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`, `src/easymotion/overlay.ts` (per-target `labelMetrics`), `src/easymotion/register.ts`, `src/flash/register.ts`, `src/flash/char-mode.ts`, `src/flash/jump-mode.ts`, `src/flash/search-mode.ts`

### Changed

- **Label vertical centering** — jump labels are now vertically centered within the line height instead of being top-aligned. On lines with taller fonts (headings), labels sit centered in the line rather than hugging the top edge. ([#75](https://github.com/saberzero1/motions/issues/75))

### Fixed

- **Cursor stuck below frontmatter in source mode** — pressing `k`, `C-u`, or arrow-up from the first content line after YAML frontmatter could not enter the frontmatter block in source mode. The fork's `findPosV` adapter unconditionally intercepted upward cursor movement near frontmatter boundaries to redirect focus to the properties widget (live-preview behavior). In source mode, no properties widget exists — the interception fired but found no focus target, leaving the cursor stuck. Fixed by gating the frontmatter interception on Obsidian's `editorLivePreviewField` state field. A new `setLivePreviewField()` API on the fork accepts the host-provided field without coupling the fork to Obsidian. In source mode, the block is skipped entirely and the cursor moves through raw frontmatter text normally. ([#77](https://github.com/saberzero1/motions/issues/77))
    - Fork: `~/Repos/codemirror-vim/src/cm_adapter.ts` (`setLivePreviewField`, `_livePreviewField` gate in `findPosV`), `~/Repos/codemirror-vim/src/index.ts` (re-export)
    - Plugin: `src/vim/bundled-vim.ts` (passes `editorLivePreviewField` to fork), `src/types/codemirror-vim.d.ts` (type declaration)
- **EasyMotion line motions targeting hidden formatting in Live Preview** — `<leader><leader>j`/`<leader><leader>k` line motions targeted hidden markdown formatting characters (e.g., `## ` on headings, `**` on bold text) instead of the first visible character. In Live Preview, the label appeared on the hidden prefix position, obscuring the first visible character. Fixed by adding `skipHiddenPrefix()` to `findLineTargets()`, which scans forward from the raw-text first-non-blank character using `coordsAtPos()` to find the first character that occupies visible space. ([#79](https://github.com/saberzero1/motions/issues/79))
    - Plugin: `src/easymotion/targets.ts` (`skipHiddenPrefix`, `findLineTargets`)

### Documentation

- `CHANGELOG.md`
- `KNOWN_LIMITATIONS.md`: Added label vertical centering note, RTL label positioning limitation, and line motion hidden formatting fix to flash motions section; updated frontmatter navigation section with source mode fix
- `AGENTS.md`: Updated codemirror-vim fork description with `setLivePreviewField` API
- `CONTRIBUTING.md`: Updated `bundled-vim.ts` description with live-preview field wiring
- `~/Repos/codemirror-vim/DIFFERENCES.md`: Added `setLivePreviewField` API section; updated properties navigation section with live-preview gating
- `docs/configuration/settings.md`: Added `labelmatchfontsize` to Jump navigation settings
- `docs/configuration/vimrc.md`: Added `labelmatchfontsize`/`lmfs` to boolean options
- `docs/configuration/lua-config.md`: Added `labelmatchfontsize` to vim.opt table
- `docs/features/flash.md`: Added `labelmatchfontsize` to configuration table
- `docs/features/easymotion.md`: Added scale labels setting to configuration

## [0.71.0] - 2026-07-20

### Added

- **Yank-ring paste cycling** — after `p`/`P`, pressing `<C-p>` replaces the pasted text with the previous numbered register (`"1`–`"9`). `<C-n>` reverses direction. Cycling wraps. Any non-cycling command cancels state; `<C-p>`/`<C-n>` then revert to `k`/`j`. Gated by `enableYankRing` setting (default: on). Uses `vim-keypress` event detection and `addToHistory.of(false)` for single-undo-group cycling.
    - Plugin: `src/vim/yank-ring.ts` (new), `src/settings.ts` (`enableYankRing`), `src/main.ts` (lifecycle integration)
- **Indentation text object (`ii`/`ai`)** — `ii` selects contiguous lines with same-or-greater indentation. `ai` adds the parent line above and trailing blank lines. Zero-indentation and blank lines return no match. Column-aware tab handling via CM6 `state.tabSize`. Gated by existing `enableTextObjects` setting.
    - Plugin: `src/text-objects/indentation.ts` (new), `src/text-objects/register.ts`
- **`gr` blockwise visual mode** — `<C-V>` block selection + `gr` now replaces each line in the block with corresponding register content. Single-line registers duplicate to all block rows; multi-line registers apply line-by-line; excess register lines truncate to block height. Cursor lands at top-left of block. Previously returned early (no-op).
    - Plugin: `src/operators/replace-with-register.ts` (blockwise branch)

### Changed

- **EasyMotion label positioning** — labels now appear one character to the right of the target character (after the target) instead of on top of it. This prevents labels from obscuring the character they target. The change applies to all EasyMotion motions (word, char, line, search). Match highlights now also appear behind EasyMotion labels.

### Fixed

- **Flash highlight rectangles hardcoded to 8×16px** — the `.vim-motions-flash-match` highlight boxes used a fixed `width: 8px; height: 16px` regardless of actual character dimensions, breaking with proportional fonts, different font sizes, and CJK characters. Now dynamically measured via `coordsAtPos()` for both start and end of each match. CSS dimensions use custom properties (`--vim-motions-flash-w`, `--vim-motions-flash-h`) with fallbacks. ([#75](https://github.com/saberzero1/motions/issues/75))
- **Flash labels obscure matched text** — labels were positioned at the match START coordinate, rendering on top of the matched characters. Labels are now positioned at the END of the matched text (one character past the last matched character), matching flash.nvim's default `after = true` behavior. Matched text remains visible with a colored highlight underneath. ([#75](https://github.com/saberzero1/motions/issues/75))
- **Flash match highlights missing during label phase** — when labels appeared (pattern met `minPatternLength`), match highlights disappeared. Now `showOverlay` renders both match highlights AND labels simultaneously (flash.nvim parity). Match highlights persist during label narrowing — only labels update when typing a label prefix. ([#75](https://github.com/saberzero1/motions/issues/75))
- **Flash jump-mode label narrowing destroyed match highlights** — in jump mode (`s`), typing a label prefix character destroyed the entire overlay and recreated it with only remaining targets, losing match highlights for non-matching targets. Now uses `updateLabels()` to narrow labels while preserving all match highlights. ([#75](https://github.com/saberzero1/motions/issues/75))
    - Plugin: `src/easymotion/overlay.ts` (extracted `measureTarget` + `measureLabelAnchor` + `renderHighlightSpans` shared helpers, added `renderHighlights` to `showOverlay`, label positioning at end-of-match), `src/easymotion/types.ts` (`matchLength?: number` on `Target`), `src/easymotion/targets.ts` (`matchLength` in `findSubstringTargets`), `src/flash/search-mode.ts` (`matchLength` in `findSearchMatchTargets`), `src/flash/jump-mode.ts` (widened `currentOverlay` type to `OverlayHandle`, label narrowing via `updateLabels`), `styles.css` (CSS custom properties for `.vim-motions-flash-match` dimensions)
- **Flash jump mode two-character label premature exit** — when flash jump mode (`s`) displayed two-character labels (28+ matches with default 27-char label alphabet), typing the first character of a two-char label either jumped to the wrong single-char target or appended the character to the search pattern, destroying the label state. The same bug affected post-`/`/`?` search labels. Fixed by adding prefix accumulation with label narrowing: typed characters are checked as label matches first (exact → jump, prefix → narrow and update overlay), then fall back to extending the search pattern. Extracted shared `waitForFlashLabel()` into `src/flash/label-input.ts` for reuse by `char-mode.ts`. ([#76](https://github.com/saberzero1/motions/issues/76))
    - Plugin: `src/flash/label-input.ts` (new: shared label selection state machine), `src/flash/jump-mode.ts` (prefix accumulation + label narrowing), `src/flash/search-mode.ts` (prefix accumulation + label narrowing), `src/flash/char-mode.ts` (imports shared `waitForFlashLabel`)
- **Flash jump `s` conflicting with surround `cs`/`ys`/`ds` in operator-pending mode** — when flash jump mode was enabled with `s` as the key, surround operations (`cs"`, `ds"`, `ysiw"`) were intercepted by flash because motions take precedence over partial action matches in operator-pending mode. Fixed by implementing an operator-prefix shadow resolver in the codemirror-vim fork: when an operator is pending and the next key fully matches a motion but also partially matches an `operatorPending` action (e.g., surround's `s<character>`), the resolver defers to the partial match, waiting for the next character to disambiguate. A configurable timeout (`operatorshadowtimeout`, default 1000ms) falls back to executing the deferred motion if no next key arrives. ([#76](https://github.com/saberzero1/motions/issues/76))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (shadow resolver in `matchCommand()`, timer in `handleKeyNonInsertMode()`, cleanup in `clearInputState()` + teardown, `operatorshadowtimeout` option)
    - Fork: `~/Repos/codemirror-vim/src/types.ts` (`_shadowTimer` on `vimState`)
    - Plugin: `src/settings.ts` (`operatorshadowtimeout` setting + Settings UI), `src/vimrc/loader.ts` (`operatorshadowtimeout`/`ost` in `KNOWN_SET_OPTIONS`)

### Tests

- 5 unit tests in `test/unit/flash-targets.test.ts`: `findSubstringTargets` sets `matchLength` (5-char, 1-char, 2-char patterns), empty pattern returns empty, `findCharTargets` does not set `matchLength`
- 2 e2e tests in `test/specs/flash-jump-mode.e2e.ts`: two-char label narrowing (labels persist after typing first char of two-char label), single-char label immediate jump
- 3 e2e tests in `test/specs/flash-jump-mode.e2e.ts`: shadow resolver surround coexistence (`cs"'`, `ds"`, `ysiw"` with flash `s` enabled)
- 10 tests in `~/Repos/codemirror-vim/test/vim_test.js`: shadow resolver (`cs`, `ds`, `ysiw` surround wins, `dd`/`cc` regression, `dw`/`cw` no-activation, Escape clears timer, `g~` regression, `ost=0` disables)
- 6 e2e tests for `gr` blockwise in `test/specs/operators.e2e.ts` (4 unskipped + register preservation + cursor position)
- 13 e2e tests in `test/specs/indentation-textobj.e2e.ts` (inner/around selection, operators, zero-indent, blank lines, nesting, yank, cursor position, mode verification)
- 8 e2e tests in `test/specs/yank-ring.e2e.ts` (cycling, reversal, cancellation, fallback to k/j, paste variants, register preservation)

### Documentation

- `CHANGELOG.md`
- `README.md`
- `CONTRIBUTING.md`: Updated overlay.ts description; added `label-input.ts` to codebase structure
- `AGENTS.md`: Updated codemirror-vim fork description with operator-prefix shadow resolver and test count
- `KNOWN_LIMITATIONS.md`: Updated flash motions section with highlight sizing and label positioning fixes; added operator-prefix key dispatch section (Implemented); updated `s` key / surround conflict bullet to reference resolver
- `docs/features/flash.md`: Added highlight and label rendering behavior documentation; updated surround conflict note to document automatic resolution via shadow resolver; added two-char label behavior documentation
- `docs/features/easymotion.md`: Added note about label positioning change
- `docs/features/text-objects.md`
- `docs/features/quality-of-life.md`
- `docs/reference/keybindings.md`
- `docs/configuration/settings.md`: Added `operatorshadowtimeout` to Vim engine settings group
- `docs/configuration/vimrc.md`: Added `operatorshadowtimeout`/`ost` to numeric options table
- `docs/configuration/lua-config.md`: Added `vim.opt.operatorshadowtimeout` entry
- `~/Repos/codemirror-vim/DIFFERENCES.md`: Added operator-prefix shadow resolver section

## [0.70.0] - 2026-07-19

### Added

- **Undo tree visualization** — branching undo history with `g+`/`g-` chronological navigation across all branches (buffer content changes via ChangeSet dispatch), `:earlier N/Ns/Nm/Nh/Nd/Nf` and `:later` time/count/save-point navigation, `:undolist` modal, sidebar view (`:UndoTreeToggle/Show/Hide`) with DOM tree rendering, click-to-navigate, keyboard nav (j/k/Enter/q), collapse/expand branches, relative timestamps, summary diff preview, `vim.fn.undotree()` Lua API (Neovim-compatible dict), optional persistence (`set undofile`), per-file undo tree map, Obsidian commands for sidebar management. Inspired by [undotree](https://github.com/mbbill/undotree).
    - Plugin: `src/vim/undo-tree.ts` (shadow tree data structure), `src/vim/undo-tree-view.ts` (sidebar view), `src/main.ts` (CM6 integration, g+/g- actions, persistence hooks), `src/workspace/commands.ts` (ex commands), `src/lua/fn.ts` (`vim.fn.undotree()`)

### Changed

- **`minAppVersion` bumped from 1.6.6 to 1.7.2** — required for `Workspace.revealLeaf()` used by undo tree.

### Fixed

- **`g;`/`g,`/`g-`/`g+` keymaps not working after `reloadFeatures()`** — the changelist and undo tree `mapCommand` registrations were only in `onload()` but not in `reloadFeatures()`. Since `reloadFeatures()` calls `unregisterAll()` (which wipes all custom keymaps) and then re-registers features, these keymaps were silently wiped on any settings change, vimrc load, or Lua config load. Fixed by adding the registrations to `reloadFeatures()`.
    - Plugin: `src/main.ts` (added changelist + undo tree mapCommand calls to `reloadFeatures()`)

### Tests

- 66 unit tests in `test/unit/undo-tree.test.ts`: data structure (branching, navigation, pruning, time lookup, Neovim dict), serialize/deserialize round-trip, findBySaveCount, computePath, navigating flag, ChangeSet storage
- 8 e2e tests in `test/specs/undo-tree.e2e.ts`: CM6 integration, g+/g-, :earlier/:later, :undolist
- 4 e2e tests in `test/specs/undo-tree-view.e2e.ts`: sidebar open/close, node rendering, current marker
- 5 e2e tests in `test/specs/undo-tree-navigation.e2e.ts`: buffer content changes via :earlier/:later, g+/g- safety

### Documentation

- `CHANGELOG.md`: Added undo tree visualization feature and reloadFeatures fix
- `KNOWN_LIMITATIONS.md`: Added undo tree section
- `README.md`: Added undo tree to features list
- `CONTRIBUTING.md`: Added undo-tree.ts, undo-tree-view.ts to codebase structure
- `AGENTS.md`: Added undo tree to page ownership table
- `docs/features/undo-tree.md`: New feature page
- `docs/features/index.md`: Added undo tree link
- `docs/features/quality-of-life.md`: Added g+/g- and :earlier/:later to change navigation
- `docs/reference/keybindings.md`: Added undo tree navigation section
- `docs/configuration/settings.md`: Added Undo tree settings group
- `docs/configuration/vimrc.md`: Added undotree/undofile options
- `docs/configuration/lua-config.md`: Added vim.fn.undotree() and vim.opt entries
- `docs/features/ex-commands.md`: Added :earlier/:later/:undolist/:UndoTreeToggle

## [0.69.0] - 2026-07-19

### Fixed

- **Textarea vim overlay re-activates immediately after Escape exit** — pressing Escape in normal mode tore down the overlay and called `originalEl.focus()`, which triggered the `focusin` listener and re-created the overlay in insert mode after the 150ms debounce. Users saw a brief flash of the textarea before being placed back in insert mode, making it impossible to return to the modal context. Fixed by adding a `recentlyExited` guard (`WeakRef` + 250ms cooldown) that suppresses the `focusin` handler for the textarea that was just exited. After the cooldown, the textarea can be re-activated by clicking into it again. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (`recentlyExited` WeakRef guard, `markRecentlyExited` cooldown)
- **Lua text objects lost after `reloadFeatures()`** — `vim.textobject.add()` registrations from `.obsidian.init.lua` were silently discarded because `loadLuaConfigInternal()` called `reloadFeatures()` after Lua evaluation, destroying the `VimRegistration` instance that held the keybindings. Fixed by persisting text object specs in `luaTextObjectSpecs[]` and re-registering them via `reregisterLuaTextObjects()` after `reloadFeatures()` completes.
    - Plugin: `src/main.ts` (`luaTextObjectSpecs`, `registerLuaTextObject`, `reregisterLuaTextObjects`)

### Added

- **Subword motions (spider.nvim-style)** — `w`/`b`/`e`/`ge` override stopping at camelCase, snake_case, and kebab-case word boundaries. Opt-in via `set subword` / **Settings → Vim features → Subword motions**. 10,000-char performance guard falls back to standard word motions on pathological lines.
    - Plugin: `src/util/subword.ts` (shared boundary detection), `src/motions/subword.ts` (4 motion variants)
- **General-purpose text objects** — 6 new text objects complementing the existing 13 Markdown-specific ones: `iS`/`aS` (subword segment), `in`/`an` (numeric literal with sign/decimal), `iq`/`aq` (nearest quote pair on line), `iD`/`aD` (wikilink `[[...]]` with nesting), `gL` (forward-seeking URL), `i,`/`a,` (comma-separated argument with nesting). All work with operators (`d`, `c`, `y`) and visual mode.
    - Plugin: `src/text-objects/{pair-util,subword,number,any-quote,double-bracket,url,argument}.ts`
- **Enhanced increment/decrement (dial.nvim-style)** — `<C-a>`/`<C-x>` extended to cycle: markdown checkboxes (`[ ]`↔`[x]`), booleans (`true`↔`false`, case-preserved), hex colors (component-wise R/G/B, clamped 0–255), dates (`YYYY-MM-DD` with rollover), CSS values (preserving unit), and integers. Priority-ordered rules (first match wins). Opt-in via `set dial` / **Settings → Vim features → Enhanced increment/decrement**. Falls back to default `<C-a>`/`<C-x>` when no rule matches.
    - Plugin: `src/actions/{dial-rules,dial,register-dial}.ts`
- **Custom text objects via Lua** — `vim.textobject.add(keys, spec)` and `vim.textobject.del(keys)` API for defining custom text objects from `.obsidian.init.lua`. `vim.gen_spec.pair(open, close, opts?)` generates pair-matching specs with nesting and multi-line support. Keys must start with `i` (inner) or `a` (around). Invalid inputs produce error notices.
    - Plugin: `src/lua/textobject-api.ts`
- **External grep binary integration** — optional native ripgrep or GNU grep binary for the picker's grep/live-grep sources. Supports `rg --json` (structured output) and `grep -rn` (file:line:content format). Desktop-only with automatic fallback to in-memory search on mobile or binary failure. Circuit breaker (3 errors in 60s → auto-disable). Process cancellation on new query.
    - Plugin: `src/picker/sources/ripgrep-process.ts`, settings: `ripgrepEnabled`, `ripgrepBinaryPath`, `ripgrepArgs`, `grepMode`

### Tests

- 37 unit tests in `test/unit/subword.test.ts`: boundary detection (13 patterns), motion logic (20 cases including cross-line, count, performance guard)
- 45 unit tests in `test/unit/text-objects-extended.test.ts`: all 6 text objects with inner/around, edge cases, nesting
- 31 unit tests in `test/unit/dial.test.ts`: all 6 rules individually + priority ordering + tryDial integration
- 26 unit tests in `test/unit/lua-textobject-api.test.ts`: asymmetric/symmetric pair matching, nesting, multi-line, scanLimit
- 21 unit tests in `test/unit/ripgrep-process.test.ts`: JSON/grep output parsing, arg building, error classification
- 10 e2e tests in `test/specs/subword-motions.e2e.ts`: navigation, operators, snake/kebab, count, setting toggle
- 11 e2e tests in `test/specs/text-objects-extended.e2e.ts`: all text objects with delete/change operators
- 9 e2e tests in `test/specs/dial.e2e.ts`: all rule types, count prefix, no-match fallback, setting toggle
- 5 e2e tests in `test/specs/lua-textobject.e2e.ts`: custom pairs (single-char, multi-char, nested), error handling
- 3 e2e tests in `test/specs/ripgrep.e2e.ts`: conditional skip (binary availability)

### Documentation

- `CHANGELOG.md`: Added textarea re-activation prevention fix
- `KNOWN_LIMITATIONS.md`: Textarea re-activation after Escape → Fixed (recentlyExited guard)

## [0.68.0] - 2026-07-19

### Tests

- 13 regression tests in `test/specs/table-escaped-pipes.e2e.ts` for issues [#66](https://github.com/saberzero1/motions/issues/66) and [#67](https://github.com/saberzero1/motions/issues/67): typing `|` outside tables (empty doc, mid-text, non-table line, multiple pipes), escaped `\|` navigation (`]|` skips escaped pipes, wikilink pipe doesn't split cell), typing `|` in table cells (auto-escape, cell count preservation). 1 test skipped (Obsidian swallows `|` at DOM level — see KNOWN_LIMITATIONS.md)

### Documentation

- `KNOWN_LIMITATIONS.md`: Updated #67 from "Fixed" to "Partially fixed" — documented remaining Obsidian platform behavior where typing `|` in table cells is swallowed by the 1.7+ table editor at the DOM level (identical in built-in vim, bundled fork, and no-vim modes). Documented workaround via Embedded table widget mode.
- `docs/features/tables.md`: Added `[!bug]` callout about `|` typing limitation in Live Preview table cells
- **Documentation audit** — systematic audit of all `docs/` pages against source code. Corrected stale counts and inaccurate information across 11 files:
    - `docs/configuration/lua-config.md`: Fixed `insert_normal` mode prompt default from `(insert)` to `NORMAL` (matching `src/settings.ts`)
    - `docs/features/text-objects.md`, `docs/features/index.md`: Updated "12 text objects" → 13 (includes table rows)
    - `AGENTS.md`, `CONTRIBUTING.md`, `docs/development/architecture.md`: Updated "27 vim.fn functions" → 26 (matches `src/lua/fn.ts`)
    - `README.md`, `docs/features/index.md`: Updated "12 built-in picker sources" → 14
    - `docs/features/index.md`: Updated "60+ ex commands" → 100+
    - `README.md`, `docs/features/snippets.md`: Updated "40+ bundled snippets" → 60+
    - `docs/configuration/settings.md`: Moved jumplist/jumplistsize to "Vimrc / Lua only" subsection (not in Settings UI); added updatetime for consistency; moved stray cursorlineopt row from inside callout into Line numbers table; added Cursor line highlight mode row
    - `docs/features/quality-of-life.md`: Added change list navigation (`g;`/`g,`) section
    - `docs/features/workspace-navigation.md`: Made fold providers (frontmatter, callouts) more explicit
    - `KNOWN_LIMITATIONS.md`: Updated "all 12 sources" → "all 14 sources" in cross-note jump list section
    - `docs/features/index.md`: Updated "Ships 40+ snippets" → "Ships 60+ snippets"
    - `docs/getting-started/index.md`: Updated "60+ ex commands" → "100+ ex commands"

## [0.67.0] - 2026-07-18

### Added

- **Flash motions — enhanced f/F/t/T with labels** — when pressing `f{char}` and 2+ matches exist in the viewport, jump labels appear on all matches. Single match auto-jumps (stock Vim behavior preserved). Works with operators (`df{char}{label}`, `cf`, `yf`), visual mode (`vf{char}{label}`), and `;`/`,` repeat. Multi-line search enabled by default (configurable via `set flashmultiline`). Inspired by [flash.nvim](https://github.com/folke/flash.nvim).
    - Plugin: `src/flash/char-mode.ts` (core motion override), `src/flash/register.ts` (registration with original capture), `src/flash/labeler.ts` (distance-based label assignment with reuse + conflict skip), `src/flash/state.ts` (active flag, clever-f state)
- **Flash jump mode (s)** — bidirectional character jump bound to a configurable key (default: `s`). Press `s{char}` to search both directions with labels. Disabled by default (`set flashjump` to enable). Normal mode only — visual `s` retains `c` mapping.
    - Plugin: `src/flash/jump-mode.ts`
- **Flash clever-f** — when enabled (`set flashcleverf`), pressing `f{same-char}` after a flash jump falls through to stock `f` behavior (acts as `;`). Uses a 5-second timeout window.
    - Plugin: `src/flash/char-mode.ts` (clever-f check), `src/flash/state.ts` (last search tracking)
- **Search match counter** — hlslens-style `[3/15]` indicator in the status bar showing the current match index and total count after `/` search and `n`/`N` navigation. Hides when cursor moves off a match or mode changes from normal. General feature, not flash-specific.
    - Plugin: `src/vim/search-counter.ts` (new), `src/vim/mode-tracker.ts` (status bar integration)
- **Incremental jump search** — jump mode (`s`) now accepts multiple characters incrementally. Each keystroke narrows the match set; labels update in real-time with stable assignment via `FlashLabeler`. Supports Backspace (remove last char, widen matches), Enter (jump to nearest), and autojump on single match. Operator-pending (`ds{pattern}{label}`) and visual mode supported.
    - Plugin: `src/flash/jump-mode.ts` (rewritten), `src/easymotion/targets.ts` (`findSubstringTargets`)
- **Label conflict skipping** — labels that match the next character after a match position are excluded from the label pool, preventing ambiguity when the user might type that character to narrow the search.
    - Plugin: `src/flash/jump-mode.ts` (`computeSkipChars`)
- **`flashMinPatternLength` setting** — configurable minimum characters before labels appear in jump mode (default: 1). Below the threshold, matches are highlighted without labels.
    - Plugin: `src/settings.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`
- **Match highlighting without labels** — `showMatchHighlights()` renders subtle position indicators for matches below the `minPatternLength` threshold, distinct from label overlays.
    - Plugin: `src/easymotion/overlay.ts` (`showMatchHighlights`), `styles.css` (`.vim-motions-flash-match`)
- **Flash search mode** — after committing a `/` or `?` search with Enter, labels appear on all visible matches. Press a label key to jump directly; any non-label key clears labels. Configurable via `set flashsearch` / `set noflashsearch`.
    - Plugin: `src/flash/search-mode.ts` (new), `src/main.ts` (registration with cleanup)
- **codemirror-vim fork API additions** — `getMotion(name)` retrieves a motion function by name (for capturing originals before override). `recordLastCharacterSearch(increment, args)` sets the `;`/`,` repeat state from plugin code.
    - Fork: `~/Repos/codemirror-vim/src/vim.js`

### Changed

- **Flash labeler** — `FlashLabeler` class with distance-based assignment (closest targets get home-row labels), label reuse across narrowing (labels stay stable as match set shrinks), and conflict skipping via `skipChars` set.
- **EasyMotion dimming description** — updated to "Dim non-target text when EasyMotion or flash is active" since both features share the dimming overlay.
- **Textarea vim overlay Escape no longer closes parent modal** — pressing Escape in normal mode within the textarea overlay now tears down the overlay and returns focus to the original textarea, but no longer re-dispatches a synthetic Escape keydown to the parent UI. Previously, the second Escape closed the host modal (e.g., Spaced Repetition's edit flashcard dialog), which could cause data loss if the user hadn't clicked Save. The new behavior follows a symmetric context stack: modal → vim overlay → modal → user closes modal manually. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (removed synthetic Escape dispatch from `handleEscapeAndRedispatch`)

### Tests

- 1 new e2e test in `test/specs/textarea-vim.e2e.ts`: Escape from normal mode returns to textarea without closing modal — verifies overlay removed, modal still present, textarea restored, content synced
- 6 spike tests in `test/specs/spikes/spike-flash-override.e2e.ts`: defineMotion override, async motion, operator-pending, getMotion, recordLastCharacterSearch
- 17 baseline tests in `test/specs/flash-baseline.e2e.ts`: stock f/F/t/T with flash disabled (regression guards)
- 9 e2e tests in `test/specs/flash-char-mode.e2e.ts`: autojump, multi-match labels, escape cancel, settings toggle, multi_line, operator-pending, semicolon repeat
- 7 e2e tests in `test/specs/flash-jump-mode.e2e.ts`: jump mode setting, autojump, labels, no-match, escape, default key, clever-f
- 8 e2e tests in `test/specs/flash-incremental.e2e.ts`: incremental narrowing, autojump on single match, backspace, zero matches, escape, enter, min_pattern_length, operator-pending
- 5 e2e tests in `test/specs/flash-search-mode.e2e.ts`: labels after /pattern Enter, label jump, non-label key clears, no labels on zero/single match
- 3 e2e tests in `test/specs/search-counter.e2e.ts`: count after search, update after n, hide when cleared
- operator-combos.e2e.ts updated to disable flash (stock f/F/t/T behavior preserved)

### Documentation

- `docs/features/flash.md`: New feature page — usage, multi-line, operator-pending, visual, jump mode, clever-f, configuration
- `docs/features/index.md`: Added flash motions link
- `docs/features/easymotion.md`: Added cross-reference to flash
- `docs/features/index.md`: Updated flash description with incremental + search labels
- `docs/configuration/settings.md`: Added flash, flashmultiline, flashjump, flashjumpkey, flashcleverf, flashminpatternlength, flashsearch settings
- `docs/configuration/vimrc.md`: Added flash boolean and string options (including flashminpatternlength, flashsearch)
- `docs/configuration/lua-config.md`: Added flash vim.opt entries (including flashminpatternlength, flashsearch)
- `docs/reference/keybindings.md`: Added flash motions, jump mode, and search labels sections
- `KNOWN_LIMITATIONS.md`: Added flash motions section (Phase 1 + Phase 2 + Phase 3A + Phase 3B limitations)
- `README.md`: Updated flash motions feature bullet with incremental search + post-commit search labels
- `CONTRIBUTING.md`: Added flash/ module, search-counter.ts, updated jump-mode.ts description
- `AGENTS.md`: Updated flash motions page ownership with all settings
- `KNOWN_LIMITATIONS.md`: Textarea Escape behavior updated — no longer re-dispatches to parent, symmetric context stack documented
- `README.md`: Updated textarea feature description with new Escape behavior

## [0.66.0] - 2026-07-18

### Added

- **`vim.regex()` — ECMAScript regular expressions in Lua** — `vim.regex(pattern, flags?)` creates a regex object exposing `match_str`, `match_line`, `match_pos`, `replace`, and `test` methods. Uses JavaScript's `RegExp` engine (not Vim regex syntax). Returns 0-based byte offsets matching Neovim's `vim.regex()` convention. Invalid patterns raise a Lua error catchable with `pcall`.
    - Plugin: `src/lua/regex.ts` (new), `src/lua/api.ts` (registration via `injectRegex`)
- **Fengari fork: `__gc` metamethods via FinalizationRegistry** — `__gc` metamethods on userdata are now invoked when the userdata becomes unreachable from JavaScript. Registration happens at `lua_setmetatable` time (only when the metatable contains `__gc`). Finalizers are drained at three points: outermost `luaD_pcall` return, `collectgarbage("collect")`, and `lua_close`. Errors in `__gc` are silently swallowed (PUC-Rio semantics). Finalization order is unspecified. Tables with `__gc` are not finalized (userdata only). Environments without `FinalizationRegistry` gracefully degrade (no registration, no errors).
    - Fork: `~/Repos/fengari/src/lstate.js` (finalizer infrastructure on `global_State`, `drainFinalizers`, `lua_close` drain + unregister), `~/Repos/fengari/src/lapi.js` (`lua_setmetatable` split `LUA_TUSERDATA`/`LUA_TTABLE`, FR registration), `~/Repos/fengari/src/ldo.js` (drain point in `luaD_pcall`), `~/Repos/fengari/src/lbaselib.js` (`collectgarbage("collect")` drain integration)
- **Fengari fork: `collectgarbage()` no longer crashes** — all 8 `collectgarbage` modes now return safe values instead of throwing `luaL_error("lua_gc not implemented")`. `"count"` returns `0, 0` (no memory tracking). `"collect"` drains the `__gc` finalizer queue. `"isrunning"` returns `false`. All other modes return `0`. Previously, any Lua code calling `collectgarbage()` crashed the entire init sequence.
    - Fork: `~/Repos/fengari/src/lbaselib.js`
- **Native JS error propagation via `lua_atnativeerror`** — the plugin now installs a `lua_atnativeerror` handler that converts native JS errors (TypeError, RangeError, etc.) to extractable Lua strings. Previously, native JS errors thrown inside fengari C functions were pushed as `lightuserdata` and lost — `lua_tolstring` returned `null`, producing generic "Unknown Lua error" messages. The handler extracts `Error.message` (or `String(e)` for non-Error values) and pushes it as a Lua string. Covers all threads including coroutines (handler is on `global_State`).
    - Plugin: `src/lua/engine.ts` (`lua_atnativeerror` handler in `createSandboxedState`), `src/lua/types.d.ts` (`lua_touserdata`, `lua_atnativeerror`, `lua_pushinteger` type declarations)

### Changed

- **Fengari fork: `sprintf-js` replaced with custom formatter** — the `sprintf-js` npm dependency (sole runtime dependency) has been replaced with a purpose-built `luaSprintf` function in the fork's `src/lstrlib.js`. The fork now ships with zero runtime dependencies. Output is byte-identical to the previous implementation for all standard format patterns.
    - Fork: `~/Repos/fengari/src/lstrlib.js`, `~/Repos/fengari/package.json`, `~/Repos/fengari/DIFFERENCES.md`
- **Fengari fork: integers widened from 32-bit to 53-bit** — `math.maxinteger` is now `9007199254740991` (2^53 - 1). Arithmetic operations use full 53-bit `Number` precision. `string.packsize("j")` returns 8 (was 4). `tonumber("1099511627776")` now returns the integer (was `nil`). Bitwise operations remain 32-bit (JavaScript platform limitation). See `~/Repos/fengari/DIFFERENCES.md` § "Integer widening" for the full change list and remaining limitations.
    - Fork: `~/Repos/fengari/src/luaconf.js`, `~/Repos/fengari/src/llimits.js`, `~/Repos/fengari/src/lvm.js`, `~/Repos/fengari/src/lobject.js`, `~/Repos/fengari/src/lstrlib.js`, `~/Repos/fengari/src/ltable.js`, `~/Repos/fengari/src/lapi.js`, `~/Repos/fengari/src/ldo.js`, `~/Repos/fengari/src/lmathlib.js`, `~/Repos/fengari/src/lbaselib.js`
- **Coroutine↔Promise bridge for async Lua execution** — Lua callbacks (keymap functions, autocmd handlers, timer callbacks, user commands) can now call async APIs that yield the coroutine and resume when the Promise resolves. The bridge uses fengari's `lua_yieldk` continuations with a `CoroutineRunner` managing thread lifecycle, instruction hooks, timeouts (10s), and concurrency limits (16 concurrent operations). `pcall` correctly catches async errors across yield/resume boundaries.
    - Plugin: `src/lua/coroutine-runner.ts` (new: `CoroutineRunner` + `AsyncRegistry`), `src/lua/engine.ts` (`evalLuaAsync`, `INSTRUCTION_LIMIT` export), `src/lua/types.d.ts` (7 new fengari type declarations: `lua_newthread`, `lua_resume`, `lua_yieldk`, `lua_status`, `lua_xmove`, `lua_isyieldable`, `LUA_YIELD`)
- **`vim.ob.fs.read(path)` and `vim.ob.fs.readlines(path)`** — read vault files from Lua. `read` returns a string, `readlines` returns a table of lines. Both yield internally via the coroutine bridge. Errors are catchable with `pcall`. Works in keymap callbacks, autocmd handlers, timer callbacks, and user commands. Also works at top level in `init.lua`. Blocked in snippet `f()`/`d()` nodes (raises "async APIs cannot be called from snippet nodes").
    - Plugin: `src/lua/obsidian-api.ts` (`read`/`readlines` C-functions), `src/lua/loader.ts` (`fsRead` callback via `adapter.read` + `readExternalFile` for absolute paths), `src/lua/api.ts` (`fsRead` on `VimApiCallbacks`)
- **`require()` for multi-file Lua configs** — `require('mymodule')` loads `lua/mymodule.lua` from the vault root. Dot-separated names resolve to subdirectories (`require('utils.strings')` → `lua/utils/strings.lua`). Modules are cached in `package.loaded`. Circular requires detected via sentinel. Security: path traversal (`..`), absolute paths, and backslash paths are rejected.
    - Plugin: `src/lua/package.ts` (new: `package` table, sandboxed `load()`, Lua-implemented `require()`), `src/lua/engine.ts` (`load` kept in disabled list with re-enable note)
- **`load(chunk)` re-enabled with sandboxing** — `load()` compiles a string chunk and returns the compiled function (or `nil` + error). `dofile` and `loadfile` remain disabled. The instruction count hook applies to loaded code.
    - Plugin: `src/lua/package.ts` (`injectSandboxedLoad`)
- **`evalLuaAsync` for async init.lua execution** — top-level `init.lua` code can now call async APIs like `vim.ob.fs.read`. The init.lua chunk runs inside a coroutine via `evalLuaAsync`, which compiles on the main state and delegates to `invokeAsyncCapable`. `autocmdManager.activate()` fires only after all yields complete.
    - Plugin: `src/lua/engine.ts` (`evalLuaAsync`), `src/lua/loader.ts` (`evalLua` → `await evalLuaAsync`)
- **Callback sites refactored for async capability** — all 4 Lua callback invocation sites now use `CoroutineRunner.invokeAsyncCapable` when a runner is available, with fallback to the original `lua_pcall` path when not. Existing sync callbacks work identically.
    - Plugin: `src/lua/api.ts` (keymap, user command, autocmd callbacks), `src/lua/timers.ts` (`invokeLuaCallback` + 5 call sites)
- **Snippet async guard** — `f()` and `d()` snippet node evaluations are wrapped with `runner.setAsyncBlocked(true/false)` to prevent async API calls during snippet expansion.
    - Plugin: `src/snippets/dynamic-bridge.ts` (guards in `recomputeIfNeeded` and `expandDynamicSnippet`)

### Tests

- 11 tests in `~/Repos/fengari/test/collectgarbage.test.js`: all 8 modes return safe values, pcall succeeds, invalid mode errors
- 7 tests in `~/Repos/fengari/test/atnativeerror.test.js`: TypeError/RangeError extraction, string/number throws, pure Lua error unaffected, handler covers coroutine threads, without-handler baseline
- 10 tests in `~/Repos/fengari/test/gc-finalizers.test.js`: userdata `__gc` drain, no-overhead without `__gc`, tables not registered, error swallowing, metatable nil/change unregister, recursive drain guard, `lua_close` drain, post-close guard, no-FR graceful degradation
- 8 tests in `~/Repos/fengari/test/53bit-integers.test.js`: sprintf replacement (format specifiers, flags, hex float), 53-bit integer constants/boundaries, wide arithmetic, string parsing/formatting, table keying, pack/unpack with SZINT=8, 32-bit bitwise verification, wide for-loop
- 9 unit tests in `test/unit/lua/regex.test.ts`: constructor validation, `match_str` (offsets + nil), `match_line` alias, `match_pos` from offset, `replace` with captures + global flag, `test` boolean, flags (case-insensitive), invalid pattern error, missing pattern error
- 8 spike tests in `~/Repos/fengari/test/coroutine-promise-bridge.test.js`: `lua_yieldk` continuations, `lua_isyieldable`, `pcall` across yield, instruction hooks, error propagation, sequential yields, Lua-level vs C-level coroutines
- 11 unit tests in `test/unit/lua/coroutine-runner.test.ts`: sync path, yield/resume, rejected Promise, pcall error catch, instruction limit, timeout, concurrency limit, destroyAll, sequential async, snippet guard, thread-targeted hooks
- 7 unit tests in `test/unit/lua/eval-lua-async.test.ts`: sync code, syntax errors, top-level async, sequential async, pcall at top level, side effects across yield, instruction limit
- 6 unit tests in `test/unit/lua/fs-read.test.ts`: file read, pcall error catch, empty file, readlines, sequential reads, snippet guard
- 10 unit tests in `test/unit/lua/package-require.test.ts`: module loading, caching, subdirectory resolution, circular require, missing module, path traversal, syntax error, runtime error, load() compilation, load() error
- 22 e2e tests in `test/specs/lua-require.e2e.ts`: functional behavior (7), error handling (4), sandbox security (11)

### Documentation

- `CHANGELOG.md`: Added fengari fork improvements (sprintf, 53-bit integers, `__gc`, `collectgarbage`, `atnativeerror`), `vim.regex()`, coroutine bridge, async Lua APIs, require(), load(), evalLuaAsync entries
- `KNOWN_LIMITATIONS.md`: 32-bit integer limitation → Implemented (widened to 53-bit), hrtime overflow claim corrected; JS RegExp item 5 → Implemented; sprintf item 7 → Implemented (zero deps); vault file reading → Implemented; coroutine bridge item 1 → Implemented (Phases 1–3); require() item 2 → Implemented; load() item 6 → Implemented; `__gc` item 4 → Implemented (userdata via FinalizationRegistry); error message quality item 8 → Implemented (atnativeerror handler); `collectgarbage` item 10 → Implemented (safe no-ops); fengari improvement opportunities priority table updated (9/10 implemented, only weak tables remaining)
- `README.md`: Updated Lua configuration feature bullet with `vim.regex()`, async file reading, multi-file configs, and `__gc` userdata finalization
- `CONTRIBUTING.md`: Added `regex.ts`, `coroutine-runner.ts` and `package.ts` to codebase structure
- `AGENTS.md`: Updated fengari fork section — sprintf-js removed (zero deps), 53-bit integers, `vim.regex()`, async bridge, require(), load(), `__gc` via FinalizationRegistry, `collectgarbage` safe no-ops, native error propagation via `atnativeerror`
- `docs/configuration/lua-config.md`: Added `vim.regex()` API reference section, `vim.ob.fs.read`/`readlines` to fs table, `require()` and `load()` sections, `collectgarbage` behavior, updated unsupported APIs list
- `~/Repos/fengari/DIFFERENCES.md`: Updated behavioral differences table (`collectgarbage`, `__gc`), updated inherited limitations (collectgarbage and `__gc` addressed)
- `~/Repos/fengari/DIFFERENCES.md`: Added "Integer widening" section, sprintf replacement documentation, updated behavioral differences table, updated files modified list

## [0.65.0] - 2026-07-17

### Fixed

- **Block cursor displays wrong character after editor refocus in Live Preview** — when the editor lost and regained focus (e.g., opening/closing DevTools), Obsidian's Live Preview re-expanded hidden markdown formatting (like `## ` in headings) after focus returned. The block cursor's `requestMeasure` ran in the same frame as the decoration change, before the browser reflowed the new DOM — causing `coordsAtPos()` to read stale layout coordinates and the cursor to display the wrong character. Fixed in the codemirror-vim fork by adding `focusChanged` to the block cursor's redraw trigger and scheduling a deferred `requestAnimationFrame` re-measure on focus gain, ensuring the cursor reads post-reflow coordinates. ([#71](https://github.com/saberzero1/motions/issues/71))
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`focusChanged` trigger, deferred `requestAnimationFrame` re-measure), `~/Repos/codemirror-vim/src/index.ts` (focus event handler on `contentDOM`)

### Added

- **Replace-with-register operator (`gr{motion}`)** — implements the `gr` operator from [vim-ReplaceWithRegister](https://github.com/inkarkat/vim-ReplaceWithRegister). `gr{motion}` replaces the text covered by {motion} with register contents, discarding the replaced text (register preserved). Supports `grr` (linewise), `"xgr{motion}` (named registers), `{Visual}gr` (visual charwise and linewise), `[count]grr`, and dot-repeat. Blockwise visual mode is a documented no-op for v1. ([#72](https://github.com/saberzero1/motions/issues/72))
    - Plugin: `src/operators/replace-with-register.ts` (new: operator implementation), `src/operators/register.ts` (new: `registerReplaceWithRegister()` export), `src/main.ts` (independent gating via `enableReplaceWithRegister`), `src/workspace/navigation.ts` (conditional `grn`/`grr`/`gra` → `<leader>rn`/`<leader>rb`/`<leader>ra` relocation), `src/settings.ts` (`enableReplaceWithRegister` setting in both UI versions), `src/vimrc/loader.ts` (`replacewithregister`/`rwr` options), `src/types/vim-api.d.ts` (`getRegister()` type)
- **`enableReplaceWithRegister` setting** — boolean toggle (default: `true`) gating the `gr` operator independently from `enableHardWrap`. When enabled, `grn`/`grr`/`gra` workspace bindings are relocated to `<leader>rn`/`<leader>rb`/`<leader>ra` under a "Notes" which-key group. When disabled, legacy `grn`/`grr`/`gra` bindings are restored. Configurable via Settings UI (both pre-1.13 and post-1.13), `:set replacewithregister` / `:set rwr` in vimrc, or `vim.opt.replacewithregister` in Lua.

### Tests

- 22 e2e tests in `test/specs/operators.e2e.ts` for replace-with-register: `grr` (single, multi-line, count), `griw`, `gr$`, `grl`, `gri'`, `gr}`, named registers (`"agriw`, `"a3grr`), visual `gr` (charwise and linewise `V`), register type coercion (linewise↔charwise), cursor positioning, dot-repeat (`griw`, `grr`, `3grr`+`.`), multi-line register expansion, text object at line boundary. 4 skipped blockwise visual mode tests documenting expected behavior for future implementation.

### Documentation

- `CHANGELOG.md`: Added replace-with-register operator entry; added block cursor refocus fix entry
- `KNOWN_LIMITATIONS.md`: Updated `gr` replace-with-register parity section — removed `[count]grr` and dot-repeat gaps (confirmed working), updated test coverage line; added block cursor refocus → Fixed
- `README.md`: Added replace-with-register to features list
- `CONTRIBUTING.md`: Added `replace-with-register.ts` to codebase structure, updated workspace navigation description
- `AGENTS.md`: Updated workspace navigation description
- `docs/reference/keybindings.md`: Added replace-with-register section, updated workspace nav with `<leader>r*` bindings
- `docs/features/workspace-navigation.md`: Updated migration note with new `<leader>r*` defaults
- `docs/features/ex-commands.md`: Updated default-key column for relocated commands
- `docs/configuration/settings.md`: Added `enableReplaceWithRegister` to Vim features group
- `docs/configuration/vimrc.md`: Added `replacewithregister`/`rwr` to boolean options
- `docs/configuration/lua-config.md`: Added `replacewithregister` to vim.opt table

## [0.64.0] - 2026-07-16

### Fixed

- **Embedded table cell editor cursor shapes** — cell editors in embedded table widget mode now display correct cursor shapes (block for normal, bar for insert) matching the user's configured `cursorShapes` settings. Previously, insert mode showed no cursor and normal mode showed a hollow block due to two issues: (1) `cursorShapes` was not passed to `createEmbeddableEditor()` in `table-cell-editor.ts`, and (2) the cell editor's CM6 instance does not receive `.cm-focused` from Obsidian, causing the fork's unfocused-cursor rule to apply. Fixed with a module-level setter (`setCellEditorCursorShapes`) wired in both `onload()` and `reloadFeatures()`, a `pendingCursorShapes` stash in `embeddable-editor.ts` to handle the super-before-assignment timing issue, and a dynamic `CSSStyleSheet` (via `document.adoptedStyleSheets`) that generates cursor CSS from the user's configured shapes. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Plugin: `src/vim/table-cell-editor.ts` (setter, dynamic stylesheet), `src/editors/embeddable-editor.ts` (`pendingCursorShapes` stash), `src/main.ts` (setter calls + cleanup)
- **Embedded table cell editor font size and line height mismatch** — the cell editor text appeared larger than surrounding rendered table text in some themes, and cell height increased when entering edit mode. Added `font-size: inherit`, `font-family: inherit`, `line-height: inherit` to `.vim-table-cell-editor .cm-editor`, `font-size: inherit` to `.cm-content`, and `padding: 0` + `line-height: var(--table-line-height, var(--line-height-tight))` to `.cm-line`. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Plugin: `styles.css` (table cell editor CSS)
- **Table cell editor destroying wikilinks and formatting** — editing a cell containing `[[wikilink]]`, `**bold**`, or other markdown syntax stripped the syntax on write-back. Two issues: (1) the cell editor read its initial value from `wrapper.textContent` (the rendered DOM), which returns plain text without markdown syntax — `[[note-a]]` became `note-a`. Now reads raw markdown from the document source via `getCellDocumentRange()`. (2) On cell editor close, the cell content was restored as plain `textContent` without re-rendering markdown. Now uses `MarkdownRenderer.render()` to restore proper inline formatting (wikilinks, bold, italic, code) in the cell wrapper after the editor is destroyed. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Plugin: `src/vim/table-cell-editor.ts` (accepts `rawMarkdown` parameter, `rerenderCellContent()` on close), `src/vim/table-nav-controller.ts` (passes raw text from document)
- **Textarea vim overlay content not synced on rapid teardown** — clicking "Save" via hint mode (`f` key) on a modal while a debounced content sync was pending could close the modal before the CM6 overlay flushed its content to the hidden `<textarea>`. The host plugin (e.g., Spaced Repetition) read the textarea's stale value and saved incomplete content. Root cause: `teardownActive()` cancelled the pending 100ms sync timer and destroyed the editor without flushing. The `handleBlur()` and `handleEscapeAndRedispatch()` paths already called `syncNow()` before teardown, but the MutationObserver path (modal removed from DOM) went straight to `teardownActive()`. Fixed by adding a `syncNow()` call in `teardownActive()` immediately after cancelling the timer but before destroying the editor. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (`syncNow` flush in `teardownActive`)

### Documentation

- `CHANGELOG.md`: Added entries for embedded table cell editor cursor shapes, font size/line height, wikilink color fixes, and textarea sync-on-teardown fix
- `KNOWN_LIMITATIONS.md`: Added Live Preview rendering, cursor shapes, visual mode highlighting, and wikilink color loss limitations under "Table cell vim modality"; textarea content sync race condition → Fixed
- `docs/features/tables.md`: Added Live Preview callout for cell editors

## [0.63.0] - 2026-07-16

### Added

- **Cross-note vim jump list** — `<C-o>` and `<C-i>` now navigate backward/forward through a cross-note jump history. Jumps are recorded when navigating between notes via `gd`/`gD`, picker file selection (all 12 sources), harpoon, oil, hint mode, `:e`/`:find`/`:tabnew`/`:buffer`/`:bfirst`/`:blast`, structural buffer cycling (`]b`/`[b`), and Lua `vim.cmd("e ...")`. Within-buffer jumps (G, gg, /, ?) continue to use the fork's built-in jump list. Standalone EasyMotion jumps (not operator-pending) are also recorded. The jump list persists across sessions, handles file rename/delete, and supports count prefixes (`3<C-o>`). New `:jumps` ex command displays the list. New `jumplist` (boolean, default true) and `jumplistsize` (number, default 200) vim options.
    - Plugin: `src/vim/jumplist.ts` (new: `JumpList` class), `src/workspace/navigate.ts` (new: `navigateWithJump`/`navigateWithJumpFile`/`navigateWithJumpSetActive` wrappers), `src/workspace/global-defaults.ts` (`createJumpListWalkOverride`), `src/vim/jumplist-bridge.ts` (new: CM6 ViewPlugin for fork bridge), `src/vim/options.ts` (`jumplist`/`jumplistsize`), `src/easymotion/register.ts` (jump recording), `src/main.ts` (lifecycle, persistence, rename/delete handlers)
    - 43 navigation call sites migrated across 23 files (goto-definition, picker sources, oil, harpoon, hint mode, global-ex-command, Lua API, buffer cycling, workspace commands, vault search)
- **Table cell vim modality (embedded mode)** — cell editors in embedded table widget mode now support a two-Escape pattern: first Escape exits insert → normal mode within the cell editor, second Escape exits the cell editor back to table-nav mode. Entry mode semantics: `i` (insert at start), `a` (append at end), `c` (clear + insert), `s` (substitute). Vim registers are shared between cell editors and the main editor. Status bar reflects cell editor vim mode when active.
    - Plugin: `src/editors/embeddable-editor.ts` (mode-aware Escape keymap), `src/vim/table-nav-controller.ts` (entry mode dispatch via `handleKey`), `src/vim/mode-tracker.ts` (cell editor mode sync)
- **`ir`/`ar` table row text objects** — `ir` selects inner row content (between first and last `|`, excluding pipes), `ar` selects the entire row including pipes. Works in raw markdown mode. Follows the same pattern as `i|`/`a|` cell text objects.
    - Plugin: `src/text-objects/table-row.ts` (new), `src/text-objects/register.ts`

### Fixed

- **Hint mode `F` on file explorer and other generic targets opens in current tab instead of new tab** — pressing `F` in hint mode on a file in the left sidebar file explorer (`.nav-file-title`) opened it in the current tab, identical to `f`. The `hintOpenNew()` function only passed `openInNewPane=true` for `link` and `pane` target types; all other targets (`generic`, `button`, `input`) fell through to `openInNewPane=false`, bypassing the existing Ctrl+Meta click path that Obsidian interprets as "open in new tab". Simplified `hintOpenNew()` to always pass `openInNewPane=true` — the Ctrl+Meta click dispatch at line 344 already handles all non-link, non-pane targets correctly. ([#70](https://github.com/saberzero1/motions/issues/70))
    - Plugin: `src/ui/hint-mode.ts` (`hintOpenNew` simplified to unconditional `openInNewPane=true`)
- **`jumpListWalk` action override lost after `reloadFeatures()`** — the `defineActionOverride('jumpListWalk', ...)` applied during `onload()` was wiped by `reloadFeatures()` (called during vimrc loading) because `unregisterAll()` restored the original action and the override was not re-registered. Fixed by adding the override to `reloadFeatures()` alongside the existing `newLineAndEnterInsertMode` override.
    - Plugin: `src/main.ts` (added `jumpListWalk` override to `reloadFeatures()`)
- **First character swallowed when entering table cell editor** — pressing `i` in table-nav mode opened the cell editor and immediately dispatched `handleKey(adapter, 'i')`, but the vim extension on the cell editor's CM6 instance hadn't finished initializing. The dispatched `i` was either a no-op (vim not ready) or treated as typed text. Fixed by deferring the `handleKey` dispatch via `setTimeout(fn, 0)`.
    - Plugin: `src/vim/table-nav-controller.ts` (deferred `handleKey` in `enterCellEdit`)

### Tests

- 27 unit tests in `test/unit/jumplist.test.ts`: `JumpList` class — record, deduplication, jumpOlder/jumpNewer with count, handleRename, handleDelete with index adjustment, serialize/deserialize, max size eviction, forward history truncation, onRecord callback
- 10 e2e tests in `test/specs/jump-list.e2e.ts`: within-buffer G/gg/count `<C-o>`, cross-note `gd` → `<C-o>` → `<C-i>`, jump list data structure verification, `:jumps` modal, jumplist setting toggle, deleted file resilience
- 4 e2e tests in `test/specs/table-cell-vim-mode.e2e.ts`: `dir`/`dar`/`yir` table row text objects, `ir` no-op on non-table content
- 9 skipped e2e tests for embedded table cell editing (two-Escape, entry modes, register sharing) — test-environment limitation where CM6 table widget rendering does not activate through `registerEditorExtension` in WDIO; features verified manually

### Documentation

- `CHANGELOG.md`: Added entries for cross-note jump list, table cell vim modality, ir/ar text objects, jumpListWalk override fix, cell editor first-character fix, hint mode `F` file explorer fix
- `KNOWN_LIMITATIONS.md`: Cross-note jump list → Implemented (with cross-window limitation noted); table cell vim modality → documented two-Escape pattern and entry modes; ir/ar text objects → documented; hint mode `F` → updated behavior table (all targets now open in new tab)
- `README.md`: Added cross-note jump list to features list
- `CONTRIBUTING.md`: Added jumplist.ts, navigate.ts, table-row.ts, jumplist-bridge.ts to codebase structure
- `docs/reference/keybindings.md`: Added `<C-o>`/`<C-i>` jump list, `:jumps`, `ir`/`ar` text objects
- `docs/features/hint-mode.md`: Updated `F` action description to include file explorer and generic targets
- `docs/features/tables.md`: Added vim modality in cell editors section, table row text objects
- `docs/configuration/settings.md`: Added `jumplist` and `jumplistsize` settings
- `docs/configuration/vimrc.md`: Added `jumplist`/`jumplistsize` options

## [0.62.0] - 2026-07-15

### Fixed

- **Textarea vim overlay height collapses to near-zero after 0.60.1** — the 0.60.1 fix for unbounded textarea growth replaced `minHeight` with fixed `height` + `maxHeight` copied from the original textarea's computed size. When the original textarea used dynamic height (e.g., `height: auto` or content-dependent sizing), the captured height could be very small, trapping the CM6 overlay at a tiny fixed size with content hidden. Fixed by using adaptive height calculation: `minHeight = max(cssHeight, scrollHeight, 100px)` ensures a reasonable minimum, and `maxHeight = max(effectiveHeight, 50vh)` caps growth at half the viewport with scrollbar overflow. The wrapper's CSS `overflow` changed from `hidden` to `auto` so content exceeding `maxHeight` scrolls instead of being clipped. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (adaptive height calculation with `MIN_HEIGHT_PX` floor), `styles.css` (`overflow: auto` on `.vim-motions-textarea-overlay`)
- **Which-key "all" mode intercepting multi-key Oil bindings** — in "All partial keys" mode, the popup delay timer (default 500ms) caused the which-key overlay to appear between the `g` and second keystroke (`?`, `.`, `s`, `f`), disrupting Oil's `g?` help modal and other `g`-prefixed bindings. Fixed by bypassing the popup delay timer when the active view is an OilView — the overlay shows immediately, allowing multi-key bindings to complete without interference. Operator-pending hints (`d`, `c`, `y`) still work normally in Oil.
    - Plugin: `src/ui/which-key.ts` (`onKeyPressGeneral` Oil context check)
- **`ci*` marked as permanent Live Preview limitation** — investigation found that `ci*` (change inside bold) works correctly in Live Preview for multi-character content. On the active line, Obsidian uses `Decoration.mark` (visible text nodes), not `Decoration.replace` — the cursor is not displaced by collapsed decorations. The original limitation was overstated based on early testing with a transaction filter that has since been removed.
    - Plugin: `test/specs/text-objects.e2e.ts` (unskipped `ci*` test, now passing)

### Tests

- 4 new e2e tests in `test/specs/oil-which-key.e2e.ts`: `g?` opens Oil help modal with which-key "all" mode, `g.` not intercepted, no stale overlay after `g?`, leader-mode control
- 1 unskipped e2e test in `test/specs/text-objects.e2e.ts`: `ci*` on multi-character bold content

### Documentation

- `CHANGELOG.md`: Added entries for which-key + Oil fix, `ci*` limitation resolution, and textarea height fix
- `KNOWN_LIMITATIONS.md`: Which-key + Oil non-editor context → Fixed; which-key "all" mode Oil interception → Fixed; `ci*` Live Preview → resolved (was overstated); textarea overlay height collapse → Fixed
- `docs/configuration/which-key.md`: Updated Oil explorer context section — removed non-editor and "all" mode warnings
- `docs/features/text-objects.md`: Removed `ci*` limitation note if present

## [0.61.0] - 2026-07-15

### Fixed

- **Hint mode `F` on pane targets opens in same tab instead of new tab** — pressing `F` in hint mode on a pane target (`.workspace-leaf-content`) behaved identically to `f` (focus the pane) instead of opening the pane's content in a new tab. The `hintActivate()` function ignored the `openInNewPane` parameter for `targetType === 'pane'`, always calling `setActiveLeaf()`. Now calls `workspace.duplicateLeaf(leaf, 'tab')` when `openInNewPane` is true. Link targets were unaffected — `openLinkText()` already used the parameter correctly. ([#70](https://github.com/saberzero1/motions/issues/70))
    - Plugin: `src/ui/hint-mode.ts` (`hintActivate` pane branch)
- **`j`/`k` and other standard-gate keys not working in Bases views** — Obsidian Bases views (`.base` files) use the view type `"bases"`, which was missing from the default `GLOBAL_NAV_VIEW_TYPES` set. The `isPluginLeafActive()` check treated Bases as a plugin view and blocked standard-gate keys (`j`/`k` scroll, `H`/`L` tab switch, count-prefix digits). ([#70](https://github.com/saberzero1/motions/issues/70))
    - Plugin: `src/workspace/global-key-handler.ts` (added `'bases'` to `GLOBAL_NAV_VIEW_TYPES`), `src/settings.ts` (updated default list in description)

### Tests

- 1 new e2e test in `test/specs/hint-mode.e2e.ts`: `F` on pane target calls `duplicateLeaf` (spy-based verification)
- 1 new e2e test in `test/specs/global-nav.e2e.ts`: `H` from bases view switches to previous tab (creates `.base` file, verifies standard-gate key interception)

### Documentation

- `CHANGELOG.md`: Added entries for hint mode `F` pane fix and Bases view type fix
- `KNOWN_LIMITATIONS.md`: Updated hint mode target classification (pane `F` → `duplicateLeaf`); updated workspace navigation view type list to include `bases`
- `docs/features/hint-mode.md`: Updated pane target behavior description
- `docs/features/workspace-navigation.md`: Added `bases` to default view types
- `docs/configuration/settings.md`: Updated workspace navigation view types default list
- `docs/configuration/vimrc.md`: Updated default view types in description
- `docs/configuration/lua-config.md`: Updated default view types in examples

## [0.60.1] - 2026-07-15

### Fixed

- **Textarea vim setting not visible in legacy settings UI** — the "Vim keybindings in text areas" toggle was only added to the new `getSettingDefinitions()` API (Obsidian 1.13+). Users on Obsidian <1.13 could not find or enable the setting. Added the toggle to the legacy `display()` method in the "Vim features" section. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/settings.ts` (added `enableVimTextareas` toggle to legacy settings UI)
- **Textarea vim overlay grows with content instead of fixed size** — the CM6 editor overlay expanded vertically as content grew, unlike the original textarea which had a fixed height with scrollbar. Changed the wrapper to use `height` + `maxHeight` (copied from the original textarea's computed size) and added `overflow: auto` to the CM6 scroller, so content scrolls within the original textarea's dimensions. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (`height` + `maxHeight` instead of `minHeight`), `styles.css` (`overflow: auto` on `.cm-scroller`)
- **Textarea vim overlay text larger than original** — the CM6 editor used Obsidian's default editor font size instead of inheriting from the original textarea. Added `font-size: inherit` to `.vim-motions-textarea-overlay .cm-editor` so the overlay matches the original element's font size. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `styles.css` (`font-size: inherit` on `.cm-editor`)
- **Removed `!important` from textarea hidden styles** — the `.vim-motions-textarea-hidden` CSS class used `!important` on all four properties, which is not allowed by the project's CSS conventions.
    - Plugin: `styles.css`

## [0.60.0] - 2026-07-15

### Added

- **Vim keybindings in text areas** — focused `<textarea>` elements (e.g., flashcard edit modals from Spaced Repetition) are replaced with a vim-enabled CodeMirror 6 editor overlay. Starts in insert mode for transparent typing; press Escape for normal mode with full vim support. Second Escape tears down the overlay and returns focus to the original textarea (modal stays open). Content syncs back to the hidden textarea continuously (100ms debounce) with synthetic `input`/`change` events. Desktop only, disabled by default. ([#69](https://github.com/saberzero1/motions/issues/69))
    - Plugin: `src/vim/textarea-vim-manager.ts` (new), `src/editors/embeddable-editor.ts` (`skipActiveEditor` option), `src/main.ts` (registration), `src/settings.ts` (`enableVimTextareas`), `src/vim/options.ts` (`vimtextareas`/`vta`), `src/vimrc/loader.ts` (`KNOWN_SET_OPTIONS`), `styles.css` (overlay + hidden styles)

### Documentation

- `KNOWN_LIMITATIONS.md`: Added "Vim keybindings in text areas" section with scope, limitations (no input/contenteditable/iframe support, framework re-render conflicts, programmatic value detection, popout windows, maxlength enforcement)
- `docs/configuration/settings.md`: Added "Vim keybindings in text areas" setting to Vim features table
- `docs/configuration/vimrc.md`: Added `vimtextareas`/`vta` to boolean options table
- `docs/configuration/lua-config.md`: Added `vimtextareas` to `vim.opt` table

## [0.59.0] - 2026-07-15

### Fixed

- **Absolute line number highlight not updating on cursor movement** — when only absolute line numbers were enabled (`set number` without `set relativenumber`), the `vim-motions-line-num-current` highlight (bold current line number) did not follow the cursor. The `lineMarkerChange` callback in both the standalone line number gutter and the unified `statuscolumn` gutter only checked `update.docChanged` in absolute mode, ignoring `update.selectionSet` (cursor movement). Relative and hybrid modes were unaffected because they already included `update.selectionSet`. The highlight only updated incidentally when entering special content (MathJax, images) that triggered `docChanged` or `viewportChanged`. ([#68](https://github.com/saberzero1/motions/issues/68))
    - Plugin: `src/vim/line-number-gutter.ts` (`lineMarkerChange` absolute branch), `src/vim/statuscolumn.ts` (`lineMarkerChange` `!hasRelative` branch)
- **Typing `|` moves cursor to the left of `|`** — typing `|` anywhere in insert mode triggered the table auto-format inputHandler, which intercepted the keystroke and repositioned the cursor even on non-table lines (any line matching `/^\s*\|/`). The mid-edit interception caused cursor jumps, making it impossible to type `|` normally in an empty document or at the start of a line. ([#66](https://github.com/saberzero1/motions/issues/66))
- **Tables do not handle escaped `|` characters correctly** — in raw/cursor-aware table modes, escaped pipes (`\|`) inside cells were treated as cell boundaries during mid-edit auto-formatting, causing the cursor to jump and live preview to render extra cells. The auto-format inputHandler ran `realignTableLines()` after every `|` keystroke, which repositioned the cursor based on the realigned table structure — even when the `|` was escaped. Wikilinks (`[[page|alias]]`) inside raw table cells also triggered incorrect cell boundary detection. ([#67](https://github.com/saberzero1/motions/issues/67))
    - Root cause for both: `table-auto-format.ts` intercepted every `|` keystroke in insert mode and ran column realignment mid-edit.
    - Fix: Replaced mid-edit `|` interception with format-on-exit — tables are only realigned when the cursor leaves the table range. A CM6 `ViewPlugin` tracks cursor entry/exit from table ranges and dispatches `realignTableLines()` via `queueMicrotask` when the cursor exits a dirty (edited) table. Uses `Annotation.define<boolean>()` as a re-entrancy guard. The `||` → separator row auto-generation is preserved as a standalone inputHandler.
    - Plugin: `src/vim/table-format-on-exit.ts` (new: format-on-exit ViewPlugin + separator handler), `src/vim/table-utils.ts` (added `realignTableLines()`, `parseAlignments()`, `buildSepCell()`, `findTableBounds()`, canonical `Alignment` type), `src/vim/table-auto-format.ts` (deleted), `src/vim/table-cursor-fix.ts` (deleted), `src/vim/table-operations.ts` (refactored to use shared `realignTableLines()`), `src/motions/tables.ts` (refactored to use shared `realignTableLines()`, removed 5 duplicate helpers), `src/vim/table-render-widget.ts` (uses canonical `Alignment` type), `src/vim/table-nav-controller.ts` (added `tableRealign()` in `doRefreshAfterOp()` for embedded cell edit alignment), `src/vim/table-cell-editor.ts` (removed `createTableAutoFormatExtension` dependency), `src/motions/register.ts` (removed `tableAwareMoveUp` override on `k`), `src/main.ts` (replaced auto-format/cursor-fix registration with format-on-exit)

### Changed

- **Neovim-style modal styling for `GlobalExCommandModal` and `VimInfoModal`** — the ex command modal (`:` in non-editor views) and the info modal (`:marks`, `:buffers`, `:registers`, Oil `g?`) now use Neovim-inspired styling: transparent container, accent border (`--color-accent`), floating title label positioned on the top border, monospace font, and hidden Obsidian chrome (close button, modal header). `GlobalExCommandModal` uses a prompt-modal pattern with three styled sections (input, results, instructions) and two-column suggestion rows showing `:command` + description. All 40+ ex commands now have `description` fields. `VimInfoModal` uses an info-modal pattern with an accent-bordered inner wrapper. Both patterns use `--modal-background`, `--font-monospace`, and `--color-accent` CSS variables for full theme compatibility.
    - Plugin: `src/ui/global-ex-command.ts` (`description` field on `GlobalExEntry` and `ExSuggestion`, prompt-modal container styling, two-column `renderSuggestion`), `src/ui/vim-info-modal.ts` (info-modal container styling, floating title, inner wrapper), `styles.css` (new prompt-modal and info-modal CSS sections)
- **Neovim-style modal styling extended to remaining modals** — `OutlineModal` (`:outline`/`gO`), `SearchResultsModal` (`:vimgrep`), `ContextActionsModal` (`gra`), and `OilConfirmModal` (Oil destructive commit) now use the same Neovim-inspired styling as `GlobalExCommandModal` and `VimInfoModal`. `OutlineModal` shows heading text + line number, `SearchResultsModal` shows filename + line preview, `ContextActionsModal` shows command name + command ID. `OilConfirmModal` uses the info-modal pattern with accent-bordered buttons. Removed 3 unused CSS classes (`vim-motions-search-file`, `vim-motions-search-preview`, `vim-motions-outline-item`).
    - Plugin: `src/ui/outline-modal.ts`, `src/workspace/vault-search.ts`, `src/ui/context-actions.ts`, `src/oil/manager.ts`, `styles.css`

### Documentation

- `KNOWN_LIMITATIONS.md`: Absolute line number highlight not updating on cursor movement → Fixed
- `KNOWN_LIMITATIONS.md`: Table auto-formatting → updated to describe format-on-exit behavior; typing `|` cursor jump (#66) → Fixed; escaped `\|` handling (#67) → Fixed
- `docs/features/tables.md`: Auto-formatting section rewritten to describe format-on-exit behavior

## [0.58.0] - 2026-07-15

### Fixed

- **Table escaped pipes** — cells containing escaped pipes (`\|`) no longer corrupt cell boundaries during navigation, text object operations, or embedded cell editing write-back. All pipe-boundary detection across 7 files now uses shared escape-aware utilities (`findUnescapedPipes()` / `splitCellsEscapeAware()`) in `table-utils.ts`. Escaped pipes (`\|`) are treated as cell content; `\\|` (escaped backslash + real pipe) is correctly treated as a boundary via backslash-parity checking.
    - Plugin: `src/vim/table-utils.ts` (new: `findUnescapedPipes()`, `splitCellsEscapeAware()`, `countPrecedingBackslashes()`), `src/vim/table-render-widget.ts`, `src/vim/table-operations.ts`, `src/vim/table-auto-format.ts`, `src/vim/table-nav-controller.ts`, `src/text-objects/table-cell.ts`, `src/motions/tables.ts` (all updated to use shared utilities)
- **Vimrc file I/O timing** — `readVimrcFile()` now uses `stat()` as a readiness probe before `read()`, distinguishing genuinely empty files (`stat.size === 0`, no retry) from timing-empty reads (`stat.size > 0`, retry with extended backoff 50/100/200/400ms). `fileExists()` uses `stat()` instead of a full `read()`. On retry exhaustion, a user-facing Notice is shown. The `vimrcLoading` flag is now wrapped in `try/finally` so a failed `loadVimrc()` call no longer permanently blocks future retry attempts. The same `stat()`+retry pattern is applied to `readLuaFile()` in the Lua config loader.
    - Plugin: `src/vimrc/loader.ts` (`readVimrcFile`, `fileExists`), `src/lua/loader.ts` (`readLuaFile`), `src/main.ts` (`try/finally` around vimrc loading)
- **Oil which-key labels not appearing** — `getCommandLabels()` in `OilKeybindingManager` returned empty when oil bindings were not yet applied (the `if (!this.applied) return []` guard prevented labels from being registered during `rebuildWhichKey()`). Labels are now always returned — they are static metadata from `OIL_MAPPINGS`, valid regardless of whether the vim mappings are currently active.
    - Plugin: `src/oil/keybindings.ts` (removed `applied` guard from `getCommandLabels()`)
- **Live grep UI blocking on large vaults** — the live grep picker source now uses chunked async iteration (50 files per chunk) with event loop yields between chunks, preventing UI freezes during searches on vaults with many files. Functionally identical results.
    - Plugin: `src/picker/sources/live-grep.ts` (chunked iteration with `window.setTimeout(0)` yields)

### Changed

- **Oil `g?` help uses `VimInfoModal`** — `g?` in Oil now opens a modal dialog (Key/Action table) instead of a custom DOM overlay. This follows the same pattern used by `:marks`, `:buffers`, and `:registers` when the picker is disabled. Dismissible via Escape.
    - Plugin: `src/oil/keybindings.ts` (`showOilHelp` rewritten to use `VimInfoModal`), `styles.css` (removed `.vim-motions-oil-help*` CSS)

### Tests

- 5 e2e tests in `test/specs/table-escaped-pipes.e2e.ts` (new): `di|` with `\|` content, `\\|` as real pipe boundary, `]|` navigation skipping `\|`, `yi|` yanking cell with `\|`, `:tablerealign` preserving `\|` cell content

### Documentation

- `KNOWN_LIMITATIONS.md`: Table escaped pipes → Fixed; `g?` oil help command → Fixed (was listed as "planned but not yet implemented"); oil which-key integration → Fixed; surround `ys` dot-repeat with tag/function → clarified as working at runtime (test infrastructure limitation only); vimrc timing section updated with improved retry mechanism
- `KNOWN_LIMITATIONS.md`: Added two new Oil limitations — which-key/`g?` not working in non-editor context (no prior editor leaf), and which-key "all" mode intercepting multi-key Oil bindings (`g?`, `g.`, `gs`, `gf`)

## [0.57.0] - 2026-07-14

### Fixed

- **Table cell edits not rendered immediately in embedded mode** — editing a table cell and pressing Escape or Tab wrote the change to the document but did not visually update the rendered table widget until the user navigated away or switched cells. The `tableRenderField` StateField's `update()` method has a "D12 guard" (`activeEditTableRange`) that, when set, maps old decorations instead of rebuilding them on `docChanged`. This guard was correctly cleared for table operations (`o`, `dd`, `J`, `K`, etc.) via `executeTableOp()` and for full table exit via `exitTable()`, but `exitCellEdit()` — the path taken when closing a cell editor — never cleared it. The dispatch from `closeCellEditor()` triggered `docChanged` while the guard was still active, causing `prev.map(tr.changes)` (position-only shift) instead of `buildDecorations()` (full HTML rebuild). Fixed by adding `setActiveEditTableRange(null)` before `closeCellEditor()` and replacing the immediate `highlightCell()` with `refreshAfterOp()` — the same pattern used by all other table mutation paths. ([#61](https://github.com/saberzero1/motions/issues/61))
    - Plugin: `src/vim/table-nav-controller.ts` (`exitCellEdit()`)
- **Visual-line mode highlight missing on replaced widget blocks** — in visual-line mode (`V`), the fork's `linewiseVisualHighlight` ViewPlugin uses `Decoration.line()` to highlight selected lines, but replaced widget blocks (MathJax `$$`, note embeds `![[note]]`, plugin table widgets) have no `.cm-line` elements in the DOM — CM6 silently drops line decorations for replaced ranges. Fixed by adding a plugin-side `LinewiseWidgetHighlight` ViewPlugin that scans `contentDOM` direct children for non-`.cm-line` widget elements and toggles `cm-vim-linewise-widget-selection` on widgets whose document range overlaps the visual-line selection. Uses `view.posAtDOM()` for position mapping. Generic — works for all replaced widget types, not just MathJax. ([#57](https://github.com/saberzero1/motions/issues/57))
    - Plugin: `src/vim/linewise-widget-highlight.ts` (new), `styles.css` (`.cm-vim-linewise-widget-selection` rule), `src/main.ts` (extension registration)

## [0.56.0] - 2026-07-14

### Added

- **Surround `csf` (change surrounding function name)** — `csf` changes the function name around the cursor. Prompts for the new function name via a `func: ` status bar prompt; press Enter to apply or Escape to cancel. Dot-repeat (`.`) replays with the saved name. Uses the same `findSurroundingFunction` as `dsf` (single-line only). Handles nested calls and method chains.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`target === 'f'` case in change operator, `pendingInput` prompt, `funcResult` fallback in `handleSurroundSubState`)
- **Oil which-key integration** — the which-key popup now shows Oil-specific keybindings (`-`, `Enter`, `~`, `g.`, `gs`, `y.`, `gf`, `g?`, `q`, `Ctrl-l`) with descriptions when an Oil view is active. Descriptions are single-sourced from the `OIL_MAPPINGS` array and fed into the which-key `commandLabels` map via `getCommandLabels()`.
    - Plugin: `src/oil/keybindings.ts` (`desc` field on `OilMapping`, `getCommandLabels()` method), `src/main.ts` (oil labels injected into `rebuildWhichKey()`)
- **Oil `g?` help overlay** — press `g?` in Oil to toggle a help overlay listing all Oil keybindings with descriptions. Entries are derived from `OIL_MAPPINGS` to prevent drift. Dismissible via `g?` (toggle) or Escape.
    - Plugin: `src/oil/keybindings.ts` (`g?` mapping, `showOilHelp` method), `styles.css` (oil help overlay styles)
- **IM platform presets** — a settings dropdown auto-fills binary path, arguments, and default IM for common tools: macism (macOS), im-select (Windows), fcitx5-remote (Linux), ibus (Linux). Values are editable after selection.
    - Plugin: `src/settings.ts` (`imPreset` setting, `IM_PRESETS` data, preset dropdown in both legacy and searchable settings UI)
- **`:IMToggle` / `:IMStatus` ex commands** — `:IMToggle` enables/disables IM switching and saves the setting. `:IMStatus` queries the current IM identifier and displays it via a Notice.
    - Plugin: `src/main.ts` (`registerImExCommands()`)
- **IM session persistence** — per-editor IM state is persisted to plugin settings via `saveData()` (30-second interval + immediate save on unload). On plugin load, the persisted state is restored so the first `InsertEnter` uses the correct IM instead of the default.
    - Plugin: `src/im/im-switcher.ts` (`loadPersistedState()`, `getPersistedState()`), `src/settings.ts` (`persistedImState` field), `src/main.ts` (load/save wiring)
- **Special marks in picker** — the `:marks` picker now shows special marks (`'`, `.`, `<`, `>`) under a "Special marks" group between buffer and global marks.
    - Plugin: `src/picker/sources/mark-providers.ts` (`SpecialMarkProvider`), `src/main.ts` (registered as third provider)
- **`:grep` regex support** — `:grep` now uses JavaScript `RegExp` for pattern matching instead of Obsidian's `prepareSimpleSearch`. Invalid regex patterns gracefully fall back to substring matching. This matches Neovim's `:grep` behavior where the pattern is a regex.
    - Plugin: `src/picker/sources/grep.ts` (`createMatcher()` with `RegExp` + fallback), `src/picker/sources/live-grep.ts` (same pattern)

### Changed

- **`loadInitLua()` parameter refactor** — the function signature was refactored from 11 positional parameters to `(app, vim, options?)` with a `LoadInitLuaOptions` interface. All callers updated.
    - Plugin: `src/lua/loader.ts` (`LoadInitLuaOptions` interface, destructured options), `src/main.ts` (caller updated)

### Fixed

- **Vimrc loading reliability** — `readVimrcFile` now retries with exponential backoff (50ms, 100ms, 200ms) when the vault adapter returns empty content during early `active-leaf-change` events. The arbitrary 100ms safety-net timeout for map re-application has been removed. This addresses the intermittent issue where `nmap L $` or `set textwidth` commands were silently dropped on plugin load.
    - Plugin: `src/vimrc/loader.ts` (`readVimrcFile` retry logic), `src/main.ts` (removed 100ms setTimeout)
- **Vimrc soft-reload** — the vimrc file is now watched via `vault.on('modify')`. When modified, maps and settings are re-applied without a plugin reload. Previous vimrc-sourced maps are unmapped before re-application to prevent accumulation. `exmap` definitions from the initial load persist (documented as known limitation).
    - Plugin: `src/main.ts` (`softReloadVimrc()`, `vimrcMapKeys` tracking, `vault.on('modify')` handler)
- **BufEnter initial fire destroying buffer-local keymaps** — function-callback keymaps registered in `BufEnter` autocmd handlers during the initial synthetic `BufEnter` were destroyed by the subsequent `reloadFeatures()` → `vim.resetKeymap()` call. Fixed by deferring the initial `BufEnter` fire until after `reloadFeatures()` and `applyLuaMaps()` complete. The `AutocmdManager` now stores the initial file path in `pendingInitialBufEnterPath` and exposes `fireInitialBufEnter()` to fire it at the correct lifecycle point.
    - Plugin: `src/lua/autocmd.ts` (`pendingInitialBufEnterPath`, `fireInitialBufEnter()`), `src/main.ts` (call after reload)
- **Blockquote fenced code block detection** — `findFenceLines` now matches fences prefixed with blockquote markers (`> ``` `). The regex was updated from `/^```/` to `/^(?:>\s*)*```/` with blockquote depth matching to ensure open/close fences are at the same nesting level. This fixes multi-line text objects and smart list continuation incorrectly matching delimiters inside blockquote code blocks.
    - Plugin: `src/text-objects/code-block.ts` (`FENCE_OPEN`/`FENCE_CLOSE` regexes, `blockquoteDepth()`)
- **EasyMotion operator-pending dot-repeat** — `d<leader><leader>w{label}` followed by `.` now replays the delete to the same relative position. The fork stores the resolved async motion position as a relative offset in `lastEditInputState._asyncMotionTarget` after `applyOperator` succeeds. During dot-repeat, `repeatLastEdit` detects this stored target and applies the operator directly instead of re-executing the async motion overlay.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`_asyncMotionTarget` storage in async `.then()`, `repeatCommand()` offset replay)
- **Surround `ys` dot-repeat with text object motions** — `ysiwb` (surround inner word with parentheses) then `.` on a different word now correctly replays the surround. The fork stores the text object motion characters (`_ysTextObjectMotion` and `_ysTextObjectChar`) in `lastEditInputState` via the `onRepeat` callback. During dot-repeat, `repeatLastEdit` re-evaluates the text object at the current cursor via `textObjectManipulation()` and applies `addSurroundToRange()`. Works for all simple delimiters (`ysiwb`, `ysiw"`, `ysaw'`, `ysiw]`). Tag (`ysiw<em>`) and function (`ysiwflen`) dot-repeat is verified at the fork level (1806/0) but cannot be tested via WDIO due to `<`/`>` key dispatch conflicts with vim's angle-bracket notation parser — these tests are skipped in the plugin e2e suite with a reference to the fork tests.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`_ysTextObjectMotion`/`_ysTextObjectChar` in `onRepeat`, `repeatCommand()` text object replay), `~/Repos/codemirror-vim/src/types.ts` (3 new `InputStateInterface` fields), `~/Repos/codemirror-vim/DIFFERENCES.md`
- **Settings parity between pre-1.13 and post-1.13 Settings UI** — all plugin settings are now exposed in both the legacy `PluginSettingTab.display()` method (Obsidian <1.13) and the new `getSettingDefinitions()` API (Obsidian 1.13+). Previously, 22 settings were missing from the legacy UI and 9 from the new UI:
    - **Added to legacy settings** (pre-1.13): Input method section (7 settings: enable, binary path, obtain/switch args, normal mode IM, restore behavior, default insert IM), Fuzzy picker for buffers, Picker leader mappings, Picker matching engine, Third-party integrations (Omnisearch, Obsidian Tasks, Dataview), Show config load notifications, Which-key popup delay, 7 mode prompts (visual line, visual block, select, virtual replace, command, search, insert-normal)
    - **Added to new settings** (1.13+): Snippets group (4 settings: enable, bundled, directory, trigger mode), File explorer group (4 settings: oil explorer, show hidden files, confirm delete threshold, default sort order), Workspace navigation view types
    - Plugin: `src/settings.ts` (`display()` and `getSettingDefinitions()`)
- **Lua runtime callbacks now have infinite loop protection** — all 5 runtime `lua_pcall` sites (function keymaps, user commands, autocmd handlers, timer callbacks, snippet f()/d() nodes) are now wrapped with `withInstructionGuard`, which sets `lua_sethook` with `LUA_MASKCOUNT` before each call and clears it after. Instruction limit: 500,000 for callbacks, 100,000 for snippet nodes. On timeout, a throttled Notice is shown (5-second cooldown). Obsidian remains responsive.
    - Plugin: `src/lua/types.d.ts` (type fix), `src/lua/engine.ts` (`withInstructionGuard`, `showLuaErrorNotice`), `src/lua/api.ts` (3 sites), `src/lua/timers.ts` (1 site), `src/snippets/dynamic-bridge.ts` (2 sites)
- **Global marks updated on file rename/delete** — renaming a file now updates all global marks (`A`–`Z`) pointing to it. Deleting a file removes the marks. Follows the same `vault.on('rename')`/`vault.on('delete')` pattern as harpoon and fold persistence.
    - Plugin: `src/vim/mark-store.ts` (`renamePath()`, `removeByPath()`), `src/main.ts` (4 lines in event handlers)
- **Surround `csbBysaBb` chain now works** — `ys` with text object motions (`aB`, `iw`, `a"`, etc.) after `cs` or standalone now correctly applies the surround. The `ys_motion` handler directly evaluates text object motions instead of dispatching through `handleKey` → `evalInput`, where `clearInputState` would lose the `selectedCharacter`. 74/74 nvim-surround golden comparison tests now pass (up from 73/74).
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`ys_motion` handler, `operatorArgs` on surround state), `~/Repos/codemirror-vim/src/types.ts` (`operatorArgs` field)
- **Surround dot-repeat cross-type leak prevention** — the surround dot-repeat guard was tightened to only use saved replacements when `_surroundType` matches the current operation type (`cs`, `ys`, `yss`), preventing stale state from a prior `cs` operation from silently consuming a subsequent `ys` command.
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (tightened `savedReplacement` guards with `_surroundType` match)
- **Vimrc loading decoupled from CM adapter** — vimrc parsing no longer requires a CM adapter. `loadVimrc` now uses a two-phase approach: `readAndParseVimrcFile` reads and parses the file without needing an editor (reusing `parseVimrc` from `parser.ts`), then `applyVimrcCommands` applies all 14 `VimrcCommand` types with explicit handling — `exmap` is applied eagerly (no CM needed), unknown commands deferred to `pendingExCommands` and applied when a CM adapter becomes available. The 5×50ms retry loop has been removed. The 100ms safety-net map reapplication is kept for CM Vim keymap init timing.
    - Plugin: `src/vimrc/loader.ts` (`readAndParseVimrcFile`, `applyVimrcCommands`, `applyPendingExCommands`, refactored `loadVimrc`), `src/main.ts` (retry loop removed, `pendingVimrcExCommands` field, deferred application in `active-leaf-change` handler)

### Documentation

- `KNOWN_LIMITATIONS.md`: EasyMotion dot-repeat → Fixed; surround `ys` dot-repeat with text objects → Fixed (simple delimiters), tag/function pending; blockquote fence detection → Fixed; grep regex → Fixed; special marks in picker → Fixed; IM presets/persistence/ex commands → Implemented; `loadInitLua` refactor → Implemented; vimrc hot-reload → updated to soft-reload; vimrc loading reliability → updated with retry logic; tag `cst`/`yst` → Verified; `ci*` Live Preview → Permanent; `selectmode=mouse` → Permanent
- `DIFFERENCES.md` (fork): Added `csf` section; updated surround summary; added `ys_motion` text object fix; added async motion dot-repeat (`_asyncMotionTarget`); added surround `ys` text object dot-repeat (`_ysTextObjectMotion`)
- `docs/features/oil-explorer.md`: Added `g?` to oil ex commands table
- `docs/configuration/which-key.md`: Added Oil explorer context section (fork mode only)
- `docs/configuration/settings.md`: Added IM preset row to Input method table
- `docs/features/ex-commands.md`: Added `:IMToggle` and `:IMStatus` to ex commands reference
- `CHANGELOG.md`: Added entries for all 13 implemented items across Phases 1–6

## [0.55.0] - 2026-07-13

### Changed

- **Sign column migrated to dedicated gutter column** — vim mark indicators (`a`–`z`, `A`–`Z`) now render in a proper CM6 `gutter()` column instead of using `Decoration.line()` + CSS `::after` overlays. Fixes marks cascading vertically into the wrong line, overlapping on multi-mark lines, and inheriting heading font sizes. The gutter layout from left to right is: sign column → line numbers → fold column → content, matching Neovim's default arrangement. Uses `Compartment`-based runtime reconfiguration — `:set signcolumn=yes/auto/no` takes effect without full feature reload. `signcolumn=auto` now causes layout shift when marks appear/disappear (matching Neovim behavior); `signcolumn=yes` always reserves gutter space. ([#59](https://github.com/saberzero1/motions/issues/59))
    - Plugin: `src/vim/sign-column.ts` (rewritten: `gutter()` + `GutterMarker` + `Compartment`), `src/vim/mark-gutter.ts` (updated re-exports), `src/main.ts` (unconditional registration, `reconfigureSignColumnGutter()`), `src/settings.ts` (removed from `RELOAD_KEYS`, dedicated handlers in both settings panels, `enableMarkGutter` deprecated), `src/vimrc/loader.ts` (`markgutter` mapped to `signcolumn` via `sideEffect`), `styles.css` (gutter element styles replacing `::after` overlay)
- **`enableMarkGutter` setting deprecated** — the boolean `enableMarkGutter` property is now optional with `@deprecated` JSDoc. Existing settings are auto-migrated to `signcolumn` via `settings-migration.ts`. The property is kept in the interface for migration type safety only.

### Added

- **Dual line number display** — new `linenumbermode` option (`hybrid`/`dual`/`dual-rel-abs`) shows absolute and relative line numbers in separate side-by-side gutter columns. `set number relativenumber linenumbermode=dual` renders absolute on the left, relative on the right (configurable via `dual-rel-abs` for the reverse). The default `hybrid` mode is unchanged — existing configs are fully backward compatible. Auto-disabled on mobile viewports (≤600px, falls back to hybrid). Configurable via Settings UI dropdown, `set linenumbermode=dual` (alias `lnm`) in vimrc, or `vim.opt.linenumbermode = "dual"` in Lua.
    - Plugin: `src/vim/line-number-gutter.ts` (dual compartments, `resolveGutters()`), `src/vim/options.ts` (`linenumbermode` option), `src/settings.ts` (setting + UI dropdown), `src/vimrc/loader.ts` (`linenumbermode`/`lnm`), `src/main.ts` (pass `linenumbermode` to extension creation/reconfiguration)
- **Global vs local mark color differentiation** — global marks (`A`–`Z`) render in `--text-muted` color, local marks (`a`–`z`) render in `--text-accent`. The first character of the label determines the CSS class (`.vim-motions-sign-marker-global` or `.vim-motions-sign-marker-local`).
    - Plugin: `src/vim/sign-column.ts` (`SignMarker.toDOM()` case detection), `styles.css`
- **Click-to-navigate on mark labels** — clicking a mark label in the sign column gutter moves the cursor to that line. Uses `domEventHandlers.click` on the gutter, querying the `signColumnField` RangeSet for markers at the clicked line.
    - Plugin: `src/vim/sign-column.ts` (`domEventHandlers.click`)
- **`signcolumn` width modes** — `signcolumn` now accepts `auto:N` and `yes:N` syntax (N = 1–4) to control sign column character width. `set signcolumn=auto:3` reserves 3 character slots when marks exist. `set signcolumn=yes:2` always reserves 2 character slots. Validation via regex; invalid values silently rejected.
    - Plugin: `src/vim/sign-column.ts` (`parseSignColumnMode()`, `isValidSignColumnValue()`), `src/vim/options.ts` (validation), `src/settings.ts` (type widened to `string`), `src/vimrc/loader.ts` (removed `validValues`)
- **`statuscolumn` API** — Neovim-compatible `statuscolumn` option for user-configurable gutter layout. A format string controls which gutter segments appear and in what order: `%l` (line number), `%r` (relative number), `%s` (sign column marks), `%C` (fold indicators), `%=` (separator), and literal text. When set, the unified gutter replaces all individual gutter columns. When empty (default), individual `signcolumn`/`number`/`relativenumber`/`foldcolumn` settings manage gutters independently. Configurable via `vim.opt.statuscolumn = "%s %l %r %C"` in Lua or `set statuscolumn` (alias `stc`) in vimrc. Click handlers on sign and fold segments preserved. `linenumbermode` deprecated — `dual` maps to `statuscolumn = "%l %r"`. ([#59](https://github.com/saberzero1/motions/issues/59))
    - Plugin: `src/vim/statuscolumn.ts` (new: parser, composite `StatusColumnMarker`, unified gutter, `StatusColumnSpacer`), `src/vim/sign-column.ts` (`signColumnField` extracted as standalone extension, `SignMarker.label` public), `src/vim/line-number-gutter.ts` (`computeLineNumber` + `getNumberwidth` exported), `src/vim/mark-gutter.ts` (re-exports `signColumnFieldExtension`), `src/vim/options.ts` (`statuscolumn` option), `src/settings.ts` (`statuscolumn` setting), `src/vimrc/loader.ts` (`statuscolumn`/`stc`), `src/main.ts` (standalone `signColumnField` registration, `statusColumnCompartment`, `reconfigureStatusColumnGutter()`), `styles.css` (statuscolumn segment styles)

### Fixed

- **Status bar vim mode duplication** — the vim mode indicator and chord display were duplicated in the status bar when the plugin had a non-default `clipboard` or `textwidth` setting saved. The settings restoration loop during `onload()` (lines 717-739 of `main.ts`, added in v0.53.0 by commit `947c6a7`) called `applySettingOverride` → `reloadFeatures()` before `onload()` had created its own `VimModeTracker` and `GlobalKeyHandler`. `reloadFeatures()` created these resources, then `onload()` overwrote `this.modeTracker` and `this.globalKeyHandler` with new instances — without destroying the first ones. The orphaned `VimModeTracker` left duplicate `addStatusBarItem()` DOM elements in the status bar, and the orphaned `GlobalKeyHandler` left a duplicate `keydown` listener on the document (causing intermittent leader key failures). Fixed by adding an `initializing` phase guard to `applySettingOverride` — all 6 side-effect branches (5 gutter reconfigurations + `reloadFeatures()`) are suppressed during `onload()`, matching the existing `vimrcLoading`/`luaLoading` guard pattern. Settings mutations to `this.settings` still apply immediately; only premature side effects are blocked. ([#63](https://github.com/saberzero1/motions/issues/63))
    - Plugin: `src/main.ts` (`initializing` flag, 6 guard site updates in `applySettingOverride`)
- **`iterateEditorViews` crash on non-editor leaves** — `reconfigureLineNumberGutter()` and other gutter reconfigure methods could throw `view.dispatch is not a function` on leaves where the CM6 EditorView chain resolved to a non-EditorView object. Fixed by adding a `typeof cm.dispatch === 'function'` guard in `iterateEditorViews`.
    - Plugin: `src/main.ts` (`iterateEditorViews` type guard)

### Tests

- 10 e2e tests in `test/specs/marks-gutter.e2e.ts` (4 new, 6 updated): mark in gutter, mark move, multiple marks, delmarks removal, no marks = empty, dedicated gutter column, no line overlays, ellipsis truncation (4+ marks), consistent font size on headings, no `data-vim-marks` attribute
- 4 e2e tests in `test/specs/statuscolumn.e2e.ts`: no statuscolumn by default, option registered in vim engine, sign column gutter present, mark gutter functionality preserved

### Documentation

- `docs/features/marks.md`: rewritten gutter indicators section — dedicated gutter column, fixed font size, truncation, three-mode table, gutter layout order
- `docs/configuration/settings.md`: updated sign column description, added gutter layout tip with ASCII art example
- `docs/configuration/lua-config.md`: expanded hybrid line numbers tip with gutter layout example
- `KNOWN_LIMITATIONS.md`: updated `signcolumn` section — removed zero-width overlay note, updated behavior description
- `README.md`: updated marks feature description

## [0.54.0] - 2026-07-13

### Added

- **Which-key auto-resolves Obsidian command names for `:obcommand` mappings** — when a key is mapped to `:obcommand <id><CR>` or `:ob <id><CR>` without an explicit `desc`, the which-key popup now displays Obsidian's native command name instead of the raw ex command string. For example, `:ob app:go-back<CR>` displays as "Navigate back". Explicit `desc` options still take priority. Unknown command IDs fall back to the raw string. Descriptions are automatically localized — Obsidian's built-in commands already have localized names, so descriptions match the user's Obsidian language setting. Works in both editor which-key (leader bindings, `vim.keymap.set`) and global which-key (`:gmap`, `vim.obsidian.keymap.set`). ([#62](https://github.com/saberzero1/motions/issues/62))
    - Plugin: `src/ui/which-key.ts` (`lookupObsidianCommandName()`, `resolveObCommandDescription()`, `OB_COMMAND_RHS_RE` regex matching both literal spaces and `<Space>` notation), `src/ui/global-which-key.ts` (`describeAction()` obcommand resolution)

### Changed

- **Consolidated Obsidian internal API access into `src/util/` utilities** — extracted typed accessor functions for 6 internal Obsidian APIs, replacing ~40 inline `(x as unknown as { ... })` casts across 16 files. Each utility centralizes the unsafe cast in one location and exposes a clean typed function:
    - `src/util/commands.ts`: `executeCommand(app, id)`, `getCommandRegistry(app)` — 20 casts across 11 files
    - `src/util/editor.ts`: `getEditorView(view)` — extracts CM6 `EditorView` from `MarkdownView`, replacing 6 inline casts across 5 files
    - `src/util/leaf.ts`: `getLeafId(leaf)`, `isLeafPinned(leaf)`, `getViewFilePath(view)`, `getViewFileBasename(view)` — 12 casts across 3 files
    - `src/util/metadata.ts`: `getResolvedLinks(app)` — 2 casts across 2 files
    - `src/util/vault.ts`: `getVaultConfig(app, key)`, `isBuiltinVimEnabled(app)` — 4 casts across 4 files
    - `src/util/keymap.ts`: `pushKeymapScope(app, scope)`, `popKeymapScope(app, scope)` — 3 casts in 1 file

### Tests

- 22 unit tests in `test/unit/which-key.test.ts`: `lookupObsidianCommandName()` (4 tests), `describeKeymapEntry()` without app (6 tests), `describeKeymapEntry()` with app and obcommand auto-resolution (12 tests covering `:ob`/`:obcommand` short/long form, `<CR>` variants, `<Space>` separator, unknown commands, label priority, edge cases)
- 6 e2e tests in `test/specs/which-key-obcommand.e2e.ts`: editor which-key auto-resolution for `:ob` and `:obcommand` (2 tests), explicit `desc` priority (1 test), unknown command fallback (1 test), global which-key auto-resolution via registry API (1 test), global unknown command fallback (1 test)

## [0.53.0] - 2026-07-13

### Fixed

- **Which-key descriptions not showing for keymaps set via Lua** — `vim.keymap.set` and `vim.obsidian.leader.set` with a `desc` option showed raw action names (`lua-action-0`), command strings (`:Oil<CR>`), or internal function names (`harpoonSelect1`) instead of the user's description. The codemirror-vim fork normalizes literal space characters to `<Space>` notation in key strings (e.g., `" ff"` → `"<Space>ff"`), but the which-key overlay stored and looked up label keys using unnormalized literal spaces — all lookups missed. Additionally, the leader-only which-key mode never triggered with space as leader because the `vim-keypress` event emits `"<Space>"` but the overlay compared against the raw `" "` character. ([#58](https://github.com/saberzero1/motions/issues/58))
    - Plugin: `src/ui/which-key.ts` (`normalizeVimKey()` function mirroring the fork's `normalizeKeyString`, `normalizedLeaderKey` field for key event comparison, normalized lookups in `showLeaderBindings`/`showCompletions`/`onKeyPressLeaderOnly`), `src/main.ts` (`rebuildWhichKey()` normalizes all `commandLabels` and `groupLabels` map keys from settings, vimrc, and Lua sources)
- **`vim.opt.clipboard` silently ignored in init.lua** — setting `vim.opt.clipboard = "unnamed"` or `"unnamedplus"` in init.lua had no effect. The Lua `vim.opt` handler only routed options through the `KNOWN_SET_OPTIONS` table, but `clipboard` was special-cased in the vimrc loader and missing from that table. Yanks never synced to the system clipboard when configured via Lua. Same issue affected `vim.opt.textwidth`. ([#56](https://github.com/saberzero1/motions/issues/56))
    - Plugin: `src/vimrc/loader.ts` (`SideEffectOpt` type, `clipboard`/`textwidth`/`guicursor` added to `KNOWN_SET_OPTIONS`), `src/lua/api.ts` (special-case blocks removed, unified `KNOWN_SET_OPTIONS` path), `src/main.ts` (initial settings load from saved values), `src/lua/loader.ts` (`setOption` callback)
- **Settings-based clipboard and textwidth not restored on plugin restart** — if a user set clipboard or textwidth via the Settings UI, the value was saved to disk but not re-applied to the vim engine on the next Obsidian startup. The saved `this.settings.clipboard` and `this.settings.textwidth` were never pushed to `vim.setOption()` during plugin load. Fixed by applying saved side-effect options after `registerVimOptions()`.
    - Plugin: `src/main.ts` (initial settings loop using `KNOWN_SET_OPTIONS` sideEffects)

### Changed

- **Vim option architecture: `SideEffectOpt` type** — options that require side effects beyond `this.settings[key] = value` (clipboard, textwidth, guicursor) are now declared in the `KNOWN_SET_OPTIONS` table with a `sideEffect` type and an `apply()` callback. Previously, these options were special-cased with separate `if` blocks in both the vimrc loader and the Lua `vim.opt` handler — adding a new side-effect option required touching 2-3 files manually, and missing one path caused silent failures. Now there is a single declaration point. The vimrc loader, Lua handler, and initial settings load all route through the same table-driven path.
    - Plugin: `src/vimrc/loader.ts` (`SideEffectOpt` interface, `applyKnownSetOption` sideEffect handling, special-case blocks removed), `src/lua/api.ts` (unified `KNOWN_SET_OPTIONS` path)

### Added

- **Snippets** — VS Code-compatible snippet expansion with tabstop navigation, linked mirrors, variable resolution ($CURRENT_YEAR, $TM_FILENAME, $UUID, etc.), and context-aware filtering (prose/code/frontmatter). Ships 40+ Obsidian-adapted snippets (headings, callouts, wikilinks, tables, frontmatter, math, date/time). Three trigger mechanisms: CM6 completion menu, Tab expansion (vim-native), and ex commands (`:snippet name`, `:snippets` picker). Bundled snippets toggleable via settings.
- **User snippet directory** — load custom VS Code JSON snippet files from a configurable directory. Supports vault-relative and absolute paths (with `~` expansion, desktop only). User snippets override bundled snippets on prefix collision.
- **Snippet Lua DSL** — LuaSnip-inspired `vim.snippet.*` API: `s()`, `t()`, `i()`, `c()`, `rep()`, `fmt()` for static snippets that compile to VS Code JSON at load time. `f()` (function nodes), `d()` (dynamic nodes), `sn()` (snippet nodes), `r()` (restore nodes) for reactive snippets that execute Lua functions via fengari at edit time.
- **Snippet context filtering** — snippets can be restricted to specific editing contexts (`"prose"`, `"code:js"`, `"code:*"`, `"frontmatter"`) via a `"context"` field in JSON or the `context` option in Lua DSL.
- **Choice node cycling** — `Ctrl+N`/`Ctrl+P` cycle through choice options (`${1|a,b,c|}`) on active snippet fields.
- **Snippet picker** — `:snippets` opens the telescope-style fuzzy finder with snippet preview. `:snippet name` expands by name.
- **`@codemirror/autocomplete` fork** — recursive descent snippet parser replacing CM6's regex parser, supporting choice nodes, nested placeholders, transforms (parsed, not applied), and bare `$1` syntax. Fork at [saberzero1/autocomplete](https://github.com/saberzero1/autocomplete).
- 4 new settings: Enable snippets, Bundled snippets, Snippet directory, Trigger mode
- 4 new vimrc `set` options: `snippets`, `snippetbundled`, `snippetdir`, `snippettrigger`
- 13 new `vim.snippet.*` Lua API functions
- Plugin files: `src/snippets/` (14 files), `src/lua/snippet-api.ts`, `src/snippets/dynamic-bridge.ts`
- Fork files: `~/Repos/autocomplete/src/snippet.ts` (parser), `~/Repos/autocomplete/src/index.ts` (exports)

### Tests

- 9 unit tests in `test/unit/which-key.test.ts`: `normalizeVimKey()` — space conversion, idempotence, angle-bracket preservation, mixed notation
- 4 e2e regression tests in `test/specs/lua-space-leader.e2e.ts`: which-key descriptions with space leader — string command desc, function callback desc, `all` mode desc, `vim.obsidian.leader.set` desc
- 11 new e2e tests in `test/specs/lua-config.e2e.ts`:
    - `vim.opt.clipboard = "unnamed"` applies from init.lua (1 test)
    - `yy`/`yw`/`dd` populate `+` register when clipboard set via Lua (3 tests)
    - `vim.opt.textwidth` and `vim.opt.tw` alias from init.lua (2 tests)
    - Dual-config override precedence: Lua overrides vimrc for clipboard, textwidth, scrolloff (3 tests)
    - Error resilience: unknown Lua option preserves vimrc clipboard; invalid textwidth (`-5`) preserves vimrc value (2 tests)
- 7 e2e spec files (22 passing, 5 skipped) covering expansion, tabstops, variables, context, f()/d() nodes, static regression
- 15 LuaSnip golden comparison unit tests (extracted from LuaSnip test suite commit `0abc8f3`)
- 359 total unit tests passing

### Documentation

- `docs/features/snippets.md` (new feature page)
- `docs/features/index.md`, `docs/reference/keybindings.md`, `docs/configuration/settings.md`, `docs/features/ex-commands.md`, `docs/configuration/vimrc.md`, `docs/configuration/lua-config.md` (updated)
- `AGENTS.md` (fork dependency + page ownership)
- `KNOWN_LIMITATIONS.md` (7 limitation entries)

## [0.52.0] - 2026-07-12

### Added

- **Cursor line highlight** — `set cursorline` / `set nocursorline` with `cursorlineopt` (number/line/both). Compartment-based runtime switching.
- **Fold column** — `set foldcolumn` shows ▸/▾ indicators for foldable regions with click-to-fold. Uses CM6 `foldable()` / `foldedRanges()` APIs.
- **`numberwidth` option** — `set numberwidth=N` controls minimum line number column width (1–20, default: 2).
- **Mobile gutter width reduction** — line number gutter uses smaller font and reduced width on viewports ≤ 600px.
- **Configurable line number gutter** — `set number`, `set relativenumber`, or both for hybrid mode (absolute on current line, relative on others), matching Neovim's semantics exactly. Uses a custom CM6 `gutter()` with `Compartment`-based runtime switching — `:set number` / `:set nonumber` take effect instantly without full feature reload. When the plugin's line number gutter is active, Obsidian's native line numbers are suppressed via CSS to prevent duplication. Defaults to off (matching Neovim defaults).
    - **Settings**: **Settings → Vim Motions → Line numbers** — two toggles: Line numbers, Relative line numbers
    - **Vimrc**: `set number` / `set nonumber` (alias `nu`), `set relativenumber` / `set norelativenumber` (alias `rnu`)
    - **Lua**: `vim.opt.number = true`, `vim.opt.relativenumber = true`
    - Plugin: `src/vim/line-number-gutter.ts` (new), `src/settings.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`, `src/main.ts`, `styles.css`
- **Picker provider API** — external plugins can register custom picker sources via `window.VimMotions.picker.registerSource()`. The API validates namespaced source names (`pluginId:sourceName`), wraps external source methods in try/catch with 5-second timeout, caps results at 10,000 items, and emits `source-registered` / `source-unregistered` events. Consumer plugins discover the API via `window.VimMotions.picker` or `app.plugins.plugins['vim-motions'].pickerAPI`.
    - **Lifecycle**: `vim-motions:picker-ready` workspace event fires after API installation; consumers use `onLayoutReady` + event listener pattern for load-order safety.
    - **Type definitions**: `src/picker/picker-api.d.ts` ships standalone types for consumer plugins with full JSDoc and usage examples.
    - Plugin: `src/picker/api.ts` (new), `src/picker/picker-api.d.ts` (new), `src/picker/registry.ts` (extended), `src/picker/types.ts` (metadata fields), `src/main.ts` (API wiring)
- **Meta-picker** — `:Picker` (no arguments) opens a source browser listing all registered picker sources grouped by "Built-in" / "Extensions", with display names, icons, and keymap bindings shown. Selecting an entry opens that picker. `:Picker <source>` opens a named source directly.
    - Plugin: `src/picker/sources/pickers.ts` (new), `src/workspace/commands.ts` (`:Picker` ex command), `src/main.ts` (`picker-pickers` Obsidian command)
- **Picker source metadata** — `PickerSource` interface extended with optional `displayName`, `icon`, `description`, and `priority` fields. All 12 built-in sources now include metadata for display in the meta-picker.
    - Plugin: `src/picker/types.ts`, `src/picker/sources/*.ts` (all 12 source files)
- **Bundled picker integrations** — three built-in picker sources that auto-detect and integrate with popular plugins:
    - **Omnisearch** (`omnisearch`) — dynamic full-text vault search via `globalThis.omnisearch.search()`. 150ms debounce, min 2-char query. Jumps to first match offset on selection.
    - **Obsidian Tasks** (`tasks`) — shows all incomplete tasks sorted by due date, grouped by status type. Cached with event-based invalidation via `obsidian-tasks-plugin:cache-update`. Jumps to task line on selection.
    - **Dataview** (`dataview`) — lists all Dataview-indexed pages with tags and aliases in description. Filterable by the picker's fuzzy matcher.
    - All three are gated by settings toggles in **Settings → Vim Motions → Third-party integrations** (default: enabled) and by runtime plugin detection via `onLayoutReady`.
    - Plugin: `src/picker/sources/omnisearch.ts` (new), `src/picker/sources/tasks.ts` (new), `src/picker/sources/dataview.ts` (new), `src/main.ts` (detection + registration), `src/settings.ts` (3 toggles)

### Fixed

- **Obsidian line numbers leaking into table cell editors** — when Obsidian's "Show line numbers" setting is enabled, line number gutters appeared inside embedded table cell editors where they shouldn't. Fixed by suppressing `.cm-gutters` in cell editors via CSS. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Plugin: `styles.css`

### Changed

- **`enableMarkGutter` migrated to `signcolumn`** — the boolean toggle is now a dropdown with Auto/Always/Off modes matching Neovim's `signcolumn` option. Existing settings are auto-migrated. `set markgutter` / `set nomarkgutter` remain as backward-compatible aliases.
- **Mark gutter internals refactored** — the mark gutter implementation has been extracted into a dedicated `sign-column.ts` module. The rendering approach is unchanged (line decorations + CSS `::after` overlay, zero layout shift), but the internal architecture now cleanly separates the sign column field from the refresh scheduling API. No user-facing changes.
    - Plugin: `src/vim/sign-column.ts` (new), `src/vim/mark-gutter.ts` (refactored to delegate)

### Documentation

- `docs/configuration/settings.md`: added `numberwidth`, `cursorline`, `cursorlineopt`, `signcolumn`, and `foldcolumn` settings
- `docs/configuration/vimrc.md`: added new gutter options and `markgutter` alias to options tables
- `docs/configuration/lua-config.md`: added new gutter options to `vim.opt` table
- `docs/features/marks.md`: updated to mention `signcolumn` as the canonical way to toggle mark indicators
- `KNOWN_LIMITATIONS.md`: added notes on `signcolumn` overlay behavior and `cursorlineopt=screenline` support
- `docs/configuration/settings.md`: added Line numbers settings group
- `docs/configuration/vimrc.md`: added `number`/`nu`, `relativenumber`/`rnu` to boolean options table
- `docs/configuration/lua-config.md`: added `vim.opt.number`, `vim.opt.relativenumber` with hybrid mode tip
- `KNOWN_LIMITATIONS.md`: removed `number` and `relativenumber` from "not implemented" options list
- `docs/development/picker-api.md`: new provider API reference with consumer guide, API surface, integration examples (Omnisearch, Tasks), and lifecycle documentation
- `docs/development/index.md`: added picker provider API link
- `docs/reference/keybindings.md`: added `:Picker` / `:Pick` to ex commands table
- `KNOWN_LIMITATIONS.md`: added picker provider API pop-out window limitation
- `docs/configuration/settings.md`: added Third-party integrations settings group
- `docs/development/picker-api.md`: added bundled integrations section
- `eslint.config.mts`: added `.obsidian-cache` to global ignores (downloaded community plugin JS files)
- `wdio.conf.mts`: added Omnisearch, Tasks, Dataview as `enabled: false` plugins for integration testing
- `test/specs/picker-integration.e2e.ts`: 12 e2e tests covering source registration, picker opening, search results, meta-picker listing, and plugin disable/enable lifecycle

## [0.51.1] - 2026-07-11

### Fixed

- **Yank highlight over-extending on headings** — linewise yank (`yy`) on a heading with text on the very next line highlighted both lines, even though only the heading line was yanked. The highlight range calculation used `state.doc.lineAt(sel.to).to` to find the end of the highlight, but the codemirror-vim fork's `expandSelectionToLine()` sets `sel.to` to the start of the _next_ line (via `curEnd.line++`). Calling `lineAt()` on that position resolved to the entire next line, extending the highlight one line too far. Fixed by using `sel.to` directly as the highlight end boundary, which already points to the correct position (the start of the line after the last yanked line). ([#53](https://github.com/saberzero1/motions/issues/53))
    - Plugin: `src/main.ts` (`attachYankHighlight` linewise range calculation)

## [0.51.0] - 2026-07-11

### Added

- **Input method switching for CJK users** — automatic IM switching when entering/leaving insert mode. Supports macism (macOS), im-select (macOS/Windows), fcitx5-remote (Linux), ibus (Linux), and any external IM switching binary. Per-editor IM state tracking, 50ms debounced switching, composition guard (never switches mid-IME composition), and error throttling with auto-disable. Desktop only — graceful no-op on mobile. ([#55](https://github.com/saberzero1/motions/issues/55))
    - **Lua API**: `vim.obsidian.im.get()`, `.set(id)`, `.save()`, `.restore()`, `.enabled`, `.auto` — programmatic control for advanced use cases. Set `vim.obsidian.im.auto = false` to disable auto-wiring and handle switching via Lua autocmds.
    - **Settings**: 7 new settings in **Settings → Vim Motions → Input method** — master toggle, binary path, obtain/switch args, normal mode IM, restore behavior (restore previous / use fixed default), default insert IM.
    - **Security**: Uses `child_process.execFile` (no shell interpretation). Binary path must be absolute. IM identifiers validated against shell metacharacters. Scoped process access following the `external-fs.ts` pattern.
    - Plugin: `src/im/im-process.ts` (new), `src/im/im-switcher.ts` (new), `src/settings.ts`, `src/lua/obsidian-api.ts`, `src/lua/api.ts`, `src/lua/loader.ts`, `src/lua/autocmd.ts`, `src/main.ts`, `src/util/external-fs.ts`
    - Tests: `test/unit/im-process.test.ts` (new), `test/unit/im-switcher.test.ts` (new)
- **`CmdlineEnter`/`CmdlineLeave` autocmd events** — fire when entering/leaving the `:`, `/`, or `?` command-line prompt. Event data includes `cmdtype` (`":"`, `"/"`, or `"?"`). `CmdlineLeave` is auto-wired to IM switching (switches to normal mode IM on prompt exit), matching im-select.nvim's default behavior.
    - Plugin: `src/lua/autocmd.ts`, `src/lua/loader.ts`, `src/vim/mode-tracker.ts`, `src/im/im-switcher.ts`, `src/main.ts`

### Documentation

- `docs/configuration/lua-config.md`: added `vim.obsidian.im` API section with function reference and Lua examples
- `docs/configuration/settings.md`: added "Input method" settings group table
- `KNOWN_LIMITATIONS.md`: added IM switching limitations section (desktop-only, no command-line/search mode, Flatpak/Snap, system-wide switching); updated "Intentionally not supported" table to mark IM switching as built-in

## [0.50.1] - 2026-07-11

### Fixed

- **Table widget duplication with third-party decoration plugins** — the embedded/cursor-aware table widget could show duplicated table content when another plugin (e.g., aDHL — Another Dynamic Highlights) applied `Decoration.mark` ranges over the same document region covered by the table's `Decoration.replace` block widget. CM6's decoration merging resolved the conflicting mark and replace decorations at default precedence, allowing raw table text to leak through alongside the rendered widget during re-entrant view updates. Fixed by wrapping the `tableRenderField` StateField in `Prec.high()`, ensuring the replace decoration takes precedence over default-priority mark decorations from other plugins. ([#55](https://github.com/saberzero1/motions/issues/55))
    - Plugin: `src/vim/table-render-widget.ts` (`Prec.high()` wrap on `tableRenderField`)

## [0.50.0] - 2026-07-11

### Added

- **Fold viewport scroll compensation** — the viewport automatically scrolls to keep the cursor visible after any fold/unfold operation, including Obsidian's "Toggle fold properties" command. Uses a `TransactionExtender` for CM6 fold effects and a `MutationObserver` for the properties widget's CSS class toggle. ([#54](https://github.com/saberzero1/motions/issues/54))
    - Plugin: `src/vim/fold-sync.ts` (new), `src/main.ts`
- **Fold create/delete commands** — `zf{motion}` creates a manual fold over the motion range (works in both visual and operator-pending mode). `zd`/`zD` delete the fold at the cursor. `zE` eliminates all folds in the document.
    - Ex commands: `:folddelete` (`zd`), `:foldeliminate` (`zE`)
    - Plugin: `src/fold/commands.ts` (new), `src/operators/register.ts`
- **Incremental fold level** — `zm` folds one more heading level (h1 first, then h2, etc.). `zr` unfolds one heading level. A custom `StateField` tracks the current fold depth (0–6).
    - Ex commands: `:foldmore` (`zm`), `:foldless` (`zr`)
    - Plugin: `src/fold/fold-level.ts` (new), `src/workspace/navigation.ts`, `src/main.ts`
- **Markdown fold provider** — custom `foldService` registers frontmatter (`---` blocks) and callouts (`> [!type]`) as foldable regions. These are now foldable via `zc`/`zo`/`za` in addition to the standard CM6 heading and code block folds.
    - Plugin: `src/fold/provider.ts` (new), `src/main.ts`
- **Fold placeholder text** — folded regions show descriptive placeholder text: heading title + line count, code block language, callout type, or frontmatter field count. Uses `codeFolding({ preparePlaceholder, placeholderDOM })`.
    - Plugin: `src/fold/placeholder.ts` (new), `src/main.ts`
- **Fold-aware navigation** — when enabled, navigating into a folded section (e.g., `]h` to a folded heading) automatically unfolds it. Matches Neovim's default `foldopen` behavior. Configurable via **Settings → Vim Motions → Fold-aware navigation** (default: on).
    - Plugin: `src/vim/fold-sync.ts`, `src/settings.ts`
- **Fold persistence** — fold state is remembered across file switches and sessions. Folds are captured on leaf change and restored when re-opening a file. Capped at 500 files with 30-day TTL eviction. Cleans up on file rename/delete.
    - Plugin: `src/fold/persistence.ts` (new), `src/main.ts`, `src/settings.ts`

### Documentation

- `docs/features/workspace-navigation.md`: added fold provider, placeholder, fold-aware navigation, and persistence documentation
- `docs/reference/keybindings.md`: added `zf`, `zd`, `zD`, `zE`, `zm`, `zr` keybindings
- `docs/features/ex-commands.md`: added `:folddelete`, `:foldeliminate`, `:foldmore`, `:foldless`
- `docs/configuration/settings.md`: added Fold-aware navigation and Fold persistence settings
- `KNOWN_LIMITATIONS.md`: added `zn`/`zN` as known deviations; updated fold command coverage
- `test/neovim-command-index.yaml`: added 6 new fold command entries

## [0.49.0] - 2026-07-11

### Added

- **Which-key sort order setting** — configurable sort order for the which-key popup. "which-key" (default) matches which-key.nvim defaults: individual keys first, groups last, alphanumeric before special keys, natural alphabetical tiebreaker. "Groups first" shows groups before individual keys, both sorted alphabetically. Configurable via **Settings → Vim Motions → Which-key sort order**, `vim.opt.whichkeysort` in Lua, or `set whichkeysort=<order>` (alias `wks`) in vimrc.
    - Plugin: `src/ui/which-key.ts` (`sortWhichKeyEntries`, `WhichKeySortOrder` type), `src/ui/global-which-key.ts`, `src/settings.ts`, `src/main.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`
- **Which-key Lucide icons** — optional Lucide icon support for the which-key popup, inspired by which-key.nvim. Icons render as inline SVGs via Obsidian's `setIcon()` API, colored using Obsidian's CSS color variables or arbitrary CSS color strings. Each row displays: key → separator (➤) → icon → description, matching which-key.nvim's column layout.
    - **Global toggle**: `whichKeyIcons` setting (default: on). Configurable via Settings UI, `vim.opt.whichkeyicons` in Lua, or `set whichkeyicons` / `set nowhichkeyicons` in vimrc.
    - **Per-entry icons**: assign icon and color to any group label or command label via Settings UI, Lua (`vim.obsidian.whichkey.set_group("<leader>t", "Table", { icon = "table", color = "blue" })`), or vimrc (`whichkeygroup <leader>t Table icon=table color=blue`).
    - **Color system**: 8 named Obsidian colors (`red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`) mapped to theme CSS variables, plus arbitrary CSS color strings. Default icon color: `--text-muted`.
    - **Default icons**: Table (`table`, blue), EasyMotion (`zap`, yellow), Harpoon (`anchor`, orange) — applied automatically to built-in groups.
    - **Alignment**: spacer spans for rows without icons when icons are globally enabled, ensuring consistent column alignment.
    - Plugin: `src/ui/which-key.ts` (`WhichKeyLabelInfo`, `resolveIconColor`), `src/ui/global-which-key.ts`, `src/settings.ts` (GroupLabel/CommandLabel extended with `icon?`/`color?`), `src/main.ts`, `src/lua/api.ts`, `src/lua/obsidian-api.ts`, `src/lua/loader.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`, `src/vimrc/parser.ts`, `src/workspace/global-mapping-registry.ts`, `src/easymotion/register.ts`, `src/motions/tables.ts`, `styles.css`
- **Harpoon-style file pinning** — pin files to numbered slots for instant switching. `<leader>ha` pins, `<leader>1`–`<leader>9` jumps to slots, `<leader>hp` opens the harpoon picker. Cursor position is tracked per-pinned-file and restored on navigation. Pins persist across sessions. File renames auto-update pins; file deletes auto-remove them.
    - 6 ex commands: `:HarpoonAdd`, `:HarpoonRemove [N]`, `:Harpoon`, `:HarpoonSelect N`, `:HarpoonNext`, `:HarpoonPrev`
    - 14 Obsidian commands for command palette access
    - 15 leader keybindings with which-key "Harpoon" group
    - Picker with slot-ordered display, fuzzy search, preview, and split-open support
    - Plugin: `src/vim/harpoon-store.ts` (new), `src/vim/harpoon-nav.ts` (new), `src/picker/sources/harpoon.ts` (new), `src/main.ts`, `src/settings.ts`

### Documentation

- `docs/configuration/which-key.md`: added Sort order and Icons sections with Lua/vimrc/Settings examples, color table, and default icons
- `docs/configuration/settings.md`: added Which-key sort order and Which-key icons rows to Which-key hints table
- `docs/configuration/vimrc.md`: added `whichkeysort` (`wks`) and `whichkeyicons` (`wki`) options
- `docs/configuration/lua-config.md`: added `whichkeysort` and `whichkeyicons` options to `vim.opt` table
- `KNOWN_LIMITATIONS.md`: added Sort order and Icons subsections to Which-key overlay section
- `docs/features/harpoon.md`: new feature page
- `docs/features/index.md`: added harpoon to Jump navigation section
- `docs/configuration/settings.md`: added Harpoon file pinning to Jump navigation table
- `docs/reference/keybindings.md`: added Harpoon section with leader bindings and ex commands

## [0.48.0] - 2026-07-11

### Added

- **Mark gutter indicators** — vim mark letters (`a`–`z`, `A`–`Z`) appear in the gutter area next to marked lines, providing visual feedback on where marks are set. Multiple marks on the same line are shown together (e.g., `ab`). The indicators use line decorations with CSS `::after` positioning — zero horizontal space consumed, no document shift. Updates on mark set/move/delete and on document edits. Toggle via **Settings → Vim Motions → Vim features → Mark gutter indicators** (default: on).
    - Plugin: `src/vim/mark-gutter.ts` (new), `src/main.ts`, `src/settings.ts`, `styles.css`
- **Global mark persistence** — marks `A`–`Z` are persisted across files and plugin restarts. Setting `mA` stores the file path and cursor position; navigating to `'A` from any file opens the target and jumps to the saved position. Marks are saved via a 30-second polling interval with dirty-flag checking, plus immediate save on unload.
    - Plugin: `src/vim/mark-store.ts` (new), `src/main.ts`, `src/settings.ts` (`persistedMarks` field)
- **Enhanced marks picker** — `:marks` and `<leader>fm` now show marks grouped by category: "Buffer marks" (`a`–`z`) with line preview, "Global marks" (`A`–`Z`) with file path. Selecting a global mark opens the target file and navigates to the saved position. Built on a `MarkProvider` abstraction for future extensibility (harpoon-style file marks).
    - Plugin: `src/picker/sources/mark-providers.ts` (new: `MarkProvider` interface, `VimBufferMarkProvider`, `GlobalMarkProvider`), `src/picker/sources/marks.ts` (rewritten), `src/picker/types.ts` (`group` field), `src/picker/picker.ts` (group header rendering)
- **Picker group headers** — `PickerItem` interface extended with optional `group` field. When set, the picker renders non-selectable section headers when the group changes between consecutive items. Available to all picker sources.
    - Plugin: `src/picker/types.ts`, `src/picker/picker.ts`, `styles.css`

### Fixed

- **`:delmarks` not refreshing gutter** — deleting marks via `:delmarks a` did not update the mark gutter indicators because the plugin's ex command handler didn't trigger a gutter refresh. Fixed by adding an `onMarksChanged` callback to `createDelmarksCommand` that schedules a gutter refresh.
    - Plugin: `src/workspace/commands.ts`, `src/main.ts`
- **Yank highlight not working on first load** — the yank highlight handler was not attached to the initially open editor on plugin startup, only activating after switching to a different pane. `reloadFeatures()` now calls `attachYankHighlight()` (cleanup + re-attach) instead of only cleaning up, ensuring the handler is attached when vimrc/lua loading triggers the first feature reload. ([#53](https://github.com/saberzero1/motions/issues/53))
    - Plugin: `src/main.ts` (`reloadFeatures` calls `attachYankHighlight()`)

### Documentation

- `docs/features/marks.md`: new feature page covering mark gutter indicators, global mark persistence, and grouped marks picker
- `docs/features/index.md`: added marks entry to Quality of life section
- `docs/configuration/settings.md`: added Mark gutter indicators row to Vim features table
- `docs/reference/keybindings.md`: updated `:marks` description to reflect grouped picker
- `docs/features/quality-of-life.md`: added "Yank highlight" section with mode descriptions, configuration, CSS override tip, and fork-mode-only callout
- `docs/features/index.md`: added yank highlight to Quality of life bullet
- `docs/configuration/settings.md`: added Yank highlight and Yank highlight duration rows to Vim features table; added CSS override tip callout
- `KNOWN_LIMITATIONS.md`: updated "Yank highlighting" row from external plugin recommendation to built-in; added marks section

## [0.47.0] - 2026-07-10

### Added

- **Yank highlight** — yanked text is briefly highlighted, providing visual feedback on what was yanked. Three modes available in **Settings → Vim Motions → Vim features → Yank highlight**: "Solid" (default, Neovim-style — instant appear, hold, disappear), "Fade" (gradual fade-out animation), or "Off". Duration is configurable via the **Yank highlight duration** slider (50–3000ms, default 200ms). Highlight color adapts to the active theme via `--text-accent` and can be overridden with the `--vim-motions-yank-bg` CSS custom property. Respects `prefers-reduced-motion`. Replaces the external [obsidian-vim-yank-highlight](https://github.com/aleksey-rowan/obsidian-vim-yank-highlight) plugin. ([#53](https://github.com/saberzero1/motions/issues/53))
    - Works with remapped yank keys (detects actual yank operations via the `vim-yank` event, not keypress sniffing)
    - Handles rapid successive yanks (new highlight replaces previous), large yanks (>1000 lines skipped), and disposed views (tab close during highlight)
    - Requires bundled fork mode (built-in vim mode OFF) — the built-in vim does not emit the `vim-yank` event
    - Blockwise yank highlight deferred to a future release
    - Plugin: `src/vim/yank-highlight.ts` (new), `src/main.ts`, `src/settings.ts`, `styles.css`
- **Embedded table editing mode** — new `'embedded'` option for **Settings → Vim Motions → Table widget in Live Preview**. Tables render as themed HTML with a two-layer editing model:
    - **Table navigation**: `h`/`j`/`k`/`l` moves a cell highlight across the rendered table. `j`/`k` at the top/bottom row exits the table.
    - **Cell editing**: `i`/`a`/`c`/`s`/`Enter` opens a vim-enabled editor in the highlighted cell with full vim support (modes, motions, text objects, auto-formatting). `Escape` returns to table navigation; a second `Escape` exits the table. `Tab`/`Shift-Tab` moves between cells.
    - **Table manipulation**: `o`/`O` (add row below/above), `dd` (delete row), `dc` (delete column), `J`/`K` (move row down/up), `H`/`L` (move column left/right), `I`/`A` (add column left/right), `=` (realign). These operate directly on the raw markdown — no dependency on Obsidian's internal table commands.
    - Cell edits are written back per-cell with per-cell undo granularity.
    - Configurable via `set tablewidget=embedded` in vimrc or `vim.opt.tablewidget = "embedded"` in Lua.
    - Plugin: `src/vim/table-nav-controller.ts` (new), `src/vim/table-cell-editor.ts` (new), `src/vim/table-operations.ts` (new), `src/vim/table-utils.ts` (new), `src/vim/table-render-widget.ts` (modified: data attributes, embedded mode toggle, re-render guard), `src/vim/table-embedded-editor.ts` (rewritten), `src/vim/table-auto-format.ts` (getVimMode accepts EditorView), `src/motions/tables.ts` (exported helpers), `src/main.ts`, `src/settings.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`, `styles.css`

### Changed

- **Oil explorer architecture rewritten** — oil no longer creates temporary `oil~*.md` files in the vault. The directory listing is rendered in a dedicated `oil-explorer` view type with an embedded CodeMirror 6 editor, eliminating temp file visibility in tabs, search, and graph. Vim mode (both built-in and bundled fork) works natively in the embedded editor. View state (current directory) persists across workspace restarts via `getState()`/`setState()`.
    - **New**: reusable `EmbeddableMarkdownEditor` abstraction (`src/editors/embeddable-editor.ts`) — extracts Obsidian's internal `ScrollableMarkdownEditor` prototype via `app.embedRegistry` and exposes a lightweight editor mountable in any DOM container with full CM6 + vim support. Designed for future use by the table editor and other features needing embedded markdown editing.
    - **New**: `OilView` custom view (`src/oil/oil-view.ts`) — extends `View` with view type `'oil-explorer'`, embedded editor with oil conceal extension, directory state management, and previous-file tracking for workspace restoration on close.
    - **Changed**: `:q`/`:wq`/`:x`/`q` in oil now restore the previously open file instead of leaving an empty workspace.
    - **Changed**: Oil keybinding registration uses `vim.map` with `<CR>` notation instead of `vim.noremap` with literal newline, fixing command execution in the embedded editor.
    - **Changed**: Lua `vim.obsidian.oil.*` callbacks call manager methods directly instead of routing through ex commands, fixing Lua API calls when no MarkdownView is active.
    - **Removed**: `OIL_TEMP_PREFIX`, `tempToDir` map, `getTempFilePath()`, `forgetTempPath()`, `cleanupOrphanedTempFiles()`, `forceSourceMode()`, `userIgnoreFilters` management, CSS `.nav-file-title[data-path^='oil~']` hiding rule.
    - **Migration**: Legacy `oil~*.md` files from previous versions are automatically cleaned up on first load (`cleanupLegacyTempFiles()`).
    - Plugin: `src/editors/embeddable-editor.ts` (new), `src/oil/oil-view.ts` (new), `src/oil/manager.ts` (rewritten), `src/oil/keybindings.ts` (refactored), `src/oil/render.ts` (OIL_TEMP_PREFIX filter removed), `src/workspace/commands.ts` (OilView detection for `:w`/`:wq`/`:x`/`:q`), `src/main.ts` (`registerView`, Lua callbacks simplified), `styles.css` (OilView styling), `test/specs/oil-poc.e2e.ts` (rewritten for OilView, 16 tests)

### Fixed

- **Oil confirm dialog button not focused** — the confirmation dialog shown when deleting files now auto-focuses the Confirm button, matching pre-migration behavior.

## [0.46.0] - 2026-07-10

### Fixed

- **Which-key overlay hidden behind status bar** — the which-key popup (both editor-level and global workspace) was positioned at `bottom: 0` of its container, causing the bottom rows to be obscured by Obsidian's status bar. The overlay now detects the status bar height and adds `padding-bottom` to keep content above it. In split views, padding is only applied when the editor pane's bottom edge is adjacent to the status bar (top splits are unaffected).
    - Plugin: `src/ui/which-key.ts` (status bar height detection with `getBoundingClientRect` adjacency check), `src/ui/global-which-key.ts` (same padding for global which-key)

### Added

- **Remappable keybindings** — every plugin keybinding is now user-remappable across all contexts (editor, oil explorer, picker, global workspace navigation). See the [remapping guide](https://saberzero1.github.io/motions/configuration/remapping) for details.
    - **46 new ex command aliases** for editor-context actions: structural navigation (`:nextheading`, `:prevheading`, `:nextheading1`–`6`, `:prevheading1`–`6`, `:nextlistitem`, `:prevlistitem`, `:nextlink`, `:prevlink`, `:nextbuffer`, `:prevbuffer`), table navigation (`:tablenextcell`, `:tableprevcell`, `:tablenextrow`, `:tableprevrow`), workspace navigation (`:focuspaneleft`/`right`/`up`/`down`, `:splitvertical`, `:splithorizontal`, `:closetab`, `:closeothertabs`, `:nexttab`, `:prevtab`, `:gototab`, `:gotodefinition`, `:foldclose`/`open`/`toggle`/`all`, `:unfoldall`, `:documentoutline`, `:openurl`, `:docstats`, `:renamenote`, `:showbacklinks`, `:opengotofile`, `:contextactions`, `:charinfo`), and hint mode (`:hintactivate`, `:hintopennew`, `:hintyank`, `:hintclose`). Users can remap any keybinding via `nmap key :excommand<CR>` in vimrc or `vim.keymap.set('n', 'key', ':excommand<CR>')` in Lua.
    - Plugin: `src/keybindings/action-registry.ts` (new: `exCommandFromMotion`/`exCommandFromAction` helpers), `src/motions/register.ts`, `src/workspace/navigation.ts`, `src/main.ts`
- **Oil explorer remappable keybindings** — all 9 oil keybindings are now user-remappable via Lua autocmds or vimrc
    - **9 oil ex commands**: `:oilopen`, `:oilparent`, `:oilroot`, `:oilrefresh`, `:oilclose`, `:oiltogglehidden`, `:oilcyclesort`, `:oilyankpath`, `:oilreveal`
    - **8 new Lua functions** in `vim.obsidian.oil`: `parent()`, `root()`, `refresh()`, `toggle_hidden()`, `cycle_sort()`, `yank_path()`, `reveal()`, `open_entry()`
    - **`OilEnter`/`OilLeave` autocmd events** — fire when entering/leaving an oil buffer, enabling Neovim-style buffer-local keymaps
    - Oil defaults now registered as `vim.noremap` mappings pointing to ex commands (previously `mapCommand`), making them visible in `:map` output and overridable by user mappings
    - Plugin: `src/oil/keybindings.ts` (refactored), `src/lua/api.ts`, `src/lua/obsidian-api.ts`, `src/lua/loader.ts`, `src/main.ts`
- **Picker keybinding configurability** — picker modal keybindings (`<C-n>`, `<C-p>`, `<C-x>`, `<C-v>`, `<C-t>`, `<C-d>`, `<C-u>`) are now configurable via Lua
    - `vim.obsidian.pick_keymap()` accepts a table of action→key arrays with snake_case field names
    - Custom keymap persisted in settings and applied to all picker instances including tag sub-pickers
    - Plugin: `src/picker/types.ts` (`PickerKeymap`, `matchesPickerKey`), `src/picker/picker.ts` (refactored keydown handler), `src/picker/sources/tags.ts`, `src/settings.ts`, `src/lua/api.ts`, `src/lua/obsidian-api.ts`, `src/lua/loader.ts`, `src/main.ts`
- **Global workspace navigation remappable keybindings** — non-editor keybindings (`<C-w>*`, `gt`/`gT`, `j`/`k` scroll, `H`/`L`, `:`) are now remappable
    - `vim.obsidian.keymap.set`/`del` now operate on the live `GlobalMappingRegistry` at runtime (previously only at config-load time)
    - **`:gmap key :command`** — new ex command to add global keybindings from the editor command line or non-editor `:` modal
    - **`:gunmap key`** — new ex command to remove global keybindings
    - **`:gmaps`** — renamed from `:gmap` (display-only) to avoid collision with the new mapping command
    - All 26 default global mappings tagged with stable `name` fields for documentation
    - Plugin: `src/workspace/global-mapping-registry.ts`, `src/workspace/global-defaults.ts`, `src/ui/global-ex-command.ts`, `src/workspace/commands.ts`, `src/lua/loader.ts`, `src/main.ts`
- **Remapping guide** — new documentation page `docs/configuration/remapping.md` with examples for all 4 remapping contexts (editor, oil, picker, global)

### Changed

- **`:gmap` (display)** renamed to **`:gmaps`** — the `:gmap` command now creates global keybindings instead of displaying them. Use `:gmaps` to list all active global mappings.
- **Autocmd events** — 15 → 17 supported events (added `OilEnter`, `OilLeave`)

### Documentation

- `docs/configuration/remapping.md`: new unified remapping guide
- `docs/features/oil-explorer.md`: added remapping section with ex commands table, Lua examples, vimrc examples, and `vim.obsidian.oil` function reference
- `docs/features/ex-commands.md`: added navigation/action/oil/hint/global mapping ex command tables; updated command count to 100+
- `docs/reference/keybindings.md`: added ex command column to oil table; added remapping section link
- `docs/configuration/lua-config.md`: added `vim.obsidian.oil` namespace (10 functions), `OilEnter`/`OilLeave` autocmd events, `vim.obsidian.pick_keymap()` API
- `docs/configuration/vimrc.md`: updated `:gmap`/`:gunmap`/`:gmaps` documentation
- `docs/configuration/index.md`: added remapping guide to quick links
- `KNOWN_LIMITATIONS.md`: updated keybinding remappability section to "Implemented" across all contexts; updated autocmd event count to 16
- `AGENTS.md`: updated change-to-page routing table with `configuration/remapping.md`

## [0.45.0] - 2026-07-09

### Fixed

- **`gk`/`gj` takes extra keypress to traverse non-wrapped headings** — `gk` required two presses to cross a heading line that was visually tall (large font/line-height) but did not wrap. CM6's `moveVertically` saw the heading's line block as spanning multiple `defaultLineHeight` steps, causing a spurious within-line cursor move before crossing to the adjacent line. The fork's `findPosV` now detects when `moveVertically` stays on the same document line with negligible Y-coordinate change (less than half `defaultLineHeight` via `coordsAtPos` comparison) and force-moves to the adjacent document line. Legitimate wrapped-line navigation (Y delta ≥ threshold) is unaffected. ([#26](https://github.com/saberzero1/motions/issues/26))
    - Fork: `src/cm_adapter.ts` (`findPosV` Y-delta spurious move detection)

### Added

- **Oil explorer** — [oil.nvim](https://github.com/stevearc/oil.nvim)-inspired file explorer that renders vault directories as editable buffers. Create, rename, delete, and move files with standard vim commands, then commit all changes with `:w`. ([oil.nvim](https://github.com/stevearc/oil.nvim)-inspired)
    - **`:Oil [path]`** opens the current file's directory (or a specified path) as an editable buffer in a new tab. Each line represents a file or folder with a concealed entry ID. The buffer is a regular markdown file — all existing vim features (EasyMotion, surround, text objects, which-key, status bar) work natively.
    - **File operations via vim commands**: `o` (new line) + `:w` creates a file, `dd` + `:w` deletes, `cw` + `:w` renames. Filenames without an extension default to `.md`. Names ending with `/` create folders. Renames update backlinks via `app.fileManager.renameFile()`. Deletes respect user trash settings via `app.fileManager.trashFile()`.
    - **Cross-directory moves**: `dd` in one oil buffer, `p` in another, `:w` moves the file. The diff engine detects moves by matching entry IDs across buffers.
    - **Navigation keybindings** (active only in oil buffers): `<CR>` open/enter, `-` parent directory, `~` vault root, `q` close, `<C-l>` refresh, `g.` toggle hidden files, `gs` cycle sort order, `y.` yank file path
    - **Auto-refresh**: vault event listeners (create/delete/rename) with 200ms debounce refresh open oil buffers when files change externally
    - **Confirmation dialog**: shown when deleting files exceeding the configurable threshold (default: 1)
    - **Stale file cleanup**: orphaned temp files from previous sessions are removed on plugin startup
    - **Tab title**: reflects current directory (e.g., `oil~notes`) and updates on navigation
    - **`:w`/`:wq`/`:x`/`:update` dispatch**: active file path is checked for the `oil~` prefix — oil commits route through the diff/validate/execute pipeline; normal files save normally
    - **Global ex command**: `:Oil` available in the non-editor `:` command modal (same pattern as picker commands)
    - **Setting gate**: `:Oil` command and keybindings only registered when the `oilExplorer` setting is enabled (default: on)
    - Plugin: `src/oil/` (manager.ts, cache.ts, diff.ts, actions.ts, render.ts, parser.ts, extensions.ts, keybindings.ts, types.ts), `src/workspace/commands.ts` (`:w` dispatch, `:Oil` registration), `src/main.ts` (OilManager/OilKeybindingManager lifecycle), `src/settings.ts` (4 settings), `src/ui/global-ex-command.ts` (`:Oil` in global modal), `src/workspace/global-defaults.ts` (oil manager threading), `styles.css` (file explorer hiding)
- **Oil explorer Lua API** — `vim.obsidian.oil.open(path)` opens oil for a directory, `vim.obsidian.oil.close()` closes the active oil buffer and cleans up the temp file
    - Plugin: `src/lua/api.ts` (`oilOpen`/`oilClose` callbacks), `src/lua/obsidian-api.ts` (`vim.obsidian.oil` sub-table), `src/lua/loader.ts` (callback wiring)
- **Oil explorer settings** — 4 new settings in **Settings → Vim Motions → File explorer**:
    - `oilExplorer` (toggle, default: on) — enable/disable the oil explorer
    - `oilShowHiddenFiles` (toggle, default: off) — show dotfiles in oil views
    - `oilConfirmDeleteThreshold` (slider, 1–20, default: 1) — confirmation dialog threshold
    - `oilDefaultSort` (dropdown: name/mtime/size, default: name) — directory sort order
    - Plugin: `src/settings.ts`
- **Oil explorer e2e test suite** — 10 regression tests covering: `:Oil` opens temp file, regular markdown view, vault file listing with concealment, current-directory default, file creation, folder creation, file deletion, file rename, no-op save, and temp file exclusion from listings
    - Plugin: `test/specs/oil-poc.e2e.ts`
- **`wdio.conf.mts` workspace cleanup** — `onPrepare` hook deletes stale `workspace.json` before e2e tests to prevent flaky failures from leftover workspace state
- Spike test for reporter's exact content (`spike-gk-issue26-repro.e2e.ts`, 6 tests: full-document gk/gj traversal, consecutive h2 headings, long wrapped line, h2-longline-h2 transitions)

### Changed

- **Oil temp file hiding** — oil temp files (`oil~*.md`) are hidden from the file explorer via a static CSS prefix selector (`[data-path^="oil~"]`) in `styles.css`, and from search/graph/quick switcher via Obsidian's `userIgnoreFilters` mechanism. User-configured ignore filters are preserved — oil only adds/removes its own entries.

### Documentation

- `docs/features/oil-explorer.md`: new feature page covering overview, opening commands, file operations, navigation, configuration, and implementation details
- `docs/features/index.md`: added oil explorer entry to workspace & commands section
- `docs/reference/keybindings.md`: added Oil explorer keybinding table (13 entries)
- `docs/configuration/settings.md`: added File explorer settings group (4 settings)
- `KNOWN_LIMITATIONS.md`: added oil explorer section with cross-directory move requirements, temp file mechanism, and dotfile limitation
- `KNOWN_LIMITATIONS.md`: updated "Visual line navigation" section with three-correction architecture (multi-line clamp, tall non-wrapped line detection, column 0 fallback); updated test coverage note
- Fork `DIFFERENCES.md`: updated "Widget-aware vertical navigation" section with Y-delta spurious move detection

## [0.44.1] - 2026-07-09

### Removed

- **nucleo-matcher-wasm dependency removed** — the WASM-based fuzzy matcher from the Helix editor has been removed. The `nucleo` and `auto` picker engine options are no longer available. The bundled wasm-bindgen glue code contained a `fetch()` call (in the unused async init path) that triggered the Obsidian community directory scanner's network request warning, along with other WASM-related scanner flags. Since uFuzzy performs comparably and nucleo was disabled by default, the dependency has been dropped entirely to eliminate scanner warnings and reduce bundle size.
    - Plugin: `src/picker/matcher-nucleo.ts` (deleted), `src/picker/matcher.ts` (nucleo branch and `auto`/`nucleo` engine options removed), `src/settings.ts` (`pickerMatcherEngine` type narrowed to `'ufuzzy' | 'obsidian'`, dropdown options reduced), `esbuild.config.mjs` (WASM binary loader plugin removed), `package.json` (`nucleo-matcher-wasm` dependency removed)
    - Tests: `test/unit/picker/matcher.test.ts` (nucleo engine removed from test matrix, nucleo-specific test suite removed), `test/bench/matcher.bench.ts` (nucleo benchmarks removed), `test/specs/picker.e2e.ts` (nucleo removed from engine switching test)
    - Docs: `KNOWN_LIMITATIONS.md` (nucleo entries removed from engine list, limitations, and bundle size section), `docs/configuration/settings.md` (engine options updated), `docs/index.md` (0.44.0 summary updated), `ACKNOWLEDGEMENTS.md` (nucleo attribution removed), `AGENTS.md` (nucleo-matcher-wasm fork section removed)

### Changed

- **Picker matching engine** — setting reduced from four options (`ufuzzy`, `nucleo`, `obsidian`, `auto`) to two (`ufuzzy`, `obsidian`). Default remains `ufuzzy`.
- **Bundle size** — production bundle reduced by ~193KB (embedded WASM binary) plus ~30KB of wasm-bindgen glue code.

## [0.44.0] - 2026-07-09

### Changed

- **Picker modal Telescope-style presentation** — the unified fuzzy picker now uses a terminal-inspired visual style matching the which-key overlay aesthetic. All text elements use `var(--font-monospace)` at compact sizes (11–13px). Items are denser (3px vertical padding, no minimum height). The selected item uses an accent-tinted background (`hsla(var(--interactive-accent-hsl), 0.15)`) instead of the generic hover color. The modal itself has minimal border-radius (2px), a subtle box-shadow, and an accent-colored border on the input and results panels. The result count bar uses `var(--text-faint)` at 11px with a border separator. Preview pane font sizes are unified at 12px. All colors use Obsidian CSS variables for full theme compatibility. ([telescope.nvim](https://github.com/nvim-telescope/telescope.nvim)-inspired)
    - Plugin: `styles.css` (picker CSS section rewritten)
- **Picker floating border titles** — each picker section (prompt, results, preview) now displays a centered title label that overlays the top border, matching telescope.nvim's `─── Files ───` presentation. The prompt shows the source name (e.g. "Files", "Buffers", "Commands", "Livegrep"), the results list shows "Results", and the preview pane shows "Preview". Titles use monospace font at 11px with `var(--text-muted)` color and a `var(--modal-background)` background to mask the border behind them.
    - Plugin: `src/picker/picker.ts` (`formatTitle` helper, `.vim-motions-picker-section` wrapper divs with `.vim-motions-picker-title` spans for input, results, and preview sections), `styles.css` (`.vim-motions-picker-section`, `.vim-motions-picker-title` rules, updated flex layout for preview body wrappers)
- **Picker positional previews use raw text** — positional previews (grep, live grep, headings, marks) now render as monospace plain text instead of rendered markdown. This ensures uniform line heights so the line-number gutter stays perfectly aligned with the content — `MarkdownRenderer.render()` produces variable-height elements (headings, block elements) that caused the gutter and content to drift apart. Non-positional previews (full file preview without line numbers) continue to use markdown rendering.
    - Plugin: `src/picker/picker.ts` (`renderMarkdownPreview` positional branch rewritten to emit `<pre>` with per-line `<div>` elements), `styles.css` (`.vim-motions-picker-preview-code`, `.vim-motions-picker-preview-code-line` rules)

### Fixed

- **Neovim golden recorder produced incorrect results for visual-block operations** — the `NeovimClient.input()` method used `nvim_feedkeys` with `'tx'` flags, which does not fully execute block-insert replication (where `<C-v>I`/`A` + text + `<Esc>` applies the inserted text to all selected lines) or visual mode-switch + operator combos within a single RPC call. Block insert operations only appeared on the last selected line, and `<C-v>` → `v`/`V` mode switches produced incorrect deletion scopes. Fixed by using `:execute "normal ..."` (via `nvim.command()`) for key sequences containing `<C-v>`, which processes synchronously within Neovim's command loop. Non-block sequences still use `nvim_feedkeys` (needed for macro recording/replay which `:normal` doesn't support). Added `escapeForNormal()` helper to convert control characters to Vim `\<...>` notation.
    - Plugin: `test/neovim/client.ts` (hybrid `input()` method, `escapeForNormal` function)
    - Golden data: `upstream-gaps.json` (4 cases corrected), `visual-block.json` (15 cases corrected — block I/A/c/C/x/~ now correctly affect all selected lines), `select-mode.json` and `select-mode-extended.json` (minor corrections from improved key processing)
- **Picker preview gutter misaligned on files with frontmatter** — positional previews (grep, live grep, headings, marks) showed line numbers for YAML frontmatter lines, but `MarkdownRenderer.render()` silently strips frontmatter from the output. This caused the rendered text to shift up relative to the gutter by the number of frontmatter lines. Fixed by detecting `---`-delimited frontmatter in `readLinesAroundPosition` and clamping the preview slice to start after the frontmatter block, so both the gutter and content exclude frontmatter lines.
    - Plugin: `src/picker/sources/preview-utils.ts` (`getFrontmatterEnd` helper, `effectiveStart` clamping in `readLinesAroundPosition`)

### Added

- **Picker matching engine setting** — selectable fuzzy matching engine for the picker (**Settings → Vim Motions → Picker matching engine**). Four options: `ufuzzy` (default), `nucleo`, `obsidian`, `auto`. The setting takes effect immediately on the next picker invocation without restarting Obsidian.
    - **uFuzzy** (default): Pure JavaScript matcher with filename-aware ranking — prefers exact filename prefix matches over partial path matches (e.g., `Header.tsx` ranks above `header/utils.ts` for query `"Header"`). Fastest engine in benchmarks across all query types. Supports typo tolerance.
    - **nucleo** (opt-in): WASM-compiled matcher from the [Helix editor](https://github.com/helix-editor/nucleo) (~193KB binary). Provides fzf-compatible scoring with optimal Smith-Waterman alignment and path-aware matching. Fork at [saberzero1/nucleo-matcher-wasm](https://github.com/saberzero1/nucleo-matcher-wasm) adds `matchLiteralIndexedWithIndices` and `matchPatternIndexedWithIndices` methods for efficient WASM boundary crossing.
    - **obsidian** (opt-in): Obsidian's built-in `prepareFuzzySearch` API. Zero bundle cost. May be slower on large vaults.
    - **auto**: nucleo on desktop, uFuzzy on mobile. Falls back to uFuzzy if WASM initialization fails.
    - Plugin: `src/picker/matcher.ts` (factory), `src/picker/matcher-ufuzzy.ts` (enhanced sort), `src/picker/matcher-nucleo.ts` (WASM adapter), `src/picker/matcher-obsidian.ts` (Obsidian API adapter), `src/picker/matcher-utils.ts` (shared utilities), `src/settings.ts` (`pickerMatcherEngine` setting), `esbuild.config.mjs` (WASM binary loader plugin)
- **Enhanced uFuzzy file-picker sort** — the uFuzzy matcher now uses a filename-aware ranking algorithm instead of the default sort. The sort prefers: (1) exact filename prefix matches, (2) shorter basenames among prefix matches, (3) filename matches over path-only matches, (4) more exact term boundaries, (5) tighter fuzzy matches, (6) shorter paths. The info phase is capped at 500 items with filename-prefix candidates prioritized, keeping sort overhead bounded for broad queries. Benchmarks show this produces the same #1 result as nucleo's Smith-Waterman scoring for 7 out of 8 test queries at ~25% overhead vs the default sort.
    - Plugin: `src/picker/matcher-ufuzzy.ts` (`filePickerSort` function, 3-phase `filter()` → `info()` → custom sort pipeline)
- **Matcher benchmark suite** — `npm run test:bench` runs a vitest benchmark comparing all three matching engines (uFuzzy, nucleo, obsidian) across 8 query patterns at 1K/5K/10K item counts. Uses realistic file path data (16 directories × 50 filenames × 6 extensions).
    - Plugin: `test/bench/matcher.bench.ts`, `vitest.config.ts` (benchmark configuration), `package.json` (`test:bench` script)
- **Picker engine switching e2e test** — validates that all three engines (ufuzzy, nucleo, obsidian) can be switched at runtime via settings and produce results in the picker.
    - Plugin: `test/specs/picker.e2e.ts` (matcher engine switching section)
- **Matcher unit tests expanded** — parameterized test suite runs 18 shared test cases across all three engines (54 tests total). Nucleo-specific tests cover fzf syntax chars as literals, emoji UTF-32/UTF-16 index correction, CJK characters, and 10K-item performance. Matcher-utils tests cover `indicesToRanges` and `utf32ToUtf16Indices`.
    - Plugin: `test/unit/picker/matcher.test.ts` (68 tests, up from 18)
- 3 Neovim golden comparison cases for `gk` column preservation across headings (`gk over heading preserves column`, `gk over heading then above preserves column`, `gk gj round-trip preserves column`), recorded against Neovim 0.12.2
- 2 spike test suites: `spike-gk-font-variations.e2e.ts` (11 tests: CSS theme stress-testing with varying font sizes, line heights, heading sizes, editor widths, padding/margins), `spike-gk-column-drift.e2e.ts` (4 tests: column drift measurement per heading level with Neovim comparison data)

### Documentation

- `KNOWN_LIMITATIONS.md`: updated picker section with four-engine description, filename-aware ranking, bundle size impact; added "`gk`/`gj` column drift on heading lines" section documenting the pixel-vs-character column deviation from Neovim with measurement data table; added `gj`/`gk` column row to behavioral deviations table with "Pixel drift" status; updated golden test coverage note (7 → 10 heading tests, 3 golden comparison cases)
- `docs/configuration/settings.md`: added picker matching engine setting row with four options and notes section
- `AGENTS.md`: added nucleo-matcher-wasm fork section (dependency URL, build instructions, WASM binary size, fork API additions, license)
- `ACKNOWLEDGEMENTS.md`: added third-party attribution for nucleo-matcher-wasm (MPL-2.0), codemirror-vim (MIT), fengari (MIT)
- `test/neovim/deviations.ts`: registered 2 known deviations for `gk` column preservation across heading lines (pixel-based `posAtCoords` vs Neovim's character-based `curswant`)
- Fork `DIFFERENCES.md`: updated "Widget-aware vertical navigation" section with clamp-all-jumps approach and `posAtCoords` column fixup relaxation

## [0.43.0] - 2026-07-08

### Fixed

- **Cursor snapping over double-character formatting marks in Live Preview** — moving through `**bold**`, `__underline__`, `~~strikethrough~~`, or `==highlight==` with `h`/`l` skipped positions inside the `**`/`__`/`~~`/`==` delimiters instead of visiting each character. The cursor would jump from the first delimiter character to the content, skipping the second delimiter character. Investigation found that the `EditorState.transactionFilter` introduced to correct cursor positioning near formatting marks was the sole cause of the snapping — Obsidian's Live Preview natively handles mark visibility based on cursor proximity, and all formatting marks are full-width DOM elements on the active line. The transaction filter, the `formattingMarkMode` setting, and the `formattingmarkmode` vim option have been removed. ([#33](https://github.com/saberzero1/motions/issues/33))
    - Plugin: removed `src/vim/formatting-mark-fix.ts`, `src/vim/formatting-mark-ranges.ts`; removed `formattingMarkMode` from settings interface, defaults, settings UI, Style Settings definition, vimrc loader, and vim options
- **`gk`/`gj` still skips lines in documents with mixed headings and lists** — `gk` could jump over multiple document lines when navigating upward through a document containing headings of varying sizes (`###`, `####`) separated by empty lines. The previous fix (v0.18.0) only clamped multi-line jumps when a replaced widget decoration (`dec.point`) was present in the skipped range, so headings — which use mark decorations with larger fonts, not replaced widgets — still triggered overshooting from CM6's pixel-based `moveVertically`. The fork's `findPosV` now clamps all multi-document-line jumps to ±1 when no fold is present, regardless of decoration type. `posAtCoords` resolves horizontal position on the clamped target line; the `goalColumn > 0` guard is relaxed to `goalColumn != null` so the column fixup also fires at column 0. ([#26](https://github.com/saberzero1/motions/issues/26))
    - Fork: `src/cm_adapter.ts` (`findPosV` line-jump clamp, `posAtCoords` resolution on clamped target)

### Added

- 6 regression tests for cursor movement through double-character formatting marks (`**`, `__`, `~~`, `==`) — asserts every position is visited in both `l` and `h` directions
- E2E tests for `gk` over h4/h5/h6 headings: cursor horizontal position preserved across all heading levels
- E2E test for `gk` through mixed headings, text, and lists: verifies no document lines are skipped and horizontal position is preserved on non-empty lines

### Documentation

- `KNOWN_LIMITATIONS.md`: updated "Visual line navigation and replaced widget decorations" section with clamp-all-jumps approach; updated `gj`/`gk` widgets behavioral deviation entry; updated test coverage count (3 → 7 heading tests)

## [0.42.0] - 2026-07-08

### Added

- **Mobile opt-in setting and toggle command** — the plugin is now disabled by default on mobile devices. A new `enableOnMobile` setting (default: off) controls whether the plugin activates on mobile. When disabled, the plugin skips all Vim engine initialization — no editor extensions, event listeners, commands, or status bar elements are registered — leaving Obsidian's editor in its default state. The settings tab and a toggle command (`Vim Motions: Toggle enable on mobile`) remain accessible even when the plugin is disabled, so users can re-enable without needing a desktop device. Changing the setting requires an Obsidian reload. Hardware keyboard users on tablets can opt in; soft-keyboard-only users are no longer stuck in Normal mode with no way to escape. ([#52](https://github.com/saberzero1/motions/issues/52))
    - Plugin: `src/settings.ts` (`enableOnMobile` in `VimMotionsSettings` interface, `DEFAULT_SETTINGS`, `getSettingDefinitions()` Mobile group, `display()` Mobile toggle), `src/main.ts` (early return in `onload()` when `Platform.isMobile && !enableOnMobile`, `toggle-enable-on-mobile` command registered before the gate)
- **`showConfigNotifications` setting** — a new toggle in **Settings → Vim Motions → Vimrc & key bindings → Show config load notifications** (default: on) controls whether the plugin shows Obsidian Notice popups when vimrc or init.lua files are loaded on startup. When disabled, success and informational notifications ("loaded N commands from …", "loaded but contained no commands", "no config files found") are suppressed. Error notifications (lua syntax/runtime errors) and single-mode "not found" warnings (e.g. configMode is `lua` but no init.lua exists) always show regardless of this setting.
    - Plugin: `src/settings.ts` (`showConfigNotifications` in `VimMotionsSettings` interface, `DEFAULT_SETTINGS`, toggle in Vimrc & key bindings group), `src/main.ts` (notification gating in vimrc loading, lua loading, and dual-mode fallback)

### Changed

- **Config load notifications scoped and improved** — startup notifications for vimrc and init.lua loading are now better scoped. "Not found" messages only appear when the specific config type is the sole configured mode (e.g. configMode is `vimrc` but no vimrc exists) and now include the searched path. In dual-mode (`lua-vimrc`), "no config files found" lists both searched paths. Success and empty-file notifications respect the new `showConfigNotifications` setting. Error notifications (lua parse/runtime errors) always show.
    - Plugin: `src/main.ts` (vimrc notification block, lua notification block, dual-mode fallback notification)
- **Picker preview pane renders markdown** — full-file picker preview windows now render file content through Obsidian's `MarkdownRenderer.render()` instead of displaying raw markdown text in `<pre><code>` blocks. Headings, bold, italic, code blocks, images, links, callouts, and other markdown formatting are fully rendered. Links inside the preview are non-interactive (click-through disabled via `pointer-events: none`). Positional previews (grep, live grep, headings, marks) use a line-number gutter that highlights the target line. `Component` lifecycle is managed per preview update (`load()` on render, `unload()` on preview change and modal close) to prevent memory leaks. Plain-string previews (commands, registers) remain unchanged. The picker modal now uses a fixed height (50vh) to prevent layout shifts when switching between files, and the result count element reserves its line height when empty.
    - Plugin: `src/picker/picker.ts` (`renderMarkdownPreview` method, `Component` lifecycle, `PreviewResult` dispatch), `src/picker/types.ts` (`PreviewResult` interface, `PreviewReturn` union type), `src/picker/sources/preview-utils.ts` (returns `PreviewResult` with `sourcePath` and optional `lineRange`), `styles.css` (rendered preview content, positional gutter, fixed modal height)

### Fixed

- **Cursor-aware table widget does not render inline markdown** — images, bold, italic, math, links, and other inline formatting inside table cells were displayed as plain text when the cursor-aware table widget was active. The `TableRenderWidget` used `textContent` to populate cells, which strips all markup. Replaced with `MarkdownRenderer.render()` to process cell content through Obsidian's markdown pipeline. Plain text is shown instantly as a fallback while the async render completes. The `<p>` wrapper added by `MarkdownRenderer` is unwrapped to avoid block-level spacing in cells. `Component` lifecycle is managed per widget (`load()` in `toDOM`, `unload()` in `destroy`) to prevent memory leaks. `editorInfoField` provides `app` and `sourcePath` from the editor state for correct relative image path resolution. ([#50](https://github.com/saberzero1/motions/issues/50))
    - Plugin: `src/vim/table-render-widget.ts` (`renderCell` function, `MarkdownRenderer.render()` integration, `Component` lifecycle, `editorInfoField` for app/sourcePath access)
- **`:obcommand` unavailable in Lua-only config mode** — `vim.cmd('obcommand ...')` failed with "Not an editor command" when `configMode` was set to `lua` (without vimrc). The `obcommand` ex command was only registered inside `registerVimrcExCommands()`, which only runs when vimrc loading is enabled. Moved `obcommand` registration to `registerObCommand()` alongside `ob`, sharing the same handler. Both commands are now available in all config modes (lua, vimrc, lua-vimrc, settings-only). Additionally, `:obcommand` with no arguments now opens the command picker (matching `:ob` behavior) instead of silently doing nothing.
    - Plugin: `src/workspace/commands.ts` (`registerObCommand` registers both `ob` and `obcommand`), `src/vimrc/loader.ts` (removed duplicate `obcommand` registration and unused `executeCommandById` helper)

### Documentation

- `docs/configuration/settings.md`: added Mobile section with `enableOnMobile` setting; added `showConfigNotifications` toggle to Vimrc & key bindings table
- `docs/getting-started/installation.md`: added Mobile section with enable instructions
- `KNOWN_LIMITATIONS.md`: updated Mobile support section with opt-in setting, toggle command, and revised platform feature table; added config load notification scoping section under Config file resolution
- **7 new e2e tests** — `config-notifications.e2e.ts` covering: lua loaded notification shown/suppressed, lua error notification always shown even when suppressed, lua empty-file notification shown/suppressed, notification includes config file path, setting default verification
- **Shared test helpers** — `setPluginSetting`, `getNotices`, `getVimMotionsNotices`, `dismissNotices` added to `test/helpers.ts`

## [0.41.0] - 2026-07-08

### Added

- **External config file paths (desktop only)** — custom vimrc and init.lua paths now accept absolute filesystem paths (e.g. `~/.config/obsidian/init.lua`, `C:\Users\<you>\.config\obsidian\vimrc`), enabling shared config across multiple vaults. Paths starting with `/`, `~`, or a drive letter are read directly from the filesystem via `window.require` instead of the vault adapter. Tilde (`~`) is expanded to the user's home directory. Mobile gracefully falls back to vault-only paths. ([#51](https://github.com/saberzero1/motions/issues/51))
    - Plugin: `src/util/external-fs.ts` (new module: `isAbsolutePath`, `readExternalFile`, `externalFileExists`, `expandTilde`, `getObsidianUserDataDir`), `src/lua/loader.ts` (`fileExists`/`readLuaFile` external path fallback), `src/vimrc/loader.ts` (`fileExists`/`readVimrcFile` external path fallback), `src/settings.ts` (updated descriptions)
- **Unified picker / fuzzy finder** — telescope.nvim-inspired fuzzy picker with 11 sources, preview pane, live grep, frecency scoring, and split-open support
    - **10 built-in sources**: files (`:files`), buffers (`:buffers`), commands (`:commands`), headings (`:headings`), outline (`:outline`), backlinks (`:backlinks`), tags (`:tags`), recent files (`:recent`), marks (`:marks`), registers (`:registers`)
    - **Live grep** (`:livegrep`): real-time vault content search with 200ms debounce, generation-based cancellation, and minimum 2-character query
    - **Preview pane**: side-by-side file content preview with per-source content (file content, surrounding lines for headings/grep/marks, command info, register content), responsive collapse on narrow screens (<600px), `<C-d>`/`<C-u>` preview scrolling
    - **Frecency scoring**: recently/frequently accessed items rank higher. Time-bucket weights (1h–30d), 1000-entry cap, persists across restarts via plugin data. Applies to files, buffers, commands, headings, backlinks, grep, recent.
    - **Picker resume**: `:resume` / `<leader>fp` / `vim.obsidian.pick('resume')` reopens the last picker with the same query and selection
    - **Split-open**: `<C-x>` (horizontal split), `<C-v>` (vertical split), `<C-t>` (new tab) from any file-based picker
    - **Leader mappings**: 11 `<leader>f*` bindings with which-key "Find" group (opt-out via `pickerLeaderMappings` setting, default: on)
    - **Keyboard navigation**: `<C-n>`/`<C-p>`, `<C-j>`/`<C-k>`, arrows, `<Enter>`, `<Escape>`, `<C-c>`
    - **Matching engine**: uFuzzy (7.5KB, unicode support) with match highlighting
    - **Fallback setting**: `picker` boolean (default: true) — when disabled, migrated commands (`:buffers`, `:marks`, `:registers`, `:grep`, `:backlinks`, `:ob`) fall back to previous VimInfoModal/SuggestModal behavior
    - **Lua API**: `vim.obsidian.pick(source, opts?)` — invoke any picker source from Lua
    - **Obsidian command palette**: 12 picker commands registered via `addCommand` for discoverability
    - **Global ex command support**: all picker commands available in non-editor views via `:` global ex command modal
    - **200-item render cap** with `requestAnimationFrame`-free synchronous rendering for flicker-free updates
    - Plugin: `src/picker/` (picker.ts, matcher.ts, registry.ts, frecency.ts, types.ts, sources/\*.ts), `src/picker/sources/` (files, buffers, commands, grep, live-grep, headings, backlinks, tags, recent, marks, registers, split-open, preview-utils)
- **`isEasyMotionActive()` guard** — exported from `src/easymotion/register.ts` to prevent picker from opening during EasyMotion label selection
    - Plugin: `src/easymotion/register.ts`

### Changed

- **`:buffers` / `:ls`** now opens fuzzy picker instead of VimInfoModal table (when `picker` setting enabled)
- **`:marks`** now opens fuzzy picker with jump-to-mark action (when `picker` setting enabled)
- **`:registers`** now opens fuzzy picker with paste-at-cursor action (when `picker` setting enabled)
- **`:ob` (no args)** now opens commands picker instead of VimInfoModal command list (when `picker` setting enabled)
- **`:grep` (no args)** now opens live grep picker instead of showing "Usage" notice (when `picker` setting enabled)
- **`:grep <query>`** now opens picker with pre-computed results instead of SuggestModal (when `picker` setting enabled)
- **`:backlinks`** now opens fuzzy picker instead of VimInfoModal table (when `picker` setting enabled)
- **Bundle size**: +17.5KB from uFuzzy dependency (unicode mode)

### Documentation

- `docs/features/ex-commands.md`: added picker commands section
- `docs/reference/keybindings.md`: added picker ex commands and `<leader>f*` mappings
- `docs/configuration/lua-config.md`: added `vim.obsidian.pick()` API documentation; added "Shared config across vaults" subsection documenting external path support
- `docs/configuration/vimrc.md`: added "Shared config across vaults" subsection documenting external path support
- `docs/configuration/settings.md`: updated custom path descriptions to mention absolute path support
- `KNOWN_LIMITATIONS.md`: added picker section with limitations; updated config file resolution section with external path support

## [0.40.0] - 2026-07-07

### Added

- **`vim.keymap.set` leader bindings appear in which-key** — leader-prefixed keymaps registered via `vim.keymap.set` with a `desc` option now automatically appear in the which-key overlay, matching `vim.obsidian.leader.add` behavior. Group labels from `vim.obsidian.whichkey.add()` work with both `vim.keymap.set` and `vim.obsidian.leader.add` bindings. Buffer-local keymaps (`buffer = 0`) are excluded from global which-key. ([#27](https://github.com/saberzero1/motions/issues/27))
    - Plugin: `src/lua/api.ts` (leader prefix auto-detection in `vim.keymap.set`), `src/main.ts` (consume `luaResult.leaderBindings` in LeaderRegistry)
- **Synthetic `BufEnter` for initial file** — `BufEnter` autocmds now fire for the file already open when the plugin loads, matching Neovim behavior. Previously, `BufEnter` only fired on subsequent file opens.
    - Plugin: `src/lua/autocmd.ts` (`activate()` accepts `initialFilePath`), `src/lua/loader.ts` (passes current file path)

### Fixed

- **`vim.cmd()` broken at runtime** — `vim.cmd()` called from function-mapped keymaps, autocmd callbacks, timer callbacks, and user commands silently failed because commands were queued but never executed after initial load. Fixed with a `runtimeExHandler` that executes commands immediately via `vim.handleEx()`. Cleanup on plugin unload prevents stale callbacks. ([#49](https://github.com/saberzero1/motions/issues/49), [#27](https://github.com/saberzero1/motions/issues/27))
    - Plugin: `src/lua/loader.ts` (`runtimeExHandler`, `activateRuntimeExHandler`, `deactivateRuntimeExHandler`), `src/main.ts` (wire runtime handler, cleanup in `onunload`)
- **Function-callback keymaps lost after feature reload** — `vim.keymap.set` with function callbacks registered keymaps that were silently destroyed when `reloadFeatures()` called `vim.resetKeymap()`. String-RHS keymaps survived but function callbacks did not. Fixed by moving `applyLuaMaps()` to run after `reloadFeatures()` and clearing `luaActionNames` in `loadLuaConfigForTest()`.
    - Plugin: `src/main.ts` (`applyLuaMaps` ordering, `loadLuaConfigForTest` cleanup)
- **Space as leader key breaks which-key** — `vim.g.mapleader = " "` with which-key in "all" mode now works correctly: space doesn't move the cursor, bindings execute, and grouped which-key displays. The "leader-only" mode still has a known limitation (see KNOWN_LIMITATIONS.md). ([#49](https://github.com/saberzero1/motions/issues/49))
- **Surround nvim-surround parity (19 golden test fixes)** — comprehensive alignment with [nvim-surround](https://github.com/kylechui/nvim-surround) semantics. Golden comparison tests passing: 54 → 73 out of 74. ([#41](https://github.com/saberzero1/motions/issues/41))
    - `ds}` / `ds]` / `ds)` / `ds>` now preserve inner spaces (only opening bracket forms `ds{` / `ds[` / `ds(` / `ds<` strip spaces)
    - `csbBysaBb` chain — `_surroundType` gating prevents stale replacement leaking across different surround operation types
    - `csba..` dot-repeat — search position offset by replacement delimiter width for correct nested pair iteration
    - `dsb` on multiline content — cursor clamped to valid line length after bracket deletion
    - Count-prefixed `ds`/`cs` (`2dsb`, `3dsb`, `2csbB`, `3csbr`) — changed from "find Nth pair" to "apply N times" semantics, matching nvim-surround
    - `ys` with line-crossing motions (`ysjb`, `ys2jB`) — linewise motions now expand range to full lines
    - `ySS`/`VSB`/`cS`/`yS`/`gS` newline indentation — single-line content no longer gets extra 2-space indent, matching nvim-surround
    - `VS` (linewise visual surround) — selection expanded to full lines, uses newline wrapping mode
    - Visual block `Ctrl-V $ S}` — each line wrapped individually instead of entire block
    - `dsf` — new operator: delete surrounding function call (`some_func(args)` → `args`), with nested call support
    - Fork: `src/vim.js` — `deleteSurroundPair` space/cursor, `findSurroundingFunction`, count loops, linewise/block visual handling, `_surroundType` dot-repeat isolation
    - Fork: `src/types.ts` — `_surroundType` field on `InputStateInterface`

### Documentation

- `docs/configuration/lua-config.md`: added leader key subsection with `vim.g.mapleader` examples and ordering warning; added tip callout comparing `vim.cmd()` vs `vim.obsidian.leader.add()` for leader bindings
- `docs/configuration/which-key.md`: added "Automatic labels from vim.keymap.set" section documenting `desc` option integration with which-key and group label composition with `wk.add()`
- `KNOWN_LIMITATIONS.md`: added 7 Lua runtime entries (4 fixed, 3 open); updated test coverage (9 → 43 e2e tests); updated surround parity section
- **34 new e2e tests across 4 suites** — `lua-runtime.e2e.ts` (8 tests: runtime vim.cmd execution from all callback contexts), `lua-leader-whichkey.e2e.ts` (9 tests: leader binding registration and which-key integration), `lua-space-leader.e2e.ts` (7 tests: space as leader key with regression coverage), `lua-doc-examples.e2e.ts` (10 tests: every documented Lua runtime callback example)
- **Shared test helpers extracted** — `loadLuaConfig`, `focusEditor`, `setWhichKeyMode`, `hasWhichKeyOverlay`, `waitForWhichKey`, `getWhichKeyKeys`, `getWhichKeyDescriptions`, `getWhichKeyGroups`, `getLeaderBindings`, `getLeaderKey`, `getPluginSetting` moved to `test/helpers.ts` from local definitions

## [0.39.0] - 2026-07-06

### Added

- **`vim.ob.*` API expansion (47 new functions across 4 sub-namespaces)** — the `vim.obsidian` / `vim.ob` Lua namespace grows from 21 to 68 functions
    - **Leaf introspection** (Tier 1): `vim.ob.get_leaf_type()` returns the active view type string, `vim.ob.get_active_leaf()` returns `{id, type, pinned, file_path}` table, `vim.ob.list_leaves()` returns all open tabs, `vim.ob.is_markdown_view()` returns boolean
    - **Command wrappers** (Tier 2): `vim.ob.follow_link()`, `vim.ob.backlinks()`, `vim.ob.daily()`, `vim.ob.search()`, `vim.ob.tags()`, `vim.ob.new_note()`, `vim.ob.rename()`, `vim.ob.toggle_checkbox()`, `vim.ob.template()` — thin wrappers around Obsidian commands, silent no-op if required core plugin is disabled
    - **Leaf management** (Tier 3): `vim.ob.focus(direction)` navigates panes (`"left"`, `"right"`, `"top"`, `"bottom"`), `vim.ob.close_leaf()` closes active tab, `vim.ob.split(direction)` splits vertically/horizontally, `vim.ob.get_leaf_for_file(path)` finds which leaf has a file open
    - **`vim.ob.meta.*` sub-namespace (9 metadata query functions)** — read-only access to note metadata via Obsidian's `MetadataCache`
        - `vim.ob.meta.frontmatter(path?)` — returns YAML frontmatter as a Lua table, or nil
        - `vim.ob.meta.tags(path?)` — returns combined body + frontmatter tags as `string[]`
        - `vim.ob.meta.links(path?)` — returns outgoing links as `{link, display, original}[]`
        - `vim.ob.meta.backlinks(path?)` — returns source file paths linking to this file as `string[]`
        - `vim.ob.meta.headings(path?)` — returns headings as `{heading, level}[]`
        - `vim.ob.meta.embeds(path?)` — returns embedded content as `{link, display}[]`
        - `vim.ob.meta.aliases(path?)` — returns YAML aliases as `string[]`
        - `vim.ob.meta.tasks(path?)` — returns checklist items as `{text, status, line}[]`
        - `vim.ob.meta.lists(path?)` — returns all list items as `{text, line, indent}[]`
        - All functions default to the current file when `path` is omitted
        - Plugin: `src/lua/obsidian-api.ts`, `src/lua/api.ts`, `src/lua/loader.ts`
    - **`vim.ob.fs.*` sub-namespace (11 vault filesystem functions)** — read and write vault files with config-dir guards
        - Read: `vim.ob.fs.files(pattern?)`, `vim.ob.fs.all_files()`, `vim.ob.fs.folders()`, `vim.ob.fs.exists(path)`, `vim.ob.fs.stat(path?)`
        - Write: `vim.ob.fs.create(path, content?)`, `vim.ob.fs.write(content)` or `vim.ob.fs.write(path, content)`, `vim.ob.fs.append(content)` or `vim.ob.fs.append(path, content)`
        - Management: `vim.ob.fs.rename(new_path)` or `vim.ob.fs.rename(path, new_path)`, `vim.ob.fs.move(dest)` or `vim.ob.fs.move(path, dest)` (detects folder dest and appends filename), `vim.ob.fs.trash(path?)`
        - Write/rename/move/trash operations silently reject paths inside the vault config directory (`app.vault.configDir`)
        - `rename` uses `fileManager.renameFile()` which updates backlinks; `trash` uses `fileManager.trashFile()` which respects the user's trash preference
        - Write operations are fire-and-forget (async internally, Lua returns immediately)
        - All write operations default to the current file when path is omitted
        - Plugin: `src/lua/obsidian-api.ts`, `src/lua/api.ts`, `src/lua/loader.ts`
    - **`vim.ob.ui.*` sub-namespace (4 UI control functions)** — control Obsidian UI from Lua
        - `vim.ob.ui.sidebar(side, state?)` — toggle/open/close sidebar (`"left"`/`"right"`, optional `"open"`/`"close"`/`"toggle"`)
        - `vim.ob.ui.command_palette()` — open command palette
        - `vim.ob.ui.quickswitch()` — open quick switcher
        - `vim.ob.ui.notice(msg)` — alias for `vim.notify` (convenience for staying in `vim.ob` namespace)
        - Plugin: `src/lua/obsidian-api.ts`
    - **`vim.ob` editor state and convenience functions** — cursor, selection, mode, and notification access
        - `vim.ob.get_cursor()` — returns `{line, col}` (1-indexed, Lua/Neovim convention)
        - `vim.ob.set_cursor(line, col)` — sets cursor position (1-indexed)
        - `vim.ob.get_selection()` — returns visual selection text or nil
        - `vim.ob.mode()` — alias for `vim.fn.mode()` (convenience)
        - `vim.ob.notice(msg)` — alias for `vim.notify` (convenience)
        - Plugin: `src/lua/obsidian-api.ts`, `src/lua/api.ts`, `src/lua/loader.ts`
- **3 new autocmd events** — `LeafEnter`, `LeafLeave`, `FileType` (total: 15 events)
    - `LeafEnter` — fires when a new leaf gains focus (debounced 50ms), event data includes `{type, leaf_id}` in `ev.data`
    - `LeafLeave` — fires when a leaf loses focus (immediate, before `LeafEnter`)
    - `FileType` — fires after `BufEnter` with `ev.match` set to detected filetype from file extension (`.md` → `"markdown"`, `.ts` → `"typescript"`, etc.)
    - Enables Neovim-style per-filetype keymaps: `vim.api.nvim_create_autocmd("FileType", { pattern = "markdown", callback = function() ... end })`
    - Plugin: `src/lua/autocmd.ts` (`fireFileType`, `onActiveLeafChange` extension), `src/main.ts` (leaf info passthrough)
- **`workspaceNavViewTypes` setting** — comma-separated list of view types where scroll and count keys are intercepted. Defaults to `markdown,graph,pdf,canvas,empty,image`. Plugin views not in this list receive their own keystrokes. Configurable via **Settings → Vim Motions → Workspace navigation view types**, vimrc (`set workspacenavviewtypes=...`), or Lua (`vim.opt.workspacenavviewtypes = "..."` or `vim.opt.workspacenavviewtypes = {"markdown", "graph", "pdf"}`)
    - Plugin: `src/settings.ts`, `src/vim/options.ts`, `src/vimrc/loader.ts`
- **`vim.opt` table (array) support for string options** — string-type options can now be set using Lua tables: `vim.opt.workspacenavviewtypes = {"markdown", "graph", "pdf"}` is equivalent to `vim.opt.workspacenavviewtypes = "markdown,graph,pdf"`. Elements are joined with commas. Applies to all string-type options.
    - Plugin: `src/lua/api.ts` (`vim.opt.__newindex` table handling)

### Fixed

- **Surround opening bracket semantics (`ds(`/`ds[`/`ds{`/`cs({`)** — `findSurroundingBrackets` received swapped parameters when the target was an opening bracket (`(`, `[`, `{`, `<`), causing the backward search to look for the wrong bracket character. `ds(` on `( hello world )` was a no-op because the search looked for `)` going backward. Fixed by detecting opening bracket targets and swapping parameters so the closing bracket is always passed as the forward-search character. Also fixes `cs({`, `ds(` on nested/multiline content, and `ds<`. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `src/vim.js` — `findSurroundingPair` bracket parameter ordering
- **Surround cursor position after `ys`/`yss`/visual `S`** — `addSurroundToRange` placed the cursor at `from.ch + pair.open.length` (after the opening delimiter). nvim-surround places it at `from.ch` (on the opening delimiter). Fixed by removing `+ pair.open.length`. The `_surroundSelOffset.chDelta` used for dot-repeat now adds `pair.open.length` at recording time to compensate, preserving correct visual surround replay ranges. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `src/vim.js` — `addSurroundToRange` cursor, `surroundVisual` offset recording
- **Visual-block cursor displaced rightward at end-of-line** — in visual-block mode (`<C-v>`), selecting to the end of a line (via `$` or `l` to EoL) caused the block cursor to render one position past the last visible character. The `measureCursor()` function in the fork's `block-cursor.ts` had a guard (`!vim.visualBlock`) that prevented the EOL step-back for visual-block mode. This guard was originally correct when `makeCmSelection` produced `toCh + 1` without clamping, but after the per-line clamping fix (issue #38), block selection heads legitimately land on newline positions and need the step-back. Fixed by removing the `!vim.visualBlock` exclusion. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `src/block-cursor.ts` — `measureCursor()` EOL adjustment guard
- **Visual-block `A` skips short lines instead of padding** — in visual-block mode, `A` (append) on a block spanning lines shorter than the block column skipped those lines entirely. Neovim pads short lines with spaces to reach the block's right edge before appending. Fixed by adding a `padShortLines` parameter to `selectForInsert` in the fork — `A` pads, `I` still skips (matching Neovim). ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `src/vim.js` — `selectForInsert()` padding, `enterInsertMode` passes flag for `endOfSelectedArea`
- **Visual charwise `r` replaces one fewer character across line boundary** — the `replace` action in the fork used `curEnd = selEnd` (the inclusive head position) for charwise visual mode, but `cm.getRange()` treats the end as exclusive. This caused `r <Space>` across a line boundary to replace one fewer character than the visual selection covered. Fixed by using `selEnd.ch + 1` for the exclusive end. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `src/vim.js` — `actions.replace` charwise visual branch
- **`set insertmodeescape=jk` leaves `j` in buffer after escaping insert mode** — the `InsertEscapeHandler` sent `vim.handleKey(adapter, '<BS>')` to delete typed characters before sending `<Esc>`, but codemirror-vim does not handle `<BS>` in insert mode (returns false, expecting the browser default action). Since `handleKey` is called programmatically with no DOM event, the backspace had no effect and the first character(s) of the escape sequence remained in the buffer. Fixed by replacing the `handleKey('<BS>')` loop with a direct `adapter.replaceRange()` call that deletes exactly `escapeSeq.length - 1` characters before the cursor (the last key in the sequence is already intercepted by `preventDefault` and never enters the document). The native `imap jk <Esc>` mapping (via vimrc or `vim.map()`) was unaffected — codemirror-vim's `changeQueue` cleanup handles that path correctly.
    - Plugin: `src/vim/insert-escape.ts` (`onKeyDown` method)
- **`scrolloff` values above ~30 pin view at bottom of document** — high `scrolloff` values (e.g., `set scrolloff=999` to center the cursor) caused the viewport to pin at the top or bottom instead of centering. The scroll margin was passed to CodeMirror's `EditorView.scrollMargins` unclamped, producing a target rect taller than the viewport. CM6's `scrollRectIntoView` resolved the conflicting top/bottom constraints by favoring one side based on cursor direction. Fixed by clamping the margin to half the viewport height, mirroring Vim's silent cap of `scrolloff` to `(window_height - 1) / 2`. ([#48](https://github.com/saberzero1/motions/issues/48))
    - Plugin: `src/vim/scrolloff.ts` — `createScrolloffExtension()` viewport-relative clamp
- **Workspace navigation intercepting keystrokes in plugin leaves** — when workspace navigation was enabled, the global key handler consumed keystrokes (`1`, `2`, `3`, `0`, `j`, `k`, etc.) in non-editor plugin views (Spaced Repetition, Excalidraw, etc.) before the plugin could process them. Fixed with a three-gate interception system: structural keys (`<C-w>*`, `gt`/`gT`, `<C-o>`/`<C-i>`, `:`) always work in non-editor views, content keys (scroll, digits, tab shortcuts) only intercept in whitelisted view types, and plugin views receive their own keystrokes. ([#47](https://github.com/saberzero1/motions/issues/47))
    - Plugin: `src/workspace/global-mapping-registry.ts` (`GlobalMapGate` → `'standard' | 'hint' | 'structural'`), `src/workspace/global-defaults.ts` (gate assignments), `src/workspace/global-key-handler.ts` (three-gate `onKeydown` rewrite, `GLOBAL_NAV_VIEW_TYPES` whitelist, `shouldInterceptContent`/`shouldInterceptStructural` methods)

### Changed

- **`minAppVersion` bumped from 1.4.10 to 1.6.6** — required for `Vault.getAllFolders()` used by `vim.ob.fs.folders()`
- **`vim.obsidian.*` namespace extracted to dedicated module** — the Obsidian-specific Lua API is now in `src/lua/obsidian-api.ts` (extracted from `api.ts`), following the pattern of `fn.ts`, `stdlib.ts`, `timers.ts`, `highlight.ts`. No behavioral change. `api.ts` shrinks by ~504 lines.

### Documentation

- `docs/configuration/lua-config.md`: added `vim.ob.meta.*` (9 functions), `vim.ob.fs.*` (11 functions), `vim.ob.ui.*` (4 functions), editor state functions (5 functions) with API tables and examples
- `KNOWN_LIMITATIONS.md`: added "Workspace navigation in plugin views" section documenting three-gate interception and the `gg`-in-plugin-leaf trade-off; marked #47 as fixed; added "Neovim golden test coverage gaps" section documenting non-verifiable areas (scroll/viewport, fold, jumplist, cursor rendering); updated visual mode EOL cursor section with visual-block `A` padding and visual `r` off-by-one fixes
- **Neovim golden test coverage expansion** — 106 new golden comparison test cases across 6 suites, recorded against Neovim 0.12.2:
    - `surround` (74 cases): comprehensive nvim-surround parity — `ds`/`cs`/`ys`/`yss`/visual `S` with all delimiter types, count-prefixed operations (`2dsb`, `2csbB`), dot-repeat (`ysiwb..`, `dsb..`, `csba..`), tag surround (`dst`, `cst`), function surround (`dsf`), `ysa` (around surround), empty content, whitespace cascade (`ds{` strips / `ds}` preserves), motion-based (`ys$`, `ysjb`), newline variants (`ySS`, `VSB`), angle brackets, arbitrary delimiters (`|`, `^`), multiline, nesting, and cursor positioning. **Ground truth shifted from tpope/vim-surround to [nvim-surround](https://github.com/kylechui/nvim-surround)** — better maintained, comprehensive test suite, Lua-native, superset of tpope behavior. 54 pass, 20 tracked deviations.
    - `dot-repeat` (17 cases): `.` after `2dw`, `dd`, `3i`, `3o`, `cw`, `R`, `2dl`, `d2w`, `g~2w`, `V>`, `3J`, `3I`, visual block `~`, `o`
    - `select-mode-extended` (6 cases): `gh`/`gH` enter select, type replaces, `<BS>` deletes, `<Esc>` exits, `<C-g>` toggles visual↔select
    - `ex-sort` (6 cases): `:sort`, `:sort!`, `:sort i`, `:sort u`, `:sort n`, `:2,3sort`
    - `ex-global` (3 cases): `:g/pattern/d`, `:v/pattern/d`, `:g/a/s/a/x/`
    - `upstream-gaps` (7 cases): `dip` paragraph, backward block `A`, block `A` short-line padding, visual `r` cross-line, block↔char/line mode switch, macro replay
    - Test infrastructure: `SuiteDefinition.nvimSetup` field for per-suite Neovim commands (loads nvim-surround for surround suite), `NeovimClient.executeCommand()` method
    - Total golden test coverage: 276 → 382 cases across 28 suites
- `docs/configuration/settings.md`: added `Workspace navigation view types` to Vim features table
- `docs/configuration/vimrc.md`: added `workspacenavviewtypes` (`wnvt` alias) to string options table
- `docs/configuration/lua-config.md`: added 17 new `vim.ob.*` functions, 3 new autocmd events (`LeafEnter`, `LeafLeave`, `FileType`), `workspacenavviewtypes` option
- `docs/features/workspace-navigation.md`: added "Plugin view compatibility" section with key passthrough table and whitelist customization
- `docs/guides/ecosystem-compatibility.md`: added "Plugin leaf key passthrough" section
- `docs/configuration/lua-config.md`: added table (array) syntax tip for string options with example

## [0.38.0] - 2026-07-06

### Added

- **Custom surround pairs (`vim.obsidian.surround` / `surroundmap`)** — define custom single-character triggers that map to arbitrary delimiter strings, with full `ys`/`ds`/`cs` support including multi-character delimiters ([#36](https://github.com/saberzero1/motions/issues/36))
    - `vim.obsidian.surround.set("l", { left = "[[", right = "]]" })` — register a custom pair
    - `vim.obsidian.surround.del("l")` — remove a custom pair
    - `vim.obsidian.surround.add({ { "l", left = "[[", right = "]]" }, { "m", left = "$$", right = "$$" } })` — batch registration
    - Vimrc: `surroundmap l [[ ]]` / `surroundunmap l`
    - Reserved characters (`( ) [ ] { } < > b B r a t T f F " ' \``) are rejected with a descriptive error
    - Requires fork mode (bundled vim engine) — custom pairs are registered via `Vim.registerSurroundPair()` on the codemirror-vim fork
    - Fork: `customSurroundPairs` registry, `findSurroundingMultiChar()` algorithm for multi-char delimiter matching, `openWidth`/`closeWidth` support in `deleteSurroundPair`/`changeSurroundPair`
    - Plugin: `src/lua/api.ts` (`vim.obsidian.surround` sub-table), `src/vimrc/parser.ts` + `src/vimrc/loader.ts` (`surroundmap`/`surroundunmap` commands), `src/main.ts` (`applyLuaSurroundPairs` lifecycle)
- **`vim.obsidian.cursor.set()` — structured cursor shape configuration** — set per-mode cursor shapes via a Lua table instead of the `guicursor` format string
    - `vim.obsidian.cursor.set({ normal = "block", insert = "bar", operator_pending = "underline" })` — partial tables allowed
    - Valid shapes: `block`, `bar`, `underline`, `hollow`
    - Equivalent to `vim.opt.guicursor` but uses a table API
    - Plugin: `src/lua/api.ts` (`onCursorConfig` callback, `vim.obsidian.cursor` sub-table)
- **`vim.obsidian.modeprompt.set()` — batch mode prompt configuration** — set status bar mode text for multiple modes in a single call
    - `vim.obsidian.modeprompt.set({ normal = "NOR", insert = "INS", visual_line = "V-LN" })` — partial tables allowed
    - 11 mode keys supported with snake_case Lua names mapped to camelCase settings keys
    - Equivalent to setting individual `vim.g.mode_prompt_*` variables
    - Plugin: `src/lua/api.ts` (`onModePromptConfig` callback, `vim.obsidian.modeprompt` sub-table)
- **`vim.obsidian.leader.set()` — leader binding convenience API** — bind leader key sequences to Obsidian commands with automatic `:ob` prefix, leader key prepend, and which-key label registration
    - `vim.obsidian.leader.set("e", "file-explorer:reveal-active-file", { desc = "Reveal" })` — single binding
    - `vim.obsidian.leader.add({ { "ff", "switcher:open", desc = "Find file" } })` — batch registration
    - `desc` option auto-registers a which-key command label
    - For general-purpose keymaps or Lua callbacks, use `vim.keymap.set` instead
    - Plugin: `src/lua/api.ts` (`onLeaderBinding`/`onLeaderBindingDel` callbacks, `vim.obsidian.leader` sub-table)

### Fixed

- **`vim.g.mode_prompt_*` read returns nil for settings-UI-set values** — the `getModePrompt` callback was defined in the `VimApiCallbacks` interface but not wired up in `loader.ts`. Reading `vim.g.mode_prompt_normal` returned nil unless the value was also set via `vim.g` in the same init.lua session. Fixed by implementing the callback in the loader.
    - Plugin: `src/lua/loader.ts` (`getModePrompt` callback)

### Documentation

- `docs/configuration/lua-config.md`: added 4 new Obsidian namespace sections — cursor shapes (`vim.obsidian.cursor`), mode prompts (`vim.obsidian.modeprompt`), custom surround pairs (`vim.obsidian.surround`), leader bindings (`vim.obsidian.leader`) — with API tables, examples, and cross-references
- `KNOWN_LIMITATIONS.md`: updated Lua supported APIs list to include `vim.obsidian.cursor.set`, `vim.obsidian.modeprompt.set`, `vim.obsidian.surround.set/del/add`, `vim.obsidian.leader.set/del/add`; updated surround section with custom pairs documentation and issue #36 reference

## [0.37.0] - 2026-07-06

### Added

- **`vim.obsidian.whichkey.add()` — batch which-key label configuration** — define multiple group and command labels in a single call, similar to Neovim's [which-key.nvim](https://github.com/folke/which-key.nvim) `wk.add()` syntax ([#27](https://github.com/saberzero1/motions/issues/27))
    - `vim.obsidian.whichkey.add({ { "<leader>f", group = "Find" }, { "<leader>w", desc = "Save" } })` — each entry uses `group` for prefix labels or `desc` for individual binding labels
    - Per-entry `context` field: `"editor"` (default) or `"global"` for non-editor which-key overlay
    - `mode` field accepted but reserved for future mode-scoped label support
    - Entries without a key string or without `group`/`desc` are silently skipped
    - Shorthand: `local wk = vim.obsidian.whichkey; wk.add({ ... })` for Neovim-familiar syntax
    - Plugin: `src/lua/api.ts` (`vim.obsidian.whichkey.add`), `src/lua/types.d.ts` (`luaL_len` type)

### Changed

- **Config file fallback chains** — vimrc and Lua config files are now resolved via a fallback chain instead of a single hardcoded path. The plugin searches the vault root for the first matching file. Custom path overrides still take priority.
    - **Vimrc chain** (8 candidates): `vimrc`, `.vimrc`, `init.vim`, `.init.vim`, `obsidian.vimrc`, `obsidian.vim`, `.obsidian.vimrc`, `.obsidian.vim`
    - **Lua chain** (5 candidates): `init.lua`, `.init.lua`, `obsidian.init.lua`, `.obsidian.init.lua`, `obsidian.lua`
    - Non-dotfile names (`vimrc`, `init.lua`) are preferred — Obsidian Sync skips dotfiles, and the `.obsidian.*` naming relied on a linter workaround
    - Settings UI now shows "Currently using: {path}" (resolved path) or "File not found" for invalid custom paths
    - Settings descriptions list the full fallback chain
    - Backward compatible: existing `.obsidian.vimrc` and `.obsidian.init.lua` files still work (they appear later in the chain)
    - Plugin: `src/vimrc/loader.ts` (`resolveVimrcPath`, `VIMRC_FALLBACK_PATHS`), `src/lua/loader.ts` (`resolveLuaConfigPath`, `LUA_FALLBACK_PATHS`), `src/settings.ts` (async path resolution display), `styles.css` (`.vim-motions-config-path-active`/`.vim-motions-config-path-error` classes)

### Documentation

- `docs/configuration/vimrc.md`: file location section rewritten with full fallback chain table
- `docs/configuration/lua-config.md`: file location section rewritten with full fallback chain table; added `vim.obsidian.whichkey.add()` to API summary table and Obsidian namespace section with `wk.add()` example
- `docs/configuration/settings.md`: custom path setting descriptions updated with fallback chain lists
- `docs/configuration/which-key.md`: added "Batch labels (`add()`)" section with Neovim-style `wk.add()` syntax, `local wk` shorthand tip, and reserved `mode` field callout
- `docs/guides/migrating-from-vimrc-support.md`: custom vimrc path section updated with fallback chain
- `KNOWN_LIMITATIONS.md`: updated supported Lua APIs list to include `vim.obsidian.whichkey.add()`

## [0.36.0] - 2026-07-06

### Added

- **`vim.obsidian.keymap` — global (non-editor) keymaps from Lua** — define key bindings for non-editor contexts (graph view, canvas, PDF viewer, file explorer) using a Neovim-style API
    - `vim.obsidian.keymap.set(lhs, rhs, opts?)` — create a global keymap with `:obcommand <id>` or `:<ex-command>` as RHS
    - `vim.obsidian.keymap.del(lhs)` — remove a global keymap
    - `desc` option auto-creates a label in the global which-key popup
    - Lua global keymaps override vimrc `gmap` on conflict (last-write-wins)
    - Survives settings changes and feature reloads via `luaGlobalMaps` persistence arrays
    - Plugin: `src/lua/api.ts` (`LuaGlobalKeymap` type, `onGlobalKeymap`/`onGlobalKeymapDel` callbacks)
- **`vim.obsidian.whichkey` — which-key labels from Lua** — set group and command labels for the which-key popup
    - `vim.obsidian.whichkey.set_group(key, label, opts?)` — name a which-key group by prefix
    - `vim.obsidian.whichkey.set_label(key, label, opts?)` — label an individual which-key binding
    - `context` option defaults to `"editor"`; use `{ context = "global" }` for non-editor which-key overlay
    - Previously only available via vimrc `whichkeygroup`/`whichkeylabel` and Settings UI
    - Plugin: `src/lua/api.ts` (`onWhichKeyGroupLabel`/`onWhichKeyCommandLabel` callbacks)
- **`vim.opt.guicursor` — cursor shapes from Lua** — set per-mode cursor shapes without `vim.cmd` passthrough
    - `vim.opt.guicursor = "n:block,i:bar,v:block,r:underline,o:underline"` — mode codes: `n`, `i`, `v`, `r`, `o`, `a` (all); shapes: `block`, `bar`, `underline`, `hollow`
    - Write-only (reading returns nil); invalid strings log a warning
    - Previously only available via vimrc `set guicursor=...`
- **Lua standard library utilities (`vim.tbl_*`, `vim.split`, `vim.inspect`, `vim.json`)** — 22 Neovim-compatible utility functions for table manipulation, string operations, debugging, and JSON serialization
    - Table utilities (12): `vim.tbl_deep_extend`, `vim.tbl_extend`, `vim.tbl_contains` (with predicate support), `vim.tbl_keys`, `vim.tbl_values`, `vim.tbl_map`, `vim.tbl_filter`, `vim.tbl_count`, `vim.tbl_isempty`, `vim.tbl_get`, `vim.list_extend`, `vim.deepcopy`
    - String utilities (6): `vim.split` (with `{plain, trimempty}` options), `vim.trim`, `vim.startswith`, `vim.endswith`, `vim.pesc`, `vim.stricmp`
    - `vim.inspect(value)` — human-readable table/value serialization for debugging init.lua configs
    - `vim.json.encode(value)` / `vim.json.decode(str)` — JSON serialization bridged to JavaScript's `JSON.stringify`/`JSON.parse`
    - Plugin: `src/lua/stdlib.ts`
- **Async primitives (`vim.schedule`, `vim.defer_fn`, `vim.uv` timers)** — Neovim-compatible async APIs for deferred execution and timer management
    - `vim.schedule(fn)` — defer function to next event loop iteration (useful for breaking recursive autocmd loops)
    - `vim.schedule_wrap(fn)` — returns a function that wraps `fn` with `vim.schedule`, passing all arguments
    - `vim.defer_fn(fn, timeout)` — defer function by `timeout` milliseconds, returns cancellable handle with `stop()`/`close()`/`is_closing()`
    - `vim.uv.new_timer()` — create timer with `start(delay, repeat, callback)`, `stop()`, `close()`, `is_closing()`, `is_active()`
    - `vim.uv.hrtime()` — high-resolution time in nanoseconds
    - `vim.uv.now()` — current time in milliseconds
    - `vim.loop` alias for `vim.uv` (Neovim backward compatibility)
    - All timers cleaned up on plugin unload (no leaked timeouts)
    - Plugin: `src/lua/timers.ts`
- **Buffer-local keymaps (`vim.keymap.set({ buffer = 0 })`)** — keymaps scoped to specific files, automatically swapped on editor/tab switch
    - `vim.keymap.set("n", "gd", handler, { buffer = 0 })` — keymap active only in the current file
    - `vim.api.nvim_buf_set_keymap(0, mode, lhs, rhs, opts)` / `nvim_buf_del_keymap(0, mode, lhs)` — low-level buffer keymap APIs
    - Combined with `BufEnter` autocmd for per-filetype keymaps (e.g., markdown-only bindings)
    - Buffer identity uses vault-relative file path; only `buffer = 0` (current file) is supported
    - Plugin: `src/lua/buffer.ts` (`BufferKeymapManager`)
- **Buffer content APIs (`nvim_buf_get_lines`, `nvim_buf_set_lines`)** — read and modify editor content from Lua callbacks
    - `vim.api.nvim_buf_get_lines(0, start, end, strict_indexing)` — 0-based, end-exclusive, `-1` for EOF
    - `vim.api.nvim_buf_set_lines(0, start, end, strict_indexing, replacement)` — empty table deletes lines
    - `vim.api.nvim_get_current_buf()` — returns `0` (current buffer)
    - `vim.api.nvim_buf_get_name(0)` — vault-relative file path
    - `vim.api.nvim_buf_line_count(0)` — total line count
    - `strict_indexing = true` errors on out-of-bounds; `false` clamps silently
- **4 new autocmd events** — `CursorMoved`, `CursorHold`, `BufWritePre`, `BufWritePost` (total: 12 events)
    - `CursorMoved` — fires after cursor moves (throttled via `vim-command-done` event)
    - `CursorHold` — fires after cursor is idle for `updatetime` ms (default 4000, configurable via `vim.opt.updatetime`)
    - `BufWritePre` / `BufWritePost` — fire before/after `:w`, `:wq`, `:x`, `:wall`, `:update` with vault-relative glob pattern support
    - `updatetime` option added to `KNOWN_SET_OPTIONS` for vimrc and `vim.opt` configuration
- **`vim.obsidian` namespace (`vim.ob` alias)** — Obsidian-specific APIs that don't exist in Neovim
    - `vim.obsidian.vault_name()`, `vim.obsidian.app_version()`, `vim.obsidian.plugin_version()`
    - `vim.obsidian.run_command(id)` — execute any Obsidian command by ID
    - `vim.obsidian.list_commands()` — table of `{id, name}` for all available commands
    - `vim.obsidian.open_file(path)` — open a vault file
    - `vim.obsidian.current_file()` — table `{path, name, extension, basename}` or nil
    - `vim.obsidian.vault_path()` — vault absolute path (desktop only)
- **Sandboxed `vim.env`** — environment variable proxy with curated values and user-defined storage
    - `vim.env.HOME` (vault path), `vim.env.VIM` (`"motions"`), `vim.env.TERM` (`"obsidian"`), `vim.env.OBSIDIAN_VERSION`
    - Custom variables: `vim.env.MY_VAR = "value"` — stored in memory, not in `process.env`
    - Unknown keys return nil
- **`vim.api.nvim_set_hl` — highlight group → CSS bridge** — customize plugin styling from Lua using Neovim's highlight API
    - `vim.api.nvim_set_hl(0, "EasyMotionTarget", { fg = "#ff5555", bold = true })` — change EasyMotion label colors
    - `vim.api.nvim_set_hl(0, "StatusLineNormal", { bg = "#282a36" })` — change status bar mode colors
    - 13 plugin-defined highlight groups: `EasyMotionTarget`, `EasyMotionShade`, `HintTarget`, `StatusLineNormal`/`Insert`/`Visual`/`Replace`/`VLine`/`VBlock`/`Command`/`Search`/`Select`/`VReplace`
    - User-defined groups generate `.vim-hl-GroupName` CSS classes
    - Supports: `fg`, `bg`, `sp`, `bold`, `italic`, `underline`, `undercurl`, `strikethrough`, `reverse`, `blend`, `link` (group inheritance), `default` (don't override), `update` (merge)
    - `vim.api.nvim_get_hl(0, { name = "group" })` — query highlight attrs
    - `vim.api.nvim_create_namespace(name)` — returns `0` (only global namespace supported)
    - Plugin: `src/lua/highlight.ts` (`HighlightManager`)
- **Enhanced `vim.notify` with log levels** — `vim.notify(msg, level)` routes messages by severity
    - `vim.log.levels`: `TRACE` (0), `DEBUG` (1), `INFO` (2), `WARN` (3), `ERROR` (4), `OFF` (5)
    - `ERROR`/`WARN` → Obsidian Notice + console; `INFO` → Notice; `DEBUG`/`TRACE` → console.debug only
    - `vim.notify_once(msg, level)` — deduplicates by message content

### Fixed

- **Space-leader global keymaps not matching keyboard input** — `replaceLeaderKey` converted `<leader>` to raw `" "` (space character), but `normalizeKeyEvent` in `GlobalKeyHandler` converted spacebar to `"<Space>"`. The key sequences never matched in `GlobalMappingRegistry.resolve()`. Fixed by adding `normalizeKeyString()` to convert raw special characters to angle-bracket notation (`" "` → `"<Space>"`) before storing keys in the registry. Affects both vimrc `gmap` and Lua `vim.obsidian.keymap.set` with space leader.
    - Plugin: `src/workspace/global-mapping-registry.ts` (`normalizeKeyString`), `src/main.ts` (`applyGlobalMaps`, `rebuildGlobalWhichKey`)
- **`vim.g.mode_prompt_*` reads returned nil after write** — the `__newindex` handler for mode_prompt keys called `onSettingOverride` but did not store the value in the `globals` Map. The `__index` handler's fallback to `globals.get(key)` returned `undefined`. Fixed by also storing in `globals` on write.
    - Plugin: `src/lua/api.ts` (vim.g `__newindex` handler)

### Changed

- **`vim.api` expanded from 6 to 16 functions** — `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, `nvim_buf_del_keymap` added alongside existing autocmd/augroup/user command functions
- **Autocmd events expanded from 8 to 12** — added `CursorMoved`, `CursorHold`, `BufWritePre`, `BufWritePost`
- **`vim.obsidian` namespace expanded** — added `keymap` and `whichkey` sub-namespaces for global keymaps and which-key labels. `vim.ob` alias includes the new sub-namespaces.

### Documentation

- `docs/configuration/lua-config.md`: comprehensive Lua API reference expansion — added vim.opt table with defaults and valid ranges, keymapping mode reference, autocmd event data reference (per-event `ev.data` fields), highlight group CSS variable mapping, Lua sandbox reference (available/unavailable libraries, instruction limits), `vim.fn.has()` completeness statement, mode prompt customization section, global keymaps section (`vim.obsidian.keymap`), which-key labels section (`vim.obsidian.whichkey`), `vim.opt.guicursor` option; fixed `buffer` option row (was "Not supported", now correctly documents `buffer = 0/true`); fixed `os`/`debug` library availability claims (not loaded by plugin); added `vim.stricmp`, `vim.env.MYVIMRC`, `underdouble`/`underdotted`/`underdashed` highlight attributes, TextYankPost `regname` field, highlight group case-sensitivity callout, buffer-local keymap accumulation warning, underline style limitation callout
- `docs/configuration/which-key.md`: added Lua examples for group labels (`vim.obsidian.whichkey.set_group`) and global which-key labels
- `docs/configuration/cursor-shapes.md`: added `vim.opt.guicursor` Lua section, removed "not supported" workaround note
- `docs/configuration/status-bar.md`: expanded Lua mode prompt examples to all 11 modes
- `docs/features/ex-commands.md`: added Lua example for custom commands via `nvim_create_user_command`
- `KNOWN_LIMITATIONS.md`: updated supported APIs list (added `vim.obsidian.keymap`, `vim.obsidian.whichkey`, `vim.opt.guicursor`), corrected `os`/`debug` library availability (not loaded by plugin sandbox)
- `AGENTS.md`: clarified fengari fork vs plugin library loading distinction (fork keeps `os`/`debug`, plugin does not load them)
- `README.md`: updated tagline and Lua configuration feature bullet with expanded API surface

## [0.35.0] - 2026-07-05

### Changed

- **Fengari Lua runtime switched to browser-only fork** — replaced upstream `fengari` (v0.1.5) with a [browser/Obsidian-only fork](https://github.com/saberzero1/fengari) that strips all Node.js dependencies. Eliminates community scanner warnings for "Direct Filesystem Access" (`require('fs')`), "Shell Execution" (`require('child_process')`), and "System Identity Information" (`process.env.USER`/`HOSTNAME`) that originated from fengari's bundled Node.js code paths (never executed at runtime but present in the bundle). ([DIFFERENCES.md](https://github.com/saberzero1/fengari/blob/master/DIFFERENCES.md))
    - Removed from fork: `liolib.js` (Lua `io` library), `loadlib.js` (Lua `package`/`require()` system), Node.js branches from `loslib.js`/`ldblib.js`/`lauxlib.js`/`lbaselib.js`/`luaconf.js`
    - Removed npm dependencies: `readline-sync`, `tmp` (kept `sprintf-js` for `string.format`)
    - Retained browser-safe `os` library functions: `os.date`, `os.time`, `os.difftime`, `os.clock`, `os.setlocale`
    - Retained `debug` library (minus `debug.debug()` interactive REPL): `debug.traceback`, `debug.getinfo`, `debug.sethook`, etc.
    - Fixed crash-on-mobile bug: upstream's unconditional `process.env.FENGARICONF` access at module load time throws `ReferenceError` on non-Electron platforms
    - Bundle impact: Fengari runtime reduced from +238KB to +201KB minified (-37KB / -15.5%), +179KB to +165KB gzipped (-14KB / -7.7%)
    - `print()` now always uses `console.log` (previously used `process.stdout.write` in Electron)
    - `luaL_loadfilex` stubbed to return error (plugin already disabled `loadfile`/`dofile` at Lua level)
    - Dependency pattern matches codemirror-vim fork: `"fengari": "https://github.com/saberzero1/fengari.git"` in `package.json`

## [0.34.0] - 2026-07-05

### Added

- **Lua configuration support (`.obsidian.init.lua`)** — optional Neovim-style Lua configuration using a sandboxed Fengari Lua 5.3 runtime. Provides conditional logic, function-based keymaps, and familiar `vim.keymap.set` / `vim.opt` syntax. Disabled by default — enable in **Settings → Vim Motions → Vimrc & key bindings → Enable Lua configuration**. ([#46](https://github.com/saberzero1/motions/issues/46))
    - `vim.opt.<name> = value` / `vim.o.<name>` — set any plugin option (backed by the same `KNOWN_SET_OPTIONS` map as vimrc `set` commands)
    - `vim.g.mapleader` / `vim.g.<name>` — set leader key and user variables
    - `vim.keymap.set(mode, lhs, rhs, opts)` — key mappings with string or function RHS, `desc` for which-key labels, `noremap`/`remap` control, multi-mode support
    - `vim.keymap.del(mode, lhs)` — remove mappings
    - `vim.cmd(string)` — execute ex commands (deferred until first editor focus)
    - `vim.vault_name()` — returns the current vault name for per-vault conditional config
    - `vim.notify(msg)` — show an Obsidian notification from Lua
    - `print(...)` — outputs to developer console
    - Sandbox: 6 defense layers — selective library loading (no `io`/`os`/`debug`/`package`), dangerous globals stripped (`load`/`dofile`/`loadfile`), no `fengari-interop`, instruction-count timeout via `lua_sethook` (1M instruction limit), custom environment table
    - Hybrid loading: settings and keymaps load immediately without an active editor; `vim.cmd()` calls are queued and executed on first editor focus
    - Override hierarchy: init.lua loads after vimrc — Lua values override vimrc on conflict
    - Settings: `configMode` dropdown (Lua + Vimrc / Lua only / Vimrc only / Settings only), `luaConfigPath` (custom file path)
    - Bundle impact: +238KB minified / +79KB gzipped (Fengari runtime)
    - Plugin: `src/lua/engine.ts` (sandbox + timeout), `src/lua/api.ts` (vim.\* bridge), `src/lua/loader.ts` (hybrid file loading), `src/lua/types.ts` (Fengari type declarations)
    - 12 Neovim golden comparison test cases (`lua-keymaps` suite), 17 e2e integration tests, 4 known deviations registered
- **`vim.fn.*` Neovim function subset** — 27 functions from Neovim's `vim.fn` namespace, scoped for Obsidian's vault-centric environment
    - **Config/detection** (13): `has`, `expand`, `fnamemodify`, `exists`, `localtime`, `strftime`, `filereadable`, `isdirectory`, `glob`, `mode`, `line`, `col`, `getline`
    - **String manipulation** (14): `tolower`, `toupper`, `trim`, `strlen`, `strwidth`, `stridx`, `strridx`, `strpart`, `substitute`, `nr2char`, `char2nr`, `split`, `join`
    - `vim.fn.has(feature)` — platform detection with 12 features: `mac`, `linux`, `win32`, `unix`, `mobile`, `desktop`, `ios`, `android`, `obsidian`, `obsidian-X.Y`, `nvim` (0), `vim` (0)
    - `vim.fn.expand('%')` — vault-relative file path with modifiers (`:t`, `:e`, `:r`, `:h`, `:p`)
    - `vim.fn.fnamemodify(path, mods)` — general-purpose path modifier with chainable modifiers (`:t:r`)
    - `vim.fn.filereadable(path)` / `vim.fn.isdirectory(path)` — vault-scoped, path traversal blocked
    - `vim.fn.glob(pattern)` — vault-scoped file matching
    - `vim.fn.line('.')` / `vim.fn.col('.')` / `vim.fn.getline('.')` — context-aware: return cursor position in function callbacks, return 0 at config-load time
    - `vim.fn.strftime(fmt)` — full C89 strftime implementation (`src/lua/strftime.ts`)
    - Unsupported `vim.fn.*` functions produce a helpful error listing available functions
    - `vim.fn.hostname()` / `vim.fn.getenv()` intentionally skipped (system fingerprinting concern)
    - Plugin: `src/lua/fn.ts` (VimFnCallbacks, function registry, `__index` dispatch), `src/lua/strftime.ts` (pure strftime utility)
- **`vim.api.nvim_create_user_command`**: define custom ex commands from Lua
    - String RHS: `vim.api.nvim_create_user_command("W", "w", {})`: simple aliases
    - Function RHS: `vim.api.nvim_create_user_command("Today", function(opts) ... end, {})`: Lua callback with `opts.args`
    - `vim.api` changed from error stub to partial namespace: unsupported `vim.api.*` functions give a helpful error listing `nvim_create_user_command` as available
    - Registered commands are immediately usable from the `:` ex command line
- **`nvim_create_autocmd` / `nvim_create_augroup`**: Neovim-compatible autocommand system with 8 events
    - Events: `InsertEnter`, `InsertLeave`, `ModeChanged`, `BufEnter`, `BufLeave`, `FocusGained`, `FocusLost`, `TextYankPost`
    - Augroups with `{ clear = true }` for safe config reloads
    - `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds` for management
    - ModeChanged supports `"old:new"` pattern with `*` wildcard
    - BufEnter/BufLeave support vault-relative path glob patterns
    - TextYankPost provides structured data: operator, regcontents, regtype, visual
    - Non-nested guard prevents infinite autocmd loops
    - Reentrancy protection: settings changes from callbacks defer reloadFeatures()
    - Plugin: `src/lua/autocmd.ts` (AutocmdManager class)
    - Fork: `vim-yank` signal added to yank/delete/change operators in `vim.js`
    - 16 unit tests, 2 e2e tests
- **Unit test infrastructure** — Vitest test runner for the Lua config modules
    - 49 unit tests across 6 files (smoke, sandbox, timeout, api, fn, strftime)
    - Runs in 250ms without Obsidian or browser
    - `npm run test:unit` / `npm run test:unit:watch` scripts
    - Obsidian module mocked via `test/unit/__mocks__/obsidian.ts`
    - CI: `.github/workflows/lint.yml` now runs unit tests on every push across all branches

### Changed

- **Consolidated configuration settings** — replaced two independent toggles (`enableVimrc` + `enableLuaConfig`) with a single **Configuration mode** dropdown (`configMode`):
    - **Lua + Vimrc** (default): both loaded, Lua overrides vimrc on conflict
    - **Lua only**: only init.lua loaded
    - **Vimrc only**: only .obsidian.vimrc loaded
    - **Settings only**: neither config file loaded
    - Notification logic consolidated: in Lua + Vimrc mode, only notifies when NEITHER file is found (no spam about missing vimrc when only using Lua, or vice versa)
    - Automatic migration from old boolean settings on first load
    - Custom path fields (init.lua path, vimrc path) remain independent and disable based on active mode

### Documentation

- `docs/configuration/lua-config.md`: full Lua configuration reference with supported APIs, all `vim.opt` options, `vim.fn.*` function tables (has features, expand modifiers, fnamemodify modifiers, exists expressions), mapping examples, conditional config examples, loading order, unsupported API documentation
- `docs/configuration/settings.md`: updated with `configMode` dropdown replacing old toggles, added Lua column to all settings tables
- `docs/configuration/index.md`: reordered — Lua configuration presented as primary method, vimrc as alternative
- `docs/configuration/vimrc.md`: added tip pointing to Lua configuration for advanced use cases
- `docs/configuration/which-key.md`: added Lua `desc` option integration for which-key labels
- `docs/configuration/cursor-shapes.md`: added `vim.cmd` workaround note for guicursor
- `docs/configuration/status-bar.md`: added Lua equivalents for status bar settings
- `docs/features/quality-of-life.md`: added Lua examples alongside vimrc
- `docs/features/workspace-navigation.md`: added Lua examples alongside vimrc
- `docs/getting-started/quickstart.md`: reordered — Lua shown as recommended configuration path
- `docs/reference/known-limitations.md`: Lua configuration section with supported/unsupported APIs, hybrid loading, vim.fn subset, bundle size
- `KNOWN_LIMITATIONS.md`: Lua configuration section with full details

## [0.33.0] - 2026-07-05

### Fixed

- **Obsidian commands only affect cursor line in visual-line mode (all invocation paths)** — the previous fix (0.31.0, fork-side) only covered keyboard events that vim didn't handle: it expanded the CM6 selection in the fork's `handleKey` during the bubble phase. However, Obsidian's `Keymap` registers its keydown listener on `window` in the **capture phase** (`addEventListener("keydown", handler, true)`), which fires before CM6's bubble-phase handler — so commands triggered via Obsidian hotkeys executed with cursor-only selection before the fork could expand it. Additionally, commands invoked via `executeCommandById` (command palette, toolbar buttons, other plugins) bypassed the DOM event path entirely. Spike test confirmed: `editor:toggle-numbered-list`, `editor:toggle-bullet-list`, `editor:toggle-bold`, and `editor:indent-list` all affected only 1 line regardless of invocation method. Fixed by wrapping `app.commands.executeCommand` via `around()` to temporarily expand the CM6 selection to the full linewise range from `vim.sel` before any Obsidian command executes, then restoring cursor-only after. Covers all invocation paths: hotkeys, command palette, toolbar, and programmatic `executeCommandById`. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Plugin: `src/vim/visual-line-command-fix.ts` — `installVisualLineCommandFix()` wraps `app.commands.executeCommand` using the existing `around()` utility (safe for multi-plugin stacking); installed in `onload()`, cleaned up in `onunload()`
    - Spike test: `test/specs/spikes/spike23-visual-line-hotkey-commands.e2e.ts` — 10 tests verifying direct command, hotkey, and selection state behavior

## [0.32.0] - 2026-07-05

### Added

- **Select mode (`gh`/`gH`/`g<C-h>`)** — Vim select mode where typing replaces the selection and enters insert mode. `gh` enters charwise, `gH` linewise, `g<C-h>` blockwise. `<C-g>` toggles between visual and select mode. `<BS>` deletes the selection. Matches Neovim behavior. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Fork: `enterSelectMode`, `toggleSelectMode`, `preventReselect` actions in `vim.js`; `selectMode` flag on vim state; `'select'` context for keymap dispatch with visual fallback; `gv` preserves and restores select mode via `lastSelection`
    - Fork: `:smap`, `:snoremap`, `:sunmap`, `:smapclear` ex commands for select-mode-specific mappings
    - Fork: `selectmode` option (`set selectmode=cmd` makes `v`/`V`/`<C-v>` enter select mode); `keymodel` option (accepted, shifted cursor key behavior deferred)
    - Plugin: status bar shows `SELECT`, `data-vim-mode="select"`, powerline CSS with `::after` triangle, Style Settings entries
    - 16 fork browser tests, 5 Neovim golden test cases, 3 e2e tests
- **Virtual Replace mode (`gR`)** — replace mode that operates on screen columns instead of byte positions. TAB-aware virtual column math with replace stack for `<BS>` restore. `<Insert>` toggles between virtual replace and insert mode. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Fork: `virtualReplaceChar` and `virtualReplaceBackspace` adapter methods in `cm_adapter.ts`; `virtualReplace` flag and `replaceStack` on vim state; `{mode: "vreplace"}` mode change event
    - Plugin: status bar shows `V-REPLACE`, `data-vim-mode="vreplace"`, powerline CSS, Style Settings entries
    - 10 fork browser tests, 3 Neovim golden test cases, 2 e2e tests
- **Visual Line / Visual Block mode indicators** — status bar now distinguishes `V-LINE` and `V-BLOCK` from `VISUAL`. Uses the fork's existing `subMode` event field. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Plugin: mode-tracker maps `subMode: "linewise"` → `visualLine`, `"blockwise"` → `visualBlock`; `data-vim-mode="v-line"` / `"v-block"`; powerline CSS + Style Settings entries
    - 3 e2e tests
- **Command-line and Search mode indicators** — status bar shows `COMMAND` when `:` prompt is open and `SEARCH` when `/` or `?` prompt is open. Detects dialog type via DOM text node inspection of the fork's `"dialog"` event. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Plugin: `dialogHandler` in mode-tracker with `preDialogMode` tracking for restoration on dialog close; `getDialogPrefix()` walks DOM child nodes; `data-vim-mode="command"` / `"search"`; powerline CSS + Style Settings entries
    - 5 e2e tests (including rapid `:` → `Esc` → `/` → `Esc` cycling)
- **Insert-Normal mode indicator** — status bar shows the configured insert-normal prompt (default `NORMAL`) when `<C-o>` is pressed in insert mode, then returns to `INSERT` after one command. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Plugin: mode-tracker detects `subMode.startsWith('ctrl-o')` → `insertNormal`; `data-vim-mode="insert-normal"`; powerline CSS
    - 2 e2e tests
- **All 11 mode prompts configurable** — mode prompt text for all modes (normal, insert, visual, v-line, v-block, replace, select, v-replace, command, search, insert-normal) is configurable via Settings UI and vimrc (`let g:mode_prompt_visual_line = "VL"`, etc.)
    - Plugin: `ModePrompts` interface expanded; settings UI entries for all modes; vimrc `VIMRC_MODE_MAP` with snake_case → camelCase mapping; `RELOAD_KEYS` updated
- **Configurable which-key popup delay** — the delay before the which-key popup appears is now configurable via **Settings → Vim Motions → Which-key hints → Which-key popup delay** or `set whichkeydelay=<ms>` (alias `wkd`) in vimrc. Range 0–2000ms, default 500ms. Set to `0` for instant display. Once the popup is visible, subsequent keystrokes update it instantly — the delay only applies to the initial appearance. Single-key commands that resolve immediately never trigger the popup regardless of delay setting.
    - `src/settings.ts`: added `whichKeyDelay: number` to `VimMotionsSettings` (default 500), added to `RELOAD_KEYS`, added number input control in "Which-key hints" group
    - `src/vimrc/loader.ts`: added `whichkeydelay` / `wkd` to `KNOWN_SET_OPTIONS` (number, 0–2000)
    - `src/ui/which-key.ts`: replaced hardcoded `SHOW_DELAY` with configurable `showDelay` constructor parameter; `onKeyPressGeneral` updates overlay immediately when already visible instead of restarting delay; extracted `showCompletionsIfPartial()` helper
    - `src/ui/global-which-key.ts`: same pattern — configurable delay, instant updates when overlay already visible
    - `src/main.ts`: passes `settings.whichKeyDelay` to both `WhichKeyOverlay` and `GlobalWhichKeyOverlay` constructors

### Fixed

- **`<C-o>` in replace mode returns to insert instead of replace** — `oneNormalCommand` now saves the pre-Ctrl-O mode state and returns to the correct mode (insert, replace, or virtual replace) after the single normal command. Uses `_suppressModeSignal` to prevent a spurious `{mode:"normal"}` event, emitting `{mode:"normal", subMode:"ctrl-o"|"ctrl-o-replace"|"ctrl-o-vreplace"}` instead. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Fork: `insertModeReturnArgs` on vim state; `_suppressModeSignal` flag in `exitInsertMode`
    - 5 fork browser tests, 2 Neovim golden test cases, 2 e2e tests
- **`R` mode `<BS>` does not restore original character** — regular replace mode now maintains a replace stack (same mechanism as virtual replace). `<BS>` restores the original character under cursor, matching Neovim behavior. Previously, `<BS>` only moved the cursor left. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Fork: `handleReplaceModeInput` pushes original chars to `replaceStack` before overwriting; BS pops and restores with explicit `setCursor` for correct positioning
    - 4 fork browser tests
- **Replace/vreplace character I/O only works through DOM events** — unified replace mode character handling from `index.ts` (DOM-only path) into `vim.js` (`handleReplaceModeInput`). `Vim.handleKey` is now authoritative for all replace-mode operations — programmatic dispatch, macro replay, and dot-repeat work correctly through both paths. ([#45](https://github.com/saberzero1/motions/issues/45))
    - Fork: `handleReplaceModeInput` in `vim.js` called from `handleKeyInsertMode` `match.type == 'none'` branch; `virtualReplaceChar`/`virtualReplaceBackspace` adapter methods; removed overwrite block and helpers from `index.ts`
    - 7 fork browser tests (overwrite, BS restore, dot-repeat, macro replay, Ctrl-H)

### Documentation

- `docs/configuration/status-bar.md`: lists all 11 mode indicators, all `data-vim-mode` attribute values, all CSS variables, all vimrc directives, fork mode requirement callout
- `docs/configuration/settings.md`: all 11 mode prompt settings with vimrc equivalents
- `docs/guides/style-settings.md`: all 20 powerline CSS variables (bg + fg for 10 modes)
- `docs/reference/keybindings.md`: select mode (`gh`, `gH`, `g<C-h>`, `<C-g>`, `gV`) and virtual replace (`gR`) sections
- `docs/reference/known-limitations.md`: select mode and virtual replace mode limitations
- `KNOWN_LIMITATIONS.md`: `selectmode=mouse` CM6 limitation, `selectmode=key`/`keymodel=startsel` deferred, East Asian Width, `gR` newline behavior
- `DIFFERENCES.md` (fork): 7 new sections covering select mode, virtual replace, replace stack, unified char handling, Ctrl-O fix, mapping commands, type changes

## [0.31.0] - 2026-07-04

### Fixed

- **Obsidian commands (Tab/indent, formatting toggles) only affect cursor line in visual-line mode** — when vim didn't handle a key in visual-line mode, the event propagated to Obsidian with a cursor-only CM6 selection. Obsidian's commands (`editor:indent-list`, `editor:toggle-bold`, etc.) only saw one line instead of the full visual selection. Fixed by temporarily expanding the CM6 selection to the full linewise range before the event propagates, then restoring cursor-only via microtask after Obsidian's command executes. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `handleKey` in `index.ts` now expands CM6 selection on unhandled keys during visual-line mode and restores cursor-only via `Promise.resolve().then()`

## [0.30.0] - 2026-07-04

### Added

- **User-configurable global key mappings (`gmap`/`gnoremap`/`gunmap`)** — non-editor key bindings (graph view, canvas, PDF, reading mode, file explorer, empty workspace) can now be customized via `.obsidian.vimrc`. Previously, all non-editor bindings were hardcoded. The `<leader>` key is shared with editor mappings. ([#43](https://github.com/saberzero1/motions/issues/43))
    - `gmap <leader>f :obcommand switcher:open` — bind `<leader>f` to open the quick switcher in non-editor views
    - `gnoremap <leader>s :sidebar left` — functionally identical to `gmap` (accepted for vim syntax familiarity)
    - `gunmap H` — remove the default `H → previous tab` binding (key propagates to Obsidian)
    - Right-hand side supports `:obcommand <id>` for Obsidian commands and `:<ex-command> [args]` for global ex commands
    - User bindings override defaults; `gunmap` removes any binding (user or default)
    - Count prefix support: `5j` scrolls 5 lines, `3gt` goes to tab 3 (matching existing behavior)
    - New files: `src/workspace/global-mapping-registry.ts` (registry with prefix-matching resolver), `src/workspace/global-defaults.ts` (default binding table)
    - Refactored `src/workspace/global-key-handler.ts` from 770-line hardcoded state machine to 255-line table-driven dispatch via `GlobalMappingRegistry`
    - E2E tests: `test/specs/gmap.e2e.ts` (12 tests), `test/specs/gmap-vimrc.e2e.ts` (9 tests)
- **Global which-key overlay** — non-editor key sequences now show a which-key popup after 500ms, displaying available completions. Pressing `<C-w>` shows `h`/`j`/`k`/`l`/`v`/`s`/`c`/`q`/`o` window commands. Controlled by the existing `whichKeyMode` setting (`off`/`leader`/`all`).
    - New file: `src/ui/global-which-key.ts` — `GlobalWhichKeyOverlay` class, shares CSS with editor which-key
    - Reuses `vim-motions-which-key` CSS classes from `styles.css` (no CSS changes needed)
    - Popout window support via `Document` parameter tracking
    - Dismiss on sequence completion, timeout, or focus change to editor
- **Global which-key labels (`gwhichkeylabel`/`gwhichkeygroup`)** — label global bindings for the non-editor which-key overlay, independent from editor which-key labels
    - `gwhichkeylabel <leader>f Open file` — shows "Open file" instead of the raw command ID
    - `gwhichkeygroup <leader> +leader` — groups `<leader>*` bindings under a named prefix
- **`:gmap` ex command** — lists all active global bindings with source (default/user) in a modal. Available in both editor and non-editor `:` command contexts.
- **`executeGlobalExCommand` helper** — exported from `global-ex-command.ts` for programmatic ex command dispatch without opening the modal UI

### Documentation

- `docs/configuration/vimrc.md`: added `gmap`/`gnoremap`/`gunmap`/`gwhichkeylabel`/`gwhichkeygroup` to supported commands table, added "Global key mappings" section with full syntax and examples
- `docs/features/workspace-navigation.md`: added "Customizing global bindings" section
- `docs/configuration/which-key.md`: updated modes to note non-editor overlay support, added "Global (non-editor) labels" section
- `docs/reference/keybindings.md`: added `:gmap` ex command, added customization note to non-editor bindings section

## [0.29.0] - 2026-07-03

### Fixed

- **Visual-line cursor lands inside widget decorations in Live Preview** — when entering visual-line mode (`V`) at a non-zero column (e.g., cursor on `a` in `- a`) and moving down to a line with a checkbox (`- [ ] d`), the cursor position `sel.head.ch` was preserved from the starting column. In Live Preview, `[ ]` is replaced by a checkbox widget via `Decoration.replace`; placing the cursor inside this replaced range caused the visual-line highlight to disappear. Fixed by always using column 0 for the cursor-only CM6 selection in visual-line mode, matching Neovim's behavior. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `updateCmSelection` in `vim.js` now uses `cm.setCursor(sel.head.line, 0)` instead of `cm.setCursor(sel.head.line, sel.head.ch)`
    - 2 new Neovim golden comparison test cases: `V` from mid-column + `j` + `d` with checkbox content, `V` from mid-column + `2j` + `y` cursor at col 0

### Documentation

- Added Quartz-powered documentation site at [saberzero1.github.io/motions](https://saberzero1.github.io/motions) with full feature reference, getting started guide, and changelog.

## [0.28.0] - 2026-07-03

### Fixed

- **Async motion callback exits visual-line mode** — when an EasyMotion async motion resolved in visual-line mode, the `.then()` callback called `updateCmSelection(cm)` outside of a `cm.operation()` context. With cursor-only CM6 selection, `handleExternalSelection` detected `visualMode && !somethingSelected()` and exited visual mode. Fixed by wrapping the callback's `updateCmSelection` call in `cm.operation()` with `isVimOp = true`, matching the protection used by all other vim operation entry points. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: async motion visual mode branch in `vim.js` now wraps `updateCmSelection` in `cm.operation()` with `isVimOp = true`
    - Test: `easymotion-visual.e2e.ts` updated to verify visual-line easymotion via register content (yank + `getRegisterContent`) instead of `getSelection()`, which returns empty with cursor-only CM6 selection
- **Visual line selection overlap in Live Preview** — visual-line mode (`V`) rendered both the plugin's custom full-line highlight decoration and the native CM6 `::selection` CSS simultaneously, causing a visible double-highlight. Fixed by adding a `.cm-vimVisualLine` class to the editor scrollDOM when in visual-line mode and extending the `::selection` transparency rule to suppress native selection rendering in that mode. Charwise (`v`) and blockwise (`Ctrl-V`) visual modes are unaffected. ([#41](https://github.com/saberzero1/motions/issues/41))
- **Visual-line cursor displacement over collapsed markup in Live Preview** — navigating with `V` + `j`/`k` on lines containing collapsed markup (`[[wikilinks]]`, `[text](url)`) caused Obsidian to uncollapse the hidden content, reflowing the line and making the cursor appear to need extra steps. Root cause: `updateCmSelection` set a spanning CM6 `EditorSelection` range across the full line content; Obsidian's Live Preview detects selection overlap with `Decoration.replace` ranges and reveals them. Fixed by setting a cursor-only CM6 selection (at `sel.head` position) in visual-line mode — the `linewiseVisualHighlight` ViewPlugin already provides the visual highlight independently from `vim.sel`, and operators (`y`/`d`/`c`) recompute their own selection at dispatch time. ([#41](https://github.com/saberzero1/motions/issues/41))
    - Fork: `updateCmSelection` in `vim.js` now sets `cm.setCursor(sel.head)` instead of a spanning range when `vim.visualLine` is true
    - Fork: `joinLines` action in `vim.js` now reads from `vim.sel` instead of `cm.getCursor('anchor'/'head')` in visual mode, fixing `V` + `J` regression from cursor-only selection
    - Fork: `replace` action in `vim.js` now reads from `vim.sel` instead of `cm.getCursor('start'/'end')` in visual mode, with line boundary expansion for visual-line; removed unused `selections` variable
    - Fork: `index.ts` adds Ctrl+C special-case that copies linewise text from `vim.sel` when `somethingSelected()` returns false in visual-line mode
    - Fork: `index.ts` adds `.cm-vimVisualLine` class toggle in `updateClass()`
    - Fork: `block-cursor.ts` extends `::selection` suppression CSS selector to include `.cm-vimVisualLine`
    - Plugin: `styles.css` overrides `.cm-vim-linewise-selection` with `var(--text-selection)` for theme alignment (already present from 0.27.0)
    - 6 new Neovim golden comparison test cases: `V+j+y` cursor position, `V+2j+d` multi-line delete, `Vk` upward selection, `Vjk` round-trip, `v→V` transition, `V→v` transition
    - 7 new e2e tests: visual-line yank with markup content, multi-line yank register verification, `gv` after visual-line yank, `v→V` and `V→v` mode transitions

## [0.27.1] - 2026-07-03

### Fixed

- **Custom vimrc path setting missing from Obsidian 1.13+ settings** — the "Custom vimrc path" text input was present in the legacy `display()` rendering but missing from the `getSettingDefinitions()` declarative API. On Obsidian 1.13+, users could not see or configure the custom vimrc path in settings. Added the `vimrcPath` text control to the "Vimrc & key bindings" group in `getSettingDefinitions()`, with `aliases` for settings search discoverability and a `disabled` predicate gated on `enableVimrc`. ([#34](https://github.com/saberzero1/motions/issues/34))

## [0.27.0] - 2026-07-03

### Added

- **Vimium-style hint actions in non-editor views** — hint mode now supports multiple actions via a key-tree dispatch when a non-editor view (graph, PDF, canvas, etc.) is focused. `f` activates (click/focus), `F` opens in a new pane, `yf` yanks the target's URL or text to clipboard, `df` closes the target tab or pane. Count prefix works: `3f` activates three targets sequentially. In editor context, `<leader><leader>h` (unchanged) triggers hints with Ctrl/Cmd modifier during label selection upgrading to open-in-new-pane.
    - `src/ui/hint-mode.ts`: refactored into action-dispatch architecture with `HintTarget` type classification (`link`/`pane`/`tab`/`button`/`input`/`generic`), four action functions (`hintActivate`/`hintOpenNew`/`hintYank`/`hintClose`), `createHintActions()` factory, count support via `requestAnimationFrame` recursion, modifier-based action upgrade, `el.isConnected` validation, clipboard fallback
    - `src/workspace/global-key-handler.ts`: added `Y_PENDING`/`D_PENDING` states to `SeqState` enum, `hintActions` constructor parameter, `f`/`F`/`y`/`d` dispatch in IDLE and COUNT states, `handleYPending`/`handleDPending` handlers, `chordText()` updates
    - `src/main.ts`: `registerHintMode()` → `registerHintActions()`, `hintModeAction` → `hintActions` field, stale hotkey closure fix (indirection pattern), `reloadFeatures()` reset, three new Obsidian commands
    - New Obsidian commands: `vim-motions:hint-open-new-pane`, `vim-motions:hint-yank`, `vim-motions:hint-close`
    - E2E tests: 10 new tests covering non-editor `f`/`F`/`yf`/`df`, modifier upgrade, escape, invalid sequence reset, command registration

### Fixed

- **Global key handler intercepts navigation keys in Obsidian settings modal** — `j`/`k`/`g`/`z`/`:` and other navigation keys were consumed by GlobalKeyHandler when the settings modal was open. Navigation keys are now suppressed when `.modal-container` is detected in the DOM via `isModalOpen()`. Hint actions (`f`/`F`/`yf`/`df`) still work in modals — they use a separate `shouldInterceptHints()` gate that does not check for modals.
- **Hint mode labels re-trigger instead of selecting label characters** — pressing `f` to activate hint mode, then typing a label character that is also `f`, would re-trigger hint mode via GlobalKeyHandler instead of being captured by the label selection handler. Fixed by adding an `isHintModeActive()` flag (exported from `hint-mode.ts`) that makes GlobalKeyHandler bail entirely during label selection.
- **Settings toggles not responding to hint activation** — Obsidian's toggle controls (`.checkbox-container`, a `<label>` element) required `pointerdown`/`pointerup` events before `click` to trigger the toggle handler. Added full pointer event sequence dispatch for generic element activation.
- **Settings dropdowns cycling to wrong element on Obsidian 1.13+** — Obsidian 1.13+ adds hidden `<select class="dropdown is-measuring">` shadow copies of every dropdown for layout measurement. These shadow selects have only 1 option and are positioned at the same coordinates as the real dropdown, causing hint labels to sometimes target the measurement copy. Fixed by filtering out elements with the `is-measuring` class during target discovery.
- **Settings controls require Escape before re-activating hints** — after activating a toggle or cycling a dropdown in the settings modal, focus remained on the control element, preventing GlobalKeyHandler from intercepting `f` for the next hint activation. Fixed by blurring the activated element (and any focused child) after activation when inside a `.modal-container`.
- **Dropdowns only focus but don't change value** — `<select>` elements cannot be programmatically opened in Chromium. Changed activation behavior to cycle to the next option value and dispatch a `change` event, giving immediate feedback instead of requiring manual Arrow key interaction.
- **Broadened form control selectors** — `STANDARD_SELECTORS` now includes `input:not([type="hidden"]):not([disabled])`, `textarea:not([disabled])`, and `select:not([disabled])` to ensure all visible form controls (text inputs, search bars, dropdowns) receive hint labels regardless of their Obsidian-specific parent structure. Removed redundant Obsidian-specific selectors that were subsets of the broader standard selectors. Changed `.setting-item-control .checkbox-container` to `.checkbox-container` to match toggles rendered by Obsidian 1.13+'s declarative settings API outside the traditional `.setting-item-control` parent.

### Changed

- **Scrolloff cap raised from 20 to 9999** — the `scrolloff` setting now accepts values up to 9999 (previously capped at 20), enabling the standard Vim pattern of `set scrolloff=999` to keep the cursor vertically centered while scrolling. The Settings UI control has been changed from a slider to a validated number input field. Affects all four validation points: Settings UI (structured + manual rendering), vimrc `set scrolloff=N` / `set so=N`, and the vim `defineOption` callback. The underlying CSS `scrollMargins` implementation was already uncapped. ([#40](https://github.com/saberzero1/motions/issues/40))
    - `src/settings.ts`: structured definition changed from `type: 'slider'` to `type: 'number'` with `max: 9999`; manual rendering changed from `.addSlider()` to `.addText()` with `type='number'`, `min='0'`, `max='9999'`, integer clamping, and fallback to default 5 on invalid input
    - `src/vimrc/loader.ts`: `scrolloff` and `so` option definitions updated from `max: 20` to `max: 9999`
    - `src/vim/options.ts`: `defineOption` callback validation updated from `n <= 20` to `n <= 9999`

### Documentation

- `KNOWN_LIMITATIONS.md`: added "Hint mode actions" section documenting the vimium-style key-tree, context split, modifier upgrade, target classification, settings gating, modal behavior, clipboard fallback, and stale target handling
- `KNOWN_LIMITATIONS.md`: updated "Global workspace navigation" supported keys to include hint actions (`f`/`F`/`yf`/`df`)
- `KNOWN_LIMITATIONS.md`: updated "Scrolloff line height assumption" section to document the raised cap and centered-cursor pattern
- `README.md`: updated hint mode section with vimium-style actions, non-editor key table, and new Obsidian commands
- `README.md`: updated workspace keyboard control table with hint action keys
- `README.md`: updated scrolloff range from 0–20 to 0–9999 in number options table and settings list; updated scrolloff description to mention `set scrolloff=999` for centered cursor

## [0.26.0] - 2026-07-02

### Fixed

- **Stale jumpList markers crash vim state on document switch** — `gg`, `G`, and other motions with `toJumplist: true` threw `RangeError: Invalid position N in document of length M` when switching between documents of different lengths (especially with PDF++ plugin). The global jumpList stored `Marker` objects with absolute offsets from the previous (longer) document. When `jumpList.add()` called `curMark.find()` on a stale marker, `posFromIndex` passed the old offset to `doc.lineAt()` without bounds checking, crashing through `processMotion` → `processCommand` → the `cm.operation()` try-catch, which wiped and re-initialized vim state. Subsequent keystrokes fell through to default CM6 text insertion. ([#18](https://github.com/saberzero1/motions/issues/18))
    - Fork: `posFromIndex` now clamps offset to `[0, doc.length]`, mirroring `indexFromPos` bounds checking
    - Fork: `Marker.find()` catches exceptions and returns `null` for stale markers (all callers already handle `null`)
    - Fork: `Marker.update()` catches `RangeError` from `mapPos()` when marker offset exceeds the changeset's starting document length, setting `offset = null`
    - Plugin: `reloadFeatures()` now calls `vim.resetKeymap()` to match `onload()` behavior, closing a defense gap where 33 settings-triggered reloads could corrupt the keymap without recovery
    - 5 new fork tests (posFromIndex clamping, negative offset, valid offset, marker doc-shrink, gg/G with stale jumpList)
    - 3 new plugin e2e tests (gg after doc switch, G after doc switch, gg/G after reloadFeatures on shorter doc)
- **Visual line mode (V) highlight doesn't match Obsidian theme** — the linewise selection highlight used hardcoded rgba colors via the fork's `EditorView.baseTheme`, which didn't adapt to Obsidian themes. The fork's `&light`/`&dark` CSS variants never activated because Obsidian doesn't add `cm-dark`/`cm-light` classes to `.cm-editor`. Added a CSS override in `styles.css` using `var(--text-selection)` (Obsidian's accent-derived selection color) at specificity 0-3-0, which beats both the fork's base theme (0-2-0) and Obsidian's code block background (0-2-1) without `!important`. ([#38](https://github.com/saberzero1/motions/issues/38))
- **Visual line mode highlight invisible inside code blocks** — the linewise selection `Decoration.line()` class competed with Obsidian's `HyperMD-codeblock-bg` class on the same `.cm-line` element. The code block background (applied at specificity 0-2-1 via `.cm-s-obsidian div.HyperMD-codeblock-bg`) won the specificity fight. Fixed by the same CSS override above — specificity 0-3-0 beats 0-2-1. ([#38](https://github.com/saberzero1/motions/issues/38))
- **Visual block select (Ctrl-V) on EOL displaces cursor rightward** — `makeCmSelection` in the fork's block mode branch added `+1` to `toCh` for inclusive selection without per-line clamping. When `$` (end-of-line) set `toCh` to the actual line length, `toCh + 1` pushed the cursor one position past the last character. Fixed by clamping `toCh` and `fromCh` to each line's length inside the per-line loop, since each line in a block selection has a different length. The `$` motion's `Infinity` return for `ch` is preserved upstream — clamping only happens at the selection-building stage. ([#38](https://github.com/saberzero1/motions/issues/38))
- **Formatting mark transaction filter corrupts visual selections** — the `EditorState.transactionFilter` in `formatting-mark-fix.ts` snapped cursor positions past formatting marks (`**`, `*`, `` ` ``, `~~`, `==`) for all selection changes, including visual mode selections. When extending a visual selection across formatted text in Live Preview, the filter's `snapRange` function modified the selection head to a formatting mark boundary, causing the selection to jump or collapse unexpectedly. Fixed by adding a `range.empty` guard that skips snapping for non-empty (visual) selections — the formatting mark correction is only needed for normal-mode cursor movement. ([#38](https://github.com/saberzero1/motions/issues/38))
    - Fork: `makeCmSelection` block mode now clamps `toCh`/`fromCh` per-line via `lineLength(cm, top + i)`
    - Plugin: `formatting-mark-fix.ts` skips `snapRange` when `range.empty` is false
    - Plugin: `styles.css` adds `.cm-editor .cm-line.cm-vim-linewise-selection` override with `var(--text-selection)` fallback chain
- **Visual block `$` delete cursor deviation** — `<C-v>jj$d` leaves cursor at `ch:1` instead of Neovim's `ch:0` after deleting to EOL. This is a pre-existing cursor-after-block-delete positioning issue in the fork (content is correct, only cursor position differs). Registered as a known deviation in `test/neovim/deviations.ts`.

### Documentation

- `KNOWN_LIMITATIONS.md`: updated "Formatting mark cursor correction in Live Preview" section to document the visual mode bypass
- `KNOWN_LIMITATIONS.md`: updated "Block visual mode" section test coverage count (13 → 15 golden tests)
- `DIFFERENCES.md` (fork): added "Block visual EOL cursor clamping" section documenting `makeCmSelection` per-line clamp
- `README.md`: updated recommended setup to mention theme-aligned visual line highlighting

## [0.25.0] - 2026-07-02

### Fixed

- **Vim engine settings changed via Settings UI not taking effect** — changing clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, insertmodeescapetimeout, or textwidth in **Settings → Vim Motions → Vim engine** only persisted the value to disk but did not push it to the vim engine via `vim.setOption()`. The setting appeared to save but had no effect until Obsidian was reloaded. The same settings worked correctly when set via `.obsidian.vimrc` because the vimrc loader explicitly calls `vim.setOption()`. Fixed by adding `vim.setOption()` calls to each vim engine setting's `onChange` handler in `src/settings.ts`. For clipboard and textwidth, the module-level state helpers (`setClipboardOption`, `setTextwidth`) are also called to match the vimrc loader's behavior. ([#39](https://github.com/saberzero1/motions/issues/39))

### Added

- **Style Settings integration** — powerline status bar colors and jump label colors are now customizable via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin. The `styles.css` file includes a `/* @settings */` block exposing 12 color pickers with separate light/dark mode defaults: powerline background and text for each vim mode (normal, insert, visual, replace), EasyMotion label background/text, and hint mode label background/text. The plugin triggers `parse-style-settings` on load/unload so Style Settings discovers the configuration automatically. Users without Style Settings are unaffected — the existing CSS variable fallback chain (`--vim-pl-*-bg` → Obsidian theme variable → hardcoded fallback) continues to work identically. ([#37](https://github.com/saberzero1/motions/issues/37))
- **Global workspace navigation** — workspace keyboard commands (`<C-w>h/j/k/l`, `gt/gT`, `H/L`, `:q`, scroll keys, etc.) now work across ALL Obsidian views, not just markdown editors. When a non-editor view (PDF, graph, canvas, image, backlinks, etc.) is focused, a capture-phase keydown handler intercepts workspace-relevant keystrokes and dispatches them via Obsidian's command system. When a CodeMirror editor is focused, codemirror-vim handles everything as before — no regression. ([#35](https://github.com/saberzero1/motions/issues/35))
    - **Navigation**: `<C-w>h/j/k/l` (focus pane), `<C-w>v/s` (split), `<C-w>c/q` (close), `<C-w>o` (close others), `gt/gT` (next/prev tab), `Ngt` (Nth tab), `H/L` (prev/next tab), `Ctrl-o/Ctrl-i` (history back/forward)
    - **Scrolling**: `j/k` (line scroll), `gg/G` (top/bottom), `Ctrl-d/u` (half page), `Ctrl-f/b` (full page), with count prefix support (`5j` = 5 lines)
    - **Ex command line**: `:` opens a standalone command modal with tab-completion for 34 globally-safe ex commands (`:q`, `:wq`, `:e {file}`, `:sp`, `:vs`, `:ob {cmd}`, etc.)
    - **Chord display**: pending keystrokes (`<C-w>`, `g`, `3`) shown in status bar via `setGlobalChord()` on `VimModeTracker`
    - **Sequence timeout**: multi-key sequences reset after 1000ms (matches vim's `timeoutlen`)
    - **Popout window support**: handler installed on all windows via `workspace.on('window-open')`
    - **Input suppression**: keys not intercepted in text inputs, contentEditable, modals, command palette, or IME composition
    - **Scroll target detection**: DOM tree-walking finds the largest scrollable container in arbitrary views (same approach as obsidian-vim-keynav)
    - New file: `src/workspace/global-key-handler.ts` — `GlobalKeyHandler` class with `shouldIntercept()`, `SequenceStateMachine`, scroll target detection
    - New file: `src/ui/global-ex-command.ts` — `GlobalExCommandModal` extending Obsidian's `SuggestModal`
    - `src/vim/mode-tracker.ts`: added `setGlobalChord(text)` method for non-editor chord display
    - `src/workspace/navigation.ts`: exported `executeCommand()` for reuse by global handler
    - E2E test suite `test/specs/global-nav.e2e.ts` with 15 tests covering navigation, scrolling, ex commands, input suppression, sequence timeout, and no-regression
- **`H`/`L` tab switching in non-editor views** — repurposes `H`/`L` (screen top/bottom in editors) for previous/next tab navigation when a non-editor view is focused, matching [obsidian-vim-keynav](https://github.com/guoang/obsidian-vim-keynav) conventions
- **`Ctrl-o`/`Ctrl-i` history navigation in non-editor views** — maps to `app:go-back` / `app:go-forward` when no editor is focused (in editor context, codemirror-vim uses these for the within-file jumplist)
- **Custom vimrc file path** — new setting to load vimrc from a custom vault path instead of the default `.obsidian.vimrc`. Useful when using Obsidian Sync, which skips dotfiles. The setting provides file-suggest autocompletion filtered to `*.vimrc` files in the vault. Leave empty to use the default `.obsidian.vimrc`. Changing the path triggers a full vimrc reload. ([#34](https://github.com/saberzero1/motions/issues/34))
    - `src/settings.ts`: added `vimrcPath: string` to `VimMotionsSettings` interface and defaults, added `vimrcPath` to `RELOAD_KEYS`, added file-suggest text input below the "Load .obsidian.vimrc" toggle
    - `src/ui/vimrc-file-suggest.ts`: new file — `VimrcFileSuggest` extends Obsidian's `AbstractInputSuggest<TFile>` to autocomplete vault files ending in `.vimrc`
    - `src/vimrc/loader.ts`: `getVimrcPath()`, `loadVimrc()`, and `resolveLeaderKey()` accept optional `customPath` parameter
    - `src/main.ts`: passes `settings.vimrcPath` to loader functions
    - E2E test suite `test/specs/vimrc-custom-path.e2e.ts` with 7 tests covering custom path loading, default fallback, non-existent path resilience, and non-dotfile path for Sync compatibility

### Changed

- **`<C-w>o`, `:only`, `:qa`, `:xall` now close ALL view types** — previously filtered by `getViewType() === 'markdown'`, leaving PDFs/images/etc. open. Now closes all tabs regardless of view type, matching Neovim behavior. Same change applied to `g<C-t>` (goto Nth tab) which now counts all leaves, not just markdown.

### Documentation

- `KNOWN_LIMITATIONS.md`: added "Global workspace navigation" section documenting Ctrl-d/f/b Obsidian hotkey prerequisite and scroll target limitations; updated "Vimrc hot-reload" section to note that vim engine settings now hot-reload via Settings UI
- `KNOWN_LIMITATIONS.md`: updated "Vimrc hot-reload" section to document custom vimrc path behavior
- `README.md`: updated workspace keyboard control section with global navigation commands, scrolling keys, and standalone ex command line; added hotkey unbinding note for Ctrl-d/f/b; updated Vim engine settings section to note immediate hot-reload
- `README.md`: updated powerline status bar description to mention Style Settings support; updated label colors description to mention Style Settings
- `README.md`: updated vimrc support section, settings list, and quality of life to document custom vimrc path setting
- `styles.css`: added `/* @settings */` block with Style Settings variable bindings; powerline CSS variables moved from local definitions to inline fallbacks for Style Settings compatibility

## [0.24.0] - 2026-07-01

### Changed

- **Formatting mark cursor fix rewritten** — replaced `RangeSetBuilder.prototype` monkey-patching with a CM6 `EditorState.transactionFilter` that corrects cursor positioning near formatting marks in Live Preview. The new approach walks the Lezer syntax tree to identify formatting mark nodes and snaps cursor endpoints that land inside mark ranges to the nearest boundary. Includes end-of-line boundary handling to prevent cursor oscillation when formatting marks extend to the line end (e.g. `**he**` with no trailing content). This eliminates conflicts with obsidian-latex-suite ([#32](https://github.com/saberzero1/motions/issues/32)) and fixes formatting marks being visible in live preview ([#33](https://github.com/saberzero1/motions/issues/33)). The `'always'` formatting mark mode has been removed (users are migrated to `'cursor'`).

### Added

- **Block visual insert (`I`/`A`), change (`c`/`C`)** — `CTRL-V` block visual mode now supports `I` (insert at left column), `A` (append at right column), `c` (change block), and `C` (change to EOL) with multi-cursor editing on all selected lines. Text appears on all lines in real-time as you type (unlike Neovim, where text only appears on the primary cursor until `<Esc>`). Short lines that don't reach the block column are skipped, matching Neovim behavior. Dot-repeat (`.`) works for block insert operations. Block visual delete (`d`), yank (`y`), paste (`p`/`P`), indent (`>`/`<`), replace (`r`), and case toggle (`~`) were already working.
    - Fork: `enterInsertMode` preserves `wasInVisualBlock` before `exitVisualMode` clears the flag
    - Fork: `selectForInsert` skips lines shorter than the block column instead of clipping
    - Fork: `operators.change` adds a `vim.visualBlock` path for block change and block change-to-EOL
    - Fork: `exitInsertMode` positions cursor at the block's left column via `blockInsertLeft` instead of the standard `ch - 1`, matching Neovim's cursor placement after block `A`
    - Fork: `makeCmSelection` block mode treats `fromCh === toCh` (zero-width block) the same as `fromCh < toCh`, fixing `C` on zero-width blocks
    - Fork: `repeatInsertModeChanges` uses `blockInsertLeft` for cursor placement after dot-repeat instead of hardcoded `+1`
- Neovim golden comparison tests for block visual: 13 golden test cases in `test/specs/vim-builtin/visual-block-golden.e2e.ts` covering insert, append, change, change-to-EOL, delete, case toggle, replace, short-line handling, block yank/paste, zero-width block C, zero-width block I, A cursor position, and upward selection
- Spike test suite `test/specs/spikes/spike-block-insert.e2e.ts` with 10 tests covering all block visual insert scenarios
- Command index entries: `CTRL-V_I`, `CTRL-V_A`, `CTRL-V_c`, `CTRL-V_C`, `q`, `@`, `@@`
- Neovim golden comparison tests for marks: 5 golden test cases in `test/specs/vim-builtin/marks-golden.e2e.ts` covering `ma`/`'a`, `` `b ``, `'.`, `''`, ` `` `
- Neovim golden comparison tests for macros: 5 golden test cases in `test/specs/vim-builtin/macros-golden.e2e.ts` covering `qa`/`@a`, `2@a`, `@@`, `3@a`, insert replay
- Expanded register golden tests: 3 new cases (`"Ayy` append, `"0p` numbered register, `"a`/`"b` independent) in `normal-yank-put` suite
- Expanded search/replace golden tests: 2 new cases (`:%s` global, `:2,3s` range) in `ex-commands-builtin` suite
- Formatting mark cursor golden tests: 3 new cases (`w` through `**`, `f` past `**`, `e` through backticks) in `normal-motions` suite

### Fixed

- **Vimrc `whichkeygroup`/`whichkeylabel` commands crash on load** — `defineEx('whichkeygroup', 'wkg', ...)` threw `Error: (Vim.defineEx) "wkg" is not a prefix of "whichkeygroup"` because `defineEx` requires the short form to be an actual starting substring of the command name, not an arbitrary abbreviation. Same issue for `whichkeylabel`/`wkl`. Fixed by changing the prefixes to valid substrings: `whichkeyg` and `whichkeyl`. User-facing vimrc syntax (`whichkeygroup`, `whichkeylabel`) is unchanged. The `set whichkeygrouping`/`set wkg` option alias (handled by a separate `KNOWN_SET_OPTIONS` path) was already correct and unaffected. ([#31](https://github.com/saberzero1/motions/issues/31))
- **Block visual mode deviations removed** — all `CTRL-V` block visual deviations in `test/neovim/deviations.ts` have been removed. Block insert/change now matches Neovim output with zero deviations: cursor position after `A` exit is correct, short lines are skipped, and zero-width blocks work for all operators.
- **Golden recording infrastructure** — `test/neovim/record-golden.ts` now sends `<Esc><Esc>` before each test case to reset Neovim to normal mode, preventing stale visual/insert mode state from leaking between test cases. This fixed 5 pre-existing incorrect golden values in `g-commands.json` (3 mode corrections) and `visual-mode.json` (1 mode correction, 1 cursor + mode correction).
- **Search dispatch in test wrapper** — `test/neovim/test-wrapper.ts` now detects `/pattern\n` and `?pattern\n` search sequences and dispatches the search + post-keys separately with a settle pause, improving reliability for search-dependent golden tests.

### Documentation

- `KNOWN_LIMITATIONS.md`: added "Block visual mode (CTRL-V) insert not supported (Fixed)" section
- `DIFFERENCES.md` (fork): added "Block visual insert (`I`/`A`), change (`c`/`C`)" section documenting all 6 fork changes
- `README.md`: added block visual insert/change to recommended setup section

## [0.23.0] - 2026-07-01

### Added

- **Declarative settings API (`getSettingDefinitions`)** — implemented Obsidian's 1.13.0+ declarative settings API with a version guard. On Obsidian 1.13.0+, plugin settings appear in Obsidian's global settings search and use the new declarative rendering pipeline. On older versions, the existing imperative `display()` method continues to work unchanged. No `minAppVersion` bump required.
    - `getSettingDefinitions()` returns all settings organized into groups (Vim features, Vim engine, Jump navigation, Status bar, Mode prompts, Cursor shapes, Vimrc & key bindings, Leader key bindings, Which-key hints, Which-key group/command labels, Advanced)
    - `getControlValue()`/`setControlValue()` overrides handle dot-notation keys for nested settings (`modePrompts.normal`, `cursorShapes.insert`), clear vimrc overrides on user change, and trigger `reloadFeatures()` for settings that require it
    - Vimrc-overridden settings are disabled via `disabled: () => isOverridden(key)` predicates
    - Complex sections (leader bindings, which-key group/command labels, hotkey recorder) use `render` callbacks delegating to the existing imperative rendering methods
    - `styles.css`: added `.vim-motions-hidden` utility class for render callback placeholder rows

### Documentation

- `README.md`: updated Settings section to note settings search compatibility on Obsidian 1.13.0+

## [0.22.0] - 2026-06-30

### Added

- **Mobile support** — the plugin is no longer desktop-only. Changed `isDesktopOnly` to `false` in `manifest.json`. EasyMotion and hint mode are disabled on mobile via `Platform.isMobile` guards because they depend on `activeDocument`/`activeWindow` (desktop-only Obsidian globals). All other features (core vim, text objects, navigation, workspace commands, vimrc, status bar, tables, surround) work on mobile. ([#30](https://github.com/saberzero1/motions/issues/30))
    - `src/main.ts`: added `Platform.isMobile` guards to skip EasyMotion and hint mode registration on mobile (in `onload`, `reloadFeatures`, and `reregisterLeaderFeatures`)
    - `eslint.config.mts`: added `@codemirror/*` and `@lezer/*` to `import/no-nodejs-modules` allow list — `eslint-plugin-obsidianmd` enables this rule when `isDesktopOnly: false`

### Fixed

- **EasyMotion big-WORD regex crashes on iOS < 16.4** — `BIG_WORD_START_RE` used a lookbehind assertion (`(?<=\s|^)\S`) which is not supported on iOS versions before 16.4. Rewritten as a two-pass scanner: first checks start-of-line for non-whitespace, then finds `\s\S` transitions mid-line. The `obsidianmd/regex-lookbehind` lint rule (enabled when `isDesktopOnly: false`) caught this. ([#30](https://github.com/saberzero1/motions/issues/30))
- **`import/no-nodejs-modules` false positives on `@codemirror/*` imports** — `eslint-plugin-obsidianmd` enables this rule when `isDesktopOnly: false` in `manifest.json`. The existing `import/core-modules` setting does not affect this rule's allow list. Added explicit `allow` entries for all `@codemirror/*` and `@lezer/*` packages to the rule configuration.
- **Configurable insert mode escape timeout** — `set insertmodeescapetimeout=N` (alias `imet`, range 100–5000ms, default: 1000ms) controls how long the plugin waits between keystrokes when matching the `insertmodeescape` sequence (e.g. `jk`). Matches Neovim's `timeoutlen` default of 1000ms. Previously hardcoded at 200ms — too tight for normal typing. Configurable via vimrc, Settings UI (**Settings → Vim Motions → Vim engine → Insert mode escape timeout**), or runtime `Vim.setOption('insertmodeescapetimeout', 500)`. ([#31](https://github.com/saberzero1/motions/issues/31))
- **Vimrc ↔ Settings parity** — all plugin settings are now configurable via `.obsidian.vimrc` in addition to the Settings UI. When vimrc is enabled (the default), vimrc values override the corresponding Settings UI values. Settings overridden by vimrc are shown as disabled controls in the settings tab with a note indicating the vimrc directive that set them (e.g., "Set by vimrc: `set scrolloff=10`").
    - **Boolean feature toggles** via `set`/`set no`: `textobjects`, `navigation`, `hardwrap`, `listcontinuation`, `tablenav`, `workspacenav`, `easymotion`, `easymotiondimming`, `hintmode`, `statusbar`, `chorddisplay`, `powerline`
    - **Number options** via `set <option>=<value>`: `scrolloff` (0–9999), `scanlimit` (5–200), `labelfontsize` (10–20)
    - **String options**: `easymotionlabels`, `hintlabels`
    - **Enum options**: `tablewidget` (off/cursor/always), `whichkey` (off/leader/all), `whichkeygrouping` (flat/grouped)
    - **Mode prompt customization** via `let g:mode_prompt_normal = "N"` (and insert/visual/replace)
    - **Which-key group labels** via `whichkeygroup <leader>t Table` — name key prefix groups in the which-key popup
    - **Which-key command labels** via `whichkeylabel <leader>w Save file` — describe individual bindings in the which-key popup
    - **Reverse-direction settings** — clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, and textwidth now have Settings UI controls (previously vimrc-only)
    - **Priority rule**: vimrc values override Settings UI values when `enableVimrc` is true. Overrides are in-memory only — the on-disk settings file always reflects UI-set values. Changing an overridden setting in the UI clears the override for the current session.
    - **List merge**: which-key group labels and command labels from vimrc are merged with labels configured in Settings. Vimrc entries appear as read-only rows; the "Add" button remains active for user additions. Vimrc wins on conflict.
    - **`source` directive fix**: settings and `guicursor` in sourced vimrc files now propagate correctly (pre-existing bug where `onCursorShapeChange` was not passed to recursive `loadVimrcFile` calls)
    - **`vimrcLoading` flag fix**: the flag is now reset to `false` after successful vimrc load, enabling runtime `:set` commands to trigger immediate `reloadFeatures()`
- **Vimrc `set` command routing** — all known `set` options are now handled directly in the vimrc loader via a `KNOWN_SET_OPTIONS` mapping table, calling `onSettingOverride` directly instead of relying on `defineOption` callback dispatch through `vim.handleEx`. This ensures reliable settings override regardless of codemirror-vim initialization order. Unknown options fall through to `handleEx` for forward compatibility.
- **Spurious `defineOption` callback prevention** — `registerVimOptions` now uses a `registered` flag to prevent `defineOption` callbacks from firing during initial option registration (codemirror-vim calls `setOption(name, defaultValue)` internally during `defineOption`). Without this guard, every option with a truthy default would spuriously populate `vimrcOverrides` and trigger `reloadFeatures` during plugin startup.
- E2E test suite `test/specs/vimrc-settings.e2e.ts` with 11 tests covering boolean/number/string/enum option overrides, mode prompts, which-key labels, override tracking, and combined overrides
- **`set insertmodeescape=jk` not working (frame-perfect timing required)** — the `InsertEscapeHandler` listened to `vim-keypress` events, which only fire for keys processed by codemirror-vim as vim commands. In insert mode, regular character keys bypass vim entirely and go through CM6's text input pipeline — the handler never saw them. Rewrote to use DOM `keydown` events on the editor element, correctly intercepting keystrokes in insert mode. Also fixed the `insertmodeescape` vim option not storing its value for `getOption()` retrieval (callback returned `undefined` instead of the stored value). ([#31](https://github.com/saberzero1/motions/issues/31))
- **`dk` not deleting in operator-pending mode** — `dk` (delete current and previous line) was a no-op because `tableAwareMoveUp` was registered with `context: 'normal'`, causing it to be filtered out in operator-pending mode. CM Vim's keymap search then failed to fall through to the default `k` motion. Removed the context restriction since the motion already handles operator-pending mode internally via its `hasOperator` check.
- **Cursor snaps to formatting mark boundary in Live Preview** — placing the cursor inside formatted text (`*italic*`, `**bold**`, `` `code` ``, `~~strike~~`, `==highlight==`) would snap to the delimiter boundary instead of the intended position. Obsidian's Live Preview uses `Decoration.replace({})` to hide formatting marks on inactive lines, creating zero-width gaps that cause CM6's position mapping to collapse. Originally fixed by intercepting `Decoration.replace({})` via `RangeSetBuilder.prototype.add` patching. Later replaced with a CM6 `EditorState.transactionFilter` approach (see [Unreleased] section) due to conflicts with obsidian-latex-suite.
- **`%` bracket matching skips brackets in strings and comments** — the fork's `scanForBracket` fallback now calls `getTokenTypeAt()` for each bracket candidate and skips brackets inside `"string"` or `"comment"` tokens. Previously, positional stack counting would match a bracket inside a string literal. Note: in Markdown mode, Lezer does not classify double-quoted text as string tokens, so this primarily benefits languages with proper syntax trees.
- **`<<`/`>>` indent respects `shiftwidth` and `expandtab`** — the fork's indent operator now reads the vim options `shiftwidth` and `expandtab` (via `getOption()`) before falling back to CM6's `tabSize` and `indentWithTabs`. When `set shiftwidth=2` or `set expandtab` is set in `.obsidian.vimrc`, the indent operator uses those values for both visual-block and line-by-line indentation.
- **`V` linewise visual cursor at end of line instead of column 0** — linewise visual mode (`V`, `Vj`, etc.) now positions the cursor at column 0 of the head line, matching Neovim. The fork's `makeCmSelection` was setting `head.ch = lineLength(line)` for display, which placed the cursor at the end of the line. A `ViewPlugin` with `Decoration.line` now provides the full-line visual highlight independently of the CM6 selection head position.
- **Vimrc map re-application** — vimrc key mappings are now re-applied 200ms after initial load as a safety net against CM Vim initialization timing. If the initial `applyVimrcMaps` call runs before the CM6 vim extension has fully settled, the delayed retry ensures mappings take effect.

### Changed

- **`minAppVersion` bumped to 1.2.3** — required for `setDisabled()` API on settings controls (used to disable vimrc-overridden settings in the UI). Obsidian 1.2.3 was released March 2023.

### Documentation

- `KNOWN_LIMITATIONS.md`: replaced "Desktop only" section with "Mobile support" section documenting `Platform.isMobile` guards and feature-by-platform compatibility matrix
- `README.md`: updated Requirements from "Desktop only" to "Desktop and mobile" with link to known limitations
- `KNOWN_LIMITATIONS.md`: added "Insert mode escape" section documenting the `keydown`-based handler, configurable timeout, and the `vim-keypress` event limitation; updated `vi*` single-character status to fixed via formatting mark cursor correction; updated `%` + strings to note Lezer limitation in Markdown; updated `<<` unindent entry to note fork fix; removed `V` linewise cursor deviation; updated `nmap L $` section with investigation findings; added "Formatting mark cursor correction" section
- `README.md`: added `insertmodeescapetimeout` to number options table and vimrc example; added insert mode escape timeout to settings list
- `DIFFERENCES.md` (fork): added sections for `scanForBracket` string/comment awareness, indent operator `shiftwidth`/`expandtab` support, linewise visual cursor positioning with decoration-based highlight

## [0.21.2] - 2026-06-29

### Fixed

- **Plugin fails to load when built-in Vim mode is enabled** — three fork-only API methods were called unconditionally, but do not exist on Obsidian's built-in Vim API. When built-in Vim mode is enabled (or when another plugin pre-installs `window.CodeMirrorAdapter.Vim` with the built-in API), `getVimApi()` returns the built-in Vim object and the calls throw `TypeError: … is not a function`. Added `typeof` guards to all three call sites and marked the methods as optional in the `VimApi` type definition. ([#29](https://github.com/saberzero1/motions/issues/29))
    - `vim.resetKeymap()` in `onload()` — prevented the plugin from loading entirely
    - `vimApi.clearInputState(cm, 'pane-switch')` in the `active-leaf-change` handler — crashed on every tab switch when a partial key buffer was pending
    - `this.vim.removeMapCommand(reg.keys)` in `VimRegistration.removeRegistration()` — crashed during plugin unload or feature toggle when cleaning up `mapCommand` registrations

## [0.21.1] - 2026-06-29

### Fixed

- **Space-as-leader key mappings not matching in codemirror-vim** — `Vim.map(' j', 'gj')` and `Vim.mapCommand(' w', ...)` stored literal space in the keymap (`' j'`), but `vimKeyFromEvent` produces `'<Space>'` on key press. The `commandMatch` string comparison never found a match, so leader-prefixed sequences silently failed. The fork now normalizes literal spaces to `<Space>` in `_mapCommand` (both `keys` and `toKeys`), `unmap()`, and `removeMapCommand()`. Existing angle-bracket groups (`<C-Space>`, `<S-Space>`) are preserved. This is the root-cause fix for the space-as-leader issue — the 0.21.0 plugin-side fix (`unmapDefaultBinding` centralization) was necessary but not sufficient without this keymap normalization. ([#21](https://github.com/saberzero1/motions/issues/21))
- **Vimrc map commands registered twice** — `nmap`, `nnoremap`, and other map commands in `.obsidian.vimrc` were processed once correctly via `deferredMaps` (the plugin's own parser) and then a second time via `vim.handleEx()` (codemirror-vim's ex command parser). The `handleEx` path splits arguments on whitespace, so `nmap <leader>j gj` with space as leader became `nmap j gj` — a bare `j → gj` mapping without the leader prefix. This double-registration was masked for non-space leaders (comma, backslash) because whitespace splitting doesn't affect those characters. Added `continue` after the `deferredMaps.push()` block, matching the pattern used by all other handled command types (`let`, `source`, `set`). ([#21](https://github.com/saberzero1/motions/issues/21))

### Documentation

- `DIFFERENCES.md` (fork): added "Key string normalization for `map`/`mapCommand`" section documenting `normalizeKeyString` and the `_mapCommand`/`unmap`/`removeMapCommand` normalization points
- `KNOWN_LIMITATIONS.md`: updated "EasyMotion leader key conflict" fixed section with fork-side key normalization details

## [0.21.0] - 2026-06-29

### Added

- **Smart list continuation on `o`/`O`** — pressing `o` or `O` on a Markdown list line now automatically continues the list marker on the new line. Supports unordered lists (`- `, `* `, `+ `), ordered lists (`1. `, `1) `), task lists (`- [ ] `, `- [x] `), ordered task lists (`1. [ ] `), custom checkbox states (`- [!] `, `- [?] `, `- [/] `, etc.), indented lists, blockquote lists (`> - `), and nested blockquotes (`> > - `). Ordered lists increment the number for `o` (below) and keep the same number for `O` (above). Checked tasks always continue with an unchecked `[ ] `. Lines inside fenced code blocks are excluded. Controlled by **Settings → Vim Motions → Smart list continuation on o/O** (on by default). Disable for plain Neovim behavior.
    - Fork: added `getAction(name)` API to the `vimApi` object for action introspection, enabling the save/restore pattern for built-in action overrides
    - Plugin: added `defineActionOverride` method to `VimRegistration` that captures the original action before overriding and restores it on plugin unload — ensuring `o`/`O` revert to default vim behavior when the plugin is disabled
- Fork test count: 1690 (up from 1686, 4 new `getAction` API tests)
- E2E test suite `test/specs/open-line-list.e2e.ts` with 35 tests covering all list types, indentation levels, blockquotes, nested blockquotes, code block exclusion, undo, and edge cases

### Fixed

- **`O` on first line after frontmatter behaves like `o`** — pressing `O` on the first content line below YAML frontmatter inserted the new line into the frontmatter region (swallowed by Obsidian's properties UI) instead of above the current line. Fixed in both the fork and the plugin:
    - Fork: `newLineAndEnterInsertMode` in `vim.js` compared `insertAt.line === cm.firstLine()` — always false when frontmatter is present. Now scans past `---`-delimited frontmatter to find the first editable line and uses `insertAt.line <= firstEditable` as the boundary check. The insertion point uses `{ line: insertAt.line, ch: 0 }` instead of hardcoded `firstLine()`, so it works for all line types (plain text, headings, etc.) with or without frontmatter.
    - Plugin: the smart list continuation override in `open-line.ts` had the same `curLine === cm.firstLine()` issue. Added `firstEditableLine()` helper with the same frontmatter scan, changed the boundary check to `curLine <= firstEditableLine(cm)`, and updated the insertion point to `{ line: curLine, ch: 0 }`.
- E2E regression tests for `o`/`O` with frontmatter: `O` on unordered/ordered/task list after frontmatter inserts above, `o` after frontmatter inserts below, `O` on non-list line after frontmatter inserts above, `o` on non-list line after frontmatter inserts below, `O` on second line after frontmatter uses normal insertion path
- **`gk` on wrapped line after frontmatter jumps straight to properties** — when the first line below the frontmatter wraps across multiple display lines, `gk` now correctly navigates through the wrapped display lines before entering the properties panel. Previously, the `stuckAtBoundary` check in the fork's `findPosV` treated display-line movement within a wrapped line as "stuck" (same document line) and immediately fired `focusBefore`. The check now also verifies that the cursor offset truly didn't change (`range.head === startOffset`), distinguishing "cursor moved to a higher display line within a wrapped line" from "cursor is truly stuck at the frontmatter boundary." ([#25](https://github.com/saberzero1/motions/issues/25))
- **`let mapleader = " "` (space) not working as leader key** — space as leader now works regardless of which features are enabled. The default `<Space>` → `l` binding in codemirror-vim's keymap consumed the space keystroke before leader-prefixed sequences could accumulate. Previously, `unmapDefaultBinding(leader)` was only called inside `registerEasyMotion()`, so the fix only applied when EasyMotion was enabled. The plugin now unmaps the leader key's default binding centrally — after vimrc loading, in `reregisterLeaderFeatures()`, and in `reloadFeatures()` — so any key used as leader (space, comma, semicolon, etc.) works for all leader-dependent features (table manipulation, hint mode, settings leader bindings) even when EasyMotion is disabled. ([#21](https://github.com/saberzero1/motions/issues/21))
- **Mislabeled "space as leader" e2e test** — the `describe('space as leader')` test block was loading `let mapleader = ","` instead of `let mapleader = " "`, making it a duplicate of the comma test rather than a true space leader test. Fixed to use space, providing actual cross-platform regression coverage.
- E2E regression tests for `gk` wrapped-line frontmatter edge case: `gk` navigates display lines on wrapped first content line, `gk` enters properties on non-wrapping first content line, `k` enters properties from first content line

### Changed

- **Settings tab reorganized** — settings are now grouped under section headings for easier navigation: **Vim features** (text objects, structural navigation, hard-wrap, smart list continuation, table navigation, table widget mode, workspace navigation), **Jump navigation** (EasyMotion, hint mode, shared label font size), **Status bar** (mode indicator, chord display, powerline, mode prompts), **Cursor shapes**, **Vimrc & key bindings** (vimrc toggle, leader key bindings), **Which-key hints** (mode, grouping, group labels), **Advanced** (scrolloff, multi-line scan range). Previously, settings appeared as an undifferentiated list with only a few headings.
- **EasyMotion label characters** — now exposed as a dedicated text field in the Jump navigation settings section. Previously only configurable by knowing the default value.

### Documentation

- `KNOWN_LIMITATIONS.md`: added "Smart list continuation and frontmatter" section documenting the `O` boundary fix
- `DIFFERENCES.md` (fork): added "Frontmatter-aware `O` (open line above)" section documenting the `newLineAndEnterInsertMode` fix
- `README.md`: updated smart list continuation description to mention frontmatter awareness
- `README.md`: updated settings list to reflect new section grouping and ordering
- `KNOWN_LIMITATIONS.md`: updated "Properties navigation" section with wrapped-line `stuckAtBoundary` edge case fix
- `DIFFERENCES.md` (fork): updated "Properties navigation" section with `range.head === startOffset` guard

## [0.20.0] - 2026-06-29

### Fixed

- **`let mapleader = ","` (comma) and other keys with default Vim bindings not working as leader for EasyMotion** — `unmapDefaultBinding` now passes `{ includeDefaults: true }` to `vim.unmap()`, so built-in codemirror-vim bindings (e.g. `,` → `repeatLastCharacterSearch`, `;` → forward repeat) are actually removed before registering EasyMotion `mapCommand` multi-key sequences. Previously, `vim.unmap()` silently skipped `_isDefault` keymap entries, meaning the default single-key binding consumed the first keystroke before the multi-key sequence (e.g. `,,w`) could accumulate. Space as leader was unaffected because the default `<Space>` binding uses angle-bracket notation which doesn't collide with literal space in `commandMatch`. ([#6](https://github.com/saberzero1/motions/issues/6))
- **`gg`/`G` and other keymaps intermittently stop working** — comprehensive vim state hardening across the codemirror-vim fork and plugin to prevent keymaps from breaking until app reload. Root causes identified and fixed: stale normal-mode key prefix state persisting across focus changes, global singleton keymap corruption via `unmap()` removing default entries, incomplete `leaveVimMode()` cleanup leaking insert-mode listeners, and async motion race conditions. ([#18](https://github.com/saberzero1/motions/issues/18))
    - **Fork: blur handler resets partial key prefixes** — the CM6 ViewPlugin now registers a `blur` listener on `contentDOM` that calls `clearInputState()` when the editor loses focus in normal mode. A stale prefix like `g` no longer persists across tab switches or modal opens, preventing the next keystroke from being silently swallowed.
    - **Fork: `leaveVimMode()` cleanup hardened** — now removes insert-mode `change`/`keydown` listeners if the editor was destroyed while in insert mode, clears the global `lastInsertModeKeyTimer`, clears `virtualPrompt`, and resets `inputState` before nulling `cm.state.vim`.
    - **Fork: default keymaps protected from `unmap()`** — default keymap entries are tagged with `_isDefault` and a frozen snapshot is stored at module init. `unmap()` now skips default entries unless explicitly requested. New `Vim.resetKeymap()` API restores defaults from the snapshot while preserving user mappings. `mapclear()` updated to use the `_isDefault` flag instead of fragile index-based partitioning.
    - **Fork: async motion generation tracking** — `_commandGeneration` counter on vim state prevents stale async motion callbacks from executing after a newer command has already run. Protects EasyMotion operator-pending mode (`d` + easymotion) from race conditions.
    - **Plugin: pane-switch state reset** — `active-leaf-change` handler now clears pending vim input state on all editors when switching panes, preventing partial commands from leaking across editors.
    - **Plugin: `resetKeymap()` on load** — calls `Vim.resetKeymap()` during plugin `onload()` to ensure a clean keymap baseline on plugin enable/reload, recovering from any prior corruption in the same app session.

### Added

- **Which-key leader grouping** — leader key bindings in the which-key overlay are now grouped by prefix key, matching Neovim's which-key plugin behavior. When grouping is enabled (default), pressing the leader key shows collapsed groups (e.g. `t` → `Table (+11)`, `\` → `EasyMotion (+17)`) instead of listing every binding individually. Pressing a group key drills down to show only bindings within that group. Configurable via **Settings → Vim Motions → Which-key leader grouping** (grouped / flat). ([#27](https://github.com/saberzero1/motions/issues/27))
    - Groups are sorted first in the overlay, followed by ungrouped single-key bindings
    - Group rows are visually distinct (accent color, italic) via the `.vim-motions-which-key-group` CSS class
    - Grouping applies to all completions in "all partial keys" mode, not just leader-scoped bindings — any multi-key prefix (`g`, `z`, `[`, `]`, custom mappings) can be grouped
    - Drill-down works in both "leader key only" and "all partial keys" which-key modes
- **Which-key group labels** — configurable names for key groups in the which-key overlay. Prefix keys can be labeled (e.g. `\t` → `Table`, `gr` → `LSP`) instead of showing the generic `+N keys` text. Built-in features register default labels (Table, EasyMotion) that can be overridden. Labels support `<leader>` token expansion (e.g. `<leader>t` resolves to the actual leader key + `t`). Configurable via **Settings → Vim Motions → Which-key group labels**.
- E2E test suite `test/specs/vim-state-hardening.e2e.ts` with 7 tests: blur prefix recovery, `gg`/`G` after plugin reload, keymap protection via `unmap()`, `resetKeymap()` recovery after force-unmap, `leaveVimMode` cleanup from insert mode
- Fork unit tests: 10 new tests for async motion generation tracking (superseded motion discarded, superseded delete discarded), keymap protection (`unmap` skips defaults, `unmap` removes user mapping preserving default, `unmap gg` preserves default, `resetKeymap` restores after force-unmap, `resetKeymap` preserves user mappings, `mapclear` preserves defaults), `leaveVimMode` cleanup (clears input state, cleanup from insert mode)
- Fork test count: 1672 (up from 1660)

### Documentation

- `DIFFERENCES.md` (fork): added sections for blur handler, `leaveVimMode` cleanup hardening, default keymap protection (`_isDefault` tagging, `resetKeymap()`, `mapclear()` update), async motion generation tracking, `clearInputState` API exposure
- `KNOWN_LIMITATIONS.md`: added "Vim state hardening" section documenting the multi-layered defense against intermittent keymap breakage
- `README.md`: added "Improved vim state reliability" bullet to recommended setup section

## [0.19.0] - 2026-06-27

### Fixed

- **`k`/`gk` do not enter frontmatter navigation** — both `k` and `gk` now enter the properties panel when the cursor is at the top of a note. Two fixes: (1) the fork's `moveByDisplayLines` was missing the `focusBefore` check that `moveByLines` already had, and (2) the fork's `findPosV` frontmatter detection only triggered when the cursor moved into the frontmatter region (`pos.line < start.line`), but when the properties widget replaced the frontmatter lines, the cursor couldn't move up at all — now also triggers at the boundary (`pos.line === start.line`). Additionally, the plugin's `tableAwareMoveUp` motion (which overrides `k` for table separator skipping) bypassed `findPosV` entirely — it now delegates to `findPosV` when the target line is inside the frontmatter. ([#25](https://github.com/saberzero1/motions/issues/25))
- **`gk`/`gj` over headings resets cursor to column 0** — `gk` (and `gj`) no longer jumps to the beginning of the line when crossing Obsidian headings in live preview. Headings are rendered with larger fonts, making them visually taller. The fork's `findPosV` widget-detection heuristic falsely treated the multi-line jump caused by the heading's height as a skipped replaced widget (e.g. MathJax) and overrode the cursor position. The heuristic now checks for actual replaced/widget decorations (`dec.point === true`) before activating, and a `posAtCoords` fallback corrects cases where `moveVertically` misresolves the goalColumn on decorated lines. ([#26](https://github.com/saberzero1/motions/issues/26))

### Added

- **`gD` — open link in new tab** — `gD` opens the link under the cursor in a new tab, using the same bracket-aware link detection as `gd`. External URLs open in the browser. ([#23](https://github.com/saberzero1/motions/issues/23))
- **`<C-w>gd` / `<C-w>gD` — open link in split** — `<C-w>gd` opens the link under the cursor in a horizontal split, `<C-w>gD` in a vertical split. Follows the Neovim `<C-w>s`/`<C-w>v` convention (lowercase = horizontal, uppercase = vertical). ([#23](https://github.com/saberzero1/motions/issues/23))
- E2E tests for `gD`, `<C-w>gd`, `<C-w>gD`: link-on-wikilink navigation (new tab, horizontal split, vertical split), no-op outside links, leaf count verification
- E2E tests for `gk`/`gj` over headings: cursor horizontal position preserved across single and multiple headings, symmetry between `gk` and `gj`

### Documentation

- `KNOWN_LIMITATIONS.md`: updated "Properties navigation" section with `k`/`gk` frontmatter fix and `tableAwareMoveUp` interaction
- `KNOWN_LIMITATIONS.md`: added `gk` frontmatter entry to behavioral deviations table
- `DIFFERENCES.md` (fork): updated "Properties navigation" section with boundary detection and dual-case `focusBefore` logic
- `KNOWN_LIMITATIONS.md`: updated "Visual line navigation and replaced widget decorations" section with heading-aware fix and `posAtCoords` fallback
- `KNOWN_LIMITATIONS.md`: updated `gj`/`gk` widgets behavioral deviation entry with heading decoration handling
- `README.md`: added `gD`, `<C-w>gd`, `<C-w>gD` to workspace keyboard control table

## [0.18.0] - 2026-06-27

### Fixed

- **EasyMotion dimming not visible** — the shade overlay (`.vim-motions-easymotion-shade`) was invisible because it was a child of the zero-size absolutely-positioned wrapper div. The shade is now appended directly to `scrollDOM` as a sibling of the wrapper, so its `right: 0; bottom: 0` resolves against the full editor dimensions. ([#6](https://github.com/saberzero1/motions/issues/6))
- **EasyMotion labels overlapping on dense text** — labels for adjacent targets (e.g., `<leader><leader>w` on closely spaced words) now stack vertically instead of rendering on top of each other. `renderLabels()` tracks placed label bounding boxes and offsets new labels below any overlap. ([#6](https://github.com/saberzero1/motions/issues/6))
- **EasyMotion labels on hidden text in Live Preview** — word-start targets inside hidden markdown syntax (e.g., the URL portion of `[text](url)`) no longer receive labels. `filterVisibleTargets()` deduplicates targets whose `coordsAtPos()` resolves to the same pixel position, which occurs when multiple document offsets map to the boundary of a replaced decoration. ([#6](https://github.com/saberzero1/motions/issues/6))
- **EasyMotion dimming setting required app reload** — toggling **Settings → Vim Motions → EasyMotion dimming** now takes effect immediately. The `dimming` parameter was changed from a captured `boolean` to a `() => boolean` getter, so the shade state is read at motion invocation time instead of registration time.

### Added

- **Label font size setting** — configurable font size for EasyMotion and hint mode labels via **Settings → Vim Motions → Label font size** (10–20px slider, default: 14). EasyMotion collision detection scales proportionally with the configured size.
- **Label color customization via CSS** — label colors are now overridable via CSS custom properties. EasyMotion: `--vim-motions-em-bg`, `--vim-motions-em-fg`. Hint mode: `--vim-motions-hint-bg`, `--vim-motions-hint-fg`. All default to `--text-accent` / `--text-on-accent`.

## [0.17.0] - 2026-06-27

### Fixed

- **Visual mode cursor displaced at end-of-line (regression)** — exiting charwise visual mode (`v$<Esc>`, `vlll<Esc>`) at end-of-line left the cursor one position past the last character. The fork's `exitVisualMode()` called `clipCursorToContent()` while `vim.visualMode` was still `true`, which allowed the cursor to land at the linebreak position; after clearing the flag, the cursor remained displaced. Fixed by clearing visual flags before `setCursor`. Also fixed a latent JS loose equality bug in `measureCursor()` where `false != "\n"` evaluated to `false` due to type coercion. ([#15](https://github.com/saberzero1/motions/issues/15))
- **Leader key mappings not working via vimrc** — `let mapleader = ","` (or space, or any custom leader) in `.obsidian.vimrc` now correctly re-registers EasyMotion, hint mode, table manipulation, and settings leader bindings with the new leader key. Previously, the initial backslash-leader `mapCommand` entries persisted in the keymap because `Vim.unmap()` could not remove `mapCommand`-created entries, and `unmapDefaultBinding` skipped non-special keys like comma. The fork now provides `Vim.removeMapCommand(keys)` for clean removal, and `VimRegistration` uses scoped leader binding tracking to selectively unregister stale bindings when the leader changes. ([#21](https://github.com/saberzero1/motions/issues/21), [#6](https://github.com/saberzero1/motions/issues/6))
- **`<C-w>` workspace commands not working** — `<C-w>v`, `<C-w>h/j/k/l`, `<C-w>s`, `<C-w>c/q`, and `<C-w>o` now work correctly when Obsidian's default Ctrl+W hotkey is unbound. The fork's `matchCommand` had an `idle` entry for `<C-w>` in normal mode that consumed the key as a no-op before the second keystroke could arrive, preventing multi-key `<C-w>X` sequences from matching. The fork now deprioritizes `idle` full matches when more-specific partial matches exist (e.g. `<C-w>v`, `<C-w>h` registered via `mapCommand`). The `idle` entry still fires when no sub-commands are registered, preventing the keystroke from propagating to the browser. ([#20](https://github.com/saberzero1/motions/issues/20))

### Added

- Fork regression test `exit_visual_mode_cursor_clipping` covering `vlll<Esc>`, `vll<Esc>`, and `v$<Esc>` cursor positioning
- E2E tests for leader key mapping behavior: comma and space leader key mappings execute correctly via `Vim.handleKey`, leader keys do not insert literal characters in normal mode, EasyMotion overlay appears with custom leader and old leader bindings are cleaned up
- E2E tests for `<C-w>` workspace commands: `<C-w>v`/`<C-w>s` verify leaf count increases (split created), `<C-w>c` verifies leaf count decreases (tab closed), `<C-w>o` verifies other tabs closed, `<C-w>h/j/k/l` verify focus changes after split, `<C-w>` followed by invalid suffix (`x`) verifies the suffix does not execute as a standalone command, insert-mode `<C-w>` non-regression verifies delete-word still works

### Documentation

- `KNOWN_LIMITATIONS.md`: updated "Visual mode cursor displaced at end-of-line" section with `exitVisualMode` root cause and `measureCursor` coercion fix
- `DIFFERENCES.md` (fork): updated "Visual mode cursor positioning at EOL" section with `exitVisualMode` ordering fix and strict equality fix
- `KNOWN_LIMITATIONS.md`: expanded "EasyMotion leader key conflict" fixed section with leader re-registration and `removeMapCommand` details
- `KNOWN_LIMITATIONS.md`: updated "`<C-w>` prefix conflict" section — removed codemirror-vim limitation framing, kept user-action requirement (unbind Obsidian's Ctrl+W hotkey)
- `DIFFERENCES.md` (fork): added "`removeMapCommand` API" section documenting the new keymap removal method
- `DIFFERENCES.md` (fork): added "Idle key deprioritization for multi-key sequences" section documenting the `matchCommand` fix

## [0.16.0] - 2026-06-27

### Added

- **Cursor-aware table editing in Live Preview** — replaced the table cell bridge approach with a custom table rendering system. Tables display as themed HTML when the cursor is outside and switch to raw Markdown when editing. All vim motions, operators, and text objects work naturally on table content. ([#19](https://github.com/saberzero1/motions/issues/19))
    - Custom `TableRenderWidget` renders markdown tables as HTML using Obsidian's CSS classes (`cm-embed-block`, `markdown-rendered`, `table-wrapper`, `table-cell-wrapper`) for full theme compatibility
    - `StateField` provides `Decoration.replace` for tables the cursor is NOT in; removes decoration when cursor enters
    - Table widget suppressor patches `RangeSetBuilder.prototype.add` to suppress Obsidian's interactive table widget
    - Default mode: "Cursor-aware" — rendered table when cursor is outside, raw Markdown when editing
    - "Always raw" mode keeps tables as plain Markdown at all times
    - "Off" mode restores Obsidian's default interactive table editor
    - Three-way setting: **Settings → Vim Motions → Table widget in live preview**
    - Supports alignment markers (`:---`, `---:`, `:---:`) in rendered tables
- **Vertical table cell navigation** — `]r`/`[r` moves to the same column in the next/previous row, skipping separator rows
- **Table cell text objects** — `i|`/`a|` for operating on table cells with standard vim operators:
    - `i|`: content between surrounding pipes (like `i(`)
    - `a|`: content plus the trailing pipe
    - Works with `d`, `c`, `y`, `v`: `di|` deletes cell content, `ci|` changes it, `yi|` yanks it
- **Table realignment** — `:tablerealign` (short: `:tablerea`) ex command and `<Leader>tr` mapping. Computes column widths across all rows, pads cells uniformly, and respects `:---`/`---:`/`:---:` alignment markers in separator rows.
- **Table auto-format on `|`** — CM6 `inputHandler` extension that realigns table columns when `|` is typed in insert mode. Typing `||` on a new line within a table generates a separator row (`|---|---|`).
- **Table manipulation keybindings** — `<Leader>t` prefix commands mapped to Obsidian's built-in table commands, inspired by [vim-table-mode](https://github.com/dhruvasagar/vim-table-mode):
    - `<Leader>tm` — insert table
    - `<Leader>to`/`tO` — add row below/above
    - `<Leader>tJ`/`tK` — move row down/up
    - `<Leader>tdd` — delete row
    - `<Leader>tiL`/`tiH` — add column right/left
    - `<Leader>tL`/`tH` — move column right/left
    - `<Leader>tdc` — delete column
    - `<Leader>tr` — realign table
- **Table ex commands** — 15 ex commands for table manipulation: `:tableinsert`, `:tablerowafter`, `:tablerowbefore`, `:tablerowup`, `:tablerowdown`, `:tablerowdelete`, `:tablecolafter`, `:tablecolbefore`, `:tablecolleft`, `:tablecolright`, `:tablecoldelete`, `:tablealignleft`, `:tablealigncenter`, `:tablealignright`, `:tablerealign`
- **Internalized monkey-around** — `src/util/around.ts` provides safe prototype patching with automatic removal, replacing the external `monkey-around` dependency
- E2E test suite expansion: 28 tests in `table-cell-bridge.e2e.ts` (cursor-aware rendering, widget suppression, `j`/`k` navigation through tables, separator row traversal, post-edit navigation, theme class verification, alignment rendering), 24 tests in `tables.e2e.ts` (cell navigation, vertical navigation, text objects, realignment)

### Fixed

- **Cursor stuck on table separator after insert-mode edit** — after editing a table cell in insert mode, Obsidian's async table handler repositions the cursor, preventing `k` from crossing the separator row (`|---|---|`). Fixed with a custom `tableAwareMoveUp` motion that skips separator rows when moving up after a table edit. The motion detects the snap-back pattern and compensates by jumping two lines (over the separator) instead of one. Operator-pending context (`dk`) is excluded from the skip to preserve correct delete ranges.
- **Cursor-aware table rendering** — the "Cursor-aware" mode now uses a custom read-only `TableRenderWidget` instead of Obsidian's interactive table widget. Tables render as themed HTML when the cursor is outside, with no async cursor snap-backs or state corruption.

### Changed

- Replaced `TableCellBridge` approach (per-cell vim bridge) with cursor-aware table rendering. The bridge approach required maintaining vim state across Obsidian's cell-scoped editors; the new system suppresses Obsidian's widget and provides its own themed read-only widget via a `StateField`.
- `tableWidgetMode` setting default: `'cursor'` (cursor-aware rendering)
- Legacy `suppressTableWidget: boolean` setting migrated: `true` → `'always'`, `false` → `'off'`

### Documentation

- `KNOWN_LIMITATIONS.md`: updated table navigation section with new features (vertical nav, text objects, realignment, auto-format); documented cursor-aware mode architecture
- `README.md`: updated table navigation description for cursor-aware rendering; added `i|`/`a|` to text objects table, `]r`/`[r` to navigation, table text objects section, auto-format docs, `<Leader>tr` and `:tablerealign` to commands

## [0.15.0] - 2026-06-26

### Fixed

- **Bundled fork not recognized by other plugins** — ecosystem plugins that check `window.CodeMirrorAdapter.Vim` (e.g. Outliner, obsidian-vimrc-support) could miss the bundled fork due to plugin load order or Obsidian overwriting the property after the bridge was installed. The bridge now uses a property descriptor (getter) instead of a plain assignment, so reads always return the fork's Vim singleton regardless of timing. The bridge is also installed before `registerEditorExtension()` for earlier availability, and properly cleaned up on plugin unload. ([#17](https://github.com/saberzero1/motions/issues/17))
- **`Vim.enterInsertMode(cm)` missing from fork API** — ecosystem plugins (Outliner, obsidian-lineage) call `Vim.enterInsertMode(cm)` to transition the editor into insert mode after custom actions. Obsidian's built-in `vim.js` exposes this method but upstream `@replit/codemirror-vim` does not. The fork now exports `enterInsertMode(cm)` on the `Vim` singleton, matching Obsidian's API surface. Without this, plugins using the bundled fork would get `TypeError: vim.enterInsertMode is not a function`. ([#17](https://github.com/saberzero1/motions/issues/17))

### Changed

- **Fork test count** — 1630 fork tests passing (up from 1628). Added `api_enterInsertMode` test verifying the new public API method.

### Documentation

- `DIFFERENCES.md` (fork): added "`enterInsertMode` API exposure" section documenting the Obsidian-specific API addition

## [0.14.0] - 2026-06-26

### Added

- **Which-key for all partial keys** — the which-key overlay now triggers on any partial key sequence (operators like `d`, `c`, `y` and prefix keys like `g`, `z`, `[`, `]`), not just the leader key. After a 500ms delay, a multi-column panel at the bottom of the editor shows available continuations. Configurable via **Settings → Vim Motions → Which-key hints** with three modes: off, leader key only, all partial keys (default: off).
    - Operator-pending mode (`d …`) shows grouped next-key options: single-key motions directly (`w`, `j`, `$`), multi-key prefixes collapsed (`i` → +N text objects, `a` → +N text objects)
    - Partial prefix keys (`g …`, `z …`) show `getCompletions()` results from the fork's keymap introspection API
    - Special keys (`<Left>`, `<C-n>`, etc.) and insert-only entries are filtered out
    - Leader bindings from settings and vimrc are shown with friendly command names
    - Overlay positioned at bottom of editor pane (not viewport), max 40% height, multi-column grid layout
- E2E test suite `test/specs/which-key.e2e.ts` with 31 tests covering all three modes (off/leader/all), settings hot-reload, leader registry integration, and fork API integration (`getKeymap`/`getCompletions`)

### Changed

- **Which-key setting** — `enableWhichKey` boolean replaced with `whichKeyMode` dropdown (`'off'` | `'leader'` | `'all'`). Default changed from implicit leader-only to explicit `'off'`.
- **Which-key overlay rewritten** — `WhichKeyOverlay` class generalized from leader-only to support any partial key sequence. Uses `getInputState()` for operator-pending detection and `vim.status` for partial key chord display. DOM attachment changed from `editorEl.parentElement` to `view.contentEl` for reliable positioning.
- **`VimState` type fix** — `mode` field changed from required `'normal' | 'insert' | 'visual' | 'replace'` to optional `string` to match runtime behavior (the field is only set by the CM6 ViewPlugin's mode-change handler, not by the initial vim state).
- **Plugin deviations reduced** — `test/neovim/deviations.ts` reduced from 20 to 10 entries. 10 deviations removed after verifying the fork now matches Neovim: `)` sentence motion, `di(` multiline, `db` cross-line, `dw` empty line, `d2w` cross-line, `dge` empty lines, `diw` word boundary, `da"` trailing space, `:join` cursor, `:global` cursor.
- **Fork test count** — 17 new fork-level tests for async motion dispatch (6), `getKeymap()` API (5), and `getCompletions()` API (6). Total: 1628 fork tests passing.
- **Fork golden comparison** — re-recorded 756 golden cases from Neovim 0.12.2 with per-step state capture. 476 pass, 0 unexpected diffs, 280 known deviations (down from 284). Fixed 3 duplicate test name collisions and empty `:s` flag behavior.

### Fixed

- **`da"` trailing space** — `da"` on `say "hello world" end` now produces `say end` (single space) instead of `say  end` (double space). The fork's `findBeginningAndEnd` now consumes adjacent whitespace after inclusive quote expansion, matching Neovim.
- **`:join` cursor position** — `:join` ex command now positions cursor at column 0 of the joined line, matching Neovim. Previously placed cursor at the join point.
- **`:global` cursor position** — `:g/pattern/d` now positions cursor at the last matched line after execution, matching Neovim. Non-destructive `:g` commands leave cursor where the last sub-command placed it.
- **Empty `:s` flag behavior** — `:s` with no arguments no longer preserves the `/g` flag from the previous substitution. Only the first match on the line is replaced, matching Neovim.
- **`%` string-awareness** — updated `KNOWN_LIMITATIONS.md` to reflect that `%` is only partially fixed: the forward-seek check works, but `findMatchingBracket` still does positional counting without string awareness.
- **Which-key graceful degradation** — `getInputState()`, `getKeymap()`, and `getCompletions()` calls in the which-key overlay now check `typeof` before invocation, preventing errors when built-in vim mode is active (these APIs are fork-only).
- **Cursor shape settings in built-in mode** — cursor shape dropdowns are now disabled with an explanatory message when Obsidian's built-in vim mode is active (cursor shapes require bundled fork mode).
- **g-commands golden data** — corrected incorrect Neovim recordings for `g$` (cursor ch:11→10, mode visual→normal) and `guu` (content unchanged→lowercased). Full vim-builtin e2e suite now passes 16/16.

### Documentation

- `DIFFERENCES.md` (fork): added "Keymap introspection API" section documenting `getKeymap()` and `getCompletions()`
- `DIFFERENCES.md` (fork): updated "Empty :s flag preservation" → "Empty :s uses default flags", added `da"` whitespace, `:join` cursor, `:global` cursor sections, updated golden comparison stats
- `KNOWN_LIMITATIONS.md`: "Which-key overlay scope" section rewritten to reflect the new all-keys mode
- `KNOWN_LIMITATIONS.md`: updated `%` + strings entry to "Partially fixed" with explanation of remaining `findMatchingBracket` limitation
- `KNOWN_LIMITATIONS.md`: added `da"`, `:join`, `:global`, `:s` empty entries to behavioral deviations table
- `KNOWN_LIMITATIONS.md`: corrected `vi*` single-char status from "Fixed" to "Not fixed"
- `AGENTS.md`: updated fork test count (1421→1628) and golden comparison stats
- `README.md`: which-key description updated and settings list updated with new dropdown

## [0.13.0] - 2026-06-26

### Fixed

- **Visual mode cursor displaced at end-of-line** — in charwise visual mode (`v$`, `vl` to EOL), the block cursor no longer renders one character past the visible line content. The fork's `measureCursor()` now uses the vim state (`vim.visualLine`, `vim.visualBlock`) to only apply the EOL cursor adjustment in charwise visual mode, preserving linewise (`V`) and blockwise (`<C-v>`) rendering. Verified against Neovim 0.12.2 golden comparison. ([#15](https://github.com/saberzero1/motions/issues/15))
- **`set clipboard=unnamed` not syncing to system clipboard** — `set clipboard=unnamed` (or `unnamedplus`) in `.obsidian.vimrc` now actually syncs yank, delete, and change operations with the system clipboard. Previously, the option was parsed and stored but never acted upon — only explicit `"+y` register yanks reached the clipboard. Paste (`p`/`P`) also reads from the system clipboard when the option is set. ([#16](https://github.com/saberzero1/motions/issues/16))

### Added

- **Surround operator (vim-surround)** — complete vim-surround implementation with all standard features. Requires bundled fork mode. ([#9](https://github.com/saberzero1/motions/issues/9))
    - Core: `ds{target}` (delete), `cs{target}{replacement}` (change), `ys{motion}{replacement}` (add), `yss{replacement}` (entire line), visual `S{replacement}` (selection)
    - Tag surround: `dst` (delete surrounding tag), `cst{replacement}` (change tag), `ysiw<tag>` (surround with tag), `cs"<tag>` (delimiter to tag), visual `S<tag>` (selection with tag). Regex tag fallback for Markdown mode.
    - Function wrapping: `ysiwf` + name + Enter → `name(text)`, `ysiwF` for spaced variant → `name( text )`
    - Newline variants: `cS`, `yS`, `ySS`, `gS` — delimiters on separate lines with content indented one level deeper
    - Count support: `2ds)` deletes 2nd-level surrounding bracket, `2ysiw*` repeats delimiter for Markdown bold (`**word**`), `2ds*` unbolds, `2cs*~` changes bold to strikethrough. Works with any quote-type delimiter (`*`, `~`, `=`, `$`).
    - Insert mode: `<C-G>s{char}` inserts open delimiter, type content, close delimiter appended on Esc. `<C-G>S{char}` for newline variant.
    - Dot-repeat (`.`) works for all surround commands including tags, functions, and multi-char delimiters
    - All bracket/quote targets with space rules, aliases (`b`→`)`, `B`→`}`, `r`→`]`, `a`→`>`), and `t` (tag) target
    - 1585 fork tests passing
- E2E test suite `test/specs/surround.e2e.ts` with 66 tests covering ds/cs/ys/yss/visual S, tags (dst/cst/ysiw<tag>), function wrapping (f/F), newline variants (cS/yS/ySS/gS), count support (2ds/2cs), Markdown pairs (2ysiw*/2ds*/2cs\*~), insert mode surround (<C-G>s), dot-repeat, and edge cases

### Documentation

- `DIFFERENCES.md` (fork): added surround operators section with architecture (pendingInput buffer, tag finding, newline variants, count support, dot-repeat, insert mode surround, char-repeat for Markdown pairs)
- `KNOWN_LIMITATIONS.md`: "Surround operator scope" section — complete feature set documented with breaking changes
- `README.md`: surround keybinding table with all features (tags, functions, newlines, counts, Markdown pairs, insert mode)
- `test/neovim-command-index.yaml`: added 46-entry surround section (100% tested)

## [0.12.0] - 2026-06-25

### Fixed

- **Visual line navigation skips block MathJax in live preview** — `gj`/`gk` and `j`/`k` now navigate into rendered MathJax `$$` blocks line by line instead of skipping over them. The fork's `findPosV` detects when `moveVertically` jumps over multiple document lines (indicating a replaced widget decoration) and steps one document line instead, allowing the cursor to enter the widget's source range. Folded ranges are excluded from correction. ([#14](https://github.com/saberzero1/motions/issues/14))
- **`da$` on block math `$$...$$` deletes partially** — `da$` on `$$ a + b = c $$` now correctly deletes the entire expression (producing empty string) instead of leaving `$$`. The `$` text object now uses smart disambiguation (same pattern as `i*`/`a*`): tries `$$` as delimiter first, falls back to `$` for inline math. `di$` on block math correctly produces `$$$$`.
- **`)` sentence motion at end of text** — `)` at the end of the last sentence no longer moves the cursor backward to the period; it stays in place, matching Neovim
- **Dot-repeat of `cw` + typed text** — `.` after `cw` correctly replays the inserted text (was a test infrastructure issue, not a vim engine bug)
- **Search `n`/`N` wrap-around** — `n` after `/` search correctly wraps to the first match when reaching the end of the document (was a test infrastructure issue)
- **Chord display not clearing on Escape** — pending keystrokes (e.g. `d`) in the status bar now clear when Escape is pressed. The mode tracker now listens to `vim-command-done` in addition to `vim-keypress` and `vim-mode-change`, catching the case where Escape cancels a partial command without changing mode or firing a keypress event. ([#2](https://github.com/saberzero1/motions/issues/2))
- **Cursor text invisible in light mode** — the character under the block cursor now uses `--text-on-accent` (Obsidian's contrast color) instead of the syntax-highlighted color. Previously, colored text (headings, links) under the cursor was the same hue as the cursor background, making it unreadable in light themes. ([#12](https://github.com/saberzero1/motions/issues/12))

### Added

- **Per-mode cursor shapes** — configurable cursor shape per Vim mode: block, bar, underline, or hollow. Defaults match Neovim (`guicursor`): block for normal/visual, bar for insert, underline for replace/operator-pending. Configurable via **Settings → Vim Motions → Cursor shapes** or vimrc `set guicursor=n:block,i:bar,v:hollow,r:underline,o:underline`. Requires bundled fork mode. ([#13](https://github.com/saberzero1/motions/issues/13))
- E2E test suite `test/specs/widget-navigation.e2e.ts` with 6 regression tests for gj/gk/j/k navigation through rendered MathJax `$$` blocks in live preview

### Changed

- `i$`/`a$` text objects now use `createSmartDollarTextObject` (tries `$$` first, falls back to `$`), matching the same disambiguation pattern as `i*`/`a*` with `createSmartAsteriskTextObject`

## [0.11.0] - 2026-06-25

### Fixed

- **Visual selection highlight** — visual mode selection is now visible when using the bundled fork. The fork toggles a `.cm-vimVisual` class and scopes its `::selection { transparent }` rule to non-visual modes only. ([#10](https://github.com/saberzero1/motions/issues/10))
- **Properties navigation** — pressing `k` at the top of the document now navigates into the properties (YAML frontmatter) panel, matching built-in vim behavior. The fork's `findPosV` adapter detects when `moveVertically` lands the cursor inside the frontmatter region and provides a `focusBefore` callback that focuses the "Add property" button. ([#11](https://github.com/saberzero1/motions/issues/11))
- **Latex Suite compatibility** — bundled vim extension now registered at `Prec.highest` so its keydown handler fires before Latex Suite's handlers, preventing duplicate key consumption in large math blocks. ([#11](https://github.com/saberzero1/motions/issues/11))
- **Empty `:s` flag handling** — `:s` with no arguments now uses default flags (no `/g`), replacing only the first match on the line, matching Neovim
- **Octal increment disabled** — numbers with leading zeros (e.g. `007`) now increment as decimal (`008`) instead of octal (`010`), matching Neovim's default `nrformats`
- **Per-step golden comparison infrastructure** — fork's Neovim comparison now captures state after each key step (1504 steps at 100% coverage), revealing 23 previously hidden behavioral differences
- **Golden recorder reliability** — `redraw` after `setCursor` prevents stale Neovim state; 80×24 viewport simulation via `set columns=80 lines=24` enables accurate display-line motion recording
- **`zc`/`zo` fold commands** — fold/unfold now use CM6's `foldCode`/`unfoldCode` directly instead of Obsidian's incremental `editor:fold-more`/`editor:fold-less` commands, which operated globally by heading level rather than at the cursor position. `za` uses `toggleFold` for robust cursor-based toggling. ([#8](https://github.com/saberzero1/motions/issues/8))

### Changed

- Bundled vim extension registered at `Prec.highest` for correct key handler ordering with third-party plugins

## [0.10.0] - 2026-06-25

### Added

- **Bundled codemirror-vim fork** — when Obsidian's built-in vim mode is disabled, the plugin provides a forked `@replit/codemirror-vim` as a CM6 extension with Neovim-parity behavioral fixes. A `window.CodeMirrorAdapter.Vim` bridge ensures ecosystem plugins (obsidian-vimrc-support, vim-im-control, etc.) work transparently.
- **Async motion support** — the fork's `defineMotion` now accepts async functions returning `Promise<Pos>`, enabling EasyMotion to work natively as a motion instead of an action. Operator-pending (`d`/`c`/`y` + easymotion) and visual mode (`v` + easymotion) work through the standard vim dispatch.
- **Neovim golden comparison infrastructure in fork** — 496/688 tests passing against headless Neovim, with per-step extraction, golden recording, and automated comparison (`npx tsx test/neovim/compare.ts`).
- E2E tests for operator-pending easymotion (`d`/`c`/`y` + easymotion w)
- E2E tests for multiline bracket text objects (`di{`/`di[`/`di<` across lines, same-line verification)
- E2E tests for `%` string-awareness, `db`/`d2w` cross-line whitespace, `dd` cursor column preservation, `J` trailing whitespace
- Expected-failure test cases for 6 remaining fixable deviations (dw cursor, d2w scope, dge empty, db cross-line, % quoted brackets, N after search)
- **Full vim-easymotion default motion set** — all 17 default-mapped motions: find (`f`, `F`, `s`, `t`, `T`), word (`w`, `b`, `e`, `ge`, `W`, `B`, `E`, `gE`), line (`j`, `k`), search (`n`, `N`)
- **Bidirectional easymotion variants** — `easyMotionBdWord`, `easyMotionBdEndWord`, `easyMotionBdWORD`, `easyMotionBdEndWORD`, `easyMotionBdLine`, `easyMotionBdTill` available as named actions for vimrc remapping
- **Repeat last easymotion motion** — `easyMotionRepeat` action replays the most recent easymotion jump
- **2-character combo labels** — SCTree algorithm assigns single-char labels to nearby targets and 2-char labels to distant targets when there are more targets than label characters (>26). Backspace resets after typing the first char of a 2-char label.
- **Text dimming** — non-target text is dimmed when easymotion is active, making labels more visible. Controlled by **Settings → Vim Motions → EasyMotion dimming** (on by default).
- **Visual mode support** — all easymotion motions work in visual mode. `v` + easymotion extends the character selection to the target, `V` + easymotion extends the line selection. Uses CM6 `dispatch({ selection })` to manipulate the selection range directly.
- **EasyMotion dimming setting** — `easyMotionDimming` toggle in settings UI
- Spike test `test/specs/spikes/spike19-easymotion-visual.e2e.ts` investigating CM Vim visual mode and operator-pending feasibility (6 questions answered)
- E2E test file `test/specs/easymotion-comprehensive.e2e.ts` with 22 tests covering cursor landing (word, char, line, ge/gE), 2-char labels, dimming, repeat, visual mode, and edge cases (empty document, single word, empty lines, non-existent char)
- E2E test file `test/specs/easymotion-visual.e2e.ts` with 4 tests covering visual mode overlay, charwise selection, linewise selection, and escape preservation
- CSS classes: `.vim-motions-easymotion-shade` (dimming overlay), `.vim-motions-easymotion-label-first` and `.vim-motions-easymotion-label-second` (2-char label styling)

### Fixed

- **`dd` cursor column preservation** — cursor now stays at its original column after linewise delete (matching Neovim), instead of moving to first non-blank character
- **`J` trailing whitespace** — join now strips trailing whitespace from the current line before adding the join space, preventing double spaces
- **`di{`/`di[`/`di<` multiline** — inner bracket text objects on multiline brackets now preserve the bracket lines (producing `a{\n}b` instead of `a{}b`), matching Neovim
- **`dj`/`dk` at document boundary** — `dj` on the last line and `dk` on the first line are now no-ops (matching Neovim), instead of deleting the content
- **`:s` cursor positioning** — cursor after substitute now goes to first non-blank of the last affected line instead of column 0
- **`%` string-awareness** — `%` now aborts (no movement) when the first bracket candidate found via forward-seeking is inside a string token, matching Neovim
- **`db`/`d2w` cross-line whitespace** — when a delete crosses a line boundary, the whitespace-only prefix before the cursor is now included in the deletion, matching Neovim
- **`dge` at document start** — `ge` at the start of the document is now a no-op instead of deleting the character under cursor
- **`dge` on empty lines** — `dge` on double-empty-lines now deletes both lines (matching Neovim) instead of leaving one
- **`]p` tab remainder** — `]p` with `indentWithTabs` now preserves remainder spaces when indent doesn't divide evenly by tabSize
- **EasyMotion visual mode** — async motions now properly update visual selection head/anchor instead of just moving cursor
- **EasyMotion escape dismissal** — Escape overlay dismissal in e2e tests now uses real DOM events (`browser.keys`) instead of `Vim.handleKey` which bypasses the DOM listener
- **Hint mode escape dismissal** — same fix as EasyMotion
- **Workspace test isolation** — workspace tests now use `beforeEach` with `loadSingleFileWorkspace()` to prevent cascading failures from `gd` navigation
- **Settings reload Y/Q test** — uses `Vim.handleKey` instead of `browser.keys` to avoid DOM event routing issues after `reloadFeatures()`
- **Vim cursor styling** — fork's hardcoded `#ff9696` cursor color replaced with Obsidian CSS variables (`--interactive-accent`, `--text-on-accent`) directly in the fork's `block-cursor.ts` with fallbacks for non-Obsidian environments
- **Settings notice** — when Obsidian's built-in Vim mode is enabled, the plugin settings tab shows a callout-style warning recommending to disable it, with an explanation of the fork's benefits
- **`dw` on empty line cursor** — cursor after `dw` on an empty line before a whitespace-only line now positions at `ch:1` instead of `ch:0`
- **Ambient type declarations** — `src/types/codemirror-vim.d.ts` provides fallback types for `vim()`, `getCM()`, and `Vim` when the fork's build artifacts are unavailable (e.g. in the community scanner's sandboxed environment)

### Changed

- **Recommended setup**: disabling Obsidian's built-in vim mode is now the recommended configuration. The plugin's bundled fork provides Neovim-correct behavior, async motion support, and theme-aligned cursor styling that are not available with the built-in vim engine.
- **EasyMotion architecture** — EasyMotion motions are now registered via `defineMotion` (async, returning `Promise<Pos>`) instead of `defineAction`. The capture-phase operator-pending interceptor (`src/easymotion/operator-pending.ts`) has been removed — operator-pending and visual mode work natively through the fork's async motion dispatch.
- **EasyMotion module refactored** from single `easymotion.ts` (243 lines) into 6 focused files: `register.ts` (data-driven registration), `targets.ts` (direction-aware target finding), `labels.ts` (SCTree algorithm), `overlay.ts` (DOM rendering with dimming and re-render support), `keypress.ts` (key capture with 2-char narrowing), `types.ts` (interfaces)
- `<leader><leader>w`, `<leader><leader>j`, `<leader><leader>f` are now forward-only, matching vim-easymotion parity. Previously these scanned the entire visible viewport regardless of cursor position.
- `registerEasyMotion()` now accepts a `dimming` parameter and uses a data-driven `EASYMOTION_DEFS` array for registration instead of per-motion imperative code
- `showOverlay()` returns an `OverlayHandle` with `updateLabels()` for dynamic re-rendering during 2-char label narrowing
- `waitForLabel()` replaces `waitForKey()` as the primary label capture function, supporting multi-char labels, backspace reset, and narrowing callbacks
- Removed `test/specs/easymotion-motions.e2e.ts` — superseded by `easymotion-comprehensive.e2e.ts` with correct async test patterns for char-input motions
- **Fork dependency** — `@replit/codemirror-vim` now references `https://github.com/saberzero1/codemirror-vim.git` instead of a local file path, enabling CI/scanner environments to install without local checkouts
- `reportUnusedDisableDirectives` set to `off` in eslint config to avoid conflicts between local and scanner lint rule sets
- Added `Obsidian` to sentence-case brands list in eslint config

### Documentation

- `KNOWN_LIMITATIONS.md`: EasyMotion operator-pending rewritten — now uses async motions natively instead of capture-phase interceptor
- `KNOWN_LIMITATIONS.md`: added 8 behavioral deviation entries for fork fixes (`dd` cursor, `J` whitespace, `di{}` multiline, `dj`/`dk` boundary, `:s` cursor, `%` strings, `db` cross-line, `dw` cursor)
- `KNOWN_LIMITATIONS.md`: added "DOM keyboard events not routed after settings reload" and "EasyMotion visual mode label selection via DOM events" sections
- `AGENTS.md`: added codemirror-vim fork section with dual-vim architecture documentation
- `README.md`: added "Recommended setup" section explaining benefits of disabling built-in vim
- `DIFFERENCES.md` (fork): comprehensive rewrite documenting all behavioral fixes and infrastructure changes
- `DIFFERENCES.md` (fork): added widget-aware vertical navigation and per-mode cursor shapes sections
- `KNOWN_LIMITATIONS.md`: added "Visual line navigation and replaced widget decorations" section
- `KNOWN_LIMITATIONS.md`: added "Smart dollar disambiguation" section for `$$` vs `$` text object matching

## [0.9.0] - 2026-06-23

### Added

- **Configurable multi-line scan limit** — multi-line text objects (`i*`, `a*`, `i$`, etc.) now have a configurable scan range via **Settings → Vim Motions → Multi-line text object scan range** (5–200 lines, default: 20). Users working with long-form documents can increase the limit to match delimiters spanning more than 40 lines.
- **Code block exclusion in delimiter scanning** — the multi-line delimiter scanner now skips lines inside fenced code blocks (` ``` ` fences). Delimiters like `**` inside code blocks are no longer matched as text object boundaries.
- E2E test for delimiter scanning across code block boundaries (`di*` should not match delimiters inside fenced code blocks).
- E2E test for `vi*` on single-character content (`*x*`), documenting the codemirror-vim visual mode limitation.

### Fixed

- **Scrolloff dynamic line height** — scrolloff margins now use `EditorView.defaultLineHeight` to measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height via CSS/themes.
- `adjustRangeForVisualMode` no longer produces zero-width selections for single-character text object ranges — the −1 head compensation is skipped when the range is exactly 1 character wide. (The underlying codemirror-vim `makeCmSelection` bug still prevents `vi*` on `*x*` from selecting correctly, but `di*` on `*x*` now works as expected.)

### Changed

- `getTextwidth()` now reads directly from the plugin's internal `textwidthValue` instead of querying `vimApiRef.getOption('textwidth')`, avoiding a dual-source ambiguity where CM Vim's internal option state could return a stale default (80).
- Vimrc loader skips `vim.handleEx()` for `set textwidth=N` lines and handles them entirely via `setTextwidth()` + `vim.setOption()`, preventing CM Vim's Ex handler from interfering with the plugin's textwidth state.
- `syncTextwidthFromVim()` removed — the function read CM Vim's `getOption('textwidth')` which returned the stale default (80) during the `active-leaf-change` lifecycle, overwriting the correct vimrc-set value.
- `findFenceLines()` and `findContainingBlock()` exported from `src/text-objects/code-block.ts` for reuse in delimiter scanning.
- `MULTILINE_SCAN_LIMIT` constant removed from `delimiter.ts` — scan limit is now passed as a parameter through the text object factory chain (`createMultiLineDelimiterTextObject`, `createSmartAsteriskTextObject`, `registerTextObjects`).

### Documentation

- `KNOWN_LIMITATIONS.md`: "Scrolloff line height assumption" marked as fixed.
- `KNOWN_LIMITATIONS.md`: "Multi-line delimiter scan limit" updated to note the limit is now configurable via settings.
- `KNOWN_LIMITATIONS.md`: "Multi-line delimiter nesting" updated to note fenced code blocks are now excluded from the scan.
- `KNOWN_LIMITATIONS.md`: "Visual mode on single-character text objects" updated from "Under investigation" to "Confirmed codemirror-vim limitation" with detailed root cause.
- `KNOWN_LIMITATIONS.md`: "`set textwidth` via vimrc" root cause refined — identified CM Vim's `defineOption` callback resetting the value during editor initialization.
- `KNOWN_LIMITATIONS.md`: "`dG` leaves trailing newline" updated from "Skipped test, pending fix" to "Unfixable from plugin code" with investigation findings.
- `KNOWN_LIMITATIONS.md`: "Dot-repeat of `cw`" and "`n`/`N` search wrap-around" updated from "pending fix" to "Confirmed codemirror-vim bug, not a test timing issue."

## [0.8.0] - 2026-06-23

### Added

- **Vim chord display** — pending keystrokes (e.g. `2d`, `gq`, `<C-w>h`) are shown in the status bar as you type a multi-key command, clearing when the command completes or is cancelled. Reads codemirror-vim's internal `vim.status` string directly, avoiding event-ordering issues with manual keystroke accumulation in the CM6 adapter. Togglable via **Settings → Vim Motions → Vim chord display** (on by default). ([#2](https://github.com/saberzero1/motions/issues/2))
- **Customizable mode prompts** — per-mode status bar text is configurable via four text fields in **Settings → Vim Motions → Vim mode display prompt** (normal, insert, visual, replace). Defaults to `NORMAL`/`INSERT`/`VISUAL`/`REPLACE`. Supports emoji (e.g. `🟢` for normal). ([#3](https://github.com/saberzero1/motions/issues/3))
- **Powerline-style status bar** — optional colored mode indicator with per-mode background colors (gruvbox-inspired: green/normal, teal/insert, amber/visual, red/replace) and a CSS border-triangle separator. No special font required — uses pure CSS. Togglable via **Settings → Vim Motions → Powerline-style status bar** (off by default). Colors are overridable via CSS custom properties (`--vim-pl-normal-bg`, `--vim-pl-normal-fg`, etc.).
- **Left-aligned status bar** — the vim mode indicator and chord display are always positioned at the leftmost edge of the status bar via DOM reordering and `margin-right: auto`, matching the convention established by obsidian-vimrc-support.
- `ModePrompts` interface and `DEFAULT_MODE_PROMPTS` constant exported from `settings.ts`.
- `VimModeTrackerOptions` extended with `powerline` and `modePrompts` fields.
- CSS classes: `vim-motions-chord`, `vim-motions-powerline`, `vim-motions-statusbar-end`.
- Hint mode expanded into a full vimium-style UI navigation system ([#7](https://github.com/saberzero1/motions/issues/7)):
    - **Smart label length**: single-character labels (from home row) when 9 or fewer targets, two-character labels for more.
    - **Configurable hint characters**: new `hintModeLabels` setting controls the character pool for hint labels (default: `asdfghjkl`).
    - **Independent settings toggle**: `enableHintMode` setting allows toggling hint mode on/off independently from workspace navigation.
    - **Obsidian command**: registered as `vim-motions:show-hint-labels` — triggerable from command palette, assignable via **Settings → Hotkeys**, and usable without an open note.
    - **Global hotkey**: press-to-record hotkey setting that works even when modals (settings, command palette) have focus. Uses capture-phase DOM listeners that bypass Obsidian's scope system.
    - **Multi-window support**: global hotkey listener registered on workspace popout windows via `window-open` event.
    - **Editor pane navigation**: `.workspace-leaf-content` is now a hint target. Selecting it calls `setActiveLeaf()` with focus and activates the editor, matching click-to-focus behavior.
    - **Smarter element activation**: `contenteditable` elements receive `.focus()`, internal links use `app.workspace.openLinkText()`, Ctrl/Cmd+click opens in new pane via `MouseEvent` dispatch.
    - **Backspace reset**: pressing Backspace after typing a wrong first character undims all labels and allows re-selection.
    - **First-char mismatch dismissal**: pressing a character that matches no label immediately dismisses the overlay instead of waiting for a second character.
    - **Auto refocus**: after hint mode completes, the active editor is refocused (150ms delay) so `<leader><leader>h` works for the next invocation.
- Hint mode target selectors expanded from 9 to 24, covering: checkboxes, ribbon icons, callout folds, settings navigation items, settings controls (buttons, toggles, dropdowns), tab close buttons, search inputs, editor panes, internal links in live preview, and modal close buttons.
- Selectors grouped by stability: standard HTML selectors (stable across Obsidian versions) and Obsidian-internal selectors (may change between versions).
- `generateHintLabels()`, `HOME_ROW`, `ALL_KEYS`, and `TARGET_SELECTOR` exported from `hint-mode.ts` for testability.
- E2E test suite `test/specs/hint-mode.e2e.ts` with 13 tests across two tiers:
    - Tier 1 (baseline): overlay appearance, label rendering, Escape dismissal, first-char dimming, label completion, unmatched-char dismissal, Backspace reset.
    - Tier 2 (behavior contracts): home-row first characters, no duplicate labels, consistent label length, visibility filtering, pointer-events CSS, Obsidian command registration.
- `formatHotkey()` utility in `settings.ts` for displaying serialized hotkey strings in human-readable form.
- CSS class `.vim-motions-hotkey-display` for the hotkey display in settings.

### Changed

- Hint mode registration extracted from `registerWorkspaceNavigation()` into a standalone `registerHintMode()` private method on the plugin, following the same pattern as `registerEasyMotion()`.
- `createHintModeAction()` now accepts an optional `hintChars` parameter for configurable hint character pools.
- `isVisible()` now checks against scrollable ancestor containers (not just the viewport) — elements scrolled out of view inside `overflow: hidden/scroll/auto` parents are excluded.
- `showHints()` refactored to use `getHintPosition()` which places `.workspace-leaf-content` labels at the editor/preview content area (8px inset) rather than the top-left of the leaf container.
- `waitForHintKey()` now returns `HintResult` with `ctrlKey`/`metaKey` modifier state for new-pane activation support.
- `activateElement()` replaces the previous bare `.click()` with context-aware activation (focus, link resolution, modifier-based new-pane, `setActiveLeaf`).
- Pop-out window compatibility: `window.innerHeight`/`scrollX`/`scrollY` replaced with `activeWindow.*` equivalents throughout hint mode.
- Hotkey recorder uses `e.code` as fallback when `e.key` reports `'Unidentified'` (common for Ctrl+Space on Linux with input methods).

### Fixed

- Hint mode now works when no note is open (via the Obsidian command path).
- Hint mode global hotkey now fires even when a modal (settings, command palette) has focus — uses capture-phase `keydown` listeners on the main window's document that bypass Obsidian's scope system.
- Selecting a `.workspace-leaf-content` hint now properly focuses the editor pane via `app.workspace.setActiveLeaf()` instead of a bare `.click()` that Obsidian didn't treat as a pane activation.
- Settings controls (toggles, buttons, dropdowns, navigation items) are now targetable via hint mode.
- Tab close buttons (`.workspace-tab-header-inner-close-button`) are now targetable via hint mode.
- Elements inside scrollable containers (e.g., settings content area) that are scrolled out of view no longer receive hint labels.

## [0.7.0] - 2026-06-22

### Fixed

- EasyMotion (`<leader><leader>w/j/f`) and hint mode (`<leader><leader>h`) now work with any leader key, including space (`let mapleader = " "`) and comma. Previously, leader keys with default Vim bindings (space → forward char, comma → reverse repeat find) were consumed immediately by codemirror-vim before the multi-key sequence could accumulate. Fixed by unmapping the leader key's conflicting default binding before registering EasyMotion `mapCommand` entries. ([#6](https://github.com/saberzero1/motions/issues/6))
- Vimrc `let mapleader = " "` (space) now correctly sets the leader key. The parser previously split the line by whitespace, losing the space inside quotes. Added regex-first parsing for `let` to preserve quoted values containing whitespace.
- Vimrc loading no longer falsely reports "loaded but contained no commands" when the editor isn't ready. `loadVimrc` now distinguishes "editor not available" (`ready: false`, retries on next event) from "file parsed with 0 commands" (`ready: true`). Includes a retry loop (up to 10 attempts, 100ms apart) to handle the race between `active-leaf-change` and editor initialization.
- Leader-dependent features (EasyMotion, hint mode) are re-registered after vimrc loading resolves the leader key, ensuring they use the user's configured leader instead of the default backslash.
- Visual mode selection on markdown text objects (`vi*`, `va*`, `vi$`, `va$`, `vi~`, `va~`, `vi=`, `va=`, `vi_`, `va_`, `` vi` ``, `` va` ``, `vil`, `val`, `viC`, `vaC`, `viB`, `vaB`, `vio`, `vao`, `vit`, `vat`) now selects the correct range — previously selected one character too far to the right. Operators (`d`, `y`, `c`) were unaffected. Root cause: codemirror-vim's `makeCmSelection` adds +1 to the head position in visual mode, and built-in text objects compensate via an internal `expandSelection` helper, but custom `defineMotion` text objects bypassed that path. ([#4](https://github.com/saberzero1/motions/issues/4))
- `]b` with a single buffer no longer opens a stale file from a previous session's recent-files list.
- `vgq` (visual mode `gq`) no longer triggers macro recording. The `vim-keypress` handler for macro recording previously intercepted the `q` keystroke in `gq` as a macro-record toggle. Fixed by restricting macro recording to normal mode only (matching Vim behavior), tracking previous keypress to detect `g`-prefixed operator sequences, and cancelling pending record state on mode changes. ([#5](https://github.com/saberzero1/motions/issues/5))

### Added

- `VimRegistration.unmapDefaultBinding(key)` — removes a key's default codemirror-vim binding (e.g. `<Space>` → `l`) so `mapCommand` multi-key sequences starting with that key can accumulate in the input buffer.
- `VimrcLoadResult.ready` field — distinguishes "editor not available" from "file parsed successfully", enabling reliable retry logic for vimrc loading.
- E2E tests for EasyMotion with space and comma as leader keys, verifying the `unmap` + `mapCommand` approach works for keys with default Vim bindings.
- E2E test for EasyMotion surviving settings hot-reload (disable → re-enable cycle).
- `getSelection()` test helper for asserting exact visual mode selections.
- `loadSingleFileWorkspace()` test helper using `obsidianPage.loadWorkspaceLayout()` to set up deterministic single-file workspace state with an empty recent-files list.
- 14 new E2E tests verifying exact visual mode selection for all delimiter-based text objects (`*`, `$`, `~`, `=`, `_`, `` ` ``), plus regression guards for operator mode.
- E2E tests for `gq` in visual mode (wrap + no macro recording), `gqq` macro non-interference, and standalone `q` macro recording start/stop.
- 3 Neovim golden comparison cases for `gq` operators (`gqq`, `Vgq`, `gqj`) added to the `g-commands` suite with content deviation registered (Markdown-aware wrapping differs from Neovim's plain-text `gq`).

### Changed

- `registerEasyMotion()` now calls `reg.unmapDefaultBinding(leader)` before registering `mapCommand` entries, allowing any single-character leader key to work.
- `registerWorkspaceNavigation()` hint mode binding uses the resolved leader key from `LeaderRegistry` (same approach as EasyMotion).
- `createHintModeAction()` return type narrowed from `ActionFn` to `() => void` (the function ignores all parameters).
- `VimrcLoadResult` gains `ready: boolean` field; `loadVimrc()` returns `ready: false` when the editor adapter is unavailable.
- Vimrc `active-leaf-change` callback retries `loadVimrc` up to 10 times when the editor isn't ready, then re-registers leader-dependent features after successful load.
- `KNOWN_LIMITATIONS.md`: "EasyMotion leader key conflict with `mapCommand`" marked as fixed; added vimrc parser space-handling context.
- `KNOWN_LIMITATIONS.md`: added "Visual mode on single-character text objects" section documenting a codemirror-vim edge case where `vi*` on `*x*` (1-char inner content) does not select correctly.

## [0.6.0] - 2026-06-21

### Fixed

#### Neovim deviation closure

- `di*`/`da*` with cursor on delimiter now correctly no-ops — previously the delimiter scanner treated the delimiter position as "inside", operating on the text. Matches Neovim behavior.
- `diB`/`daB` on nested blockquotes (`>>`) now correctly scopes to the innermost nesting level — previously deleted all blockquote content regardless of depth.
- `P` (paste before cursor) now places cursor on the last pasted character, matching Neovim — previously CM Vim placed cursor one position further.
- Rewrote `gP`/`gp` to use direct register-reading implementation instead of delegating through `Vim.handleKey`, avoiding re-entrancy issues with the new `P` override.

#### Neovim test infrastructure

- Ex commands (`:s`, `:sort`, `:d`, `:yank`, `:join`, `:noh`, `:undo`, `:redo`, `:global`) now work correctly in Neovim golden comparison tests — added `dispatchVimKeys` routing that detects Ex command sequences and dispatches them via `Vim.handleEx()` instead of character-by-character key input.

### Changed

- `test/neovim/deviations.ts` reduced from 28 to 19 entries (9 removed, 3 new cursor-position deviations added for Ex commands where content is correct but cursor placement differs from Neovim).
- `KNOWN_LIMITATIONS.md` behavioral deviations table expanded with 5 entries for confirmed upstream constraints (`dG`, `>>`, `V+>`, `d0`, `<<`) that cannot be intercepted via `mapCommand` due to codemirror-vim's operator-pending dispatch architecture.

### Added

#### Neovim golden comparison testing

- Neovim-backed golden comparison system for Tier 1 Vim behavior tests, inspired by Zed editor's `NeovimBackedTestContext`. Sends identical keystrokes to both Obsidian and a headless Neovim instance, compares resulting editor state (content, cursor, mode).
- `test/neovim/client.ts` — Neovim RPC client wrapping the official `neovim` npm package. Spawns `nvim --embed --headless`, provides `setContent()`, `setCursor()`, `input()`, `getContent()`, `getCursor()`, `getMode()`, `getRegister()`.
- `test/neovim/compare.ts` — state comparison helpers: `getObsidianState()`, `getNeovimState()`, `compareStates()`.
- `test/neovim/golden.ts` — golden file read/write infrastructure with `loadGoldenFile()`, `saveGoldenFile()`, `findGoldenCase()`.
- `test/neovim/deviations.ts` — known deviation registry tracking behavioral differences from Neovim. `isKnownDeviation()` silently allows expected behavioral differences during golden comparison.
- `test/neovim/test-wrapper.ts` — `testWithNeovim()` function: the primary test format for Tier 1 tests. Operates in playback mode (golden files, no Neovim needed) or compare mode (`NEOVIM_COMPARE=1`, live Neovim).
- `test/neovim/test-definitions.ts` — 199 test case definitions across 16 suites covering motions, operators, text objects, editing, yank/put, insert entry, visual mode, g-commands, bracket commands, insert mode, scroll (Ctrl-A/X), and Ex commands.
- `test/neovim/record-golden.ts` — standalone script to record golden files from Neovim without running Obsidian. Usage: `npm run test:neovim-record`.
- `test/neovim/smoke.ts` — Neovim client smoke test. Usage: `npm run test:neovim-smoke`.
- 16 golden files in `test/neovim/golden-data/` recorded against Neovim 0.12.2.
- npm scripts: `test:neovim-smoke`, `test:neovim-record`, `test:neovim-compare`.

#### Edge-case test expansion

- 110 new edge-case tests translated from Neovim's legacy test suite (`test/old/testdir/`), replit/codemirror-vim (`test/vim_test.js`), and VSCodeVim (`test/motion.test.ts`).
- Word motion edge cases: `w`/`b`/`e`/`ge` across empty lines, at document boundaries, with punctuation, count clipping, line wrapping.
- Operator edge cases: `dw` at end of line, `dd` on last/only line, `d2w`/`2dd`, `D`, `dk`, `dj` on last line, `de`/`db`, `dG`/`dgg`, `dfx`/`dtx`, `cw` vs `ce`, `cc`/`C`/`2cc`.
- Text object edge cases: `iw`/`aw` on whitespace, `iW`/`aW` with mixed punctuation, nested `i(`/`i{`/`i[`, `di(` across lines, `d2aw` with count, `i"` with escaped quotes.
- Character search edge cases: `f`/`t` not crossing line boundaries, `2t`/`2F` counts, `;` after `t`, `,` reversal.
- Visual mode edge cases: `viw`, `v3l+d`, `gv` reselect, `V+y` linewise, visual at document boundaries.
- Yank/register edge cases: `yy`/`yw` linewise flag, `y$` without newline, numbered register rotation, `"Ayy` append, `".` last inserted text.
- Repeat edge cases: `.` after `dw`/`>>`/`cw+text`, `3.` with count.
- Search edge cases: `*`/`#` wrap-around.
- Mark edge cases: mark persistence after edit, `'.` jump to last change.

### Fixed

- `test/coverage-report.ts` — replaced broken regex YAML parser with proper YAML parsing via the `yaml` package, fixing `npm run test:coverage` which previously reported 0/0 on the multi-line manifest format.

### Changed

- Replaced `js-yaml` dependency with [`yaml`](https://github.com/eemeli/yaml) — better maintained, YAML 1.2 spec-compliant, ships its own types.
- All 16 Tier 1 test files (`test/specs/vim-builtin/*.e2e.ts`) now use `testWithNeovim()` as the primary test format alongside existing `it()` blocks. Neovim lifecycle hooks (`startNvim`/`stopNvim`) added to top-level `before`/`after`.
- `test/helpers.ts` — added `vimRawKeys()` for raw byte key sequences (supports `\x1b` for Escape, `\x01`-`\x1a` for Ctrl keys, `\n` for Enter).

### Documentation

- README: added "Testing strategy" section describing the Neovim golden comparison system, test types (`[nvim]`/`[obsidian]`/Tier 2), and available test commands.
- `KNOWN_LIMITATIONS.md`: added "Test-discovered behavioral discrepancies" section documenting 6 bugs found during edge-case test translation (`dG` trailing newline, `iB` nesting, `di*` on delimiter, dot-repeat of `cw`, `)` cursor off-by-one, `n`/`N` wrap-around).

## [0.5.1] - 2026-06-19

### Fixed

- `.obsidian.vimrc` is now also loaded on startup, instead of only on leaf change.

## [0.5.0] - 2026-06-18

### Added

#### New Vim commands

- `Q` — replay last recorded macro (Neovim default, maps to `@@`)
- `Y` — yank to end of line (Neovim default, maps to `y$`; overrides CM Vim's `yy` behavior)
- `ga` — show character info under cursor (codepoint, hex, octal) via Notice
- `gp` — paste and move cursor past pasted text
- `gn` / `gN` — select next/previous search match (CM Vim native, now tested)
- `g;` / `g,` — jump to older/newer change position (changelist navigation)
- `zO` / `zC` / `zA` — recursive fold open/close/toggle (maps to Obsidian's fold commands)
- `it` / `at` — HTML/XML tag text objects, implemented via raw text scanning since CM Vim's built-in `expandToTag` is inactive in Markdown mode. Supports single-line, multiline, and nested tags.
- `<C-v>` — visual block mode (CM Vim native, now tested)

#### New Ex commands

- `:e {file}` / `:edit {file}` — open file by name in vault
- `:e!` / `:edit!` — revert current file to saved version
- `:enew` — create new untitled note
- `:saveas {file}` — save current buffer as new file
- `:update` / `:up` — save current file (alias for `:w`)
- `:x` / `:xit` — write-if-modified and close
- `:xa` / `:xall` — write-if-modified all and close all
- `:find {file}` / `:fin` — find and open file by partial name match
- `:read {file}` / `:r` — insert file contents at cursor position
- `:b {name}` / `:buffer {name}` — switch to tab matching name
- `:bf` / `:bfirst` — go to first tab
- `:bl` / `:blast` — go to last tab
- `:bw` / `:bwipeout` — close current tab
- `:sp` / `:split` — horizontal split
- `:vs` / `:vsplit` — vertical split
- `:new` — horizontal split with new note
- `:vnew` — vertical split with new note
- `:tabnew` / `:tabedit` — open new tab (optionally with file)
- `:tabclose` / `:tabc` — close current tab
- `:tabonly` / `:tabo` — close all other tabs
- `:tabfirst` / `:tabrewind` — go to first tab
- `:tablast` / `:tabl` — go to last tab
- `:version` / `:ve` — show plugin version
- `:delmarks {marks}` — delete specified marks
- `:changes` — show change list in modal

#### Test infrastructure

- Shared test helpers module (`test/helpers.ts`) with `setupEditor`, `getCursorPos`, `getEditorValue`, `getRegisterContent`, `getVimMode`, `vimKeys`, and timing constants
- `unsupported()` and `deviation()` test helpers for documenting known limitations and behavioral differences in test reports
- Neovim command index manifest (`test/neovim-command-index.yaml`) tracking 227 commands with tier classification, test status, and test file references
- Coverage report script (`test/coverage-report.ts`) — run via `npm run test:coverage`
- 16 new test files in `test/specs/vim-builtin/` covering normal mode motions, search, editing, yank/put, insert entry, scroll, marks/jumps, g-commands, z-commands, bracket commands, text objects, operators, visual mode, insert mode, and Ex commands
- 7 spike tests for register access, paste marks, editor extensions, tag text objects, CM Vim Ex command probing, Ex command conflict checking, and vimrc mapping diagnostics
- Comprehensive E2E test coverage for `<C-w>h/j/k/l` pane focus, `H`/`M`/`L` screen-relative motions, `?` backward search, `zO`/`zC`/`zA` recursive folds, and all new Ex commands
- E2E test for scrolloff hot-reload: verifies scroll margins update when `scrolloffLines` changes
- E2E test for `Y`/`Q` independence from workspace navigation: verifies `Y` still yanks to end of line when workspace nav is disabled
- GitHub issue templates (bug report, feature request) with required KNOWN_LIMITATIONS.md checklist

### Fixed

- Scrolloff now works correctly — previously used CSS `scroll-padding` which CodeMirror 6 ignores (it uses manual scroll calculations, not `Element.scrollIntoView`). Replaced with `EditorView.scrollMargins` facet, which CM6 respects when scrolling the cursor into view
- Scrolloff setting now applies immediately when changed in settings — previously required a plugin reload because the slider's `onChange` handler did not trigger `reloadFeatures()` and `reloadFeatures()` itself had no scrolloff handling
- Removed deprecated `setDynamicTooltip()` call on scrolloff slider — the value is now always shown inline by Obsidian
- `Y` (`y$`) and `Q` (`@@`) Neovim default remaps now work regardless of the "Workspace navigation" toggle — previously these were registered inside `registerWorkspaceNavigation()` and would stop working when workspace nav was disabled
- Vimrc loader now shows a Notice on load: reports the number of commands applied on success, warns when the file is not found, and warns when the file contains no commands
- Vimrc commands are now processed through codemirror-vim's Ex command handler (`handleEx`) instead of the programmatic API, matching obsidian-vimrc-support's approach for improved compatibility
- ESLint `import/no-extraneous-dependencies` error on `@codemirror/view` — added `import/core-modules` setting and `peerDependencies` for `@codemirror/*` packages provided by Obsidian at runtime
- Removed unused variables: `totalLines` in `tag.ts`, `openEndIndex`/`closeStartIndex` in `tag.ts`, `active` in `commands.ts`, `newLeaf` in `commands.ts`

### Changed

- Scrolloff implementation rewritten from CSS `scroll-padding` inline styles to `EditorView.scrollMargins` extension registered via `registerEditorExtension`. The `ScrolloffManager` class no longer manages event listeners or DOM manipulation — it updates a shared margin variable read by the CM6 facet callback.
- Refactored 8 existing test files to use shared helpers from `test/helpers.ts` instead of locally defined `getEditorValue`, `getCursorLine`, and `vimKeys` functions
- Test-vault `hotkeys.json` now unbinds Obsidian shortcuts that conflict with Vim commands (`Ctrl+W`, `Ctrl+N`, `Ctrl+P`, `Ctrl+S`, `Ctrl+O`)
- Tag text objects (`it`/`at`) changed from `unsupported` skip to working plugin-implemented text objects
- `ChangeList` class gains `getEntries()` and `getIndex()` public accessors for the `:changes` Ex command
- `Y` and `Q` Neovim default remaps moved from `registerWorkspaceNavigation()` to the always-on initialization path in `onload()` and `reloadFeatures()`
- Vimrc loader's `loadVimrc()` now returns a `VimrcLoadResult` with `found`, `commandCount`, `path`, and `maps` fields
- Vimrc loader refactored to use `vim.handleEx()` for command application instead of direct `vim.map()`/`vim.setOption()` API calls, improving compatibility with obsidian-vimrc-support configurations
- Vimrc loader now collects parsed map commands as `DeferredMap` entries and re-applies them via `vim.map()`/`vim.noremap()` on subsequent `active-leaf-change` events, attempting to restore mappings that CM Vim may lose during editor reinitialization
- Vimrc loader intercepts `set textwidth=N` / `set tw=N` lines and directly updates the plugin's internal `textwidthValue`, bypassing CM Vim's option callback chain
- `getTextwidth()` now reads from CM Vim's option via `Vim.getOption('textwidth')` as a fallback when the plugin's internal value hasn't been updated
- Vimrc loading deferred to first `active-leaf-change` event to guarantee editor availability, matching obsidian-vimrc-support's loading strategy

### Documentation

- README: added `:wa` / `:wall` to Ex commands table, `g<C-t>` to workspace keybindings table
- README: corrected `set textwidth=N` claim — now notes the known limitation and provides the runtime workaround via developer console
- `KNOWN_LIMITATIONS.md` expanded with comprehensive "Neovim Ex commands not applicable in Obsidian" section covering 30+ commands across 8 categories (shell, quickfix, tags, scripting, diff, etc.) with specific reasoning
- `KNOWN_LIMITATIONS.md` expanded with "Behavioral deviations" section documenting 6 commands that work differently from Neovim (`Y`, `Q`, `:wall`, `gf`, `zO`/`zC`/`zA`, `it`/`at`)
- `KNOWN_LIMITATIONS.md`: added "`nmap L $` does not work via vimrc" section with full diagnostic findings
- `KNOWN_LIMITATIONS.md`: added "`set textwidth` via vimrc does not affect `gq`" section with root cause analysis
- `KNOWN_LIMITATIONS.md`: replaced "Scrolloff cleanup on disable" section with "Scrolloff line height assumption" (22px hardcoded)

## [0.4.0] - 2026-06-14

### Changed

- **Lowered minimum Obsidian version from 1.13.0 to 1.1.1** — audited all Obsidian API usage and confirmed no API newer than 0.13.8 is required. Users on Obsidian 1.1.1 and later can now use the plugin.
- Replaced Obsidian's `setCssProps` prototype augmentation with standard `el.style.setProperty()` calls in EasyMotion and hint mode. Removes dependency on an undocumented global API whose introduction version is unknown, improving backward compatibility.
- Prefixed all plugin-owned CSS custom properties with `--vim-motions-` to avoid collisions with other plugins or themes:
    - `--em-left` → `--vim-motions-em-left`
    - `--em-top` → `--vim-motions-em-top`
    - `--hint-left` → `--vim-motions-hint-left`
    - `--hint-top` → `--vim-motions-hint-top`
    - `--hint-opacity` → replaced with `.is-dimmed` CSS class (avoids inline style assignment)

### Added

- E2E tests for blockquote text objects (`iB`/`aB`) and callout text objects (`io`/`ao`)
- E2E tests for buffer navigation (`]b`/`[b`)
- E2E tests for EasyMotion interaction (overlay appearance, dismissal, line/char label variants)
- E2E tests for workspace operations: splits (`<C-w>v`/`<C-w>s`), folds (`zc`/`zo`/`zM`/`zR`), tab navigation (`gT`), file switcher (`gf`), rename (`grn`), backlinks (`grr`), document stats (`g<C-g>`)
- E2E tests for ex commands with effect verification: `:q`, `:wq`, `:bp`, `:only`, `:back`, `:forward`, `:explorer`, `:ls`
- E2E tests for quality-of-life features: status bar mode display (NORMAL/INSERT/VISUAL), which-key overlay, ex command suggest
- E2E tests for settings hot-reload: toggling text objects, navigation, status bar, and EasyMotion on/off
- E2E tests for operator edge cases: bullet/numbered/nested list prefix preservation in `gq`, `gqj` (two-line wrap), `gqip` (paragraph reflow)
- E2E tests for text object edge cases: empty delimiters (`****`, `~~~~`, `====`), visual mode selection (`vi*`), yank (`yi*`)
- E2E tests for navigation edge cases: heading levels `]3`/`]4`/`[3`, ordered list navigation, last-heading boundary, cross-line link jumps

## [0.3.0] - 2026-06-14

### Fixed

- `gd` on wiki links with display names (`[[file|display name]]`) now correctly navigates to the file instead of creating a new file with the display name in the path
- `gd` on wiki links with heading fragments (`[[file#heading|display]]`) correctly preserves the heading target
- EasyMotion keybindings (`<leader><leader>w/j/f`) now work — previously registered as literal `<leader>` strings in `mapCommand` which could never match typed input
- Hint mode (`<leader><leader>h`) same fix as EasyMotion
- Leader key bindings configured via settings UI or `.obsidian.vimrc` now work when workspace navigation is disabled — `:ob` ex command is registered unconditionally instead of only when workspace nav is on
- Leader key bindings no longer silently fail when obsidian-vimrc-support is installed — removed unnecessary guard that skipped `:ob` registration
- Leader key bindings survive settings hot-reload — `:ob` is re-registered in `reloadFeatures()` so it isn't left as a noop after toggling any setting
- Which-key overlay now dismisses when a key is pressed after it appears — previously `show()` reset `pendingLeader` state, preventing dismissal
- Which-key overlay no longer leaks `active-leaf-change` event listeners on destroy
- `ExCommandSuggest` is rebuilt after settings hot-reload so the completion list stays current

### Added

- `]c` / `[c` as alternative keybindings for table cell navigation, for keyboards where `|` requires AltGr or modifier keys
- EasyMotion and hint mode bindings now appear in the which-key overlay
- Which-key overlay rebuilds after settings hot-reload

### Changed

- Plugin initialization order restructured: leader key resolution (vimrc loading) now happens before feature registration, so EasyMotion and hint mode receive the correct leader key
- `registerObCommand` extracted as a standalone function, called unconditionally in both `onload()` and `reloadFeatures()`
- `LeaderBinding` now tracks `source` (`'builtin'` or `'user'`) to support selective clearing during hot-reload
- `LeaderRegistry` gains `clearBuiltinBindings()` for clean re-registration during `reloadFeatures()`
- `registerEasyMotion()` and `registerWorkspaceNavigation()` accept `LeaderRegistry` parameter

## [0.2.0] - 2026-06-13

### Fixed

- Vimrc path now uses `Vault.configDir` instead of hardcoded `.obsidian`, supporting custom config directories
- Setting descriptions use dynamic config directory path
- `:ob` with no arguments now opens a searchable modal listing all command IDs instead of logging to the developer console
- Coexistence E2E test now opens a file before assertions, fixing CI race condition
- Removed deprecated `setDynamicTooltip()` call on scrolloff slider

## [0.1.0] - 2026-06-13

### Added

#### Markdown text objects

- `i*` / `a*` — inside/around bold (`**...**`) or italic (`*...*`), with smart disambiguation
- `i_` / `a_` — inside/around italic (`_..._`)
- `` i` `` / `` a` `` — inside/around inline code
- `i$` / `a$` — inside/around math (`$...$`)
- `i~` / `a~` — inside/around strikethrough (`~~...~~`)
- `i=` / `a=` — inside/around highlight (`==...==`)
- `il` / `al` — inside/around links (`[[wikilink]]` or `[text](url)`)
- `iC` / `aC` — inside/around fenced code blocks
- `iB` / `aB` — inside/around blockquotes
- `io` / `ao` — inside/around callouts
- All delimiter-based text objects work across multiple lines (20-line scan limit)

#### Structural navigation

- `]h` / `[h` — next/previous heading (any level)
- `]1`–`]6` / `[1`–`[6` — next/previous heading by specific level
- `]l` / `[l` — next/previous list item (same indent level)
- `]n` / `[n` — next/previous link
- `]b` / `[b` — next/previous open buffer (tab), with fallback to recent files
- `]|` / `[|` — next/previous table cell

#### Operators

- `gq` — hard-wrap text at textwidth (default 80) with Markdown-aware prefix preservation (blockquotes, lists, nested structures)
- `gw` — same as `gq` but keeps cursor at original position

#### Workspace navigation

- `<C-w>h/j/k/l` — focus pane left/down/up/right
- `<C-w>v` / `<C-w>s` — split vertical/horizontal
- `<C-w>c` / `<C-w>q` — close current tab
- `<C-w>o` — close all other tabs
- `gt` / `gT` — next/previous tab
- `gd` — go to definition (follow link under cursor)
- `gx` — open URL under cursor in browser
- `gf` — open file switcher (quick open)
- `gO` — document outline navigator (searchable heading list)
- `grn` — rename current note
- `grr` — show backlinks to current note
- `gra` — context-aware actions for cursor position
- `g<C-g>` — show document statistics (words, lines, characters)
- `za` / `zc` / `zo` — toggle/close/open fold at cursor
- `zM` / `zR` — fold all / unfold all

#### Ex commands

- `:w` / `:write` — save current file
- `:q` / `:quit` — close current tab
- `:wq` — save and close
- `:bn` / `:bp` — next/previous tab
- `:bd` / `:bc` — close current tab
- `:only` — close all other tabs
- `:qa` / `:quitall` — close all tabs
- `:wa` / `:wall` — save all
- `:ob {command-id}` — execute any Obsidian command by ID
- `:ob` — list all available command IDs
- `:sidebar left` / `:sidebar right` — toggle sidebar
- `:explorer` — reveal active file in file explorer
- `:buffers` / `:ls` — show all open buffers in a modal
- `:backlinks` — show backlinks to current note in a modal
- `:grep {pattern}` — search vault for text, show results in a modal
- `:back` / `:forward` — navigate back/forward in history
- `:reg` / `:registers` — show register contents in a modal
- `:marks` — show marks and their positions in a modal

#### EasyMotion / Hop

- `<leader><leader>w` — label every word start in the viewport
- `<leader><leader>j` — label every non-empty line
- `<leader><leader>f{char}` — label every occurrence of a character
- `<leader><leader>h` — hint mode (Vimium-style labels for clickable UI elements)

#### Quality of life

- Vim mode status bar showing NORMAL / INSERT / VISUAL / REPLACE
- Macro recording indicator showing RECORDING @{register} in status bar
- Which-key hints overlay when leader key is pressed
- Ex command tab completion via Tab key
- Scrolloff (configurable visible lines above/below cursor)
- Configurable insert escape sequence (e.g., `jk` to exit insert mode via `set insertmodeescape=jk`)
- Settings hot-reload (toggle features without restarting Obsidian)

#### Vimrc loader

- Built-in `.obsidian.vimrc` support compatible with obsidian-vimrc-support syntax
- Supported commands: `map`, `nmap`, `imap`, `vmap`, `noremap`, `nnoremap`, `inoremap`, `vnoremap`, `unmap`, `set`, `let mapleader`, `exmap`, `obcommand`, `source`
- Supported `set` options: `clipboard`, `tabstop`/`ts`, `textwidth`/`tw`, `shiftwidth`/`sw`, `expandtab`/`et`, `insertmodeescape`/`ime`
- Leader key replacement in mappings (`<leader>` token)
- Leader key propagation to sourced files

#### Settings

- Independent toggles for all feature groups
- Leader key bindings table (add/remove key-to-command mappings without editing vimrc)
- Scrolloff slider (0–20 lines)
- EasyMotion label character customization
