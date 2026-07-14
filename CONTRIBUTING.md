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

1. Run `npm run build` to produce `main.js`.
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/vim-motions/` directory.
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**.

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

## Codebase structure

```
src/
  main.ts                  # Plugin lifecycle (onload, onunload, reloadFeatures)
  settings.ts              # Settings interface, defaults, and settings tab UI
  settings-migration.ts    # Settings schema migration between versions
  types/
    vim-api.d.ts           # Type declarations for the Vim API (CmAdapter, VimApi, etc.)
    codemirror-vim.d.ts    # CodeMirror Vim type declarations
  vim/
    vim-api.ts             # getVimApi(), getCmAdapter(), isVimEnabled()
    registration.ts        # VimRegistration — tracks and cleans up all Vim API registrations
    bundled-vim.ts         # Bundled vim fork registration as CM6 extension
    mode-tracker.ts        # Status bar mode indicator + macro recording
    scrolloff.ts           # CSS scroll-padding based scrolloff
    options.ts             # Vim option registration (clipboard, tabstop, etc.)
    insert-escape.ts       # Configurable insert mode escape sequence (jk, etc.)
    changelist.ts          # Change list tracking
    yank-highlight.ts      # Yank highlight flash effect
    visual-line-command-fix.ts  # Visual line command edge-case fixes
    fold-sync.ts           # Fold state synchronization
    mark-store.ts          # Mark persistence across sessions
    sign-column.ts         # Sign column (mark indicators via gutter() + GutterMarker + Compartment)
    mark-gutter.ts         # Mark gutter refresh scheduling (delegates to sign-column)
    line-number-gutter.ts  # Configurable line number gutter (absolute/relative/hybrid/dual)
    statuscolumn.ts        # Unified configurable gutter (statuscolumn format string API)
    cursorline.ts          # Cursor line highlight (number/line/both modes)
    fold-column.ts         # Fold column gutter (▸/▾ indicators with click-to-fold)
    harpoon-store.ts       # Harpoon file slot persistence
    harpoon-nav.ts         # Harpoon navigation keybindings
    table-utils.ts         # Table parsing and cell utilities
    table-nav-controller.ts    # Table cell navigation controller
    table-operations.ts    # Table row/column manipulation (insert, delete, move)
    table-auto-format.ts   # Auto-format tables on edit
    table-cursor-fix.ts    # Cursor positioning in table cells
    table-cell-editor.ts   # Per-cell editing with vim-enabled editor
    table-embedded-editor.ts   # Embedded editor within table widgets
    table-render-widget.ts     # CM6 decoration widget for rendered tables
    table-widget-suppressor.ts # Suppress table widget when editing
  text-objects/
    delimiter.ts           # Paired-delimiter factory (single-line, multi-line, smart asterisk)
    link.ts                # [[wikilink]] and [text](url) text objects
    code-block.ts          # Fenced code block text objects
    blockquote.ts          # Blockquote and callout text objects
    table-cell.ts          # Table cell text object (i| / a|)
    tag.ts                 # HTML/Markdown tag text objects
    register.ts            # Wires all text objects to keybindings
  motions/
    headings.ts            # ]h/[h heading navigation
    lists.ts               # ]l/[l list navigation
    links.ts               # ]n/[n link navigation
    tables.ts              # ]|/[| table cell navigation
    buffers.ts             # ]b/[b buffer (tab) cycling
    goto-definition.ts     # gd link following + gx URL opening
    register.ts            # Wires all motions to keybindings
  operators/
    hardwrap.ts            # gq/gw Markdown-aware hard-wrap
    register.ts            # Wires operators to keybindings
  actions/
    open-line.ts           # Open-line action implementation
  workspace/
    navigation.ts          # Pane/tab/fold/gd/gx/gO/grn/grr/gra/gf/hint-mode keybindings
    commands.ts            # Ex commands (:w, :q, :ob, :reg, :marks, :grep, :backlinks, etc.)
    vault-search.ts        # :grep vault-wide search implementation
    global-key-handler.ts  # Global key event handling (outside editor)
    global-mapping-registry.ts  # Registry for global key mappings
    global-defaults.ts     # Default global keybindings
  easymotion/
    register.ts            # Wires EasyMotion to keybindings
    targets.ts             # Target detection (words, lines, chars)
    overlay.ts             # Label overlay rendering
    labels.ts              # Label generation and assignment
    keypress.ts            # Keypress handling during label selection
    types.ts               # EasyMotion type definitions
  fold/
    commands.ts            # Fold commands (zf, zd, zE, zm, zr, etc.)
    provider.ts            # Fold providers (frontmatter, callouts, custom)
    persistence.ts         # Cross-session fold persistence
    placeholder.ts         # Descriptive fold placeholder text
    fold-level.ts          # Fold level tracking
  lua/
    engine.ts              # Fengari Lua 5.3 VM setup and library loading
    loader.ts              # .obsidian.init.lua config file loader
    api.ts                 # vim.keymap, vim.opt, vim.g, vim.cmd, vim.notify, etc.
    fn.ts                  # vim.fn.* function library (27 functions)
    buffer.ts              # vim.api.nvim_buf_* buffer API
    autocmd.ts             # vim.api.nvim_create_autocmd and augroups
    highlight.ts           # vim.api.nvim_set_hl highlight groups
    stdlib.ts              # vim.tbl_*, vim.split, vim.trim, vim.inspect, vim.json, etc.
    obsidian-api.ts        # vim.obsidian / vim.ob namespace (including vim.obsidian.im)
    timers.ts              # vim.schedule, vim.defer_fn, vim.uv timers
    strftime.ts            # os.date-compatible time formatting
    types.d.ts             # Lua engine type declarations
  oil/
    oil-view.ts            # Oil file explorer view (ItemView)
    manager.ts             # Oil session lifecycle management
    parser.ts              # Buffer text ↔ directory entry parsing
    diff.ts                # Diff buffer edits to file system operations
    actions.ts             # File operations (create, rename, delete, move)
    render.ts              # Directory listing rendering
    keybindings.ts         # Oil-specific vim keybindings
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
  im/
    im-switcher.ts         # Input method auto-switching on mode change
    im-process.ts          # External IM binary process management
  snippets/
    manager.ts             # Snippet session and expansion management
    parser.ts              # VS Code snippet format parser
    variables.ts           # Snippet variable resolution ($UUID, $DATE, etc.)
    context.ts             # Snippet context filtering (prose, code, frontmatter)
    provider.ts            # Snippet source provider (bundled + user)
    dynamic-bridge.ts      # Bridge for reactive Lua snippet nodes (f/d/r)
    bundled/               # Bundled Obsidian-specific snippets
  editors/
    embeddable-editor.ts   # Reusable embeddable editor component (used by table cell editor)
  keybindings/
    action-registry.ts     # Centralized action registry for cross-context keybindings
  ui/
    vim-info-modal.ts      # Reusable table modal base (used by :reg, :marks, :buffers, :backlinks)
    outline-modal.ts       # gO document outline (SuggestModal)
    context-actions.ts     # gra context-aware action picker
    hint-mode.ts           # Vimium-style label overlay for clickable UI elements
    which-key.ts           # Leader key hint overlay + LeaderRegistry
    global-which-key.ts    # Which-key overlay outside editor context
    ex-suggest.ts          # Ex command tab completion
    global-ex-command.ts   # Ex command input outside editor context
    vimrc-file-suggest.ts  # File suggestion for vimrc/Lua config path settings
  util/
    commands.ts            # executeCommand() and getCommandRegistry() — typed access to Obsidian's internal commands API
    editor.ts              # getEditorView() — extract CM6 EditorView from MarkdownView
    leaf.ts                # getLeafId(), isLeafPinned(), getViewFilePath(), getViewFileBasename() — typed access to internal leaf/view properties
    metadata.ts            # getResolvedLinks() — typed access to app.metadataCache.resolvedLinks
    vault.ts               # getVaultConfig(), isBuiltinVimEnabled() — typed access to app.vault.getConfig
    keymap.ts              # pushKeymapScope(), popKeymapScope() — typed access to app.keymap scope management
    around.ts              # Monkey-patching utility (around pattern)
    external-fs.ts         # External filesystem access helpers
  vimrc/
    parser.ts              # Line-by-line .obsidian.vimrc parser
    loader.ts              # Two-phase vimrc loader: readAndParseVimrcFile (no CM needed) → applyVimrcCommands (14 types explicit)
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
- Sentence case for UI text.

### File organization

- Keep `main.ts` minimal — only lifecycle management and feature registration.
- One feature per file. If a file exceeds ~200 lines, consider splitting.
- Registration functions go in `register.ts` files within each feature directory.
- UI components go in `src/ui/`.

### Registration and cleanup

All Vim API registrations must go through `VimRegistration` so they're cleaned up on `onunload()` and `reloadFeatures()`. Never call `vim.defineMotion()` or `vim.map()` directly — always use `reg.defineMotion()` and `reg.map()`.

### Settings hot-reload

When adding a new setting toggle, wire it in both `onload()` and `reloadFeatures()` in `main.ts`, and call `this.plugin.reloadFeatures()` in the setting's `onChange` handler.

## Testing

### Test infrastructure

```
test/
  helpers.ts                 # Shared WDIO helpers (setupEditor, vimKeys, getCursorPos, etc.)
  neovim-command-index.yaml  # Command coverage tracking
  coverage-report.ts         # Coverage report generator
  tsconfig.json              # Test-specific TypeScript config
  specs/                     # E2E tests (Tier 2 — plugin features)
    vim-builtin/             # E2E tests (Tier 1 — core Vim behavior, Neovim-compared)
    spikes/                  # Exploratory/discovery tests
  neovim/                    # Neovim golden comparison infrastructure
    test-definitions.ts      # Test case definitions (shared by golden recording + e2e)
    golden-data/             # Recorded Neovim output (committed, CI compares against these)
    deviations.ts            # Known intentional differences from Neovim
    client.ts                # Headless Neovim client
    compare.ts               # Comparison logic
    test-wrapper.ts          # testWithNeovim() helper
    record-golden.ts         # Golden file recording script
    smoke.ts                 # Quick Neovim smoke test
  unit/                      # Unit tests (Vitest)
    lua/                     # Lua engine unit tests
    picker/                  # Picker unit tests
    __mocks__/               # Mock modules
  bench/                     # Performance benchmarks
    matcher.bench.ts         # Fuzzy matcher benchmarks
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

- `setupEditor(content, cursor?)` — Set editor content and cursor position.
- `vimKeys(...keys)` — Send Vim key sequence with proper pauses.
- `vimRawKeys(keys)` — Send raw key string via `Vim.handleKey`.
- `getCursorPos()` — Get `{ line, ch }` cursor position.
- `getEditorValue()` — Get editor text content.
- `getSelection()` — Get selected text.
- `getVimMode()` — Get current Vim mode string.
- `getRegisterContent(register)` — Get register contents.
- `sendVimEscape()` — Send Escape and wait for normal mode.
- `loadSingleFileWorkspace(content)` — Load a workspace with a single file.
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

## Obsidian API notes

- The CM6 EditorView is at `(view.editor as any).cm` — use `getEditorView(view)` from `src/util/editor.ts` instead of inline casts.
- The CM5-compat adapter (used by codemirror-vim) is at `editorView.cm` where `editorView` is the CM6 EditorView above. Use `getCmAdapter(view)` from `src/vim/vim-api.ts`.
- From the CM5 adapter, access the underlying CM6 EditorView via `adapter.cm6`.
- Obsidian uses HyperMD node names, not standard Lezer Markdown names (e.g., `header_header-1` not `ATXHeading1`).
- `app.commands.executeCommandById()` is internal API — works but not in the type definitions. Use `executeCommand(app, id)` and `getCommandRegistry(app)` from `src/util/commands.ts` instead of inline casts.
- `app.metadataCache.resolvedLinks` is the resolved link graph — use `getResolvedLinks(app)` from `src/util/metadata.ts`.
- `app.vault.getConfig(key)` is internal API — use `getVaultConfig(app, key)` or `isBuiltinVimEnabled(app)` from `src/util/vault.ts`.
- `app.keymap.pushScope()`/`popScope()` are internal API — use `pushKeymapScope(app, scope)` / `popKeymapScope(app, scope)` from `src/util/keymap.ts`.
- Leaf properties (`id`, `pinned`) are internal — use `getLeafId(leaf)`, `isLeafPinned(leaf)`, `getViewFilePath(view)` from `src/util/leaf.ts`.
- `prepareSimpleSearch()` is Obsidian's public fuzzy search utility (used by picker filter, not `:grep`). `:grep` uses `RegExp` matching with substring fallback.
- There is no public navigation history API — use `app:go-back`/`app:go-forward` command IDs.
