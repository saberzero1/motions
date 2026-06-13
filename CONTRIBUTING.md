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
  types/
    vim-api.d.ts           # Type declarations for the Vim API (CmAdapter, VimApi, etc.)
  vim/
    vim-api.ts             # getVimApi(), getCmAdapter(), isVimEnabled()
    registration.ts        # VimRegistration — tracks and cleans up all Vim API registrations
    mode-tracker.ts        # Status bar mode indicator + macro recording
    scrolloff.ts           # CSS scroll-padding based scrolloff
    options.ts             # Vim option registration (clipboard, tabstop, etc.)
    insert-escape.ts       # Configurable insert mode escape sequence (jk, etc.)
  text-objects/
    delimiter.ts           # Paired-delimiter factory (single-line, multi-line, smart asterisk)
    link.ts                # [[wikilink]] and [text](url) text objects
    code-block.ts          # Fenced code block text objects
    blockquote.ts          # Blockquote and callout text objects
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
  workspace/
    navigation.ts          # Pane/tab/fold/gd/gx/gO/grn/grr/gra/gf/hint-mode keybindings
    commands.ts            # Ex commands (:w, :q, :ob, :reg, :marks, :grep, etc.)
    vault-search.ts        # :grep vault-wide search implementation
    backlinks.ts           # :backlinks modal (if separate)
  easymotion/
    easymotion.ts          # <leader><leader>w/j/f overlay labels
  ui/
    vim-info-modal.ts      # Reusable table modal base (used by :reg, :marks, :buffers, :backlinks)
    outline-modal.ts       # gO document outline (SuggestModal)
    context-actions.ts     # gra context-aware action picker
    hint-mode.ts           # Vimium-style label overlay for clickable UI elements
    which-key.ts           # Leader key hint overlay + LeaderRegistry
    ex-suggest.ts          # Ex command tab completion
  vimrc/
    parser.ts              # Line-by-line .obsidian.vimrc parser
    loader.ts              # Loads and applies vimrc commands
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
    ) => VimPos | [VimPos, VimPos] | null | undefined;
    ```

    - Return a single `VimPos` for cursor motions.
    - Return `[VimPos, VimPos]` for text objects (selection range).
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

2. The vimrc loader handles `set myoption=value` automatically — no changes needed in `loader.ts`.

## Conventions

### Code style

- TypeScript with `"strict": true`.
- Tabs for indentation.
- No `as any`, `@ts-ignore`, or `@ts-expect-error`.
- No `console.log` (lint rule). Use `new Notice()` for user-facing messages.
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

### Test patterns

Tests use [WebdriverIO](https://webdriver.io/) with [wdio-obsidian-service](https://github.com/nicholasgasior/wdio-obsidian-service).

```typescript
// Standard test pattern
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

### Key testing rules

- Always call `obsidianPage.openFile('Welcome.md')` in the `before` hook — CI starts without a file open.
- Outer-scope variables are **not** available inside `executeObsidian` callbacks — use hardcoded values.
- Use `editor.focus()` to focus the editor, **not** `$('.cm-content').click()`.
- For Vim key sequences that may conflict with browser keys, use `Vim.handleKey(adapter, key)` inside `executeObsidian` instead of `browser.keys`.
- Spike/discovery tests go in `test/specs/spikes/`.

## Obsidian API notes

- The CM5 adapter is at `view.editor.cm.cm` (not `view.editor.cm`).
- The CM6 EditorView is at `view.editor.cm.cm.cm6` (or `adapter.cm6`).
- Obsidian uses HyperMD node names, not standard Lezer Markdown names (e.g., `header_header-1` not `ATXHeading1`).
- `app.commands.executeCommandById()` is internal API — works but not in the type definitions.
- `app.metadataCache.resolvedLinks` is the public link graph.
- `prepareSimpleSearch()` is the public fuzzy search utility.
- There is no public navigation history API — use `app:go-back`/`app:go-forward` command IDs.
