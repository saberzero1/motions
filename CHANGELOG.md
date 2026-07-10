# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
