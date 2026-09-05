# Contributing

Thank you for considering contributing to Vim Motions. This guide covers the development workflow, codebase conventions, and how to add new features.

## Getting started

```bash
# Clone the repository
git clone https://github.com/saberzero1/motions.git
cd motions

# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### Testing locally in Obsidian

1. Run `npm run build:dev` to produce `main.js` with `__DEV__` runtime assertions enabled (inline sourcemaps, auto-copies to `test-vault/`).
2. If testing in a different vault, copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/vim-motions/` directory.
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**.
4. Use `:violations` in the editor command line to inspect any runtime invariant violations caught during the session.

**Do not use `npm run build` for testing** — production builds strip `__DEV__` assertions and minify, making debugging harder.

Alternatively, symlink the project root into your vault's plugin directory for faster iteration during development.

### Running E2E tests

The E2E tests use [wdio-obsidian-service](https://github.com/nicholasgasior/wdio-obsidian-service) to run against a live Obsidian instance.

```bash
# On NixOS (recommended)
nix develop
npm run test:e2e

# On other Linux systems
# Install the required system libraries for Electron (see flake.nix for the list)
npm run test:e2e
```

The tests run in a headless Obsidian instance with Xvfb. The test vault is in `test-vault/`.

**CI infrastructure**: In CI, the e2e workflow shards spec files into 36 groups (matching the GitHub Actions concurrent job limit) and runs each shard inside a custom Docker image (`ghcr.io/<repo>/e2e-runner:latest`) that includes Xvfb, herbstluftwm, Node.js 24, and Electron system dependencies. The discover job distributes specs round-robin; each runner executes 2–3 specs sequentially. This keeps the matrix under the 256-job GitHub Actions cap. The entrypoint starts the virtual display with readiness polling — no manual `apt-get install` or `sleep`-based setup needed per runner. The image is defined in `.github/docker/e2e-runner/Dockerfile` and built by `.github/workflows/docker-e2e-runner.yml` on Dockerfile changes or manual dispatch. The same sharded spec distribution also runs on `macos-latest` (ARM) and `windows-latest` runners via the `e2e-cross-platform` job — no virtual display setup is needed on those platforms since GitHub macOS/Windows runners provide native GUI sessions. `wdio-obsidian-service` handles Obsidian download, ChromeDriver version matching, and platform-specific launch. Windows shards retry up to 3 times on `EPERM` errors (Windows NTFS file locking during `obsidian-launcher`'s atomic rename).

## Codebase structure

```
src/
  main.ts                  # Plugin lifecycle (onload, onunload, reloadFeatures, setupVimSubsystems, teardownVimSubsystems, reloadAllConfigs, openConfigInDefaultEditor)
  settings.ts              # Settings interface, defaults, and settings tab UI (7 pages: General, Appearance, Navigation, Keybindings, Snippets & files, Input method, Advanced)
  settings-migration.ts    # Settings schema migration between versions
  types/
    vim-api.d.ts           # Type declarations for the Vim API (CmAdapter, VimApi, etc.)
    codemirror-vim.d.ts    # CodeMirror Vim type declarations
    globals.ts             # __DEV__ build-time constant type declaration
  vim/
    vim-api.ts             # getVimApi(), getCmAdapter(), isVimEnabled()
    registration.ts        # VimRegistration — tracks and cleans up all Vim API registrations
    bundled-vim.ts         # Bundled vim fork registration as CM6 extension + editorLivePreviewField wiring + propertiesInDocument source-mode detection via setPropertiesSource + CodeMirrorAdapter bridge (Vim API + isCursorSuppressedForView for test access)
    mode-tracker.ts        # Status bar mode indicator + macro recording + search match counter + native highlight clearing (is-flashing) on Escape via vim-keypress handler
    search-counter.ts      # Search match counter (hlslens-style [3/15])
    scrolloff.ts           # CSS scroll-padding based scrolloff
    options.ts             # Vim option registration (clipboard, tabstop, etc.) — registerVimOptions() returns activation function to defer notify callbacks until after initial settings sync
    neovim-options.ts      # Comprehensive registry of ALL Neovim options with tier classification (hardcoded, noop-platform, noop-deferred, rejected, not-applicable) — used by vimrc loader and Lua vim.opt for tiered logging and typo detection
    insert-escape.ts       # Configurable insert mode escape sequence (jk, etc.)
    changelist.ts          # Change list tracking
    undo-tree.ts           # Undo tree data structure (shadow tree, branching, serialize/deserialize)
    undo-tree-view.ts      # Undo tree sidebar view (DOM rendering, keyboard nav, click-to-navigate)
    yank-highlight.ts      # Yank highlight flash effect
    yank-ring.ts           # Yank-ring paste cycling
    visual-line-command-fix.ts  # Visual line command edge-case fixes
    linewise-widget-highlight.ts  # Visual-line highlight for replaced widget blocks
    fold-sync.ts               # Fold state synchronization + Neovim-compatible foldopen (annotation-gated unfold) + unfoldEffect range normalizer + propertiesFoldObserver (is-collapsed filter)
    mark-store.ts          # Mark persistence across sessions
    sign-column.ts         # Sign column (mark indicators via gutter() + GutterMarker + Compartment)
    mark-gutter.ts         # Mark gutter refresh scheduling (delegates to sign-column)
    line-number-gutter.ts  # Configurable line number gutter (absolute/relative/hybrid/dual)
    statuscolumn.ts        # Unified configurable gutter (statuscolumn format string API)
    cursorline.ts          # Cursor line highlight (number/line/both modes)
    fold-column.ts         # Fold column gutter (▸/▾ indicators with click-to-fold)
    harpoon-store.ts       # Harpoon file slot persistence
    harpoon-nav.ts         # Harpoon navigation keybindings
    table-utils.ts         # Table parsing, cell utilities, escape-aware pipe splitting
    table-nav-controller.ts # Native table editor navigation overlay (KeyScope-based interception, fresh cmTile.widget references, hidden cell editor during navigation, dispatches enterTableNav/exitTableNav state effects to sync tableNavStateField, uses clearCursorSuppressedForView on exit/destroy to avoid stale per-view overrides, clearVimCursorLayer() hides and empties main editor cursor layer during nav, suppressWidgetCursorLayers() hides cell editor cursor layers inside widget on every ViewUpdate + entry + rAF safety net, deferred cursor placement in exitTable via window.requestAnimationFrame — destroys cell editor before placing cursor to prevent Obsidian's teardown from overriding cursor position, cellEditScope registers h/j/k/l handlers that check cursorAtCellBoundary before exiting to nav mode — h/l only exit when cursor is at first/last column, j/k only exit on last/first line; non-boundary keys pass through to vim for in-cell cursor movement, EditorView.scrollHandler facet intercepts scroll requests during nav mode and adjusts scrollDOM.scrollTop based on highlighted cell DOM rect — CM6 cannot scroll inside opaque block widgets so the handler provides custom scroll behavior that is not overridden by viewport reconciliation, scrollHighlightedCellIntoView() also scrolls the widget element horizontally when the table is wider than the viewport — the widget has overflow-x:auto in nav mode (styles.css), installCellEscapeCapture() adds a document-level capture-phase keydown listener during cell-edit mode that intercepts Escape when isCellVimIdle() returns true — this fires before the cell editor's vim observer can consume the event, isCellVimIdle() treats null/undefined mode as idle to handle cell editors whose vim state hasn't fully initialized, preEntryScrollTop captures scrollDOM.scrollTop before the entry debounce to prevent viewport snap — Obsidian's cell editor open scrolls the table into view during the 80ms debounce and focusWithoutScroll() + rAF restore the original position, getTableNavSessionSnapshot() exposes WeakMap session state for diagnostics, forceTableNavCleanup() for external cleanup of stuck table-nav state (pops scopes, clears key intercept, cursor suppression, hidden classes), logTableEvent lifecycle logging on constructor/tryEnter/enterCellEdit/exitCellEditToNav/exitTable/destroy)
    table-nav-state.ts      # Table navigation overlay state tracking
    table-nav-keymap.ts     # Table navigation keymap: structural commands, count prefix accumulation (digit → consumeCount), dot-repeat (lastStructuralAction), Tab/Shift+Tab cell navigation
    native-table-adapter.ts  # Typed abstraction for Obsidian's native TableEditor API access
    table-operations.ts    # Table row/column manipulation (insert, delete, move)
    table-cell-motions.ts    # defineMotion overrides for h/j/k/l/w/b/e cross-cell navigation in native table cell editors — gated on tableWidgetMode=native (independent of enableTableNav), count-prefixed j/k loop through getCellBelow/getCellAbove, scheduleCrossing uses requestAnimationFrame to defer focus changes, signals animated cursor handoff via signalCellCrossing(), getCrossingState() exposes token/pendingRaf/hasOverrides for diagnostics
    table-debug-state.ts     # Table debug state snapshot (getTableDebugState) — aggregates all hidden table interaction state (nav session, state field, mode tracker, cursor suppression, fork flags, crossing, DOM markers, scroll metrics) into a single queryable object; formatTableDebugState() for human-readable output; exposed via CodeMirrorAdapter bridge and :tablestate ex command
    table-cell-cursor-guard.ts # Two ViewPlugins: mainEditorTableCursorGuard (suppresses main editor cursor in table range via setCursorSuppressedForView(true), pauses animated cursor, checks isTableNavActive() to skip suppression during table-nav, gates suppression on hasVisibleTableWidget() to skip when no native table widget is visible — handles source mode (no widgets) and raw mode (widgets hidden via display:none), uses clearCursorSuppressedForView on exit/destroy to avoid stale per-view overrides) and cellEditorCursorGuard (ensures native cursor in cell editors via constructor unsuppress, destroy() guards on isTableNavActive() to avoid clearing parent cursor suppression during table-nav, uses clearCursorSuppressedForView for parent on destroy when nav is inactive)
    table-format-on-exit.ts    # Format-on-exit ViewPlugin + || separator handler
    jumplist.ts            # Cross-note jump list data structure
    jumplist-bridge.ts     # CM6 ViewPlugin bridging fork jump list to plugin list
    textarea-vim-manager.ts    # Vim-enabled textarea replacement (focusin detection, CM6 overlay) — handleEscapeAndRedispatch defers teardown via requestAnimationFrame so the Scope handler returns true while the editor's scope is still on the keymap stack; which-key overlay lifecycle (whichKeyConfig field, deferred creation with .view-content → .modal-container fallback, cleanup in teardownActive)
    escape-guard.ts            # Idle Escape handler via fork's setIdleEscapeCallback — workspace-leaf editors: silent consumption (prevents Obsidian hotkeys); non-workspace editors (popovers, modals): dismisses via HoverPopover.hide() or blur fallback
    autocmd-mode-watcher.ts  # Per-view autocmd mode events (CM6 ViewPlugin — fires InsertEnter/InsertLeave/ModeChanged across all editors)
    animated-cursor/         # Canvas-based animated cursor (smear + smooth movement)
      types.ts               # Shared interfaces (CursorRect, SmearQuad, AnimatedCursorConfig)
      smooth-cursor.ts       # Exponential position interpolation with convergence detection
      physics.ts             # 4-corner spring-damper simulation (smear trail)
      renderer.ts            # Canvas cursor shape drawing + smear quad rendering + DOM-based baseline calculation (charTop/charHeight from BlockCharInfo)
      manager.ts             # Global rAF scheduler + shared canvas owner + heartbeat safety net + visibilitychange recovery + cross-cell handoff (CellCrossingHandoff token, storeCrossingHandoff/consumeCrossingHandoff with TTL, signalCellCrossing/getPendingCrossingToken/clearPendingCrossingToken)
      controller.ts          # CM6 ViewPlugin — position tracking + shared context drawing + vim mode detection (operator-pending via inputState.operator only). Cell editors: native cursor steady-state renderer, canvas draws only during cross-cell transitions (cellTransitionActive flag). Non-cell editors: canvas renders, native cursor suppressed (removed per-update toggling, restored clearCursorSuppressedForView in destroy). Above-canvas editors (isAboveCanvas: .popover, .modal-container): fork's vim cursor un-suppressed via setCursorSuppressedForView(view, false), tick() skips canvas rendering — canvas z-index:15 renders behind popover z-index:30. Constructor gates suppression on config.enabled; update() clears per-view override when disabled
      config.ts              # Module-level getters/setters + per-view pause/resume API
  lib/
    fengari/               # Absorbed Fengari Lua 5.3 VM (TypeScript ESM)
  text-objects/

    delimiter.ts           # Paired-delimiter factory (single-line, multi-line, smart asterisk)
    link.ts                # [[wikilink]] and [text](url) text objects
    code-block.ts          # Fenced code block text objects
    blockquote.ts          # Blockquote and callout text objects
    table-cell.ts          # Table cell text object (i| / a|)
    table-row.ts           # Table row text object (ir / ar)
    pair-util.ts           # Shared asymmetric pair matching (used by iD/aD and Lua gen_spec.pair)
    subword.ts             # iS/aS subword text object
    number.ts              # in/an numeric literal text object
    any-quote.ts           # iq/aq nearest-quote text object
    double-bracket.ts      # iD/aD wikilink [[...]] text object
    url.ts                 # gL forward-seeking URL text object
    argument.ts            # i,/a, comma-separated argument text object
    indentation.ts         # ii/ai indentation text object
    tag.ts                 # HTML/Markdown tag text objects
    register.ts            # Wires all text objects to keybindings
  motions/
    headings.ts            # ]h/[h heading navigation
    lists.ts               # ]l/[l list navigation
    links.ts               # ]n/[n link navigation
    tables.ts              # ]|/[| table cell navigation
    buffers.ts             # ]b/[b buffer (tab) cycling
    subword.ts             # w/b/e/ge subword-aware motions (spider.nvim-style)
    goto-definition.ts     # gd link following + gx URL opening
    register.ts            # Wires all motions to keybindings
  operators/
    hardwrap.ts            # gq/gw Markdown-aware hard-wrap
    replace-with-register.ts  # gr{motion} replace text with register contents
    register.ts            # Wires hard-wrap operators (gq/gw) to keybindings — fold commands are registered unconditionally in main.ts, not here
  actions/
    open-line.ts           # Open-line action implementation
    dial.ts                # Enhanced increment/decrement dispatcher
    dial-rules.ts          # Dial rules (checkbox, boolean, hex, date, CSS, integer)
    register-dial.ts       # Dial action override registration
  workspace/
    navigation.ts          # registerCoreVimActions (always-on: gd/gD/gx/gO/gf/ga/g8/K/P/gp/gP/zs/ze/zH/zL/]Space/[Space/fold commands/alternate file/<leader>r* note actions) + registerWorkspaceNavigation (gated by enableWorkspaceNav: <C-w>h/j/k/l/v/s/c/q/o/w/W/p/T, gt/gT/g<C-t>) — gt uses repeatIsExplicit for Ngt count support, gotoNthTab filters to rootSplit
    navigate.ts            # Cross-note navigation wrappers (navigateWithJump, navigateWithJumpFile, navigateWithJumpSetActive)
    commands.ts            # Ex commands (:w, :q, :ob, :reg, :marks, :grep, :backlinks, etc.)
    vault-search.ts        # :grep vault-wide search implementation
    global-key-handler.ts  # Global key event handling (outside editor) — always installed on desktop, interception gates check focus/modal/leaf-type only (not enableWorkspaceNav); dispatch passes raw count to builtin handlers, sequence timeout restarts on partial match (which-key parity)
    global-mapping-registry.ts  # Registry for global key mappings
    global-defaults.ts     # Default global keybindings — always-on (`:`, hints) vs workspace-nav-conditional (scroll, tabs, panes) split via opts.enableWorkspaceNav; gotoNthTab filters to rootSplit leaves only; gf hint binding for context menu action
  easymotion/
    register.ts            # Wires EasyMotion to keybindings — per-motion motionArgs (inclusive, linewise, forward) for correct operator-pending behavior matching native Vim semantics
    targets.ts             # Target detection (words, lines, chars) — getVisibleRange uses view.visibleRanges for correct viewport calculation with collapsed frontmatter widgets in Live Preview
    overlay.ts             # Label + highlight overlay rendering (measureTarget, measureLabelAnchor, renderHighlightSpans)
    labels.ts              # Label generation and assignment
    keypress.ts            # Keypress handling during label selection (waitForKey with modifier-key guard, waitForLabel)
    types.ts               # EasyMotion type definitions
  flash/
    register.ts            # Flash registration (motion overrides, jump mode binding)
    char-mode.ts           # Enhanced f/F/t/T with label overlays
    jump-mode.ts           # Incremental bidirectional jump (s key, multi-char search)
    label-input.ts         # Shared label selection state machine (prefix accumulation, narrowing)
    labeler.ts             # Distance-based label assignment with reuse and conflict skip
    state.ts               # Flash active flag, clever-f state tracking
    search-mode.ts         # Post-commit search labels (/ and ? integration)
  fold/
    commands.ts            # Fold commands (zf, zd, zD, zE, zv, zF) + fold motions (zj, zk, [z, ]z) registration
    motions.ts             # Fold navigation motions + shared utilities (findNextFoldable, findEnclosingFoldable, foldedRangesWithin, foldableRegionsWithin)
    fold-enable.ts         # Fold enable/disable state (foldEnableField, isFoldingEnabled, zn/zN/zi)
    provider.ts            # Fold providers (frontmatter, callouts, headings — heading provider trims trailing blank lines)
    persistence.ts         # Cross-session fold persistence
    placeholder.ts         # Descriptive fold placeholder text
    fold-level.ts          # Fold level tracking + reapply (zx/zX)
  treesitter/
    runtime.ts             # web-tree-sitter WASM init, parser/language cache, grammar loading
    bridge.ts              # CM6 ViewPlugin for per-view incremental treesitter parsing
    tree-state.ts          # Shared treesitter state (WeakMap + StateField) — import-chain-safe for non-WASM consumers
    js-api.ts              # JS-side treesitter query helpers for TypeScript feature code (position lookup, ancestor check, inline nodes)
    query.ts               # QueryWrapper: compile .scm queries, iterCaptures/iterMatches with predicate filtering
    predicates.ts          # 8 built-in predicate handlers with generic #not-*/#any-* prefix dispatch
    directives.ts          # 4 built-in directive handlers (#set!, #offset!, #gsub!, #trim!)
    language-tree.ts       # LanguageTree class: multi-parser management, injection resolution, callbacks
    injection.ts           # Injection query processing: resolve injection language and ranges
    types.ts               # TypeScript interfaces for treesitter state
    wasm.d.ts              # Ambient module declaration for .wasm binary imports
    grammars/              # Vendored grammar .wasm files (tree-sitter-markdown.wasm, tree-sitter-html.wasm)
  lua/
    engine.ts              # Fengari Lua 5.3 VM setup, library loading, evalLuaAsync
    coroutine-runner.ts    # Coroutine↔Promise bridge (CoroutineRunner + AsyncRegistry)
    package.ts             # package table, sandboxed load(), Lua-implemented require()
    loader.ts              # .obsidian.init.lua config file loader
    api.ts                 # vim.keymap, vim.opt, vim.g, vim.v, vim.cmd, vim.notify, vim.api (43 nvim_* functions: buffer, cursor, marks, keymaps, options, commands, highlights, autocommands, key injection, UI), vim.plugins (add/list with auto-fetch support)
    fn.ts                  # vim.fn.* function library (65 functions)
    plugin-fetch.ts        # Plugin archive download and extraction (GitHub tarballs)
    plugin-store.ts        # Atomic plugin storage and lock file management
    tar.ts                 # Synchronous tar archive parser
    buffer.ts              # Buffer-local keymap manager (per-file keymap storage and application)
    autocmd.ts             # Autocommand manager (event registration, group lifecycle, pattern matching)
    highlight.ts           # Highlight group manager (nvim_set_hl/nvim_get_hl CSS variable bridge)
    stdlib.ts              # vim.tbl_*, vim.split, vim.trim, vim.inspect, vim.json, etc.
    regex.ts               # vim.regex() — ECMAScript RegExp wrapper (match_str, match_pos, replace, test)
    obsidian-api.ts        # vim.obsidian / vim.ob namespace (including vim.obsidian.im)
    timers.ts              # vim.schedule, vim.defer_fn, vim.uv timers
    textobject-api.ts      # vim.textobject + vim.gen_spec Lua API injection
    strftime.ts            # os.date-compatible time formatting
    types.d.ts             # Lua engine type declarations
    treesitter/
      api.ts               # vim.treesitter top-level namespace (get_parser, get_node, get_node_text, etc.)
      node.ts              # TSNode fengari userdata (31 methods via __index metatable)
      tree.ts              # TSTree fengari userdata (root, copy, included_ranges)
      language.ts          # vim.treesitter.language namespace (register, get_lang, add, inspect)
      query-api.ts         # vim.treesitter.query namespace (parse, get, set, iter_captures, iter_matches)
      language-tree-api.ts # LanguageTree Lua bindings (18 methods)
      range.ts             # Range push/read utilities for Lua
  oil/
    oil-view.ts            # Oil file explorer view (ItemView) — state includes dirPath, previousFile, previousViewMode for mode restoration on close; focusEditor() for tab-switch focus recovery; registerOilScopeKeys() registers Ctrl-key combos (<C-t>, <C-s>, <C-h>, <C-l>, <C-c>) on the editor's Obsidian Scope to intercept before Obsidian's default hotkeys, with blur-before-navigate for cross-leaf actions; onClose() calls editor.destroy() before removeChild() to pop the Obsidian Scope and prevent Ctrl-key interception leaking to the restored file
    manager.ts             # Oil session lifecycle management — openOil() captures editor mode + primes non-editor leaves with markdown view state before Oil, closeOil() restores mode via leaf.openFile({ state }), discoverAndMergeHidden(dirPath, expectedContent) async dotfile discovery with cache-safe single loadDirectory call, openEntryAtCursor() same-leaf open via leaf.openFile(), openEntryAtCursorInNewTab/InSplit/ExternalAtCursor for tab/split/external open
    parser.ts              # Buffer text ↔ directory entry parsing
    diff.ts                # Diff buffer edits to file system operations
    actions.ts             # File operations (create, rename, delete, move)
    render.ts              # Directory listing rendering — discoverHiddenEntries() via adapter.list() for dotfiles not in Vault index
    keybindings.ts         # Oil-specific vim keybindings — 15 mappings matching oil.nvim defaults (<CR> same-leaf, <C-t> new tab, <C-s>/<C-h> splits, <C-c>/q close, gx open external, g. toggle hidden, gs cycle sort, y. yank path, gf reveal, g? help), oilClose delegates to manager.closeOil(), focus restoration in onActiveLeafChange; Ctrl-key combos (<C-t>, <C-s>, <C-h>, <C-l>, <C-c>) are handled via Obsidian Scope in oil-view.ts to avoid Obsidian default hotkey conflicts
    extensions.ts          # CM6 extensions for Oil buffers
    cache.ts               # Directory listing cache
    types.ts               # Oil type definitions
  picker/
    picker.ts              # Main picker UI (modal, input, result list, preview)
    api.ts                 # Public picker API for external plugin integration
    picker-api.d.ts        # Picker API type declarations
    registry.ts            # Source registry and picker command registration
    matcher.ts             # Fuzzy matching interface
    matcher-obsidian.ts    # Matcher using Obsidian's prepareSimpleSearch
    matcher-ufuzzy.ts      # Matcher using uFuzzy library
    matcher-utils.ts       # Shared matcher utilities
    frecency.ts            # Frecency scoring for result ranking
    types.ts               # Picker type definitions
    sources/               # Built-in picker sources:
      files.ts             #   File finder
      buffers.ts           #   Open buffer switcher
      recent.ts            #   Recent files
      commands.ts          #   Command palette
      headings.ts          #   Document headings
      grep.ts              #   Grep search
      live-grep.ts         #   Live grep (search-as-you-type)
      marks.ts             #   Marks picker
      mark-providers.ts    #   Mark data providers
      registers.ts         #   Register contents
      tags.ts              #   Tag search
      backlinks.ts         #   Backlinks for current file
      harpoon.ts           #   Harpoon slots
      pickers.ts           #   Meta-picker (pick a picker)
      split-open.ts        #   Open result in split
      preview-utils.ts     #   Preview pane utilities
      omnisearch.ts        #   Omnisearch integration
      tasks.ts             #   Obsidian Tasks integration
      dataview.ts          #   Dataview integration
      ripgrep-process.ts   #   External grep/ripgrep binary execution
  im/
    im-switcher.ts         # Input method auto-switching on mode change (async OS query on save)
    im-process.ts          # External IM binary process management
    composition-tracker.ts   # Per-view IME composition tracking (CM6 ViewPlugin)
    im-mode-watcher.ts       # Per-view vim mode change detection for IM switching (CM6 ViewPlugin)
  snippets/
    commands.ts            # :snippet/:snippets ex commands — visual selection recovery via vim '</'> marks and lastSelection flags for $TM_SELECTED_TEXT/$VISUAL support in visual mode
    registry.ts            # SnippetRegistry — entry storage, prefix indexing, priority-based override (user > lua > bundled), orphan cleanup for multi-prefix entries
    loader.ts              # Snippet loading (bundled JSON, user JSON directory, Lua DSL)
    completion-source.ts   # CM6 autocomplete source for snippet prefix matching
    tab-expand.ts          # Tab key snippet expansion in insert mode
    picker-source.ts       # Snippet picker source for fuzzy finder
    manager.ts             # Snippet session and expansion management
    parser.ts              # VS Code snippet format parser
    variables.ts           # Snippet variable resolution (37 variables: selection/content, file/path, workspace/cursor, date/time, random — full VSCode spec + $VISUAL/$WORD vim aliases)
    context.ts             # Snippet context filtering (prose, code, frontmatter)
    provider.ts            # Snippet source provider (bundled + user)
    dynamic-bridge.ts      # Bridge for reactive Lua snippet nodes (f/d/r)
    bundled/               # Bundled Obsidian-specific snippets
  editors/
    embeddable-editor.ts   # Reusable embeddable editor component (used by oil, table cell editor, textarea vim overlay) — ensureVimExtension() post-construction safety net adds vim via StateEffect.appendConfig if registerEditorExtension injection is absent; registerScopeKey() exposes the internal Obsidian Scope for registering key handlers that fire before Obsidian's default hotkeys (used by Oil for Ctrl-key combos); Escape handling via Scope.register with modal overlay guard (isHintModeActive, isEasyMotionActive, isFlashActive) + isVimIdle() sub-state detection (operator, surround, keyBuffer, expectLiteralNext); isolateKeyEvents option stops keydown/keyup propagation for modal isolation (used by textarea-vim); _destroying flag prevents blur handler from double-popping keymap scope during destroy(); setActiveLeaf override allows focus transfer when modal is open (checks .modal-container)
  keybindings/
    action-registry.ts     # Centralized action registry for cross-context keybindings
  ui/
    vim-info-modal.ts      # Reusable table modal base (used by :reg, :marks, :buffers, :backlinks)
    outline-modal.ts       # gO document outline (SuggestModal)
    context-actions.ts     # gra context-aware action picker
    hint-mode.ts           # Vimium-style label overlay for clickable UI elements (link resolution via posAtDOM + findLinkAtCursor for .cm-underline, .cm-hmd-internal-link, .cm-link, .cm-url with deduplication filters; EditorView access via MarkdownView.editor.cm fallback; external URLs via window.open; waitForHintKey modifier-key guard filters Ctrl/Shift/Alt/Meta-only keydowns with preventDefault+stopPropagation, Shift-held keys lowercased for label matching, shiftKey captured in HintResult; async hintActivate awaits navigateWithJump/duplicateLeaf for deterministic focus restoration; count>1 preserves original leaf focus between activations; getElementCenter helper provides clientX/clientY from getBoundingClientRect for all synthetic events; hintContextMenu dispatches contextmenu MouseEvent; gf in global-defaults.ts, :hintcontextmenu/:hintco ex command and vim-motions:hint-context-menu Obsidian command in main.ts)
    which-key.ts           # Leader key hint overlay + LeaderRegistry + WhichKeyConfig interface + forEmbeddedEditor() factory for dependency injection (injected adapter/container mode skips discovery, bypasses show delay, guards status-bar padding for modal containers)
    global-which-key.ts    # Which-key overlay outside editor context
    ex-suggest.ts          # Ex command tab completion
    global-ex-command.ts   # Ex command input outside editor context
    vimrc-file-suggest.ts  # File suggestion for vimrc/Lua config path settings
  util/
    commands.ts            # executeCommand() and getCommandRegistry() — null-safe wrappers for app.commands (typed via obsidian-typings Commands interface, no casts)
    editor.ts              # getEditorView() — extract CM6 EditorView from MarkdownView (editor.cm typed via obsidian-typings)
    leaf.ts                # getLeafId(), isLeafPinned(), getViewFilePath(), getViewFileBasename() — null-safe wrappers; id/pinned typed via obsidian-typings WorkspaceItem/WorkspaceLeaf; file access via instanceof FileView guard
    metadata.ts            # getResolvedLinks() — typed access to app.metadataCache.resolvedLinks
    vault.ts               # getVaultConfig(key: ConfigItem), isBuiltinVimEnabled() — typed via obsidian-typings ConfigItem union (51 valid keys)
    invariant.ts           # Runtime invariant system — invariant() (always-on, type-narrowing), devAssert() (dev-only), violation tracking + :violations ex command
    keymap.ts              # pushKeymapScope(), popKeymapScope() — typed access to app.keymap scope management
    around.ts              # Monkey-patching utility (around pattern)
    external-fs.ts         # External filesystem access helpers
    subword.ts             # Shared subword boundary detection (camelCase/snake_case/kebab-case)
  vimrc/
    parser.ts              # Line-by-line .obsidian.vimrc parser
    loader.ts              # Two-phase vimrc loader: readAndParseVimrcFile (no CM needed) → applyVimrcCommands (14 types explicit); KNOWN_SET_OPTIONS registry for all :set options
```

## Adding a new feature

### New motion or text object

1. Create a function matching the `MotionFn` signature in `src/types/vim-api.d.ts`:

    ```typescript
    export type MotionFn = (
        cm: CmAdapter,
        head: VimPos,
        motionArgs: MotionArgs,
        vim: VimState,
        inputState: unknown,
    ) => VimPos | [VimPos, VimPos] | Promise<VimPos | null> | null | undefined;
    ```

    - Return a single `VimPos` for cursor motions.
    - Return `[VimPos, VimPos]` for text objects (selection range).
    - Return `Promise<VimPos | null>` for async motions (e.g., EasyMotion operator-pending).
    - Return `null` for no-op.

2. Register in the appropriate `register.ts` file:

    ```typescript
    reg.defineMotion('myMotion', myMotionFn);
    reg.mapCommand(']x', 'motion', 'myMotion', {});
    ```

3. Gate behind a setting if it's a new feature category. Add to `VimMotionsSettings` in `settings.ts` and wire in `main.ts` `onload()` + `reloadFeatures()`.

4. Add E2E tests in `test/specs/`.

### New operator

1. Create a function matching `OperatorFn`:

    ```typescript
    export type OperatorFn = (
        cm: CmAdapter,
        operatorArgs: OperatorArgs,
        ranges: OperatorRange[],
        oldAnchor: VimPos,
        newHead: VimPos,
    ) => VimPos | void;
    ```

2. Register in `src/operators/register.ts`:
    ```typescript
    reg.defineOperator('myOp', myOperatorFn);
    reg.mapCommand('gX', 'operator', 'myOp', {});
    ```

### New ex command

1. Create a function matching `ExCommandFn`:

    ```typescript
    export type ExCommandFn = (cm: CmAdapter, params: ExCommandArgs) => void;
    ```

2. Register in `src/workspace/commands.ts`:
    ```typescript
    reg.defineEx('mycommand', 'myc', myCommandFn);
    ```
    The second argument is the short name — it **must** be a prefix of the full name, or an empty string for no short name. `:qa` is not a prefix of `:quitall`, so register them separately.

### New action (non-motion keybinding)

Use `defineAction` for keybindings that don't return a cursor position (e.g., opening a modal, executing an Obsidian command):

```typescript
reg.defineAction('myAction', myActionFn);
reg.mapCommand('gX', 'action', 'myAction', {});
```

### New `set` option

1. Add the `defineOption` call in `src/vim/options.ts`:

    ```typescript
    vim.defineOption('myoption', defaultValue, 'string', ['alias']);
    ```

2. Add the option to `KNOWN_SET_OPTIONS` in `src/vimrc/loader.ts`. For simple options that only need `this.settings[key] = value`, use a standard `BoolOpt`, `NumOpt`, or `StrOpt` entry. For options that require side effects (e.g., calling a module-level setter, transforming the value before storing), use a `SideEffectOpt`:

    ```typescript
    // Simple option — handled automatically by applyKnownSetOption:
    myoption: { type: 'boolean', settingsKey: 'enableMyOption' },

    // Option with side effects — you control the entire apply flow:
    const myOpt: SideEffectOpt = {
        type: 'sideEffect',
        apply: (value, onSettingOverride, directive) => {
            myModuleLevelSetter(value);
            onSettingOverride?.('mySettingsKey', value, directive);
        },
    };
    KNOWN_SET_OPTIONS['myoption'] = myOpt;
    KNOWN_SET_OPTIONS['mo'] = myOpt;  // alias
    ```

    All options in `KNOWN_SET_OPTIONS` automatically work across all three code paths: vimrc (`set myoption=value`), Lua (`vim.opt.myoption = value`), and the Settings UI. No additional wiring in `loader.ts` or `lua/api.ts` is needed.

### New Lua API function

1. Add the implementation in the appropriate file under `src/lua/` (e.g., `fn.ts` for `vim.fn.*`, `buffer.ts` for `vim.api.nvim_buf_*`, `api.ts` for top-level `vim.*`).

2. Register it in the Lua engine so it's available to user configs.

3. Update `docs/configuration/lua-config.md` with the new function and `KNOWN_LIMITATIONS.md` with the updated function count.

4. Add unit tests in `test/unit/lua/`.

### New picker source

1. Create a new source file in `src/picker/sources/`:

    ```typescript
    import { type PickerSource } from '../types';

    export const mySource: PickerSource = {
        id: 'my-source',
        name: 'My Source',
        // ... implement items(), preview(), accept()
    };
    ```

2. Register the source in `src/picker/registry.ts`.

3. Add an ex command alias if appropriate (e.g., `:Picker mysource`) in `src/workspace/commands.ts`.

### New Oil action

1. Add the action function in `src/oil/actions.ts`.

2. Wire the keybinding in `src/oil/keybindings.ts`.

3. If it modifies the buffer, ensure the diff engine in `src/oil/diff.ts` can translate the edit into file system operations.

### New fold command

1. Add the command in `src/fold/commands.ts`.

2. If it introduces a new fold provider, add it in `src/fold/provider.ts`.

3. Fold persistence is handled by `src/fold/persistence.ts` — ensure new fold types are persisted correctly.

### New snippet source

1. Create a JSON file following the VS Code snippet format in your snippet directory, or use the Lua DSL in `.obsidian.init.lua`.

2. For bundled snippets, add entries to `src/snippets/bundled/obsidian-markdown.json` or `src/snippets/bundled/global.json`.

3. For dynamic snippets (f/d/r nodes), the snippet must be defined via the Lua DSL — JSON files only support static snippets.

4. Add tests in `test/specs/snippets/` for e2e tests or `test/unit/snippets/` for unit tests.

## Conventions

### Code style

- TypeScript with `"strict": true`.
- Tabs for indentation.
- No `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Avoid `console.log` in production code. Use `new Notice()` for user-facing messages.
- Use `activeDocument` instead of `document` (Obsidian popout window compatibility).
- Use `window.setTimeout`/`window.clearTimeout` instead of `setTimeout`/`clearTimeout`.
- Use CSS classes and variables instead of inline styles.
- Never use `!important` in CSS. Increase specificity with ancestor selectors (e.g., `.cm-editor .vim-motions-foo`) instead. Obsidian plugins share the global stylesheet — `!important` is fragile and conflicts with themes.
- Sentence case for UI text.

### Runtime invariants

- Use `invariant(condition, message)` for state checks that should always run (mode transitions, settings completeness, lifecycle guards). Logs to console + accumulates violations inspectable via `:violations`.
- Use `devAssert(condition, message)` for expensive checks on hot paths (per-keystroke, per-render). Stripped from production builds via `__DEV__` flag.
- Neither function throws — the plugin continues running after a violation. Both narrow TypeScript types via `asserts condition`.
- See `src/util/invariant.ts` for the implementation and `.sisyphus/plans/invariant-system.md` for the placement plan.

### File organization

- Keep `main.ts` minimal — only lifecycle management and feature registration.
- One feature per file. If a file exceeds ~200 lines, consider splitting.
- Registration functions go in `register.ts` files within each feature directory.
- UI components go in `src/ui/`.

### Registration and cleanup

All Vim API registrations must go through `VimRegistration` so they're cleaned up on `onunload()` and `reloadFeatures()`. Never call `vim.defineMotion()` or `vim.map()` directly — always use `reg.defineMotion()` and `reg.map()`.

### Vim subsystem lifecycle

The plugin supports toggling vim mode at runtime without a reload. Feature registration is split into `setupVimSubsystems()` and `teardownVimSubsystems()`. All CM6 extensions are registered via a single mutable array that is emptied and repopulated during a toggle. When adding new events or intervals, ensure they are guarded by `this.settings.vimEnabled` or registered within the subsystem setup flow to ensure they are properly cleaned up when vim is disabled.

### Settings hot-reload

When adding a new setting toggle, wire it in both `onload()` and `reloadFeatures()` in `main.ts`, and call `this.plugin.reloadFeatures()` in the setting's `onChange` handler.

### Settings override cleanup

When a user changes a setting via the Settings UI, the override must be cleared from all three override stores. Use `this.plugin.clearSettingOverride(key)` — this deletes from `vimrcOverrides`, `luaOverrides`, and `configOverrides` in one call. Never call `this.plugin.vimrcOverrides?.delete(key)` directly.

**Ordering requirement for `VIM_OPTION_KEYS` settings**: `clearSettingOverride(key)` must be called **after** `vim.setOption(key, value)`, not before. `vim.setOption()` fires a `notify` callback that adds the key to `vimrcOverrides`. If `clearSettingOverride` runs first, the override is re-added by `setOption` and `refreshDomState` disables the field. The correct order in both `setControlValue` and imperative `onChange` handlers is: update setting → save → `vim.setOption()` → `clearSettingOverride()` → `refreshDomState()`.

### Config overrides persistence

Vimrc/Lua setting overrides are persisted in a `configOverrides` block in `data.json` (separate from base settings). This allows settings that only take effect at CM6 extension creation time (gutter settings) to survive Obsidian restarts. The lifecycle:

1. `loadSettings()` extracts `configOverrides` from raw data, merges on top of settings
2. After vimrc/Lua loading, `captureConfigOverrides()` captures current override values and persists
3. `saveSettings()` attaches `configOverrides` alongside base settings (which are stripped of runtime overrides)
4. Settings UI changes call `clearSettingOverride(key)` to remove from all override stores

## Testing

### Test infrastructure

```
test/
  helpers.ts                 # Shared WDIO helpers — strict (throws on missing MarkdownView),
                             # waitUntil-based synchronization, setPluginSettingAndReload
  neovim-command-index.yaml  # Command coverage tracking
  coverage-report.ts         # Coverage report generator
  tsconfig.json              # Test-specific TypeScript config
  specs/                     # E2E tests (Tier 2 — plugin features)
    vim-builtin/             # E2E tests (Tier 1 — core Vim behavior, Neovim-compared). Includes new-commands.e2e.ts, new-commands-golden.e2e.ts, link-nav-window-cycle.e2e.ts, ex-move-copy-normal.e2e.ts, minor-motions-scroll.e2e.ts, noop-commands.e2e.ts.
    snippets/                # Snippet expansion/tabstop/variable tests
    spikes/                  # Exploratory/discovery tests
  neovim/                    # Neovim golden comparison infrastructure
    test-definitions.ts      # Test case definitions (shared by golden recording + e2e)
    golden-data/             # Recorded Neovim output (committed, CI compares against these)
    deviations.ts            # Known differences from Neovim (categorized)
    client.ts                # Headless Neovim client
    compare.ts               # Comparison logic
    test-wrapper.ts          # testWithNeovim() helper — enforces golden case exists
    record-golden.ts         # Golden file recording script
    smoke.ts                 # Quick Neovim smoke test
  fixtures/                  # Test fixture data
    test-plugins.json        # Plugin manifest for CI pre-fetch
  unit/                      # Unit tests (Vitest)
    lua/                     # Lua engine unit tests
    picker/                  # Picker unit tests
    snippets/                # Snippet unit tests
    __mocks__/               # Mock modules
  bench/                     # Performance benchmarks
    matcher.bench.ts         # Fuzzy matcher benchmarks
test-vault/
  fixtures/                  # Vault fixtures for e2e tests needing full rendering
    hint-mode/               # Fixture files for hint-mode link navigation tests
```

### Test tiers

- **Tier 1** (`test/specs/vim-builtin/`) — Core Vim behavior. Use `testWithNeovim()` as the primary format. These tests compare the plugin's behavior against headless Neovim using golden files.
- **Tier 2** (`test/specs/`) — Plugin features (text objects, navigation, workspace, operators, vimrc, settings, Lua config). Standard WDIO tests.
- **Spikes** (`test/specs/spikes/`) — Exploratory/R&D tests for investigating behavior.

### E2E test patterns

E2E tests use [WebdriverIO](https://webdriver.io/) with [wdio-obsidian-service](https://github.com/nicholasgasior/wdio-obsidian-service).

#### Tier 1 — Neovim-compared tests

Use `testWithNeovim()` for any behavior Neovim can verify — do not hand-write expected values:

```typescript
testWithNeovim('suite-name', 'test description', {
    content: 'initial buffer content',
    cursor: { line: 0, ch: 0 },
    keys: ['keystroke-sequence'],
});
```

Add a matching entry in `test/neovim/test-definitions.ts` and re-record golden files with `npm run test:neovim-record`.

For test cases where `vimRawKeys` DOM dispatch fails (visual-mode compound operations like `vt.d`, `vawd`, `V3jJ`), set `useHandleKey: true` on the `TestCaseDefinition`. This causes `testWithNeovim` to use `vimHandleKeys` instead of `vimRawKeys`, dispatching all keys synchronously through `Vim.handleKey()`.

For viewport-dependent behavior (`H`/`M`/`L`, scroll, folds), use regular `it()` blocks — headless Neovim has no viewport to compare against.

#### Tier 2 — Standard E2E tests

```typescript
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('My feature', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should do something', async function () {
        // Set up editor state
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('test content');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);

        // Send Vim keys
        await browser.keys(['Escape']);
        await browser.pause(50);
        await browser.keys(['d', 'i', '*']);
        await browser.pause(200);

        // Assert result
        const value = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue() ?? '';
        });
        expect(value).toBe('expected content');
    });
});
```

### Shared test helpers

`test/helpers.ts` provides commonly used utilities. Import them instead of writing inline `executeObsidian` boilerplate:

- `setupEditor(content, cursor?)` — Set editor content and cursor position. Throws if no MarkdownView. Uses `waitUntil` to verify content was applied.
- `vimKeys(...keys)` — Send Vim key sequence with proper pauses.
- `vimRawKeys(keys)` — Send raw key string character-by-character via DOM events (with `Vim.handleKey` for control chars).
- `vimHandleKeys(keys)` — Send all keys synchronously through `Vim.handleKey()` in a single `executeObsidian` callback. No DOM event timing gaps. Use for visual-mode compound operations that fail with `vimRawKeys` (e.g., `vt.d`, `vawd`, `V3jJ`).
- `vimHandleKeysSync(keys, waitForTimeout?)` — Like `vimHandleKeys` but includes `<Esc>` in the same `executeObsidian` call (no cross-call boundary). When `waitForTimeout=true`, waits 1200ms for the `operatorshadowtimeout` deferral timer to fire — needed for `<leader>X` mappings that have longer partials (e.g., table nav `<leader>tL`).
- `getCursorPos()` — Get `{ line, ch }` cursor position. Throws if no MarkdownView.
- `getEditorValue()` — Get editor text content. Throws if no MarkdownView.
- `getSelection()` — Get selected text. Throws if no MarkdownView.
- `getVimMode()` — Get current Vim mode string.
- `getRegisterContent(register)` — Get register contents.
- `sendVimEscape()` — Send Escape via Vim API. Throws if no MarkdownView or Vim adapter.
- `loadSingleFileWorkspace(filePath)` — Load a workspace with a single file. Waits for MarkdownView to become active.
- `ensureLivePreview()` — Switch active editor to Live Preview mode. Waits for mode change.
- `ensureSourceMode()` — Switch active editor to Source mode. Waits for mode change.
- `isLivePreview()` — Check if active editor is in Live Preview.
- `isSourceMode()` — Check if active editor is in Source mode.
- `setPluginSetting(key, value)` — Set a plugin setting and await `saveSettings()`.
- `setPluginSettingAndReload(key, value)` — Set, save, call `reloadFeatures()`, and wait for settle.
- `unsupported(name, fn)` — Mark a test as unsupported (skip with label).
- `deviation(name, fn)` — Mark a test as a known Neovim deviation.

### Unit tests

Unit tests use [Vitest](https://vitest.dev/) and live in `test/unit/`. These test pure logic without Obsidian (Lua engine, picker matching, settings migration, etc.).

```bash
npm run test:unit
```

### Key testing rules

- Always call `obsidianPage.openFile('Welcome.md')` in the `before` hook — CI starts without a file open.
- Outer-scope variables are **not** available inside `executeObsidian` callbacks — use hardcoded values.
- Use `editor.focus()` to focus the editor, **not** `$('.cm-content').click()`.
- For Vim key sequences that may conflict with browser keys, use `Vim.handleKey(adapter, key)` inside `executeObsidian` instead of `browser.keys`.
- Special characters `<` and `>` cannot be reliably dispatched through `browser.keys` or `Vim.handleKey` in WDIO — they conflict with vim's angle-bracket notation parser. The fork's own test suite (`test/vim_test.js`) sends these as DOM `keydown` events with proper `keyCode`/`key` properties via its `typeKey` helper. For features requiring `<`/`>` (e.g., surround tag operations), verify behavior via fork tests and skip the plugin e2e test with a reference to the fork test name.
- Spike/discovery tests go in `test/specs/spikes/`.
- The global `afterTest` hook in `wdio.conf.mts` cleans up overlays, modals, notices, and Vim state between every test. Individual tests should not need manual cleanup unless they test cleanup behavior itself.
- For tests requiring Obsidian's full rendering pipeline (link decorations, metadata cache), use vault fixture files under `test-vault/fixtures/` instead of `setupEditor`. Open each fixture file once in a `before()` hook to warm the link cache. Use `obsidianPage.openFile()` instead of `setupEditor` to ensure CM6 decorations render.
- When querying the active editor's DOM, use `.workspace-leaf.mod-active .cm-editor` instead of `.cm-editor` — multiple `.cm-editor` elements may exist on the page (sidebar, modals).

## Obsidian API notes

- The CM6 EditorView is at `view.editor.cm` (typed via `@obsidian-typings/obsidian-public-latest`) — use `getEditorView(view)` from `src/util/editor.ts` for null-safe access.
- The CM5-compat adapter (used by codemirror-vim) is at `editorView.cm` where `editorView` is the CM6 EditorView above. Use `getCmAdapter(view)` from `src/vim/vim-api.ts`.
- From the CM5 adapter, access the underlying CM6 EditorView via `adapter.cm6`.
- Obsidian uses HyperMD node names, not standard Lezer Markdown names (e.g., `header_header-1` not `ATXHeading1`).
- Most Obsidian internal APIs are typed via `@obsidian-typings/obsidian-public-latest` — use them directly. Key typed APIs: `app.commands` (`Commands` interface with `executeCommandById`, `commands`, `listCommands`), `app.embedRegistry` (`EmbedRegistry`), `app.internalPlugins` (`InternalPlugins` with `getEnabledPluginById()`), `app.plugins` (`Plugins` with typed `plugins` record), `app.openWithDefaultApp()`, `app.scope`, `workspace.activeEditor`, `view.editMode` (`MarkdownEditView`), `view.getMode()` (`MarkdownViewModeType`), `leaf.updateHeader()`, `SuggestModal.inputEl`, `PluginSettingTab.refreshDomState()`.
- For null-safe access, use utility wrappers: `executeCommand(app, id)` and `getCommandRegistry(app)` from `src/util/commands.ts`, `getEditorView(view)` from `src/util/editor.ts`, `getLeafId(leaf)`, `isLeafPinned(leaf)`, `getViewFilePath(view)` from `src/util/leaf.ts`, `getVaultConfig(app, key)` from `src/util/vault.ts`, `pushKeymapScope()`/`popKeymapScope()` from `src/util/keymap.ts`.
- `app.metadataCache.resolvedLinks` is typed via obsidian-typings — use `getResolvedLinks(app)` from `src/util/metadata.ts` for a clean wrapper.
- `editor.addHighlights()`/`removeHighlights()`/`hasHighlight()` are typed via obsidian-typings — these are unofficial APIs for managing `is-flashing` and `obsidian-search-match-highlight` decorations.
- `prepareSimpleSearch()` is Obsidian's public fuzzy search utility (used by picker filter, not `:grep`). `:grep` uses `RegExp` matching with substring fallback.
- There is no public navigation history API — the plugin provides its own cross-note jump list (`src/vim/jumplist.ts`) that intercepts the fork's `jumpListWalk` action via `defineActionOverride`. Use `navigateWithJump()`/`navigateWithJumpFile()`/`navigateWithJumpSetActive()` from `src/workspace/navigate.ts` for all user-initiated navigation to ensure jumps are recorded. Obsidian's native `app:go-back`/`app:go-forward` are still available via `:back`/`:forward` ex commands.
