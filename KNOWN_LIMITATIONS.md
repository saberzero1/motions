# Known limitations

This document tracks known limitations, architectural constraints, and intentionally deferred features.

For previously fixed issues, see [Resolved Issues](#resolved-issues) at the bottom of this document.

## Lua configuration

**Status**: Implemented.

The plugin provides a Lua 5.3 runtime via a browser-only fork of fengari. Configuration is loaded from `init.lua` (or `.obsidian.init.lua`) and supports `vim.keymap.set`, `vim.opt`, `vim.fn`, `vim.api`, and more.

**Known limitations**:

### ~~Some `vim.opt` options not registered~~ (Fixed)

**Status**: Fixed. All documented `vim.opt` options are now registered in both `KNOWN_SET_OPTIONS` and `vim.defineOption`. ([#90](https://github.com/saberzero1/motions/issues/90))

12 plugin settings (`yankring`, `yankhighlightmode`, `yankhighlightduration`, `undotree`, `undofile`, `undotreemaxnodes`, `jumplist`, `jumplistsize`, `foldawarenavigation`, `foldpersistence`, `harpoon`, `dial`) were documented in the `vim.opt` table but never registered in `KNOWN_SET_OPTIONS` (the registry checked by the `vim.opt` proxy). Setting them via `vim.opt` or `:set` in vimrc produced `"unknown vim.opt option"` console warnings and had no effect. 10 of the 12 were also missing from the vimrc `:set` pathway (`vim.defineOption`); `jumplist` and `jumplistsize` already worked via `:set` but not via `vim.opt`. All 12 options now work identically across Settings UI, vimrc, and Lua.

### ~~Gutter settings ignored when set via vimrc or Lua~~ (Fixed)

**Status**: Fixed. Gutter-related settings (`number`, `relativenumber`, `numberwidth`, `linenumbermode`, `cursorline`, `cursorlineopt`, `signcolumn`, `statuscolumn`, `foldcolumn`) now take effect when configured via `.obsidian.vimrc` or `.obsidian.init.lua`. ([#101](https://github.com/saberzero1/motions/issues/101))

Two issues: (1) vimrc/Lua overrides were in-memory only — `saveSettings()` stripped them to preserve UI values, so they were lost on restart. CM6 gutter extensions are created at startup from persisted values, so the overrides never took effect. (2) `reloadFeatures()` never called gutter reconfiguration functions.

Fixed with a `configOverrides` persistence system: after vimrc/Lua loading, override values are captured in a `configOverrides` block in `data.json`. On next startup, these are merged on top of base settings before CM6 extensions are created. Gutter settings require one restart after the first config file change to take effect (same as the Settings UI). Also added gutter reconfiguration calls to `reloadFeatures()` for in-session changes.

Additionally, 27 settings that were previously UI-only are now configurable via vimrc/Lua: `subword`, `picker`, `pickerleadermappings`, `pickermatcher`, `pickeromnisearch`, `pickertasks`, `pickerdataview`, `ripgrep`, `ripgreppath`, `ripgrepargs`, `grepmode`, `oil`, `oilhiddenfiles`, `oilconfirmdeletethreshold`, `oilsort`, `hinthotkey`, `undotreeposition`, `undotreeautoopen`, `imswitching`, `impreset`, `imbinarypath`, `imobtainargs`, `imswitchargs`, `imdefaultnormal`, `imrestorebehavior`, `imdefaultinsert`.

### ~~`preVimrcSettings` shallow copy bug~~ (Fixed)

**Status**: Fixed. `preVimrcSettings` snapshot at line 677 now deep-copies `cursorShapes`, `modePrompts`, and `pickerKeymap`. Previously, nested objects shared references with `this.settings`, causing `Object.assign` mutations in `applySettingOverride` to leak through to `preVimrcSettings` — making `saveSettings()` accidentally persist overridden values (e.g., cursor shapes set via `set guicursor` in vimrc were permanently saved to `data.json`).

### ~~Clipboard/textwidth falsely shown as "Set by vimrc"~~ (Fixed)

**Status**: Fixed. The initial settings restoration at startup used `onSettingOverride()` for `clipboard` and `textwidth`, which wrote to `vimrcOverrides` even without a vimrc file. These settings appeared as "Set by vimrc" in the Settings UI and `saveSettings()` stripped them. Fixed by using direct side-effect calls (`setClipboardOption`, `setTextwidth`) that bypass the override pathway.

### Expr mapping limitations

- **String expr mappings are not supported** — `vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true })` requires Vimscript expression evaluation which is not available. Use a Lua function callback instead.
- **Async expr callbacks are not supported** — Expr callbacks run synchronously. Calling async APIs (e.g., `vim.ob.fs.read`) inside an expr callback will error. The callback must return a string immediately.
- **Expr results do not compose with pending operators** — When an expr mapping runs during operator-pending mode (e.g., `d` followed by an expr-mapped key), the returned keys execute independently. The pending operator state is cleared before the callback runs. `vim.v.operator` is still readable inside the callback.
- **Count is not auto-forwarded to expr results** — Typing `3K` where `K` is expr-mapped and returns `'j'` will execute `j` once, not three times. Include the count in the returned keys: `return vim.v.count1 .. 'j'`.

### vim.v limitations

- **`vim.v` values in async callbacks are only reliable before the first yield** — In async (non-expr) callbacks, `vim.v.count`, `vim.v.register`, and `vim.v.operator` reflect the values at callback start. After an async yield (`vim.ob.fs.read`, etc.), another callback may have overwritten these values. Read them into local variables at the start of your callback.
- **`vim.v.count` returns 0 outside callback context** — Reading `vim.v.count` from a timer, autocmd, or `vim.schedule` callback returns 0, not the count from the most recent command.

### vim.v deferred variables

The following `vim.v` variables are registered in the API and return default values, but are not yet populated by their respective subsystems. They will become active when the corresponding features gain Lua evaluation support:

- **`vim.v.foldstart` / `vim.v.foldend` / `vim.v.foldlevel` / `vim.v.folddashes`** — fold text evaluation context variables. Currently return 0/`''`. Will be populated when a custom `foldtext` Lua callback is added (deferred to statuscolumn/foldtext v2). Note: `foldlevel` calculation requires counting enclosing folds, which is not currently tracked by CM6's flat fold decoration system.
- **`vim.v.lnum` / `vim.v.relnum` / `vim.v.virtnum`** — statuscolumn per-line rendering context variables. Currently return 0. Will be populated when the statuscolumn format string gains Lua expression evaluation (deferred to statuscolumn v2). The injection point (`lineMarker()` in `statuscolumn.ts`) is identified; the variables have no consumer until Lua expressions are supported in the format string.
- **`vim.v.char`** — character typed during `InsertCharPre` autocmd. Currently writable but never set by the plugin. Will be populated when `InsertCharPre` is added to the supported autocmd events (requires a fork hook into insert-mode character input). Not in the current 19-event list.
- ~~**`vim.v.insertmode`**~~: Fixed. Returns `'i'` for insert mode, `'r'` for replace mode (`R`), `'v'` for virtual replace mode (`gR`), and `''` in normal/visual modes. Available in keymap function callbacks. Autocmd callbacks default to `''` (no adapter context available).

## Cross-note jump list

**Status**: Implemented.

The jump list tracks cursor positions across different notes, allowing you to navigate back and forth through your jump history using `<C-o>` and `<C-i>`. Jumps are recorded on cross-note navigation via `gd`/`gD`, picker file selection (all 14 sources), harpoon, oil, hint mode, ex commands (`:e`, `:find`, `:tabnew`, `:buffer`, `:bfirst`/`:blast`), structural buffer cycling (`]b`/`[b`), and Lua `vim.cmd("e ...")`. Standalone EasyMotion jumps are also recorded. Within-buffer jumps (G, gg, /, ?) are handled by the fork's built-in jump list and delegate to the original `jumpListWalk` action.

The plugin-level jump list is cross-note only — it stores `{ filePath, line, ch }` entries and only records when the source and destination files differ. The `jumpListWalk` action override peeks at the next entry: if it points to a different file, the override navigates cross-note; otherwise, it delegates to the fork's within-buffer handler.

New settings: `set jumplist` / `set nojumplist` (boolean, default true), `set jumplistsize=N` (number, default 200). Persists across sessions via `saveData()`. Handles file rename/delete via `vault.on('rename')`/`vault.on('delete')`.

`:jumps` ex command displays the jump list in a `VimInfoModal`.

**Remaining limitations**:

- **Cross-window (popout) jumps**: The jump list tracks positions across notes within the main Obsidian window but does not yet support jumps between the main window and popout windows.
- **E2E test coverage for cross-note `<C-o>`/`<C-i>`**: The `jumpListWalk` action override and within-buffer jump delegation are covered by passing E2E tests.

## Table cell vim modality

**Status**: Implemented.

The plugin uses Obsidian's native table editor for cell editing. `set tablewidget=native` (default) uses the native `cm-table-widget`. Cell editing uses native `TableCellEditor` instances created by Obsidian's `editTableCell()` method. Vim is injected into native cell editors via `registerEditorExtension()` propagation.

Three table editing modes are supported:

| `tableWidgetMode` | `enableTableNav` | Experience                                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `native`          | `true` (default) | Full table-nav overlay with cell highlighting and structural commands                       |
| `native`          | `false`          | Native table editor with vim cell editing and cross-cell h/j/k/l navigation, no nav overlay |
| `raw`             | either           | Raw markdown tables — no widget rendering                                                   |

A **table-nav overlay** activates when `enableTableNav` is on and `tableWidgetMode` is `native`. This mode allows cell navigation with `h`/`j`/`k`/`l` without entering the cell editor. Structural commands (`o`/`O`, `dd`, `dc`, `J`/`K`, `H`/`L`, `I`/`A`, `=`) are supported directly from the overlay. Pressing `i`/`a`/`c`/`s` or `Enter` enters the native cell editor. `Escape` exits table-nav.

**Cross-cell motions** (`h`/`j`/`k`/`l` crossing cell boundaries) are independent of the table-nav overlay. They activate whenever `tableWidgetMode` is `native`, regardless of `enableTableNav`. This allows using the native table editor with vim cell editing without the nav overlay intercepting every table entry.

- **Escape stays in cell**: Escape in normal mode stays in the cell (matches Obsidian's built-in vim behavior). Tab/Shift-Tab navigate between cells.
- **`h`/`j`/`k`/`l` cross-cell navigation**: In normal mode, `h`/`l` at cell boundaries move to the adjacent cell (same row). `j`/`k` at row boundaries move to the same column in the next/previous data row (separator rows are skipped). `j` at the last data row or `k` at the header row exits the table. When the cursor is not at a cell boundary, `h`/`j`/`k`/`l` move the cursor within the cell as normal vim motions. Operator-pending (`dj`, `yl`) and visual mode motions stay within the cell.
- **Register sharing**: Vim registers are shared between cell editors and the main editor via the fork's `vimGlobalState` singleton. Yank in one cell, paste in another.
- **Status bar sync**: The mode tracker reads vim mode from the cell editor's CM6 instance when a cell editor is active, so the status bar reflects the cell editor's mode (insert/normal/visual).
- **`ir`/`ar` table row text objects**: `ir` selects inner row content (between first and last `|`, excluding pipes), `ar` selects the entire row including pipes. Works in raw markdown mode only — inside cell editors, the content doesn't match `TABLE_RE` so these are no-ops (correct behavior).

**Remaining limitations**:

- **Cross-cell editing via Tab exits table-nav**: Pressing `Tab` in a cell editor navigates to the next cell via Obsidian's native handler, which bypasses the table-nav controller. `h`/`j`/`k`/`l` in normal mode within a cell editor correctly return to table-nav.
- **Count prefixes not supported**: `3j` in table-nav mode performs a single crossing, not three.
- **Visual-cell selection not supported**: Selecting multiple cells via visual mode is not implemented.
- **Dot-repeat for structural commands not supported**: Structural commands (`dd`, `o`, etc.) cannot be repeated with `.`.
- **Cross-cell word motions**: `w`/`b`/`e` at cell boundaries do not jump to the next cell. Only `h`/`j`/`k`/`l` cross cell boundaries.
- **Count prefix on cross-cell motions**: `3j` in a cell performs a single crossing, not three. The count is consumed but only one cell boundary is crossed per keystroke.
- **Visual block mode across cells**: `<C-v>` operates within a single cell editor only.
- **Ex commands from cell editors**: `:w` saves the main document (expected). `:q` closes the main tab (documented as expected behavior for v1).
- **Fine-grained undo**: Cell edits are atomic in the main document's undo stack. Individual keystrokes within a cell editor are not separately undoable in the main editor.
- **Animated cursor does not animate between cells**: When the animated cursor is enabled, cross-cell navigation (`h`/`j`/`k`/`l`) snaps the cursor to the destination cell instead of smoothly animating the transition. Each cell editor has its own `CursorController` instance — crossing cells destroys one and creates another. A token-based position handoff seeds the new controller from the old controller's screen position, but the global canvas (`position: fixed` on `.app-container`) renders behind table cell content due to CSS stacking contexts, so the transition animation is not visible. The native vim cursor (BlockCursorPlugin) is used as the steady-state renderer inside cells. Within a single cell, cursor movement animates normally via the native vim cursor's blink/redraw cycle.
- **Which-key in embedded editors**: Which-key popups work in table cell editors and textarea vim overlays (bundled vim mode only). The popup renders in the parent `MarkdownView.contentEl` (or `.modal-container` for textarea overlays in modals). User keymaps are fully available — the codemirror-vim keymap is global (`defaultKeymap` at module level). Embedded editors bypass the which-key show delay for immediate feedback. Settings hot-reload does not update active embedded editors (acceptable — they are short-lived); the next editor opened picks up updated config.
- ~~**Viewport does not follow cursor in long tables**~~: Fixed. In table-nav mode, navigating past the visible viewport left the highlighted cell off-screen. CM6 cannot scroll to positions inside opaque block widgets. Fixed with an `EditorView.scrollHandler` facet that intercepts scroll requests during table-nav and adjusts `scrollDOM.scrollTop` based on the highlighted cell's DOM bounding rect. ([#136](https://github.com/saberzero1/motions/issues/136))
- ~~**Cross-cell cursor bounce-back on macOS**~~: Fixed. `scheduleCrossing()` deferred focus changes raced with Obsidian's table widget handlers on macOS Electron. Replaced `MessageChannel` with `requestAnimationFrame` to defer until after the full event dispatch cycle. ([#136](https://github.com/saberzero1/motions/issues/136))
- ~~**Escape does not return to table-nav after Enter cell entry**~~: Fixed. The cell editor's vim keydown observer consumed Escape before the Scope handler could intercept it, and the cell editor's vim state had `mode: null` during initialization causing `isVimIdle()` to return false. Fixed with a capture-phase `keydown` listener and `isCellVimIdle()` that treats null mode as idle. ([#136](https://github.com/saberzero1/motions/issues/136))

### Fixed in native table editor migration

The following issues from the old custom table widget/cell editor implementation are resolved by the migration to Obsidian's native table editor:

- ~~**Cannot leave table downwards when on last line of document**~~: Fixed. ([#119](https://github.com/saberzero1/motions/issues/119))
- ~~**Unhandled keys swallowed in cell selection mode**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Which-key popups missing in cell selection mode**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Picker focus stays on table widget**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Table-nav key handler intercepts keys during modal/picker interaction**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Modifier key combos consumed by vim during cell selection**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Ex command dialog keys consumed by table-nav handler**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Clicking outside table in embedded mode does not exit table-nav**~~: Fixed. ([#121](https://github.com/saberzero1/motions/issues/121))
- ~~**Click-outside handler exits during modal interaction**~~: Fixed. ([#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Header-only tables enter table-nav**~~: Fixed. ([#121](https://github.com/saberzero1/motions/issues/121))
- ~~**Stale table-nav state after document content replacement**~~: Fixed. ([#119](https://github.com/saberzero1/motions/issues/119), [#120](https://github.com/saberzero1/motions/issues/120))
- ~~**Cursor displacement when entering table-nav**~~: Fixed. ([#121](https://github.com/saberzero1/motions/issues/121))
- ~~**Cell editor cursor shapes**~~: Fixed. Native cell editors receive focus correctly — no `.cm-focused` dynamic stylesheet hack needed.
- ~~**Wikilink cursor displacement in table cells**~~: Fixed. The native editor handles wikilink rendering at the decoration layer, eliminating the cursor displacement that affected the old custom widget. ([#121](https://github.com/saberzero1/motions/issues/121))
- ~~**Pipe character (`|`) swallowed in table cells**~~: Fixed. The native editor automatically escapes `|` as `\|` in the document source.
- ~~**`<br>` conversion in cell editors**~~: Fixed. The native editor handles `<br>` ↔ newline conversion automatically. The `cellBrToNewline`/`cellNewlineToBr` utilities are removed.

- ~~**Visual mode highlighting in cell editors**~~: Fixed. Charwise visual mode (`v`) in cell editors now shows selection highlighting via a `CSSStyleSheet` on `document.adoptedStyleSheets` that forces `::selection` visibility in `.cm-vimVisual:not(.cm-vimVisualLine)` scoped to `.vim-table-cell-editor`. Linewise visual mode (`V`) uses the fork's `linewiseVisualHighlight` ViewPlugin, which is focus-independent (checks `vim.visualLine` and `vim.sel` only). ([#19](https://github.com/saberzero1/motions/issues/19))
- ~~**Wikilink and formatting loss after cell edit**~~: Fixed. Two issues: (1) the cell editor read the cell's initial value from `wrapper.textContent` (the rendered DOM), which strips markdown syntax — `[[note-a]]` became `note-a`. Now reads raw markdown from the document source via `getCellDocumentRange()`. (2) On cell editor close, the cell content was restored as plain `textContent` without re-rendering. Now uses `MarkdownRenderer.render()` to restore proper inline formatting (wikilinks, bold, italic, code) after the editor is destroyed. ([#19](https://github.com/saberzero1/motions/issues/19))
- ~~**Tab cell navigation freezes editor**~~: Fixed. Pressing `Tab` in insert mode inside an embedded table cell editor froze the editor — the cursor disappeared, vim mode got stuck in Insert mode, and `Escape` stopped working. Root cause: `exitCellEdit()` scheduled a 50ms `refreshAfterOp()` timer that was non-cancellable and had no state guard. When `Tab` called `exitCellEdit()` → `enterCellEdit()` synchronously, the deferred refresh fired while the new cell editor was active — removing its key handlers, potentially orphaning the editor DOM, and leaving the controller in an inconsistent state. Fixed with defense-in-depth: cancellable/deduplicated refresh timer, state guard in `doRefreshAfterOp`, `skipRefresh` parameter for Tab transitions, and belt-and-suspenders timer cancel in `enterCellEdit`. Tab at boundary cells (last cell + Tab, first cell + Shift-Tab) now returns to table-nav mode instead of silently re-entering the same cell. ([#92](https://github.com/saberzero1/motions/issues/92))
- ~~**Enter in cell editor breaks table structure**~~: Fixed. Pressing Enter in insert mode inside an embedded table cell editor inserted a literal newline into the cell content. Upon exiting the table, the multi-line content was written back into the single-line table row, breaking the markdown table structure — the second line appeared outside the table. Fixed by converting newlines to `<br>` tags on cell editor close (`cellNewlineToBr`) and converting `<br>` tags back to newlines on cell editor open (`cellBrToNewline`). This preserves multi-line cell content using standard HTML `<br>` tags that Obsidian renders correctly within table cells. Both helpers are in `table-utils.ts` and handle all `<br>` variants (`<br>`, `<br/>`, `<br />`, case-insensitive). ([#115](https://github.com/saberzero1/motions/issues/115))
- ~~**Multiple tables per note — wrong table selected**~~: Fixed. In embedded mode, when a note contained two or more tables, entering table-nav mode on any table other than the first always attached the cell highlight, key handlers, and cell editor to the first table's DOM widget. Root cause: `findWidgetEl()` in `table-nav-controller.ts` queried all `.vim-table-rendered` elements and returned the first match without considering which table the cursor was in. Fixed by adding a `tableFrom` parameter to `findWidgetEl()` and using CM6's `view.posAtDOM()` to correlate each widget element with its document position, returning the nearest match. Additionally, exiting cell edit mode on the second table caused the cursor to jump back to the first table. Two sub-bugs: (1) `activeEditTableRange` was cleared before transactions that modify the document (`closeCellEditor` dispatch, `tableRealign` dispatch), causing `buildDecorations` to create a `Decoration.replace` widget for the active table and displacing the cursor — fixed by keeping `activeEditTableRange` set throughout the exit and refresh lifecycle, ensuring the StateField fast-path (`prev.map(tr.changes)`) fires during all document-changing dispatches. (2) After `tableRealign`, `doRefreshAfterOp` used `Array.find()` with a 200-position threshold to re-locate the table, which returned the **first** table within range rather than the **closest** — with two tables less than 200 positions apart, the first table always matched. Fixed by replacing `Array.find` with a nearest-match loop. ([#117](https://github.com/saberzero1/motions/issues/117))

## Undo tree visualization

**Status**: Implemented.

Shadow undo tree tracking branching history parallel to CM6's linear undo stacks. `g-`/`g+` navigate chronologically across all branches with ChangeSet-based buffer content restoration. `:earlier`/`:later` navigate by count, time (`Ns/Nm/Nh/Nd`), or save point (`Nf`). Sidebar view with DOM tree rendering, click/keyboard navigation, collapse/expand. Optional persistence via `set undofile`.

**Known limitations**:

- **ChangeSet composition for deep navigation**: Navigation dispatches sequential `addToHistory.of(false)` transactions (one per tree node on the path). For very deep trees (50+ levels), this dispatches many transactions — imperceptible in practice but theoretically slower than single-transaction composition.
- **Persistence after external file modification**: When `undoFile` is enabled and the file is modified outside Obsidian between sessions, persisted ChangeSets become invalid (document length mismatch). The tree structure is preserved for `:undolist` display, but navigation is disabled for that session. An Obsidian Notice is shown when a stale tree is detected (once per file per session). Detection uses file size comparison — same-length substitutions are not caught.
- ~~**Per-file tree map memory**~~: Fixed. Undo trees are now evicted from memory when all editors for a file are closed (on `active-leaf-change`). Dirty trees are persisted before eviction when `undoFile` is enabled. Persisted data on disk is not deleted — reopening the file restores from persistence or starts fresh.
- **No CM6 undo stack integration for cross-branch navigation**: `g+`/`g-` use `addToHistory.of(false)` transactions, so pressing `u` after `g-` undoes the last user edit, not the navigation. This matches Neovim behavior.

## Flash motions

**Status**: Working (Phase 1 + Phase 2 + Phase 3).

Flash-style enhanced `f`/`F`/`t`/`T` motions show labels on all visible matches when 2+ matches exist. Single-match cases autojump (stock Vim behavior preserved).

**Known limitations**:

- ~~**Highlight rectangles hardcoded to 8×16px**~~: Fixed. Highlight boxes now dynamically measure actual character dimensions via `coordsAtPos()`. CSS uses custom properties (`--vim-motions-flash-w`, `--vim-motions-flash-h`) with fallbacks for user CSS snippet compatibility. ([#75](https://github.com/saberzero1/motions/issues/75))
- ~~**Labels obscure matched text**~~: Fixed. Labels are now positioned at the END of the matched text (after the last matched character), matching flash.nvim's default `after = true` behavior. Match highlights render behind labels during the label phase. During label narrowing, match highlights persist for all targets while only labels narrow. ([#75](https://github.com/saberzero1/motions/issues/75))
- **EasyMotion label shift**: Labels for EasyMotion motions (word, char, line, search) now appear one character to the right of the target — after the target character instead of on top of it. This is a deliberate change matching the label-after-match positioning used by flash. The jump destination is unchanged.
- **Label vertical centering**: Labels are vertically centered within the line height. On lines with taller fonts (headings), labels sit centered rather than top-aligned. Enable `set labelmatchfontsize` to scale label font to match the target line's font size (e.g., larger labels on headings, matching Neovide-style behavior). Disabled by default.
- ~~**Line motions target hidden formatting in Live Preview**~~: Fixed. EasyMotion line motions (`<leader><leader>j`/`k`) now skip hidden markdown formatting (heading markers, bold/italic syntax) in Live Preview using `skipHiddenPrefix()` to find the first visually visible character via `coordsAtPos()`. ([#79](https://github.com/saberzero1/motions/issues/79))
- **RTL (right-to-left) label positioning**: Jump labels always appear to the right of the target, which is incorrect for RTL text. When Obsidian's editor direction is set to RTL, labels should appear to the left. No existing jump-label implementation (flash.nvim, leap.nvim, vim-easymotion, VSCodeVim, AceJump) handles RTL — this is a universally unaddressed problem. Obsidian provides per-line RTL detection via `dir` attributes on `.cm-line` elements, and CM6 offers `EditorView.textDirectionAt(pos)`. A proper fix requires per-target direction detection, flipped label placement, adjusted collision logic, and RTL testing infrastructure. Deferred as a separate feature. ([#79](https://github.com/saberzero1/motions/issues/79))
- **No macro recording**: Flash label selection is not recorded in macros. Macros capture the search character (`f{char}`) but not the label keypress. This is the same limitation as EasyMotion.
- ~~**No dot-repeat for label selection**~~: Clarified. Dot-repeat after `df{char}{label}` already works correctly — the fork stores the resolved position via `_asyncMotionTarget` and `repeatLastEdit` replays the operator to the same relative offset. The label UI does not re-appear during dot-repeat, which is correct vim behavior (Neovim's `.` never re-shows interactive selection UI).
- **No remote operations**: flash.nvim's remote mode (`yr{target}` to yank at a distance without moving cursor) is not implemented. This requires vim state manipulation not available in the codemirror-vim fork.
- **No treesitter mode**: flash.nvim's treesitter node selection is not feasible — CM6 uses Lezer, not treesitter, and does not expose node selection APIs.
- ~~**Count prefix ignored with labels**~~: Fixed. `3f{char}` now jumps directly to the 3rd match without showing labels. When the count exceeds available matches, the last match is used (Neovim parity). `f{char}` without a count prefix still shows labels for 2+ matches. Works in operator-pending mode (`d3f{char}`) and with `t`/`T` till motions.
- **Multi-line `t` column 0**: When `flashmultiline` is enabled and `t{char}` finds a match at column 0 of a line, that target is excluded (the "before" position would wrap to the previous line).
- **Programmatic Escape**: Flash labels can only be dismissed by DOM keyboard events (real keypresses). Programmatic `Vim.handleKey(adapter, '<Esc>')` does not reach the label handler. This mirrors the same limitation in EasyMotion.
- **Jump mode key binding is registration-time**: Changing `flashjumpkey` at runtime requires a plugin reload or settings change that triggers `reloadFeatures()`. The key is bound via `mapCommand` during registration.
- **Jump mode overrides `s`**: When enabled, `s` in normal mode triggers flash jump instead of substitute (`cl`). Visual mode `s` retains its default `c` mapping.
- ~~**Jump mode `s` conflicts with surround `cs`/`ys`/`ds`**~~: Fixed. The operator-prefix shadow resolver (see [Operator-prefix key dispatch](#operator-prefix-key-dispatch-timeoutlen)) automatically defers flash's `s` motion when surround's `s<character>` action is a partial match in operator-pending mode. `cs"`, `ds"`, `ysiw"` work correctly with flash jump enabled. The resolver uses a configurable timeout (`operatorshadowtimeout`, default 1000ms) — if no surround target character arrives within the window, the flash motion executes as fallback.
- **clever-f 5s timeout**: The clever-f repeat detection uses a 5-second window. After 5 seconds, `f{same-char}` is treated as a new flash search.
- **Incremental jump check_jump**: When `pattern.length >= minPatternLength`, typed characters are checked as labels first, then as search extensions. A character that matches both a label and a valid search continuation will jump rather than narrow. Below `minPatternLength`, all characters extend the search pattern.
- **skipChars same-line only**: Label conflict skipping only checks the character immediately after each match on the same line. Matches at end-of-line do not conflict with any label.
- **Search mode post-commit only**: Flash search labels appear AFTER committing a `/` or `?` search with Enter, not during typing. This is a deliberate simplification from flash.nvim to avoid label-vs-search-char disambiguation. Labels auto-clear on any non-label key.
- **Search mode single match**: Labels are only shown when 2+ matches exist. Single-match searches navigate directly without labels.
- **Search labels with `*`/`#`**: Word-under-cursor search (`*`/`#`) does not trigger flash search labels because it bypasses the search dialog.
- ~~**Labels missing from top half of viewport with frontmatter scrolled off-screen**~~: Fixed. In Live Preview mode, when frontmatter properties were collapsed into a widget and scrolled off-screen, flash labels only appeared in the bottom half of the viewport. Root cause: `getVisibleRange()` in `src/easymotion/targets.ts` used `view.lineBlockAtHeight()` to determine visible document lines, but CM6's height map uses estimated heights for off-screen widgets — the collapsed frontmatter widget's estimated height differed from its actual rendered height, causing `coordsAtPos()` to return `null` for targets near the viewport top. Fixed by using `view.visibleRanges` (which reflects actually-rendered document ranges) instead of `lineBlockAtHeight`. This also affected EasyMotion target scanning. ([#114](https://github.com/saberzero1/motions/issues/114))

## Operator-prefix key dispatch (`timeoutlen`)

**Status**: Implemented (operator-prefix shadow resolver).

The codemirror-vim fork implements an operator-prefix shadow resolver for disambiguating multi-key sequences that share a prefix with operator keys. When an operator is pending (`c`/`d`/`y`/etc.) and the next keystroke fully matches a motion but also partially matches an `operatorPending` action (e.g., surround's `s<character>`), the resolver defers to the partial match — waiting for the next character to disambiguate. A configurable timeout (`operatorshadowtimeout`, default 1000ms matching Neovim's `timeoutlen`) falls back to executing the deferred motion if no next key arrives.

This resolves the `cs`/`ys`/`ds` vs flash `s` conflict: when the user types `c` then `s`, the resolver waits for the surround target character instead of immediately executing the flash motion. The resolver supports arbitrary-length operator-shadow mappings.

Settings: `set operatorshadowtimeout=1000` (vimrc), `vim.opt.operatorshadowtimeout = 1000` (Lua), or **Settings → Vim Motions → Vim engine → Operator shadow timeout**. Set to `0` to disable (immediate motion execution, upstream behavior).

**Not in scope**: Full non-operator `timeoutlen` — keys that are both a built-in prefix and a mapping prefix (e.g., remapping `g` to something other than a prefix) are not covered by the operator-prefix resolver. The existing `keyBuffer` partial match system handles `g`/`z`/`<C-w>` prefixes without timeouts (matching Neovim's behavior for built-in multi-key commands). Full non-operator `timeoutlen` would require a global key dispatch rewrite with broader UX implications and is deferred unless demand arises.

## ~~Insert-mode surround dot-repeat~~ (Fixed)

**Status**: Fixed. `.` after `i<C-G>s{char}text<Esc>` now replays the full surround + typed text. This exceeds both vim-surround and nvim-surround, where insert-mode surround dot-repeat is broken ([nvim-surround #301](https://github.com/kylechui/nvim-surround/issues/301)). ([#82](https://github.com/saberzero1/motions/issues/82))

The fork stores `_surroundInsertChar` and `_surroundInsertNewline` on `lastInsertModeChanges` during `surroundInsert`/`surroundInsertNewline`. During replay, `replaySurroundAwareInsert` (inside `repeatLastEdit`) strips the delimiter entry from `changes[0]`, inserts `pair.open`, replays typed text, then inserts `pair.close`. Wrapped in `cm.operation()` for undo atomicity. Counted dot-repeat (`2.`) repeats the text inside one set of delimiters. Surround metadata is cleared in `recordLastEdit` (new session), `onCursorActivity` (cursor movement), and `createInsertModeChanges` (default init) to prevent cross-session leakage. Text typed before `<C-G>s` in the same insert session is not preserved in dot-repeat, matching canonical behavior.

## Insert-mode surround macro recording

**Status**: Known limitation.

`<C-g>s{char}` keys typed during insert mode are not logged to the macro key buffer. This is a pre-existing limitation of the fork's insert-mode macro key logging (`logKey` is only called from `handleKeyNonInsertMode`, not from `handleKeyInsertMode`).

## ~~Surround does nothing on doubled symmetric delimiters~~ (Fixed)

**Status**: Fixed. `ds$` on `$$example$$` now correctly deletes the innermost `$` pair to produce `$example$`. ([#96](https://github.com/saberzero1/motions/issues/96))

`findSurroundingQuotes()` in the codemirror-vim fork used sequential pairing (`i += 2`) over collected quote positions. For `$$example$$` with positions `[0, 1, 9, 10]`, this created pairs `(0,1)` and `(9,10)` — the two adjacent `$$` on each side — and the cursor between them matched neither. `ds$`, `cs$`, `ds"` on `""hi""`, and other doubled symmetric surround characters all silently did nothing.

Fixed by replacing sequential pairing with cursor-expansion: search backward from cursor for the nearest quote (open), then forward for the next one (close). This handles both doubled delimiters and adjacent pairs (`"hello" "world"`) correctly.

## EasyMotion operator-pending mode

**Status**: Working via fork's async motion support.

`d<leader><leader>w{label}` (delete to an EasyMotion target) works natively through the codemirror-vim fork's async motion system. EasyMotion motions are registered via `defineMotion` and return a `Promise<Pos>`. The fork's `evalInput` resolves the promise and applies the pending operator (`d`, `c`, `y`) to the resulting position.

Visual mode (`v` + easymotion) also works — the fork updates the visual selection head/anchor when an async motion resolves during visual mode.

**Remaining limitations**:

- ~~Dot-repeat (`.`) does not replay operator-pending easymotion operations~~ — Fixed. The fork now stores the resolved async motion position as a relative offset in `lastEditInputState._asyncMotionTarget`. During dot-repeat, `repeatLastEdit` applies the operator with the stored offset instead of re-executing the async motion overlay.
- Char-based easymotions (`f`, `F`, `s`, `t`, `T`) in operator-pending mode require an intermediate search-character keypress which adds complexity to the async flow
- ~~Capital letter (Shift+key) search not working~~ — Fixed. `waitForKey()` resolved on the `Shift` keydown event before the actual character arrived. The modifier-key guard (`e.key.length !== 1`) now suppresses modifier-only keys, matching `waitForLabel()`'s existing pattern. ([#84](https://github.com/saberzero1/motions/issues/84))
- ~~Inclusive motions (`f`, `t`, `e`) exclude the target character in operator-pending mode~~ — Fixed. EasyMotion motions were registered with empty `motionArgs`, so the fork treated all motions as exclusive. Added per-motion `motionArgs: { inclusive: true }` matching native Vim semantics. ([#109](https://github.com/saberzero1/motions/issues/109))
- EasyMotion line motions (`j`/`k`) operate characterwise instead of linewise in operator-pending mode. Native Vim `j`/`k` have `motionArgs: { linewise: true }`, but EasyMotion line motions do not set this flag. `d<leader><leader>j{label}` deletes from cursor to the beginning of the target line (characterwise), not two full lines (linewise)
- EasyMotion forward motions do not set `motionArgs.forward`, so the fork's `clipToLine` function (which clips trailing newline+whitespace for multi-line forward operations) does not fire. For typical single-line EasyMotion jumps this has no effect; for cross-line `f`/`w`/`e` jumps, trailing whitespace may be included in the operation range where native Vim would clip it
- `EXTRA_DEFS` bidirectional motions (`easyMotionBdWord`, `easyMotionBdEndWord`, etc.) are registered via `defineMotion` only, without `mapCommand`. They cannot receive `motionArgs` and therefore have no `inclusive` flag. When invoked in operator-pending mode via Lua `vim.keymap.set` remapping, they always behave exclusively
- `easyMotionRepeat` uses `cm.setCursor()` directly instead of going through the codemirror-vim operator infrastructure. Repeating an EasyMotion motion works for normal-mode jumping but does not support operator-pending repeat (the `inclusive` flag from the original motion is not preserved)

**Test coverage**: `test/specs/easymotion-comprehensive.e2e.ts` validates d/c/y + easymotion flows and capital letter char search.

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

Delimiters inside fenced code blocks are excluded from the scan — the scanner skips lines within ` ``` ` fences. Indented code blocks and inline code are not excluded. Fenced code blocks inside blockquotes (` > ``` `) are now detected — `findFenceLines` matches fences with blockquote prefixes (`/^(?:>\s*)*```/`) and ensures open/close fences have matching blockquote depth.

## Table navigation and editing

`]|`/`[|` (or `]c`/`[c`) navigate horizontally between table cells. `]r`/`[r` navigate vertically to the same column in adjacent rows (skipping separator rows). `i|`/`a|` text objects operate on individual cells — `di|` deletes cell content, `ci|` changes it, `vi|` selects it.

`:tablerealign` (or `<Leader>tr`) reformats a table so all columns have uniform width, respecting `:---`/`---:`/`:---:` alignment markers in separator rows.

Auto-format: ~~typing `|` in insert mode on a table line triggers automatic column realignment~~ — replaced with format-on-exit. Tables are now automatically realigned when the cursor leaves the table range after editing. No formatting happens mid-edit, so the cursor stays where you expect it. Typing `||` on a new line within a table generates a separator row matching the header's column count. Manual realignment is available via `<Leader>tr` or `:tablerealign`. ([#66](https://github.com/saberzero1/motions/issues/66), [#67](https://github.com/saberzero1/motions/issues/67))

~~Typing `|` moves cursor to the left of `|`~~ — Fixed. The mid-edit `|` interception that caused cursor jumps has been removed. ([#66](https://github.com/saberzero1/motions/issues/66))

~~Escaped `\|` characters treated as cell boundaries during editing~~ — Fixed. Escaped pipes, wikilinks (`[[page|alias]]`), and other `|`-containing inline syntax are no longer mishandled during table editing because the auto-format no longer runs mid-edit. In `native` mode, the native editor automatically escapes `|` as `\|` in the document source. ([#67](https://github.com/saberzero1/motions/issues/67))

The following are intentionally not implemented:

- ~~**`j`/`k` column tracking**~~: Fixed. `h`/`j`/`k`/`l` now cross cell boundaries in native table cell editors via `defineMotion` overrides. The overrides delegate to the originals outside table cells, preserving stock vim behavior.
- **`Tab`/`Shift-Tab`**: These conflict with Obsidian's built-in table Tab handling and insert-mode tab completion.

## Table widget in Live Preview

The plugin uses Obsidian's native table editor in Live Preview. Two rendering modes are available via `set tablewidget`:

- **`native`** (default): Uses Obsidian's built-in `cm-table-widget`. Vim is injected into cell editors via `registerEditorExtension()`. The native editor handles wikilinks, pipe escaping, cursor positioning, and `<br>` conversion automatically. Cross-cell `h`/`j`/`k`/`l` navigation is always active in native mode, independent of the `tablenav` setting.
- **`raw`**: Always shows raw markdown table syntax. No widget rendering. Useful for users who prefer source-style editing in Live Preview.

Old values (`off`, `cursor`, `always`, `embedded`) are automatically migrated to `native` or `raw`.

~~**Cursor disappears when entering a table in source mode or raw mode**~~: Fixed. The `mainEditorTableCursorGuard` suppressed the vim cursor whenever the cursor entered a text range matching table syntax (lines starting with `|`), regardless of whether a native table widget was actually visible. In source mode (no `.cm-table-widget` elements) and raw mode (widgets hidden via `display: none`), the cursor was suppressed with no alternative cursor shown. Fixed by adding a `hasVisibleTableWidget()` check that verifies at least one `.cm-table-widget` element with a non-null `offsetParent` exists before suppressing the cursor. This also short-circuits the `findTableRanges()` document scan when no visible widgets exist. This same root cause made table navigation with `enableTableNav=false` appear broken — cursor movement worked but the invisible cursor made it seem like `j`/`k`/`↓`/`^N` had no effect. ([#132](https://github.com/saberzero1/motions/issues/132), [#136](https://github.com/saberzero1/motions/issues/136))

**Table manipulation commands** (`<Leader>t` prefix and ex commands like `:tablerowafter`) call Obsidian commands via `executeCommandById`. In `native` mode, the native table widget is present and these commands work as expected.

## Vimrc soft-reload

Vimrc maps and settings are soft-reloaded when the vimrc file is modified — changes to `nmap`, `set`, and other map/setting commands take effect without reloading the plugin. The plugin watches the vimrc file via `vault.on('modify')` and re-applies maps and settings on change.

~~**Limitation**: `exmap` definitions only parsed during initial load~~ (Fixed). `exmap` definitions are now soft-reloaded — `softReloadVimrc()` calls `applyVimrcCommands()` which processes `exmap` entries, and `vim.defineEx()` replaces existing handlers. Adding, modifying, replacing, or removing `exmap` entries takes effect on save. The fork's `undefineEx()` API cleans up stale handlers — exmap names are tracked per vimrc load and unregistered before re-applying on soft-reload.

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

All vim engine settings (clipboard, tabstop, shiftwidth, expandtab, pcre, insertmodeescape, insertmodeescapetimeout, operatorshadowtimeout, textwidth) are now re-applied on plugin load from saved settings. Previously, only clipboard, textwidth, and pcre were synced at startup — the remaining six settings (insertmodeescape, insertmodeescapetimeout, operatorshadowtimeout, tabstop, shiftwidth, expandtab) were only pushed to the vim engine when the user actively changed them in the Settings UI or when a vimrc/Lua config file set them. Restarting Obsidian would lose the vim engine state even though the setting was saved to disk. This was the root cause of insert escape sequences configured via the Settings UI not working on mobile (iPad with Magic Keyboard). ([#56](https://github.com/saberzero1/motions/issues/56), [#125](https://github.com/saberzero1/motions/issues/125))

On Obsidian 1.13+, the declarative settings system (via `setControlValue`) now forwards vim engine setting changes to `vim.setOption()` in addition to persisting them. Previously, only the pre-1.13 imperative settings tab called `vim.setOption()` on change — the post-1.13 declarative path only updated `this.plugin.settings[key]`, so changing these settings on newer Obsidian versions had no runtime effect until restart. ([#125](https://github.com/saberzero1/motions/issues/125))

~~Settings fields for vim engine options lock after typing on iPad~~ — Fixed. The insert mode escape field (and other vim engine settings) became greyed out and unresponsive after typing a single character on iPad with Magic Keyboard. `vim.setOption()` in the `onChange` handler triggered `notify` → `onSettingOverride`, re-adding the key to `vimrcOverrides` after `clearSettingOverride` had already removed it. `refreshDomState` then saw the override and disabled the field. Additionally, the initial settings sync in `reloadFeatures()` marked settings-originated values as vimrc overrides because `registerVimOptions()` had already activated its `notify` callback. Fixed by (1) moving `clearSettingOverride()` to after `vim.setOption()` in both `setControlValue` and all imperative `onChange` handlers, and (2) making `registerVimOptions()` return an activation function so the initial sync runs before notifications are enabled. ([#125](https://github.com/saberzero1/motions/issues/125))

Options that require side effects (clipboard → `setClipboardOption()`, textwidth → `setTextwidth()`, guicursor → `parseGuicursor()`) use a `SideEffectOpt` type in the `KNOWN_SET_OPTIONS` table. This ensures all three code paths (vimrc `set`, Lua `vim.opt`, and initial settings load) invoke the same side-effect callback — eliminating the class of bug where an option works in vimrc but silently fails in Lua or vice versa.

The initial settings load during `onload()` is guarded by an `initializing` flag that suppresses `reloadFeatures()` and gutter reconfiguration side effects until `onload()` completes. Without this guard, the settings restoration loop triggers premature `reloadFeatures()` calls that create resources (VimModeTracker, GlobalKeyHandler) before `onload()` creates its own — leading to duplicate status bar elements and orphaned event listeners. The guard follows the same pattern as `vimrcLoading`/`luaLoading`. ([#63](https://github.com/saberzero1/motions/issues/63))

## `set` option scope

All plugin settings are now configurable via `set` options in `.obsidian.vimrc`. When vimrc is enabled (the default), vimrc values override the corresponding Settings UI values for the current session. Overrides are persisted in a `configOverrides` block in `data.json` so they survive Obsidian restarts — the base settings always reflect UI-set values, while `configOverrides` captures the last-known vimrc/Lua values. On startup, `configOverrides` are merged on top of base settings before CM6 extensions are created. See the full options table in `README.md` → "Supported `set` options".

Additionally, `whichkeygroup` and `whichkeylabel` ex commands allow configuring which-key labels, and `let g:mode_prompt_*` allows customizing status bar mode text. These use merge semantics with the Settings UI (both sources contribute; vimrc wins on conflict).

Settings overridden by vimrc appear as disabled controls in the settings tab with a note showing the vimrc directive (e.g., "Set by vimrc: `set scrolloff=10`"). Changing a disabled setting requires editing the vimrc.

The following settings are intentionally **not** exposed via vimrc:

| Setting          | Reason                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `configMode`     | Circular dependency — can't control config file loading from vimrc or init.lua            |
| `leaderBindings` | Already achievable via `nmap <leader>x :command` in vimrc or `vim.keymap.set` in init.lua |
| `pickerKeymap`   | Complex array-valued keys — not suited for `:set` syntax                                  |

Options like `ignorecase`, `smartcase`, `hlsearch`, `incsearch`, and `wrap` are not implemented because they require CodeMirror-level integration beyond what `Vim.defineOption` provides.

`signcolumn` accepts `auto`, `auto:N`, `yes`, `yes:N`, `no` (N = 1–4, character slots). `auto` shows the sign column when marks exist and hides it when empty (causes layout shift, matching Neovim). `yes` always reserves gutter space. Clicking a mark label in the sign column moves the cursor to that line. Global marks (`A`–`Z`) render in a distinct color from local marks (`a`–`z`). `cursorlineopt=screenline` is not supported.

`linenumbermode` is deprecated in favor of `statuscolumn`. `linenumbermode=dual` internally sets `statuscolumn="%l %r"`. Changing `linenumbermode` requires an Obsidian restart.

`statuscolumn` provides a format string for customizing the gutter layout. Supported tokens: `%l` (line number respecting `number`/`relativenumber`, absolute fallback when both off), `%r` (relative number), `%s` (sign column marks, respects `signcolumn` auto/yes/no and width), `%C` (fold indicators, always active when present), `%=` (flex separator), literal text. When `statuscolumn` is set, all individual gutter columns are hidden — the unified gutter replaces them. When empty (default), individual settings manage gutters independently. Changing `statuscolumn` requires an Obsidian restart — the unified gutter compartment is registered during plugin load. Set `statuscolumn` in your Lua config (`vim.opt.statuscolumn = "%s %l %r %C"`) for it to apply on startup. v1 limitations: no `%{expr}` Lua expressions, no `%#HlGroup#` highlight groups, no width specifiers (`%-5l`), no per-window `statuscolumn`, no `v:virtnum` for wrapped lines. Global only (`vim.opt.statuscolumn`). Invalid format strings silently fall back to empty (plugin-managed gutters).

Unknown `set` options produce a `console.warn` on first encounter per vimrc load. Options recognized by either the plugin (`KNOWN_SET_OPTIONS`) or CM Vim built-in options (`number`, `relativenumber`, `wrap`, `ignorecase`, `smartcase`, `hlsearch`, `incsearch`, `pcre`) are not warned about. Each unknown option is warned at most once per vimrc load/reload to avoid console noise.

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

## `noremap` cannot swap built-in single-key motions

`nnoremap j k` / `nnoremap k j` does not swap the `j` and `k` motions. This is a codemirror-vim architectural constraint: when a `noremap` mapping's rhs is dispatched, the key handler skips all user-defined keymap entries and only searches the default keymap. Since user-defined entries are inserted at the front of the keymap array via `unshift`, the `noremap` dispatch (which starts at `keyMap.length - defaultKeymapLength`) correctly finds the original motion. However, the lhs side of the swap still resolves to the original motion as well, because codemirror-vim's `noremap` flag is tracked globally during dispatch — meaning both sides of a swap end up resolving to the default keymap.

This limitation is confirmed upstream in [obsidian-vimrc-support issue #16](https://github.com/esm7/obsidian-vimrc-support/issues/16), where the maintainer noted: "CodeMirror doesn't support `noremap` [...] recursive mappings are not possible in CodeMirror anyway so `map` or `nmap` should work."

`noremap` does work for preventing recursion in multi-key mappings (e.g. `noremap G G$`) and for remapping keys to different key sequences. It only fails when trying to swap two built-in single-key motions with each other.

## Table navigation on non-US keyboards

`]|` and `[|` use the pipe character (`|`), which on many non-US keyboard layouts (German, Dutch, Nordic, etc.) requires AltGr or a modifier combination. codemirror-vim's `vimKeyFromEvent` translates AltGr keypresses as `<C-A-|>` or `<A-|>`, which does not match the registered `]|` keybinding.

The alternative keybindings `]c` and `[c` are provided for this reason and work on all keyboard layouts.

## Which-key overlay

The which-key overlay has three modes (configurable via **Settings → Vim Motions → Which-key hints**):

- **Off** — no which-key overlay
- **Leader key only** — shows leader bindings after pressing the leader key (after the configurable popup delay, default 500ms)
- **All partial keys** — shows available continuations after any partial key sequence (operators, prefix keys, leader)

The popup delay is configurable via **Settings → Vim Motions → Which-key popup delay** or `set whichkeydelay=<ms>` in vimrc (range 0–2000ms, default 500ms). Once the popup is visible, subsequent keystrokes update it instantly — the delay only applies to the initial appearance.

~~**Global which-key popup disappears quickly in non-editor views**~~: Fixed. The global key handler's sequence timeout now restarts when partial completions exist instead of resetting unconditionally. This matches editor which-key behavior where the popup stays until the command completes. ([#97](https://github.com/saberzero1/motions/issues/97))

In "all" mode, the overlay reads the fork's `getInputState()` to detect operator-pending state and `vim.status` for partial key chords. Operator-pending mode shows grouped next-key options filtered to motions, text objects, and operatorPending actions. Prefix keys (like `g`, `z`) show `getCompletions()` results. Special keys (`<Left>`, `<C-n>`, etc.) and insert-only entries are filtered out. When the key buffer is in leader scope (starts with the leader key and not in operator-pending mode), `showCompletions()` uses `leaderBindings` instead of `getCompletions()` to show only user-visible leader keymaps — matching the behavior of the "leader key only" mode. ([#91](https://github.com/saberzero1/motions/issues/91))

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

### ~~EasyMotion commands shown incorrectly with space leader~~ (Fixed)

**Status**: Fixed. `LeaderRegistry.addBinding()` and `addGroupLabel()` now normalize keys via `normalizeVimKey()` at storage time, ensuring consistent `<Space>` notation across all comparison paths. ([#94](https://github.com/saberzero1/motions/issues/94))

EasyMotion commands (prefixed with `<leader><leader>`) appeared at the wrong level in the which-key popup when using space as the leader key. Two root causes: (1) The stored binding keys used raw space (`" f"`) while the drill-down prefix used normalized notation (`"<Space>"`), so the `startsWith` filter never matched. The group label had the same mismatch. Both `addBinding()` and `addGroupLabel()` now normalize their inputs. (2) In grouped mode, `buildNextKeyEntries()` treated `<Space>` as a "special key" (like `<CR>`, `<Left>`) and silently dropped all entries whose first key was `<Space>` from the grouping display. Fixed by exempting `<Space>` from the special key check — it is a typeable key that users press.

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

**Conflict detection**: The plugin now detects active hotkey conflicts on load (desktop only, when workspace nav is enabled). A one-time Notice per plugin version alerts users to conflicts. A "Check hotkey conflicts" button in **Settings → Vim Motions → Navigation** lists each active conflict with step-by-step unbinding instructions. Detection reads `hotkeys.json` — if a command ID is absent (default binding active) or has a non-empty array (custom binding), it's a conflict. An empty array `[]` means the user explicitly unbound it (no conflict).

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

### ~~`gt` always goes to first tab / `Ngt` count ignored~~ (Fixed)

**Status**: Fixed. `gt` now goes to next tab (no count) or Nth tab (with count) in both editor and non-editor views. ([#97](https://github.com/saberzero1/motions/issues/97))

Three bugs fixed: (1) In non-editor views, the global key handler's `dispatch()` used `this.count || 1`, making count 0 (no count typed) indistinguishable from count 1 — `gt` always called `gotoNthTab(1)`. (2) In editor views, `gt` was mapped to `workspace:next-tab` which ignores `actionArgs.repeat` entirely — `2gt` always went to next tab. Fixed by using `actionArgs.repeatIsExplicit` to distinguish "no count" from "explicit count". (3) `gotoNthTab` counted all workspace leaves including sidebar panes — `3gt` could navigate to a sidebar pane. Fixed by filtering with `leaf.getRoot() === rootSplit`.

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

| Key  | Action       | Behavior                                                                                                          |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `f`  | Activate     | Click button, focus pane, navigate link, focus input                                                              |
| `F`  | Open new     | Open target in new tab (Ctrl+Meta click for generic targets, `openLinkText` for links, `duplicateLeaf` for panes) |
| `yf` | Yank         | Copy URL for links, note path for tabs, display text for others                                                   |
| `df` | Close        | Close tab/pane via `leaf.detach()`; Notice for non-closeable targets                                              |
| `gf` | Context menu | Open right-click context menu on target via `contextmenu` `MouseEvent` with element-center coordinates            |

Count prefix works: `3f` activates three targets sequentially (overlay re-shown between each). `3yf` yanks three URLs. `3df` closes three tabs.

The `y` and `d` keys enter pending states (`Y_PENDING`/`D_PENDING`) that only accept `f` as continuation. Any other key resets the sequence. Chord display shows `y` or `d` while pending, using the existing `SEQUENCE_TIMEOUT` of 1000ms.

### Editor context (vim engine)

`<leader><leader>h` triggers hint mode (unchanged). Action is selected by modifier keys during label selection:

- No modifier → activate (click/focus/navigate)
- Ctrl/Cmd held while typing label → open in new pane
- Shift held while typing label → open context menu

Shift key normalization: `waitForHintKey()` lowercases `e.key` when Shift is held so that Shift+`a` matches the lowercase label `a` instead of dismissing the overlay. ([#104](https://github.com/saberzero1/motions/issues/104))

Yank, close, and context menu are not mapped to editor key sequences (they conflict with vim's native operators). They are registered as Obsidian commands for custom hotkey assignment:

- `vim-motions:hint-open-new-pane` — "Hint: open in new pane"
- `vim-motions:hint-yank` — "Hint: yank link or text"
- `vim-motions:hint-close` — "Hint: close tab or pane"
- `vim-motions:hint-context-menu` — "Hint: open context menu"

### Target classification

Each hint target is classified by type during discovery, before label assignment. The classification determines per-action behavior:

- `.workspace-leaf-content` → `pane` (focus via `setActiveLeaf`; `F` action duplicates the leaf into a new tab via `duplicateLeaf`)
- `.workspace-tab-header` → `tab` (close via `leaf.detach()`)
- `a[href]`, `[data-href]`, `.cm-underline`, `.cm-hmd-internal-link`, `.cm-link`, `.cm-url` → `link` (internal links navigate via `navigateWithJump`; external URLs open via `window.open()`). ~~`.cm-underline` spans in Live Preview had no `href` or `data-href` attributes, causing wikilinks and markdown links to fall through to the generic click handler (no-op on CM6 spans).~~ Fixed in three phases: (1) `resolveCmUnderlineHref()` uses `EditorView.posAtDOM()` to convert the DOM element to a document offset, then calls `findLinkAtCursor()` to extract the link target from the raw markdown text. (2) ~~Hint labels only appeared on `.cm-underline` spans, which are only present in Live Preview when the cursor is NOT on the link's line. When the cursor is on the line, wikilinks render as `.cm-hmd-internal-link` spans and markdown links render as `.cm-link`/`.cm-url` spans — neither was in `TARGET_SELECTOR`. In Source mode, wikilinks always render as `.cm-hmd-internal-link`.~~ Fixed: added `.cm-hmd-internal-link`, `.cm-link`, and `.cm-url` to `TARGET_SELECTOR` with deduplication filters to prevent multiple hints per link (aliased wikilink sub-spans, nested `.cm-underline` inside `.cm-hmd-internal-link`, markdown link URL spans when text span exists). (3) `getEditorViewFromElement()` falls back to the `MarkdownView.editor.cm` path when the DOM `.cmView.view` property is unavailable (which is the case in Obsidian's runtime). External URLs resolved by `resolveCmUnderlineHref()` are opened via `window.open()` instead of falling through to the generic click handler. ([#85](https://github.com/saberzero1/motions/issues/85))
- `input`, `textarea`, `select`, `[contenteditable]` → `input` (focus; `<select>` cycles to next option)
- `button`, `.clickable-icon`, `[role="button"]` → `button` (click)
- `.workspace-drawer-vault-switcher` → `button` (click — opens vault switcher menu). Added in response to [#104](https://github.com/saberzero1/motions/issues/104): the vault switcher is a plain `<div>` without button semantics, so it was not matched by any standard selector
- everything else → `generic` (pointer event sequence + click). All synthetic events include `clientX`/`clientY` from the element's bounding rect center via `getElementCenter()`, ensuring dropdown menus and popovers position correctly near the clicked element instead of at `(0, 0)`. ([#104](https://github.com/saberzero1/motions/issues/104))

Target discovery filters:

- Elements with `.is-measuring` class are excluded (Obsidian 1.13+ shadow `<select>` copies used for layout measurement)
- Child elements inside `.checkbox-container` are excluded (the container itself is the clickable toggle, not its inner `<input>`)
- `input[type="hidden"]` and disabled elements are excluded
- `.cm-underline` inside `.cm-hmd-internal-link` is excluded (parent is the preferred target)
- `.cm-formatting-link` spans are excluded (bracket characters `[`, `]`, `(`, `)` should not be hint targets)
- Only the first `.cm-hmd-internal-link` sibling per link group is kept (aliased wikilinks `[[Target|Alias]]` produce 3 sub-spans)
- Only the first `.cm-link` sibling per link group is kept (formatting brackets produce separate `.cm-link` spans)
- `.cm-url` with `.cm-string` class is excluded (URL inside markdown link parentheses — the `.cm-link` text span is the hint target). Bare URLs (`.cm-url` without `.cm-string`) are kept

### Settings gating

Hint actions in non-editor context require BOTH `enableWorkspaceNav` (gates GlobalKeyHandler) AND `enableHintMode` (gates hint actions). Disabling hint mode via settings stops `f`/`F`/`y`/`d` interception in GlobalKeyHandler. The existing `enableHintMode` setting controls all hint labels — in both editor and non-editor contexts.

### Modal behavior

Navigation keys (`j`/`k`/`g`/`z`/`:`/`H`/`L`/Ctrl-combinations) are suppressed when any Obsidian modal is open (settings, command palette, etc.) via `isModalOpen()`. This prevents scrolling and navigation from interfering with modal interaction.

Hint actions (`f`/`F`/`yf`/`df`) are NOT suppressed in modals — they use a separate `shouldInterceptHints()` gate. This allows hint labels to target and activate modal controls (buttons, toggles, dropdowns, text fields). After activating a toggle or dropdown in a modal, the element is blurred so `f` can immediately re-trigger hint mode without pressing Escape.

During hint label selection, GlobalKeyHandler bails entirely via an `isHintModeActive()` flag, preventing label characters from being intercepted as navigation or hint-trigger keys.

### Clipboard fallback

`hintYank` uses `navigator.clipboard.writeText()` with a fallback to a temporary textarea + `document.execCommand('copy')` for environments where the Clipboard API is restricted. The deprecated `execCommand` path is defensive — in Obsidian's Electron runtime, `navigator.clipboard` should always work.

### ~~Modifier keys dismiss hint overlay~~ (Fixed)

**Status**: Fixed. Pressing `Ctrl`, `Shift`, `Alt`, or `Meta` alone during hint mode no longer clears labels. The `waitForHintKey()` handler filters modifier-only keydown events with an early return and calls `e.preventDefault()` + `e.stopPropagation()` to prevent the event from propagating to Obsidian's hotkey system. Without `stopPropagation`, the modifier keydown could leak through to bubble-phase listeners in Obsidian and cause side effects depending on the user's configuration. Modifier keys combined with label characters still work as before (e.g., Ctrl+label upgrades activate to open-new). ([#98](https://github.com/saberzero1/motions/issues/98))

### ~~Count prefix (`2F`) shifts focus to new tab~~ (Fixed)

**Status**: Fixed. When using a count prefix (e.g., `2F`), focus now stays on the original leaf between activations. The `createHintAction` `run()` function saves the active leaf before `waitForHintKey` when count > 1 and restores it via `setActiveLeaf` after each activation, before scheduling the next round. `hintActivate` is now `async` and awaits `navigateWithJump()` and `duplicateLeaf()` — previously these were fire-and-forgotten via `void`, causing a race condition where `openLinkText()` could resolve after `setActiveLeaf(originalLeaf)` and steal focus back to the new tab. The race manifested on slower machines or with heavier vaults. The `hintMode` vim action (`<leader><leader>h`) now passes `actionArgs.repeat` to `activate()`, enabling count prefix in editor context as well. ([#98](https://github.com/saberzero1/motions/issues/98))

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
| `:args` / `:argdo` / `:next` / `:prev` | Argument list             | No arglist concept — Obsidian manages open files via tabs |
| `:resize`                              | Resize window             | Obsidian manages pane sizing automatically                |
| `:tabmove`                             | Reorder tabs              | Obsidian does not expose a tab reorder API                |
| `:view`                                | Open file read-only       | Obsidian has no read-only mode for notes                  |
| `:bunload`                             | Unload buffer from memory | Obsidian manages editor memory internally                 |
| `:menu`                                | Create GUI menus          | No Vim-style menu system                                  |
| `:spell*`                              | Spelling commands         | Obsidian has its own built-in spell checker               |

### Behavioral deviations

These commands exist but behave differently from Neovim:

| Command                | Neovim behavior                                           | Obsidian behavior                                          | Reason                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Y`                    | Mapped to `y$` by default                                 | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                                                                  |
| `Q`                    | Replay last recorded macro                                | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                                                          |
| `:wall` / `:wa`        | Save all modified buffers                                 | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                                                            |
| `gf`                   | Open file path under cursor                               | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                                                              |
| ~~`zO` / `zC` / `zA`~~ | ~~Recursive fold open/close/toggle~~                      | ~~Maps to the same action as `zo`/`zc`/`za`~~              | Fixed. `zO`/`zC`/`zA`/`zD` now operate recursively using range containment on CM6's foldable regions.                                                              |
| ~~`zn` / `zN`~~        | ~~Fold none (disable folding) / fold normal (re-enable)~~ | ~~Not implemented~~                                        | Fixed. `zn`/`zN`/`zi` implemented via `foldEnableField` StateField. Fold gutter arrows remain visible (shows foldable regions) but fold operations are suppressed. |
| `it` / `at`            | HTML tag text objects (CM Vim native via XML mode)        | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown                                           |

## Ex `:m`/`:t` address parsing

**Status**: Partial implementation.

The `:m`/`:move` and `:t`/`:copy`/`:co` ex commands support relative addresses (`+1`, `-2`) but the address parser does not fully handle absolute addresses (`0`, `$`) or range syntax (`1,2`). Relative addresses are the most common use case and work correctly. The full Neovim address grammar (marks, search patterns, offsets) is not implemented.

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

**Remaining gaps**: None.

**Fixed**:

- ~~Blockwise visual mode (`<C-V>` + `gr`)~~ — Implemented blockwise replacement with register line duplication/truncation and per-line replacements.

**Test coverage**: `test/specs/operators.e2e.ts` — 26 passing tests: `grr` (single, multi-line, count), `griw`, `gr$`, `grl`, `gri'`, `gr}`, named registers (`"agriw`, `"a3grr`), visual `gr` (charwise, linewise `V`, blockwise `<C-V>`), register type coercion (linewise↔charwise), cursor positioning, dot-repeat (`griw`, `grr`, `3grr`+`.`), multi-line register expansion, text object at line boundary.

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

## ~~Obsidian native highlights not cleared on Escape~~ (Fixed)

**Status**: Fixed. Pressing Escape in normal mode now clears Obsidian's `is-flashing` highlights (the highlight shown after following an internal link to a heading like `[[Note#heading]]`). Uses the unofficial `editor.removeHighlights('is-flashing')` API. ([#122](https://github.com/saberzero1/motions/issues/122))

## Chord display reads internal `vim.status`

The chord display reads `adapter.state.vim.status` directly from codemirror-vim's internal state rather than accumulating keystrokes from the `vim-keypress` event. This is necessary because in Obsidian's CM6 adapter, `vim-keypress` fires _after_ command processing — by which point `clearInputState` has already reset the input buffer for completed commands. Manual accumulation would cause stale keys to persist after single-key commands like `j` or `G`.

The mode tracker listens to three events to sync the chord display: `vim-mode-change`, `vim-keypress`, and `vim-command-done`. The `vim-command-done` listener is needed because Escape in normal mode (cancelling a partial command like `d`) fires `vim-command-done` without a mode change or keypress event — without it, the stale chord would remain visible. The `vim-keypress` handler also clears Obsidian's native `is-flashing` highlights when `<Esc>` is pressed in normal mode.

### ~~Chord display breaks during surround sub-state~~ (Fixed)

**Status**: Fixed. Multi-key surround commands (`ysiwb`, `cs"(`, `yss"`, `2ysiw*`) now correctly accumulate all pending keystrokes in the chord display. Previously, the chord disappeared after the surround sub-state was entered because `processAction` called `clearInputState` (which fires `vim-command-done`, clearing `vim.status`) before the surround action set `vim.surroundState`. Fixed in the codemirror-vim fork by saving and restoring `vim.status` around `clearInputState` when the action sets a pending `vim.surroundState`, and explicitly clearing `vim.status` when the surround operation completes. ([#123](https://github.com/saberzero1/motions/issues/123))

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

### ~~Cursor shape dropdowns always disabled in Settings UI~~ (Fixed)

**Status**: Fixed. The 5 cursor shape dropdowns on the Appearance settings page were permanently disabled even when the bundled fork was active. Root cause: Obsidian's `addSettingTab()` calls `getSettingDefinitions()` immediately and caches the result. In the plugin's `onload()`, `addSettingTab()` ran before `createBundledVimExtension()`, so the `disabled` callbacks captured `forkActive = false` via closure and always returned disabled. Fixed by calling `isBundledVimActive()` directly inside each `disabled` callback (evaluated fresh on every `refreshDomState()`) and calling `settingTab.update()` after fork activation to refresh the cached definitions. ([#128](https://github.com/saberzero1/motions/issues/128))

## Surround operator scope

**Status**: Complete. All vim-surround features implemented.

The surround operator implements the full vim-surround command set: `ds`/`cs`/`ys`/`yss`/visual `S` with all bracket/quote/tag targets, function wrapping (`f`/`F`), newline variants (`cS`/`yS`/`ySS`/`gS`), count support (bracket depth and quote char repeat), insert mode (`<C-G>s`/`<C-G>S`), and dot-repeat. Markdown-specific pairs use count-prefix: `2ysiw*` → `**word**`. Custom surround pairs can be defined via Lua (`vim.obsidian.surround.set/add`) or vimrc (`surroundmap`), supporting multi-character delimiters with full `ys`/`ds`/`cs` support ([#36](https://github.com/saberzero1/motions/issues/36)).

**Breaking changes from CM Vim defaults**:

- `<` in replacement position triggers tag prompting (was angle brackets with spaces). Use `>` for no-space angle brackets.
- `f`/`F` in replacement position triggers function wrapping (was literal `f`/`F` as delimiters).
- `S` in visual mode now surrounds instead of substituting (was `S` → `VdO` keyToKey).

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

### Per-view mode events ([#88](https://github.com/saberzero1/motions/issues/88))

Mode events (`InsertEnter`, `InsertLeave`, `ModeChanged`) fire per-view across all editors — split panes, popover hover-preview editors, and canvas card text inputs — when using the bundled vim fork (recommended setup with built-in vim mode OFF). Built-in vim mode retains active-leaf-only behavior for these events.

~~Other adapter-dependent events (`TextYankPost`, `CursorMoved`, `CursorHold`, `CmdlineEnter`, `CmdlineLeave`) are still active-leaf-only~~. Fixed. All 5 events now fire per-view via `AutocmdEventWatcher` CM6 ViewPlugin, following the same pattern as `AutocmdModeWatcher`. `CursorMoved` fires independently per view with position-change detection. `CursorHold` uses a per-view timer with configurable delay. `CmdlineEnter`/`CmdlineLeave` route through the per-view watcher but inherently fire on the active adapter only (the dialog opens on the focused editor).

`getModeState()` returns global state reflecting the most recent mode event from any view, not per-view state. `vim.obsidian.mode()` reads the active leaf's mode, not the event source's mode — if a popover fires `InsertEnter`, `vim.obsidian.mode()` may still return `'n'` if the active leaf is in normal mode.

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

When Obsidian's built-in vim is disabled and the plugin provides vim via the bundled fork, each oil view gets its own vim instance. Registers, macros, and ex command history are not shared between the oil editor and regular editors. The embedded editor relies on Obsidian's `registerEditorExtension()` injection to receive the vim extension — if the injection fails (e.g., on a leaf that has never hosted a MarkdownView), the `ensureVimExtension()` safety net in `embeddable-editor.ts` adds vim via `StateEffect.appendConfig`.

When built-in vim is enabled, vim state is shared globally through Obsidian's editor infrastructure. This limitation only affects fork mode.

### ~~Oil editor degraded when opened from non-editor context~~ (Fixed)

**Status**: Fixed. Two changes: (1) `openOil()` in `manager.ts` now primes the leaf with a temporary markdown view state before switching to the Oil view type when no MarkdownView is active. This ensures the leaf's CM6 editor infrastructure (including `registerEditorExtension()` injections) is bootstrapped before the Oil editor is created. (2) `embeddable-editor.ts` removes a dead vim extension guard (`!builtinVimOn && isBundledVimActive()` — always false when using the bundled fork because `isVimEnabled()` conflated built-in and bundled vim) and adds a post-construction `ensureVimExtension()` safety net that checks for vim presence via `getCM()` and appends the extension via `StateEffect.appendConfig` only if absent.

### Hidden files (dotfiles) are view-only

When "Show hidden files" is enabled, Oil discovers dotfiles (`.gitignore`, `.hidden-folder/`, etc.) via the Obsidian adapter API. These files appear in the directory listing and can be opened, but renaming, deleting, or moving them via Oil buffer editing may fail because Obsidian's Vault API does not index dotfiles. Full CRUD operations on hidden files are not yet supported.

### ~~Cannot open files/folders from vault root~~ (Fixed)

**Status**: Fixed. Cache ID desync in `discoverAndMergeHidden()` caused buffer entry IDs to become permanently out of sync with the cache after the async hidden-file discovery flow. The method called `cache.loadDirectory()` three times per refresh cycle, each clearing and reassigning IDs. Fixed by passing the expected buffer content as a parameter and eliminating the redundant re-render. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Title bar does not update when navigating directories~~ (Fixed)

**Status**: Fixed. `setDirectory()` and `refreshContent()` now call `leaf.updateHeader()` after changing `dirPath`, signaling Obsidian to re-read `getDisplayText()`. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Hidden files toggle (`g.`) has no effect~~ (Fixed)

**Status**: Fixed. The `??` operator on the boolean-typed `oilShowHiddenFiles` setting never fell through to the runtime toggle. Replaced with a `showHiddenOverride: boolean | null` field that takes priority when set by `g.`. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~`<CR>` opens file in new tab instead of same leaf~~ (Fixed)

**Status**: Fixed. `openEntryAtCursor()` now uses `leaf.openFile()` directly on the Oil leaf to replace the Oil view, matching oil.nvim's default `select` behavior. `<C-t>` is available for opening in a new tab. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~`<C-t>`/`<C-s>`/`<C-h>` keybindings do nothing~~ (Fixed)

**Status**: Fixed. Obsidian's default hotkeys (`Ctrl+T` = new tab, `Ctrl+S` = save, `Ctrl+H` = search & replace) intercepted these keys at the Electron level before the embeddable editor's vim handler received them. Fixed by registering these keys (plus `<C-l>` and `<C-c>`) on the embeddable editor's Obsidian `Scope`, which fires before default hotkeys. Navigation keys blur the editor before navigating so the `setActiveLeaf` guard allows the new leaf through. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Ctrl hotkeys broken after closing Oil~~ (Fixed)

**Status**: Fixed. Closing Oil left the Obsidian `Scope` (with Oil's `Ctrl+T/S/H/L/C` handlers) pushed on the keymap stack, intercepting Ctrl keys on the restored file. Fixed by calling `editor.destroy()` in `OilView.onClose()` before `removeChild()`, which pops the scope. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Oil loses focus after committing staged changes~~ (Fixed)

**Status**: Fixed. After making changes in Oil (e.g., deleting a file) and committing with `:w`, the Oil editor lost focus when the confirmation dialog was confirmed, cancelled, or dismissed via `Esc`. Two bugs: (1) `OilConfirmModal.onClose()` never resolved the promise on `Esc` dismissal, causing `commit()` to hang permanently. (2) No `focusEditor()` call after the modal closed. Fixed with a `resolved` guard in the modal and `view.focusEditor()` on both confirm and cancel paths. ([#100](https://github.com/saberzero1/motions/issues/100))

### Third-party CM6 extensions not available in oil

Extensions registered by other plugins via `registerEditorExtension()` do not appear in the oil editor. The embedded editor only includes extensions explicitly passed through `buildLocalExtensions()` — currently the oil conceal extension and (when built-in vim is disabled) the bundled vim extension. Syntax highlighting and markdown rendering from Obsidian's core are included.

### Oil uses undocumented Obsidian internal API

The embedded editor is created by extracting Obsidian's internal `ScrollableMarkdownEditor` prototype via `app.embedRegistry.embedByExtension.md()`. This is an undocumented internal API used by the Kanban plugin (500k+ installs) since 2022 without breakage. A runtime guard produces a descriptive error if the API changes in a future Obsidian update. The oil feature will degrade gracefully (error notice, oil unavailable) rather than crashing.

### ~~Note freezes in Reading Mode after closing Oil~~ (Fixed)

**Status**: Fixed. Closing Oil now restores the original editor mode (source, live preview, or reading). The mode is captured when Oil opens via `MarkdownView.getState()` and restored via `leaf.openFile(file, { state: previousViewMode })` on close. All close paths (keybindings, ex commands, Lua API) use a unified `closeOil()` method. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Cursor focus lost when switching back to Oil tab~~ (Fixed)

**Status**: Fixed. Switching back to an Oil tab via `gT` or Obsidian's tab navigation now re-focuses the embedded editor. `OilKeybindingManager.onActiveLeafChange()` calls `view.focusEditor()` when the active leaf is an Oil view. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~`:Oil .` opens current file's directory instead of vault root~~ (Fixed)

**Status**: Fixed. `:Oil .` and `:Oil /` now correctly open the vault root. The empty-argument case (`:Oil` with no args) still opens the current file's parent directory. Both the vim ex command handler and the global ex command palette are updated. ([#93](https://github.com/saberzero1/motions/issues/93))

### ~~Oil temp files visible with `oil~` prefix~~ (Fixed)

**Status**: Fixed. Oil now uses a dedicated view type with an embedded editor. No temporary files are created in the vault.

### ~~Dotfiles cannot be used for temp files~~ (Fixed)

**Status**: Fixed. No longer relevant — Oil no longer creates any files in the vault.

### ~~Keybindings are not user-remappable~~ (Implemented)

**Status**: Implemented. All keybindings across all contexts are user-remappable.

Every keybinding is remappable through one of four mechanisms depending on context:

- **Editor keybindings** (motions, actions, operators): All have ex command aliases (e.g., `:nextheading`, `:focuspaneleft`, `:tablenextcell`, `:hintactivate`). Remap via `vim.keymap.set('n', 'key', ':excommand<CR>')` in Lua or `nmap key :excommand<CR>` in vimrc.
- **Oil explorer keybindings**: Exposed as ex commands (`:oilopen`, `:oilopentab`, `:oilopensv`, `:oilopensh`, `:oilparent`, `:oilroot`, `:oilclose`, `:oilrefresh`, `:oiltogglehidden`, `:oilcyclesort`, `:oilyankpath`, `:oilreveal`, `:oilopenexternal`, `:oilhelp`) and Lua functions (`vim.obsidian.oil.parent()`, etc.). Default keys match oil.nvim conventions (`<CR>` same-leaf, `<C-t>` new tab, `<C-s>` vertical split, `<C-h>` horizontal split, `<C-c>`/`q` close, `gx` open external). Buffer-local remapping via `OilEnter`/`OilLeave` autocmd events.
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

## E2E test infrastructure weaknesses

**Status**: Partially addressed.

The e2e test suite had ~47 tests that did not reliably detect the regressions they claimed to guard against. A feature could be deleted or broken and these tests would still pass.

**Fixed (this release)**:

- **26 golden spec files** now have `else { throw }` guards on `SUITES.find()` — if a suite name is renamed in `test-definitions.ts` but not in the spec file, the test runner produces an explicit failure instead of silently generating zero tests
- **Golden mode comparison** added to `testWithNeovim()` — golden data already contained `mode` values but the CI comparison path only checked `content` and `cursor`. Mode mismatches are now caught
- **33 deviations classified** with a `category` field (`intentional`, `infra-limitation`, `upstream-bug`, `upstream-unsupported`, `recording-issue`). `findDeviation()` export added. `[INFRA-SKIP]` console warnings emitted for infra-limitation deviations so CI output shows how many tests are silently skipped due to infrastructure limitations
- **8 undo-tree tests** strengthened with content assertions (previously only checked `mode === 'normal'`)
- **4 ex-command tests** (`:undo`, `:redo`, `:yank`, `:nohlsearch`) strengthened with behavioral assertions. 16 workspace-layout ex-command tests renamed with `[crash-guard]` prefix to make their tier explicit
- **6 vimrc mapping tests** strengthened with cursor movement verification (previously only called `assertPluginLoaded()`)
- **1 tautological assertion** fixed (`toBeGreaterThanOrEqual(0)` → `toBe(0)` for undo tree branch count)

**Remaining weaknesses**:

- **7 deviation-masked operations effectively untested**: When `isKnownDeviation(name)` is true, `testWithNeovim()` skips ALL comparison. 7 remain as `infra-limitation` deviations: `gh`/`gH` select mode (6 tests — spike confirmed `handleKey` cannot enter select mode via `g`+`h` dispatch), `N after / search` (1 test — CM6 search panel timing). Previously 10 — resolved 3: `V3j+J`, `vip+d`, `v+r`, `v+aw+d` fixed via `useHandleKey` flag + `vimHandleKeys` helper (dispatches all keys through `Vim.handleKey()` synchronously, bypassing DOM event timing); `lua nmap change word` fixed via key-string encoding (`<Esc>` literal → `\x1b` byte); `lua leader key mapping` reclassified to `upstream-bug` (leaderRegistry propagation timing, not test dispatch); `vt.+d` and `v$+d` exposed as genuine `upstream-bug` behavioral deviations (visual-mode `t` range and `v$d` cursor position differ from Neovim)
- **3 vimrc `set` option tests** (lines 109, 116, 121 in `vimrc.e2e.ts`) remain as `assertPluginLoaded()`-only. Root cause confirmed: the vimrc I/O timing issue (documented under [set textwidth via vimrc](#set-textwidth-via-vimrc-may-not-affect-gq)). `SideEffectOpt` options (`clipboard`, `expandtab`, `textwidth`) are applied via `onSettingOverride` → `applySettingOverride` → `this.settings[key] = value`, but `saveSettings()` strips these overrides using `preVimrcSettings`, and the `initializing` flag during `onload()` gates the override chain. By the time the test reads `plugin.settings.clipboard`, it returns `''` (the pre-vimrc default). `Vim.getOption('clipboard')` also returns `''`. The `vimrcOverrides` Map is empty by test time. The Lua `vim.opt` equivalent is verified and passing in `lua-config.e2e.ts` — the Lua path works because `loadLuaConfigForTest()` runs the override chain synchronously without the `initializing`/`saveSettings` stripping
- **`:changes` ex command test** remains a crash-guard. The correct modal selector is `.vim-motions-info-modal` (confirmed from `VimInfoModal` source and verified working in `undo-tree.e2e.ts`'s `:undolist` test), but `:changes` invoked via the `handleEx` wrapper in `ex-commands-expanded.e2e.ts` does not produce a visible modal DOM element — the `VimInfoModal.open()` call completes without error but no `.vim-motions-info-modal` appears in the document (verified with `waitUntil` + 3s timeout). The `:undolist` test in `undo-tree.e2e.ts` uses a different `handleEx` function (without try/catch wrapper) and works. Root cause likely related to the ex-commands test's `handleEx` wrapper or test state
- **`:e!` and `:update` ex command tests** remain crash-guards. Confirmed: `setupEditor()` uses `view.editor.setValue(text)` which sets in-memory content only — no `app.vault.adapter.write()` call. `:e!` reverts to the last saved disk state, not the `setupEditor` content. Behavioral assertions would require an explicit save step before `:e!`, which adds complexity beyond the test's scope
- **Golden comparison does not check register state or visual sub-mode type** — `compareStates()` compares `content`, `cursor`, `mode` (mode comparison added this release). The golden schema (`GoldenCase`) and recording infrastructure now capture `registers` (unnamed register text + linewise flag) and `visualMode` (`charwise`/`linewise`/`blockwise`) — 24 of 29 golden files include these new fields. However, **register comparison is disabled at runtime** because register state leaks between tests within the same Obsidian session (each `testWithNeovim` test shares the same editor instance, so registers from previous tests persist). Neovim golden recording starts each test fresh, producing a clean register state. Enabling register comparison requires either per-test register reset in Obsidian or comparing only tests that explicitly opt in via a flag. The golden data with registers is preserved for future use

### ~~`s` (substitute) test failure~~ (Fixed)

**Status**: Fixed. Not a code regression — test vault `data.json` had `flashJumpEnabled: true`, which mapped `s` to flash jump mode instead of the built-in substitute (`cl`). Flash jump tests explicitly enable this setting in their own `before()` hooks and don't depend on the `data.json` value. Fixed by setting `flashJumpEnabled: false` in `data.json` and adding a defensive disable in `normal-editing.e2e.ts`'s `before()` hook.

## Neovim golden test coverage gaps

The plugin verifies Vim behavior against headless Neovim via golden comparison tests (`test/neovim/`). The following areas of the fork's test suite are **not** covered by golden comparison because they cannot be meaningfully verified in a headless Neovim session:

| Area                                                                                                                                            | Fork tests     | Reason not golden-verifiable                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scroll/viewport (`zz`, `zt`, `zb`, `Ctrl-d/u/f/b`)                                                                                              | 9              | Depend on viewport dimensions and `scrollInfo` — headless Neovim has no viewport geometry                                                                                                                                                                                                 |
| Fold (`zo`, `zc`, `za`, `zf`, `zd`, `zE`, `zm`, `zr`, `zj`, `zk`, `[z`, `]z`, `zn`, `zN`, `zi`, `zv`, `zF`, `zx`, `zX`, `zO`, `zC`, `zA`, `zD`) | 32 + 12 golden | Fold motions (`zj`/`zk`/`[z`/`]z`) have Neovim golden tests — `zj` matches Neovim (hierarchical skip); `zk` has 1 deviation (trailing blank line boundary); `[z`/`]z` have 2 deviations (fold body vs heading boundary). Fold state/recursive ops are plugin-specific (no Neovim golden). |
| Jumplist (stale marker edge case)                                                                                                               | 1              | Single test for cross-document marker invalidation — Neovim doesn't share the CM6 `Marker`/`posFromIndex` infrastructure                                                                                                                                                                  |
| Cursor rendering (`rendered_cursor_position_*`)                                                                                                 | 2              | Test `.cm-fat-cursor` DOM element pixel position via `getBoundingClientRect()` — no Neovim equivalent                                                                                                                                                                                     |

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

The plugin can automatically switch input methods when entering/leaving insert mode across all editor views (split panes, popovers, canvas cards). Enable in **Settings → Vim Motions → Input method**. The Lua API (`vim.obsidian.im`) provides programmatic control for advanced use cases. All 7 IM settings are available in both the legacy settings tab (Obsidian <1.13) and the new searchable settings UI (Obsidian 1.13+).

~~**Manual IME switch not preserved across mode changes**~~: Fixed. When a user manually switched input methods during insert mode (e.g., from Vietnamese to English via an OS keyboard shortcut), pressing `Esc` then `i` reset the IME to the original input method. The `save()` method now queries the OS for the actual current IME before caching it, so manual switches are correctly preserved. ([#83](https://github.com/saberzero1/motions/issues/83))

Limitations:

- **Desktop only**: Mobile devices do not support `child_process` and the feature is a no-op. The settings group is hidden on mobile.
- **Command-line and search mode**: IM switching auto-wires to `CmdlineLeave` (switches to normal IM when exiting `:`, `/`, or `?` prompts). `CmdlineEnter` does not trigger an IM switch (users may need CJK input for search queries). The global ex command modal (`:` in non-editor views) does not fire `CmdlineEnter`/`CmdlineLeave`.
- **System-wide switching**: IM switching is a system-wide OS operation. Switching IM in one Obsidian window affects all windows and applications.
- **Flatpak/Snap**: Sandboxed Obsidian installations (Flatpak, Snap) may not have access to IM switching binaries outside the sandbox. Use the AppImage or native package instead.
- **Binary must be pre-installed**: The plugin calls an external binary (`macism`, `fcitx5-remote`, `im-select.exe`, etc.) — it does not bundle one. The binary must be installed separately and the full path provided in settings.

### Deferred enhancements

The following IM switching improvements are planned but not yet implemented:

- ~~**Platform presets**~~: Implemented. A settings dropdown auto-fills binary path, arguments, and default IM for macism (macOS), im-select (Windows), fcitx5-remote (Linux), and ibus (Linux). Values are editable after selection.
- ~~**Session persistence**~~: Implemented. The per-view IM cache is persisted to plugin settings via `saveData()` (30-second interval + save on unload). The saved IM is restored on plugin load.
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

The bundled picker integrations (Omnisearch, Tasks, Dataview) detect target plugins via `app.workspace.onLayoutReady()` at startup and via `reloadFeatures()` when integration settings are toggled. Obsidian does not emit events when community plugins are enabled or disabled at runtime (`app.plugins` has no event emitter — confirmed by runtime inspection of Obsidian v1.12.7). If a user enables Omnisearch/Tasks/Dataview after Vim Motions has loaded, the integration source will not appear until the user toggles the corresponding setting in **Settings → Vim Motions → Picker** (which triggers `reloadFeatures()`) or reloads Obsidian.

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

### Snippet variable limitations

- **`$CLIPBOARD` on mobile** — `navigator.clipboard.readText()` may be unavailable or permission-denied on mobile platforms and non-secure contexts. `$CLIPBOARD` resolves to `''` silently in these cases. On desktop, the clipboard is cached on `window focus` and `visibilitychange` events and read synchronously at expansion time. Intra-app vim `y`/`d` operations do not trigger the cache refresh — `$CLIPBOARD` reflects the system clipboard at the last focus/visibility event.
- **`$TM_SELECTED_TEXT` / `$VISUAL` in tab-expand mode** — tab expansion requires an empty selection (`tab-expand.ts` returns `false` when selection is non-empty). `$TM_SELECTED_TEXT` and `$VISUAL` always resolve to `''` in tab-expand mode. Use the `:snippet` command in visual mode to expand snippets that wrap the selection. Visual line mode (`V`) and charwise visual mode (`v`) are both supported. Visual block mode (`<C-v>`) captures the bounding range text.
- **Tabstop navigation after visual `:snippet`** — after expanding a snippet from visual mode via `:snippet`, vim is in normal mode (not insert mode). Tabstop navigation via Tab requires entering insert mode first. This is a pre-existing behavior of the ex-command pipeline — `exitVisualMode()` returns to normal mode before the handler runs. Snippets expanded from insert mode (tab-expand or completion) are unaffected.
- **Picker snippet expansion does not capture visual selection** — the picker-based snippet expansion (`picker-source.ts`) reads `view.state.selection.main` which is collapsed after visual mode exit. The `:snippet` command uses vim marks to recover the visual selection; the picker does not have access to the `cm` adapter. This is a latent issue — the picker is typically invoked from normal mode.
- **`snip.env` for Lua `f()`/`d()` callbacks** — deferred. The current `f(args, parent)` / `d(args, parent, old_state)` callback signatures do not carry environment variables. LuaSnip exposes `snip.env.TM_SELECTED_TEXT`, `snip.env.LS_SELECT_RAW`, etc. Adding this requires changes to `dynamic-bridge.ts` and the Lua function invocation protocol.
- **`$LINE_COMMENT` / `$BLOCK_COMMENT_START` / `$BLOCK_COMMENT_END`** — deferred. These require cursor-context-aware language detection for code blocks. The simple case (`%%` always for Markdown) is trivial but not useful inside code blocks where `//`, `/* */`, `#`, etc. would be expected.

### ~~Ex command snippet expansion~~ (Fixed)

~~`:snippet <name>` and `:snippets` (picker) commands are registered but expansion via the test harness's `Vim.handleEx()` bridge does not produce visible results.~~ Fixed. The commands were silently broken after any `reloadFeatures()` cycle (vimrc load, Lua config load, settings change). `registerSnippetCommands()` was only called in `onload()`, but `reloadFeatures()` calls `unregisterAll()` which replaced all snippet ex commands with no-ops and never re-registered them. The Picker-based snippet insertion was unaffected (separate `pickerRegistry`). Fixed by adding `registerSnippetCommands()` to `reloadFeatures()`. ([#95](https://github.com/saberzero1/motions/issues/95))

## Vim keybindings in text areas

**Status**: Experimental (disabled by default). ([#69](https://github.com/saberzero1/motions/issues/69))

When enabled (**Settings → Vim Motions → Vim features → Vim keybindings in text areas**), focused `<textarea>` elements are replaced with a vim-enabled CodeMirror 6 editor overlay. The editor starts in insert mode — typing works immediately. Press Escape to enter normal mode for full vim editing (motions, operators, text objects, ex commands). A second Escape tears down the overlay and returns focus to the original textarea within the modal — the modal itself stays open. Content is synced back to the hidden textarea continuously (100ms debounce) with synthetic `input` and `change` events for host plugin compatibility, plus a final flush on teardown.

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

### Escape behavior

The Escape key follows a symmetric context stack: modal → vim overlay → modal.

1. **Insert mode → Escape**: Enters normal mode within the overlay (vim handles it).
2. **Normal mode → Escape**: Syncs content, tears down the overlay, focuses the original textarea. The modal stays open — the user can continue interacting with the modal or press Escape again to close it via the host plugin's own handler.

~~Second Escape closes the parent modal~~ — Changed. Previously, the second Escape re-dispatched a synthetic `Escape` keydown to the parent UI after teardown, which closed the host modal (e.g., Spaced Repetition's edit dialog) and could cause data loss. Now the overlay simply returns focus to the modal context without propagating the key event. ([#69](https://github.com/saberzero1/motions/issues/69))

~~Escape in hint mode exits the embedded editor~~ — Fixed. When hint mode (or EasyMotion/flash) was active inside an embedded vim editor, pressing Escape to dismiss the overlay also triggered the embedded editor's Scope-level Escape handler, which called `onEscape()` because `isVimIdle()` returned `true` (hint mode is a plugin-level overlay, not a vim state). The Scope handler now checks `isHintModeActive()`, `isEasyMotionActive()`, and `isFlashActive()` before evaluating `isVimIdle()`. ([#126](https://github.com/saberzero1/motions/issues/126))

~~Escape exit immediately re-activates overlay in insert mode~~ — Fixed. After teardown, `originalEl.focus()` triggered the `focusin` listener which re-created the overlay after 150ms. Now a `recentlyExited` guard (via `WeakRef` + 250ms cooldown) suppresses re-activation for the textarea that was just exited. The textarea can be re-activated by clicking into it again after the cooldown. ([#69](https://github.com/saberzero1/motions/issues/69))

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

### 3. ~~32-bit integer limitation~~ (Widened to 53-bit)

**Status**: Implemented. Integers widened from 32-bit to 53-bit using JavaScript `Number` precision. `math.maxinteger = 9007199254740991` (2^53 - 1).

**What changed**:

- `LUA_MAXINTEGER` / `LUA_MININTEGER` widened to ±(2^53 - 1) (symmetric bounds)
- All `|0` arithmetic truncation removed from the VM, lobject, lbaselib, lmathlib
- `string.pack`/`unpack` `SZINT` changed from 4 to 8 — `string.packsize("j")` returns 8
- Table keying, API validation, and string parsing updated for 53-bit range
- `sprintf-js` dependency replaced with custom formatter (zero runtime dependencies)

**Remaining limitations**:

- Bitwise operations (`&`, `|`, `^`, `~`, `<<`, `>>`) remain 32-bit — this is a JavaScript platform limitation. Values > 2^31 are silently truncated in bitwise ops.
- Multiplication precision: `a * b` where both operands > 2^26 may exceed 2^53, silently losing precision. Standard Lua wraps via 2's complement; this fork loses bits.
- `math.ult` semantics may differ from standard Lua for negative inputs due to symmetric (not 2's complement) bounds.
- Hex string parsing (`tonumber("0x...", 16)`) for values > 2^53 may lose precision (no explicit overflow check, matching PUC-Rio Lua design).
- `vim.uv.hrtime()` uses `lua_pushnumber` (float), not `lua_pushinteger`. It already had 53-bit precision before this change — the integer widening does not affect hrtime. The previous claim about "2.1 second overflow" was inaccurate.

### 4. `__gc` metamethods via FinalizationRegistry

**Status**: Implemented (userdata only). Tables with `__gc` are not finalized.

`__gc` metamethods on userdata are invoked via JavaScript's [`FinalizationRegistry`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry). When userdata with a `__gc` metamethod becomes unreachable from JavaScript, the `FinalizationRegistry` callback queues the finalizer. The queue is drained at three points: (1) when the outermost `luaD_pcall` returns (VM idle), (2) when `collectgarbage("collect")` is called, (3) during `lua_close` (plugin unload). Finalizer errors are silently swallowed (PUC-Rio semantics). Finalization order is unspecified. `__gc` cannot yield.

**Remaining limitations**:

- Timer handles (`vim.uv.new_timer()`) are Lua tables, not userdata — `__gc` does not help with timer cleanup. Use `timer:close()` explicitly, or rely on `TimerManager.destroyAll()` at plugin unload.
- `__gc` on tables is not supported (userdata only).
- Finalization timing is non-deterministic — `FinalizationRegistry` callbacks fire between event loop turns, not during synchronous Lua execution.
- Finalization order is unspecified — `FinalizationRegistry` provides no ordering guarantees.

### 5. JavaScript RegExp exposed to Lua

**Status**: Implemented. ECMAScript regex is available via `vim.regex()`.

**Current state**: Lua's built-in `string.find` / `string.match` / `string.gsub` use Lua patterns, which are less powerful than regular expressions. The plugin runs in a browser with native ECMAScript regex — this is an advantage over Neovim, where implementing ECMAScript regex in Lua is impractical (mini.snippets explicitly punted on snippet transforms for this reason).

**API**: `vim.regex(pattern, flags?)` returns a table that closes over a JavaScript `RegExp` instance and exposes:

- `re:match_str(str)` / `re:match_line(str)` → 0-based `start`, `end` byte offsets, or `nil`
- `re:match_pos(str, start?)` → match starting from offset (default 0), returns 0-based `start`, `end` or `nil`
- `re:replace(str, repl)` → returns new string
- `re:test(str)` → boolean

```lua
local re = vim.regex("([A-Z][a-z]+)", "g")
local start_idx, end_idx = re:match_str("HelloWorld")
local result = re:replace("HelloWorld", "$1-")
```

**Known limitation**: No ReDoS protection is applied. User-supplied patterns can be expensive.

### 6. Re-enable `load()` with sandboxing

**Status**: Implemented (as part of `require()` support, item 2).

`load(chunk)` is available for string-only compilation. Returns the compiled function on success, or `nil` + error message on syntax error. `dofile` and `loadfile` remain disabled. The instruction count hook applies to loaded code. The sandboxed `load` is implemented in `src/lua/package.ts`.

### 7. `string.format` performance (sprintf-js replacement)

**Status**: Implemented. Custom `luaSprintf` replaces `sprintf-js`. The fork now has zero runtime dependencies.

### 8. Lua error message quality

**Status**: Implemented. Native JS errors are now extractable via `pcall`.

The plugin installs a `lua_atnativeerror` handler that converts native JS errors (TypeError, RangeError, etc.) to Lua strings containing the error `.message`. Previously, native JS errors thrown inside fengari C functions were pushed as `lightuserdata` and lost — `lua_tolstring` returned `null`, producing generic "Unknown Lua error" messages. The handler is installed plugin-side in `engine.ts` on the `global_State`, covering all threads including coroutines. `debug.traceback` already produces clean Lua-only stack traces (no changes needed).

### 9. Weak tables via WeakRef

**Status**: Inherited from upstream. High effort, low-medium impact.

**Current state**: Weak tables (`setmetatable({}, {__mode = 'v'})` or `__mode = 'k'`) are not supported. Tables always hold strong references. This breaks idiomatic Lua patterns for caches, observers, and memoization.

**Approach**: Use JavaScript's `WeakRef` and `FinalizationRegistry` to implement weak reference semantics. Every Lua value stored in a weak table would be wrapped in a `WeakRef`. This is architecturally complex — the performance implications of wrapping every table value need investigation.

**Blocks**: Idiomatic Lua cache patterns, observer patterns, memoization.

### 10. `collectgarbage("count")` diagnostic

**Status**: Implemented. All `collectgarbage` modes return safe values without error.

`collectgarbage("count")` returns `0, 0` (no memory tracking — fengari has no GC). `collectgarbage("collect")` drains the `__gc` finalizer queue. `collectgarbage("isrunning")` returns `false`. All other modes return `0`. Previously, ALL modes threw `luaL_error("lua_gc not implemented")`, crashing any Lua code that called `collectgarbage()`.

### Priority summary

| #   | Improvement                            | Effort | Impact   | Status         |
| --- | -------------------------------------- | ------ | -------- | -------------- |
| 1   | Coroutine↔Promise bridge               | High   | Critical | ✅ Implemented |
| 2   | Custom `require()` for vault Lua files | Medium | High     | ✅ Implemented |
| 3   | 32-bit → 53-bit integers               | Medium | High     | ✅ Implemented |
| 4   | `__gc` via FinalizationRegistry        | Medium | Medium   | ✅ Implemented |
| 5   | JS RegExp exposed to Lua               | Low    | Medium   | ✅ Implemented |
| 6   | Re-enable `load()` with sandboxing     | Low    | Medium   | ✅ Implemented |
| 7   | sprintf-js replacement                 | Low    | Low-Med  | ✅ Implemented |
| 8   | Error message quality                  | Low    | Medium   | ✅ Implemented |
| 9   | Weak tables via WeakRef                | High   | Low-Med  | Not started    |
| 10  | `collectgarbage("count")`              | Low    | Low      | ✅ Implemented |

## Yank-ring paste cycling

**Status**: Implemented. Cycle through numbered register history after pasting.

After `p`, `P`, `gp`, or `gP`, pressing `<C-p>` replaces the pasted text with the contents of the next numbered register (`"1`–`"9`). `<C-n>` cycles in the opposite direction. Cycling wraps around. Any non-cycling command cancels the cycling state, after which `<C-p>`/`<C-n>` revert to their default `k`/`j` behavior.

Enable/disable via **Settings → Vim Motions → Vim features → Yank-ring paste cycling** or `set yankring` / `set noyankring` in vimrc.

**Known limitations**:

- ~~**Visual-mode paste cycling not supported**~~: Fixed. Cycling now works after visual-mode paste (`viw` + `p` + `<C-p>`). Detects visual paste via anchor/cursor position comparison at snapshot time. Computes paste range via doc-length arithmetic (`pasteLen = newDocLen - oldDocLen + selectionLen`). Visual block paste is excluded. `gp`/`gP` in visual mode bypass the yank-ring (they use custom paste actions that don't trigger `vim-keypress`).
- **System clipboard paste timing**: The fork's `paste` action uses `navigator.clipboard.readText()` asynchronously for system clipboard registers (`"+p`). The paste override captures state via `setTimeout(0)`, which may fire before the clipboard Promise resolves. Cycling after system clipboard paste is unreliable.
- ~~**Non-text clipboard content (images) silently ignored by `p`**~~: Fixed. When `clipboard=unnamed` or `unnamedplus` is set and the system clipboard contains non-text content (e.g., an image), `p` previously did nothing — `readText()` returned `""` and `continuePaste()` bailed silently. The fork now falls back to `document.execCommand('paste')` when `readText()` returns empty or rejects, triggering Obsidian's native paste pipeline (attachment creation + `![[Pasted image …]]` insertion). Covers `p`, `]p`, `[p`, `:put`, and explicit `"+p`. The editor stays in normal mode after the fallback. `P`/`gp`/`gP` (overridden by the host plugin's `pasteFromRegister()`) are not affected — they have a separate issue where they don't read the system clipboard at all.
- **Workspace navigation dependency**: `P`, `gp`, `gP` paste actions are defined by `registerWorkspaceNavigation()`. If workspace navigation is disabled (`enableWorkspaceNav=false`), cycling after these three commands silently fails. Cycling after `p` still works (fork's built-in action).
- ~~**Dot-repeat**: Pressing `.` after cycling repeats the original paste, not the final cycled text.~~ Fixed. On cycling exit, the final cycled content is written to the original paste register. The fork's `repeatLastEdit` re-reads the register at replay time, so `.` pastes the final cycled text. Follows yanky.nvim's `update_register_on_cycle` semantics. System clipboard registers (`"+`/`"*`) are excluded.
- **Undo grouping**: Each cycle replacement uses `addToHistory.of(false)` so it does not create a separate undo entry. Pressing `u` after cycling undoes the entire paste+cycle sequence.
- **Register traversal**: Only numbered registers `"1`–`"9` are traversed (delete/change history). Register `"0` (last yank) and `"-` (small delete) are not included in the cycle.

## Indentation text object

**Status**: Implemented. `ii`/`ai` select indentation blocks.

`ii` (inner indentation) selects all contiguous lines with the same or greater indentation level as the cursor line. `ai` (around indentation) extends the selection to include the parent line above (first line with strictly less indentation) and trailing blank lines below.

Zero-indentation lines and blank lines return no match (no selection change). Tab indentation is handled column-aware using the editor's `tabSize` setting.

Gated behind the existing `enableTextObjects` setting.

## Animated cursor (smear + smooth movement)

**Status**: Implemented (Phase 1 + Phase 2 + Phase 3). ([#78](https://github.com/saberzero1/motions/issues/78))

Canvas-based animated cursor with smooth movement and spring-damper smear trail. Per-mode cursor shape rendering (block, bar, underline, hollow). Fork-side cursor suppression via `setCursorSuppressed()`. Disabled by default — enable via **Settings → Vim Motions → Animated cursor** or `set smoothcursor` / `vim.opt.smoothcursor = true`.

**Known limitations**:

- **Fork mode only**: The animated cursor requires the bundled codemirror-vim fork. It does not work with Obsidian's built-in vim mode.
- **Pop-out windows**: The rAF scheduler uses the main window's `requestAnimationFrame`. Canvases in pop-out windows are not ticked.
- **Cursorline desync**: When the cursor animates from one line to another, the cursorline highlight jumps instantly to the destination (driven by selection state). The cursorline does not animate in sync with the smooth cursor.
- ~~**No cursor blink**~~: Fixed. The canvas cursor now blinks matching CM6's default behavior (1200ms cycle, 600ms reset delay after movement). Blink only when focused.
- ~~**No `vim.opt` / vimrc configuration**~~: Fixed. All 8 animated cursor settings are available via `set smoothcursor` / `vim.opt.smoothcursor` and related options.
- **Textarea and table cell editor fallback**: The animated cursor does not render inside textarea vim overlays or native table cell editors. These contexts have the native cursor restored via per-view un-suppression in their constructors. On teardown, `clearCursorSuppressedForView()` removes the per-view override so the view falls back to the global suppression state.
- **Popover and modal editor fallback**: The animated cursor canvas (`z-index: 15`) renders behind Obsidian's popovers (`z-index: 30`) and modals. Editors inside `.popover` or `.modal-container` are detected by the `CursorController` constructor (`isAboveCanvas` flag) and fall back to the fork's native vim cursor via `setCursorSuppressedForView(view, false)`. The `tick()` method skips canvas rendering for these views. This covers footnote popovers, hover editors, and third-party plugin editors created inside modals. ([#130](https://github.com/saberzero1/motions/issues/130))
- ~~**Doubled cursors in embedded editors**~~: Fixed. In textarea vim overlays, the native text caret appeared alongside the fork's block cursor after switching from insert to normal mode. Root cause: `BlockCursorPlugin.update()` checked the `.cm-vimMode` DOM class to determine insert/normal mode, but CM6 ViewPlugin update ordering meant the class may not yet reflect the current mode. Fixed in the fork by checking `this.cm.state.vim.insertMode` directly. Also uses `setProperty("caret-color", ..., "important")` for CSS specificity robustness. ([#130](https://github.com/saberzero1/motions/issues/130))
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`BlockCursorPlugin.update()` — vim-state-based `caretColor`)
- ~~**Escape does not close footnote popover**~~: Fixed. The fork's `findKey` consumed `<Esc>` unconditionally in idle normal mode. Fixed via `setIdleEscapeCallback` API — the plugin registers a callback that calls `HoverPopover.hide()` for non-workspace-leaf editors (popovers, modals) while silently consuming Escape in workspace-leaf editors. ([#130](https://github.com/saberzero1/motions/issues/130))
    - Fork: `~/Repos/codemirror-vim/src/vim.js` (`setIdleEscapeCallback` API)
    - Plugin: `src/vim/escape-guard.ts` (`installEscapeGuard`)
- ~~**Stale cursor suppression after animated cursor toggle**~~: Fixed. `CursorController` constructor now gates suppression on `config.enabled`; `update()` clears per-view override when disabled. ([#130](https://github.com/saberzero1/motions/issues/130))
- ~~**Cursor flashing in Normal mode after table interaction**~~: Fixed. Four issues: (1) `mainEditorTableCursorGuard` and `cellEditorCursorGuard` in `table-cell-cursor-guard.ts` used `setCursorSuppressedForView(view, false)` to unsuppress the cursor when leaving a table — this sets an explicit per-view override that conflicts with the animated cursor's global `setCursorSuppressed(true)`, causing the native CM6 cursor to flash alongside the canvas cursor. (2) `mainEditorTableCursorGuard.destroy()` did not restore suppression state when the cursor was inside a table at destruction time, leaving a stale `true` override through plugin recreation. (3) `cellEditorCursorGuard.update()` force-unsuppressed the cell cursor on every update cycle (same anti-pattern removed from `CursorController.update()` in commit 62444df). (4) `reloadFeatures()` did not call `setCursorSuppressed(this.settings.animatedCursor)` — the global suppression flag was only set during `onload()`, so any runtime setting toggle via `reloadFeatures()` left the global flag stale. All unsuppress paths in `table-cell-cursor-guard.ts` and `table-nav-controller.ts` now use `clearCursorSuppressedForView()` (removes the override, falls back to global state). `reloadFeatures()` now syncs the global suppression flag on every call. Also fixes invisible cursor in textarea vim when animated cursor is enabled. ([#127](https://github.com/saberzero1/motions/issues/127))
- ~~**Doubled cursors when animated cursor is disabled**~~: Fixed. When animated cursor was disabled, the native CM6 cursor (thin blinking bar) appeared alongside the fork's vim cursor (block/hollow) in normal, operator-pending, and replace modes. The native cursor became visible after entering and leaving insert mode. Root cause: the fork's `BlockCursorPlugin.update()` relied on a CSS `baseTheme` rule (`.cm-vimMode > .cm-cursorLayer:not(.cm-vimCursorLayer) { display: none }`) to hide native cursor layers, but CM6's `drawSelection` extension and mode transitions (insert mode removes `.cm-vimMode`, normal mode re-adds it) left native layers visible due to CSS specificity conflicts. Fixed in the fork by unconditionally hiding native CM6 cursor layers (`display: none`) and setting `caretColor: transparent` on every `update()` call, regardless of suppression state. In insert mode with bar cursor (`.cm-vimMode` removed, fork doesn't render a fat cursor), `caretColor` is set to `var(--interactive-accent)` to match the vim cursor color. The suppression API (`setCursorSuppressed`) now only controls the fork's own vim cursor layer visibility. ([#129](https://github.com/saberzero1/motions/issues/129))
    - Fork: `~/Repos/codemirror-vim/src/block-cursor.ts` (`BlockCursorPlugin.update()` — unconditional native layer hiding + mode-aware `caretColor`)
    - Fork: `~/Repos/codemirror-vim/DIFFERENCES.md` (updated `setCursorSuppressed` API section)
- ~~**Count-prefixed and multi-key motions not animated**~~: Fixed. Movements like `4j` and `g$` caused the cursor to teleport because `resolveVimMode()` used `vim.status` (the chord display string set on every keystroke) to detect operator-pending mode. This triggered false cursor shape changes (block → underline → block), and each shape change called `snap()`. Fixed by gating operator-pending detection on `inputState.operator` only. ([#86](https://github.com/saberzero1/motions/issues/86))
- **Table navigation cursor hiding**: Both native and animated cursors are hidden during embedded table navigation. The controller dispatches `enterTableNav` so the `mainEditorTableCursorGuard` defers to table-nav, and `suppressWidgetCursorLayers()` hides cell editor cursor layers on every ViewUpdate (cell editors are destroyed and recreated during entry, each spawning a fresh `BlockCursorPlugin` with a visible cursor layer). `cellEditorCursorGuard.destroy()` guards on `isTableNavActive()` to avoid clearing parent cursor suppression during table-nav. The animated cursor snaps to the exit position (no interpolation) when resuming after table navigation. ([#135](https://github.com/saberzero1/motions/issues/135))
- **Multi-editor support**: The animated cursor now supports multiple editors (including the oil file explorer) via a single shared canvas architecture. `MAX_CONTROLLERS` is 16.
- **Multi-cursor**: Only the primary cursor is animated. Secondary cursors (from visual block or multi-cursor plugins) are not rendered by the animated cursor.
- **Incompatible with cursor animation plugins**: ninja-cursor and cursor-smith plugins conflict with the animated cursor. Disable them when using the built-in animated cursor.
- ~~**EoL cursor displacement in visual mode**~~: Fixed. The animated cursor rendered one character past the last visible character at end-of-line during forward visual selection. `refreshTarget()` used a `ch !== '\n'` guard that prevented stepping back from `sel.head` when it pointed to a newline. Replaced with a line-boundary guard (`pos > line.from`) that correctly handles end-of-line, empty lines, and document end. ([#105](https://github.com/saberzero1/motions/issues/105))
- ~~**Character displaced on lines with tall content**~~: Fixed. On lines containing tall inline content (e.g., MathJax with `\dfrac`), the character beneath the block cursor could shift vertically. The renderer centered the character within the `coordsAtPos()` rect height, which on some platforms returns the full line height instead of the per-character height. On a tall line (~80px) with a normal font height (~19px), this caused a ~30px downward shift. Fixed by using the actual DOM character bounding rect (`Range.getBoundingClientRect()` via `domAtPos`) for baseline calculation instead of relying solely on `coordsAtPos()`. Falls back to the `coordsAtPos()` rect when the DOM rect is unavailable (widget/replaced content). ([#106](https://github.com/saberzero1/motions/issues/106))
- **Bogus coordinates in replaced widgets**: `coordsToRect()` includes a bounds check to reject bogus coordinates from `coordsAtPos()` when the cursor is inside a replaced widget (e.g., a math block or image). This prevents the cursor from "flying away" to the top-left of the viewport.
- **Canvas context limits**: The manager includes a null-check on `getContext('2d')` to handle browser-imposed limits on the number of active canvases.
- ~~**rAF loop death on Windows**~~: Fixed. The rAF loop is now wrapped in try/catch so a single bad frame cannot kill the animation permanently. A 500ms heartbeat `setInterval` detects stalled loops and re-wakes them (covers Windows 11 Efficiency Mode, window occlusion tracking, and high-resolution timer suppression). A `visibilitychange` listener re-wakes the loop when the page regains visibility. Canvas backing-store dimensions are rounded with `Math.round()` for fractional `devicePixelRatio` on Windows displays with 125%/150% scaling.

**Nice-to-have (future iterations)**:

- **Insert mode trail suppression**: Shorter or disabled smear trail in insert mode to avoid distracting trails during typing (matching smear-cursor.nvim's `max_length_insert_mode: 1`).
- ~~**Operator-pending mode detection**~~: Fixed. Operator-pending mode (`d`, `c`, `y` waiting for motion) is now detected via `vim.inputState.operator` with per-frame shape polling.
- ~~**`vim.opt.smoothcursor` / vimrc `set smoothcursor`**~~: Fixed. All 8 options available via vimrc (`set smoothcursor`, `set smoothcursorsmoothness=0.3`, etc.) and Lua (`vim.opt.smoothcursor = true`, etc.).
- ~~**Oil explorer support**~~: Fixed. Animated cursor renders in oil explorer via shared single-canvas architecture. Table cell editors and textarea overlays fall back to native cursor.
- **Multi-cursor animation**: Animate secondary cursors (static indicators or spring physics). Deferred to Phase 4+ — multi-cursor in vim is uncommon.
- **Built-in vim mode support**: Position source validation and cursor hiding for Obsidian's built-in vim mode (Phase 4).
- **Pop-out window support**: Per-window rAF scheduling for pop-out windows (Phase 4).

## Settings: leader bindings and which-key labels use imperative rendering

**Status**: Known limitation. Architecturally incompatible with `SettingDefinitionList`.

The leader key bindings, which-key group labels, and which-key command labels groups use `render` callbacks in the declarative settings path (`getSettingDefinitions()`) that delegate to imperative methods (`renderLeaderBindings`, `renderGroupLabels`, `renderCommandLabels`). These render methods build the UI manually with `new Setting()` calls, add/remove buttons, and dynamic row management.

Investigation found that Obsidian 1.13+'s `SettingDefinitionList` (`type: 'list'`) is designed for lists of single-control items, not multi-column table rows. Each leader binding row has 2 text inputs + 2 buttons; each group/command label row has 4 text inputs + 1 button. `SettingDefinitionList` items are `SettingDefinitionItem[]` with one control per item — there is no built-in support for multi-input rows. Converting would require either losing the multi-column layout (poor UX) or using `render` callbacks inside the list (losing the native drag/delete/add affordances that motivated the migration).

The current `render` callback approach is the correct pattern for these complex settings. The imperative path works identically on pre-1.13. No migration planned.

## Resolved Issues

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

## ~~Custom text objects via Lua (vim.textobject)~~ (Fixed)

**Status**: Fixed. Lua text object specs are now persisted and re-registered after `reloadFeatures()`.

The `vim.textobject.add()` / `vim.gen_spec.pair()` API registers custom text objects from Lua configuration. The pair matching logic (asymmetric delimiters, nesting, multi-line) is verified working via 26 unit tests on `createAsymmetricPairTextObject` and 5 passing E2E tests.

Root cause of the original issue: `loadLuaConfigInternal()` called `reloadFeatures()` AFTER the Lua config registered text objects. `reloadFeatures()` destroyed the `VimRegistration` instance that held the Lua-registered keybindings and created a fresh one that had no knowledge of them. Fix: text object specs are stored in `this.luaTextObjectSpecs[]` during the `onTextObjectAdd` callback, then `reregisterLuaTextObjects()` replays them on the new `VimRegistration` instance after `reloadFeatures()` completes.

## ~~Block cursor displays wrong character after editor refocus~~ (Fixed)

**Status**: Fixed in the codemirror-vim fork. ([#71](https://github.com/saberzero1/motions/issues/71))

When the editor lost and regained focus (e.g., opening/closing DevTools, switching windows), the vim block cursor could display the wrong character. This occurred because Obsidian's Live Preview re-expands hidden markdown formatting (like `## ` in headings) when the editor regains focus, but the block cursor's `requestMeasure` ran in the same animation frame — before the browser reflowed the newly expanded decorations. `coordsAtPos()` returned stale layout coordinates from the pre-reflow DOM, causing the cursor to render the character from the old visual position.

Fixed with two changes in the fork:

1. `BlockCursorPlugin.update()` now includes `update.focusChanged` in its redraw trigger, ensuring the cursor re-measures on focus transitions.
2. On focus gain, a deferred `requestAnimationFrame` schedules a second `requestMeasure` that runs after the browser has reflowed the decoration DOM changes.

## ~~Smart list continuation and frontmatter~~ (Fixed)

`O` (open line above) on the first content line after YAML frontmatter previously behaved like `o` (open line below). The smart list continuation override in `src/actions/open-line.ts` compared `curLine === cm.firstLine()` to decide whether to use the "insert at document start" path. With frontmatter present, `cm.firstLine()` returns 0 (the opening `---`) while the cursor is on the first post-frontmatter line (e.g. line 3), so the check was always false. The else branch inserted at the end of the previous line — which fell inside the frontmatter region, causing Obsidian's properties UI to swallow the new line.

Fixed in both layers:

- **Fork** (`vim.js`): `newLineAndEnterInsertMode` now scans past `---`-delimited frontmatter to find the first editable line and uses `insertAt.line <= firstEditable` as the boundary check. The insertion point uses `{ line: insertAt.line, ch: 0 }` instead of hardcoded `cm.firstLine()`. This fixes `O` on all line types (plain text, headings, etc.).
- **Plugin** (`open-line.ts`): the smart list continuation override adds `firstEditableLine()` with the same frontmatter scan, changing the boundary check to `curLine <= firstEditableLine(cm)`. This fixes `O` on list lines specifically.

Documents without frontmatter are unaffected — both paths fall back to `cm.firstLine()` when the first line is not `---`.

**Test coverage**: `test/specs/open-line-list.e2e.ts` — 7 regression tests: `O` on unordered/ordered/task list after frontmatter inserts above, `o` on list after frontmatter inserts below, `O` on non-list line after frontmatter inserts above, `o` on non-list line after frontmatter inserts below, `O` on second line after frontmatter uses normal insertion path.

## ~~Scrolloff line height assumption~~ (Fixed)

Scrolloff now uses `EditorView.defaultLineHeight` to dynamically measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height. Note: `defaultLineHeight` returns an average line height — documents with mixed-height lines (e.g., headings with larger fonts) may not have pixel-perfect scrolloff distances.

The scrolloff value accepts 0–9999 (previously capped at 20). Setting `set scrolloff=999` in your vimrc keeps the cursor vertically centered while scrolling, matching standard Vim behavior. The Settings UI uses a validated number input field instead of a slider. The scroll margin is clamped to half the viewport height at runtime, mirroring Vim's silent cap of `scrolloff` to `(window_height - 1) / 2`. ([#40](https://github.com/saberzero1/motions/issues/40), [#48](https://github.com/saberzero1/motions/issues/48))

## ~~Absolute line number highlight not updating on cursor movement~~ (Fixed)

**Status**: Fixed. `lineMarkerChange` now includes `update.selectionSet` in absolute mode. ([#68](https://github.com/saberzero1/motions/issues/68))

When only absolute line numbers were enabled (`set number` without `set relativenumber`), the `vim-motions-line-num-current` CSS class (bold highlight on the current line number) did not update when the cursor moved. The highlight stayed stuck on whichever line was current when the document was last modified, only updating incidentally when entering special content (MathJax, images) that triggered `docChanged` or `viewportChanged`.

Root cause: the `lineMarkerChange` callback in the CM6 `gutter()` configuration — in both the standalone line number gutter (`src/vim/line-number-gutter.ts`) and the unified `statuscolumn` gutter (`src/vim/statuscolumn.ts`) — returned `update.docChanged` (without `update.selectionSet`) when the mode was absolute-only. This was an optimization assuming the displayed text doesn't change on cursor movement (true for absolute numbers), but it forgot that the `isCurrent` flag on each `LineNumberMarker` also changes — without a re-render, the CSS class was never added/removed. Relative and hybrid modes were unaffected because they already included `update.selectionSet` (the displayed numbers change on every cursor move).

## ~~Fold gutter click does not unfold~~ (Fixed)

**Status**: Fixed. A transaction extender normalizes `unfoldEffect` ranges for all fold sources. ([#80](https://github.com/saberzero1/motions/issues/80))

Clicking a fold marker to unfold had no effect. CM6's `foldState` requires an exact `{from, to}` match to remove a fold decoration; a mismatched range is silently ignored.

Two layers were fixed: (1) The plugin's own custom gutters (`fold-column.ts`, `statuscolumn.ts`) dispatched `unfoldEffect` with `{ from: line.from, to: line.from }` (zero-width range) instead of the actual fold range. Fixed by capturing the fold end from `foldedRanges().between()`. (2) The broader issue: these custom gutters are off by default, and Obsidian's **native** fold gutter can also dispatch unfold effects with ranges that don't exactly match the stored fold. Fixed by adding `unfoldNormalizerExtender` in `src/vim/fold-sync.ts` — a `transactionExtender` that detects mismatched unfold effects and appends a corrective effect with the actual stored fold range. This works for all fold sources: Obsidian's native gutter, the plugin's custom gutters, and vim commands.

## ~~Properties fold observer causes scroll jump with third-party plugins~~ (Fixed)

**Status**: Fixed. The observer now only reacts to `is-collapsed` class toggles. ([#89](https://github.com/saberzero1/motions/issues/89))

The `propertiesFoldObserver` ViewPlugin in `src/vim/fold-sync.ts` watches `.metadata-container` for class mutations and dispatches `EditorView.scrollIntoView()` to keep the cursor visible after properties fold/unfold. The observer originally reacted to ANY class attribute change — including no-op re-assignments and non-fold mutations from third-party plugins (e.g., Meta Bind input fields in the properties panel). This caused the editor to scroll back to the last vim cursor position whenever a plugin triggered a class mutation on the metadata container.

Fixed by adding `attributeOldValue: true` to the `MutationObserver` config and comparing old vs new `is-collapsed` presence. The observer now only fires when the fold state actually changes. No-op mutations (identical class string before and after) and non-fold mutations (any class other than `is-collapsed`) are ignored.

**Test coverage**: `test/specs/properties-fold-scroll.e2e.ts` — 4 regression tests: non-fold class mutation preserves scroll, no-op class re-assignment preserves scroll, fold toggle triggers scroll, unfold toggle triggers scroll.

## ~~Insert mode escape (`set insertmodeescape=jk`) not working~~ (Fixed)

**Status**: Fixed. `InsertEscapeHandler` rewritten to use DOM `keydown` events; timeout made configurable. ([#31](https://github.com/saberzero1/motions/issues/31))

`set insertmodeescape=jk` required frame-perfect input timing (effectively unusable). Two issues were identified:

1. **Wrong event source**: The handler listened to `vim-keypress` events on the codemirror-vim adapter. In insert mode, regular character keys (`j`, `k`) bypass the vim command pipeline entirely and go through CM6's text input handler — `vim-keypress` only fires for keys that codemirror-vim processes as vim commands (e.g., `<Esc>`, mapped sequences). The handler never saw insert-mode character keystrokes.

2. **Option value not retrievable**: The `insertmodeescape` option's `defineOption` callback did not store the value for `getOption()` retrieval. When `getOption('insertmodeescape')` was called, it returned `undefined` (the callback returned nothing on query), so the handler's escape sequence check always short-circuited at `escapeSeq.length < 2`.

**Fix**: Rewrote `InsertEscapeHandler` (`src/vim/insert-escape.ts`) to use DOM `keydown` events captured on the editor element. The handler filters for single printable characters (ignoring Ctrl/Alt/Meta modifiers), checks the vim state for insert mode via the adapter, and accumulates a sequence buffer with configurable timeout. On match, `e.preventDefault()` + `e.stopPropagation()` blocks the final character from being inserted, then `<BS>` × sequence length + `<Esc>` is dispatched through the vim API. Added module-level storage for both `insertmodeescape` and `insertmodeescapetimeout` option values so `getOption()` returns the configured values.

**Timeout**: Configurable via `set insertmodeescapetimeout=N` (alias `imet`, range 100–5000ms, default 1000ms — matching Neovim's `timeoutlen`). Previously hardcoded at 200ms. Also configurable via **Settings → Vim Motions → Vim engine → Insert mode escape timeout**.

**Test coverage**: `test/specs/vimrc.e2e.ts` — two tests: `jk` typed within timeout exits insert mode, `jk` typed after timeout stays in insert mode.

## ~~EasyMotion leader key conflict with `mapCommand`~~ (Fixed)

EasyMotion and hint mode bindings call `unmapDefaultBinding(leader)` before `mapCommand` registration. This removes the leader key's default Vim binding (e.g. `<Space>` → `l`, `,` → `repeatLastCharacterSearch`) from codemirror-vim's keymap so that `mapCommand` multi-key sequences starting with the leader can accumulate in the input buffer. The vimrc parser correctly handles `let mapleader = " "` (space inside quotes). EasyMotion works with any leader key, including space, comma, and semicolon.

`unmapDefaultBinding` passes `{ includeDefaults: true }` to `vim.unmap()`, which is required because codemirror-vim's default keymap entries are tagged with `_isDefault` and `unmap()` silently skips them without this flag. Without `includeDefaults`, keys with built-in bindings (`,`, `;`, `-`, `+`, etc.) would not be unmapped, causing the default single-key binding to consume the first keystroke before the multi-key EasyMotion sequence (e.g. `,,w`) could accumulate.

The plugin now unmaps the leader key's default binding centrally — after vimrc loading, in `reregisterLeaderFeatures()`, and in `reloadFeatures()` — independent of which features are enabled. Previously, `unmapDefaultBinding(leader)` was only called inside `registerEasyMotion()`, so keys with default bindings (most notably space, whose `<Space>` → `l` default caused it to move the cursor right instead of acting as leader) only worked as leader when EasyMotion was enabled. All leader-dependent features (table manipulation, hint mode, settings leader bindings) now work with any leader key even when EasyMotion is disabled. ([#21](https://github.com/saberzero1/motions/issues/21))

The fork also normalizes literal special characters in key strings to angle-bracket notation when they enter the keymap. The `<leader>` substitution in the vimrc loader replaces `<leader>` with the literal leader character — for space, this produces `' j'` from `nmap <leader>j gj`. However, `vimKeyFromEvent` converts space key presses to `'<Space>'` (angle-bracket notation). Without normalization, `commandMatch('<Space>', ' j')` would never match because it uses exact string comparison. The fork's `normalizeKeyString` converts `' j'` to `'<Space>j'` in `_mapCommand` before the entry is stored, so the dispatched `'<Space>'` correctly partial-matches and `'<Space>j'` fully matches. This normalization also applies to `toKeys` (the rhs of `keyToKey` mappings), `unmap()`, and `removeMapCommand()`.

When `.obsidian.vimrc` sets a custom leader via `let mapleader = ","`, the plugin properly cleans up the initial backslash-leader bindings and re-registers all leader-dependent features (EasyMotion, hint mode, table manipulation, settings leader bindings) with the new leader. Previously, the old `\`-leader `mapCommand` entries persisted in the keymap alongside the new leader bindings because `Vim.unmap()` could not remove `mapCommand`-created entries. The fork provides `Vim.removeMapCommand(keys)` for clean removal.

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

2. **Plugin-side (all invocation paths)**: `src/vim/visual-line-command-fix.ts` uses three complementary patches. First, `app.commands.executeCommand` is wrapped via `around()` — when the active editor is in visual-line mode, the wrapper expands the CM6 selection before the command executes and restores cursor-only after. This covers Obsidian hotkeys (capture phase on `window`), toolbar buttons, and programmatic `executeCommandById` calls (which delegates to `executeCommand` internally). Second, every command's `checkCallback` is individually wrapped to expand the visual-line selection before the callback runs. This covers the command palette, which invokes `checkCallback()` directly on the command object (bypassing `executeCommand` entirely). `app.commands.addCommand` is also wrapped so commands registered after plugin load are covered. ([#137](https://github.com/saberzero1/motions/issues/137))

3. **Plugin-side (editor API patching)**: The `VisualLineSomethingSelectedPatch` CM6 ViewPlugin patches three methods on Obsidian's `Editor` object: `somethingSelected()` returns `true` when vim is in visual-line mode with an active selection; `getSelection()` returns the full linewise text from vim's selection state; and `replaceSelection()` dispatches a CM6 replacement transaction covering the linewise range (with trailing newline handling) and exits visual-line mode via `Vim.handleKey(cm, '<Esc>')`. This layer is essential for community plugins with async command callbacks (e.g., Note Refactor) — they read the selection synchronously but call `replaceSelection()` after `await`ing file creation, by which time the `executeCommand` wrapper's `finally` block has already restored cursor-only CM6 selection. ([#138](https://github.com/saberzero1/motions/issues/138))

**Trade-off**: `cm.somethingSelected()` and `cm.getSelection()` (the CM5-compat adapter methods) return false/empty in visual-line mode during vim key processing. Third-party plugins that depend on CM6 selection state during visual-line mode may not detect the selection. The canonical integration point `window.CodeMirrorAdapter.Vim` is unaffected. Obsidian's `Editor` API (`editor.somethingSelected()`, `editor.getSelection()`, `editor.replaceSelection()`) sees the correct linewise selection because of the `VisualLineSomethingSelectedPatch` ViewPlugin.

**Test coverage**: 8 Neovim golden comparison cases + 7 e2e functional tests covering yank, delete, join, mode transitions, `gv`, register content verification, and mid-column visual-line with checkbox content. 3 e2e tests (`visual-line-command.e2e.ts`) verifying `checkCallback` returns `true` for Note Composer's `split-file` command, `editor.somethingSelected()` returns `true`, and `executeCommandById` affects all selected lines in visual-line mode. 5 spike tests (`spike-issue138-vline-async-replaceSelection.e2e.ts`) verifying `replaceSelection` works in visual-line mode for sync, async, and direct invocation patterns. 10 spike tests (`spike23-visual-line-hotkey-commands.e2e.ts`) verifying command execution via `executeCommandById`, hotkey path, and selection state inspection.

## ~~Visual-line mode highlight missing on replaced widget blocks~~ (Fixed)

**Status**: Fixed. Replaced widget blocks (MathJax, embeds, etc.) now receive visual-line highlight. ([#57](https://github.com/saberzero1/motions/issues/57))

In visual-line mode (`V`), the fork's `linewiseVisualHighlight` ViewPlugin uses `Decoration.line()` to apply `.cm-vim-linewise-selection` to each `.cm-line` element. When Obsidian's Live Preview replaces content with rendered widgets (block MathJax `$$`, note embeds `![[note]]`, plugin table widgets), the `.cm-line` elements are removed from the DOM and replaced by widget container elements. `Decoration.line()` silently drops decorations for lines inside replaced ranges, leaving those widget blocks visually unhighlighted during selection.

Fixed by adding a plugin-side `LinewiseWidgetHighlight` ViewPlugin (`src/vim/linewise-widget-highlight.ts`) that supplements the fork's line-level highlighting. On each CM6 update during visual-line mode, the plugin scans `contentDOM` direct children for non-`.cm-line` elements (widget containers), maps them to document positions via `view.posAtDOM()`, and toggles `cm-vim-linewise-widget-selection` on widgets whose document range overlaps the visual-line selection. The class is removed on mode exit and `destroy()`.

The fix is generic — it highlights any replaced widget type based on DOM structure (non-`.cm-line` direct child of `contentDOM` with non-zero height), not specific widget classes. `Decoration.mark()` was validated as non-viable (marks only wrap text content nodes, which replaced widgets lack). The fork's `linewiseVisualHighlight` remains unchanged.

~~**Callout linewise highlight not visible**~~: Fixed. Two CSS specificity issues prevented visual-line selection highlighting from appearing on callouts: (1) Collapsed callout widgets (`cm-embed-block cm-callout`) had their `cm-vim-linewise-widget-selection` background overridden by the callout's own styling. (2) Unfolded callout lines (`.cm-line.HyperMD-quote`) had their `cm-vim-linewise-selection` background overridden by Obsidian's `.markdown-source-view.mod-cm6.is-live-preview .HyperMD-quote { background-color: var(--blockquote-background-color) }` rule (specificity 0,4,0). Fixed by increasing the selection rule specificity to (0,5,0) via the `.cm-editor .cm-scroller .cm-content` ancestor chain, outranking Obsidian's blockquote rule without `!important`. Both collapsed and unfolded callout states now show the selection highlight. ([#103](https://github.com/saberzero1/motions/issues/103))

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

## ~~Properties navigation in bundled fork mode~~ (Fixed)

Properties navigation now works in bundled fork mode. The fork's `findPosV` adapter detects when `moveVertically` lands the cursor inside the frontmatter region or when the cursor is stuck at the boundary of the properties widget, and provides a `focusBefore` callback that focuses the "Add property" button in Obsidian's metadata container. Both `k` and `gk` enter the properties panel — `gk` (`moveByDisplayLines`) checks `focusBefore` on the `findPosV` result, matching the existing check in `moveByLines`.

The `stuckAtBoundary` check uses `range.head === startOffset` to distinguish "cursor truly couldn't move" from "cursor moved to a different display line within a wrapped line." Without this guard, `gk` on a long wrapped first content line would fire `focusBefore` immediately instead of navigating through the wrapped display lines first — the cursor stayed on the same document line (`pos.line === start.line`) but at a different character offset.

The plugin's `tableAwareMoveUp` motion (which overrides `k` when table navigation is enabled) bypasses `findPosV` with its own line arithmetic. To preserve frontmatter navigation, `tableAwareMoveUp` delegates to `findPosV` when the computed target line falls inside the frontmatter region, allowing the `focusBefore` callback to fire. ([#25](https://github.com/saberzero1/motions/issues/25))

~~**Source mode regression**: The frontmatter interception fired unconditionally in both live-preview and source mode. In source mode, frontmatter is plain text with no properties widget — the interception found no focus target and left the cursor stuck below the frontmatter.~~ Fixed by gating the entire frontmatter interception on Obsidian's `editorLivePreviewField` state field via the fork's new `setLivePreviewField()` API. In source mode (`editorLivePreviewField = false`), the block is skipped and the cursor moves through raw frontmatter text normally. ([#77](https://github.com/saberzero1/motions/issues/77))

~~**"Properties in document: Source" in Live Preview**: When the editor was in Live Preview mode but Obsidian's "Properties in document" setting was set to "Source", frontmatter was rendered as raw `---`-delimited text. The `.metadata-container` DOM element still existed but was hidden (`display: none`). The `focusBefore` callback found the hidden element via `querySelector`, focused it (no visible effect), and `moveByLines`/`moveByDisplayLines` returned the original cursor position — leaving `k`, `gk`, and `<Up>` stuck.~~ Fixed by adding a `setPropertiesSource(fn: () => boolean)` API to the fork. When the callback returns `true`, the frontmatter interception block is skipped entirely. The plugin passes `() => getVaultConfig(app, 'propertiesInDocument') === 'source'`, evaluated per cursor movement so runtime setting changes take effect immediately. ([#77](https://github.com/saberzero1/motions/issues/77))

**Test coverage**: `test/specs/vim-builtin/g-commands.e2e.ts` — 6 regression tests: `gk` navigates wrapped display lines before entering properties, `gk` enters properties on non-wrapping line, `k` enters properties from first content line, `k` moves up through source-rendered frontmatter (#77), `k` navigates through multiple frontmatter properties (#77), `gk` moves up through source-rendered frontmatter (#77).

## ~~Latex Suite interaction in bundled fork mode~~ (Fixed)

The fork's keydown handler now uses a CM6 `eventObservers.keydown` (DOM event observer) instead of `eventHandlers.keydown`. In CM6's dispatch order, observers run before handlers, guaranteeing vim processes keys first regardless of `Prec` ordering or plugin load order. This eliminates the previous dependency on Obsidian's `community-plugins.json` ordering. Latex Suite's auto-snippets, tabstop navigation, and math-mode features work normally in vim insert mode. ([#107](https://github.com/saberzero1/motions/issues/107))

## ~~Visual line navigation and replaced widget decorations~~ (Fixed)

`gj`/`gk` (and `j`/`k` when mapped to `gj`/`gk`) now correctly navigate into block MathJax (`$$`) and other replaced widget decorations in Obsidian's live preview. Previously, CM6's `moveVertically` treated replaced decorations as atomic, causing the cursor to skip over the entire widget's source range in a single step.

The fork's `findPosV` applies three corrections to CM6's `moveVertically` result:

1. **Multi-line jump clamp**: When `moveVertically` jumps more than one document line and no fold exists in the skipped range, the cursor is clamped to the adjacent document line (±1). This prevents line-skipping on both replaced widgets (MathJax) and variable-height lines (headings with larger fonts).

2. **Tall non-wrapped line detection**: When `moveVertically` stays on the same document line (`lineJump === 0`) but the Y coordinate change is less than half of `defaultLineHeight`, the cursor is "stuck" on a tall non-wrapped line — headings with large font size and/or line-height produce line blocks taller than `defaultLineHeight`, causing `moveVertically` to take multiple steps through the block even though the text doesn't wrap. The fix detects this via `coordsAtPos` comparison and force-moves to the adjacent document line. Legitimate within-line moves (wrapped display lines) produce Y deltas greater than the threshold and are not affected.

3. **Column 0 fallback**: When `moveVertically` correctly crosses one line but drops the cursor at column 0 despite a non-zero goalColumn, `posAtCoords` resolves the correct character position from the pixel X coordinate.

([#26](https://github.com/saberzero1/motions/issues/26))

**Test coverage**: `test/specs/widget-navigation.e2e.ts` (6 tests covering gj/gk/j/k through single and multiple `$$` blocks), `test/specs/vim-builtin/g-commands.e2e.ts` (7 tests covering gk/gj horizontal position preservation across h1–h6 headings and mixed heading/list/text documents), `test/specs/spikes/spike-gk-issue26-repro.e2e.ts` (6 tests covering reporter's exact content with consecutive h2 headings, long wrapped lines, and empty lines).

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

## ~~`:sort` cursor positioning~~ (Fixed)

**Status**: Fixed. `:sort` (and ranged `:2,3sort`) now positions the cursor at the first line of the sorted range via `cm.setCursor()`, matching Neovim. Previously the cursor stayed at line 0 regardless of the sort range.

## ~~`CTRL-V $ d` cursor overshoot~~ (Fixed)

**Status**: Fixed. After a block visual delete to end-of-line (`CTRL-V jj $ d`), the cursor column is now clamped to the remaining line length. Previously `cursorMin(head, anchor)` preserved the original anchor column, which could exceed the shortened line length after deletion.
