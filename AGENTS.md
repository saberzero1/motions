# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- **Build target is `es2021` in both `tsconfig.json` and `esbuild.config.mjs`, deliberately. Do not raise it.** `manifest.json` sets `isDesktopOnly: false`, so the platform WebView is the floor, not Electron — and it is lower than `minAppVersion` implies (the desktop _installer_ minimum is 1.1.9 ≈ Chromium 106). **Android 5.1 is the binding constraint and has not moved**: it is still the Play Store minimum at 1.8.10 and at 1.13.6, so raising `minAppVersion` does not raise this floor. iOS did move, 13 → 14.5 → 15. Re-measured at `minAppVersion` 1.8.7: at `es2022` esbuild emits **8 `static {}` blocks** where `es2021` emits none, and static initialisation blocks need Safari 16.4 — above iOS 15, let alone the Android 5.1 WebView — so the bundle fails to **parse** and the plugin does not load at all. The saving is **402 bytes gzipped out of 729,321** (0.06%). Earlier revisions of this note also credited native class fields and `#private` methods; neither is evidenced — `#private` appears identically in both builds and no source file uses it. Raising the target also silently flips `useDefineForClassFields` to `true`, changing class-field semantics across the subclass hierarchy — set it to `false` explicitly if the target ever moves. Raising the target also silently flips `useDefineForClassFields` to `true`, changing class-field semantics across 23 subclasses and 6 `declare` fields — set it to `false` explicitly if the target ever moves.
- **Do not use TC39 explicit resource management** (`using`, `await using`, `Symbol.dispose`, `DisposableStack`). WebKit has no support, so iOS WKWebView cannot parse native `using`, and downlevelled `using` needs a permanent `Symbol.dispose` polyfill that this project cannot verify on the binding platform. `DisposableStack` additionally costs ~17 kB gzipped. Use `runCleanups` from `src/util/cleanup.ts` for exception-isolated disposal, `Component.register*` for anything Obsidian owns, and the single-owner-with-abort shape of `src/lua/key-broker.ts` for resources held across a wait.
- Types: `obsidian` type definitions + `@obsidian-typings/obsidian-public-latest` (devDependency — community-maintained type definitions for Obsidian's unofficial/internal APIs). Configured in `tsconfig.json` `"types"` array. Key typed APIs used directly throughout the codebase: `App.commands`/`.embedRegistry`/`.internalPlugins`/`.plugins`/`.openWithDefaultApp()`/`.showInFolder()`/`.scope`, `Workspace.activeEditor`, `Vault.getConfig(ConfigItem)`, `Editor.cm`/`.addHighlights()`/`.removeHighlights()`/`.hasHighlight()`, `MarkdownView.editMode`/`.getMode()`, `WorkspaceLeaf.id`/`.pinned`/`.updateHeader()`/`.unhighlight()`, `SuggestModal.inputEl`, `PluginSettingTab.refreshDomState()`, `Keymap.pushScope()`/`.popScope()`, `InternalPlugins.getEnabledPluginById()`, `EmbedRegistry.embedByExtension`, `TableEditor` (full table widget API — imported from `@obsidian-typings/obsidian-public-latest`), `TableCell`/`TableRow`/`TableSelectionBounds`/`CellDirection`/`CellPosition`/`CursorPlacement`/`TableAlignment`. Utility wrappers in `src/util/` provide null-safe access — prefer those over direct property access for `Editor.cm`, `leaf.id`/`.pinned`, `View.file`, and `vault.getConfig()`.
    - **Core-plugin view trees are typed locally in `src/types/core-view-trees.d.ts`, pending upstream.** obsidian-typings declares `Tree<T>`, `TreeItem` and `TreeCollapsibleItem` but attaches `tree` to `FileExplorerView` only. Measured at 1.13.7, five views own an equivalent navigable `Tree` — `file-explorer`, `outline`, `tag`, `all-properties`, `bookmarks` — of which only the first is declared. `changeFocusedItem('forwards'|'backwards')` moves `focusedItem` in all five; `setCollapsed` exists on focused items in `file-explorer`, `outline` and `tag` only. **Resolve a tree by allowlist, never by shape:** `backlink` (`view.backlink.backlinkDom`) and `search` (`view.dom`) carry a **`ResultDom`**, a different interface that also has `changeFocusedItem`, so duck-typing finds it. `ResultDom` is **not** inert — upstream types it `(arg1: unknown)`, but the shipped function branches on `"forwards" === e` exactly as `Tree`'s does, and on `search` it moved focus from `null` to the first result. A probe that reported "never moves" was reading `focusedItem.selfEl`; `TreeItem` has `selfEl`, `ResultDom` items have `el`. `backlink` is unverified — its view rendered no rows in two attempts. `src/workspace/core-view-tree.ts` is the only sanctioned accessor, and `test/specs/core-view-trees.e2e.ts` is the evidence behind the declarations — it re-measures every row on a real Obsidian and is what the upstream request cites. This mirrors the `TableEditor` route: declare locally, prove in the plugin, then upstream and delete the local file.
    - `test/specs/**` cannot **value**-import a `src/**/*.ts` module. `tsconfig.test.json` includes `src/**/*.d.ts` only, so pulling an implementation module in from a spec surfaces the pre-existing dual-`VimApi` collision and reports 4 errors in files the spec never touches. A `import type` is fine (`jump-list.e2e.ts` does it) and unit tests under `test/unit/**` import freely; only specs are affected. Where a spec needs a source constant, restate it and pin the two with a unit test.
    - **`App.openWithDefaultApp()` and `App.showInFolder()` are vault-relative and must not receive an absolute path.** Both resolve their argument through the vault adapter — `getFilePath()`/`getFullPath()` join onto the vault base path — so `/home/u/init.lua` silently becomes `<vault>/home/u/init.lua`. `showInFolder()` additionally `exists()`-checks first and shows its own "not found" notice naming the fabricated path, which makes the failure look like a missing file rather than a wrong call. This is real: `globalConfigSearch` and an absolute `luaConfigPath`/`vimrcPath` both produce out-of-vault paths, and `open-configuration` shipped broken for them. Route every path through `src/util/open-path.ts` (`openPathInDefaultApp`, `revealPathInSystemExplorer`), which branches on `isAbsolutePath()` and falls back to Electron `shell.openPath`/`showItemInFolder` for external paths. `showItemInFolder` selects the item inside its parent, so pass the **file**, never `parentDirOf(file)`.
- **codemirror-vim fork**: The plugin uses a fork of `@replit/codemirror-vim` at `~/Repos/codemirror-vim`. All core vim behavior changes go in the fork's `src/vim.js`. The fork has its own test suite (1884 browser tests) and Neovim golden comparison infrastructure (756 golden cases, 476 pass, 280 known deviations). The fork includes an operator-prefix shadow resolver (`operatorshadowtimeout` option, default 1000ms) that disambiguates operator-pending motions vs multi-key actions (e.g., flash `s` motion vs surround `s<character>` action) by deferring to partial matches with a configurable timeout fallback. The same timeout mechanism handles prefix-ambiguity deferral for non-operator `keyToKey` mappings (e.g., `<Space><Space>` deferred because `<Space><Space>h` is a partial match) — the deferred command timer routes `keyToKey` type commands to `doKeyToKey()` instead of `processCommand()`. The fork supports backtracking when a longer partial match fails — it executes the deferred shorter full match and replays the suffix via `doKeyToKey`. The fork exposes `setLivePreviewField(field: StateField<boolean>)` so the host plugin can provide Obsidian's `editorLivePreviewField` — the fork's frontmatter properties navigation (`focusBefore` in `findPosV`) is gated on this field to avoid intercepting cursor movement in source mode.
  The fork exposes `setPropertiesSource(fn: () => boolean)` so the host plugin can indicate when frontmatter is rendered as source text in Live Preview (Obsidian's "Properties in document" = "Source") — the frontmatter interception is also skipped when this callback returns `true`, preventing the cursor from getting stuck on a hidden `.metadata-container`. The fork's `BlockCursorPlugin` unconditionally hides native CM6 cursor layers on every update (the fork renders its own cursor for every vim mode) and determines insert mode by checking `this.cm.state.vim.insertMode` directly instead of the `.cm-vimMode` DOM class (avoids CM6 ViewPlugin update ordering race). `caretColor` is set via `setProperty("caret-color", ..., "important")` — transparent in non-insert modes, accent color in insert mode. The fork exposes `setIdleEscapeCallback(fn)` so the host plugin can handle Escape in idle normal mode — the callback fires before the event is consumed, enabling context-aware dismiss logic (e.g., closing popovers via `HoverPopover.hide()` while silently consuming Escape in main editors). The fork exposes `setCursorSuppressed(suppressed: boolean)` and per-view overrides (`setCursorSuppressedForView`, `clearCursorSuppressedForView`, `isCursorSuppressedForView`, `isCursorSuppressed`, `getViewOverrideCount`) so the host plugin can suppress the fork's own vim cursor layer when using its own canvas-based animated cursor. `isKeyInterceptActive()` queries the key intercept flag. These diagnostic exports are used by the plugin's `getTableDebugState()` inspector. Insert-mode surround (`<C-G>s`/`<C-G>S`) inserts both delimiters up front (matching vim-surround) and supports full dot-repeat — the fork stores `_surroundInsertChar`/`_surroundInsertNewline` on `lastInsertModeChanges` and replays them via `replaySurroundAwareInsert` inside `repeatLastEdit`, exceeding both vim-surround and nvim-surround where insert-mode surround dot-repeat is broken. `ys`'s text object argument is resolved by `runTextObjectMotion`, which looks the exact key sequence (`i$`, `aB`, …) up in `defaultKeymap` before falling back to the built-in `textObjectManipulation` — host-registered objects therefore work with `ys` and its dot-repeat, and a registered object shadowing a built-in key only wins where it matches. `textObjectManipulation` applies its forward pair search to inner bracket objects as well as around ones, so `di(`/`di{`/`di[` find the next pair when the cursor is outside one, matching Neovim. The fork exposes `feedKeys(cm, keys, { noremap })` for programmatic key injection with correct noremap semantics — delegates to `doKeyToKey` with the internal `noremap` flag and `keyToKeyStack` recursion protection. Used by expr mapping result feeding. The fork exposes `undefineEx(name)` to remove ex commands registered via `defineEx` — cleans both `exCommands` and `commandMap_` prefix entries. Used by the plugin's vimrc and Lua soft-reload to clean up stale `exmap` handlers.
  The fork's `unmap(lhs, ctx)` supports per-mode removal of context-less (all-mode) mappings — when a mode-specific unmap finds no exact context match, it falls back to splitting the context-less entry into per-mode entries for the remaining modes (matching Neovim's `:nunmap` on a `:map`-created mapping). The mode set is `['normal', 'visual', 'operatorPending']`. `mapclear(ctx)` uses the same mode set when splitting context-less mappings during mode-specific clearing. The fork exposes `exitVisualMode(cm, moveToHead?)` so the host plugin can exit visual mode programmatically — used by `pasteInVisualMode()` after replacing the visual selection with register contents. The fork exposes `setOperatorfunc(fn)` and `getOperatorfunc()` to support the `g@{motion}` operator — the callback receives the motion type (`'line'`, `'char'`, or `'block'`) and the range is marked by `'[` and `']`. The fork exposes `resetForkedVimState()` and `resetCursorState()` to support runtime re-initialization during vim mode toggling. The fork uses a CM6 `eventObservers.keydown` (DOM event observer) instead of `eventHandlers.keydown` for vim's keydown processing — in CM6's dispatch order, observers run before handlers, guaranteeing vim fires first regardless of `Prec` ordering or plugin load order. The fork exposes `setTokenClassifier(fn)` so the host plugin can provide token classification at a position — the `%` bracket matcher and surround match path call the classifier instead of `cm.getTokenTypeAt()` when set, enabling treesitter-based detection of code spans and HTML tags in Markdown where Lezer's token types are empty. The fork exposes `setKeyInterceptActive(active: boolean)` so the host plugin can suppress the observer during modal key-interception states (flash labels, EasyMotion labels, hint mode). The fork's `findKey` function uses a narrowed key consumption guard for unmatched keys in normal mode: single-character keys, text-producing special keys (`<Space>`, `<BS>`, `<Del>`, `<CR>`), and Mac Alt combos (`<A-x>`) are consumed silently; `<Esc>` and `<Ins>` are also consumed (`<Esc>` because `handleEsc()` returns `undefined` in idle normal mode but the keydown must not propagate to host DOM listeners; `<Ins>` to prevent CM6 overwrite toggle); functional/navigation keys (`<Tab>`, `<S-Tab>`, `<F1>`–`<F12>`, modifier combos like `<C-S-I>`) return `undefined` so they propagate to the host application. The fork's `paste` action falls back to `document.execCommand('paste')` via `fallbackToNativePaste()` when `navigator.clipboard.readText()` returns empty or rejects (non-text clipboard content such as images) — this triggers the host application's native paste pipeline. A `programmaticPaste` module-level flag suppresses the `getOnPasteFn` paste event listener during the fallback to prevent spurious insert-mode entry. The fork's `g0` motion uses a `goDisplayLineStart` exec command (via `view.moveToLineBoundary`) to unconditionally move to column 0 of the visual line — upstream used `cursorLineBoundaryBackward` which toggles between column 0 and first non-blank (Home-key behavior). `g^` uses a separate `moveToFirstNonBlankOfDisplayLine` handler that advances past leading whitespace from the visual line start. `g_` (`moveToLastNonWhiteSpaceCharacter`, inclusive) moves to the last non-blank character of the current line (or count-1 lines forward). The fork's `scrollToCursor` (`zz`/`z.`/`zt`/`z<CR>`/`zb`/`z-`) measures the cursor's whole buffer line, from the first display row's box to the last, instead of only the first row: `zz` centers the entire wrapped line the way Vim's `scroll_cursor_halfway` does, is clamped to the line's first row when the line is taller than the viewport (Vim's topline is a whole buffer line), and every position then scrolls within the line if needed to keep the cursor on screen, which is what Vim's `skipcol` does. The fork exposes `setScrolloffSource(fn)` so the host plugin can supply `'scrolloff'` in display rows — it is deliberately not a `defineOption` value, because the host already owns the margin for ordinary cursor motions and a second copy could disagree, and a host cannot apply it from outside since `scrollToCursor` assigns `scrollDOM.scrollTop` without dispatching a transaction, so no `updateListener` ever observes these commands. Neovim applies the margin in two unrelated places and the fork reproduces both: `zt`/`zb` hold it past the cursor **line** on any line and clamp toward the centered position, which is why `zt`, `zb` and `zz` converge once `scrolloff` exceeds half the window, while `zz` alone never moves on a line that fits; inside a line taller than the viewport the margin instead applies to the cursor's own display row via `skipcol`, limited to `(height - rowHeight) / 2` so an unreachable margin centers the row, and bounded to the line's own extent so it is out of reach at the line's first and last display rows. The fork includes `@:` (repeat last ex command via `repeatLastExCommand` action with count support), `&` (repeat last `:s` substitution via `repeatLastSubstitute` action), `ZZ` (write+quit) and `ZQ` (quit without saving) defaultKeymap entries, insert-mode `<C-a>` (re-insert previously inserted text via `reinsertPreviousInsert`), `<C-e>` (copy character from line below via `copySameColumn below`), `<C-y>` (copy character from line above via `copySameColumnAbove`), `<C-G>u` (insert undo break), `<C-G>U` (suppress next undo break), `<C-G>j`/`k` (line navigation), and `0<C-D>`/`^<C-D>` (delete all indent). The fork implements `:move` and `:copy` ex commands with proper range and address support. The fork exports `foldopenAnnotation` (a CM6 `AnnotationType<FoldopenCategory | null>`) — every motion in `defaultKeymap` is tagged with a `foldopen` category (`hor`, `block`, `jump`, `mark`, `search`, `percent`; vertical motions like `j`/`k` have no category). When a motion executes, `setCursor()` attaches the annotation to the CM6 transaction so the host plugin's `transactionExtender` can decide whether to auto-unfold based on the configured `foldopen` set (matching Neovim's `foldopen` option semantics). `undo`/`redo` actions set `_pendingFoldopen = 'undo'` and `jumpListWalk` (`<C-o>`/`<C-i>`) sets `_pendingFoldopen = 'mark'`. The fork exposes 12 standard Neovim options via `defineOption()`: `ignorecase`/`ic`, `smartcase`/`scs`, `hlsearch`/`hls`, `incsearch`/`is`, `wrapscan`/`ws`, `gdefault`/`gd`, `startofline`/`sol`, `whichwrap`/`ww`, `virtualedit`/`ve`, `joinspaces`/`js`, `shiftround`/`sr`, `nrformats`/`nf` — all configurable via `set`/`vim.opt` with Neovim-compatible defaults. Additionally, `operatorshadowtimeout`/`ost` accepts `timeoutlen`/`tm` as Neovim-compatible aliases.
    - **IMPORTANT: dependency specs in `package.json`**: Both forks are published to npm and consumed through `npm:` aliases — `"@replit/codemirror-vim": "npm:@saberzero1/codemirror-vim@^6.3.0"` and `"@codemirror/autocomplete": "npm:@saberzero1/codemirror-autocomplete@^6.20.3"`. The alias preserves the original import specifier, so no source file changes and the `overrides`/`pnpm.overrides` blocks keep keying on `@codemirror/autocomplete`. **They MUST resolve to the registry — not a git URL, not a local path — before committing.** This is not cosmetic: npm 12 blocks a dependency's install scripts unless the root package's `allowScripts` policy covers them, and `prepare` counts as an install script for non-registry sources. A git dependency **cannot be approved** — an `allowScripts` entry for it, pinned (`@saberzero1/codemirror-vim@6.3.0`) or name-only, is still reported as uncovered, whereas a registry package with a postinstall approves normally. A git-URL fork therefore installs with no `dist/` and no types, breaking `npm run build` **and** `typecheck` (the 166-member type surface lives in the fork's `dist/index.d.ts`). Registry dependencies are exempt from the policy entirely, even when the published package itself declares `prepare`. The community scanner runs `npm ci --allow-git=all --allow-remote=all` plus either `--dangerously-allow-all-scripts` (build verification) or `--ignore-scripts` (dependency and source analysis); with registry specs the plugin installs correctly under all of those **and** under npm 12's bare defaults, so it no longer depends on any scanner escape hatch. During local development, use `npm install ~/Repos/codemirror-vim` for fast iteration, but **always switch back to the registry alias before committing** — `file:../codemirror-vim` breaks CI, the scanner, and anyone cloning the repo. Check `git diff package.json package-lock.json` before every commit: every `resolved` in the lockfile must start with `https://registry.npmjs.org/`, and a stray `git+ssh://`/`git+https://` entry means a spec leaked. Note that `npm install` alone will **not** re-resolve a spec changed from git to an alias — it reports "up to date" and leaves the old `resolved` URL; pass the full spec explicitly (`npm install '@replit/codemirror-vim@npm:@saberzero1/codemirror-vim@^6.3.0'`) to force it.
    - **Publishing a fork change**: both forks ship from a push to their default branch (`master` for codemirror-vim, `main` for autocomplete) via npm trusted publishing — OIDC, no `NPM_TOKEN`, provenance generated automatically — in each fork's `.github/workflows/publish.yml`. The workflow is gated on the version in the fork's `package.json` not already existing on the registry, so **a fork change only ships when you bump its version**; pushing without a bump runs the check job and skips the publish job. Then bump the alias range here. Two constraints are easy to trip: the trusted publisher is keyed to the literal workflow **filename**, so renaming or moving `publish.yml` breaks authentication with a misleading `E404`, and `npm publish` must stay in that file rather than a reusable workflow, because npm validates the calling workflow's name. The codemirror-vim workflow also publishes with `--ignore-scripts` and sets an empty `NODE_AUTH_TOKEN` on its install step: `actions/setup-node`'s `registry-url` writes an `.npmrc` containing a literal `${NODE_AUTH_TOKEN}`, which npm ignores but yarn 1 aborts on, and that fork's `prepare` shells out to yarn.
- **fengari (absorbed)**: The plugin uses a browser-only version of fengari for the Lua 5.3 runtime, absorbed into the monorepo at `src/lib/fengari/` and converted to TypeScript ESM. The implementation strips all Node.js dependencies (`fs`, `child_process`, `os` module, `readline-sync`, `tmp`) and ships with zero runtime dependencies (`sprintf-js` replaced with a custom `luaSprintf` formatter). Integers are widened from 32-bit to 53-bit (`math.maxinteger = 9007199254740991`); bitwise operations remain 32-bit (JS platform limitation). `string.packsize("j")` returns 8. Full TypeScript typing with a hybrid TValue type system (`unknown` value + type predicates) and a typed ESM barrel. `__gc` metamethods on userdata are supported via `FinalizationRegistry` (finalization order unspecified; tables not finalized; drain at `luaD_pcall` return, `collectgarbage("collect")`, and `lua_close`). `collectgarbage()` returns safe no-op values for all modes (was `luaL_error`). The plugin installs a `lua_atnativeerror` handler so native JS errors (TypeError, etc.) produce extractable Lua error strings instead of being lost. See `src/lib/fengari/DIFFERENCES.md` for the full list of changes from upstream.
    - **Platform abstraction**: Fengari is host-agnostic, using a `PlatformProvider` injected at module load time in `engine.ts`. This replaces all Node.js/browser sniffing with explicit dependency injection. `platform.ts` provides the typed interface.
    - **What's stripped**: Lua `io` library (entire file), Lua `package`/`require()` system (entire file), Node.js-only `os` functions (`exit`, `execute`), `debug.debug()` interactive REPL, file loading (`luaL_loadfilex`), `process.stdout`/`process.stderr`/`process.env` references.
    - **What's kept**: Core VM, all safe standard libraries (base, string, table, math, coroutine, utf8, os), browser-safe `os` functions (date, time, difftime, clock, setlocale, getenv, remove, rename, tmpname), debug library (minus `debug.debug()`). Zero runtime dependencies (custom `luaSprintf` replaces `sprintf-js`).
    - **What the plugin loads**: The plugin's `engine.ts` opens 7 libraries: `_G`, `string`, `table`, `math`, `coroutine`, `utf8`, and `os`. The `debug` library is available but is **not loaded** into the Lua sandbox. `os.execute` and `os.exit` are nil-ed out as defense-in-depth. `load()` is re-enabled as a sandboxed string-only compiler (file-based loading remains disabled). `require()` is implemented in Lua on the plugin side. It searches two roots in order — `lua/` beside the configured `init.lua` (`getModuleRoots` in `loader.ts`), then `lua/` at the vault root — so a config in its own folder carries its modules, and an existing vault-root `lua/` keeps working. An out-of-vault config's `lua/` is read through `listExternalDir`/`readExternalFile` and is therefore desktop-only; `createSnapshotAdapter` routes absolute paths to Node and relative paths to the vault adapter. Resolution is **synchronous**, served from `src/lua/module-snapshot.ts` — an in-memory copy of every vault `.lua` file, built and awaited in `loader.ts` before user config runs (the same pattern as `initTreesitterRuntime`). The asynchronous vault read via the coroutine↔Promise bridge is retained **only** for runner-managed threads, decided by `CoroutineRunner.isAsyncCapable(L)`; a synchronous caller that misses the snapshot gets an error naming the snapshot and both candidate paths, distinct from a genuine "not found". This is what makes the lazy `require` inside a `vim.keymap.set` callback work, since those run on the main state via plain `lua_pcall` and cannot yield. The snapshot is rebuilt on config reload and after a `vim.plugins.add()` fetch, before the fetching coroutine resumes. The snapshot reader and the async-capability predicate reach the injected `require` chunk as **chunk arguments, not globals**, so sandboxed user Lua cannot reach them.
    - **Plugin auto-fetch**: `src/lua/plugin-fetch.ts` downloads GitHub tarballs via `requestUrl`, decompresses with `fflate`, and retains `lua/**/*.lua` plus `queries/{lang}/{name}.scm` files. `src/lua/plugin-store.ts` manages atomic staging writes (`lua/.staging/`) and a lock file (`lua/.plugin-lock.json`), isolates plugin queries under `lua/{owner}__{repo}/queries/`, and refreshes the query snapshot before Lua resumes. Older cached plugins must be re-fetched to acquire previously discarded `.scm` files. `src/lua/tar.ts` is a synchronous tar parser. Gated behind the `pluginAutoFetch` setting (default: off).
    - **Coroutine↔Promise bridge**: `src/lua/coroutine-runner.ts` implements async Lua execution using fengari's `lua_yieldk` continuations. Lua callbacks can call async APIs (e.g., `vim.ob.fs.read`) which yield the coroutine; the JS host awaits the Promise and resumes with the result. The bridge manages thread lifecycle, instruction hooks (per-thread), 10s timeout, 16-coroutine concurrency limit, and error propagation via `nil+errmsg` protocol compatible with `pcall`. Snippet `f()`/`d()` nodes are blocked from async via `setAsyncBlocked()`.
    - **Plugin-side Lua API** (built on top of fengari, implemented in `src/lua/`): `vim.opt`, `vim.o`/`vim.go` (global options with engine → shadow → default resolution), `vim.g`, `vim.b` (buffer-local variables), `vim.bo` (buffer-local options — `commentstring`, `filetype`, `expandtab`, `shiftwidth`/`softtabstop`/`tabstop`, `modifiable`, `buftype`, `textwidth`, `iminsert`, `fileformat`; writes round-trip through a per-file shadow store and forward tab/width options to the engine), `vim.wo` (window-local options — `wrap` from CM6, every other key falling back to the global scope), `vim.v` (predefined variables: count/count1/register/operator, searchforward, insertmode, numbermax/min/size, maxcol, true/false/null, fold/statuscolumn/event/char/hlsearch), `vim.cmd`, `vim.keymap.set`/`del` (including buffer-local and `{ expr = true }` for function callbacks), `vim.api` (69 real `nvim_*` implementations: user commands, autocmds, augroups, buffer lines, buffer text, buffer keymaps, highlights, namespaces, extmarks, windows, cursor, tabpages, marks, variables, options, option values, vvars, mode query, string width, key injection, UI, current-buffer/window calls, non-floating window config, byte offsets and synthetic current-window dimensions/identity), `vim.fn` (92 real implementations with async callbacks, including CM6-backed `getwininfo` and `wincol`, Vim-accurate `strchars`/`charidx`/`byteidx` composing-mark handling, `line2byte`/`byte2line`, `charcol`/`virtcol`/`virtcol2col`, `win_getid`/`winnr`, and `deletebufline`), `vim.iter` (26 methods; `rpop`, `count`, `size` are extensions), `vim.on_key` (pre-mapping physical-key observation), `vim.tbl_*` (12 table utilities), `vim.split`/`vim.trim`/`vim.startswith`/`vim.endswith`/`vim.inspect`/`vim.json`/`vim.deepcopy`, `vim.regex` (Vim patterns translated to RegExp, with `match_str`/`match_line`/`match_pos`/`replace`/`test`), `vim.schedule`/`vim.defer_fn`/`vim.uv` (timers), `vim.notify` (with log levels), `vim.notify_once` (dedup), `vim.validate` (full Neovim spec — old table form and new positional form), `vim.version` (11 functions: `parse`, `cmp`, `lt`/`gt`/`eq`, `range` with `has()`, `last`), `vim.keycode` (key code translation), `vim.obsidian`/`vim.ob` (Obsidian-specific namespace, including `vim.obsidian.im` for input method switching (per-view across all editors), `vim.ob.fs.read`/`readlines` for async file reading), vim.textobject (custom text object registration via vim.gen_spec.pair), `vim.is_callable` (function and callable table detection), `vim.env` (sandboxed), `vim.plugins` (plugin management — `add` for registration with auto-fetch support, `list` for status), `require()` (vault-local module loading from `lua/` with `init.lua` fallback), `load()` (sandboxed string compilation), `package.loaded`/`package.path`, `vim.treesitter` (treesitter API backed by `web-tree-sitter` WASM — `get_parser`, `get_string_parser`, `get_node`, `get_node_text`, `query.parse`/`get`/`set`/`get_files`, `Query:iter_captures`/`iter_matches`, LanguageTree with structural injection support, 31 TSNode methods, 8 built-in predicates, 4 directives, `language.register`/`get_lang`/`inspect`/`add`), 19 autocmd events (mode events and cursor/yank/cmdline events fire per-view across all editors via `AutocmdModeWatcher` and `AutocmdEventWatcher` CM6 ViewPlugins). See `docs/configuration/lua-config.md` for the full reference.
    - **Coordinate ownership and absence policy:** `coordinates.ts` is the single typed adapter for the 23 enumerated Neovim byte/character/display boundaries, including the five real string-coordinate helpers; `coordinate-wire.ts` only marshals Lua values, including raw byte strings. Host callbacks remain UTF-16. D4 interior-byte cursor writes normalize down. D5 text reads preserve split UTF-8 bytes in fengari's `Uint8Array` strings; text writes normalize start-down/end-up because the JS UTF-16 document cannot represent invalid UTF-8. Extmark columns use the same normalization; getters serialize modeled `details` with byte `end_col` and `virt_text` pairs. Legacy `getpos`/`getcurpos`/`setpos` columns are bytes; D6 reads sticky `curswant` from the fork's `vim.lastHPos`, using positional display cells when it is `-1` and mapping `Infinity` to `MAXCOL`. These are documented deviations, not blanket parity. `nvim_buf_set_mark`, `cursor`, view save/restore, `wincol`, `searchpos` and JS-backed byte-string functions remain deferred; `vim.fn.strwidth` still incorrectly returns UTF-16 length. Registry counts remain API 69/88/157 and fn 92/39/131 (real/stub/total), or fn 89/39/128 without async callbacks: semantic repairs of already-real handlers do not change counts. Known names resolve to handlers/stubs; unknown API/fn reads raise, while deliberately absent plain-namespace fields read nil. There is no implemented `ABSENT_NVIM_API_FUNCTIONS` tier. Seven `iconv`/`uri_*` helpers remain silent placeholders. mini.surround retains four core blockers; mini.splitjoin retains core `local-comments` and load `string-expr-mapping` (unavailable Vimscript evaluation, an architectural constraint rather than a missing function). Both remain BLOCKED; integration Phases 6/7 remain cancelled.
    - **Treesitter subsystem** (`src/treesitter/`): Parallel parser alongside CM6's Lezer, using `web-tree-sitter` (WASM). Markdown, Markdown inline, and HTML grammars are bundled as `.wasm` files in `src/treesitter/grammars/`. Lua config loading awaits `initTreesitterRuntime(app.vault.adapter)` so runtime initialization and query preloading finish before synchronous user `query.get()` calls. The CM6 bridge (`bridge.ts`) provides a `ViewPlugin` for per-view incremental parsing. The `LanguageTree` class (`language-tree.ts`) manages multi-parser state with structural injection support; its injection query loader is not yet connected to named queries. The query engine (`query.ts`, `predicates.ts`, `directives.ts`) compiles `.scm` queries, evaluates predicates (`#eq?`, `#match?`, `#any-of?`, `#has-ancestor?`, etc.), and applies directives (`#set!`, `#offset!`, `#gsub!`, `#trim!`). `query-files.ts` snapshots vault queries in user → lexically ordered plugin → bundled precedence with recursive inheritance, extension modelines, cycle detection, and resource limits (128 KiB/file, 4 MiB/snapshot, 512 KiB/combined query, 64 sources, 16 inheritance levels). `named-queries.ts` adds per-state `query.set()` overrides, lazy compilation, and revision-based invalidation; `.scm` edits require a config reload. `bundled-queries.ts` provides `textobjects` constants for all three bundled grammars. Lua bindings (`src/lua/treesitter/`) expose queries via fengari userdata tables; iterator predicates use the supplied source or node-retained document text. The `esbuild.config.mjs` uses `loader: { '.wasm': 'binary' }` to embed WASM bytes as base64 in `main.js`; `Parser.init({ wasmBinary, locateFile: () => '' })` avoids Obsidian's `app://` CORS restriction.
    - **Lua compatibility boundaries**: `src/lua/api.ts` shares `operatorfunc` read/write helpers across `vim.opt`, `vim.o`, `vim.go`, and both global option API pairs (function, function-name string, or `nil` to clear). `src/lua/loader.ts` normalizes the fork's returned `Error` for unknown options. `src/lua/termcodes.ts` encodes Neovim key bytes and decodes them into notation at the fork boundary. `src/lua/on-key.ts` registers state cleanup before Lua close; desktop/popout dispatch reuses `global-key-handler.ts`, and mobile dispatch reuses the safety handler in `main.ts`, through `workspace/key-observer.ts`. `src/lua/key-broker.ts` is the sole owner of the `getcharstr`/`getchar` capture listener and intercept lease — one of each across all waiters, FIFO delivery — and `CoroutineRunner.yieldWithPromise` takes an `onAbandon` release so a timed-out or destroyed await frees it; an abandoned promise never settles, so that hook is the only cleanup path. The runner and broker are registered via `registerStateCleanup`, which `destroyState` runs before `lua_close`. This is observation only, pre-mapping, with identical `key`/`typed` arguments and no key-discard support. `injectIterApi()` must run after namespace stubs to replace the `vim.iter` stub.

### Parity target: Neovim, except where Obsidian is the sensible choice

**Default to Neovim parity.** Where a behaviour has a Neovim answer, match it — that is what the golden comparison suite, the deviation registry and the RPC oracles exist to enforce, and a deviation needs a recorded reason.

**Deviate toward Obsidian when the construct is Obsidian's, not Vim's.** Two classes qualify so far:

- **Obsidian-flavoured Markdown editing conventions.** Smart list continuation is the worked example: `o`/`O` continues a bare `> quote` because Obsidian's own Enter does, and the child-level insertion in [#195](https://github.com/saberzero1/motions/issues/195) was declined because Obsidian's Enter, Neovim and the bundled engine all insert at the parent's level. The document's own conventions win here too — the Neovim mirror takes `expandtab`/`tabstop`/`shiftwidth`/`softtabstop` from Obsidian's `useTab`/`tabSize` rather than from the Markdown ftplugin, because Vim rebuilds a continued line's indent from its column count and would otherwise rewrite a tab-indented vault to spaces.
- **Obsidian-specific syntax** — wikilinks, highlights, callouts, embeds, properties. Not yet systematically audited; treat each case on its own and record the decision.

When choosing Obsidian over Neovim, measure the Obsidian behaviour rather than assuming it, record the measurement, and say so in `CHANGELOG.md` and the feature page. Obsidian is not automatically right either: its Enter continues a list inside a fenced code block, and the bundled engine deliberately does not.

### Dual-vim architecture

The plugin operates in two modes:

- **Built-in vim mode**: When Obsidian's vim mode is enabled (`Settings → Editor → Vim key bindings`), the plugin uses Obsidian's bundled codemirror-vim via `window.CodeMirrorAdapter.Vim`.
- **Bundled fork mode**: When built-in vim is disabled, the plugin registers the fork as a CM6 extension via `registerEditorExtension()` and installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins (obsidian-vimrc-support, vim-im-control, etc.) can still discover the Vim API at the canonical location. The bridge also exposes `isCursorSuppressedForView` for cursor suppression state queries (used by e2e tests). Embedded editors (Oil, textarea vim) and native table cell editors receive the vim extension via Obsidian's `registerEditorExtension()` injection. Which-key popups in embedded editors use `WhichKeyOverlay.forEmbeddedEditor()` with dependency injection — each embedded editor creates its own `WhichKeyOverlay` instance with an injected adapter and container, sharing 100% of the key-handling logic with the main editor's which-key. The embedded which-key config is passed via `TextareaVimManager.updateOptions()` for textarea overlays. A post-construction safety net (`ensureVimExtension()` in `embeddable-editor.ts`) checks for vim presence via `getCM()` and appends it via `StateEffect.appendConfig` if the injection is absent (e.g., on a leaf that has never hosted a MarkdownView) — used for Oil and textarea editors; native table cell editors don't need it. The embeddable editor exposes `registerScopeKey()` so host views can register key handlers on the editor's Obsidian `Scope` — these fire before Obsidian's default hotkeys, enabling Oil to intercept `Ctrl+T/S/H/L/C` which would otherwise be swallowed by Obsidian's built-in hotkeys (new tab, save, search & replace, etc.). Escape handling uses `Scope.register([], 'Escape', ...)` with a modal overlay guard (`isHintModeActive()`, `isEasyMotionActive()`, `isFlashActive()`) followed by an `isVimIdle()` check that detects all compound-command sub-states (`inputState.operator`, `surroundState`, `inputState.keyBuffer`, `expectLiteralNext`) — the overlay guard prevents Escape from exiting the embedded editor while a key-interception overlay is active (Scope handlers fire independently of DOM event propagation, so `stopPropagation()` in the overlay's capture-phase listener does not suppress the Scope handler). This fires before vim's `eventObservers.keydown` observer, preventing parent scopes from intercepting Escape while vim has pending operations. The `onEscape()` callback is deferred via `requestAnimationFrame` so the Scope handler returns `true` (consuming the event) while the editor's scope is still on the keymap stack — synchronous teardown would pop the scope mid-handler, leaking the Escape to parent scopes. The embeddable editor uses a `_destroying` flag to prevent the blur event listener from double-popping the keymap scope during `destroy()`. The textarea-vim overlay enables `isolateKeyEvents` which stops `keydown`/`keyup` propagation to prevent key events from leaking to parent modal UI.

**Every global key binding is an entry in `GlobalMappingRegistry`. There are no exceptions.** A key that bypasses the registry is not remappable, is invisible to which-key, and does not answer to `workspaceNavViewTypes` — so it silently breaks the "fully remappable keybindings" promise in `README.md`. File Explorer `h`/`j`/`k`/`l` are registered in `registerDefaultGlobalMappings` like everything else: `h`/`l` under a dedicated `explorer` gate, and `j`/`k` as the existing scroll entries with an explorer branch, because `GlobalMappingRegistry` stores one entry per key string and `j` must keep both meanings. The `explorer` gate exists so `h`/`l` are not `preventDefault`-ed everywhere else — `onKeydown` swallows any registered key whose gate passes, even when its action no-ops.

`src/workspace/file-explorer-context.ts` owns the explorer-context question. It tracks pointer, focus, and active-leaf interactions because Obsidian can send tree keystrokes to `BODY`, and clears that context when focus leaves the explorer. `builtin` actions receive a `GlobalDispatchContext` carrying `inFileExplorer` and a `sendKey` that dispatches a same-document synthetic arrow and hides it from the physical-key observer.

**Vim toggle**: The plugin supports toggling the fork's vim mode on/off at runtime via Obsidian commands (`toggle-vim-mode`, `enable-vim-mode`, `disable-vim-mode`) and the `vimEnabled` setting. This uses a mutable `Extension[]` array and `workspace.updateOptions()` to swap the vim extension without a plugin reload. Subsystems (Lua, vimrc, gutters, animated cursor) are automatically set up/torn down during the toggle. Configuration can be reloaded at runtime via `reload-configuration` (soft-reload of vimrc and Lua) and opened in an external editor via `open-configuration` (desktop only).

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

## Linting and verification gates

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.
- **`npm run verify` runs all seven static gates**: `typecheck` (`tsc -noEmit`), `typecheck:tests`, `typecheck:config`, `lint`, `format:check` (Prettier, pinned as a devDependency), `lint:patterns` (`ast-grep scan`), and `lint:deadcode` (`knip`). All seven are blocking in CI.
- **`typecheck:tests` exists because `test/` is outside `tsconfig.json`'s `src/**/*.ts` include, so nothing type-checked it.** A broken import passed typecheck, lint and format alike and surfaced only when the spec ran: a missing `getVimMode` import replaced a real macOS failure with a `ReferenceError`, an import of `useSourceProperties` that `helpers` never exported was invisible, and a `node:path` call inside a browser callback failed as `resolvePath is not defined`. It now runs **full strict `tsc -p tsconfig.test.json`** with no error filtering, at zero errors. Three settings there are load-bearing. The `include` also lists `src/**/*.d.ts` and `src/types/globals.ts`, because the ambient `__DEV__`, `*.lua`, `*.wasm` and `*.json` declarations live in `src/` and are invisible to an include of `test/` alone — without them the run reports 19 errors against `src/` that are configuration gaps, not defects. `lib` adds `DOM.Iterable`, which `src/` never needs but the specs do whenever they spread a `NodeList` inside a `browser.executeObsidian` callback that runs in Chromium. `noUnusedLocals` stays off, matching the `test/` block in `eslint.config.mts`; that backlog is separately owned. The vendored fengari sources report zero under strict. It does **not** catch a scope error like the `resolvePath` one, which is valid TypeScript in the file and wrong only at runtime.
- **The first strict pass over `test/` found four defects that every other gate had passed**, which is the standing argument for keeping it blocking: `expect(result.flash).toBe(DEFAULT_SETTINGS.flash)` compared `undefined` to `undefined` because no `flash` setting exists (the real keys are `flashMultiLine`, `flashJumpEnabled`, …); `plugin-demand-harness.ts` called `runCleanups(cleanups)` without the required `context`, so a failing disposer logged `undefined cleanup failed`; `navigation.e2e.ts` passed `string[]` to `vimHandleKeys(keys: string)`, and its own `catch` recorded the resulting throw as `threw: …`, silently disabling the delivery-vs-motion probe the surrounding comment describes; and `lua-plugin-flash-diagnostic.ts`'s `Probe` interface omitted `loaded` and `require_in_callback`, the two fields its load-bearing assertions read. Note what the class has in common — each looks like a passing test.
- **`$$(...)` is not a `Promise` to TypeScript, so `await` does not unwrap it.** WebdriverIO's `ChainablePromiseArray` declares no `then`, which leaves `await $$(sel)` typed as the chainable, where `length` is `Promise<number>` and indexing yields `ChainablePromiseElement | undefined`. `cells[cells.length - 1]` therefore indexes by `NaN` as far as the types are concerned. It happens to work at runtime because the value really is an array by then, so nothing fails — use `await $$(sel).getElements()`, which is declared to return `WebdriverIO.ElementArray`.
- **`typecheck:config` exists because the root-level configuration files were checked by nothing.** `tsconfig.json` includes `src/**/*.ts` and `tsconfig.test.json` includes `test/**/*.ts`, which left `wdio.conf.mts` — 403 lines, including the `afterTest` cleanup hook whose failure surfaces as cross-test flakiness rather than a red test — outside both. It reported 22 errors on first measurement. `tsconfig.config.json` must use `moduleResolution: nodenext`: `node` and `bundler` both fail to resolve `wdio-obsidian-service`'s types, which makes every `declare global` augmentation of `WebdriverIO.Browser` invisible and reports 40 errors that are resolution artifacts rather than defects. `wdio.conf.mts` also needs `import type {} from 'webdriverio'` and `'wdio-obsidian-service'` — it uses `WebdriverIO.Config` and `browser.executeObsidian`, and a global augmentation only loads if its package is imported. Keep `@wdio/types` out: it is transitive rather than declared, `webdriverio` already supplies `Config`, and knip fails the build on it. It also covers the `.mjs` build, release and CI-reporting scripts under `allowJs`/`checkJs`, which reported 11 errors. `esbuild.config.mjs` was already clean; the other three were not, and `version-bump.mjs` was the worst of them — `process.env.npm_package_version` is `string | undefined`, so running it outside `npm version` wrote a version-less `manifest.json` and a literal `"undefined"` key into `versions.json`. It now throws instead.
- **Strict typing cannot catch a wrong `executeObsidian` cast, because the cast is an assertion rather than a reading.** Specs reach the plugin through `app as unknown as { plugins: { plugins: Record<string, T> } }` with `T` written by hand, so a member the plugin does not have still compiles and silently evaluates to `undefined`. `treesitter.e2e.ts` declared `luaLoadResult`, which has never existed, so its `getLuaConfigError()` returned `null` unconditionally and **all 12 of its tests passed against a Lua body of `this is not valid lua @@@ ###`** — the `vim.g.__*` flags each test computed were never read. `test/unit/spec-shape-guards.test.ts` now closes both halves of that class across `test/`: it cross-checks every hand-written plugin member — 97 spec files declare one — against the class in `src/main.ts`, and it fails any `executeObsidian` callback with an `{ error: … }` branch whose result is cast to a primitive that drops it. Prefer asserting on values the code under test actually produced; `expect(error).toBeNull()` against a helper that can only return `null` satisfies `expect-expect` while proving nothing.
- **Do not re-declare `@replit/codemirror-vim` locally. The fork ships its own types.** `src/types/codemirror-vim.d.ts` used to declare `export const Vim: Record<string, unknown>` alongside 15 fork-specific exports, which shadowed the **166** members the fork's own `.d.ts` exports and reduced every `Vim.*` access to `unknown`. All 15 of those exports were already shipped, and deleting the file reports zero errors in both `src/` and `test/` — it was pure loss across the 19 files that import it. That erasure is what forced the workaround casts: `escape-guard.ts` wrapped `setIdleEscapeCallback` in an `as unknown as` and `plugin-demand-harness.ts` needed a hand-written four-member view, both now gone. `getBundledVimApi()`'s `Vim as unknown as VimApi` stays: the plugin's hand-written `VimApi` in `src/types/vim-api.d.ts` genuinely does not overlap the fork's shape, and converging the two is a separate, much larger change.
- **`typecheck` was added because `verify` could not see a type error.** `build:ci-test` is esbuild-only and strips types without checking them, and the other four gates never invoke `tsc`, so a `ReturnType<typeof window.setTimeout>` that resolves to `Timeout` under the `@types/node` for Node 26 — while the call returns `number` — passed both gates locally and broke only the `26.x` build leg. `npm run build` type-checks too, but it is not what you reach for before a commit.
- **`tsconfig.json` sets `noUnusedLocals`.** It is the only checker that sees unused **private class members**: ESLint does not analyse class members and knip has no class-member analysis. It does not honour the `^_` convention for locals the way it does for parameters, which is why the vendored dead file-loading helpers had to go (recorded in `src/lib/fengari/DIFFERENCES.md`). A public method with no call sites is still undetected by everything.
- **`knip.jsonc` gates unreferenced files, exports, types, and dependencies.** It cannot see class members, so a public method with no call sites — the `destroyAll()` shape — remains undetected; `tsc --noUnusedLocals` covers only the `private` case and is not currently enabled. Anything reached dynamically (a wdio `framework`/`reporters` string, a test-only dynamic import) needs an ignore entry carrying a reason.
- **Treesitter bridge and fold metadata lifetime**: `main.ts` installs the bridge through `enableTreesitterBridge()` only after the Markdown grammars load, using a mutable extension slot and `workspace.updateOptions()`. The slot also tracks the Neovim RPC connection via `applyTreesitterBridgeSlot()`: while connected, Neovim parses the same document natively and every renderer consumer of this tree is dormant — motions and text objects run as companion mappings inside Neovim, fold state is mirrored from redraw — so the bridge is removed rather than parsing each change twice. The Lua `vim.treesitter` API is unaffected; it keeps its own parser cache. The bridge applies composed `update.changes`; its `publish()` method alone frees replaced trees. Never dispatch from its constructor or `update()` — CM6 rejects reentrant dispatch and deactivates the plugin. `tree-state.ts` holds only the per-view tree `WeakMap`, not a `StateField` (old editor states must never retain freed WASM handles). `src/fold/metadata.ts` extracts readonly plain-data heading ranges/titles and fence languages into a `WeakMap` keyed by exact `EditorState` identity. The bridge re-extracts after document edits and publishes the same metadata for selection-only states; a null tree publishes nothing. A section's column-zero end is exclusive, so subtract one row before trimming trailing blank lines. The heading provider uses regex only when metadata is unavailable, not when a metadata map has no heading at that line. Frontmatter/callout precedence and placeholder string formats remain unchanged. Real-WASM regressions live in `test/unit/fold/metadata.test.ts` and `bridge-metadata.test.ts`; the exclusive-end case must fail with the column-zero adjustment removed. Syntax-aware JS consumers retain their fallbacks while the bridge is unavailable; the Lua API has its own parser cache.

- **Unused parameters are reported** (`args: 'after-used'`). Vendored `src/lib/fengari/**` is exempt because its signatures mirror the Lua C API. A parameter you genuinely must accept and ignore — a fixed-arity foreign callback — is prefixed `_`; do not use that prefix to silence a parameter whose behaviour you simply did not implement.
- **Pattern rules live in `.ast-grep/rules/`** (registered by `sgconfig.yml`) and target defect classes that plan review structurally cannot see: `promise-owned-listener` (a listener released only on the paths that settle its Promise), `unguarded-disposer-loop` (a cleanup loop that stops at the first throw), `solo-self-reported-success` (a test whose only assertion is a flag it produced itself) and `editor-view-double-cm` (`.cm.cm`, which steps off the CM6 `EditorView` onto the CM5 vim adapter — the shape that made every gutter reconfigure a silent no-op for 108 releases). Use `runCleanups` from `src/util/cleanup.ts` for disposal, and the single-owner-with-abort shape of `src/lua/key-broker.ts` for anything holding a listener across a wait.
- **Coordinate regression gates:** `neovim-coordinate-boundary` flags direct/optional/bracket/member-reference host-coordinate access in Lua bindings. Exact host-unit exceptions cover callback wiring, Obsidian-native cursor APIs and line-only current-line handlers; separate named legacy exceptions (`getpos`, `getcurpos`, `winsaveview`, `wincol`, `searchpos`) are deferred, not byte-correct. `coordinate-boundary-rule.test.ts` checks the suppression inventory. `coordinate-manifest.test.ts` generates real-handler conformance from `test/fixtures/neovim-coordinate-api-manifest.ts`; `coordinate-types.test.ts` checks directional brands. Brands and AST rules cannot replace semantic coverage: brands do not detect a missing conversion, and syntax cannot prove units, bases or sentinels. `api-status-counts.test.ts` reuses `api-inventory.ts` to guard source-derived dispatch/registration counts, exact per-name status membership, public denominators and historical provenance in `NEOVIM_API_STATUS.md`. Every new/modified assertion requires observed negative-control values and restored green results in `test/fixtures/neovim-coordinate-controls.md`; native oracle and literal fixtures stay independent of the shim.
- **`test/` is linted.** It used to sit in `globalIgnores`, which is why tests that assert nothing survived for so long. `@vitest/eslint-plugin` covers `test/unit/**` (`expect-expect`, `valid-expect`, `no-conditional-expect`, `no-standalone-expect`, `no-identical-title`, `no-focused-tests`) and `eslint-plugin-wdio` covers `test/specs/**`, where `await-expect` and `no-floating-promise` catch the assertion that is built but never awaited — it resolves to a pending Promise, is truthy, and never throws. Test files are outside `tsconfig.json`'s `src/**/*.ts` include, so the block applies `disableTypeChecked` and switches off the obsidianmd and import rules, which describe plugin code rather than fixtures. `wdio/no-pause` is off: 2902 occurrences of an established `browser.pause()` idiom are a flakiness question, not a vacuity one. The general lint backlog in `test/` (unused locals, `any`, bare disable directives) is switched off there and separately owned; it is **not** suppressed for `src`.
- **`expect-expect` is syntactic and trusts any helper in `assertFunctionNames`.** A wrapper that only proves "the plugin is still loaded" satisfies it while proving nothing about the feature under test. Widening `assertFunctionNames` to clear a finding, or adding `expect(true).toBe(true)`, converts a detectable problem into an undetectable one. The gate is necessary and not sufficient — `.agents/skills/negative-control/SKILL.md` closes the rest, and applies to **every** new or modified test, not only issue reproductions.
- A new rule must be shown to fire on a defect that actually shipped before it is trusted. Suppressions must name a plan that owns the fix, and the `// ast-grep-ignore: <rule>` directive must be the **last** comment line before the flagged code.

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
- **Lua API compatibility modules** (also listed in `CONTRIBUTING.md`):
    ```
    src/
      fold/
        frontmatter.ts           # Shared start-of-document YAML delimiter rule
        metadata.ts            # Immutable heading ranges/titles and fence languages keyed by exact EditorState
      types/
        lua-modules.d.ts       # Text-loader declaration for bundled Lua companion sources
      lua/
        coordinates.ts        # Typed byte/character/display adapter, text/legacy-position/extmark boundaries and string codec
        coordinate-wire.ts    # Lua argument/result marshalling, including raw byte-string results
        iter.ts                # Embedded Lua iterator implementation (26 methods)
        key-broker.ts          # Single owner of the getcharstr key listener and intercept lease
        module-snapshot.ts     # In-memory vault Lua sources so require() resolves synchronously
        on-key.ts              # vim.on_key namespace registry, dispatch, teardown
        termcodes.ts           # Neovim key-byte encoder and fork-boundary decoder
        window-info.ts         # vim.fn.getwininfo CM6 viewport geometry
      rpc/
        companion.lua          # Bundled write/read routing, structural motions, cursor notification and redraw-time extmark/fold/float forwarding
        cmdline.ts             # Level-keyed external Neovim command-line, prompt, caret and special-character overlay
        config-export.ts       # Generated Neovim configuration, sentinel-guarded writes, plugin install/update and module probing
        decorations.ts         # UI redraw clock, CM6 decoration/fold dispatch and floating-window notification consumer
        document-sync.ts      # Named acwrite Markdown mirror, Obsidian save/read routing, line events, byte/UTF-16 mapping and projected editor options (textwidth, list continuation, indent style, yank highlight)
        floating-windows.ts   # CM6-metric float positioning, content/extmark overlays, stacking and cleanup
        frontmatter-fold.ts   # Window-local Markdown foldexpr for headings, callouts and frontmatter
        ime-input.ts          # Cursor-positioned native composition owner, nvim_input commit and cancellation lifecycle
        key-delegation.ts     # Markdown-only key/IME forwarding, Oil exclusion, widget-focus exclusion, frontmatter cursor guard, RPC barrier and cursor/mode sync
        messages.ts           # D12 msg_show routing and deduplicated Obsidian Notices
        mode-status.ts        # msg_showmode routing and RPC-over-fork status-bar arbitration
        msgpack-rpc.ts         # Stream msgpack-RPC client, including Neovim 64-bit integer decoding
        neovim-connection.ts   # Desktop process/config/key ownership, API floor, crash handling and teardown
        obsidian-feature-bridge.ts # Registry-derived Neovim mappings/commands, count/argument payloads, cross-file cursor restoration, host dispatch and refresh teardown
        popupmenu.ts          # External popup-menu rows, selection, cmdline/grid anchoring and cleanup
        redraw.ts             # Ordered external-UI redraw event dispatch with cheap unhandled-event rejection
      treesitter/
        bundled-queries.ts     # Bundled markdown/markdown_inline/html textobjects queries
        query-files.ts         # Vault .scm snapshot, inheritance, extension modelines, limits
        named-queries.ts       # Named query precedence, lazy compilation, cache invalidation
      util/
        cleanup.ts             # runCleanups: exception-isolated disposal, continues past a failure
        key-capture.ts         # Single owner of a modal keydown listener; releases on resolve, abort, and teardown
      vim/
        external-mode.ts       # Backend-reported vim mode for per-mode host rendering and IM switching
      workspace/
        key-observer.ts        # Physical key observation feeding vim.on_key
    ```
- **CI and RPC test tooling**:
    ```
    .dockerignore                              # Minimal root Docker build context for the E2E runner
    .github/docker/e2e-runner/Dockerfile       # Linux E2E image with pinned Neovim
    .github/workflows/docker-e2e-runner.yml    # E2E image build and publish workflow
    .github/workflows/e2e.yml                  # Sharded Linux, macOS, and Windows E2E jobs
    scripts/install-neovim.sh                  # Linux/macOS official-release installer and API-floor check
    scripts/install-neovim.ps1                 # Windows official-release installer and API-floor check
    scripts/neovim-version.txt                 # Single cross-platform Neovim version pin
    test/specs/rpc-prerequisites.ts            # Shared Neovim/API-level/fixture skip guard for RPC specs
    ```
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
- **CI container image (Linux)**: The e2e workflow shards spec files into 36 groups (matching the GitHub Actions concurrent job limit) and runs each shard inside a custom Docker image (`ghcr.io/<repo>/e2e-runner:latest`) built from `.github/docker/e2e-runner/Dockerfile`. The discover job distributes specs round-robin; each runner executes 2–3 specs sequentially. This keeps the matrix under the 256-job GitHub Actions cap. The image includes Xvfb, herbstluftwm, Node.js 24, Neovim 0.12.5 from its official release tarball, and Electron system dependencies. The entrypoint starts the virtual display with readiness polling before handing off to job steps — no per-runner `apt-get install` or `sleep`-based setup. The image is built and pushed to GHCR by `.github/workflows/docker-e2e-runner.yml` on changes under `.github/docker/e2e-runner/` or manual dispatch.
- **`rpc-latency.e2e.ts` is excluded from the shards and is not a blocking gate.** The `discover` job filters it out with `! -name`, and the separate `e2e-latency` job runs it on Linux only, always exiting 0. It is a benchmark: shared runners move its percentiles on their own, and its built-in delay control — inject 30 ms, require the measured p95 to rise by ≥30 ms — cannot clear that bar when the runner's baseline p95 is ~114 ms against the ~23.5 ms certified locally. Failures surface as a `::warning::` annotation plus a `$GITHUB_STEP_SUMMARY` table of per-condition p50/p95/p99 written by `scripts/report-latency.mjs`, so a regression is visible without blocking. Treat the summary as a trend; the certified figures are point-in-time local measurements. If you re-add it to a blocking job, expect intermittent red on macOS.
- **CI cross-platform (macOS/Windows)**: The same sharded spec distribution runs on `macos-latest` (ARM) and `windows-latest` runners via the `e2e-cross-platform` job. No virtual display setup is needed — GitHub macOS/Windows runners provide native GUI sessions. `wdio-obsidian-service` handles Obsidian download, ChromeDriver version matching, and platform-specific launch. `CSC_IDENTITY_AUTO_DISCOVERY=false` prevents macOS keychain prompts. 40-minute timeout per job. Windows shards retry up to 3 times on `EPERM` errors (Windows NTFS file locking during `obsidian-launcher`'s atomic rename in `onPrepare`).
- **CI test plugin pre-fetch**: A "Fetch test plugins" step runs before build on all platforms. `scripts/fetch-test-plugins.sh` reads `test/fixtures/test-plugins.json` and downloads plugin tarballs from GitHub codeload (not REST API — no rate limits), extracting specified Lua files into `test-vault/lua/`. Tests that use pre-fetched plugins (e.g., `lua-plugin-mini-comment.e2e.ts`) skip `vim.plugins.add()` when the file already exists. The fetch test itself is skipped when the plugin is pre-fetched. To add a new test plugin, add an entry to `test/fixtures/test-plugins.json` and a corresponding `.gitignore` line for `test-vault/lua/<plugin>/`. An entry takes either `files` (explicit archive paths) or `dirs` (whole subtrees — use this for anything larger than a file or two; enumerating paths silently drifts when upstream adds one). The same fetched tree serves both runtimes: `test/fixtures/nvim/init.lua` appends `test-vault` to Neovim's `runtimepath`, so a plugin fetched for the fengari specs is also `require`-able from a live Neovim — that is how `flash.nvim` backs the decoration and float oracles and `LuaSnip` backs the snippet-expansion spec. A 40-character hex `ref` is fetched as a commit SHA rather than a branch; pin a SHA for any spec that asserts on plugin internals. A missing file or directory fails the script, and the fetch step runs before build on every platform, so a drifted path fails the job loudly rather than surfacing later as confusing test failures. The script downloads each tarball to disk with `curl --retry 3 --retry-all-errors` before extracting, rather than piping `curl` into `tar`: a response cut mid-stream is unrecoverable through a pipe — codeload truncated a `flash.nvim` tarball and `tar` died with `gzip: stdin: unexpected end of file`, taking a whole Windows shard with it — and a truncated body is not an HTTP error, so `curl -f` does not catch it either.

Specs that depend on a fetched fixture must skip when it is absent rather than failing — see `test/specs/lua-plugin-flash-diagnostic.e2e.ts`, which checks for the vendored tree with `fs.existsSync` and calls `this.skip()`. The fetch step failing is the signal worth reading; twenty red assertions downstream only bury it.

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

The full e2e suite (`npm run test:e2e`) runs 213 spec files (212 sharded; `rpc-latency` is excluded). The **85 minute** runtime figure was measured on 2026-09-07 at 1:24:13 against 225 spec files and has **not** been re-measured since the count fell to 213, so treat it as an upper bound rather than a current reading. Re-measure before relying on it. Each spec launches a fresh Obsidian instance. When running from an agent or script:

- Use a timeout of at least **7200000 ms** (2 hours) to avoid premature termination.
- **A subagent may run wdio, but bound the invocation, not the task.** A run killed midway strands Obsidian, ChromeDriver and their GPU/renderer children, which then have to be killed by hand, so no single `wdio` call may risk outliving its shell timeout. Bounding by spec _selection_ ("only the specs you changed") does not bound wall-clock time: 31 changed specs is an 18-minute run. Measured rates are ~23 s/spec (16 specs → 6:02; 226 → 1:26:49) but ~36 s/spec across heavy suites (`hint-mode`, `table-*`), so spec count predicts runtime only loosely.
    - **≤10 specs per `wdio` invocation**, each enumerated with `--spec`. Never a bare `wdio run` — that is all 226 — and never an uncounted glob.
    - **Set the bash timeout explicitly to 900000 ms.** The 120 s default kills even a two-spec run.
    - **Split larger sets into sequential invocations of ≤10.** Total wall-clock is unchanged; each _call_ is bounded, which is the only thing that decides whether a run dies mid-flight.
    - **More than ~30 specs total: hand back to the orchestrator**, which runs it detached with `nohup` and polls.
    - **After any aborted run, verify no orphans survive.** `pkill -f` patterns match the killing command's own arguments: a literal `wdio`/`chromedriver` in the pattern — or even a variable named `chromedriver=` — kills the shell issuing it. Match with a split literal such as `pgrep -fa 'chrome''driver'`.
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
- `test/specs/` — Tier 2 tests (plugin features: text objects, navigation, workspace, operators, vimrc, settings, jump list, table cell vim mode, vim toggle, gutter reconfiguration, cursor-line highlighting, and Neovim RPC lifecycle/text/key/write/read/decorations synchronisation). RPC specs set `neovimConfigPath` to the committed `test/fixtures/nvim/init.lua`. The fixture adds `test-vault` to `runtimepath` so fetched Lua plugins resolve without changing production configuration. The text-sync spec asserts its Lua marker before driving Neovim APIs directly and comparing CM6 with a raw-byte Lua oracle; its two-file activation regression independently checks known editor content and vault-adapter disk content so Neovim/CM6 agreement cannot mask cross-note overwrite. `rpc-write-routing.e2e.ts` spies on Obsidian's active-editor save command, independently reads through the vault adapter, checks `:e!` against a deliberately stale disk copy, and verifies the Neovim dirty flag is cleared. `rpc-keys.e2e.ts` drives 210 real-DOM sequences, compares a live headless Neovim, checks bridge non-perturbation, and covers D7 in both properties modes, including disk integrity. `rpc-decorations.e2e.ts` uses flash.nvim's own all-namespace extmarks as the label/position oracle and checks the no-polling/no-grid boundary. `rpc-floats.e2e.ts` compares flash's prompt and custom float metadata against positioned overlays, including extmarks, z-index, close, and disconnect cleanup. `rpc-ime.e2e.ts` uses Chromium CDP to drive native composition and covers commit, dot-repeat, cancellation, key suppression, and note switching. The corresponding negative-control Markdown files record the M2a, M2c, write/read routing, M3, M6a, and M6b sabotages.
- `test/unit/vim-registration-inventory.test.ts` guards the measured one-pass motion/action/map/ex surface and the six M4a bridge selections. `test/specs/rpc-obsidian-bridge.e2e.ts` covers registry-derived picker sources, query/source argument forwarding, modal key ownership, post-selection Neovim re-seeding, Oil, Harpoon slots/cycling/removal, cross-note counted jumplist navigation, marks and sign-column refresh, workspace splits/pane focus/tab targeting, go-to-definition, heading navigation, lowercase ex commands, guarded command-line abbreviations, and refresh teardown. `rpc-obsidian-bridge-negative-controls.md` records the M4a and M4b sabotages.
- `test/specs/rpc-oil.e2e.ts` exercises all 16 Oil mappings through the embedded editor's real DOM while RPC is connected, explicitly skips the two OS-shelling actions, and asserts that Oil has no RPC keydown handler or fork interception while Markdown restores both. `rpc-oil-negative-controls.md` records forced interception corrupting Neovim and isolated Oil action sabotage.
- `test/specs/rpc-folds-undo.e2e.ts` covers redraw-driven fold mirroring, native fold/undo operations, raw-byte undo/redo, the Neovim-backed undo-tree sidebar, and duplicate-free bridge refresh. `rpc-folds-undo-negative-controls.md` records forwarding, row-mapping, data-source, and command-bridge sabotages.
- `test/specs/rpc-structural-nav.e2e.ts` uses the bundled fork as the runtime oracle for RPC heading/list/link motions, counts, operator-pending ranges/register contents, and native `gq`/`gw` at the configured `textwidth`; it includes a vault-adapter data-safety read. `rpc-structural-nav-negative-controls.md` records mapping, width, level, motion-kind, and count sabotages.
- `test/specs/rpc-text-objects.e2e.ts` runs the fork and RPC backends over the same 65 Markdown text-object scenarios, comparing documents, cursors, yank registers, visual selections, and counted forms; every operator checks the non-empty-document safety invariant and one result is read through the vault adapter. `rpc-text-objects-negative-controls.md` records range-end, missing-map, and count-forwarding sabotages.
- `test/specs/rpc-messages.e2e.ts` covers external-UI message routing, severity styling, key-driven Lua errors, ignored undo/search chatter, deduplication, and the grid-event latency boundary. `rpc-messages-negative-controls.md` records missing dispatch, noisy-kind routing, and removed-dedup failures.
- `test/specs/rpc-cmdline.e2e.ts` covers the external command line, byte-correct caret placement, first characters, prompts, selection/cancellation, nested levels, teardown, and bundled-fork isolation. `rpc-cmdline-negative-controls.md` records stale-hide, raw-byte-caret, and single-level-state failures.
- `test/specs/rpc-popupmenu.e2e.ts` covers insert completion plus command-line wildmenu rendering, selection, grid/cmdline anchoring, styling, and teardown. Four scenarios in `rpc-lifecycle.e2e.ts` cover Neovim status-bar modes and disconnect arbitration. `rpc-popupmenu-negative-controls.md` records ignored-selection, wrong-anchor, and suppressed-mode-handler failures.
- `test/specs/rpc-latency.e2e.ts` drives both production backends with real `browser.keys()` over a runtime-created 2,004-line note and resolves both on the first rAF after the same `docChanged || selectionSet` CM6 update criterion. It enforces zero size drift and a budgeted p50 delta before calculating the rest. The certified run measured fork/RPC p50 16.2/8.2 ms, p95 43.4/23.5 ms, and p99 54.0/28.9 ms; RPC leads at every percentile, so the earlier fork-faster-at-p50 assertion was replaced by a two-directional budget rather than re-tuned. `rpc-latency-negative-controls.md` records synchronous-delay, forced-layout, bridge-engagement/fork-isolation, and size-drift evidence.
- `test/specs/rpc-editor-options.e2e.ts` covers the settings projected onto the mirrored buffer — bullet list continuation on and off, yank highlight on and off, and reapplication after an activation reseeds the buffer. `test/specs/rpc-config-export.e2e.ts` covers the generated Neovim configuration: requireability by a live Neovim, loading with none of the referenced plugins present, sentinel-guarded overwrite refusal, package activation under `--clean`, bundled snippet write-out, and staleness. `test/specs/rpc-table-nav.e2e.ts` measures that the table overlay and Neovim never both act on one key, with a positive control pressing the same key outside the table.
- `test/unit/` — Vitest unit tests (jumplist, mark-store, lua engine, picker, invariants, mode-tracker, settings-resolution, dual-vim, animated-cursor, oil-parser, oil-diff, vimrc-parser, flash-labeler, fold-persistence, pair-util, etc.).
- `test/unit/fengari/` — 23 test files (6 fork-specific + 17 upstream) for the Lua VM, converted to TypeScript ESM.
- `test/unit/lua/` — API compatibility regression coverage includes `api-compat.test.ts` (option routes and current-handle calls), `iter.test.ts`, `on-key.test.ts`, `termcodes.test.ts`, `treesitter-queries.test.ts` (real bundled WASM grammars, query resolution, lifecycle, and limits), and `plugin-query-fetch.test.ts`. `key-broker.test.ts` and `vim-v-context.test.ts` cover the shared key listener and the callback context stack; both carry negative controls that reproduce the defect they replaced, so a regression flips them rather than passing silently. `fn.test.ts` covers four `getwininfo` geometry/fallback cases; `api.test.ts` asserts that termcode conversion returns `"\r"` for `<CR>`, not unchanged notation.
- `test/neovim/` — Neovim comparison infrastructure (client, compare, golden, deviations, wrapper, definitions, recording).
- `test/helpers.ts` — shared WDIO helpers (`setupEditor`, `vimKeys`, `vimRawKeys`, `vimHandleKeys`, `vimHandleKeysSync`, `getCursorPos`, `getEditorValue`, `getVimMode`, `getRegisterContent`, `ensureLivePreview`, `ensureSourceMode`, `isLivePreview`, `isSourceMode`, `setPluginSetting`, `setPluginSettingAndReload`). All helpers that require a MarkdownView throw with context (e.g., `"setupEditor: no MarkdownView (active leaf type: graph)"`) instead of silently returning defaults. `setupEditor` uses `waitUntil` to verify content was applied. `loadSingleFileWorkspace` waits for the MarkdownView to become active. `ensureLivePreview`/`ensureSourceMode` wait for the mode to actually change. `setPluginSetting` awaits `saveSettings()`. `setPluginSettingAndReload` also calls `reloadFeatures()` and waits for settle. `vimHandleKeys` dispatches all keys synchronously through `Vim.handleKey()` in a single `executeObsidian` callback, bypassing DOM event timing. Used for visual-mode compound operations that fail with `vimRawKeys` DOM dispatch (via `useHandleKey` flag on `TestCaseDefinition`). `vimHandleKeysSync` is similar but includes `<Esc>` in the same `executeObsidian` call (ensuring clean normal mode without a cross-call boundary) and supports `waitForTimeout` for leader-key mappings subject to `operatorshadowtimeout` deferral. `handleEx(input)` drives the fork's ex-command handler and returns `{ ok, error?, unknownCommand, messages, dispatchedCommands }`; because `Vim.handleEx` returns `void`, `ok` alone is the vacuous assertion that let `:changes`, `:edit!` and `:violations!` ship broken with passing tests — assert `unknownCommand === false`, which the fork sets when it emits `Not an editor command`, and pair it with `dispatchedCommands` or real state. `getWorkspaceSnapshot`, `loadTwoFileWorkspace`, `getVimMarkLetters` and `getInfoModalTitles` cover leaf counts, multi-buffer setup, marks and `VimInfoModal` titles. Three traps that have each produced a wrong diagnosis: only `VimInfoModal` renders `.vim-motions-info-modal-title` (picker/`SuggestModal` surfaces render `.modal-container`/`.prompt`/`.vim-motions-prompt-modal-container` and no title span); a test that opens a modal must close the **instance**, because `afterTest` force-removes modal DOM without calling `close()` and the surviving Obsidian `Scope` eats the next test's first keystroke; and a save-type command must be asserted through `dispatchedCommands` rather than on-disk content, since Obsidian's idle autosave reaches the same end state within ~2 s and masks a completely broken `:w`.
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
- **A setting that decides whether an editor extension is installed needs a runtime slot.** `reloadFeatures()` does not rebuild `vimExtensionSlot` — only `setupVimSubsystems()` populates it, and that runs from `onload()` and `enableVim()`. It is a one-shot builder and must not be re-run; `teardownVimSubsystems()` is far too destructive for a settings change. Give the feature its own nested `Extension[]`, push it into `vimExtensionSlot` once in `setupVimSubsystems()`, add an `apply*Slot()` to `populateRuntimeSlots()`, and register the setting in a reload path in **both** settings implementations. Build the extension through `setSlotEnabled()` so it is cached: a stable extension identity is what lets CodeMirror keep existing ViewPlugin instances (and their live state) alive when an unrelated setting is reloaded. Skipping any of these makes the toggle silently a no-op until Obsidian restarts, which is how `animatedCursor`, `enableSnippets`, `snippetTriggerMode` and `enableUndoTree` all shipped broken.
    - **Page assignment**: Mobile/Vim features/Picker/Vim engine → General. Line numbers/Gutter/Status bar/Mode prompts/Cursor shapes/Animated cursor/Yank highlight → Appearance. Jump navigation/Workspace navigation → Navigation. Vimrc/Leader/Which-key → Keybindings. Snippets/File explorer/Undo tree → Snippets & files. Input method → Input method. Advanced → Advanced. `vimEnabled` is in General.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.
- **`CHANGELOG.md` sections run `Added` → `Changed` → `Removed` → `Fixed` → `Tests` → `Documentation`, at most one of each per release.** The first four are Keep a Changelog; `Tests` and `Documentation` are this project's additions and always come last. Append to the existing section — never open a second block with the same name, and never invent a heading outside that set. A heading inserted into the middle of an existing list silently re-parents every entry below it: `### Known findings surfaced by the new gate` landed mid-`Added` and orphaned 15 release entries under a label that misdescribed them. `.github/workflows/docs.yml` publishes the file verbatim, so a mislabelled entry ships to the docs site. Releases below 0.100 predate the convention and deviate freely; that is history, not a defect — leave them alone.

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
| Neovim backend        | `features/neovim-backend.md`        | Vim engine (neovimRpcEnabled, neovimBinaryPath, neovimConfigPath)                                                                                  |
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
