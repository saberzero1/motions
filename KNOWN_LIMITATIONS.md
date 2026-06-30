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

Changing `.obsidian.vimrc` requires reloading the plugin. The vimrc is loaded once during the first `active-leaf-change` event after plugin load. Other settings (text objects, navigation, operators, etc.) hot-reload immediately via `reloadFeatures()`, but vimrc parsing involves one-shot setup (exmap definitions, leader key state) that is not designed for re-entry.

## ~~Scrolloff line height assumption~~ (Fixed)

Scrolloff now uses `EditorView.defaultLineHeight` to dynamically measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height. Note: `defaultLineHeight` returns an average line height — documents with mixed-height lines (e.g., headings with larger fonts) may not have pixel-perfect scrolloff distances.

## `set` option scope

All plugin settings are now configurable via `set` options in `.obsidian.vimrc`. When vimrc is enabled (the default), vimrc values override the corresponding Settings UI values for the current session. Overrides are in-memory only — the on-disk settings file always reflects UI-set values. See the full options table in `README.md` → "Supported `set` options".

Additionally, `whichkeygroup` and `whichkeylabel` ex commands allow configuring which-key labels, and `let g:mode_prompt_*` allows customizing status bar mode text. These use merge semantics with the Settings UI (both sources contribute; vimrc wins on conflict).

Settings overridden by vimrc appear as disabled controls in the settings tab with a note showing the vimrc directive (e.g., "Set by vimrc: `set scrolloff=10`"). Changing a disabled setting requires editing the vimrc.

The following settings are intentionally **not** exposed via vimrc:

| Setting          | Reason                                                       |
| ---------------- | ------------------------------------------------------------ |
| `enableVimrc`    | Circular dependency — can't control vimrc loading from vimrc |
| `hintModeHotkey` | Requires modifier key capture UI (press-to-record widget)    |
| `leaderBindings` | Already achievable via `nmap <leader>x :command` in vimrc    |

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
- **Leader key only** — shows leader bindings when the leader key is pressed and held for 500ms
- **All partial keys** — shows available continuations after any partial key sequence (operators, prefix keys, leader)

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

- The 500ms delay is hardcoded (not configurable via settings)
- User-defined mappings via `Vim.map()` appear in completions but without friendly descriptions (shown as the raw rhs key sequence)
- The overlay does not show during macro playback or when a register prefix (`"a`) is pending
- In "leader key only" mode, drill-down requires the overlay to be visible (500ms delay must elapse before pressing the group key)

## `<C-w>` prefix conflict with Obsidian hotkeys

Obsidian's default "Close current tab" hotkey is bound to Ctrl+W. Users must unbind it in **Settings → Hotkeys** (search for "Close current tab") for the `<C-w>` prefix (`<C-w>h/j/k/l`, `<C-w>v`, `<C-w>s`, `<C-w>c`, `<C-w>q`, `<C-w>o`) to work. This is also noted in the settings toggle and README. The close-tab functionality remains available via `:q`, `:quit`, `<C-w>c`, or `<C-w>q` (the latter two work once the Obsidian hotkey is removed).

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

The plugin works on mobile with limitations. Physical keyboard users (Bluetooth keyboards, keyboard cases) get the full experience — all Vim commands, EasyMotion, hint mode, and keybindings work. On-screen keyboard users are limited by Obsidian's soft keyboard, which does not support `:` and `/` command entry (making ex commands and search unusable).

Features by platform:

| Feature                  | Desktop | Mobile + physical keyboard | Mobile + soft keyboard |
| ------------------------ | ------- | -------------------------- | ---------------------- |
| Core Vim motions         | ✅      | ✅                         | ⚠️ Limited             |
| Text objects             | ✅      | ✅                         | ⚠️ Limited             |
| EasyMotion               | ✅      | ✅                         | ❌ Requires keys       |
| Hint mode                | ✅      | ✅                         | ❌ Requires keys       |
| Ex commands (`:w`, `:q`) | ✅      | ✅                         | ❌ No `:` entry        |
| Search (`/`, `?`)        | ✅      | ✅                         | ❌ No `/` entry        |
| Workspace nav (`<C-w>`)  | ✅      | ✅                         | ❌ No modifier keys    |
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

| Command            | Neovim behavior                                         | Obsidian behavior                                          | Reason                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Y`                | Mapped to `y$` by default                               | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                                                                                                                                                                                                                                                                                                                 |
| `Q`                | Replay last recorded macro                              | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                                                                                                                                                                                                                                                                                                         |
| `:wall` / `:wa`    | Save all modified buffers                               | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                                                                                                                                                                                                                                                                                                           |
| `gf`               | Open file path under cursor                             | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                                                                                                                                                                                                                                                                                                             |
| `zO` / `zC` / `zA` | Recursive fold open/close/toggle                        | Maps to the same action as `zo`/`zc`/`za`                  | CM6 has no recursive fold API. Obsidian markdown uses flat heading-level folds (not nested), so the non-recursive versions are functionally equivalent in practice.                                                                                                                                                                                                                                               |
| `it` / `at`        | HTML tag text objects (CM Vim native via XML mode)      | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown                                                                                                                                                                                                                                                                                          |
| `dG`               | Deletes from cursor to end of file, no trailing newline | Fixed in fork                                              | The fork's `operators.delete` now expands the anchor to include the preceding newline when deleting linewise to end of file.                                                                                                                                                                                                                                                                                      |
| `>>`               | Cursor at first non-blank after indent                  | Fixed in fork                                              | The fork's `operators.indent` now returns cursor at column 0, matching Neovim behavior.                                                                                                                                                                                                                                                                                                                           |
| `V` + `>`          | Cursor at first non-blank after visual indent           | Fixed in fork                                              | Same fix as `>>` — cursor at column 0 after indent.                                                                                                                                                                                                                                                                                                                                                               |
| `d0`               | No-op at column 0 (zero-width motion)                   | Fixed in fork                                              | Zero-width exclusive range produces no-op as expected.                                                                                                                                                                                                                                                                                                                                                            |
| `<<`               | Unindent by shiftwidth spaces                           | Fixed in fork                                              | Fork's indent operator now reads `getOption('shiftwidth')` and `getOption('expandtab')`, falling back to CM6's `tabSize`/`indentWithTabs` when the vim options are not defined.                                                                                                                                                                                                                                   |
| `dd`               | Cursor stays at same column                             | Fixed in fork                                              | Fork preserves cursor column after linewise delete instead of moving to first non-blank.                                                                                                                                                                                                                                                                                                                          |
| `J`                | Strips trailing whitespace before join                  | Fixed in fork                                              | Fork strips trailing whitespace from current line before adding join space, preventing double spaces.                                                                                                                                                                                                                                                                                                             |
| `di{` multiline    | Preserves bracket lines (`a{\n}b`)                      | Fixed in fork                                              | Fork deletes inner content lines only, keeping opening/closing bracket on their own lines.                                                                                                                                                                                                                                                                                                                        |
| `dj`/`dk` boundary | No-op at document start/end                             | Fixed in fork                                              | Fork returns null from `moveByLines` when `j`/`k` can't move to a different line.                                                                                                                                                                                                                                                                                                                                 |
| `:s` cursor        | First non-blank of last affected line                   | Fixed in fork                                              | Fork's `doReplace` positions cursor at first non-blank instead of column 0.                                                                                                                                                                                                                                                                                                                                       |
| `%` + strings      | Skips brackets in string/comment tokens                 | Fixed in fork (string-aware `scanForBracket`)              | Fork's `moveToMatchedSymbol` aborts when the first bracket is in a string, and `scanForBracket` now skips brackets in string/comment tokens during matching. In Markdown, Lezer does not classify double-quoted text as string tokens, so the `(a")"b)` test case remains a deviation in Markdown context only.                                                                                                   |
| `db` cross-line    | Includes leading whitespace when crossing lines         | Fixed in fork                                              | Fork expands delete range to include whitespace-only prefix before cursor when delete crosses a line boundary.                                                                                                                                                                                                                                                                                                    |
| `da"` whitespace   | Deletes quotes and adjacent whitespace                  | Fixed in fork                                              | Fork's `findBeginningAndEnd` now consumes trailing whitespace (or leading if no trailing) after inclusive quote expansion, matching Neovim's `a"` behavior.                                                                                                                                                                                                                                                       |
| `:join` cursor     | Cursor at column 0 of joined line                       | Fixed in fork                                              | Fork's ex command handler sets cursor to `(line, 0)` after join.                                                                                                                                                                                                                                                                                                                                                  |
| `:global` cursor   | Cursor at last matched line after `:g/pattern/d`        | Fixed in fork                                              | Fork sets cursor to last matched line (clamped to document end) after line-deleting `:g` commands. Non-destructive `:g` leaves cursor where the last sub-command placed it.                                                                                                                                                                                                                                       |
| `:s` empty         | Repeats last pattern with default flags (no `/g`)       | Fixed in fork                                              | Fork's `:s` without arguments no longer preserves the `/g` flag from the previous substitution.                                                                                                                                                                                                                                                                                                                   |
| `gj`/`gk` widgets  | Navigates into replaced decorations                     | Fixed in fork                                              | Fork's `findPosV` detects multi-line jumps from `moveVertically` and steps one document line when a replaced widget decoration is present (e.g. rendered MathJax). Tall-but-unreplaced lines (e.g. headings with larger font) are excluded from the widget-step heuristic via `dec.point` decoration type checking. A `posAtCoords` fallback corrects goalColumn misresolution on decorated lines.                |
| `gk` frontmatter   | Navigates into frontmatter like `k`                     | Fixed in fork                                              | Fork's `moveByDisplayLines` now checks `focusBefore` on the `findPosV` result, matching the existing check in `moveByLines`. The `stuckAtBoundary` condition uses `range.head === startOffset` to avoid false positives on wrapped lines — `gk` navigates wrapped display lines first and only enters properties from the topmost display line. Users who remap `k` to `gk` can now enter frontmatter navigation. |

## ~~Visual mode on single-character text objects~~ (Fixed)

**Status**: Fixed via formatting mark suppression.

`vi*` on `*x*` previously selected `*` (the delimiter) instead of `x` (the content). The root cause was Live Preview cursor snapping: Obsidian uses `Decoration.replace({})` to hide formatting marks (`*`, `**`, `_`, `~~`, etc.) on inactive lines, creating zero-width gaps. When the cursor was placed inside formatted text, CM6's position mapping snapped to the delimiter boundary instead of the intended content position.

Fixed by suppressing `Decoration.replace({})` for formatting mark characters via `RangeSetBuilder.prototype.add` patching (same pattern as the table widget suppressor in `table-widget-suppressor.ts`). The formatting characters remain in the DOM and are hidden via CSS (`color: transparent`) on inactive lines. This preserves their positional space, preventing cursor snapping. On the active line, Obsidian's own CSS reveals the marks normally.

## Formatting mark suppression in Live Preview

The plugin suppresses Obsidian's `Decoration.replace({})` for markdown formatting marks (`*`, `**`, `_`, `__`, `` ` ``, `~~`, `==`) to prevent cursor snapping when navigating into formatted content. The suppression uses the same `RangeSetBuilder.prototype.add` monkey-patching pattern as the table widget suppressor.

A `StateField` tracks the current document so the `RangeSetBuilder.add` interceptor can read the text at each decoration's range and match it against known formatting marks. Only empty replace decorations (no widget) covering 1–2 characters of matching text are suppressed.

CSS styling in `styles.css` hides the now-visible formatting marks on non-active lines:

```css
.cm-vimMode .cm-line:not(.cm-active) .cm-formatting {
    color: transparent !important;
}
```

On the active line (`.cm-active`), Obsidian's own CSS reveals the marks normally. This maintains the visual appearance of Live Preview while ensuring correct cursor positioning for vim operations.

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
