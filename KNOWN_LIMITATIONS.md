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

## Cross-note jump list

**Status**: Implemented.

The jump list tracks cursor positions across different notes, allowing you to navigate back and forth through your jump history using `<C-o>` and `<C-i>`. Jumps are recorded on cross-note navigation via `gd`/`gD`, picker file selection (all 12 sources), harpoon, oil, hint mode, ex commands (`:e`, `:find`, `:tabnew`, `:buffer`, `:bfirst`/`:blast`), structural buffer cycling (`]b`/`[b`), and Lua `vim.cmd("e ...")`. Standalone EasyMotion jumps are also recorded. Within-buffer jumps (G, gg, /, ?) are handled by the fork's built-in jump list and delegate to the original `jumpListWalk` action.

The plugin-level jump list is cross-note only — it stores `{ filePath, line, ch }` entries and only records when the source and destination files differ. The `jumpListWalk` action override peeks at the next entry: if it points to a different file, the override navigates cross-note; otherwise, it delegates to the fork's within-buffer handler.

New settings: `set jumplist` / `set nojumplist` (boolean, default true), `set jumplistsize=N` (number, default 200). Persists across sessions via `saveData()`. Handles file rename/delete via `vault.on('rename')`/`vault.on('delete')`.

`:jumps` ex command displays the jump list in a `VimInfoModal`.

**Remaining limitations**:

- **Cross-window (popout) jumps**: The jump list tracks positions across notes within the main Obsidian window but does not yet support jumps between the main window and popout windows.
- **E2E test coverage for cross-note `<C-o>`/`<C-i>`**: The embedded table widget tests for two-Escape, entry modes, and register sharing require the CM6 table widget rendering pipeline to fully activate through `registerEditorExtension` in the WDIO test environment. This lifecycle does not complete in the headless test environment, so these tests are skipped. The features are verified via manual testing. The `jumpListWalk` action override and within-buffer jump delegation are covered by passing E2E tests.

## Table cell vim modality (embedded mode)

**Status**: Implemented.

Cell editors in embedded table widget mode (`set tablewidget=embedded`) now support full vim modality:

- **Two-Escape pattern**: First Escape exits insert → normal mode within the cell editor. Second Escape exits the cell editor back to table-nav mode. This replaces the previous behavior where a single Escape immediately closed the cell editor.
- **Entry mode semantics**: `i` enters insert mode at cell start, `a` appends at cell end, `c` clears cell content and enters insert, `s` substitutes cell content (same as `c` for cells).
- **Register sharing**: Vim registers are shared between cell editors and the main editor via the fork's `vimGlobalState` singleton. Yank in one cell, paste in another.
- **Status bar sync**: The mode tracker reads vim mode from the cell editor's CM6 instance when a cell editor is active, so the status bar reflects the cell editor's mode (insert/normal/visual).
- **`ir`/`ar` table row text objects**: `ir` selects inner row content (between first and last `|`, excluding pipes), `ar` selects the entire row including pipes. Works in raw markdown mode only — inside cell editors, the content doesn't match `TABLE_RE` so these are no-ops (correct behavior).

**Implementation notes**:

- The Escape handler in `embeddable-editor.ts` uses the `adapter.state.vim.mode` pattern (proven in `table-format-on-exit.ts`) to check vim mode. When the cell editor is in normal mode, Escape fires `onEscape()` to exit. When in insert/visual mode, Escape returns `false` to let the vim extension handle the mode transition.
- Entry mode dispatch uses `vim.handleKey(adapter, key)` deferred via `setTimeout(fn, 0)` to ensure the vim extension has initialized on the cell editor's CM6 instance before dispatching keys.
- The `ir`/`ar` text objects follow the `tableCellTextObject` pattern: return `[VimPos, VimPos]` range, branch on `motionArgs.textObjectInner`, call `adjustRangeForVisualMode()`.

**Remaining limitations**:

- **Cross-cell vim motions**: `w` at end of cell does not jump to the next cell. Motions stop at cell boundaries. Tab/Shift-Tab navigate between cells.
- **Visual block mode across cells**: `<C-v>` operates within a single cell editor only.
- **Ex commands from cell editors**: `:w` saves the main document (expected). `:q` closes the main tab (documented as expected behavior for v1).
- **Fine-grained undo**: Cell edits are atomic in the main document's undo stack. Individual keystrokes within a cell editor are not separately undoable in the main editor.
- **Live Preview rendering in cell editors**: Cell editors use Obsidian's internal `ScrollableMarkdownEditor`, which renders in Live Preview mode. Markdown syntax such as wikilink brackets (`[[` `]]`) and formatting marks (`**`, `*`, `` ` ``) is hidden during editing. The underlying text is preserved. Forcing raw source mode would require modifying undocumented Obsidian internals.
- **Cell editor cursor shapes**: Cell editors pass `cursorShapes` from plugin settings to the vim extension. The cell editor's CM6 instance does not reliably receive `.cm-focused` from Obsidian (the focus stays on the table widget's DOM), so a dynamic stylesheet (via `document.adoptedStyleSheets`) generates cursor CSS from the user's configured cursor shapes, forcing the correct appearance regardless of focus state. Changes to cursor shape settings (via Settings UI, `set guicursor` in vimrc, or Lua `vim.opt`) take effect on the next cell editor opened.
- **Visual mode highlighting in cell editors**: Entering visual mode (`v`) in a cell editor does not show selection highlighting. The selection collapses when navigating with motions. This is caused by the cell editor's CM6 instance not receiving `.cm-focused`, which triggers the fork's `hideNativeSelection` theme rule (`.cm-vimMode:not(.cm-vimVisual) .cm-line ::selection { background-color: transparent }`) to suppress native selection rendering, while the fork's `linewiseVisualHighlight` plugin relies on the editor being focused to draw custom selection decorations. ([#19](https://github.com/saberzero1/motions/issues/19))
- ~~**Wikilink and formatting loss after cell edit**~~: Fixed. Two issues: (1) the cell editor read the cell's initial value from `wrapper.textContent` (the rendered DOM), which strips markdown syntax — `[[note-a]]` became `note-a`. Now reads raw markdown from the document source via `getCellDocumentRange()`. (2) On cell editor close, the cell content was restored as plain `textContent` without re-rendering. Now uses `MarkdownRenderer.render()` to restore proper inline formatting (wikilinks, bold, italic, code) after the editor is destroyed. ([#19](https://github.com/saberzero1/motions/issues/19))

## EasyMotion operator-pending mode

**Status**: Working via fork's async motion support.

`d<leader><leader>w{label}` (delete to an EasyMotion target) works natively through the codemirror-vim fork's async motion system. EasyMotion motions are registered via `defineMotion` and return a `Promise<Pos>`. The fork's `evalInput` resolves the promise and applies the pending operator (`d`, `c`, `y`) to the resulting position.

Visual mode (`v` + easymotion) also works — the fork updates the visual selection head/anchor when an async motion resolves during visual mode.

**Remaining limitations**:

- ~~Dot-repeat (`.`) does not replay operator-pending easymotion operations~~ — Fixed. The fork now stores the resolved async motion position as a relative offset in `lastEditInputState._asyncMotionTarget`. During dot-repeat, `repeatLastEdit` applies the operator with the stored offset instead of re-executing the async motion overlay.
- Char-based easymotions (`f`, `F`, `s`, `t`, `T`) in operator-pending mode require an intermediate search-character keypress which adds complexity to the async flow

**Test coverage**: `test/specs/easymotion-comprehensive.e2e.ts` validates d/c/y + easymotion flows.

## EasyMotion labels in Live Preview

EasyMotion target scanning uses `cm.getLine()` which returns raw document text, including markdown syntax hidden by Live Preview (e.g., the URL in `[text](url)`, formatting marks like `**`). Targets inside hidden text are filtered out by `filterVisibleTargets()` in `src/easymotion/overlay.ts`, which calls `coordsAtPos()` for each target and deduplicates positions that resolve to the same pixel coordinates (within 2px tolerance). When text is hidden by a replace decoration, all offsets within the hidden range map to the decoration boundary, producing duplicate coordinates.

This approach is decoration-source-agnostic — it works for any type of hidden text (links, formatting, embeds, third-party plugins) without needing to query specific decoration sets. The tradeoff is that two genuinely distinct targets at nearly identical pixel positions (e.g., adjacent zero-width characters) would be deduplicated. In practice, this does not occur with normal text.

Label collision detection in `renderLabels()` ensures that labels for nearby visible targets do not overlap. When a new label's bounding box intersects a previously placed label, it is offset vertically below it. Label dimensions are estimated from the CSS (14px monospace font, 1px 3px padding).

## ~~Block cursor displays wrong character after editor refocus~~ (Fixed)

**Status**: Fixed in the codemirror-vim fork. ([#71](https://github.com/saberzero1/motions/issues/71))

When the editor lost and regained focus (e.g., opening/closing DevTools, switching windows), the vim block cursor could display the wrong character. This occurred because Obsidian's Live Preview re-expands hidden markdown formatting (like `## ` in headings) when the editor regains focus, but the block cursor's `requestMeasure` ran in the same animation frame — before the browser reflowed the newly expanded decorations. `coordsAtPos()` returned stale layout coordinates from the pre-reflow DOM, causing the cursor to render the character from the old visual position.

Fixed with two changes in the fork:

1. `BlockCursorPlugin.update()` now includes `update.focusChanged` in its redraw trigger, ensuring the cursor re-measures on focus transitions.
2. On focus gain, a deferred `requestAnimationFrame` schedules a second `requestMeasure` that runs after the browser has reflowed the decoration DOM changes.

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

Delimiters inside fenced code blocks are excluded from the scan — the scanner skips lines within ` ``` ` fences. Indented code blocks and inline code are not excluded. Fenced code blocks inside blockquotes (` > ``` `) are now detected — `findFenceLines` matches fences with blockquote prefixes (`/^(?:>\s*)*```/`) and ensures open/close fences have matching blockquote depth.

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

Auto-format: ~~typing `|` in insert mode on a table line triggers automatic column realignment~~ — replaced with format-on-exit. Tables are now automatically realigned when the cursor leaves the table range after editing. No formatting happens mid-edit, so the cursor stays where you expect it. Typing `||` on a new line within a table generates a separator row matching the header's column count. Manual realignment is available via `<Leader>tr` or `:tablerealign`. ([#66](https://github.com/saberzero1/motions/issues/66), [#67](https://github.com/saberzero1/motions/issues/67))

~~Typing `|` moves cursor to the left of `|`~~ — Fixed. The mid-edit `|` interception that caused cursor jumps has been removed. ([#66](https://github.com/saberzero1/motions/issues/66))

~~Escaped `\|` characters treated as cell boundaries during editing~~ — Fixed. Escaped pipes, wikilinks (`[[page|alias]]`), and other `|`-containing inline syntax are no longer mishandled during table editing because the auto-format no longer runs mid-edit. ([#67](https://github.com/saberzero1/motions/issues/67))

The following are intentionally not implemented:

- **`j`/`k` column tracking**: Vim's `defineMotion` has no fall-through mechanism. Overriding `j`/`k` to detect tables on every keypress is fragile and would break normal line navigation if the detection is wrong. Users can add `nmap <Tab> ]|` to their vimrc if they want Tab-based cell navigation.
- **`Tab`/`Shift-Tab`**: These conflict with Obsidian's built-in table Tab handling and insert-mode tab completion.

## Table widget suppression in Live Preview

By default (cursor-aware mode), tables display as themed HTML when the cursor is outside and switch to raw Markdown when the cursor enters the table. The rendered table is a read-only `TableRenderWidget` produced by the plugin (not Obsidian's interactive table editor), using Obsidian's CSS classes (`cm-embed-block`, `markdown-rendered`, `table-wrapper`, `table-cell-wrapper`) for theme compatibility. Cell content is rendered through `MarkdownRenderer.render()`, so inline formatting (bold, italic, code), images, links, and math expressions display correctly in the rendered widget. When the cursor enters the table range, the widget is removed and raw Markdown is editable with full vim support.

The suppression works by intercepting CM6's `RangeSetBuilder.add` and skipping the replace-decoration that would create Obsidian's table widget. Detection uses the `cm-table-widget` class on the widget's container element. Non-table widgets (math, code blocks, embeds) are not affected. In cursor-aware mode, the plugin provides its own `Decoration.replace` via a `StateField` for tables the cursor is NOT in.

`MarkdownRenderer.render()` is asynchronous — cell content initially appears as plain text and is replaced by the rendered output when the promise resolves. In practice this is near-instantaneous. A `Component` is created per widget instance and unloaded in `destroy()` to prevent leaked event listeners. The `editorInfoField` provides the `App` instance and the active file's `sourcePath` for correct relative image path resolution.

**Always raw mode**: Set to "Always raw" to keep tables as plain Markdown at all times. Useful when cursor-aware rendering causes issues or when you prefer to always see the raw table syntax.

**Embedded mode**: Set to "Embedded" for per-cell table editing with a two-layer interaction model. The table renders as themed HTML. Moving the cursor into the table activates table navigation (`h`/`j`/`k`/`l` to move between cells). Press `i`/`a`/`c`/`s`/`Enter` to open a vim-enabled editor in the highlighted cell. `Escape` returns to table navigation; a second `Escape` exits the table. `j`/`k` at the top/bottom row exits the table. Structural commands (`o`, `O`, `dd`, `dc`, `J`, `K`, `H`, `L`, `I`, `A`, `=`) manipulate rows and columns directly on the raw markdown. Cell edits are written back per-cell — each edit is a separate undo operation. ~~Cell edits were not rendered immediately — changes only appeared after switching cells or leaving the table.~~ Fixed: the D12 guard is now cleared before the cell edit dispatch, so the table widget rebuilds immediately. ([#61](https://github.com/saberzero1/motions/issues/61)) Embedded mode only activates in Live Preview. ~~Cells containing escaped pipes (`\|`) may produce incorrect write-back due to pipe-based boundary parsing.~~ Fixed: all pipe-boundary detection now uses escape-aware parsing via `findUnescapedPipes()` / `splitCellsEscapeAware()` in `table-utils.ts`. Escaped pipes (`\|`) are correctly treated as cell content, not boundaries. `\\|` (escaped backslash + real pipe) is correctly treated as a boundary via backslash-parity checking. Tab/Shift-Tab moves between cells during cell editing.

**"Off" mode**: Set to "Off" in **Settings → Vim Motions → Table widget in live preview** to restore Obsidian's default table rendering. On Obsidian 1.12.7, the native table widget renders as static HTML — cells are not individual `EditorView` instances and have no `contenteditable` attribute. Clicking a cell does not focus inside the widget; typing has no effect. Vim keybindings in the main editor conflict with this static widget, resulting in broken navigation and missing cursor/mode display ([#19](https://github.com/saberzero1/motions/issues/19)). This is an Obsidian-side limitation — the plugin cannot inject vim into the native widget's cells because no per-cell editors exist to augment. Use **Embedded** mode for vim-enabled table editing, or **Cursor-aware** / **Always raw** mode for raw markdown editing.

**Table manipulation commands** (`<Leader>t` prefix and ex commands like `:tablerowafter`) call Obsidian commands via `executeCommandById`. These may not work when the table widget is suppressed, since Obsidian's table commands expect the interactive widget to be present. Use Source mode table editing or manual Markdown editing instead.

**Third-party decoration conflicts**: Plugins that apply `Decoration.mark` decorations globally (e.g., [aDHL — Another Dynamic Highlights](https://github.com/tine-schreibt/aDHL)) can conflict with the table widget's `Decoration.replace` when both target the same document range. The table widget uses `Prec.high()` to ensure its replace decoration takes precedence over default-priority marks from other plugins during CM6's decoration merging. If a third-party plugin escalates its own decorations to `Prec.high()` or `Prec.highest()`, the conflict may resurface. This is a fundamental CM6 limitation — there is no mechanism for one plugin to query or yield to another plugin's decorations. ([#55](https://github.com/saberzero1/motions/issues/55))

**First-render learning lag**: On the very first load after plugin install, the suppressor needs to observe one table widget render to learn its constructor. The first table may briefly flash as a widget before being suppressed on the next render cycle. This one-time learning is cached for the session.

## Vimrc soft-reload

Vimrc maps and settings are soft-reloaded when the vimrc file is modified — changes to `nmap`, `set`, and other map/setting commands take effect without reloading the plugin. The plugin watches the vimrc file via `vault.on('modify')` and re-applies maps and settings on change.

**Limitation**: `exmap` definitions (custom ex commands defined via `exmap name command`) are only parsed during the initial load. Adding new `exmap` entries requires a plugin reload. Existing `exmap` definitions survive soft-reload.

### Config file resolution

The plugin searches the vault root for config files using a fallback chain (first match wins):

**Vimrc**: `vimrc`, `.vimrc`, `init.vim`, `.init.vim`, `obsidian.vimrc`, `obsidian.vim`, `.obsidian.vimrc`, `.obsidian.vim`

**Lua**: `init.lua`, `.init.lua`, `obsidian.init.lua`, `.obsidian.init.lua`, `obsidian.lua`

Non-dotfile names are preferred because Obsidian Sync skips dotfiles. The `.obsidian.*` variants are last in the chain for backward compatibility.

A custom path can be set via **Settings → Vim Motions → Vimrc & key bindings → Custom vimrc path** (or Custom init.lua path). When set, the custom path is used directly and the fallback chain is skipped. The setting provides file-suggest autocompletion. The settings UI shows which file is currently in use ("Currently using: {path}") or a not-found warning for invalid custom paths. ([#34](https://github.com/saberzero1/motions/issues/34))

**External paths (desktop only)**: Custom paths can be absolute filesystem paths (e.g. `~/.config/obsidian/init.lua`, `C:\Users\<you>\.config\obsidian\vimrc`). Paths starting with `/`, `~`, or a Windows drive letter are read directly from the filesystem via `window.require('fs/promises')` instead of `app.vault.adapter.read()`. Tilde (`~`) is expanded to `os.homedir()`. This enables sharing a single config file across multiple vaults. On mobile, absolute paths are not supported — the plugin falls back to vault-relative paths only. ([#51](https://github.com/saberzero1/motions/issues/51))

Changing the custom path in settings triggers `reloadFeatures()` (the path is in `RELOAD_KEYS`), but a full vimrc re-parse requires reloading the plugin — the same limitation as editing the vimrc file itself.

### Config load notifications

On startup, the plugin shows an Obsidian Notice when vimrc or init.lua files are loaded. The notification behavior depends on the configuration mode and file state:

| Condition                                        | Notification                                                | Suppressible |
| ------------------------------------------------ | ----------------------------------------------------------- | ------------ |
| File loaded successfully (N commands)            | `"loaded N command(s) from {path}"`                         | Yes          |
| File loaded but empty (0 commands)               | `"{path} loaded but contained no commands"`                 | Yes          |
| File not found in single mode (`lua` or `vimrc`) | `"not found (searched {path})"`                             | No           |
| Both files missing in dual mode (`lua-vimrc`)    | `"no config files found (searched {vimrcPath}, {luaPath})"` | Yes          |
| Lua syntax/runtime error                         | `"error loading {path}: {error}"`                           | No           |

"Not found" in single mode (`configMode` is `lua` or `vimrc`) always shows because the user explicitly chose that mode but has no matching file — this indicates a misconfiguration. "Not found" in dual mode (`lua-vimrc`) is suppressible because having neither file is a valid default state.

Notifications can be suppressed via **Settings → Vim Motions → Vimrc & key bindings → Show config load notifications** (default: on). Error notifications and single-mode "not found" warnings always show regardless of this setting.

### Vim engine settings

Vim engine settings (clipboard, tabstop, shiftwidth, expandtab, insertmodeescape, insertmodeescapetimeout, textwidth) changed via **Settings → Vim Motions → Vim engine** now take effect immediately — each setting's `onChange` handler calls `vim.setOption()` to push the value to the vim engine in addition to persisting it to disk. Previously, these settings only saved to disk and required an Obsidian reload to take effect (the vimrc code path always worked because it called `vim.setOption()` directly). ([#39](https://github.com/saberzero1/motions/issues/39))

Settings-based clipboard and textwidth values are now re-applied on plugin load from saved settings. Previously, these values were only pushed to the vim engine when the user actively changed them in the Settings UI or when a vimrc/Lua config file set them — restarting Obsidian would lose the vim engine state even though the setting was saved to disk. ([#56](https://github.com/saberzero1/motions/issues/56))

Options that require side effects (clipboard → `setClipboardOption()`, textwidth → `setTextwidth()`, guicursor → `parseGuicursor()`) use a `SideEffectOpt` type in the `KNOWN_SET_OPTIONS` table. This ensures all three code paths (vimrc `set`, Lua `vim.opt`, and initial settings load) invoke the same side-effect callback — eliminating the class of bug where an option works in vimrc but silently fails in Lua or vice versa.

The initial settings load during `onload()` is guarded by an `initializing` flag that suppresses `reloadFeatures()` and gutter reconfiguration side effects until `onload()` completes. Without this guard, the settings restoration loop triggers premature `reloadFeatures()` calls that create resources (VimModeTracker, GlobalKeyHandler) before `onload()` creates its own — leading to duplicate status bar elements and orphaned event listeners. The guard follows the same pattern as `vimrcLoading`/`luaLoading`. ([#63](https://github.com/saberzero1/motions/issues/63))

## ~~Scrolloff line height assumption~~ (Fixed)

Scrolloff now uses `EditorView.defaultLineHeight` to dynamically measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height. Note: `defaultLineHeight` returns an average line height — documents with mixed-height lines (e.g., headings with larger fonts) may not have pixel-perfect scrolloff distances.

The scrolloff value accepts 0–9999 (previously capped at 20). Setting `set scrolloff=999` in your vimrc keeps the cursor vertically centered while scrolling, matching standard Vim behavior. The Settings UI uses a validated number input field instead of a slider. The scroll margin is clamped to half the viewport height at runtime, mirroring Vim's silent cap of `scrolloff` to `(window_height - 1) / 2`. ([#40](https://github.com/saberzero1/motions/issues/40), [#48](https://github.com/saberzero1/motions/issues/48))

## ~~Absolute line number highlight not updating on cursor movement~~ (Fixed)

**Status**: Fixed. `lineMarkerChange` now includes `update.selectionSet` in absolute mode. ([#68](https://github.com/saberzero1/motions/issues/68))

When only absolute line numbers were enabled (`set number` without `set relativenumber`), the `vim-motions-line-num-current` CSS class (bold highlight on the current line number) did not update when the cursor moved. The highlight stayed stuck on whichever line was current when the document was last modified, only updating incidentally when entering special content (MathJax, images) that triggered `docChanged` or `viewportChanged`.

Root cause: the `lineMarkerChange` callback in the CM6 `gutter()` configuration — in both the standalone line number gutter (`src/vim/line-number-gutter.ts`) and the unified `statuscolumn` gutter (`src/vim/statuscolumn.ts`) — returned `update.docChanged` (without `update.selectionSet`) when the mode was absolute-only. This was an optimization assuming the displayed text doesn't change on cursor movement (true for absolute numbers), but it forgot that the `isCurrent` flag on each `LineNumberMarker` also changes — without a re-render, the CSS class was never added/removed. Relative and hybrid modes were unaffected because they already included `update.selectionSet` (the displayed numbers change on every cursor move).

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

Options like `ignorecase`, `smartcase`, `hlsearch`, `incsearch`, and `wrap` are not implemented because they require CodeMirror-level integration beyond what `Vim.defineOption` provides.

`signcolumn` accepts `auto`, `auto:N`, `yes`, `yes:N`, `no` (N = 1–4, character slots). `auto` shows the sign column when marks exist and hides it when empty (causes layout shift, matching Neovim). `yes` always reserves gutter space. Clicking a mark label in the sign column moves the cursor to that line. Global marks (`A`–`Z`) render in a distinct color from local marks (`a`–`z`). `cursorlineopt=screenline` is not supported.

`linenumbermode` is deprecated in favor of `statuscolumn`. `linenumbermode=dual` internally sets `statuscolumn="%l %r"`. Changing `linenumbermode` requires an Obsidian restart.

`statuscolumn` provides a format string for customizing the gutter layout. Supported tokens: `%l` (line number respecting `number`/`relativenumber`, absolute fallback when both off), `%r` (relative number), `%s` (sign column marks, respects `signcolumn` auto/yes/no and width), `%C` (fold indicators, always active when present), `%=` (flex separator), literal text. When `statuscolumn` is set, all individual gutter columns are hidden — the unified gutter replaces them. When empty (default), individual settings manage gutters independently. Changing `statuscolumn` requires an Obsidian restart — the unified gutter compartment is registered during plugin load. Set `statuscolumn` in your Lua config (`vim.opt.statuscolumn = "%s %l %r %C"`) for it to apply on startup. v1 limitations: no `%{expr}` Lua expressions, no `%#HlGroup#` highlight groups, no width specifiers (`%-5l`), no per-window `statuscolumn`, no `v:virtnum` for wrapped lines. Global only (`vim.opt.statuscolumn`). Invalid format strings silently fall back to empty (plugin-managed gutters).

Unknown `set` options are silently ignored (no error, no effect).

## `nmap L $` may not work via vimrc

`nmap L $` (mapping `L` to end-of-line) may not work when loaded from `.obsidian.vimrc` in some environments. Investigation (spike17, Diag 6) found that the mapping mechanism itself works correctly — `Vim.map('L', '$', 'normal')` at runtime successfully maps `L` to `$` and `handleKey('L')` moves to end-of-line. The issue is a vimrc file I/O timing problem: the `loadVimrc` function sometimes reads an empty or missing file during the `active-leaf-change` lifecycle, resulting in `vimrcCommandCount: 0` and an empty deferred maps array.

Diagnostic findings (spike17 Diag 6):

- `Vim.map('L', '$', 'normal')` works at runtime — `handleKey('L')` moves to ch:15 (end of line)
- `handleEx('nmap L $')` works at runtime — identical result
- `getKeymap('normal')` shows the `L → $` entry after runtime application
- After vimrc load, `vimrcMaps` is empty and `vimrcCommandCount` is 0 — the file was not read successfully
- The mapping mechanism (`ExCommandDispatcher.map`, `_mapCommand`, `doKeyToKey`) is correct — the issue is in file I/O timing during the `active-leaf-change` handler

Mitigation (multi-layered):

1. **`stat()` readiness probe**: `readVimrcFile` now calls `app.vault.adapter.stat(path)` before `read()` to verify the file exists in the vault index. This avoids attempting reads on non-existent files and provides `stat.size` to distinguish genuinely empty files from timing-empty reads.
2. **Two-phase parsing**: File reading/parsing is decoupled from command application. `readAndParseVimrcFile` parses the vimrc without needing a CM adapter; `applyVimrcCommands` applies all commands, deferring cm-dependent ones to `pendingExCommands`.
3. **Smart retry with backoff**: When `stat.size > 0` but `read()` returns empty (timing issue), retries with exponential backoff (50ms, 100ms, 200ms, 400ms — 750ms total). Genuinely empty files (`stat.size === 0`) skip retries entirely.
4. **User-facing Notice on exhaustion**: If all retries fail on a non-empty file, a Notice is shown: "Vim Motions: vimrc found but could not be read — try reloading the plugin." This surfaces the issue for user reports.
5. **`vimrcLoading` try/finally**: The `vimrcLoading` flag is now reset in a `finally` block, so a failed `loadVimrc()` call no longer permanently blocks future retry attempts on subsequent `active-leaf-change` events.
6. **Lua loader parity**: The same `stat()`+retry pattern is applied to `readLuaFile()` in `src/lua/loader.ts`, which previously had no retry logic at all.

Workaround: if vimrc mappings are not applied despite the improved retry mechanism, reload the plugin via **Settings → Community plugins** (disable then enable). At runtime, mappings can be applied via Obsidian's developer console: `CodeMirrorAdapter.Vim.map('L', '$', 'normal')`.

## `set textwidth` via vimrc may not affect `gq`

`set textwidth=20` in `.obsidian.vimrc` may not change the wrap width used by the `gq`/`gw` operators if the vimrc file is not loaded successfully (same file I/O timing issue as `nmap L $` — see improved retry mechanism above). The `textwidthSetExplicitly` guard in `options.ts` correctly prevents CM Vim's `defineOption` callback from resetting the value when the vimrc does load successfully.

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

The overlay adds `padding-bottom` equal to Obsidian's status bar height so that keybinding rows are not hidden behind the status bar. In horizontal split views, the padding is only applied when the editor pane's bottom edge is adjacent to the status bar — top panes (whose bottom edge doesn't reach the status bar) show no extra padding. The global which-key (workspace navigation) always applies the padding since it spans the full workspace.

### Sort order

Configurable via **Settings → Vim Motions → Which-key sort order**, `vim.opt.whichkeysort` in Lua, or `set whichkeysort=<order>` (alias `wks`) in vimrc. Two modes:

- **which-key** (default) — matches which-key.nvim defaults: individual keys first, groups last, alphanumeric keys before special keys (`<…>`), natural alphabetical tiebreaker, lowercase before uppercase.
- **Groups first** — groups appear before individual keys, both categories sorted alphabetically.

### Icons

Configurable via **Settings → Vim Motions → Which-key icons**, `vim.opt.whichkeyicons` in Lua, or `set whichkeyicons` in vimrc (default: on).

When enabled, Lucide icons appear next to entries in the which-key popup, rendered via Obsidian's `setIcon()` API. The column layout matches which-key.nvim: key → separator (➤) → icon → description. Icons use `stroke="currentColor"` and are colored via the CSS `color` property on the icon span.

Icons and colors can be assigned per group label and per command label via Settings UI, Lua API (`vim.obsidian.whichkey.set_group/set_label/add` with `icon` and `color` opts), or vimrc (`whichkeygroup <leader>t Table icon=table color=blue`). 8 named Obsidian colors (`red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`) map to `var(--color-<name>)` CSS variables. Arbitrary CSS color strings are also accepted (sanitized against injection). Default icon color is `--text-muted`.

Built-in groups register default icons: Table (`table`, blue), EasyMotion (`zap`, yellow), Harpoon (`anchor`, orange). User-configured icons override defaults via the standard priority merge (Lua > vimrc > Settings).

When icons are enabled, rows without an assigned icon receive an empty spacer span to maintain column alignment across all rows. When icons are disabled globally, no icon spans or spacers are rendered.

### Grouping

When **Which-key leader grouping** is set to "Grouped" (default), bindings sharing a common prefix key are collapsed into a single group entry (e.g. `t` → `Table (+11)`). Pressing the group key drills down to show only the bindings within that group. Groups are sorted before ungrouped entries. Setting the mode to "Flat" restores the original behavior of listing all bindings individually.

Grouping applies to all completions — not just leader-scoped bindings. Any multi-key prefix (`g`, `z`, `[`, `]`, user-defined sequences) benefits from grouping when multiple completions share a next key.

### Group labels

Groups are labeled with a generic `+N keys` text by default. Custom labels can be configured via **Settings → Vim Motions → Which-key group labels** using the full key prefix:

- Leader-relative groups: use the leader character + prefix (e.g. `\t` for table commands under leader `\`)
- Non-leader groups: use the raw prefix (e.g. `gr` for the replace-with-register operator, `cs` for surround changes)
- `<leader>` token: expanded to the actual leader key (e.g. `<leader>t` resolves to `\t` with default leader)

Built-in features register default labels (Table, EasyMotion) that user entries can override. Whitespace in the prefix field is trimmed.

### ~~Descriptions not showing for Lua keymaps with space leader~~ (Fixed)

**Status**: Fixed. Key normalization unified between the codemirror-vim fork and the which-key overlay. ([#58](https://github.com/saberzero1/motions/issues/58))

`vim.keymap.set("n", "<leader>ff", function() ... end, { desc = "Find" })` with `vim.g.mapleader = " "` showed `lua-action-0` instead of `"Find"` in the which-key popup. String-action keymaps showed the raw command (e.g., `:Oil<CR>`), and built-in feature descriptions (EasyMotion, Harpoon) reverted to internal function names (e.g., `harpoonSelect1`).

Root cause: the codemirror-vim fork normalizes literal space characters to `<Space>` notation when storing keymaps (`_mapCommand` → `normalizeKeyString`), and `getCompletions()`/`getKeymap()` return keys in this normalized form. The fork's key event handler (`vimKeyFromEvent`) also emits `<Space>` for space bar presses. However, the which-key overlay stored label keys with literal spaces (from `replaceLeaderKey`) and compared the raw leader key character against `<Space>` event keys — all lookups missed. The leader-only which-key mode additionally never triggered with space as leader because `"<Space>" !== " "`.

Fix: added `normalizeVimKey()` mirroring the fork's `normalizeKeyString`, applied at label storage time in `rebuildWhichKey()` and at lookup time in `showLeaderBindings()`/`showCompletions()`. Added `normalizedLeaderKey` for key event comparison in `onKeyPressLeaderOnly()`.

### Automatic obcommand description resolution

Mappings to `:obcommand <id><CR>` or `:ob <id><CR>` without an explicit `desc` now auto-resolve to Obsidian's native command name in the which-key popup. For example, `vim.keymap.set("n", "<leader>r", ":ob app:go-back<CR>")` displays "Navigate back" instead of the raw `:ob app:go-back<CR>` string. This works for both editor which-key (leader bindings) and global which-key (`:gmap` bindings). Explicit `desc` options always take priority. Unknown command IDs (e.g., from uninstalled plugins) fall back to the raw string. Descriptions are automatically localized to match the user's Obsidian language setting. ([#62](https://github.com/saberzero1/motions/issues/62))

### Limitations

- **Function callbacks with `vim.cmd("ob ...")`**: When `vim.keymap.set` uses a function callback that calls `vim.cmd("ob ...")` or `vim.cmd("obcommand ...")`, the which-key popup cannot auto-resolve the Obsidian command name. Lua functions are opaque — the plugin cannot introspect the function body to extract the command ID. Use a string RHS (`:ob <id><CR>`) for auto-resolution, or provide an explicit `desc` option. See examples under "Mapping examples" in the Lua configuration docs.
- User-defined mappings via `Vim.map()` appear in completions but without friendly descriptions when the rhs is not an `:obcommand`/`:ob` pattern (shown as the raw rhs key sequence)
- The overlay does not show during macro playback or when a register prefix (`"a`) is pending
- Icon IDs are validated at render time — invalid icon names (not in Obsidian's Lucide bundle) result in an empty spacer; no error is thrown
- Icons in pop-out windows depend on `setIcon()` working with foreign `Document` objects — if Obsidian's API references `document` internally, icons may not render in pop-out windows

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

### `Editor-only ex commands`

The standalone ex command modal (`:` in non-editor views) supports 34 commands that don't require a CmAdapter. The following editor-dependent commands show "Not a global command" when invoked from the modal: `:e!`, `:saveas`, `:read`, `:marks`, `:delmarks`, `:changes`.

## Workspace navigation in plugin views

**Status**: Fixed. Two-level interception implemented. ([#47](https://github.com/saberzero1/motions/issues/47))

When workspace navigation is enabled, the global key handler uses a three-gate interception system:

- **Structural keys** (`<C-w>*`, `gt`/`gT`, `<C-o>`/`<C-i>`, `:`) — always intercepted in non-editor views, regardless of view type. These let you navigate between panes/tabs even in plugin views.
- **Content keys** (`j`/`k` scroll, count-prefix digits, `H`/`L`, scroll commands) — only intercepted in whitelisted view types (markdown, graph, pdf, canvas, empty, image, bases). In plugin views (Spaced Repetition, Excalidraw, etc.), these keys pass through to the plugin.
- **Hint keys** (`f`, `F`, `yf`, `df`) — intercepted unless an editor or input is focused.

**Trade-off**: In plugin views, pressing `g` followed by a standard-gated key (e.g., `gg` for scroll-to-top) will consume the keystrokes without effect, because the `g` prefix enters the handler due to structural completions (`gt`/`gT`). Use `<C-w>` sequences for workspace navigation in plugin views.

**Customization**: The view type whitelist can be overridden via **Settings → Vim Motions → Workspace navigation view types** or `set workspacenavviewtypes=markdown,graph,pdf,canvas,empty,image,bases` in vimrc.

## Hint mode actions

**Status**: Working. Hint mode supports multiple vimium-style actions with a context-appropriate split between editor and non-editor views.

### Non-editor context (GlobalKeyHandler)

When a non-editor view (graph, PDF, canvas, etc.) is focused, full vimium-style hint bindings are available:

| Key  | Action   | Behavior                                                                                                          |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `f`  | Activate | Click button, focus pane, navigate link, focus input                                                              |
| `F`  | Open new | Open target in new tab (Ctrl+Meta click for generic targets, `openLinkText` for links, `duplicateLeaf` for panes) |
| `yf` | Yank     | Copy URL for links, note path for tabs, display text for others                                                   |
| `df` | Close    | Close tab/pane via `leaf.detach()`; Notice for non-closeable targets                                              |

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

- `.workspace-leaf-content` → `pane` (focus via `setActiveLeaf`; `F` action duplicates the leaf into a new tab via `duplicateLeaf`)
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

The plugin is **disabled by default on mobile** (`enableOnMobile: false`). Most mobile users sync the plugin to their vault without a hardware keyboard attached, and the Vim engine puts the editor into Normal mode with no obvious way to return to typing (soft keyboards lack `Escape` and `:`). ([#52](https://github.com/saberzero1/motions/issues/52))

To enable: toggle **Settings → Vim Motions → Mobile → Enable on mobile**, or use the command palette: **Vim Motions: Toggle enable on mobile**. Both are accessible even when the plugin is disabled on mobile. A reload is required after changing the setting.

When disabled on mobile, the plugin's `onload()` returns early after registering only the settings tab and the toggle command. No editor extensions, event listeners, Vim engine initialization, or status bar elements are registered.

When enabled on mobile, EasyMotion and hint mode remain disabled because they depend on desktop-only Obsidian globals (`activeDocument`, `activeWindow`). All other features work, though on-screen keyboard users are further limited by Obsidian's soft keyboard, which does not support `:` and `/` command entry.

Features by platform:

| Feature                  | Desktop | Mobile (enabled) + physical keyboard | Mobile (enabled) + soft keyboard | Mobile (disabled) |
| ------------------------ | ------- | ------------------------------------ | -------------------------------- | ----------------- |
| Core Vim motions         | ✅      | ✅                                   | ⚠️ Limited                       | ❌ Off            |
| Text objects             | ✅      | ✅                                   | ⚠️ Limited                       | ❌ Off            |
| EasyMotion               | ✅      | ❌ Disabled                          | ❌ Disabled                      | ❌ Off            |
| Hint mode                | ✅      | ❌ Disabled                          | ❌ Disabled                      | ❌ Off            |
| Ex commands (`:w`, `:q`) | ✅      | ✅                                   | ❌ No `:` entry                  | ❌ Off            |
| Search (`/`, `?`)        | ✅      | ✅                                   | ❌ No `/` entry                  | ❌ Off            |
| Workspace nav (`<C-w>`)  | ✅      | ✅                                   | ❌ No modifier keys              | ❌ Off            |
| Global workspace nav     | ✅      | ❌ Disabled                          | ❌ Disabled                      | ❌ Off            |
| Status bar               | ✅      | ✅                                   | ✅                               | ❌ Off            |
| Vimrc                    | ✅      | ✅                                   | ✅                               | ❌ Off            |
| Settings                 | ✅      | ✅                                   | ✅                               | ✅                |
| Toggle command           | ✅      | ✅                                   | ✅                               | ✅                |
| Popout windows           | ✅      | N/A                                  | N/A                              | N/A               |

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

| Command            | Neovim behavior                                       | Obsidian behavior                                          | Reason                                                                                                                                                              |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Y`                | Mapped to `y$` by default                             | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                                                                   |
| `Q`                | Replay last recorded macro                            | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                                                           |
| `:wall` / `:wa`    | Save all modified buffers                             | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                                                             |
| `gf`               | Open file path under cursor                           | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                                                               |
| `zO` / `zC` / `zA` | Recursive fold open/close/toggle                      | Maps to the same action as `zo`/`zc`/`za`                  | CM6 has no recursive fold API. Obsidian markdown uses flat heading-level folds (not nested), so the non-recursive versions are functionally equivalent in practice. |
| `zn` / `zN`        | Fold none (disable folding) / fold normal (re-enable) | Not implemented                                            | Cannot disable Obsidian's fold gutter/arrows from plugin code.                                                                                                      |
| `it` / `at`        | HTML tag text objects (CM Vim native via XML mode)    | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown                                            |

## Select mode and Virtual Replace mode

- Select mode: `selectmode=mouse` does not work — permanent platform limitation. CM6 does not expose the low-level mouse event API needed to intercept mouse-initiated selections and convert them to select mode. `:smap`/`:sunmap` fallback to `:vmap` when no select-specific mapping exists (matches Neovim). `selectmode=key` and `keymodel=startsel` options are accepted but shifted cursor key behavior is not functional.
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
| `gj`/`gk` widgets | Navigates into replaced decorations | Fixed in fork | Fork's `findPosV` clamps any multi-document-line jump to ±1 when no fold is present. This handles both replaced widgets (MathJax) and variable-height lines (headings with larger fonts). `posAtCoords` resolves the horizontal position on the clamped target line. |
| `gj`/`gk` column | Preserves character column across lines | Pixel drift | Neovim preserves the character column (`curswant`) because all terminal characters are monospace. The fork preserves the pixel X coordinate (`goalColumn`) via `posAtCoords`, which maps to a different character index on heading lines (wider font). The round-trip (`gk gk gj gj`) returns to the exact starting column because the pixel X is preserved throughout. See "gk/gj column drift on heading lines" below. |
| `gk` frontmatter | Navigates into frontmatter like `k` | Fixed in fork | Fork's `moveByDisplayLines` now checks `focusBefore` on the `findPosV` result, matching the existing check in `moveByLines`. The `stuckAtBoundary` condition uses `range.head === startOffset` to avoid false positives on wrapped lines — `gk` navigates wrapped display lines first and only enters properties from the topmost display line. Users who remap `k` to `gk` can now enter frontmatter navigation. |

## ~~Visual mode on single-character text objects~~ (Fixed)

**Status**: Fixed. The formatting mark transaction filter that caused cursor snapping has been removed.

`vi*` on `*x*` previously selected `*` (the delimiter) instead of `x` (the content). The root cause was believed to be Live Preview cursor snapping from Obsidian's `Decoration.replace({})` hiding formatting marks. An `EditorState.transactionFilter` was introduced to compensate by snapping cursor positions away from formatting mark ranges.

Investigation (issue [#33](https://github.com/saberzero1/motions/issues/33)) found that the transaction filter was the **sole cause** of cursor snapping for double-character marks (`**`, `__`, `~~`, `==`). Empirical testing confirmed:

- On the active line, Obsidian uses `Decoration.mark` (not `Decoration.replace`) — formatting marks are real text nodes with full width in the DOM
- With the filter disabled, `h`/`l` movement through `**hi**` visits every position without skipping
- Mark visibility in Live Preview is controlled entirely by Obsidian based on cursor proximity, unaffected by the filter
- `vi*`, `di*`, `da*` and other text objects work correctly without the filter

The transaction filter, the `formattingMarkMode` setting, and the `formattingmarkmode` vim option have been removed.

~~**Permanent limitation: `ci*` in Live Preview**~~ — Investigation (spike27) found that `ci*` works correctly in Live Preview for multi-character content (`**bold text**` → `ci*` → type replacement → correct result). On the active line, Obsidian uses `Decoration.mark` (visible text nodes), not `Decoration.replace` — the cursor is not displaced by collapsed decorations. The original limitation was overstated based on early testing with a transaction filter that has since been removed.

**Test coverage**: `test/specs/text-objects.e2e.ts` — `ci*` unskipped and passing for multi-character bold content.

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

## ~~Visual-line mode highlight missing on replaced widget blocks~~ (Fixed)

**Status**: Fixed. Replaced widget blocks (MathJax, embeds, etc.) now receive visual-line highlight. ([#57](https://github.com/saberzero1/motions/issues/57))

In visual-line mode (`V`), the fork's `linewiseVisualHighlight` ViewPlugin uses `Decoration.line()` to apply `.cm-vim-linewise-selection` to each `.cm-line` element. When Obsidian's Live Preview replaces content with rendered widgets (block MathJax `$$`, note embeds `![[note]]`, plugin table widgets), the `.cm-line` elements are removed from the DOM and replaced by widget container elements. `Decoration.line()` silently drops decorations for lines inside replaced ranges, leaving those widget blocks visually unhighlighted during selection.

Fixed by adding a plugin-side `LinewiseWidgetHighlight` ViewPlugin (`src/vim/linewise-widget-highlight.ts`) that supplements the fork's line-level highlighting. On each CM6 update during visual-line mode, the plugin scans `contentDOM` direct children for non-`.cm-line` elements (widget containers), maps them to document positions via `view.posAtDOM()`, and toggles `cm-vim-linewise-widget-selection` on widgets whose document range overlaps the visual-line selection. The class is removed on mode exit and `destroy()`.

The fix is generic — it highlights any replaced widget type based on DOM structure (non-`.cm-line` direct child of `contentDOM` with non-zero height), not specific widget classes. `Decoration.mark()` was validated as non-viable (marks only wrap text content nodes, which replaced widgets lack). The fork's `linewiseVisualHighlight` remains unchanged.

**Test coverage**: spike24 (`spike24-visual-line-widget-highlight.e2e.ts`) — 12 tests covering MathJax, embed, and code block DOM structure discovery; visual-line highlight verification; decoration facet analysis; `posAtDOM()` reliability on MathJax and embed widgets; `Decoration.mark()` validation; and `update()` trigger verification during cursor-only selection.

## ~~Visual mode cursor displaced at end-of-line~~ (Fixed)

**Status**: Fixed in fork. Verified against Neovim 0.12.2 golden comparison.

In charwise visual mode (`v`), selecting the last character on a line caused the block cursor to render one character past the end of the visible line content. Two issues were identified and fixed:

1. **`exitVisualMode` cursor clipping** (`src/vim.js`): `exitVisualMode()` called `clipCursorToContent()` while `vim.visualMode` was still `true`. In visual mode, `clipCursorToContent` allows `ch = text.length` (the linebreak position). After clearing `vim.visualMode` on the next line, the cursor was already set one position past the last character. Reproducible as: `vlll<Esc>` on "abc" — `l` past the last char is allowed in visual mode, but Escape should clip back to normal-mode bounds (`ch = text.length - 1`). Fixed by clearing visual flags before `setCursor`, while preserving the `updateLastSelection` call order. ([#15](https://github.com/saberzero1/motions/issues/15))

2. **`measureCursor` EOL adjustment** (`src/block-cursor.ts`): The `letter != "\n"` comparison used loose equality (`!=`). When `head >= doc.length` (cursor past document end), the short-circuit `head < doc.length && sliceDoc(...)` produced `false`, and `false != "\n"` evaluated to `false` due to JS type coercion (both coerce to `0`). This caused the wrong branch to execute at document end. Fixed by producing `""` instead of `false` and using strict inequality (`!==`).

3. **`measureCursor` visual-block EOL step-back** (`src/block-cursor.ts`): After the `makeCmSelection` per-line clamping fix (issue #38), block selection heads legitimately land on newline positions (`head = lineLen`). The `else if (!vim.visualLine && !vim.visualBlock)` guard prevented the `head--` step-back in visual-block mode, causing the cursor to render one position past the last visible character. Fixed by removing `&& !vim.visualBlock` — visual-block now applies the same EOL step-back as charwise visual. The `!vim.visualLine` guard remains because visual-line mode manages cursor positioning independently via cursor-only CM6 selection. ([#41](https://github.com/saberzero1/motions/issues/41))

## ~~Visual-block `A` skips short lines~~ (Fixed)

**Status**: Fixed in fork. Verified against Neovim 0.12.2 golden comparison (`upstream-gaps` suite).

When using `<C-v>` block visual mode with `A` (append) on a block spanning lines shorter than the block column, the fork's `selectForInsert` skipped those lines entirely. Neovim pads short lines with spaces to reach the block's right edge before appending. Fixed by adding a `padShortLines` parameter to `selectForInsert` — the `A` (`endOfSelectedArea`) path passes `true` to pad, while the `I` (`startOfSelectedArea`) path passes `false` to skip (matching Neovim, which also skips short lines for `I`). ([#41](https://github.com/saberzero1/motions/issues/41))

## ~~Visual charwise `r` off-by-one across line boundary~~ (Fixed)

**Status**: Fixed in fork. Verified against Neovim 0.12.2 golden comparison (`upstream-gaps` suite).

The `replace` action in the fork set `curEnd = selEnd` for charwise visual mode. Since `cm.getRange(from, to)` treats `to` as exclusive, this replaced one fewer character than the visual selection covered when the selection spanned a newline. For example, `vjhr ` from position (0,4) on `wuuuet\nanother` replaced 5 characters instead of 6, producing `wuuu  \n   ther` instead of the correct `wuuu  \n    her`. Fixed by using `new Pos(selEnd.line, selEnd.ch + 1)` for `curEnd`, matching the inclusive-to-exclusive conversion used elsewhere (e.g. `makeCmSelection` char mode). ([#41](https://github.com/saberzero1/motions/issues/41))

## Surround nvim-surround parity gaps

**Status**: 74 golden comparison tests against [nvim-surround](https://github.com/kylechui/nvim-surround) (Neovim 0.12.2). **74 pass.** The ground truth was shifted from tpope/vim-surround to nvim-surround — nvim-surround is better maintained, has a comprehensive test suite, and is Lua-native (aligned with Neovim's direction). It implements all tpope/vim-surround behavior plus extensions.

**Fixed in this release**:

- Opening bracket `ds(`/`ds[`/`ds{` now works — `findSurroundingBrackets` parameter swap fixed
- Cursor position after `ys`/`yss`/visual `S` now at `ch:0` (on the delimiter) — matching nvim-surround
- `ds(` on nested parens and multiline content now works
- `cs({` now correctly finds and changes parens to braces with spaces
- `ds}` space preservation — closing-bracket forms now preserve inner spaces (opening forms still strip)
- `cs` chained operations — `_surroundReplacement` no longer leaks between different surround operation types
- `cs` dot-repeat — `csba..` correctly changes nested bracket layers via search position offset
- Multiline `dsb` — cursor clamped to valid line length after bracket deletion
- Count-prefixed `ds`/`cs` — now uses "apply N times" semantics matching nvim-surround (`2dsb` = delete twice, `3csbr` = change all 3 levels)
- `ys` with line-crossing motions — `ysjb`, `ys2jB` correctly expand to full lines for linewise motions
- `ySS`/`VSB` newline indentation — single-line content no longer gets extra 2-space indent, matching nvim-surround
- Visual block `$ S}` — now surrounds each line individually instead of wrapping entire block
- `dsf` (delete surrounding function call) — implemented with regex-based function name detection
- `csbBysaBb` chain — `ys` with text object motions (`aB`, `iw`) after `cs` now works. The `ys_motion` handler directly evaluates text object motions instead of dispatching through the fragile `handleKey` → `evalInput` path where `clearInputState` would lose the `selectedCharacter`.

**Remaining deviations** (3 cases):

| Category                          | Count | Description                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ys` dot-repeat with tag/function | 2     | `ysiw<tag>` and `ysiwf` dot-repeat works correctly at runtime — the resolved tag/function name is stored in `_surroundReplacement` and replayed via `addSurroundToRange()`. However, these operations cannot be reliably tested via WDIO because `<` and `>` characters conflict with vim's angle-bracket notation when dispatched through `browser.keys` or `Vim.handleKey`. Verified at fork level (1806/0 tests pass). |
| `ds<` semantic difference         | 1     | Intentional: fork treats `<` as angle bracket; nvim-surround treats it as tag prompt (no-op)                                                                                                                                                                                                                                                                                                                              |

**Fixed** (previously listed as deviations):

- ~~`ys` dot-repeat with text objects~~ — Fixed for simple delimiters (`ysiwb`, `ysiw"`, `ysaw'`, `ysiw]`). Fork stores text object motion characters in `lastEditInputState._ysTextObjectMotion` and `_ysTextObjectChar` via the `onRepeat` callback. During dot-repeat, `repeatLastEdit` re-evaluates the text object at the current cursor position and applies `addSurroundToRange()`. Fork tests: 1806/0 (was 1803/3).
- ~~Tag `cst`/`yst` (change/add tag)~~ — Verified working. Fork tests (`vim_cst_to_tag`, `vim_cst_to_char`, `vim_ysiw_tag`, `vim_dot_cst`) and plugin e2e tests (74 golden + 81 plugin-level) all pass. The original golden data was recorded against vanilla Neovim (no nvim-surround plugin), making golden comparison meaningless for surround. Plugin e2e tests are the definitive verification.

**Test coverage**: `test/specs/vim-builtin/surround-golden.e2e.ts` — 74 golden tests. `test/specs/surround.e2e.ts` — 80 passing, 2 skipped (tag/function dot-repeat — verified at fork level). Fork: 1806 passing, 0 failing.

## `gr` replace-with-register parity gaps

**Status**: Core functionality implemented. See `src/operators/replace-with-register.ts`.

The `gr` operator implements the three primary mappings from [inkarkat/vim-ReplaceWithRegister](https://github.com/inkarkat/vim-ReplaceWithRegister):

- `["x]gr{motion}` — replace motion range with register contents (characterwise)
- `["x]grr` — replace current line (linewise; operator double-press)
- `{Visual}["x]gr` — replace visual selection with register contents

The replaced text is discarded into the black-hole register; the source register is preserved.

**Remaining gaps**:

- **Blockwise visual mode (`<C-V>` + `gr`)**: The operator has no blockwise branch. Selecting a block with `<C-V>` and then pressing `gr` falls through to the characterwise path, which produces incorrect results. The original plugin handles two sub-cases: if the register contains a single line, it duplicates that line to match the block height; if it contains multiple lines, it pastes blockwise. Neither case is implemented.

**Test coverage**: `test/specs/operators.e2e.ts` — 22 passing tests: `grr` (single, multi-line, count), `griw`, `gr$`, `grl`, `gri'`, `gr}`, named registers (`"agriw`, `"a3grr`), visual `gr` (charwise and linewise `V`), register type coercion (linewise↔charwise), cursor positioning, dot-repeat (`griw`, `grr`, `3grr`+`.`), multi-line register expansion, text object at line boundary. 4 skipped blockwise visual mode tests (`it.skip`) document expected behavior for future implementation.

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

The fork's `findPosV` applies three corrections to CM6's `moveVertically` result:

1. **Multi-line jump clamp**: When `moveVertically` jumps more than one document line and no fold exists in the skipped range, the cursor is clamped to the adjacent document line (±1). This prevents line-skipping on both replaced widgets (MathJax) and variable-height lines (headings with larger fonts).

2. **Tall non-wrapped line detection**: When `moveVertically` stays on the same document line (`lineJump === 0`) but the Y coordinate change is less than half of `defaultLineHeight`, the cursor is "stuck" on a tall non-wrapped line — headings with large font size and/or line-height produce line blocks taller than `defaultLineHeight`, causing `moveVertically` to take multiple steps through the block even though the text doesn't wrap. The fix detects this via `coordsAtPos` comparison and force-moves to the adjacent document line. Legitimate within-line moves (wrapped display lines) produce Y deltas greater than the threshold and are not affected.

3. **Column 0 fallback**: When `moveVertically` correctly crosses one line but drops the cursor at column 0 despite a non-zero goalColumn, `posAtCoords` resolves the correct character position from the pixel X coordinate.

([#26](https://github.com/saberzero1/motions/issues/26))

**Test coverage**: `test/specs/widget-navigation.e2e.ts` (6 tests covering gj/gk/j/k through single and multiple `$$` blocks), `test/specs/vim-builtin/g-commands.e2e.ts` (7 tests covering gk/gj horizontal position preservation across h1–h6 headings and mixed heading/list/text documents), `test/specs/spikes/spike-gk-issue26-repro.e2e.ts` (6 tests covering reporter's exact content with consecutive h2 headings, long wrapped lines, and empty lines).

## `gk`/`gj` column drift on heading lines

**Status**: Known deviation from Neovim. Pixel-preserving behavior is correct for GUI editors.

When `gk`/`gj` crosses a heading line (which Obsidian renders with a larger font), the character column shifts. For example, starting at ch:16 on a body text line and pressing `gk` to move onto a `### heading` line lands at ch:15 instead of ch:16. Neovim preserves the character column exactly (ch:16 → ch:16) because all terminal characters are monospace.

The difference: Neovim's `gk` preserves `curswant` — the desired **character column**. The fork's `findPosV` uses CM6's `posAtCoords` to resolve position from `goalColumn` — the desired **pixel X coordinate**. In a monospace terminal, these are equivalent. In a proportional-font GUI editor like Obsidian, heading characters are wider, so the same pixel X maps to a smaller character index.

| Start ch | Neovim heading ch | Obsidian heading ch | Δ (Obsidian) |
| -------- | ----------------- | ------------------- | ------------ |
| 6        | 6                 | 8                   | −2           |
| 11       | 11                | 11                  | 0            |
| 16       | 16                | 15                  | 1            |
| 21       | 21                | 18                  | 3            |
| 26       | 22 (clamped)      | 22 (clamped)        | 0            |

The round-trip is lossless: `gk gk gj gj` always returns to the exact starting column (Δ:0) because the pixel X coordinate is preserved throughout the navigation.

This is inherent to CM6's coordinate-based `moveVertically` and cannot be fixed without reimplementing vertical navigation in character-column space — which would break correct display-line behavior for wrapped lines (where pixel-based resolution is the only correct approach). The current behavior is consistent with how other GUI vim implementations (VS Code vim, IntelliJ IdeaVim) handle proportional-font vertical navigation.

**Golden test coverage**: 3 golden comparison cases in `test/neovim/golden-data/g-commands.json` (`gk over heading preserves column`, `gk over heading then above preserves column`, `gk gj round-trip preserves column`), registered as known deviations in `test/neovim/deviations.ts`.

## Per-mode cursor shapes require bundled fork mode

The per-mode cursor shape settings (block, bar, underline, hollow) only take effect when Obsidian's built-in Vim mode is disabled. With built-in Vim enabled, Obsidian renders its own block cursor and the plugin has no control over its shape. The `set guicursor=...` vimrc command is also only effective in bundled fork mode.

## Surround operator scope

**Status**: Complete. All vim-surround features implemented.

The surround operator implements the full vim-surround command set: `ds`/`cs`/`ys`/`yss`/visual `S` with all bracket/quote/tag targets, function wrapping (`f`/`F`), newline variants (`cS`/`yS`/`ySS`/`gS`), count support (bracket depth and quote char repeat), insert mode (`<C-G>s`/`<C-G>S`), and dot-repeat. Markdown-specific pairs use count-prefix: `2ysiw*` → `**word**`. Custom surround pairs can be defined via Lua (`vim.obsidian.surround.set/add`) or vimrc (`surroundmap`), supporting multi-character delimiters with full `ys`/`ds`/`cs` support ([#36](https://github.com/saberzero1/motions/issues/36)).

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

The plugin supports Lua config files (`init.lua`, `.init.lua`, etc. — see [Config file resolution](#config-file-resolution)) as an alternative to vimrc. Enable in **Settings → Vim Motions → Vimrc & key bindings → Configuration mode**.

### Supported APIs

The Lua config runtime (`init.lua`) supports `vim.opt` (including `guicursor`), `vim.o`, `vim.g` (including `mode_prompt_*`), `vim.keymap.set`, `vim.keymap.del`, `vim.cmd()`, `vim.vault_name()`, `vim.tbl_*`, `vim.split`, `vim.trim`, `vim.startswith`, `vim.endswith`, `vim.stricmp`, `vim.inspect`, `vim.json`, `vim.schedule`, `vim.defer_fn`, `vim.uv`, `vim.notify` (with levels), `vim.obsidian`/`vim.ob` (including `vim.ob.meta.*` (9 functions), `vim.ob.fs.*` (11 functions), `vim.ob.ui.*` (4 functions), `vim.ob.im.*` (4 functions + 2 properties), `vim.ob.get_cursor`, `vim.ob.set_cursor`, `vim.ob.get_selection`, `vim.ob.mode`, `vim.ob.notice`, `vim.obsidian.keymap.set/del` for global keymaps, `vim.obsidian.whichkey.set_group/set_label/add` for which-key labels, `vim.obsidian.cursor.set` for cursor shapes, `vim.obsidian.modeprompt.set` for mode prompts, `vim.obsidian.surround.set/del/add` for custom surround pairs, `vim.obsidian.leader.set/del/add` for leader bindings, and `vim.obsidian.pick(source, opts?)` for the fuzzy picker), `vim.env`, `vim.api.nvim_set_hl`, `vim.api.nvim_buf_*`, and `print()`. See `docs/configuration/lua-config.md` for the full reference.

### Unsupported Neovim APIs

`require()`, `vim.lsp`, `vim.treesitter`, `vim.ui`, `vim.diagnostic`: accessing these produces a clear error message. `vim.api` is partially supported: `nvim_create_user_command`, `nvim_create_autocmd`, `nvim_create_augroup`, `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds`, `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, and `nvim_buf_del_keymap` are available; other `vim.fn` is partially supported (see below): unsupported `vim.fn.*` functions produce a helpful error listing available functions. The Lua runtime is sandboxed: only 6 standard libraries are loaded (`_G`, `string`, `table`, `math`, `coroutine`, `utf8`). The `io`, `os`, `debug`, and `package` libraries are not available. Global functions `load`, `dofile`, `loadfile`, `require`, `rawget`, `rawset`, and `rawequal` are disabled.

### Autocmds

19 events supported: `InsertEnter`, `InsertLeave`, `ModeChanged`, `BufEnter`, `BufLeave`, `BufWritePre`, `BufWritePost`, `FocusGained`, `FocusLost`, `TextYankPost`, `CursorMoved`, `CursorHold`, `LeafEnter`, `LeafLeave`, `FileType`, `OilEnter`, `OilLeave`, `CmdlineEnter`, `CmdlineLeave`. See `docs/configuration/lua-config.md` for the full reference.

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

Settings (`vim.opt`) and keymaps (`vim.keymap.set`) load immediately without an active editor. `vim.cmd()` calls at load time are queued and executed when the first editor receives focus. `vim.cmd()` calls from runtime contexts (function-mapped keymaps, autocmd callbacks, timer callbacks, user commands) execute immediately against the active editor. If no editor is active when a runtime `vim.cmd()` fires, the command is skipped with a console warning. If no init.lua file exists, the loader silently skips (no notice).

### Loading order

init.lua loads after vimrc. Both can be used simultaneously — Lua values override vimrc values on conflict. This differs from Neovim, which uses either `init.lua` or `.vimrc`, not both.

### Function callbacks and Tier 3 functions

Lua function callbacks (`vim.keymap.set('n', 'key', function() ... end)`) execute at keypress time, not config-load time. `vim.cmd()`, `vim.fn.line('.')`, `vim.fn.col('.')`, and other editor-state-dependent functions work correctly inside callbacks. They error at config-load time because no editor is active (context-aware execution). Leader-prefixed keymaps registered via `vim.keymap.set` with a `desc` option automatically appear in the which-key overlay.

### ~~`vim.cmd()` broken at runtime~~ (Fixed)

`vim.cmd()` called from runtime contexts (function-mapped keymaps, autocmd callbacks, timer callbacks, user commands) silently failed. The `handleExCommand` callback pushed commands to a `pendingExCommands` queue that was drained once after initial load — runtime calls pushed to an orphaned array. Fixed by adding a `runtimeExHandler` that executes commands immediately via `vim.handleEx()` after load completes. Cleanup on plugin unload prevents stale callbacks. ([#49](https://github.com/saberzero1/motions/issues/49), [#27](https://github.com/saberzero1/motions/issues/27))

### ~~`vim.keymap.set` leader bindings not in which-key~~ (Fixed)

`vim.keymap.set("n", "<leader>x", ...)` registered in the vim engine but not in `LeaderRegistry`, so bindings didn't appear in the which-key overlay. Additionally, `luaResult.leaderBindings` was returned by the loader but never consumed in `main.ts`. Fixed by auto-detecting leader prefix in `vim.keymap.set` and calling `onLeaderBinding` + `onWhichKeyCommandLabel`. Buffer-local keymaps (`buffer = 0`) are excluded from global registration. ([#27](https://github.com/saberzero1/motions/issues/27))

### `BufEnter` for initial file

`BufEnter` autocmds set in init.lua now fire for the file already open when the plugin loads, via a synthetic `BufEnter` during `activate()`. Previously, `BufEnter` only fired on subsequent file opens.

**Limitation**: Buffer-local keymaps with function callbacks registered inside a `BufEnter` autocmd during the initial synthetic fire may be destroyed by the subsequent `reloadFeatures()` call, which resets the vim keymap. Keymaps registered from `BufEnter` events triggered by actual file switches (after initial load) work correctly. Workaround: use `vim.obsidian.leader.add` with string command IDs for buffer-local-like behavior, or use `ModeChanged` events for per-buffer setup during initial load.

### ~~Function-callback keymaps lost after feature reload~~ (Fixed)

Function-callback keymaps from `vim.keymap.set` were silently destroyed when `reloadFeatures()` called `vim.resetKeymap()`. String-RHS keymaps survived because `vim.noremap`/`vim.map` entries are stored separately from `mapCommand` entries. Fixed by moving `applyLuaMaps()` to run after `reloadFeatures()`. Additionally, `loadLuaConfigForTest()` now clears `luaActionNames` to prevent stale callback references after Lua state destruction.

### `vim.schedule_wrap` + `vim.cmd()` in timer callbacks

`vim.schedule_wrap` inside a `vim.uv.new_timer` callback creates a double-deferred execution chain (timer → setTimeout(0) → callback). `vim.cmd()` called from this innermost callback may fail silently because the active editor context is lost between the two async boundaries. Workaround: call `vim.cmd()` directly in the timer callback without `vim.schedule_wrap`, or use `vim.defer_fn` instead.

### ~~Which-key "leader-only" mode does not detect space as leader~~ (Fixed)

When `vim.g.mapleader = " "` and `vim.opt.whichkey = "leader"`, the overlay now appears after pressing space. `onKeyPressLeaderOnly` compares against `this.normalizedLeaderKey`, which normalizes the literal `' '` to `'<Space>'`, matching the codemirror-vim `vimKeyFromEvent` output. No fork-side changes are required for this behavior.

### `executeLuaForTest` does not support runtime `vim.cmd()`

The test-only Lua executor (`executeLuaForTest` in main.ts) has `handleExCommand: () => {}` (no-op). `vim.cmd()` calls through this path silently do nothing. It also lacks `onLeaderBinding` and runtime handler activation. Use `loadLuaConfig()` (via `loadLuaConfigForTest`) for tests that need runtime Lua behavior.

### ~~No Lua instruction-count hook on runtime callbacks~~ (Fixed)

All runtime `lua_pcall` sites (function keymaps, user commands, autocmd handlers, timer callbacks, snippet dynamic nodes) are now wrapped with `withInstructionGuard`, which sets `lua_sethook` with `LUA_MASKCOUNT` before each call and clears it after. The instruction limit is 500,000 for callbacks and 100,000 for snippet nodes. On timeout, a throttled `Notice` is shown (5-second cooldown to prevent spam) and the error is logged. Obsidian remains responsive.

### Known deviations from Neovim

4 deviations registered in `test/neovim/deviations.ts`:

- `keymap.del` + `Q`: plugin's built-in `Q→@@` mapping persists after Lua unmap
- `cw` + `<Esc>` in mapped keys: test infrastructure key dispatch difference
- Visual surround cursor: off-by-one in visual mode
- Leader key in test: leaderRegistry propagation timing in `executeLuaForTest`

### Bundle size

Fengari fork adds +201KB minified / +65KB gzipped (reduced from +238KB / +79KB after stripping Node.js dependencies). Total plugin size: ~671KB minified (13.4% of the 5000KB soft limit).

### Intentionally skipped Lua features

| Feature                                 | Reason                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `require()` / plugin loading            | Security — sandboxed environment, no module system (Lua `package` library stripped in fork)                                                                                                                                                                                                                                                                                                                              |
| `vim.api.nvim_*`                        | 16 functions supported (`nvim_create_user_command`, `nvim_create_autocmd`, `nvim_create_augroup`, `nvim_del_autocmd`, `nvim_del_augroup_by_name`, `nvim_clear_autocmds`, `nvim_set_hl`, `nvim_get_hl`, `nvim_create_namespace`, `nvim_buf_get_lines`, `nvim_buf_set_lines`, `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_buf_line_count`, `nvim_buf_set_keymap`, `nvim_buf_del_keymap`); others remain unavailable |
| `vim.fn.hostname()` / `vim.fn.getenv()` | System fingerprinting concern                                                                                                                                                                                                                                                                                                                                                                                            |

## Oil explorer

**Status**: Stable. Uses embedded editor view (no temp files). Single-directory operations fully functional.

### Cross-directory file moves require both directories open

Moving a file from directory A to directory B requires opening both directories in separate oil buffers (`dd` in one, `p` in the other, then `:w`). The diff engine detects cross-buffer moves by matching entry IDs across buffers.

### Vim state is per-editor when using bundled vim mode

When Obsidian's built-in vim is disabled and the plugin provides vim via the bundled fork, each oil view gets its own vim instance. Registers, macros, and ex command history are not shared between the oil editor and regular editors. This is because `registerEditorExtension()` does not propagate to embedded editors — the oil view injects the vim extension locally via `buildLocalExtensions()`.

When built-in vim is enabled, vim state is shared globally through Obsidian's editor infrastructure. This limitation only affects fork mode.

### Third-party CM6 extensions not available in oil

Extensions registered by other plugins via `registerEditorExtension()` do not appear in the oil editor. The embedded editor only includes extensions explicitly passed through `buildLocalExtensions()` — currently the oil conceal extension and (when built-in vim is disabled) the bundled vim extension. Syntax highlighting and markdown rendering from Obsidian's core are included.

### Oil uses undocumented Obsidian internal API

The embedded editor is created by extracting Obsidian's internal `ScrollableMarkdownEditor` prototype via `app.embedRegistry.embedByExtension.md()`. This is an undocumented internal API used by the Kanban plugin (500k+ installs) since 2022 without breakage. A runtime guard produces a descriptive error if the API changes in a future Obsidian update. The oil feature will degrade gracefully (error notice, oil unavailable) rather than crashing.

### ~~Oil temp files visible with `oil~` prefix~~ (Fixed)

**Status**: Fixed. Oil now uses a dedicated view type with an embedded editor. No temporary files are created in the vault.

### ~~Dotfiles cannot be used for temp files~~ (Fixed)

**Status**: Fixed. No longer relevant — Oil no longer creates any files in the vault.

### ~~Keybindings are not user-remappable~~ (Implemented)

**Status**: Implemented. All keybindings across all contexts are user-remappable.

Every keybinding is remappable through one of four mechanisms depending on context:

- **Editor keybindings** (motions, actions, operators): All have ex command aliases (e.g., `:nextheading`, `:focuspaneleft`, `:tablenextcell`, `:hintactivate`). Remap via `vim.keymap.set('n', 'key', ':excommand<CR>')` in Lua or `nmap key :excommand<CR>` in vimrc.
- **Oil explorer keybindings**: Exposed as ex commands (`:oilparent`, `:oilroot`, etc.) and Lua functions (`vim.obsidian.oil.parent()`, etc.). Default keys registered as `vim.map` mappings. Buffer-local remapping via `OilEnter`/`OilLeave` autocmd events.
- **Picker keybindings**: Configurable via `vim.obsidian.pick_keymap()` in Lua. Not available via vimrc (picker operates outside the vim keymap system).
- **Global workspace navigation**: Remappable via `vim.obsidian.keymap.set`/`del` (Lua) and `:gmap`/`:gunmap`/`:gmaps` (vimrc and ex command line). Each default is tagged with a stable name.

See `docs/configuration/remapping.md` for the full remapping guide with examples for each context.

**Remaining limitations**:

- ~~Which-key integration for oil keybindings (showing oil bindings in the which-key popup) is planned but not yet implemented~~ — Fixed. Oil command labels are registered in the which-key overlay's `commandLabels` map. When oil bindings are dynamically mapped (on `OilEnter`), they appear in `vim.getCompletions()` and the which-key overlay displays descriptive labels instead of raw ex command strings. When leaving oil, bindings are unmapped and disappear from completions.
- ~~Help command (`g?` in oil context) is planned but not yet implemented~~ — Implemented. `g?` opens a `VimInfoModal` listing all oil keybindings in a Key/Action table, following the same pattern used by `:marks`, `:buffers`, and `:registers` when the picker is disabled. Dismissible via Escape.

### ~~Which-key and `g?` in non-editor context~~ (Fixed)

Investigation (spike25) found that `WhichKeyOverlay.tryAttach()` correctly attaches to Oil's embedded CM6 editor via `getCmAdapterFromEditorView()`, even when Oil is the only view (no prior MarkdownView). The which-key overlay works in Oil-only contexts.

### ~~Which-key "all" mode intercepts multi-key Oil bindings~~ (Fixed)

When which-key mode is set to "All partial keys" and the popup delay is non-zero (default 500ms), pressing `g` in Oil started a delayed timer. The overlay appeared between the `g` and the second keystroke (`?`, `.`, `s`, `f`), disrupting the vim key sequence completion. Fixed by bypassing the popup delay timer when the active view is an OilView — the overlay shows immediately (matching delay=0 behavior), which allows the vim engine to process multi-key bindings (`g?`, `g.`, `gs`, `gf`) without interference. The overlay still appears for partial sequences in Oil, preserving discoverability for operator-pending keys (`d`, `c`, `y`, etc.).

**Test coverage**: `test/specs/oil-which-key.e2e.ts` — 4 tests covering `g?` help modal, `g.` non-interception, no stale overlay after `g?`, and leader-mode control.

| `vim.lsp.*` / `vim.treesitter.*` | Not applicable to Obsidian |
| Async Lua (coroutine ↔ Promise bridge) | Deferred — `vim.schedule`, `vim.defer_fn`, and `vim.uv` timer subset are available; full coroutine bridge remains deferred |

### ~~Vault file reading~~ (Implemented)

`vim.ob.fs.read(path)` is now available in async-capable callback contexts (keymap callbacks, autocmd handlers, timer callbacks, user commands). The function yields the Lua coroutine internally and resumes when the vault read completes. `vim.ob.fs.readlines(path)` returns a table of lines. Both functions are catchable with `pcall`. Async APIs cannot be called from snippet `f()`/`d()` nodes or at the top level of `init.lua` (Phase 2). To read the current file's content synchronously, `vim.api.nvim_buf_get_lines(0, 0, -1, false)` remains available.

**Test coverage**: 12 golden comparison tests (Neovim 0.12.2), 43 integration e2e tests covering settings, keymaps, error recovery (syntax/runtime/infinite loop), conditional config, coexistence with vimrc, disabled state, runtime `vim.cmd()` execution (8 tests), leader binding + which-key integration (9 tests), space-as-leader (7 tests), and documentation example validation (10 tests).

## Marks

**Status**: Working. Gutter indicators, global mark persistence, grouped picker.

Vim marks (`m{a-z}`, `'{a-z}`) work via codemirror-vim. The plugin adds three enhancements:

- **Gutter indicators**: Mark letters appear in the gutter area next to marked lines using `Decoration.line()` with a `data-vim-marks` attribute and CSS `::after` pseudo-element. Zero layout shift — marks overlay the existing gutter without adding a column. Toggle via `enableMarkGutter` setting (default: on).
- **Global mark persistence**: Marks `A`–`Z` are stored in plugin settings (`persistedMarks` array) with file path and cursor position. Saved via 30-second polling interval with dirty-flag check, plus immediate save on `onunload()`. Marks survive file closes and plugin restarts.
- **Grouped marks picker**: `:marks` shows marks grouped under "Buffer marks" and "Global marks" headers. Global marks display the target file path. Cross-file navigation opens the target file and positions the cursor.

### Limitations

- ~~**Special marks not in picker**~~ — Fixed. Special marks (`'`, `.`, `<`, `>`) are now shown in the `:marks` picker under a "Special marks" group. They are read from `cm.state.vim.marks` like buffer marks.
- ~~**Global mark file rename**~~ — Fixed. `MarkStore.renamePath()` is called from the `vault.on('rename')` handler, and `MarkStore.removeByPath()` from `vault.on('delete')`, matching the existing harpoon and fold persistence patterns.
- **Marks set outside vim command pipeline** — marks created programmatically (not via `m{char}`) won't trigger gutter refresh until the next vim command fires `vim-command-done`.
- **Gutter refresh mechanism** — the gutter reads `cm.state.vim.marks` on each `vim-command-done` event. Position tracking through document edits uses `Decoration.line()` position mapping (`set.map(tr.changes)`), not polling.

**Test coverage**: `test/specs/marks-gutter.e2e.ts` (6 tests), `test/specs/marks-picker.e2e.ts` (8 tests).

## Harpoon file pinning

**Status**: Working. Pin files to numbered slots with cursor tracking and persistence.

Pin files to numbered slots (`<leader>1`–`<leader>9`) for instant switching. Cursor position is tracked per-pinned-file via `active-leaf-change` departure-cursor capture and restored on navigation. Pins are stored in `VimMotionsSettings.harpoonPins` with 30-second dirty-flag save interval. File renames auto-update via `vault.on('rename')`; file deletes auto-remove via `vault.on('delete')`.

### Limitations

- **No editable menu** — harpoon v2's floating editable buffer (reorder/remove by editing lines) is deferred. V1 uses the picker + add/remove commands.
- **Navigation opens in current pane** — `getLeaf(false)` replaces the current buffer (matching harpoon v2). Users expecting new-tab behavior should use the picker's `<C-t>` for tab-open.
- **Cursor tracking is per-switch** — cursor position is captured when you leave a pinned file. Positions are not tracked continuously (no `CursorMoved` listener). If the plugin crashes, the last captured position may be stale by up to one editing session.
- **Non-markdown cursor restore** — pinning works for any file type, but cursor position is only restored for `MarkdownView` files (PDFs, canvas, images don't have a text cursor).
- **Sparse slot arrays** — removing a pin sets its slot to `null` without shifting other slots. Slot numbers are stable (pin 3 stays pin 3 even if pin 2 is removed). Trailing nulls are trimmed.

## Picker / Fuzzy finder

**Status**: Working. Unified picker with 13 sources, preview pane, live grep, and frecency scoring.

The picker uses a telescope.nvim-inspired visual presentation: monospace fonts, compact item density, accent-tinted selection, and floating border titles showing the source name (e.g. "Files"), "Results", and "Preview" on each section's top border. All colors use Obsidian CSS variables (`--font-monospace`, `--text-muted`, `--text-accent`, `--interactive-accent-hsl`, `--modal-background`, `--color-accent`) for full light/dark theme compatibility. The presentation matches the which-key overlay's terminal aesthetic. This Neovim-style visual language extends to all plugin modals: `SuggestModal` subclasses (`GlobalExCommandModal`, `OutlineModal`, `SearchResultsModal`, `ContextActionsModal`) use the prompt-modal pattern (transparent container, accent border, floating title, two-column suggestion rows with label + description), and `Modal` subclasses (`VimInfoModal`, `OilConfirmModal`) use the info-modal pattern (accent-bordered inner wrapper, floating title, hidden Obsidian chrome).

The picker supports two fuzzy matching engines selectable via **Settings → Vim Motions → Picker matching engine**:

- **uFuzzy** (default): Pure JavaScript matcher (7.5KB) with filename-aware ranking. Prefers exact filename matches over partial path matches (e.g., `Header.tsx` ranks above `header/utils.ts` for query `"Header"`). Supports typo tolerance via single-error mode, configurable fuzziness, and multi-word queries.
- **obsidian**: Obsidian's built-in `prepareFuzzySearch` API. Zero bundle cost (maintained by Obsidian). May be slower than uFuzzy on very large vaults — the Obsidian docs note performance issues beyond a few thousand items.

Matching is `RegExp`-based for grep (with fallback to substring matching for invalid patterns). Live grep debounces at 200ms with generation-based cancellation.

### Limitations

- ~~**`:grep` is fuzzy, not regex**~~ — Fixed. `:grep` now uses JavaScript `RegExp` for pattern matching, matching Neovim's `:grep` behavior (which uses the external `grepprg`). Invalid regex patterns gracefully fall back to substring matching.
- **`:marks` shows buffer + global marks** — buffer-local marks (`a`–`z`) are read from the active editor's vim state. Global marks (`A`–`Z`) are read from the plugin's persisted `MarkStore`. `:marks` in a non-editor view shows only global marks (no active editor for buffer marks).
- **Live grep iterates all files synchronously** — `cachedRead()` is fast but iterating 10K+ files on each keystroke (debounced) may cause brief UI pauses on very large vaults. MAX_RESULTS=100 cap limits result set size.
- **Frecency persistence** — frecency data is stored in plugin settings via `saveData()`, debounced to 30 seconds. Data loss on crash is possible for the last 30 seconds of interactions.
- **Preview pane rendering** — full-file previews (files, buffers, recent) are rendered through `MarkdownRenderer.render()`, displaying headings, formatting, code blocks, images, and links with non-interactive links. Positional previews (grep, live grep, headings, marks) use monospace plain text with a line-number gutter that highlights the target line — raw text ensures uniform line heights so the gutter stays aligned (markdown rendering produces variable-height headings/blocks that cause drift). Frontmatter is excluded from positional previews since `MarkdownRenderer` strips it, which would otherwise misalign the gutter. The picker modal uses a fixed height (50vh) to prevent layout shifts. Plain-string previews (commands, registers) remain as raw text.
- **Preview hidden on mobile** — `@media (max-width: 600px)` hides the preview pane entirely.
- **Tags picker has no preview** — selecting a tag opens a sub-picker showing files with that tag.
- **uFuzzy unicode mode** — adds ~2.5KB over the base library size for broader language support (CJK, Cyrillic, accented characters).

### Bundle size impact

uFuzzy adds +17.5KB. Combined with picker UI code, the picker subsystem adds ~50KB to the production bundle.

## Neovim golden test coverage gaps

The plugin verifies Vim behavior against headless Neovim via golden comparison tests (`test/neovim/`). The following areas of the fork's test suite are **not** covered by golden comparison because they cannot be meaningfully verified in a headless Neovim session:

| Area                                                  | Fork tests | Reason not golden-verifiable                                                                                                                                     |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scroll/viewport (`zz`, `zt`, `zb`, `Ctrl-d/u/f/b`)    | 9          | Depend on viewport dimensions and `scrollInfo` — headless Neovim has no viewport geometry                                                                        |
| Fold (`zo`, `zc`, `za`, `zf`, `zd`, `zE`, `zm`, `zr`) | 32         | CM6 fold API is fundamentally different from Neovim; `zO`/`zC`/`zA` map to non-recursive equivalents; `zn`/`zN` infeasible (cannot disable Obsidian fold gutter) |
| Jumplist (stale marker edge case)                     | 1          | Single test for cross-document marker invalidation — Neovim doesn't share the CM6 `Marker`/`posFromIndex` infrastructure                                         |
| Cursor rendering (`rendered_cursor_position_*`)       | 2          | Test `.cm-fat-cursor` DOM element pixel position via `getBoundingClientRect()` — no Neovim equivalent                                                            |

These areas are covered by the fork's own browser test suite (1806 tests) but rely on the fork's test expectations being correct rather than Neovim-verified ground truth.

### Golden recorder `nvim_feedkeys` limitation (fixed)

The golden recorder (`test/neovim/client.ts`) previously used Neovim's `nvim_feedkeys` RPC API with `'tx'` flags to send key sequences. This API does not fully execute certain multi-step operations within a single call:

- **Block-insert replication**: `<C-v>` + `I`/`A` + text + `<Esc>` only applied the inserted text to the last selected line instead of all lines in the block. The replication step (which Neovim performs at `<Esc>` exit from block-insert mode) did not complete before the RPC returned.
- **Visual mode-switch + operator**: `<C-v>jl` then `v` or `V` followed by `d` produced incorrect deletion scope — the mode switch didn't fully resolve before the operator executed.

This caused the `visual-block` and `upstream-gaps` golden suites to contain incorrect expected values that matched `nvim_feedkeys` behavior rather than interactive Neovim behavior. The 4 failing `upstream-gaps` tests and all 15 `visual-block` tests had wrong expectations.

Fixed by using `:execute "normal ..."` (via `nvim.command()`) for key sequences containing `<C-v>`. This executes synchronously within Neovim's command loop, ensuring all side effects complete. Key sequences without `<C-v>` (the majority of tests) still use `nvim_feedkeys` since `:normal` doesn't support macro recording (`q`/`@a`). An `escapeForNormal()` helper converts JS control characters to Vim `\<...>` notation for the `:execute` string.

Verified with `:normal!` (headless `-c` flags), Vimscript `feedkeys("...", "tx")`, and `nvim_feedkeys` — only `:normal!` and `:execute "normal ..."` produce correct results for block operations.

## Input method switching

**Status**: Working. Desktop only (macOS, Windows, Linux). Requires an external IM switching binary (e.g., `macism`, `im-select`, `fcitx5-remote`, `ibus`).

The plugin can automatically switch input methods when entering/leaving insert mode. Enable in **Settings → Vim Motions → Input method**. The Lua API (`vim.obsidian.im`) provides programmatic control for advanced use cases. All 7 IM settings are available in both the legacy settings tab (Obsidian <1.13) and the new searchable settings UI (Obsidian 1.13+).

Limitations:

- **Desktop only**: Mobile devices do not support `child_process` and the feature is a no-op. The settings group is hidden on mobile.
- **Command-line and search mode**: IM switching auto-wires to `CmdlineLeave` (switches to normal IM when exiting `:`, `/`, or `?` prompts). `CmdlineEnter` does not trigger an IM switch (users may need CJK input for search queries). The global ex command modal (`:` in non-editor views) does not fire `CmdlineEnter`/`CmdlineLeave`.
- **System-wide switching**: IM switching is a system-wide OS operation. Switching IM in one Obsidian window affects all windows and applications.
- **Flatpak/Snap**: Sandboxed Obsidian installations (Flatpak, Snap) may not have access to IM switching binaries outside the sandbox. Use the AppImage or native package instead.
- **Binary must be pre-installed**: The plugin calls an external binary (`macism`, `fcitx5-remote`, `im-select.exe`, etc.) — it does not bundle one. The binary must be installed separately and the full path provided in settings.

### Deferred enhancements

The following IM switching improvements are planned but not yet implemented:

- ~~**Platform presets**~~: Implemented. A settings dropdown auto-fills binary path, arguments, and default IM for macism (macOS), im-select (Windows), fcitx5-remote (Linux), and ibus (Linux). Values are editable after selection.
- ~~**Session persistence**~~: Implemented. The per-editor IM cache is persisted to plugin settings via `saveData()` (30-second interval + save on unload). The saved IM is restored on plugin load.
- ~~**`:IMToggle`/`:IMStatus` ex commands**~~: Implemented. `:IMToggle` enables/disables IM switching. `:IMStatus` shows the current IM identifier via a Notice.
- **Content-type aware switching**: IM switching based on cursor context (e.g., auto-switch to English inside math blocks or code blocks) independently of vim mode. Users can implement this today by combining `vim.obsidian.im` with cursor position checks in Lua autocmds.
- **`CmdlineEnter`/`CmdlineLeave` for global ex command modal**: The global `:` modal in non-editor views (Obsidian `SuggestModal`) does not fire cmdline autocmd events. Only the codemirror-vim editor dialog fires them.
- **`CmdlineChanged` event**: An autocmd event that fires on each keystroke in the command-line prompt. Not needed for IM switching but useful for advanced Lua scripting.
- **`cmdline` text in event data**: Including the actual command text in `CmdlineLeave`'s event data. Currently only `cmdtype` (`:`, `/`, `?`) is provided.
- **Composition listeners on search dialog input**: The composition guard currently covers only the editor DOM element. CJK composition in the `/` search input is not tracked. This is acceptable because `CmdlineLeave` fires when the dialog closes (abandoning any active composition), but a more complete solution would track composition in the search input too.
- ~~**`loadInitLua()` parameter refactor**~~: Implemented. The function now takes `(app, vim, options?)` with a `LoadInitLuaOptions` interface.

## Intentionally not supported

These features are excluded by design and will not be implemented:

| Feature                         | Reason                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `jscommand` / `jsfile` in vimrc | Security risk — arbitrary JavaScript execution                                              |
| `cmcommand` in vimrc            | Broken in CodeMirror 6, never fixed upstream                                                |
| ~~Input method switching~~      | **Built-in** since v0.51.0 — see **Settings → Vim Motions → Input method**                  |
| ~~Yank highlighting~~           | **Built-in** since v0.47.0 — see **Settings → Vim Motions → Vim features → Yank highlight** |
| Reading view navigation         | Use the [vim-keynav](https://github.com/kometenstaub/obsidian-vim-keynav) plugin            |
| Vim toggle command              | Use the [vim-toggle](https://github.com/conneroisu/vim-toggle) plugin                       |
| Canvas keyboard navigation      | Canvas is a different rendering surface without CodeMirror                                  |

## Picker provider API and pop-out windows

The picker provider API (`window.VimMotions.picker`) is only available on the main Obsidian window. Pop-out windows have separate `window` objects and will not have access to the API. External sources registered via the main window work when the picker is opened from the main window.

## Bundled picker integrations

### Runtime plugin detection

The bundled picker integrations (Omnisearch, Tasks, Dataview) detect target plugins via `app.workspace.onLayoutReady()` at startup and via `reloadFeatures()` when integration settings are toggled. Obsidian does not emit events when community plugins are enabled or disabled at runtime (`app.plugins` has no event emitter — confirmed by runtime inspection of Obsidian v1.12.7). If a user enables Omnisearch/Tasks/Dataview after Vim Motions has loaded, the integration source will not appear until the user toggles the corresponding setting in **Settings → Vim Motions → Third-party integrations** (which triggers `reloadFeatures()`) or reloads Obsidian.

### API stability

The integrations use undocumented or internal APIs from each target plugin. These may change without notice:

- **Omnisearch**: Uses `globalThis.omnisearch.search(query)` — a public but untyped global. Duck-typed at registration time (`typeof search === 'function'`).
- **Tasks**: Uses `plugin.getTasks()` and `plugin.getState()` on the plugin instance — not part of the official `TasksApiV1` (which only exposes modal and toggle methods). The `obsidian-tasks-plugin:cache-update` workspace event is also undocumented.
- **Dataview**: Uses `DataviewAPI.pages()` — a well-established public API exposed via `window.DataviewAPI`. The most stable of the three.

All external API calls are wrapped in try/catch. If a target plugin changes its API shape, the integration silently degrades to empty results with a console warning.

### Deferred features

The following are intentionally not implemented in v1:

| Feature                            | Rationale                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dataview DQL query execution       | The picker is a navigation tool, not a query editor. DQL is complex and better served by Dataview's own code blocks. May be added as a separate `dataview-query` source if users request it.                                          |
| Task creation/editing from picker  | Write operations are out of scope for picker sources. Users can jump to the task and edit in-place. Tasks plugin's `apiV1.createTaskLineModal()` and `editTaskLineModal()` could be integrated as picker actions in a future release. |
| Multiple sub-sources per plugin    | Separate `tasks-overdue`, `tasks-today`, `dataview-query` sources would clutter the meta-picker. Prefer filter modes within a single source (e.g., query prefix `!` to show all tasks including completed).                           |
| Custom Dataview query in settings  | Pre-configured DQL filters would require a settings UI for query editing. Users who want filtered pages can use Dataview's own query blocks or write a custom provider via the picker API.                                            |
| Task filter modes                  | The `tasks` source currently shows all incomplete tasks. Modes like "due today", "overdue", or "all including completed" could be added via query prefix or a settings dropdown.                                                      |
| Version pinning for target plugins | The integrations duck-type API methods rather than checking version strings. If a breaking change occurs, the try/catch wrapper prevents crashes. Pinning would require maintaining a compatibility matrix.                           |

## Snippets

### Dynamic snippet limitations

- Dynamic snippet `f()` and `d()` nodes have a 50ms debounce on recomputation. Very rapid typing may show stale computed values for a brief moment.
- Lua function execution is time-guarded at 100ms per recomputation cycle. Functions exceeding this limit are skipped for that cycle.
- Dynamic snippets triggered via the completion menu expand with their static body only — the dynamic context is not activated. Use Tab expansion for full dynamic behavior.
- Nested `d()` nodes (dynamic nodes inside dynamic nodes) are not supported.
- User snippet directory scanning requires desktop — vault-relative paths work on mobile, but absolute paths and `~` expansion are desktop-only.

### Ex command snippet expansion

`:snippet <name>` and `:snippets` (picker) commands are registered but expansion via the test harness's `Vim.handleEx()` bridge does not produce visible results. The commands work correctly when typed directly in the ex command line. The issue is that `getActiveEditorView(app)` returns a view reference that differs from the adapter's CM6 view when invoked through the programmatic `handleEx` path. This is a test infrastructure limitation, not a user-facing bug.

## Vim keybindings in text areas

**Status**: Experimental (disabled by default). ([#69](https://github.com/saberzero1/motions/issues/69))

When enabled (**Settings → Vim Motions → Vim features → Vim keybindings in text areas**), focused `<textarea>` elements are replaced with a vim-enabled CodeMirror 6 editor overlay. The editor starts in insert mode — typing works immediately. Press Escape to enter normal mode for full vim editing (motions, operators, text objects, ex commands). A second Escape blurs the overlay and restores the original textarea. Content is continuously synced back to the hidden textarea (100ms debounce) with synthetic `input` and `change` events for host plugin compatibility.

Desktop only. Configurable via `vim.opt.vimtextareas = true` in Lua or `set vimtextareas` in vimrc.

### Sizing

The CM6 overlay uses adaptive height calculation to match the original textarea's dimensions. The wrapper's `minHeight` is set to the largest of the textarea's CSS height, its `scrollHeight` (actual content height), and a 100px floor. The `maxHeight` is capped at `max(effectiveHeight, 50vh)` — the overlay can grow with content up to half the viewport, then scrolls. The wrapper uses `overflow: auto` so content exceeding `maxHeight` gets a scrollbar.

~~Textarea vim overlay height collapses to near-zero~~ — Fixed. The 0.60.1 fix for unbounded growth locked `height` + `maxHeight` to the textarea's computed height, which could be very small for textareas with dynamic height (`height: auto` or content-dependent sizing). Replaced with the adaptive `minHeight`/`maxHeight` approach described above. ([#69](https://github.com/saberzero1/motions/issues/69))

~~Textarea vim overlay grows unbounded with content~~ — Fixed in 0.60.1 (replaced with the adaptive height approach above). ([#69](https://github.com/saberzero1/motions/issues/69))

### Scope

- Only `<textarea>` elements are replaced. `<input>`, `<select>`, and `contenteditable` elements are not affected.
- The plugin's own UI elements (picker, oil explorer, vim command-line panel) are never replaced.
- Disabled, readonly, and textareas inside existing CM6 editors or table cell editors are skipped.

### Content sync

Content is synced from the CM6 overlay to the hidden textarea via a debounced timer (100ms). A final `syncNow()` flush is performed in `teardownActive()` before the editor is destroyed, ensuring no edits are lost on rapid teardown (e.g., hint-mode clicking Save while a sync is pending).

~~Textarea content not synced when modal closed via hint mode~~ — Fixed. The `teardownActive()` method cancelled the pending sync timer and destroyed the editor without flushing. When the MutationObserver detected modal removal (e.g., after clicking Save via hint mode `f`), the debounced sync never completed and the host plugin read stale `textarea.value`. Now `syncNow()` is called before `editor.destroy()` in all teardown paths. ([#69](https://github.com/saberzero1/motions/issues/69))

### Limitations

- **`<input>` elements not supported** — only `<textarea>` elements are replaced. Inputs have too many conflicts with host plugin keyboard handling (Enter to submit, Tab to navigate, picker keybindings).
- **No `contenteditable` support** — contenteditable divs conflict with CM6 internals (which uses contenteditable itself).
- **No `<iframe>` support** — cross-origin iframe textareas are inaccessible; same-origin iframes would need per-document observer installation.
- **Framework re-render conflicts** — plugins using React, Svelte, or other frameworks may re-render the textarea, removing the CM6 overlay. The manager detects removal but does not retry replacement.
- **Programmatic value changes not detected** — if a host plugin sets `textarea.value` programmatically while the CM6 overlay is active, the overlay does not pick up the change. The synced value on blur will overwrite the programmatic change.
- **Popout windows not supported** — the `focusin` listener is installed on the main document only. Textareas in popout windows are not detected.
- **`maxlength` not enforced** — textareas with a `maxlength` attribute are not constrained in the CM6 overlay. Content exceeding `maxlength` will be truncated on sync-back by the browser.
- **Source-mode markdown highlighting** — the CM6 overlay uses Obsidian's source-mode rendering, which applies markdown syntax highlighting. This is cosmetic and does not affect the synced content.
- **`workspace.activeEditor` not set** — the overlay uses `skipActiveEditor: true` to avoid interfering with Obsidian's editor tracking. Plugins that check `workspace.activeEditor` will not see the textarea overlay as the active editor.

### Dynamic node (`d()`) test registration timing

Lua-defined `d()` snippets registered via `loadLuaConfig` in e2e tests may not appear in the snippet registry because `reloadFeatures()` called after Lua config load is short-circuited by the autocmd manager's `isFiring()` guard. The snippet registry IS rebuilt directly in `loadLuaConfigInternal` (bypassing `reloadFeatures`), but `d()` snippets defined in a test-specific `loadLuaConfig` call may not trigger this path correctly. The `f()` node tests pass because they benefit from the direct registry rebuild added to address this issue. This is a test lifecycle timing issue, not a runtime bug — real users defining `d()` snippets in `.obsidian.init.lua` will have them loaded correctly during normal plugin initialization.

## Fengari fork improvement opportunities

The plugin uses a [browser-only fork of fengari](https://github.com/saberzero1/fengari) for the Lua 5.3 runtime. The fork strips all Node.js dependencies but inherits several upstream limitations and introduces its own constraints. This section tracks potential improvements to the fork that would expand the Lua API surface, improve spec compliance, or unlock new features.

See `~/Repos/fengari/DIFFERENCES.md` for the full list of changes from upstream.

### 1. Coroutine↔Promise bridge (async Lua execution)

**Status**: Implemented (Phase 1–3). Callback contexts (keymap, autocmd, timer, user command) are async-capable. Init.lua async (Phase 4) and `require()` (Phase 5) remain deferred.

**Current state**: The fengari Lua VM is synchronous — `lua_pcall` runs Lua code to completion before returning to JS. Obsidian's vault API (`app.vault.read()`, `app.vault.cachedRead()`) is asynchronous (returns Promises). This mismatch blocks:

- `vim.ob.fs.read(path)` — reading vault files from Lua (documented in "Vault file reading" limitation above)
- Async `require()` — loading multi-file Lua configs from the vault
- Future HTTP/fetch APIs
- Chaining multiple async operations in Lua

**Approach**: Fengari supports `lua_yieldk` and `lua_resume`. The pattern would be:

1. Lua code calls a C-function (e.g., `vim.ob.fs.read`) that yields the current coroutine
2. The JS host receives the yield with a Promise attached
3. The JS host `await`s the Promise
4. The JS host calls `lua_resume` with the resolved value
5. Lua code continues as if the function returned synchronously

**Challenges**:

- Restructuring `engine.ts` execution from "run to completion" to "run, yield on async, resume when ready"
- All Lua code that calls async APIs must run inside a coroutine (top-level `init.lua` would need implicit wrapping)
- Error handling across the yield/resume boundary
- Instruction count hooks (`lua_sethook` with `LUA_MASKCOUNT`) must persist across yield/resume cycles
- Interaction with `vim.schedule` / `vim.defer_fn` / `vim.uv` timer callbacks that already use JS async primitives

**Blocks**: Async file reading, `require()` for vault Lua modules, HTTP APIs, streaming operations.

### 2. Custom `require()` for vault Lua files

**Status**: Implemented. Users can split `init.lua` config across multiple files.

`require('mymodule')` loads `.obsidian/lua/mymodule.lua` from the vault. Dot-separated names resolve to subdirectories (`require('utils.strings')` → `.obsidian/lua/utils/strings.lua`). Modules are cached in `package.loaded` — second `require` returns the same table. Circular requires are detected via a sentinel value in `package.loaded`.

`load(chunk)` is re-enabled as a sandboxed version (string compilation only, no file access). `dofile` and `loadfile` remain disabled.

Security: module names containing `..`, absolute paths, or null bytes are rejected with `"path traversal not allowed"`.

```lua
-- .obsidian/lua/keymaps.lua
local M = {}
function M.setup()
    vim.keymap.set('n', '<leader>f', ':find<CR>')
end
return M

-- init.lua
local keymaps = require('keymaps')
keymaps.setup()
```

### 3. 32-bit integer limitation

**Status**: Inherited from upstream. Not yet addressed.

**Current state**: Fengari uses 32-bit integers (`LUA_INT_TYPE=LUA_INT_LONG` equivalent) because JavaScript's `Number` type is a 64-bit float that cannot accurately represent integers beyond 2^53. Standard Lua 5.3 uses 64-bit integers.

**Impact**:

- `vim.uv.hrtime()` nanosecond timestamps overflow after ~2.1 seconds
- Bitwise operations on values > 2^31 produce incorrect results
- User Lua scripts ported from Neovim that assume 64-bit integer arithmetic may silently produce wrong results
- Unix timestamps will overflow in 2038

**Exploration paths**:

- **53-bit integers via `Number`**: Change `LUA_INT_TYPE` to use full 53-bit `Number` precision. Covers all practical use cases without performance penalty. Not full 64-bit but sufficient for timestamps, counters, and typical arithmetic.
- **64-bit integers via `BigInt`**: Full Lua 5.3 compliance. `BigInt` is available in all modern browsers/Electron. Tradeoff: `BigInt` operations are slower than `Number` operations, and `BigInt` cannot be mixed with `Number` in arithmetic expressions (requires explicit conversion at the JS↔Lua boundary).

**Blocks**: Spec compliance, Neovim config portability, correct bitwise operations.

### 4. `__gc` metamethods via FinalizationRegistry

**Status**: Inherited from upstream. Not yet addressed.

**Current state**: `__gc` metamethods are not called because fengari relies on JavaScript's garbage collector. Lua userdata objects are never finalized.

**Impact**:

- `vim.uv.new_timer()` objects leak if users forget `timer:close()` — no automatic cleanup
- Future Lua-side resource wrappers (file handles, DOM references) cannot implement RAII patterns
- Idiomatic Lua code using `__gc` for cleanup silently skips the finalizer

**Approach**: Use JavaScript's [`FinalizationRegistry`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry) to invoke `__gc` when userdata becomes unreachable. GC timing is non-deterministic (matching Lua's own semantics — `__gc` is never guaranteed to run at a specific time).

**Blocks**: Timer cleanup, resource management, future RAII patterns.

### 5. JavaScript RegExp exposed to Lua

**Status**: Not started. Low effort, medium impact.

**Current state**: Lua's built-in `string.find` / `string.match` / `string.gsub` use Lua patterns, which are less powerful than regular expressions. The plugin runs in a browser with native ECMAScript regex — this is an advantage over Neovim, where implementing ECMAScript regex in Lua is impractical (mini.snippets explicitly punted on snippet transforms for this reason).

**Approach**: Expose a `vim.regex(pattern, flags?)` Lua function that wraps JavaScript's `RegExp`:

```lua
local re = vim.regex("([A-Z][a-z]+)", "g")
local matches = re:match("HelloWorld")  -- {"Hello", "World"}
local result = re:replace("HelloWorld", "$1-")  -- "Hello-World-"
```

Implementation is a C-function (JS function in fengari) that creates a `RegExp` object and wraps `exec`/`test`/`match`/`replace` methods. This would also power snippet variable/placeholder transforms (`${1/regex/format/}`) from the Lua side.

**Blocks**: Snippet transforms, advanced text processing in Lua configs.

### 6. Re-enable `load()` with sandboxing

**Status**: Implemented (as part of `require()` support, item 2).

`load(chunk)` is available for string-only compilation. Returns the compiled function on success, or `nil` + error message on syntax error. `dofile` and `loadfile` remain disabled. The instruction count hook applies to loaded code. The sandboxed `load` is implemented in `src/lua/package.ts`.

### 7. `string.format` performance (sprintf-js replacement)

**Status**: Not started. Low effort, low-medium impact.

**Current state**: `string.format` is implemented via the `sprintf-js` npm package (the fork's sole runtime dependency). This package hasn't been updated since 2021 and parses format strings on every call.

**Impact**: `string.format` is one of the most-used Lua stdlib functions. Every `vim.notify`, `vim.inspect` output, and formatted log message goes through it. In hot paths (autocmd handlers, snippet recomputation), repeated format string parsing adds unnecessary overhead.

**Approach**: Replace sprintf-js with a purpose-built format function handling only Lua's format specifiers (`%d`, `%s`, `%f`, `%q`, `%x`, `%o`, `%e`, `%g`, `%c`, `%%`). Lua's format is a strict subset of C's `printf`. A custom implementation could cache parsed format strings for repeated calls.

### 8. Lua error message quality

**Status**: Not started. Low effort, medium impact.

**Current state**: When Lua code errors inside fengari, error messages sometimes include JavaScript stack traces mixed with Lua line information. This makes debugging `init.lua` configs harder for users.

**Approach**:

- Strip JS stack frames from error messages exposed to Lua `pcall`/`xpcall`
- Ensure Lua source file name and line number are formatted consistently with PUC-Rio Lua (e.g., `init.lua:42: attempt to index a nil value`)
- Improve `debug.traceback` output to produce cleaner Lua-only stack traces

### 9. Weak tables via WeakRef

**Status**: Inherited from upstream. High effort, low-medium impact.

**Current state**: Weak tables (`setmetatable({}, {__mode = 'v'})` or `__mode = 'k'`) are not supported. Tables always hold strong references. This breaks idiomatic Lua patterns for caches, observers, and memoization.

**Approach**: Use JavaScript's `WeakRef` and `FinalizationRegistry` to implement weak reference semantics. Every Lua value stored in a weak table would be wrapped in a `WeakRef`. This is architecturally complex — the performance implications of wrapping every table value need investigation.

**Blocks**: Idiomatic Lua cache patterns, observer patterns, memoization.

### 10. `collectgarbage("count")` diagnostic

**Status**: Inherited from upstream. Low effort, low impact.

**Current state**: `collectgarbage()` is a no-op. There is no way to query approximate memory usage from Lua.

**Approach**: Implement `collectgarbage("count")` to return approximate memory usage (could estimate from Lua object count or use `performance.memory` if available in Electron). Other modes (`collect`, `step`, `stop`, `restart`) remain no-ops. This enables users to diagnose memory issues in long-running Lua scripts.

### Priority summary

| #   | Improvement                            | Effort | Impact   | Blocks                                        |
| --- | -------------------------------------- | ------ | -------- | --------------------------------------------- |
| 1   | Coroutine↔Promise bridge              | High   | Critical | Async file read, `require()`, HTTP, streaming |
| 2   | Custom `require()` for vault Lua files | Medium | High     | Multi-file configs, config modularity         |
| 3   | 32-bit → 53-bit integers               | Medium | High     | Spec compliance, config portability           |
| 4   | `__gc` via FinalizationRegistry        | Medium | Medium   | Timer cleanup, resource management            |
| 5   | JS RegExp exposed to Lua               | Low    | Medium   | Snippet transforms, text processing           |
| 6   | Re-enable `load()` with sandboxing     | Low    | Medium   | Dynamic code generation, metaprogramming      |
| 7   | sprintf-js replacement                 | Low    | Low-Med  | Performance in hot paths                      |
| 8   | Error message quality                  | Low    | Medium   | User debugging experience                     |
| 9   | Weak tables via WeakRef                | High   | Low-Med  | Idiomatic Lua patterns                        |
| 10  | `collectgarbage("count")`              | Low    | Low      | Memory diagnostics                            |
