# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
