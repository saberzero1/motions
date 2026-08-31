# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions + `@obsidian-typings/obsidian-public-latest` (devDependency — community-maintained type definitions for Obsidian's unofficial/internal APIs). Configured in `tsconfig.json` `"types"` array. Key typed APIs used directly throughout the codebase: `App.commands`/`.embedRegistry`/`.internalPlugins`/`.plugins`/`.openWithDefaultApp()`/`.scope`, `Workspace.activeEditor`, `Vault.getConfig(ConfigItem)`, `Editor.cm`/`.addHighlights()`/`.removeHighlights()`/`.hasHighlight()`, `MarkdownView.editMode`/`.getMode()`, `WorkspaceLeaf.id`/`.pinned`/`.updateHeader()`/`.unhighlight()`, `SuggestModal.inputEl`, `PluginSettingTab.refreshDomState()`, `Keymap.pushScope()`/`.popScope()`, `InternalPlugins.getEnabledPluginById()`, `EmbedRegistry.embedByExtension`, `TableEditor` (full table widget API — imported from `@obsidian-typings/obsidian-public-latest`), `TableCell`/`TableRow`/`TableSelectionBounds`/`CellDirection`/`CellPosition`/`CursorPlacement`/`TableAlignment`. Utility wrappers in `src/util/` provide null-safe access — prefer those over direct property access for `Editor.cm`, `leaf.id`/`.pinned`, `View.file`, and `vault.getConfig()`.
- **codemirror-vim fork**: The plugin uses a fork of `@replit/codemirror-vim` at `~/Repos/codemirror-vim`. All core vim behavior changes go in the fork's `src/vim.js`. The fork has its own test suite (1884 browser tests) and Neovim golden comparison infrastructure (756 golden cases, 476 pass, 280 known deviations). The fork includes an operator-prefix shadow resolver (`operatorshadowtimeout` option, default 1000ms) that disambiguates operator-pending motions vs multi-key actions (e.g., flash `s` motion vs surround `s<character>` action) by deferring to partial matches with a configurable timeout fallback. The fork exposes `setLivePreviewField(field: StateField<boolean>)` so the host plugin can provide Obsidian's `editorLivePreviewField` — the fork's frontmatter properties navigation (`focusBefore` in `findPosV`) is gated on this field to avoid intercepting cursor movement in source mode. The fork exposes `setPropertiesSource(fn: () => boolean)` so the host plugin can indicate when frontmatter is rendered as source text in Live Preview (Obsidian's "Properties in document" = "Source") — the frontmatter interception is also skipped when this callback returns `true`, preventing the cursor from getting stuck on a hidden `.metadata-container`. The fork's `BlockCursorPlugin` unconditionally hides native CM6 cursor layers on every update (the fork renders its own cursor for every vim mode) and determines insert mode by checking `this.cm.state.vim.insertMode` directly instead of the `.cm-vimMode` DOM class (avoids CM6 ViewPlugin update ordering race). `caretColor` is set via `setProperty("caret-color", ..., "important")` — transparent in non-insert modes, accent color in insert mode. The fork exposes `setIdleEscapeCallback(fn)` so the host plugin can handle Escape in idle normal mode — the callback fires before the event is consumed, enabling context-aware dismiss logic (e.g., closing popovers via `HoverPopover.hide()` while silently consuming Escape in main editors). The fork exposes `setCursorSuppressed(suppressed: boolean)` and per-view overrides (`setCursorSuppressedForView`, `clearCursorSuppressedForView`, `isCursorSuppressedForView`) so the host plugin can suppress the fork's own vim cursor layer when using its own canvas-based animated cursor. Insert-mode surround (`<C-G>s`/`<C-G>S`) inserts both delimiters up front (matching vim-surround) and supports full dot-repeat — the fork stores `_surroundInsertChar`/`_surroundInsertNewline` on `lastInsertModeChanges` and replays them via `replaySurroundAwareInsert` inside `repeatLastEdit`, exceeding both vim-surround and nvim-surround where insert-mode surround dot-repeat is broken. The fork exposes `feedKeys(cm, keys, { noremap })` for programmatic key injection with correct noremap semantics — delegates to `doKeyToKey` with the internal `noremap` flag and `keyToKeyStack` recursion protection. Used by expr mapping result feeding. The fork exposes `undefineEx(name)` to remove ex commands registered via `defineEx` — cleans both `exCommands` and `commandMap_` prefix entries. Used by the plugin's vimrc soft-reload to clean up stale `exmap` handlers. The fork exposes `exitVisualMode(cm, moveToHead?)` so the host plugin can exit visual mode programmatically — used by `pasteInVisualMode()` after replacing the visual selection with register contents. The fork exposes `setOperatorfunc(fn)` and `getOperatorfunc()` to support the `g@{motion}` operator — the callback receives the motion type (`'line'`, `'char'`, or `'block'`) and the range is marked by `'[` and `']`. The fork exposes `resetForkedVimState()` and `resetCursorState()` to support runtime re-initialization during vim mode toggling. The fork uses a CM6 `eventObservers.keydown` (DOM event observer) instead of `eventHandlers.keydown` for vim's keydown processing — in CM6's dispatch order, observers run before handlers, guaranteeing vim fires first regardless of `Prec` ordering or plugin load order. The fork exposes `setKeyInterceptActive(active: boolean)` so the host plugin can suppress the observer during modal key-interception states (flash labels, EasyMotion labels, hint mode). The fork's `findKey` function uses a narrowed key consumption guard for unmatched keys in normal mode: single-character keys, text-producing special keys (`<Space>`, `<BS>`, `<Del>`, `<CR>`), and Mac Alt combos (`<A-x>`) are consumed silently; `<Esc>` and `<Ins>` are also consumed (`<Esc>` because `handleEsc()` returns `undefined` in idle normal mode but the keydown must not propagate to host DOM listeners; `<Ins>` to prevent CM6 overwrite toggle); functional/navigation keys (`<Tab>`, `<S-Tab>`, `<F1>`–`<F12>`, modifier combos like `<C-S-I>`) return `undefined` so they propagate to the host application. The fork's `paste` action falls back to `document.execCommand('paste')` via `fallbackToNativePaste()` when `navigator.clipboard.readText()` returns empty or rejects (non-text clipboard content such as images) — this triggers the host application's native paste pipeline. A `programmaticPaste` module-level flag suppresses the `getOnPasteFn` paste event listener during the fallback to prevent spurious insert-mode entry. The fork's `g0` motion uses a `goDisplayLineStart` exec command (via `view.moveToLineBoundary`) to unconditionally move to column 0 of the visual line — upstream used `cursorLineBoundaryBackward` which toggles between column 0 and first non-blank (Home-key behavior). `g^` uses a separate `moveToFirstNonBlankOfDisplayLine` handler that advances past leading whitespace from the visual line start. `g_` (`moveToLastNonWhiteSpaceCharacter`, inclusive) moves to the last non-blank character of the current line (or count-1 lines forward). The fork includes `@:` (repeat last ex command via `repeatLastExCommand` action with count support), `&` (repeat last `:s` substitution via `repeatLastSubstitute` action), `ZZ` (write+quit) and `ZQ` (quit without saving) defaultKeymap entries, insert-mode `<C-a>` (re-insert previously inserted text via `reinsertPreviousInsert`), `<C-e>` (copy character from line below via `copySameColumn below`), `<C-y>` (copy character from line above via `copySameColumnAbove`), `<C-G>u` (insert undo break), `<C-G>U` (suppress next undo break), `<C-G>j`/`k` (line navigation), and `0<C-D>`/`^<C-D>` (delete all indent). The fork implements `:move` and `:copy` ex commands with proper range and address support.
    - **IMPORTANT: dependency URL in `package.json`**: The `@replit/codemirror-vim` dependency MUST point to `https://github.com/saberzero1/codemirror-vim.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/codemirror-vim` for fast iteration, but **always switch back to the HTTPS URL before committing** — `file:../codemirror-vim` breaks CI, the community scanner, and anyone cloning the repo. Check `git diff package.json package-lock.json` before every commit to verify no local path leaked.
- **fengari fork**: The plugin uses a [browser-only fork of fengari](https://github.com/saberzero1/fengari) at `~/Repos/fengari` for the Lua 5.3 runtime. The fork strips all Node.js dependencies (`fs`, `child_process`, `os` module, `readline-sync`, `tmp`) and ships with zero runtime dependencies (`sprintf-js` replaced with a custom `luaSprintf` formatter). Integers are widened from 32-bit to 53-bit (`math.maxinteger = 9007199254740991`); bitwise operations remain 32-bit (JS platform limitation). `string.packsize("j")` returns 8. `__gc` metamethods on userdata are supported via `FinalizationRegistry` (finalization order unspecified; tables not finalized; drain at `luaD_pcall` return, `collectgarbage("collect")`, and `lua_close`). `collectgarbage()` returns safe no-op values for all modes (was `luaL_error`). The plugin installs a `lua_atnativeerror` handler so native JS errors (TypeError, etc.) produce extractable Lua error strings instead of being lost. See the fork's [`DIFFERENCES.md`](https://github.com/saberzero1/fengari/blob/master/DIFFERENCES.md) for the full list of changes from upstream.
    - **IMPORTANT: dependency URL in `package.json`**: The `fengari` dependency MUST point to `https://github.com/saberzero1/fengari.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/fengari` for fast iteration, but **always switch back to the HTTPS URL before committing** — same rules as the codemirror-vim fork.
- **codemirror autocomplete fork**: The plugin uses a fork of `@codemirror/autocomplete` at `~/Repos/autocomplete` for the snippet system. The fork extends the snippet parser with choice nodes, transforms, and nested placeholders (Phases 2+). See the fork's `DIFFERENCES.md` for changes from upstream.
    - **IMPORTANT: dependency URL in `package.json`**: The `@codemirror/autocomplete` dependency MUST point to `https://github.com/saberzero1/autocomplete.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/autocomplete` for fast iteration, but **always switch back to the HTTPS URL before committing** — same rules as the codemirror-vim and fengari forks.
    - **IMPORTANT: esbuild externals**: `@codemirror/autocomplete` is deliberately **removed** from the `external` list in `esbuild.config.mjs` so the fork is bundled into `main.js` (same pattern as `@replit/codemirror-vim`). Do not re-add it to externals.
    - **What's stripped**: Lua `io` library (entire file), Lua `package`/`require()` system (entire file), Node.js-only `os` functions (`exit`, `getenv`, `remove`, `rename`, `tmpname`, `execute`), `debug.debug()` interactive REPL, file loading (`luaL_loadfilex`), `process.stdout`/`process.stderr`/`process.env` references
    - **What's kept in the fork**: Core VM, all safe standard libraries (base, string, table, math, coroutine, utf8), browser-safe `os` functions (date, time, difftime, clock, setlocale), debug library (minus `debug.debug()`). Zero runtime dependencies (custom `luaSprintf` replaces `sprintf-js`).
    - **What the plugin loads**: The plugin's `engine.ts` only opens 6 libraries: `_G`, `string`, `table`, `math`, `coroutine`, `utf8`. The `os` and `debug` libraries are available in the fork but are **not loaded** into the Lua sandbox. Users cannot access `os.*` or `debug.*` functions. `load()` is re-enabled as a sandboxed string-only compiler (file-based loading remains disabled). `require()` is implemented in Lua on the plugin side, loading modules from `lua/` in the vault root via the coroutine↔Promise bridge.
    - **Coroutine↔Promise bridge**: `src/lua/coroutine-runner.ts` implements async Lua execution using fengari's `lua_yieldk` continuations. Lua callbacks can call async APIs (e.g., `vim.ob.fs.read`) which yield the coroutine; the JS host awaits the Promise and resumes with the result. The bridge manages thread lifecycle, instruction hooks (per-thread), 10s timeout, 16-coroutine concurrency limit, and error propagation via `nil+errmsg` protocol compatible with `pcall`. Snippet `f()`/`d()` nodes are blocked from async via `setAsyncBlocked()`.
    - **Plugin-side Lua API** (built on top of fengari, implemented in `src/lua/`): `vim.opt`, `vim.g`, `vim.v` (20 predefined variables: count/count1/register/operator, searchforward, insertmode, numbermax/min/size, true/false/null, fold/statuscolumn/event/char/hlsearch), `vim.cmd`, `vim.keymap.set`/`del` (including buffer-local and `{ expr = true }` for function callbacks), `vim.api` (16 `nvim_*` functions: user commands, autocmds, augroups, buffer lines, buffer keymaps, highlights, namespaces), `vim.fn` (27 functions), `vim.tbl_*` (12 table utilities), `vim.split`/`vim.trim`/`vim.startswith`/`vim.endswith`/`vim.inspect`/`vim.json`/`vim.deepcopy`, `vim.regex` (ECMAScript RegExp wrapper with `match_str`/`match_line`/`match_pos`/`replace`/`test`), `vim.schedule`/`vim.defer_fn`/`vim.uv` (timers), `vim.notify` (with log levels), `vim.obsidian`/`vim.ob` (Obsidian-specific namespace, including `vim.obsidian.im` for input method switching (per-view across all editors), `vim.ob.fs.read`/`readlines` for async file reading), vim.textobject (custom text object registration via vim.gen_spec.pair), `vim.env` (sandboxed), `require()` (vault-local module loading from `lua/`), `load()` (sandboxed string compilation), `package.loaded`/`package.path`, 19 autocmd events (mode events and cursor/yank/cmdline events fire per-view across all editors via `AutocmdModeWatcher` and `AutocmdEventWatcher` CM6 ViewPlugins). See `docs/configuration/lua-config.md` for the full reference.

### Dual-vim architecture

The plugin operates in two modes:

- **Built-in vim mode**: When Obsidian's vim mode is enabled (`Settings → Editor → Vim key bindings`), the plugin uses Obsidian's bundled codemirror-vim via `window.CodeMirrorAdapter.Vim`.
- **Bundled fork mode**: When built-in vim is disabled, the plugin registers the fork as a CM6 extension via `registerEditorExtension()` and installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins (obsidian-vimrc-support, vim-im-control, etc.) can still discover the Vim API at the canonical location. The bridge also exposes `isCursorSuppressedForView` for cursor suppression state queries (used by e2e tests). Embedded editors (Oil, textarea vim) and native table cell editors receive the vim extension via Obsidian's `registerEditorExtension()` injection. Which-key popups in embedded editors use `WhichKeyOverlay.forEmbeddedEditor()` with dependency injection — each embedded editor creates its own `WhichKeyOverlay` instance with an injected adapter and container, sharing 100% of the key-handling logic with the main editor's which-key. The embedded which-key config is passed via `TextareaVimManager.updateOptions()` for textarea overlays. A post-construction safety net (`ensureVimExtension()` in `embeddable-editor.ts`) checks for vim presence via `getCM()` and appends it via `StateEffect.appendConfig` if the injection is absent (e.g., on a leaf that has never hosted a MarkdownView) — used for Oil and textarea editors; native table cell editors don't need it. The embeddable editor exposes `registerScopeKey()` so host views can register key handlers on the editor's Obsidian `Scope` — these fire before Obsidian's default hotkeys, enabling Oil to intercept `Ctrl+T/S/H/L/C` which would otherwise be swallowed by Obsidian's built-in hotkeys (new tab, save, search & replace, etc.). Escape handling uses `Scope.register([], 'Escape', ...)` with a modal overlay guard (`isHintModeActive()`, `isEasyMotionActive()`, `isFlashActive()`) followed by an `isVimIdle()` check that detects all compound-command sub-states (`inputState.operator`, `surroundState`, `inputState.keyBuffer`, `expectLiteralNext`) — the overlay guard prevents Escape from exiting the embedded editor while a key-interception overlay is active (Scope handlers fire independently of DOM event propagation, so `stopPropagation()` in the overlay's capture-phase listener does not suppress the Scope handler). This fires before vim's `eventObservers.keydown` observer, preventing parent scopes from intercepting Escape while vim has pending operations. The `onEscape()` callback is deferred via `requestAnimationFrame` so the Scope handler returns `true` (consuming the event) while the editor's scope is still on the keymap stack — synchronous teardown would pop the scope mid-handler, leaking the Escape to parent scopes. The embeddable editor uses a `_destroying` flag to prevent the blur event listener from double-popping the keymap scope during `destroy()`. The textarea-vim overlay enables `isolateKeyEvents` which stops `keydown`/`keyup` propagation to prevent key events from leaking to parent modal UI.

**Vim toggle**: The plugin supports toggling the fork's vim mode on/off at runtime via Obsidian commands (`toggle-vim-mode`, `enable-vim-mode`, `disable-vim-mode`) and the `vimEnabled` setting. This uses a mutable `Extension[]` array and `workspace.updateOptions()` to swap the vim extension without a plugin reload. Subsystems (Lua, vimrc, gutters, animated cursor) are automatically set up/torn down during the toggle.

Both modes expose an identical API surface. The fork provides additional capabilities: async motion support (for EasyMotion operator-pending), Neovim-correct cursor positioning, and various behavioral fixes.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

### Manual testing

- Build with `npm run build:dev` (development build — includes `__DEV__` runtime assertions, inline sourcemaps, and auto-copies artifacts to `test-vault/.obsidian/plugins/vim-motions/`).
- If testing in a different vault, copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.
- Use `:violations` in the editor command line to inspect any runtime invariant violations caught during the session.
- **Do not use `npm run build` for testing** — production builds strip `__DEV__` assertions and minify, making debugging harder.

### Automated testing

- **Framework**: WebDriverIO v9 + Mocha, running against a real Obsidian instance via `wdio-obsidian-service`.
- **Run**: `npm run test:e2e` (requires Xvfb + herbstluftwm on Linux, or native display on macOS).
- **Coverage**: `npm run test:coverage` — reports command-level coverage from `test/neovim-command-index.yaml` (427 commands tracked, 379 tested).
- **CI container image (Linux)**: The e2e workflow shards spec files into 36 groups (matching the GitHub Actions concurrent job limit) and runs each shard inside a custom Docker image (`ghcr.io/<repo>/e2e-runner:latest`) built from `.github/docker/e2e-runner/Dockerfile`. The discover job distributes specs round-robin; each runner executes 2–3 specs sequentially. This keeps the matrix under the 256-job GitHub Actions cap. The image includes Xvfb, herbstluftwm, Node.js 24, and Electron system dependencies. The entrypoint starts the virtual display with readiness polling before handing off to job steps — no per-runner `apt-get install` or `sleep`-based setup. The image is built and pushed to GHCR by `.github/workflows/docker-e2e-runner.yml` on changes to the Dockerfile or manual dispatch.
- **CI cross-platform (macOS/Windows)**: The same sharded spec distribution runs on `macos-latest` (ARM) and `windows-latest` runners via the `e2e-cross-platform` job. No virtual display setup is needed — GitHub macOS/Windows runners provide native GUI sessions. `wdio-obsidian-service` handles Obsidian download, ChromeDriver version matching, and platform-specific launch. `CSC_IDENTITY_AUTO_DISCOVERY=false` prevents macOS keychain prompts. 40-minute timeout per job. Windows shards retry up to 3 times on `EPERM` errors (Windows NTFS file locking during `obsidian-launcher`'s atomic rename in `onPrepare`).

**IMPORTANT: ChromeDriver version mismatch**

The e2e tests use Electron's built-in Chromium, and the system-installed ChromeDriver frequently mismatches the Electron/Chromium version bundled by Obsidian. This causes errors like `session not created: This version of ChromeDriver only supports Chrome version X` or similar WebDriver session failures.

**Fix**: Always run tests inside the Nix development shell:

```bash
nix develop
npm run test:e2e
```

The `flake.nix` in this repository (and in the `~/Repos/codemirror-vim` fork) pins compatible versions of ChromeDriver, Chromium, and other system dependencies. The same applies when running the fork's browser test suite — use `nix develop` there as well.

If you encounter ChromeDriver/Chromium mismatch errors, do **not** attempt to install or upgrade ChromeDriver globally. Use `nix develop` instead.

**Important: e2e test runtime**

The full e2e suite (`npm run test:e2e`) runs 79 spec files and takes approximately **22 minutes**. Each spec launches a fresh Obsidian instance. When running from an agent or script:

- Use a timeout of at least **1800000 ms** (30 minutes) to avoid premature termination.
- To run a subset, use `--spec` to target specific files:
    ```bash
    npx wdio run ./wdio.conf.mts --spec test/specs/vim-builtin/operator-combos.e2e.ts
    npx wdio run ./wdio.conf.mts --spec 'test/specs/vim-builtin/*.e2e.ts'
    ```
- The `test/specs/vim-builtin/` directory (~7 min) covers core Vim behavior and is the most relevant subset after fork changes.
- Individual spec files typically complete in 30–90 seconds.

### Neovim golden comparison

Tier 1 Vim commands are tested against a headless Neovim instance. The system records Neovim's output as golden JSON files; CI compares Obsidian's behavior against these without needing Neovim installed.

- **Golden files**: `test/neovim/golden-data/*.json` — committed to the repo, recorded against a pinned Neovim version.
- **Test definitions**: `test/neovim/test-definitions.ts` — single source of truth for test cases used by both golden recording and `testWithNeovim()` calls.
- **Deviation registry**: `test/neovim/deviations.ts` — known differences between the plugin and Neovim, each classified by category (`intentional`, `infra-limitation`, `upstream-bug`, `upstream-unsupported`, `recording-issue`). `[INFRA-SKIP]` warnings are emitted in CI output for infra-limitation deviations. Shrinking this list is the roadmap toward parity.
- **Golden enforcement**: `testWithNeovim()` requires a golden case to exist for every non-deviation test. If no golden case is found and the test is not in `deviations.ts`, the test fails with `"Missing golden case"`. This prevents silent passes when golden data is missing.
- **Record golden files**: `npm run test:neovim-record` (requires `nvim` binary).
- **Live comparison**: `NEOVIM_COMPARE=1 npm run test:e2e` (requires `nvim` binary).
- **Smoke test**: `npm run test:neovim-smoke` (requires `nvim` binary).

### Test file organization

- `test/specs/vim-builtin/` — Tier 1 tests (built-in CM Vim behavior). Use `testWithNeovim()` as primary format. Includes `new-commands.e2e.ts` (fork actions: `@:`, `&`, `ZZ`, `ZQ`, insert `<C-a>`/`<C-e>`/`<C-y>`), `new-commands-golden.e2e.ts` (golden tests for new fork actions), `link-nav-window-cycle.e2e.ts` (`<C-^>`, `<C-]>`, `<C-t>`, `<C-w>w`/`W`/`p`), `ex-move-copy-normal.e2e.ts` (`:m`, `:t`, `:normal`), `minor-motions-scroll.e2e.ts` (`gm`, `go`, `g8`, `gF`, `<C-g>`, `zs`/`ze`/`zH`/`zL`), `noop-commands.e2e.ts` (no-op crash guards).
- `test/specs/` — Tier 2 tests (plugin features: text objects, navigation, workspace, operators, vimrc, settings, jump list, table cell vim mode, vim toggle).
- `test/specs/spikes/` — exploratory/R&D tests.
- `test/unit/` — Vitest unit tests (jumplist, mark-store, lua engine, picker, invariants, mode-tracker, settings-resolution, dual-vim, animated-cursor, oil-parser, oil-diff, vimrc-parser, flash-labeler, fold-persistence, pair-util, etc.).
- `test/neovim/` — Neovim comparison infrastructure (client, compare, golden, deviations, wrapper, definitions, recording).
- `test/helpers.ts` — shared WDIO helpers (`setupEditor`, `vimKeys`, `vimRawKeys`, `vimHandleKeys`, `getCursorPos`, `getEditorValue`, `getVimMode`, `getRegisterContent`, `ensureLivePreview`, `ensureSourceMode`, `isLivePreview`, `isSourceMode`, `setPluginSetting`, `setPluginSettingAndReload`). All helpers that require a MarkdownView throw with context (e.g., `"setupEditor: no MarkdownView (active leaf type: graph)"`) instead of silently returning defaults. `setupEditor` uses `waitUntil` to verify content was applied. `loadSingleFileWorkspace` waits for the MarkdownView to become active. `ensureLivePreview`/`ensureSourceMode` wait for the mode to actually change. `setPluginSetting` awaits `saveSettings()`. `setPluginSettingAndReload` also calls `reloadFeatures()` and waits for settle. `vimHandleKeys` dispatches all keys synchronously through `Vim.handleKey()` in a single `executeObsidian` callback, bypassing DOM event timing. Used for visual-mode compound operations that fail with `vimRawKeys` DOM dispatch (via `useHandleKey` flag on `TestCaseDefinition`).
- `wdio.conf.mts` — WDIO configuration. Includes a global `afterTest` hook that cleans up overlays (hint, easymotion, which-key, ex-suggest), dismisses notices, closes picker modals via Escape dispatch, closes generic modals via close-button click, sends double `<Esc>` to Vim, and verifies cleanup succeeded (force-removes any surviving elements on second pass). Includes a `beforeSuite` hook that cycles vim mode (disable then enable) before every spec to detect regressions in the toggle mechanism.
- `test-vault/fixtures/` — vault fixture files for tests that need Obsidian's full rendering pipeline (link decoration, metadata cache). Organized by feature area (e.g., `fixtures/hint-mode/`). Fixture files are opened once in `before()` hooks to warm the link cache before tests run.

### Writing new Tier 1 tests

Use `testWithNeovim()` — do not hand-write expected values for behavior Neovim can verify:

```typescript
testWithNeovim('suite-name', 'test description', {
    content: 'initial buffer content',
    cursor: { line: 0, ch: 0 },
    keys: ['keystroke-sequence'],
});
```

Add a matching entry in `test/neovim/test-definitions.ts` and re-record golden files with `npm run test:neovim-record`.

For viewport-dependent behavior (H/M/L, scroll, folds), use regular `it()` blocks — headless Neovim has no viewport to compare against.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.
- **IMPORTANT: Dual settings tab — ALWAYS update BOTH.** The plugin has TWO settings implementations in `src/settings.ts`, both organized into 7 pages:
    - **Post-1.13** (declarative): `getSettingDefinitions()` returns `SettingDefinitionItem[]` with 7 `type: 'page'` entries (General, Appearance, Navigation, Keybindings, Snippets & files, Input method, Advanced). Each page contains its settings groups as `items`. Obsidian renders these as navigable sidebar entries.
    - **Pre-1.13** (imperative): `display()` renders a button tab bar (`vim-motions-settings-tabs`) and delegates to one of 7 private render methods (`renderGeneralTab`, `renderAppearanceTab`, `renderNavigationTab`, `renderKeybindingsTab`, `renderSnippetsFilesTab`, `renderInputMethodTab`, `renderAdvancedTab`). Tab state is tracked via `activeSettingsTab`.
    - When adding or modifying settings, **ALWAYS update both methods**. Forgetting one causes settings to be missing for users on the other Obsidian version. Search for the setting group heading (e.g., `'Animated cursor'`) in both the declarative page items and the imperative render method to verify both are present.
    - **Page assignment**: Mobile/Vim features/Picker/Vim engine → General. Line numbers/Gutter/Status bar/Mode prompts/Cursor shapes/Animated cursor/Yank highlight → Appearance. Jump navigation/Workspace navigation → Navigation. Vimrc/Leader/Which-key → Keybindings. Snippets/File explorer/Undo tree → Snippets & files. Input method → Input method. Advanced → Advanced. `vimEnabled` is in General.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.
- **Never use `!important` in CSS.** Obsidian plugins share the global stylesheet — `!important` is fragile and conflicts with themes. Instead, increase specificity by adding ancestor selectors (e.g., `.cm-editor .vim-motions-foo` instead of `.vim-motions-foo { prop: value !important }`). If an Obsidian core rule still wins, add more context to the selector chain rather than reaching for `!important`.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Documentation maintenance

The documentation site at `saberzero1.github.io/motions` is built from `docs/` using Quartz v5. Documentation updates are part of the implementation — a feature or fix is not complete until its docs are updated.

### Change-to-page routing

When making a change, update these docs pages:

| Change type                       | Docs pages to update                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New keybinding/motion             | `reference/keybindings.md` (canonical table) — feature pages transclude via `![[keybindings#Section]]` + `configuration/remapping.md` (if new ex command alias needed)                                                                                                                                            |
| New text object                   | `reference/keybindings.md` § "Markdown text objects" + `features/text-objects.md`                                                                                                                                                                                                                                 |
| New ex command                    | `reference/keybindings.md` § "Ex commands" + `features/ex-commands.md`                                                                                                                                                                                                                                            |
| New setting                       | `configuration/settings.md` (add to correct settings group)                                                                                                                                                                                                                                                       |
| New vimrc option                  | `configuration/vimrc.md` (add to correct options table)                                                                                                                                                                                                                                                           |
| New Lua API function/namespace    | `configuration/lua-config.md` (add to appropriate API section) + `KNOWN_LIMITATIONS.md` (update supported function count/list)                                                                                                                                                                                    |
| New feature (entire)              | New `features/<name>.md` + `features/index.md` (add link) + `reference/keybindings.md` (add section) + `configuration/settings.md` (if new settings)                                                                                                                                                              |
| Bug fix                           | `KNOWN_LIMITATIONS.md` (mark Fixed if applicable) — top-level `## ~~...~~ (Fixed)` sections go to the "Resolved Issues" section at the bottom; fixed sub-items (`### ~~...~~`, `- ~~...~~`) stay within their active parent section. `docs/reference/known-limitations.md` is auto-generated from this file in CI |
| New limitation                    | `KNOWN_LIMITATIONS.md` (add section) — `docs/reference/known-limitations.md` is auto-generated from this file in CI                                                                                                                                                                                               |
| Setting default changed           | `configuration/settings.md` (update default value)                                                                                                                                                                                                                                                                |
| Keybinding changed/removed        | `reference/keybindings.md` (update/remove) — feature pages auto-update via transclusion                                                                                                                                                                                                                           |
| Installation requirements changed | `getting-started/installation.md` + `getting-started/recommended-setup.md`                                                                                                                                                                                                                                        |
| CHANGELOG.md updated              | Nothing — auto-generated at build time by the docs workflow                                                                                                                                                                                                                                                       |

### Page ownership by feature area

| Feature area          | Canonical docs page                 | Settings group(s)                                                                                                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text objects          | `features/text-objects.md`          | Vim features (textobjects), Advanced (scanlimit)                                                                                                   |
| Subword motions       | `features/text-objects.md`          | Vim features (subword)                                                                                                                             |
| Increment/Decrement   | `reference/keybindings.md`          | Vim features (dial)                                                                                                                                |
| Structural navigation | `features/structural-navigation.md` | Vim features (navigation)                                                                                                                          |
| Tables                | `features/tables.md`                | Vim features (tablenav, tablewidget)                                                                                                               |
| Jump list             | `features/quality-of-life.md`       | Jump navigation (jumplist, jumplistsize)                                                                                                           |
| Yank-ring             | `features/quality-of-life.md`       | Jump navigation (yankring)                                                                                                                         |
| Hard-wrap             | `features/hardwrap.md`              | Vim features (hardwrap), Vim engine (textwidth)                                                                                                    |
| Flash motions         | `features/flash.md`                 | Jump navigation (flash, flashmultiline, flashjump, flashjumpkey, flashcleverf, flashminpatternlength, flashsearch)                                 |
| Animated cursor       | `features/animated-cursor.md`       | Animated cursor (animatedCursor, smoothCursor, cursorSmoothness, smearTrail, smearStiffness, smearTrailingStiffness, smearDamping, smearMaxLength) |
| EasyMotion            | `features/easymotion.md`            | Jump navigation (easymotion, dimming, labels, labelfontsize, labelmatchfontsize)                                                                   |
| Hint mode             | `features/hint-mode.md`             | Jump navigation (hintmode, hintlabels, hinthotkey — all configurable via vimrc/Lua)                                                                |
| Workspace nav         | `features/workspace-navigation.md`  | Workspace navigation (workspacenav, workspacenavviewtypes)                                                                                         |
| Folding               | `features/workspace-navigation.md`  | Workspace navigation (foldawarenavigation, foldpersistence)                                                                                        |
| Surround              | `features/surround.md`              | (no settings — fork feature)                                                                                                                       |
| Ex commands           | `features/ex-commands.md`           | (no settings — always enabled)                                                                                                                     |
| Quality of life       | `features/quality-of-life.md`       | Vim features (listcontinuation), Vim engine (clipboard, etc.)                                                                                      |
| Lua configuration     | `configuration/lua-config.md`       | Vimrc & key bindings (configMode, luaConfigPath, globalConfigSearch)                                                                               |
| Snippets              | `features/snippets.md`              | Snippets (enableSnippets, snippetBundled, snippetDirectory, snippetTriggerMode)                                                                    |
| Vimrc                 | `configuration/vimrc.md`            | Vimrc & key bindings                                                                                                                               |
| Which-key             | `configuration/which-key.md`        | Which-key hints, group labels, command labels                                                                                                      |
| Cursor shapes         | `configuration/cursor-shapes.md`    | Cursor shapes                                                                                                                                      |
| Status bar            | `configuration/status-bar.md`       | Status bar, Vim mode display prompt                                                                                                                |
| Undo tree             | `features/undo-tree.md`             | Undo tree (enableUndoTree, undoTreeMaxNodes, undoTreePosition, undoTreeAutoOpen, undoFile)                                                         |

### Transclusion conventions

- Keybinding tables are single-sourced in `reference/keybindings.md`. Feature pages transclude via `![[keybindings#Section Heading]]`.
- When adding a new keybinding section, add it to `reference/keybindings.md` with a `## Section Heading`. Feature pages can immediately transclude it.
- Never duplicate keybinding tables across pages manually — always transclude from the canonical source.

### Frontmatter requirements

Every page in `docs/` must have:

```yaml
---
title: Page Title # Sentence case
description: Brief desc # 1-2 sentences
tags: # From: getting-started, features, configuration, reference,
    - category-name #       keybindings, troubleshooting, guide, development
---
```

### Content style

- Keybindings in inline code: `` `]h` ``, `` `<C-w>v` ``
- Vim notation in inline code: `` `<leader>` ``, `` `<CR>` ``
- Settings paths bold with arrows: **Settings → Vim Motions → Jump navigation**
- Callout types: `[!tip]` (recommended), `[!info]` (fork-mode-only), `[!warning]` (conflicts), `[!bug]` (limitations)
- Internal links as wikilinks: `[[installation]]`, `[[settings#Vim engine]]`

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from 'obsidian';
import { MySettings, DEFAULT_SETTINGS } from './settings';
import { registerCommands } from './commands';

export default class MyPlugin extends Plugin {
    settings!: MySettings;

    async onload() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<MySettings>,
        );
        registerCommands(this);
    }
}
```

**settings.ts**:

```ts
export interface MySettings {
    enabled: boolean;
    apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
    enabled: true,
    apiKey: '',
};
```

**commands/index.ts**:

```ts
import { Plugin } from 'obsidian';
import { doSomething } from './my-command';

export function registerCommands(plugin: Plugin) {
    plugin.addCommand({
        id: 'do-something',
        name: 'Do something',
        callback: () => doSomething(plugin),
    });
}
```

### Add a command

```ts
this.addCommand({
    id: 'your-command-id',
    name: 'Do the thing',
    callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MySettings>);
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
    this.app.workspace.on('file-open', (f) => {
        /* ... */
    }),
);
this.registerDomEvent(activeWindow, 'resize', () => {
    /* ... */
});
this.registerInterval(
    window.setInterval(() => {
        /* ... */
    }, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
