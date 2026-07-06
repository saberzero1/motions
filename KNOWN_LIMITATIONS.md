# Known limitations

This document tracks known limitations, architectural constraints, and intentionally deferred features.

## ~~Vim keymaps intermittently stop working~~ (Fixed)

**Status**: Fixed. Multi-layered defense implemented across fork and plugin. ([#18](https://github.com/saberzero1/motions/issues/18))

`gg`, `G`, and other keymaps could intermittently stop working until Obsidian was reloaded. The issue had multiple contributing root causes in the codemirror-vim fork's state management:

1. **Stale normal-mode key prefix**: Typing `g` buffers it in `inputState.keyBuffer` as a partial match. If the editor lost focus (tab switch, modal open, window blur) before the second key, the prefix persisted indefinitely — no timeout exists for normal-mode partials (unlike insert mode's `lastInsertModeKeyTimer`), and no blur/focus handler existed. On refocus, the next key combined with the stale `g` to produce an invalid sequence (`gG`, `gj`, etc.), which was silently swallowed. **Fix**: blur handler on `contentDOM` calls `clearInputState()` on focus loss; pane-switch handler in the plugin provides belt-and-suspenders coverage.

2. **Global keymap corruption via `unmap()`**: The fork's `defaultKeymap` is a global singleton shared across all editors. `unmap()` used `splice()` to remove entries, including built-in defaults like `gg` or `j`. During plugin lifecycle churn (enable/disable/reload), `unregisterAll()` called `unmap()` on registered keys, which could accidentally remove defaults. Once removed, the key was permanently gone until page reload — `mapclear()` only removed user mappings, and there was no `resetKeymap()`. **Fix**: defaults tagged with `_isDefault`, `unmap()` skips them, `resetKeymap()` restores from frozen snapshot, `mapclear()` uses flag-based partitioning.

3. **Incomplete `leaveVimMode()` cleanup**: When an editor was destroyed while in insert mode, the `change` and `keydown` listeners registered by `enterInsertMode()` were not removed (only `exitInsertMode()` removes them, and `leaveVimMode()` didn't call it). The global `lastInsertModeKeyTimer` could also fire against a destroyed editor. **Fix**: `leaveVimMode()` now manually removes insert-mode listeners, clears the timer, clears `virtualPrompt`, and resets `inputState`.

4. **Async motion race conditions**: Async motion callbacks (used by EasyMotion operator-pending mode) had no way to detect if a newer command had superseded them. A `d` + async motion that resolved after the user typed another key could apply the delete at the wrong position. **Fix**: `_commandGeneration` counter on vim state, captured before dispatch and validated in the `.then()` callback.

**Test coverage**: 10 fork unit tests + 7 plugin e2e tests covering blur recovery, plugin reload, keymap protection, `resetKeymap()` recovery, and `leaveVimMode` cleanup.

5. **Stale jumpList markers after document switch**: The global jumpList (`vimGlobalState.jumpList`) stores `Marker` objects with absolute document offsets. When switching between documents of different lengths (especially via PDF++ or other non-editor views), markers from the old (longer) document held offsets exceeding the new document's length. `jumpList.add()` called `curMark.find()` → `posFromIndex(this.offset)` → `doc.lineAt(offset)` with no bounds check, throwing `RangeError`. The exception bubbled through `processMotion` → `processCommand` → the `cm.operation()` try-catch, which wiped vim state (`cm.state.vim = undefined; maybeInitVimState(cm)`) and re-threw. The re-initialized state lost per-instance configuration. **Fix** (three layers):
    - `posFromIndex` clamps offset to `[0, doc.length]` before calling `doc.lineAt()`, mirroring the bounds checking already present in `indexFromPos`
    - `Marker.find()` catches exceptions and returns `null` — all callers (`jumpList.add`, `jumpList.move`, `jumpList.find`) already handle `null` gracefully
    - `Marker.update()` catches `RangeError` from `mapPos()` when the marker offset exceeds the changeset's starting document length, setting `offset = null`
    - Plugin: `reloadFeatures()` now calls `vim.resetKeymap()` to match `onload()` behavior, closing a defense gap where settings-triggered reloads could corrupt the keymap without recovery

**Additional test coverage**: 5 fork tests (posFromIndex clamping, negative offset, valid offset, marker doc-shrink, gg/G with stale jumpList) + 3 plugin e2e tests (gg/G after document switch, gg/G after reloadFeatures on shorter document).

## EasyMotion operator-pending mode

**Status**: Working via fork's async motion support.

`d<leader><leader>w{label}` (delete to an EasyMotion target) works natively through the codemirror-vim fork's async motion system. EasyMotion motions are registered via `defineMotion` and return a `Promise<Pos>`. The fork's `evalInput` resolves the promise and applies the pending operator (`d`, `c`, `y`) to the resulting position.

Visual mode (`v` + easymotion) also works — the fork updates the visual selection head/anchor when an async motion resolves during visual mode.

**Remaining limitations**:

- Dot-repeat (`.`) does not replay operator-pending easymotion operations
- Char-based easymotions (`f`, `F`, `s`, `t`, `T`) in operator-pending mode require an intermediate search-character keypress which adds complexity to the async flow

**Test coverage**: `test/specs/easymotion-comprehensive.e2e.ts` validates d/c/y + easymotion flows.

## EasyMotion labels in Live Preview

EasyMotion target scanning uses `cm.getLine()` which returns raw document text, including markdown syntax hidden by Live Preview (e.g., the URL in `[text](url)`, formatting marks like `**`). Targets inside hidden text are filtered out by `filterVisibleTargets()` in `src/easymotion/overlay.ts`, which calls `coordsAtPos()` for each target and deduplicates positions that resolve to the same pixel coordinates (within 2px tolerance). When text is hidden by a replace decoration, all offsets within the hidden range map to the decoration boundary, producing duplicate coordinates.

This approach is decoration-source-agnostic — it works for any type of hidden text (links, formatting, embeds, third-party plugins) without needing to query specific decoration sets. The tradeoff is that two genuinely distinct targets at nearly identical pixel positions (e.g., adjacent zero-width characters) would be deduplicated. In practice, this does not occur with normal text.

Label collision detection in `renderLabels()` ensures that labels for nearby visible targets do not overlap. When a new label's bounding box intersects a previously placed label, it is offset vertically below it. Label dimensions are estimated from the CSS (14px monospace font, 1px 3px padding).

## Smart asterisk disambiguation

`i*` tries `**bold**` first, then falls back to `*italic*`. In the case of `***bold italic***`, the `**` pair is always matched first, making it impossible to select only the italic portion with `i*`. Use `i_` for underscore italic as a workaround.

## Smart dollar disambiguation

`i$`/`a$` tries `$$` (block math) first, then falls back to `$` (inline math). This matches the same pattern as `i*`/`a*` (tries `**` bold first, falls back to `*` italic). For `$$ a + b = c $$`, the `$$` pair is matched and `da$` deletes the entire expression. For `$x + y$`, the `$` pair is matched.

In the case of nested `$` inside `$$` (e.g. `$$ $inner$ $$`), the `$$` pair is always matched first, making it impossible to select only the inner `$...$` portion with `i$`. This mirrors the same limitation as the smart asterisk — use a different approach to select the inner math if needed.

## Multi-line delimiter scan limit

Multi-line text objects (`createMultiLineDelimiterTextObject`) scan a configurable number of lines in each direction from the cursor (default: 20). The limit can be changed in **Settings → Vim Motions → Multi-line text object scan range** (5–200 lines). Bold, italic, or other delimited content spanning more than twice the configured limit will not be found if the cursor is far from the opening delimiter.

This limit exists for performance — scanning the entire document on every keystroke would cause latency.

## Multi-line delimiter nesting

The multi-line text object scanner uses a simple forward/backward search for the nearest delimiter. It has no nesting awareness. Overlapping or nested delimiters across lines (e.g., bold inside italic spanning multiple lines) may produce incorrect selections.

Delimiters inside fenced code blocks are excluded from the scan — the scanner skips lines within ` ``` ` fences. Indented code blocks and inline code are not excluded. Fenced code blocks inside blockquotes (` > ``` `) are also not detected — `findFenceLines` only matches fences at the start of a line (`/^```/`). This affects all features that use `findFenceLines` for code block detection (text objects, smart list continuation).

## ~~Smart list continuation and frontmatter~~ (Fixed)

`O` (open line above) on the first content line after YAML frontmatter previously behaved like `o` (open line below). The smart list continuation override in `src/actions/open-line.ts` compared `curLine === cm.firstLine()` to decide whether to use the "insert at document start" path. With frontmatter present, `cm.firstLine()` returns 0 (the opening `---`) while the cursor is on the first post-frontmatter line (e.g. line 3), so the check was always false. The else branch inserted at the end of the previous line — which fell inside the frontmatter region, causing Obsidian's properties UI to swallow the new line.

Fixed in both layers:

- **Fork** (`vim.js`): `newLineAndEnterInsertMode` now scans past `---`-delimited frontmatter to find the first editable line and uses `insertAt.line <= firstEditable` as the boundary check. The insertion point uses `{ line: insertAt.line, ch: 0 }` instead of hardcoded `cm.firstLine()`. This fixes `O` on all line types (plain text, headings, etc.).
- **Plugin** (`open-line.ts`): the smart list continuation override adds `firstEditableLine()` with the same frontmatter scan, changing the boundary check to `curLine <= firstEditableLine(cm)`. This fixes `O` on list lines specifically.

Documents without frontmatter are unaffected — both paths fall back to `cm.firstLine()` when the first line is not `---`.

**Test coverage**: `test/specs/open-line-list.e2e.ts` — 7 regression tests: `O` on unordered/ordered/task list after frontmatter inserts above, `o` on list after frontmatter inserts below, `O` on non-list line after frontmatter inserts above, `o` on non-list line after frontmatter inserts below, `O` on second line after frontmatter uses normal insertion path.

## Table navigation and editing

`]|`/`[|` (or `]c`/`[c`) navigate horizontally between table cells. `]r`/`[r` navigate vertically to the same column in adjacent rows (skipping separator rows). `i|`/`a|` text objects operate on individual cells — `di|` deletes cell content, `ci|` changes it, `vi|` selects it.

`:tablerealign` (or `<Leader>tr`) reformats a table so all columns have uniform width, respecting `:---`/`---:`/`:---:` alignment markers in separator rows.

Auto-format: typing `|` in insert mode on a table line triggers automatic column realignment. Typing `||` on a new line within a table generates a separator row matching the header's column count.

The following are intentionally not implemented:

- **`j`/`k` column tracking**: Vim's `defineMotion` has no fall-through mechanism. Overriding `j`/`k` to detect tables on every keypress is fragile and would break normal line navigation if the detection is wrong. Users can add `nmap <Tab> ]|` to their vimrc if they want Tab-based cell navigation.
- **`Tab`/`Shift-Tab`**: These conflict with Obsidian's built-in table Tab handling and insert-mode tab completion.

## Table widget suppression in Live Preview

By default (cursor-aware mode), tables display as themed HTML when the cursor is outside and switch to raw Markdown when the cursor enters the table. The rendered table is a read-only `TableRenderWidget` produced by the plugin (not Obsidian's interactive table editor), using Obsidian's CSS classes (`cm-embed-block`, `markdown-rendered`, `table-wrapper`, `table-cell-wrapper`) for theme compatibility. When the cursor enters the table range, the widget is removed and raw Markdown is editable with full vim support.

The suppression works by intercepting CM6's `RangeSetBuilder.add` and skipping the replace-decoration that would create Obsidian's table widget. Detection uses the `cm-table-widget` class on the widget's container element. Non-table widgets (math, code blocks, embeds) are not affected. In cursor-aware mode, the plugin provides its own `Decoration.replace` via a `StateField` for tables the cursor is NOT in.

**Always raw mode**: Set to "Always raw" to keep tables as plain Markdown at all times. Useful when cursor-aware rendering causes issues or when you prefer to always see the raw table syntax.

**Disable suppression**: Set to "Off" in **Settings → Vim Motions → Table widget in live preview** to restore Obsidian's interactive table editor. With suppression off, vim operations inside table cells are limited to single-cell scope (each cell has its own isolated editor).

**Table manipulation commands** (`<Leader>t` prefix and ex commands like `:tablerowafter`) call Obsidian commands via `executeCommandById`. These may not work when the table widget is suppressed, since Obsidian's table commands expect the interactive widget to be present. Use Source mode table editing or manual Markdown editing instead.

**First-render learning lag**: On the very first load after plugin install, the suppressor needs to observe one table widget render to learn its constructor. The first table may briefly flash as a widget before being suppressed on the next render cycle. This one-time learning is cached for the session.

## Vimrc hot-reload

Changing the vimrc file requires reloading the plugin. The vimrc is loaded once during the first `active-leaf-change` event after plugin load. Other settings (text objects, navigation, operators, etc.) hot-reload immediately via `reloadFeatures()`, but vimrc parsing involves one-shot setup (exmap definitions, leader key state) that is not designed for re-entry.

### Custom vimrc path

The vimrc file path is configurable via **Settings → Vim Motions → Vimrc & key bindings → Custom vimrc path**. By default (empty), the plugin loads `.obsidian.vimrc` from the vault root. Setting a custom path (e.g. `config/my.vimrc` or `vimrc.md`) loads the vimrc from that vault-relative path instead. The setting provides file-suggest autocompletion filtered to `*.vimrc` files in the vault. ([#34](https://github.com/saberzero1/motions/issues/34))

This is primarily useful for **Obsidian Sync**, which does not sync dotfiles (files starting with `.`). Users can place their vimrc at a non-dotfile path (e.g. `vimrc.md`, `config/vimrc`) and point the setting to it.

Changing the custom path in settings triggers `reloadFeatures()` (the path is in `RELOAD_KEYS`), but a full vimrc re-parse requires reloading the plugin — the same limitation as editing the vimrc file itself.

### Vim engine settings

Vim engine settings (clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, insertmodeescapetimeout, textwidth) changed via **Settings → Vim Motions → Vim engine** now take effect immediately — each setting's `onChange` handler calls `vim.setOption()` to push the value to the vim engine in addition to persisting it to disk. Previously, these settings only saved to disk and required an Obsidian reload to take effect (the vimrc code path always worked because it called `vim.setOption()` directly). ([#39](https://github.com/saberzero1/motions/issues/39))

## ~~Scrolloff line height assumption~~ (Fixed)

Scrolloff now uses `EditorView.defaultLineHeight` to dynamically measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height. Note: `defaultLineHeight` returns an average line height — documents with mixed-height lines (e.g., headings with larger fonts) may not have pixel-perfect scrolloff distances.

The scrolloff value accepts 0–9999 (previously capped at 20). Setting `set scrolloff=999` in your vimrc keeps the cursor vertically centered while scrolling, matching standard Vim behavior. The Settings UI uses a validated number input field instead of a slider. When the scrolloff value exceeds half the viewport height, the cursor naturally stays centered — no special viewport-relative calculation is needed. ([#40](https://github.com/saberzero1/motions/issues/40))

## `set` option scope

All plugin settings are now configurable via `set` options in `.obsidian.vimrc`. When vimrc is enabled (the default), vimrc values override the corresponding Settings UI values for the current session. Overrides are in-memory only — the on-disk settings file always reflects UI-set values. See the full options table in `README.md` → "Supported `set` options".

Additionally, `whichkeygroup` and `whichkeylabel` ex commands allow configuring which-key labels, and `let g:mode_prompt_*` allows customizing status bar mode text. These use merge semantics with the Settings UI (both sources contribute; vimrc wins on conflict).

Settings overridden by vimrc appear as disabled controls in the settings tab with a note showing the vimrc directive (e.g., "Set by vimrc: `set scrolloff=10`"). Changing a disabled setting requires editing the vimrc.

The following settings are intentionally **not** exposed via vimrc:

| Setting          | Reason                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `configMode`     | Circular dependency — can't control config file loading from vimrc or init.lua            |
| `hintModeHotkey` | Requires modifier key capture UI (press-to-record widget)                                 |
| `leaderBindings` | Already achievable via `nmap <leader>x :command` in vimrc or `vim.keymap.set` in init.lua |

Options like `ignorecase`, `smartcase`, `hlsearch`, `incsearch`, `number`, `relativenumber`, and `wrap` are not implemented because they require CodeMirror-level integration beyond what `Vim.defineOption` provides.

Unknown `set` options are silently ignored (no error, no effect).

## `nmap L $` may not work via vimrc

`nmap L $` (mapping `L` to end-of-line) may not work when loaded from `.obsidian.vimrc` in some environments. Investigation (spike17, Diag 6) found that the mapping mechanism itself works correctly — `Vim.map('L', '$', 'normal')` at runtime successfully maps `L` to `$` and `handleKey('L')` moves to end-of-line. The issue is a vimrc file I/O timing problem: the `loadVimrc` function sometimes reads an empty or missing file during the `active-leaf-change` lifecycle, resulting in `vimrcCommandCount: 0` and an empty deferred maps array.

Diagnostic findings (spike17 Diag 6):

- `Vim.map('L', '$', 'normal')` works at runtime — `handleKey('L')` moves to ch:15 (end of line)
- `handleEx('nmap L $')` works at runtime — identical result
- `getKeymap('normal')` shows the `L → $` entry after runtime application
- After vimrc load, `vimrcMaps` is empty and `vimrcCommandCount` is 0 — the file was not read successfully
- The mapping mechanism (`ExCommandDispatcher.map`, `_mapCommand`, `doKeyToKey`) is correct — the issue is in file I/O timing during the `active-leaf-change` handler

Mitigation: vimrc maps are now re-applied 200ms after initial load as a safety net against CM Vim initialization timing.

Workaround: if vimrc mappings are not applied, reload the plugin via **Settings → Community plugins** (disable then enable). At runtime, mappings can be applied via Obsidian's developer console: `CodeMirrorAdapter.Vim.map('L', '$', 'normal')`.

## `set textwidth` via vimrc may not affect `gq`

`set textwidth=20` in `.obsidian.vimrc` may not change the wrap width used by the `gq`/`gw` operators if the vimrc file is not loaded successfully (same file I/O timing issue as `nmap L $`). The `textwidthSetExplicitly` guard in `options.ts` correctly prevents CM Vim's `defineOption` callback from resetting the value when the vimrc does load successfully.

With the vimrc-settings parity changes, `set textwidth=N` in vimrc also updates `this.settings.textwidth` via the `onSettingOverride` callback. The `textwidth` setting is now available in the Settings UI (**Settings → Vim Motions → Vim engine → Text width**). The `getTextwidth()` function used by `gq`/`gw` still reads from the module-level variable, so the vimrc I/O timing issue can still cause the value to not propagate.

Workaround: if `set textwidth=N` is not taking effect, reload the plugin. At runtime: `CodeMirrorAdapter.Vim.setOption('textwidth', 20)`.

## ~~Insert mode escape (`set insertmodeescape=jk`) not working~~ (Fixed)

**Status**: Fixed. `InsertEscapeHandler` rewritten to use DOM `keydown` events; timeout made configurable. ([#31](https://github.com/saberzero1/motions/issues/31))

`set insertmodeescape=jk` required frame-perfect input timing (effectively unusable). Two issues were identified:

1. **Wrong event source**: The handler listened to `vim-keypress` events on the codemirror-vim adapter. In insert mode, regular character keys (`j`, `k`) bypass the vim command pipeline entirely and go through CM6's text input handler — `vim-keypress` only fires for keys that codemirror-vim processes as vim commands (e.g., `<Esc>`, mapped sequences). The handler never saw insert-mode character keystrokes.

2. **Option value not retrievable**: The `insertmodeescape` option's `defineOption` callback did not store the value for `getOption()` retrieval. When `getOption('insertmodeescape')` was called, it returned `undefined` (the callback returned nothing on query), so the handler's escape sequence check always short-circuited at `escapeSeq.length < 2`.

**Fix**: Rewrote `InsertEscapeHandler` (`src/vim/insert-escape.ts`) to use DOM `keydown` events captured on the editor element. The handler filters for single printable characters (ignoring Ctrl/Alt/Meta modifiers), checks the vim state for insert mode via the adapter, and accumulates a sequence buffer with configurable timeout. On match, `e.preventDefault()` + `e.stopPropagation()` blocks the final character from being inserted, then `<BS>` × sequence length + `<Esc>` is dispatched through the vim API. Added module-level storage for both `insertmodeescape` and `insertmodeescapetimeout` option values so `getOption()` returns the configured values.

**Timeout**: Configurable via `set insertmodeescapetimeout=N` (alias `imet`, range 100–5000ms, default 1000ms — matching Neovim's `timeoutlen`). Previously hardcoded at 200ms. Also configurable via **Settings → Vim Motions → Vim engine → Insert mode escape timeout**.

**Test coverage**: `test/specs/vimrc.e2e.ts` — two tests: `jk` typed within timeout exits insert mode, `jk` typed after timeout stays in insert mode.

## `noremap` cannot swap built-in single-key motions

`nnoremap j k` / `nnoremap k j` does not swap the `j` and `k` motions. This is a codemirror-vim architectural constraint: when a `noremap` mapping's rhs is dispatched, the key handler skips all user-defined keymap entries and only searches the default keymap. Since user-defined entries are inserted at the front of the keymap array via `unshift`, the `noremap` dispatch (which starts at `keyMap.length - defaultKeymapLength`) correctly finds the original motion. However, the lhs side of the swap still resolves to the original motion as well, because codemirror-vim's `noremap` flag is tracked globally during dispatch — meaning both sides of a swap end up resolving to the default keymap.

This limitation is confirmed upstream in [obsidian-vimrc-support issue #16](https://github.com/esm7/obsidian-vimrc-support/issues/16), where the maintainer noted: "CodeMirror doesn't support `noremap` [...] recursive mappings are not possible in CodeMirror anyway so `map` or `nmap` should work."

`noremap` does work for preventing recursion in multi-key mappings (e.g. `noremap G G$`) and for remapping keys to different key sequences. It only fails when trying to swap two built-in single-key motions with each other.

## ~~EasyMotion leader key conflict with `mapCommand`~~ (Fixed)

EasyMotion and hint mode bindings call `unmapDefaultBinding(leader)` before `mapCommand` registration. This removes the leader key's default Vim binding (e.g. `<Space>` → `l`, `,` → `repeatLastCharacterSearch`) from codemirror-vim's keymap so that `mapCommand` multi-key sequences starting with the leader can accumulate in the input buffer. The vimrc parser correctly handles `let mapleader = " "` (space inside quotes). EasyMotion works with any leader key, including space, comma, and semicolon.

`unmapDefaultBinding` passes `{ includeDefaults: true }` to `vim.unmap()`, which is required because codemirror-vim's default keymap entries are tagged with `_isDefault` and `unmap()` silently skips them without this flag. Without `includeDefaults`, keys with built-in bindings (`,`, `;`, `-`, `+`, etc.) would not be unmapped, causing the default single-key binding to consume the first keystroke before the multi-key EasyMotion sequence (e.g. `,,w`) could accumulate.

The plugin now unmaps the leader key's default binding centrally — after vimrc loading, in `reregisterLeaderFeatures()`, and in `reloadFeatures()` — independent of which features are enabled. Previously, `unmapDefaultBinding(leader)` was only called inside `registerEasyMotion()`, so keys with default bindings (most notably space, whose `<Space>` → `l` default caused it to move the cursor right instead of acting as leader) only worked as leader when EasyMotion was enabled. All leader-dependent features (table manipulation, hint mode, settings leader bindings) now work with any leader key even when EasyMotion is disabled. ([#21](https://github.com/saberzero1/motions/issues/21))

The fork also normalizes literal special characters in key strings to angle-bracket notation when they enter the keymap. The `<leader>` substitution in the vimrc loader replaces `<leader>` with the literal leader character — for space, this produces `' j'` from `nmap <leader>j gj`. However, `vimKeyFromEvent` converts space key presses to `'<Space>'` (angle-bracket notation). Without normalization, `commandMatch('<Space>', ' j')` would never match because it uses exact string comparison. The fork's `normalizeKeyString` converts `' j'` to `'<Space>j'` in `_mapCommand` before the entry is stored, so the dispatched `'<Space>'` correctly partial-matches and `'<Space>j'` fully matches. This normalization also applies to `toKeys` (the rhs of `keyToKey` mappings), `unmap()`, and `removeMapCommand()`.

When `.obsidian.vimrc` sets a custom leader via `let mapleader = ","`, the plugin properly cleans up the initial backslash-leader bindings and re-registers all leader-dependent features (EasyMotion, hint mode, table manipulation, settings leader bindings) with the new leader. Previously, the old `\`-leader `mapCommand` entries persisted in the keymap alongside the new leader bindings because `Vim.unmap()` could not remove `mapCommand`-created entries. The fork provides `Vim.removeMapCommand(keys)` for clean removal.

## Table navigation on non-US keyboards

`]|` and `[|` use the pipe character (`|`), which on many non-US keyboard layouts (German, Dutch, Nordic, etc.) requires AltGr or a modifier combination. codemirror-vim's `vimKeyFromEvent` translates AltGr keypresses as `<C-A-|>` or `<A-|>`, which does not match the registered `]|` keybinding.

The alternative keybindings `]c` and `[c` are provided for this reason and work on all keyboard layouts.

## Which-key overlay

The which-key overlay has three modes (configurable via **Settings → Vim Motions → Which-key hints**):

- **Off** — no which-key overlay
- **Leader key only** — shows leader bindings after pressing the leader key (after the configurable popup delay, default 500ms)
- **All partial keys** — shows available continuations after any partial key sequence (operators, prefix keys, leader)

The popup delay is configurable via **Settings → Vim Motions → Which-key popup delay** or `set whichkeydelay=<ms>` in vimrc (range 0–2000ms, default 500ms). Once the popup is visible, subsequent keystrokes update it instantly — the delay only applies to the initial appearance.

In "all" mode, the overlay reads the fork's `getInputState()` to detect operator-pending state and `vim.status` for partial key chords. Operator-pending mode shows grouped next-key options filtered to motions, text objects, and operatorPending actions. Prefix keys (like `g`, `z`) show `getCompletions()` results. Special keys (`<Left>`, `<C-n>`, etc.) and insert-only entries are filtered out.

The overlay attaches to the active editor pane's `contentEl` with `position: absolute`, so it stays within the editor bounds and doesn't cover other panes. Maximum height is 40% of the pane. The multi-column grid layout uses `auto-fill` with `minmax(200px, 1fr)` columns.

### Grouping

When **Which-key leader grouping** is set to "Grouped" (default), bindings sharing a common prefix key are collapsed into a single group entry (e.g. `t` → `Table (+11)`). Pressing the group key drills down to show only the bindings within that group. Groups are sorted before ungrouped entries. Setting the mode to "Flat" restores the original behavior of listing all bindings individually.

Grouping applies to all completions — not just leader-scoped bindings. Any multi-key prefix (`g`, `z`, `[`, `]`, user-defined sequences) benefits from grouping when multiple completions share a next key.

### Group labels

Groups are labeled with a generic `+N keys` text by default. Custom labels can be configured via **Settings → Vim Motions → Which-key group labels** using the full key prefix:

- Leader-relative groups: use the leader character + prefix (e.g. `\t` for table commands under leader `\`)
- Non-leader groups: use the raw prefix (e.g. `gr` for LSP commands, `cs` for surround changes)
- `<leader>` token: expanded to the actual leader key (e.g. `<leader>t` resolves to `\t` with default leader)

Built-in features register default labels (Table, EasyMotion) that user entries can override. Whitespace in the prefix field is trimmed.

### Limitations

- User-defined mappings via `Vim.map()` appear in completions but without friendly descriptions (shown as the raw rhs key sequence)
- The overlay does not show during macro playback or when a register prefix (`"a`) is pending

## `<C-w>` prefix conflict with Obsidian hotkeys

Obsidian's default "Close current tab" hotkey is bound to Ctrl+W. Users must unbind it in **Settings → Hotkeys** (search for "Close current tab") for the `<C-w>` prefix (`<C-w>h/j/k/l`, `<C-w>v`, `<C-w>s`, `<C-w>c`, `<C-w>q`, `<C-w>o`) to work. This is also noted in the settings toggle and README. The close-tab functionality remains available via `:q`, `:quit`, `<C-w>c`, or `<C-w>q` (the latter two work once the Obsidian hotkey is removed).

## Global workspace navigation

**Status**: Working. Workspace commands work across all Obsidian views (PDF, graph, canvas, image, backlinks, etc.), not just markdown editors. ([#35](https://github.com/saberzero1/motions/issues/35))

A capture-phase `keydown` listener on `document` intercepts workspace-relevant keystrokes when no CodeMirror editor or text input is focused. When an editor IS focused, events propagate to codemirror-vim unchanged.

### Supported keys in non-editor views

**Navigation**: `<C-w>h/j/k/l` (focus pane), `<C-w>v/s` (split), `<C-w>c/q` (close), `<C-w>o` (close others), `gt/gT` (tabs), `Ngt` (Nth tab), `H/L` (prev/next tab), `Ctrl-o/Ctrl-i` (history)

**Hint actions**: `f` (activate/click), `F` (open in new pane), `yf` (yank URL/text), `df` (close tab/pane) — see [Hint mode actions](#hint-mode-actions)

**Scrolling**: `j/k` (line), `Nj/Nk` (N lines), `gg/G` (top/bottom), `Ctrl-u` (half page up), `Ctrl-d/f/b` (see below)

**Ex commands**: `:` opens a standalone command modal with tab-completion for globally-safe ex commands (`:q`, `:wq`, `:e`, `:sp`, etc.)

### `Ctrl-d`, `Ctrl-f`, `Ctrl-b` require unbinding Obsidian defaults

Obsidian's default hotkeys for `Ctrl-d` (delete paragraph), `Ctrl-f` (search), and `Ctrl-b` (toggle bold/sidebar) intercept these keys at the Electron level before any DOM event listener fires — including capture-phase listeners. The plugin's handler never receives the keydown event.

**Fix**: Unbind the conflicting hotkeys in **Settings → Hotkeys** (search for the key combination and remove the binding). After unbinding, `Ctrl-d/f/b` work as expected for half-page/full-page scrolling.

`Ctrl-u` works without any changes because Obsidian has no default hotkey for it.

This is the same class of issue as the `<C-w>` prefix conflict (documented above) — Obsidian's hotkey system takes priority over plugin DOM event listeners.

### Scroll target detection

The global handler finds the scrollable element in the active view by walking the DOM tree for the largest element with `overflow-y: auto|scroll` and `scrollHeight > clientHeight`. This works for standard scrollable views (PDFs, reading mode, backlinks, file explorer).

**Unsupported scroll targets**: Canvas and graph views use non-standard rendering (infinite canvas, WebGL) without a traditional scrollable container. `j/k` and scroll commands are silently no-ops in these views.

### `H`/`L` behavior in non-editor views

In standard Vim, `H`/`L` move the cursor to the top/bottom of the visible screen. In non-editor views there is no cursor, so `H`/`L` are repurposed for previous/next tab switching, matching [obsidian-vim-keynav](https://github.com/guoang/obsidian-vim-keynav) conventions. Editor behavior is unchanged.

### `Ctrl-o`/`Ctrl-i` dual purpose

In editor context, codemirror-vim uses `<C-o>`/`<C-i>` for the within-file jumplist. In non-editor views, the global handler maps them to `app:go-back`/`app:go-forward` (Obsidian's history navigation). There is no conflict because the global handler only fires when no editor is focused.

### Editor-only ex commands

The standalone ex command modal (`:` in non-editor views) supports 34 commands that don't require a CmAdapter. The following editor-dependent commands show "Not a global command" when invoked from the modal: `:e!`, `:saveas`, `:read`, `:marks`, `:delmarks`, `:changes`.

## Hint mode actions

**Status**: Working. Hint mode supports multiple vimium-style actions with a context-appropriate split between editor and non-editor views.

### Non-editor context (GlobalKeyHandler)

When a non-editor view (graph, PDF, canvas, etc.) is focused, full vimium-style hint bindings are available:

| Key  | Action   | Behavior                                                             |
| ---- | -------- | -------------------------------------------------------------------- |
| `f`  | Activate | Click button, focus pane, navigate link, focus input                 |
| `F`  | Open new | Open link/pane in new pane; fallback to activate for other targets   |
| `yf` | Yank     | Copy URL for links, note path for tabs, display text for others      |
| `df` | Close    | Close tab/pane via `leaf.detach()`; Notice for non-closeable targets |

Count prefix works: `3f` activates three targets sequentially (overlay re-shown between each). `3yf` yanks three URLs. `3df` closes three tabs.

The `y` and `d` keys enter pending states (`Y_PENDING`/`D_PENDING`) that only accept `f` as continuation. Any other key resets the sequence. Chord display shows `y` or `d` while pending, using the existing `SEQUENCE_TIMEOUT` of 1000ms.

### Editor context (vim engine)

`<leader><leader>h` triggers hint mode (unchanged). Action is selected by modifier keys during label selection:

- No modifier → activate (click/focus/navigate)
- Ctrl/Cmd held while typing label → open in new pane

Yank and close are not mapped to editor key sequences (they conflict with vim's native `y` and `d` operators). They are registered as Obsidian commands for custom hotkey assignment:

- `vim-motions:hint-open-new-pane` — "Hint: open in new pane"
- `vim-motions:hint-yank` — "Hint: yank link or text"
- `vim-motions:hint-close` — "Hint: close tab or pane"

### Target classification

Each hint target is classified by type during discovery, before label assignment. The classification determines per-action behavior:

- `.workspace-leaf-content` → `pane` (focus via `setActiveLeaf`)
- `.workspace-tab-header` → `tab` (close via `leaf.detach()`)
- `a[href]`, `[data-href]`, `.cm-underline` → `link` (navigate via `openLinkText`)
- `input`, `textarea`, `select`, `[contenteditable]` → `input` (focus; `<select>` cycles to next option)
- `button`, `.clickable-icon`, `[role="button"]` → `button` (click)
- everything else → `generic` (pointer event sequence + click)

Target discovery filters:

- Elements with `.is-measuring` class are excluded (Obsidian 1.13+ shadow `<select>` copies used for layout measurement)
- Child elements inside `.checkbox-container` are excluded (the container itself is the clickable toggle, not its inner `<input>`)
- `input[type="hidden"]` and disabled elements are excluded

### Settings gating

Hint actions in non-editor context require BOTH `enableWorkspaceNav` (gates GlobalKeyHandler) AND `enableHintMode` (gates hint actions). Disabling hint mode via settings stops `f`/`F`/`y`/`d` interception in GlobalKeyHandler. The existing `enableHintMode` setting controls all hint labels — in both editor and non-editor contexts.

### Modal behavior

Navigation keys (`j`/`k`/`g`/`z`/`:`/`H`/`L`/Ctrl-combinations) are suppressed when any Obsidian modal is open (settings, command palette, etc.) via `isModalOpen()`. This prevents scrolling and navigation from interfering with modal interaction.

Hint actions (`f`/`F`/`yf`/`df`) are NOT suppressed in modals — they use a separate `shouldInterceptHints()` gate. This allows hint labels to target and activate modal controls (buttons, toggles, dropdowns, text fields). After activating a toggle or dropdown in a modal, the element is blurred so `f` can immediately re-trigger hint mode without pressing Escape.

During hint label selection, GlobalKeyHandler bails entirely via an `isHintModeActive()` flag, preventing label characters from being intercepted as navigation or hint-trigger keys.

### Clipboard fallback

`hintYank` uses `navigator.clipboard.writeText()` with a fallback to a temporary textarea + `document.execCommand('copy')` for environments where the Clipboard API is restricted. The deprecated `execCommand` path is defensive — in Obsidian's Electron runtime, `navigator.clipboard` should always work.

### Stale target handling

Targets are validated via `el.isConnected` before action execution. If an element has been removed from the DOM between overlay display and label selection (e.g., Obsidian re-rendered a view), a Notice is shown and the action is aborted. During count iterations, if re-activation finds no visible targets, it stops silently without repeated Notices.

## Cross-document jump history (`Ctrl-o` / `Ctrl-i`)

codemirror-vim's built-in `<C-o>` and `<C-i>` handle the **within-file** jump list (jumping between cursor positions in the current document). Overriding them for cross-document navigation would break within-file jumps.

Cross-document navigation is available via `:back` and `:forward` ex commands, which map to Obsidian's built-in back/forward history. Users who prefer keybindings can add mappings in their vimrc:

```vim
nmap <C-p> :back
nmap <C-n> :forward
```

## `gf` opens file switcher, not file path under cursor

Standard Vim's `gf` opens the file whose path is under the cursor. In Obsidian, bare file paths in notes are uncommon — most navigation uses `[[wikilinks]]` (handled by `gd`). Our `gf` opens Obsidian's quick switcher instead, which lets users search any file by name. This is more practical for a note-taking context.

## Mobile support

The plugin works on mobile with limitations. EasyMotion and hint mode are disabled on mobile because they depend on desktop-only Obsidian globals (`activeDocument`, `activeWindow`) that are unavailable on mobile. All other features work, though on-screen keyboard users are further limited by Obsidian's soft keyboard, which does not support `:` and `/` command entry.

Features by platform:

| Feature                  | Desktop | Mobile + physical keyboard | Mobile + soft keyboard |
| ------------------------ | ------- | -------------------------- | ---------------------- |
| Core Vim motions         | ✅      | ✅                         | ⚠️ Limited             |
| Text objects             | ✅      | ✅                         | ⚠️ Limited             |
| EasyMotion               | ✅      | ❌ Disabled                | ❌ Disabled            |
| Hint mode                | ✅      | ❌ Disabled                | ❌ Disabled            |
| Ex commands (`:w`, `:q`) | ✅      | ✅                         | ❌ No `:` entry        |
| Search (`/`, `?`)        | ✅      | ✅                         | ❌ No `/` entry        |
| Workspace nav (`<C-w>`)  | ✅      | ✅                         | ❌ No modifier keys    |
| Global workspace nav     | ✅      | ❌ Disabled                | ❌ Disabled            |
| Status bar               | ✅      | ✅                         | ✅                     |
| Vimrc                    | ✅      | ✅                         | ✅                     |
| Settings                 | ✅      | ✅                         | ✅                     |
| Popout windows           | ✅      | N/A                        | N/A                    |

## Neovim Ex commands not applicable in Obsidian

The following Neovim Ex commands have no meaningful equivalent in Obsidian and will not be implemented. Users expecting these commands will see "Not an editor command" from CM Vim's Ex parser.

### Shell / system integration

| Command                 | Neovim description            | Why N/A                                                          |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `:!{cmd}`               | Execute shell command         | Obsidian has no shell access (sandboxed Electron app)            |
| `:read !{cmd}`          | Insert shell output           | No shell access                                                  |
| `:terminal`             | Open terminal                 | No terminal emulator in Obsidian                                 |
| `:cd` / `:lcd` / `:pwd` | Change/show working directory | Obsidian vault is the working directory; no directory navigation |
| `:make`                 | Run build                     | No build system concept                                          |

### Quickfix / location list

| Command                                   | Neovim description  | Why N/A                                            |
| ----------------------------------------- | ------------------- | -------------------------------------------------- |
| `:cnext` / `:cprev` / `:copen` / `:clist` | Quickfix navigation | No quickfix or error list (Obsidian is not an IDE) |
| `:lnext` / `:lprev` / `:lopen`            | Location list       | Same — no location list concept                    |

### Tags / ctags

| Command                        | Neovim description | Why N/A                                                                                 |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------------- |
| `:tag` / `:tjump` / `:tselect` | Tag navigation     | Obsidian has no ctags integration. `gd` provides link-based "go to definition" instead. |

### Scripting / autocommands

| Command                                | Neovim description | Why N/A                                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `:autocmd` / `:augroup`                | Autocommands       | Obsidian plugins handle events via the Plugin API, not Vim autocommands        |
| `:function` / `:call` / `:if` / `:for` | Vimscript          | The plugin is not a Vimscript interpreter. Use `.obsidian.vimrc` for mappings. |

### Diff mode

| Command                                              | Neovim description | Why N/A                           |
| ---------------------------------------------------- | ------------------ | --------------------------------- |
| `:diffthis` / `:diffsplit` / `:diffget` / `:diffput` | Diff operations    | No diff view in Obsidian's editor |

### Other

| Command                                | Neovim description        | Why N/A                                                   |
| -------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `:earlier` / `:later`                  | Time-based undo           | CM Vim does not track undo history by timestamp           |
| `:args` / `:argdo` / `:next` / `:prev` | Argument list             | No arglist concept — Obsidian manages open files via tabs |
| `:resize`                              | Resize window             | Obsidian manages pane sizing automatically                |
| `:tabmove`                             | Reorder tabs              | Obsidian does not expose a tab reorder API                |
| `:view`                                | Open file read-only       | Obsidian has no read-only mode for notes                  |
| `:bunload`                             | Unload buffer from memory | Obsidian manages editor memory internally                 |
| `:sign`                                | Place signs in gutter     | No sign column in Obsidian                                |
| `:menu`                                | Create GUI menus          | No Vim-style menu system                                  |
| `:spell*`                              | Spelling commands         | Obsidian has its own built-in spell checker               |

### Behavioral deviations

These commands exist but behave differently from Neovim:

| Command            | Neovim behavior                                    | Obsidian behavior                                          | Reason                                                                                                                                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Y`                | Mapped to `y$` by default                          | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                                                                   |
| `Q`                | Replay last recorded macro                         | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                                                           |
| `:wall` / `:wa`    | Save all modified buffers                          | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                                                             |
| `gf`               | Open file path under cursor                        | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                                                               |
| `zO` / `zC` / `zA` | Recursive fold open/close/toggle                   | Maps to the same action as `zo`/`zc`/`za`                  | CM6 has no recursive fold API. Obsidian markdown uses flat heading-level folds (not nested), so the non-recursive versions are functionally equivalent in practice. |
| `it` / `at`        | HTML tag text objects (CM Vim native via XML mode) | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown                                            |

## Select mode and Virtual Replace mode

- Select mode: `selectmode=mouse` may not work (CM6 mouse event limitations). `:smap`/`:sunmap` fallback to `:vmap` when no select-specific mapping exists (matches Neovim). `selectmode=key` and `keymodel=startsel` options are accepted but shifted cursor key behavior is not functional.
- Virtual Replace: TAB virtual-column handling is basic — East Asian Width (double-width CJK characters) is not yet accounted for in column width calculation. Newline handling in vreplace mode is simplified; `gR` does not delete the rest of the line (falls through to CM6 default).
- Mode indicators for select, v-replace, command, search, and insert-normal require fork mode (built-in vim mode OFF).
- Operator-pending mode indicator is not shown (too transient to be useful in the status bar).

| `dG` | Deletes from cursor to end of file, no trailing newline | Fixed in fork | The fork's `operators.delete` now expands the anchor to include the preceding newline when deleting linewise to end of file. |
| `>>` | Cursor at first non-blank after indent | Fixed in fork | The fork's `operators.indent` now returns cursor at column 0, matching Neovim behavior. |
| `V` + `>` | Cursor at first non-blank after visual indent | Fixed in fork | Same fix as `>>` — cursor at column 0 after indent. |
| `d0` | No-op at column 0 (zero-width motion) | Fixed in fork | Zero-width exclusive range produces no-op as expected. |
| `<<` | Unindent by shiftwidth spaces | Fixed in fork | Fork's indent operator now reads `getOption('shiftwidth')` and `getOption('expandtab')`, falling back to CM6's `tabSize`/`indentWithTabs` when the vim options are not defined. |
| `dd` | Cursor stays at same column | Fixed in fork | Fork preserves cursor column after linewise delete instead of moving to first non-blank. |
| `J` | Strips trailing whitespace before join | Fixed in fork | Fork strips trailing whitespace from current line before adding join space, preventing double spaces. |
| `di{` multiline | Preserves bracket lines (`a{\n}b`) | Fixed in fork | Fork deletes inner content lines only, keeping opening/closing bracket on their own lines. |
| `dj`/`dk` boundary | No-op at document start/end | Fixed in fork | Fork returns null from `moveByLines` when `j`/`k` can't move to a different line. |
| `:s` cursor | First non-blank of last affected line | Fixed in fork | Fork's `doReplace` positions cursor at first non-blank instead of column 0. |
| `%` + strings | Skips brackets in string/comment tokens | Fixed in fork (string-aware `scanForBracket`) | Fork's `moveToMatchedSymbol` aborts when the first bracket is in a string, and `scanForBracket` now skips brackets in string/comment tokens during matching. In Markdown, Lezer does not classify double-quoted text as string tokens, so the `(a")"b)` test case remains a deviation in Markdown context only. |
| `db` cross-line | Includes leading whitespace when crossing lines | Fixed in fork | Fork expands delete range to include whitespace-only prefix before cursor when delete crosses a line boundary. |
| `da"` whitespace | Deletes quotes and adjacent whitespace | Fixed in fork | Fork's `findBeginningAndEnd` now consumes trailing whitespace (or leading if no trailing) after inclusive quote expansion, matching Neovim's `a"` behavior. |
| `:join` cursor | Cursor at column 0 of joined line | Fixed in fork | Fork's ex command handler sets cursor to `(line, 0)` after join. |
| `:global` cursor | Cursor at last matched line after `:g/pattern/d` | Fixed in fork | Fork sets cursor to last matched line (clamped to document end) after line-deleting `:g` commands. Non-destructive `:g` leaves cursor where the last sub-command placed it. |
| `:s` empty | Repeats last pattern with default flags (no `/g`) | Fixed in fork | Fork's `:s` without arguments no longer preserves the `/g` flag from the previous substitution. |
| `gj`/`gk` widgets | Navigates into replaced decorations | Fixed in fork | Fork's `findPosV` detects multi-line jumps from `moveVertically` and steps one document line when a replaced widget decoration is present (e.g. rendered MathJax). Tall-but-unreplaced lines (e.g. headings with larger font) are excluded from the widget-step heuristic via `dec.point` decoration type checking. A `posAtCoords` fallback corrects goalColumn misresolution on decorated lines. |
| `gk` frontmatter | Navigates into frontmatter like `k` | Fixed in fork | Fork's `moveByDisplayLines` now checks `focusBefore` on the `findPosV` result, matching the existing check in `moveByLines`. The `stuckAtBoundary` condition uses `range.head === startOffset` to avoid false positives on wrapped lines — `gk` navigates wrapped display lines first and only enters properties from the topmost display line. Users who remap `k` to `gk` can now enter frontmatter navigation. |

## ~~Visual mode on single-character text objects~~ (Fixed)

**Status**: Fixed via formatting mark cursor correction.

`vi*` on `*x*` previously selected `*` (the delimiter) instead of `x` (the content). The root cause was Live Preview cursor snapping: Obsidian uses `Decoration.replace({})` to hide formatting marks (`*`, `**`, `_`, `~~`, etc.) on inactive lines, creating zero-width gaps. When the cursor was placed inside formatted text, CM6's position mapping snapped to the delimiter boundary instead of the intended content position.

Fixed via an `EditorState.transactionFilter` that detects when a cursor endpoint lands strictly inside a formatting mark range and snaps it to the nearest boundary based on motion direction. The filter walks the Lezer syntax tree to identify formatting mark nodes (`formatting-strong`, `formatting-em`, `formatting-code`, `formatting-strikethrough`, `formatting-highlight`) and only activates in Live Preview mode.

## Formatting mark cursor correction in Live Preview

The plugin uses an `EditorState.transactionFilter` to correct cursor positioning near markdown formatting marks (`*`, `**`, `_`, `__`, `` ` ``, `~~`, `==`) in Live Preview mode.

Obsidian's Live Preview hides formatting marks on inactive lines via `Decoration.replace({})`. This creates zero-width gaps in the DOM that cause CM6 to snap the cursor to delimiter boundaries when vim motions place the cursor inside formatted text. The transaction filter intercepts selection-only transactions and snaps cursor endpoints that land strictly inside a formatting mark range to the nearest boundary.

The filter walks the Lezer syntax tree (`syntaxTree(state).iterate()`) to identify formatting mark nodes by their node type names. It only activates in Live Preview mode (checked via `editorLivePreviewField`) and only on the active line (cursor mode).

When a formatting mark extends to the end of a line (e.g. `**he**` with no trailing content), the filter does not snap rightward past the mark — there is no valid cursor position beyond it on that line. The cursor stabilizes at the mark boundary instead of oscillating. When the cursor did not actually move (e.g. `l` at end of line is a no-op), the filter skips adjustment entirely.

The filter only applies to empty (cursor) selections. Non-empty selections (visual mode) are skipped entirely — the `range.empty` guard ensures that `v`, `V`, and `<C-v>` selections across formatted text are not corrupted by formatting mark snapping. ([#38](https://github.com/saberzero1/motions/issues/38))

**Known limitation: `ci*` in Live Preview** — the `c` (change) operator deletes text and enters insert mode at the deletion point. If the deletion point falls inside a collapsed formatting mark region, the insert cursor may land at the wrong position. `di*` (delete without entering insert mode) works correctly. This limitation is deferred to a future widget-based approach.

The previous approach (v0.22.0) used `RangeSetBuilder.prototype.add` monkey-patching to suppress Obsidian's replace decorations globally, with CSS `color: transparent` to hide the now-visible marks. This was replaced because the monkey-patching conflicted with obsidian-latex-suite (issue #32, causing phantom text insertion) and the CSS workaround didn't fully cover all formatting mark types (issue #33). The `'always'` mode (show marks on all lines) was removed because it required monkey-patching to implement.

## ~~Visual line selection overlap in Live Preview~~ (Fixed)

**Status**: Fixed. Double-highlight eliminated, cursor displacement resolved. ([#41](https://github.com/saberzero1/motions/issues/41))

Two issues affected visual-line mode (`V`) in Live Preview:

1. **Double highlight**: The plugin's custom `linewiseVisualHighlight` decoration (full-line highlight via `Decoration.line`) and the native CM6 `::selection` CSS rendered simultaneously. The native `::selection` was hidden in normal mode via `.cm-vimMode:not(.cm-vimVisual)` but was intentionally left visible in all visual modes (needed for charwise and blockwise). Fixed by adding a `.cm-vimVisualLine` class toggle and extending the `::selection` suppression to include visual-line mode. Charwise and blockwise visual modes remain unaffected.

2. **Cursor displacement over collapsed markup**: Navigating with `j`/`k` on lines containing collapsed markup (`[[wikilinks]]`, `[text](url)`) caused Obsidian to uncollapse the hidden content, reflowing the line. This happened because `updateCmSelection` set a spanning CM6 `EditorSelection` range across the full line content, and Obsidian's Live Preview detects selection overlap with `Decoration.replace` ranges and reveals them (this is Obsidian plugin-level behavior, not CM6 core). Fixed by setting a cursor-only CM6 selection in visual-line mode — the `linewiseVisualHighlight` ViewPlugin provides the visual highlight independently from `vim.sel`, and operators recompute their own selection at dispatch time.

Actions that read from the CM6 selection in visual mode (`joinLines`, `replace`) were updated to read from `vim.sel` instead, and a Ctrl+C special-case copies linewise text from `vim.sel` when `somethingSelected()` returns false. The async motion `.then()` callback (used by EasyMotion in visual mode) now wraps `updateCmSelection` in `cm.operation()` with `isVimOp = true` to prevent `handleExternalSelection` from exiting visual mode when it sees cursor-only selection. The cursor-only selection always uses column 0 (matching Neovim) to avoid landing inside widget decorations (checkboxes, collapsed links) on the head line.

**Obsidian command passthrough** (two layers):

1. **Fork-side (keyboard events)**: When a key is NOT handled by vim in visual-line mode, `handleKey` in the fork's `index.ts` temporarily expands the CM6 selection to the full linewise range before the event propagates. The cursor-only selection is restored via microtask after Obsidian processes the command. This covers commands triggered by keys that pass through CM6's bubble-phase event handler.

2. **Plugin-side (all invocation paths)**: `app.commands.executeCommand` is wrapped via the `around()` utility (`src/vim/visual-line-command-fix.ts`). When the active editor is in visual-line mode, the wrapper expands the CM6 selection before the command executes and restores cursor-only after. This covers all invocation paths: Obsidian hotkeys (which fire in the capture phase on `window`, before CM6's bubble-phase handler), command palette, toolbar buttons, and programmatic `executeCommandById` calls. The wrapper uses the same `around()` pattern as the table widget suppressor, stacking safely with other plugins that patch `executeCommand`.

**Trade-off**: `cm.somethingSelected()` and `cm.getSelection()` return false/empty in visual-line mode during vim key processing. Third-party plugins that depend on CM6 selection state during visual-line mode may not detect the selection. The canonical integration point `window.CodeMirrorAdapter.Vim` is unaffected. Obsidian's own commands see the correct linewise selection because of the passthrough mechanisms above.

**Test coverage**: 8 Neovim golden comparison cases + 7 e2e functional tests covering yank, delete, join, mode transitions, `gv`, register content verification, and mid-column visual-line with checkbox content. 10 spike tests (`spike23-visual-line-hotkey-commands.e2e.ts`) verifying command execution via `executeCommandById`, hotkey path, and selection state inspection.

## ~~Visual mode cursor displaced at end-of-line~~ (Fixed)

**Status**: Fixed in fork. Verified against Neovim 0.12.2 golden comparison.

In charwise visual mode (`v`), selecting the last character on a line caused the block cursor to render one character past the end of the visible line content. Two issues were identified and fixed:

1. **`exitVisualMode` cursor clipping** (`src/vim.js`): `exitVisualMode()` called `clipCursorToContent()` while `vim.visualMode` was still `true`. In visual mode, `clipCursorToContent` allows `ch = text.length` (the linebreak position). After clearing `vim.visualMode` on the next line, the cursor was already set one position past the last character. Reproducible as: `vlll<Esc>` on "abc" — `l` past the last char is allowed in visual mode, but Escape should clip back to normal-mode bounds (`ch = text.length - 1`). Fixed by clearing visual flags before `setCursor`, while preserving the `updateLastSelection` call order. ([#15](https://github.com/saberzero1/motions/issues/15))

2. **`measureCursor` EOL adjustment** (`src/block-cursor.ts`): The `letter != "\n"` comparison used loose equality (`!=`). When `head >= doc.length` (cursor past document end), the short-circuit `head < doc.length && sliceDoc(...)` produced `false`, and `false != "\n"` evaluated to `false` due to JS type coercion (both coerce to `0`). This caused the wrong branch to execute at document end. Fixed by producing `""` instead of `false` and using strict inequality (`!==`). The original charwise visual mode fix (using `vim.visualLine`/`vim.visualBlock` to scope the EOL decrement) remains in place.

## Test-discovered behavioral discrepancies

These were found by translating edge-case tests from Neovim's legacy test suite and replit/codemirror-vim. Each has a corresponding `it.skip()` test with a `// BUG:` comment.

### `dG` leaves trailing newline

**Status**: Fixed in fork.
**Test**: `test/specs/vim-builtin/operator-combos.e2e.ts` — "dG should delete from current line to end of file"

`dG` from line 2 of a 4-line document produces `'one'` instead of `'one\n'`. The fork's `operators.delete` now expands the anchor to include the preceding newline when deleting linewise to end of file.

### ~~`iB` does not scope to innermost blockquote nesting level~~

**Status**: Fixed. The blockquote text object now uses depth-aware scanning.

### ~~`di*` operates when cursor is on the delimiter~~

**Status**: Fixed. The delimiter scanner now excludes cursor positions on the delimiter characters.

### ~~Dot-repeat of `cw` + typed text unreliable~~ (Fixed)

The vim engine correctly records and replays insert mode changes after `cw`. The original test failure was caused by using `browser.keys` (DOM events) for insert mode typing instead of `vimRawKeys`, which dispatches keys through the Vim key handler.

### ~~`)` sentence motion cursor position at end of text~~ (Fixed)

Fixed in fork. The `findSentence()` forward scan now checks whether the computed fallback position is at or before the starting cursor on the same line, and returns the original position unchanged if so.

### ~~`n`/`N` search wrap-around unreliable~~ (Fixed)

The vim engine correctly wraps search results. The original test failure was caused by using individual `browser.keys` calls with pauses for the `/foo` + Enter + `n` sequence instead of `vimRawKeys`, which dispatches the full key sequence through the Vim key handler without timing gaps.

## Hint mode in the separate settings window (Obsidian 1.13+)

**Status**: Platform limitation.

In Obsidian 1.13+, the settings window opens as a separate OS-level Electron BrowserWindow by default. This window runs in its own renderer process, which plugin JavaScript in the main window cannot access. The plugin's global hotkey listener and hint mode overlay cannot be injected into this window.

**Workaround**: Disable the separate settings window by unchecking **Settings → Interface → Open settings in new window**. When settings opens as an in-app modal instead, the plugin's global hotkey and hint mode work normally — the capture-phase keyboard listener fires before the modal's scope intercepts events.

Hint mode works in all other contexts: the main window, workspace popout windows (popped-out notes), and any in-app modal (command palette, file switcher, etc.).

## Hint mode element selector fragility

Hint mode targets clickable elements using CSS class selectors like `.nav-file-title`, `.workspace-tab-header`, `.vertical-tab-nav-item`, etc. These are Obsidian's internal CSS classes, not part of the public plugin API. They may change between Obsidian versions. Standard HTML selectors (`a[href]`, `button`, `[role="button"]`, etc.) are stable.

If hint mode stops labeling certain UI elements after an Obsidian update, the selector list in `src/ui/hint-mode.ts` may need updating.

## Status bar left-alignment

The vim mode indicator and chord display are positioned at the leftmost edge of the status bar via `parentElement.insertBefore(el, firstChild)` and `margin-right: auto`. This relies on Obsidian's status bar being a CSS flexbox container with `justify-content: flex-end` — if Obsidian changes its status bar layout in a future version, the positioning may break. The powerline `::after` pseudo-element (CSS border-triangle) also depends on the status bar's flex item sizing.

## Chord display reads internal `vim.status`

The chord display reads `adapter.state.vim.status` directly from codemirror-vim's internal state rather than accumulating keystrokes from the `vim-keypress` event. This is necessary because in Obsidian's CM6 adapter, `vim-keypress` fires _after_ command processing — by which point `clearInputState` has already reset the input buffer for completed commands. Manual accumulation would cause stale keys to persist after single-key commands like `j` or `G`.

The mode tracker listens to three events to sync the chord display: `vim-mode-change`, `vim-keypress`, and `vim-command-done`. The `vim-command-done` listener is needed because Escape in normal mode (cancelling a partial command like `d`) fires `vim-command-done` without a mode change or keypress event — without it, the stale chord would remain visible.

`vim.status` is not part of a public API — it is an internal string maintained by the CM6 vim plugin adapter. If Obsidian updates its bundled codemirror-vim and the status accumulation changes, the chord display may stop working or display incorrect values.

## DOM keyboard events not routed after settings reload

**Status**: Confirmed, test workaround in place.

After `reloadFeatures()` (triggered by toggling any setting in the plugin's settings tab), `browser.keys`-style DOM keyboard events may not reach the CM6 vim key handler. The vim engine itself is fully functional — `Vim.handleKey()` processes all commands correctly, and the user can interact normally by clicking the editor to restore focus. The issue is that the CM6 EditorView's focus/event-routing state is disrupted by the extension reconfiguration that `reloadFeatures()` triggers internally.

This does not affect normal usage — clicking the editor or switching tabs restores event routing. It only affects automated testing with WebDriver, where `browser.keys` dispatches synthetic keyboard events without a preceding click.

## EasyMotion visual mode label selection via DOM events

**Status**: Test infrastructure limitation (1 test skipped).
**Test**: `test/specs/easymotion-comprehensive.e2e.ts` — "v + w + label should select text from cursor to target"

When EasyMotion produces only 2 labels (e.g., `[a, s]`), pressing the label character via `browser.keys` sends the key through the browser's DOM event system. The vim key handler processes the key before the EasyMotion `waitForLabel` DOM listener receives it, so the label press is consumed as a vim command instead of an EasyMotion selection.

This does not affect real user interaction — physical keypresses reach the EasyMotion capture-phase listener (registered with `addEventListener('keydown', handler, true)`) before the vim handler. It only fails with WebDriver's synthetic events in specific timing conditions (low label count = single-character labels that also happen to be valid vim commands like `s`).

The async visual mode selection itself works correctly — the `v + f + label` test passes because the char-search flow has different timing, and the `easymotion-visual.e2e.ts` suite (4 tests) passes entirely.

## ~~Properties navigation in bundled fork mode~~ (Fixed)

Properties navigation now works in bundled fork mode. The fork's `findPosV` adapter detects when `moveVertically` lands the cursor inside the frontmatter region or when the cursor is stuck at the boundary of the properties widget, and provides a `focusBefore` callback that focuses the "Add property" button in Obsidian's metadata container. Both `k` and `gk` enter the properties panel — `gk` (`moveByDisplayLines`) checks `focusBefore` on the `findPosV` result, matching the existing check in `moveByLines`.

The `stuckAtBoundary` check uses `range.head === startOffset` to distinguish "cursor truly couldn't move" from "cursor moved to a different display line within a wrapped line." Without this guard, `gk` on a long wrapped first content line would fire `focusBefore` immediately instead of navigating through the wrapped display lines first — the cursor stayed on the same document line (`pos.line === start.line`) but at a different character offset.

The plugin's `tableAwareMoveUp` motion (which overrides `k` when table navigation is enabled) bypasses `findPosV` with its own line arithmetic. To preserve frontmatter navigation, `tableAwareMoveUp` delegates to `findPosV` when the computed target line falls inside the frontmatter region, allowing the `focusBefore` callback to fire. ([#25](https://github.com/saberzero1/motions/issues/25))

**Test coverage**: `test/specs/vim-builtin/g-commands.e2e.ts` — 3 regression tests: `gk` navigates wrapped display lines before entering properties, `gk` enters properties on non-wrapping line, `k` enters properties from first content line.

## ~~Latex Suite interaction in bundled fork mode~~ (Fixed)

The bundled vim extension is now registered at `Prec.highest` so its keydown handler fires before Latex Suite's handlers, preventing duplicate key consumption in large math blocks. Latex Suite's auto-snippets, tabstop navigation, and math-mode features work normally in vim insert mode.

## ~~Visual line navigation and replaced widget decorations~~ (Fixed)

`gj`/`gk` (and `j`/`k` when mapped to `gj`/`gk`) now correctly navigate into block MathJax (`$$`) and other replaced widget decorations in Obsidian's live preview. Previously, CM6's `moveVertically` treated replaced decorations as atomic, causing the cursor to skip over the entire widget's source range in a single step.

The fork's `findPosV` detects when `moveVertically` jumps more than one document line in a single visual-line step **and** a replaced/widget decoration exists in the skipped range (`dec.point === true`), then places the cursor on the adjacent document line instead, allowing step-by-step navigation through the widget's source text. Folded ranges and tall-but-unreplaced lines (e.g. headings with larger fonts) are excluded — they legitimately span multiple visual lines without containing replaced content. A `posAtCoords` fallback corrects cases where `moveVertically` misresolves the goalColumn on lines with decorations that alter font metrics, preventing the cursor from jumping to column 0 when crossing headings. ([#26](https://github.com/saberzero1/motions/issues/26))

**Test coverage**: `test/specs/widget-navigation.e2e.ts` (6 tests covering gj/gk/j/k through single and multiple `$$` blocks), `test/specs/vim-builtin/g-commands.e2e.ts` (3 tests covering gk/gj horizontal position preservation across headings).

## Per-mode cursor shapes require bundled fork mode

The per-mode cursor shape settings (block, bar, underline, hollow) only take effect when Obsidian's built-in Vim mode is disabled. With built-in Vim enabled, Obsidian renders its own block cursor and the plugin has no control over its shape. The `set guicursor=...` vimrc command is also only effective in bundled fork mode.

## Surround operator scope

**Status**: Complete. All vim-surround features implemented.

The surround operator implements the full vim-surround command set: `ds`/`cs`/`ys`/`yss`/visual `S` with all bracket/quote/tag targets, function wrapping (`f`/`F`), newline variants (`cS`/`yS`/`ySS`/`gS`), count support (bracket depth and quote char repeat), insert mode (`<C-G>s`/`<C-G>S`), and dot-repeat. Markdown-specific pairs use count-prefix: `2ysiw*` → `**word**`.

**Breaking changes from CM Vim defaults**:

- `<` in replacement position triggers tag prompting (was angle brackets with spaces). Use `>` for no-space angle brackets.
- `f`/`F` in replacement position triggers function wrapping (was literal `f`/`F` as delimiters).
- `S` in visual mode now surrounds instead of substituting (was `S` → `VdO` keyToKey).

## ~~Block visual mode (CTRL-V) insert not supported~~ (Fixed)

**Status**: Fixed. Block insert, change, cursor positioning, and zero-width blocks all match Neovim. Zero deviations remaining.

`I` and `A` in block visual mode (`CTRL-V`) previously did not enter insert mode with aligned cursors on every selected line. Six fork-level fixes were required:

1. **`enterInsertMode` preserves `wasInVisualBlock`** before `exitVisualMode` clears `vim.visualBlock`, so `multiSelectHandleKey` routes subsequent insert-mode keys correctly through CM6's native multi-selection text input.
2. **`selectForInsert` skips short lines** instead of clipping the cursor to the line end. Lines shorter than the block column are left unchanged, matching Neovim.
3. **`operators.change` block visual path** uses `cm.replaceSelections()` to delete the block selection before entering insert mode at the block's left column. Handles both `c` (change block) and `C` (change to EOL via `applyOperator`'s linewise head extension).
4. **`exitInsertMode` uses `blockInsertLeft`** to position the cursor at the block's original left column instead of the standard `ch - 1`. This fixes `A` cursor placement after `<Esc>`.
5. **`makeCmSelection` zero-width block fix** changes `fromCh < toCh` to `fromCh <= toCh` so that zero-width blocks (`fromCh === toCh`) correctly include the character at the cursor position instead of creating a backwards range.
6. **`repeatInsertModeChanges` cursor positioning** uses `blockInsertLeft` (stored on `lastInsertModeChanges`) for the final cursor position after dot-repeat, instead of a hardcoded `+1` offset.

CM6's native multi-cursor support means typed text appears on all lines in real-time (unlike Neovim, where text is only visible on the primary cursor until `<Esc>`).

Block visual operations that were already working: delete (`d`), yank (`y`), paste (`p`/`P`), indent (`>`/`<`), replace (`r`), case toggle (`~`), corner swap (`o`/`O`). Now also working: insert (`I`/`A`), change (`c`/`C`).

**Test coverage**: `test/specs/vim-builtin/visual-block-golden.e2e.ts` — 15 golden Neovim comparison tests covering block insert, append, change, change-to-EOL, delete, case toggle, replace, short-line handling, block yank/paste, zero-width block C, zero-width block I, A cursor position, upward selection, `$` escape cursor position, and `$` delete to EOL.

## Lua configuration (`init.lua`)

**Status**: Working. Sandboxed Lua 5.3 runtime via [Fengari fork](https://github.com/saberzero1/fengari) (pure JS, browser-only — all Node.js dependencies stripped). ([#46](https://github.com/saberzero1/motions/issues/46))

The plugin supports `.obsidian.init.lua` as an alternative to `.obsidian.vimrc`. Enable in **Settings → Vim Motions → Vimrc & key bindings → Enable Lua configuration**.

### Supported APIs

The Lua config runtime (`init.lua`) supports `vim.opt`, `vim.o`, `vim.g`, `vim.keymap.set`, `vim.keymap.del`, `vim.cmd()`, `vim.vault_name()`, `vim.tbl_*`, `vim.split`, `vim.trim`, `vim.startswith`, `vim.endswith`, `vim.inspect`, `vim.json`, `vim.schedule`, `vim.defer_fn`, `vim.uv`, `vim.notify` (with levels), `vim.obsidian`/`vim.ob`, `vim.env`, `vim.api.nvim_set_hl`, `vim.api.nvim_buf_*`, and `print()`. See `docs/configuration/lua-config.md` for the full reference.

### Unsupported Neovim APIs

`require()`, `vim.lsp`, `vim.treesitter`, `vim.ui`, `vim.diagnostic`: accessing these produces a clear error message. `vim.api` is partially supported: `nvim_create_user_command`, `nvim_create_autocmd`, `nvim_create_augroup`, `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds`, `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, and `nvim_buf_del_keymap` are available; other `vim.fn` is partially supported (see below): unsupported `vim.fn.*` functions produce a helpful error listing available functions. The Lua runtime is sandboxed: `io`, `load`, `dofile`, `loadfile`, and `require` are not available. The `os` library is available with a browser-safe subset (`os.date`, `os.time`, `os.difftime`, `os.clock`, `os.setlocale`); Node.js-only functions (`os.exit`, `os.getenv`, `os.remove`, `os.rename`, `os.tmpname`, `os.execute`) are stripped in the fork. The `debug` library is available (minus `debug.debug()` interactive REPL). The `package` library is not available.

### Autocmds

12 events supported: `InsertEnter`, `InsertLeave`, `ModeChanged`, `BufEnter`, `BufLeave`, `FocusGained`, `FocusLost`, `TextYankPost`, `CursorMoved`, `CursorHold`, `BufWritePre`, `BufWritePost`. See `docs/configuration/lua-config.md` for the full reference.

Limitations:

- All autocmds are non-nested (callbacks cannot trigger other autocmds)
- `buffer` option not supported (Obsidian has no buffer numbers)
- `command` option not supported (use `callback` only)
- `nested` option not supported
- `buf` field in event data is always 0
- `TextYankPost` requires bundled fork mode (built-in vim mode OFF)

### `vim.fn.*` subset

27 Neovim `vim.fn.*` functions are implemented: `has`, `expand`, `fnamemodify`, `exists`, `localtime`, `strftime`, `filereadable`, `isdirectory`, `glob`, `mode`, `line`, `col`, `getline`, `tolower`, `toupper`, `trim`, `strlen`, `strwidth`, `stridx`, `strridx`, `strpart`, `substitute`, `nr2char`, `char2nr`, `split`, `join`. Additionally, `vim.notify(msg)` shows an Obsidian notification. Unsupported `vim.fn.*` functions produce an error listing the available set. `vim.fn.hostname()` and `vim.fn.getenv()` are intentionally skipped (system fingerprinting concern). `vim.fn.line('.')`, `vim.fn.col('.')`, and `vim.fn.getline('.')` return 0/empty at config-load time and are only meaningful inside function callbacks. See `docs/configuration/lua-config.md` for usage and the full feature table.

### Hybrid loading

Settings (`vim.opt`) and keymaps (`vim.keymap.set`) load immediately without an active editor. `vim.cmd()` calls are queued and executed when the first editor receives focus. If no init.lua file exists, the loader silently skips (no notice).

### Loading order

init.lua loads after vimrc. Both can be used simultaneously — Lua values override vimrc values on conflict. This differs from Neovim, which uses either `init.lua` or `.vimrc`, not both.

### Function callbacks and Tier 3 functions

Lua function callbacks (`vim.keymap.set('n', 'key', function() ... end)`) execute at keypress time, not config-load time. Editor-state-dependent functions (e.g., `vim.fn.line('.')`) are planned to work inside callbacks but error at config-load time (context-aware execution).

### Known deviations from Neovim

4 deviations registered in `test/neovim/deviations.ts`:

- `keymap.del` + `Q`: plugin's built-in `Q→@@` mapping persists after Lua unmap
- `cw` + `<Esc>` in mapped keys: test infrastructure key dispatch difference
- Visual surround cursor: off-by-one in visual mode
- Leader key in test: leaderRegistry propagation timing in `executeLuaForTest`

### Bundle size

Fengari fork adds +201KB minified / +65KB gzipped (reduced from +238KB / +79KB after stripping Node.js dependencies). Total plugin size: 563KB minified (11.3% of the 5000KB soft limit).

### Intentionally skipped Lua features

| Feature                                 | Reason                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `require()` / plugin loading            | Security — sandboxed environment, no module system (Lua `package` library stripped in fork)                                                                                                                                                                                                                                                                                                                              |
| `vim.api.nvim_*`                        | 16 functions supported (`nvim_create_user_command`, `nvim_create_autocmd`, `nvim_create_augroup`, `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds`, `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, `nvim_buf_del_keymap`); others remain unavailable |
| `vim.fn.hostname()` / `vim.fn.getenv()` | System fingerprinting concern                                                                                                                                                                                                                                                                                                                                                                                            |
| `vim.lsp.*` / `vim.treesitter.*`        | Not applicable to Obsidian                                                                                                                                                                                                                                                                                                                                                                                               |
| Async Lua (coroutine ↔ Promise bridge) | Deferred — `vim.schedule`, `vim.defer_fn`, and `vim.uv` timer subset are available; full coroutine bridge remains deferred                                                                                                                                                                                                                                                                                               |

**Test coverage**: 12 golden comparison tests (Neovim 0.12.2), 9 integration e2e tests covering settings, keymaps, error recovery (syntax/runtime/infinite loop), conditional config, coexistence with vimrc, and disabled state.

## Intentionally not supported

These features are excluded by design and will not be implemented:

| Feature                         | Reason                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `jscommand` / `jsfile` in vimrc | Security risk — arbitrary JavaScript execution                                                   |
| `cmcommand` in vimrc            | Broken in CodeMirror 6, never fixed upstream                                                     |
| Input method switching          | Use the [vim-im-control](https://github.com/kometenstaub/obsidian-vim-im-control) plugin         |
| Yank highlighting               | Use the [vim-yank-highlight](https://github.com/kometenstaub/obsidian-vim-yank-highlight) plugin |
| Reading view navigation         | Use the [vim-keynav](https://github.com/kometenstaub/obsidian-vim-keynav) plugin                 |
| Vim toggle command              | Use the [vim-toggle](https://github.com/conneroisu/vim-toggle) plugin                            |
| Canvas keyboard navigation      | Canvas is a different rendering surface without CodeMirror                                       |
