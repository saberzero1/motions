# Known limitations

This document tracks known limitations, architectural constraints, and intentionally deferred features.

## EasyMotion operator-pending mode

**Status**: Working via fork's async motion support.

`d<leader><leader>w{label}` (delete to an EasyMotion target) works natively through the codemirror-vim fork's async motion system. EasyMotion motions are registered via `defineMotion` and return a `Promise<Pos>`. The fork's `evalInput` resolves the promise and applies the pending operator (`d`, `c`, `y`) to the resulting position.

Visual mode (`v` + easymotion) also works — the fork updates the visual selection head/anchor when an async motion resolves during visual mode.

**Remaining limitations**:

- Dot-repeat (`.`) does not replay operator-pending easymotion operations
- Char-based easymotions (`f`, `F`, `s`, `t`, `T`) in operator-pending mode require an intermediate search-character keypress which adds complexity to the async flow

**Test coverage**: `test/specs/easymotion-comprehensive.e2e.ts` validates d/c/y + easymotion flows.

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

Delimiters inside fenced code blocks are excluded from the scan — the scanner skips lines within ` ``` ` fences. Indented code blocks and inline code are not excluded.

## Table navigation scope

`]|` and `[|` navigate between table cells. The following are intentionally not implemented:

- **`j`/`k` column tracking**: Vim's `defineMotion` has no fall-through mechanism. Overriding `j`/`k` to detect tables on every keypress is fragile and would break normal line navigation if the detection is wrong. Users can add `nmap <Tab> ]|` to their vimrc if they want Tab-based cell navigation.
- **`Tab`/`Shift-Tab`**: These conflict with Obsidian's built-in table Tab handling and insert-mode tab completion.

## Vim in Live Preview table cells

In Live Preview mode, Obsidian replaces Markdown tables with an interactive table widget. Each cell gets its own isolated CM6 editor with a single-line document containing only that cell's text. Vim keybindings are inherited from the main editor via `registerEditorExtension`, so basic motions work.

**Works inside table cells:**

- Mode switching (`Escape`, `i`, `v`, `a`, `o`, etc.)
- Character/word motions (`h`, `l`, `w`, `b`, `e`, `0`, `$`, `f`, `t`)
- Operators within the cell (`d`, `c`, `y`, `x`, `r`, `s`, `.`)
- Visual mode within the cell
- Surround (`ysiw"`, `ds"`, `cs"'`, etc.)
- Table cell navigation (`]|`/`]c` and `[|`/`[c`) — mapped to Tab/Shift-Tab in the table widget
- Vertical cell navigation (`]r`/`[r`) — move to same column in next/previous row
- Table manipulation via `<Leader>t` commands — add/delete/move rows and columns, align columns
- Table manipulation via ex commands (`:tablerowafter`, `:tablecoldelete`, etc.)
- Status bar mode indicator and chord display
- Which-key hints

**Does not work inside table cells:**

- **`u` (undo)**: each cell has its own isolated undo history. `u` only undoes edits within the current cell session, not document-level changes. Use `Ctrl+Z` (Obsidian's undo) for document-level undo.
- **Structural navigation** (`]h`, `[h`, `]l`, `[l`, `]n`, `[n`): operates on the main document, not the cell's isolated content.
- **EasyMotion**: overlays are positioned relative to the main editor viewport.
- **Multi-line text objects** (`iB`, `aC`, `io`, etc.): the cell doc has no surrounding context.
- **Ex mode (`:`)**: opens the command line below the table cell editor instead of the main editor. Commands still execute but the panel position is cosmetically wrong.

**Table cell navigation details:**

- `]r`/`[r` navigates vertically by synthesizing Tab/Shift-Tab × (number of columns). This is the only reliable mechanism — Obsidian's table widget does not respond to synthesized mouse events or focus calls for cell activation. At the first/last row, `]r`/`[r` is a no-op.
- `Escape` in normal mode exits the table cell and returns focus to the main editor.

**Workaround**: For full vim support in tables, switch to **Source mode** (**Settings → Editor → Default editing mode → Source mode**, or the source/preview toggle in the editor toolbar). In Source mode, tables are plain Markdown text and all vim features work normally.

## Vimrc hot-reload

Changing `.obsidian.vimrc` requires reloading the plugin. The vimrc is loaded once during the first `active-leaf-change` event after plugin load. Other settings (text objects, navigation, operators, etc.) hot-reload immediately via `reloadFeatures()`, but vimrc parsing involves one-shot setup (exmap definitions, leader key state) that is not designed for re-entry.

## ~~Scrolloff line height assumption~~ (Fixed)

Scrolloff now uses `EditorView.defaultLineHeight` to dynamically measure the actual line height instead of assuming 22px. The margin adapts automatically when the user changes font size or line height. Note: `defaultLineHeight` returns an average line height — documents with mixed-height lines (e.g., headings with larger fonts) may not have pixel-perfect scrolloff distances.

## `set` option scope

The following `set` options are registered and can be used in `.obsidian.vimrc`:

| Option             | Aliases | Description                                                                 |
| ------------------ | ------- | --------------------------------------------------------------------------- |
| `clipboard`        | `clip`  | `unnamed` or `unnamedplus` — syncs yank/delete/change with system clipboard |
| `tabstop`          | `ts`    | Tab size (stored as Vim option; Obsidian controls actual tab rendering)     |
| `textwidth`        | `tw`    | Wrap width for `gq`/`gw` (default: 80, registered by codemirror-vim)        |
| `shiftwidth`       | `sw`    | Indent unit size (stored as Vim option)                                     |
| `expandtab`        | `et`    | Tabs vs spaces (stored as Vim option)                                       |
| `insertmodeescape` | `ime`   | Two-key sequence to exit insert mode (e.g., `jk`)                           |

Options like `ignorecase`, `smartcase`, `hlsearch`, `incsearch`, `number`, `relativenumber`, and `wrap` are not implemented because they require CodeMirror-level integration beyond what `Vim.defineOption` provides.

Unknown `set` options are silently ignored (no error, no effect).

## `nmap L $` does not work via vimrc

`nmap L $` (mapping `L` to end-of-line) does not work when loaded from `.obsidian.vimrc`. The mapping is applied via `handleEx` during the `active-leaf-change` lifecycle, but the `$` motion as an rhs value is lost before the next keystroke.

Diagnostic findings (spike17):

- `handleEx(cm, 'nmap L $')` works at runtime (test context) but not during the `active-leaf-change` handler.
- `vim.map('L', '$', 'normal')` also fails during the handler — identical behavior.
- `nmap H ^` works via the same handler — the issue is specific to `$` as the rhs.
- `nmap L 0` works via vimrc — other rhs values are not affected.
- `findKey(cm, 'L', 'normal')` returns undefined after vimrc load — the mapping is consumed by the built-in `moveToBottomLine` motion.

Root cause is likely a codemirror-vim lifecycle interaction where `$` in `toKeys` is handled differently during editor initialization than at runtime. obsidian-vimrc-support users report `noremap L $` works in their plugin (issue #264), suggesting the timing of the mapping application relative to the CM Vim extension initialization matters.

Workaround: use `set insertmodeescape=jk` and other vimrc features that do work. For `L` specifically, no workaround exists within the vimrc — the motion works correctly when applied at runtime via Obsidian's developer console.

## `set textwidth` via vimrc does not affect `gq`

`set textwidth=20` in `.obsidian.vimrc` does not change the wrap width used by the `gq`/`gw` operators. The `gq` operator continues to use the default textwidth (80).

Root cause: codemirror-vim's `defineOption` callback for `textwidth` fires during editor initialization with the default value (80), overwriting the plugin's `textwidthValue` that was set during vimrc loading. The plugin's vimrc loader calls `setTextwidth(20)` and `vim.setOption('textwidth', 20)`, but the CM Vim extension initializes for the first editor after vimrc loading completes, resetting the value. A guard (`textwidthSetExplicitly`) prevents the callback from overwriting explicit values, but CM Vim's internal option state still returns 80 for `getOption('textwidth')`.

This is the same class of CM Vim lifecycle issue as `nmap L $` — values set during the `active-leaf-change` handler are overwritten when CM Vim finalizes its initialization.

Workaround: set textwidth at runtime via Obsidian's developer console: `CodeMirrorAdapter.Vim.setOption('textwidth', 20)`.

## `noremap` cannot swap built-in single-key motions

`nnoremap j k` / `nnoremap k j` does not swap the `j` and `k` motions. This is a codemirror-vim architectural constraint: when a `noremap` mapping's rhs is dispatched, the key handler skips all user-defined keymap entries and only searches the default keymap. Since user-defined entries are inserted at the front of the keymap array via `unshift`, the `noremap` dispatch (which starts at `keyMap.length - defaultKeymapLength`) correctly finds the original motion. However, the lhs side of the swap still resolves to the original motion as well, because codemirror-vim's `noremap` flag is tracked globally during dispatch — meaning both sides of a swap end up resolving to the default keymap.

This limitation is confirmed upstream in [obsidian-vimrc-support issue #16](https://github.com/esm7/obsidian-vimrc-support/issues/16), where the maintainer noted: "CodeMirror doesn't support `noremap` [...] recursive mappings are not possible in CodeMirror anyway so `map` or `nmap` should work."

`noremap` does work for preventing recursion in multi-key mappings (e.g. `noremap G G$`) and for remapping keys to different key sequences. It only fails when trying to swap two built-in single-key motions with each other.

## ~~EasyMotion leader key conflict with `mapCommand`~~ (Fixed)

EasyMotion and hint mode bindings now call `unmapDefaultBinding(leader)` before `mapCommand` registration. This removes the leader key's default Vim binding (e.g. `<Space>` → `l`) from codemirror-vim's keymap so that `mapCommand` multi-key sequences starting with the leader can accumulate in the input buffer. The vimrc parser also correctly handles `let mapleader = " "` (space inside quotes). EasyMotion works with any leader key, including space and comma.

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

Limitations:

- The 500ms delay is hardcoded (not configurable via settings)
- User-defined mappings via `Vim.map()` appear in completions but without friendly descriptions (shown as the raw rhs key sequence)
- The overlay does not show during macro playback or when a register prefix (`"a`) is pending

## `<C-w>` prefix conflict with Obsidian hotkeys

The `<C-w>` prefix (used for `<C-w>h/j/k/l`, `<C-w>v`, `<C-w>s`, `<C-w>c`, `<C-w>q`, `<C-w>o`) conflicts with Obsidian's default "Close current tab" hotkey bound to Ctrl+W. When Ctrl+W is pressed, Obsidian intercepts it at the app level before the Vim keymap layer sees the second key.

Users must unbind Ctrl+W in **Settings → Hotkeys** (search for "Close current tab") for the `<C-w>` prefix to work. This is documented in the README. The close-tab functionality remains available via `:q`, `:quit`, `<C-w>c`, or `<C-w>q` (the latter two work once the Obsidian hotkey is removed).

This is an Obsidian platform limitation — Electron app-level hotkeys take priority over editor-level keymaps. There is no way to intercept Ctrl+W from within a plugin before Obsidian processes it.

## Cross-document jump history (`Ctrl-o` / `Ctrl-i`)

codemirror-vim's built-in `<C-o>` and `<C-i>` handle the **within-file** jump list (jumping between cursor positions in the current document). Overriding them for cross-document navigation would break within-file jumps.

Cross-document navigation is available via `:back` and `:forward` ex commands, which map to Obsidian's built-in back/forward history. Users who prefer keybindings can add mappings in their vimrc:

```vim
nmap <C-p> :back
nmap <C-n> :forward
```

## `gf` opens file switcher, not file path under cursor

Standard Vim's `gf` opens the file whose path is under the cursor. In Obsidian, bare file paths in notes are uncommon — most navigation uses `[[wikilinks]]` (handled by `gd`). Our `gf` opens Obsidian's quick switcher instead, which lets users search any file by name. This is more practical for a note-taking context.

## Desktop only

The plugin sets `isDesktopOnly: true` in `manifest.json`. Mobile Obsidian has known issues with Vim mode — the soft keyboard does not support `:` and `/` command entry, making ex commands and search unusable. Mobile support is deferred pending investigation.

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

| Command            | Neovim behavior                                         | Obsidian behavior                                          | Reason                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Y`                | Mapped to `y$` by default                               | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                                                                                                                                                                             |
| `Q`                | Replay last recorded macro                              | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                                                                                                                                                                     |
| `:wall` / `:wa`    | Save all modified buffers                               | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                                                                                                                                                                       |
| `gf`               | Open file path under cursor                             | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                                                                                                                                                                         |
| `zO` / `zC` / `zA` | Recursive fold open/close/toggle                        | Maps to the same action as `zo`/`zc`/`za`                  | CM6 has no recursive fold API. Obsidian markdown uses flat heading-level folds (not nested), so the non-recursive versions are functionally equivalent in practice.                                                                                                           |
| `it` / `at`        | HTML tag text objects (CM Vim native via XML mode)      | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown                                                                                                                                                      |
| `dG`               | Deletes from cursor to end of file, no trailing newline | Fixed in fork                                              | The fork's `operators.delete` now expands the anchor to include the preceding newline when deleting linewise to end of file.                                                                                                                                                  |
| `>>`               | Cursor at first non-blank after indent                  | Fixed in fork                                              | The fork's `operators.indent` now returns cursor at column 0, matching Neovim behavior.                                                                                                                                                                                       |
| `V` + `>`          | Cursor at first non-blank after visual indent           | Fixed in fork                                              | Same fix as `>>` — cursor at column 0 after indent.                                                                                                                                                                                                                           |
| `d0`               | No-op at column 0 (zero-width motion)                   | Fixed in fork                                              | Zero-width exclusive range produces no-op as expected.                                                                                                                                                                                                                        |
| `<<`               | Unindent by shiftwidth spaces                           | Unindent uses tabs regardless of shiftwidth setting        | codemirror-vim's indent/unindent uses tabs internally and does not fully respect `shiftwidth`/`expandtab` options                                                                                                                                                             |
| `dd`               | Cursor stays at same column                             | Fixed in fork                                              | Fork preserves cursor column after linewise delete instead of moving to first non-blank.                                                                                                                                                                                      |
| `J`                | Strips trailing whitespace before join                  | Fixed in fork                                              | Fork strips trailing whitespace from current line before adding join space, preventing double spaces.                                                                                                                                                                         |
| `di{` multiline    | Preserves bracket lines (`a{\n}b`)                      | Fixed in fork                                              | Fork deletes inner content lines only, keeping opening/closing bracket on their own lines.                                                                                                                                                                                    |
| `dj`/`dk` boundary | No-op at document start/end                             | Fixed in fork                                              | Fork returns null from `moveByLines` when `j`/`k` can't move to a different line.                                                                                                                                                                                             |
| `:s` cursor        | First non-blank of last affected line                   | Fixed in fork                                              | Fork's `doReplace` positions cursor at first non-blank instead of column 0.                                                                                                                                                                                                   |
| `%` + strings      | Aborts if first bracket is in string                    | Partially fixed in fork                                    | Fork aborts when the first bracket candidate is in a string token. However, `findMatchingBracket` still does positional counting — if the matched bracket is inside a string, `%` matches it instead of skipping it. Full fix requires a custom string-aware bracket matcher. |
| `db` cross-line    | Includes leading whitespace when crossing lines         | Fixed in fork                                              | Fork expands delete range to include whitespace-only prefix before cursor when delete crosses a line boundary.                                                                                                                                                                |
| `da"` whitespace   | Deletes quotes and adjacent whitespace                  | Fixed in fork                                              | Fork's `findBeginningAndEnd` now consumes trailing whitespace (or leading if no trailing) after inclusive quote expansion, matching Neovim's `a"` behavior.                                                                                                                   |
| `:join` cursor     | Cursor at column 0 of joined line                       | Fixed in fork                                              | Fork's ex command handler sets cursor to `(line, 0)` after join.                                                                                                                                                                                                              |
| `:global` cursor   | Cursor at last matched line after `:g/pattern/d`        | Fixed in fork                                              | Fork sets cursor to last matched line (clamped to document end) after line-deleting `:g` commands. Non-destructive `:g` leaves cursor where the last sub-command placed it.                                                                                                   |
| `:s` empty         | Repeats last pattern with default flags (no `/g`)       | Fixed in fork                                              | Fork's `:s` without arguments no longer preserves the `/g` flag from the previous substitution.                                                                                                                                                                               |
| `gj`/`gk` widgets  | Navigates into replaced decorations                     | Fixed in fork                                              | Fork's `findPosV` detects multi-line jumps from `moveVertically` and steps one document line instead, landing inside replaced widget ranges (e.g. rendered MathJax).                                                                                                          |

## Visual mode on single-character text objects

**Status**: Not fixed. `vi*` on `*x*` selects `*` (the delimiter) instead of `x` (the content).

The `adjustRangeForVisualMode` fix removed the single-character skip, but CM Vim's `makeCmSelection` still shifts the head by −1 for inclusive motions. For single-character text objects where the range is exactly 1 character wide, this shift lands on the delimiter character. Multi-character text objects (e.g. `**bold**`) work correctly.

## ~~Visual mode cursor displaced at end-of-line~~ (Fixed)

**Status**: Fixed in fork. Verified against Neovim 0.12.2 golden comparison.

In charwise visual mode (`v`), selecting the last character on a line caused the block cursor to render one character past the end of the visible line content. The fork's `measureCursor()` in `block-cursor.ts` adjusts the cursor position backward by 1 in forward visual selections (`anchor < head`) to display the cursor on the last selected character. The original `letter != "\n"` guard (added in commit `8e8ea52` for empty lines) prevented this adjustment at EOL on non-empty lines. The fix uses the vim state (`vim.visualLine`, `vim.visualBlock`) to only apply the EOL decrement in charwise visual mode — linewise (`V`) and blockwise (`<C-v>`) skip the adjustment, preserving their existing rendering behavior.

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

Properties navigation now works in bundled fork mode. The fork's `findPosV` adapter detects when `moveVertically` lands the cursor inside the frontmatter region and provides a `focusBefore` callback that focuses the "Add property" button in Obsidian's metadata container. This matches the built-in vim behavior — pressing `k` from the first line of the editor navigates into the properties panel.

## ~~Latex Suite interaction in bundled fork mode~~ (Fixed)

The bundled vim extension is now registered at `Prec.highest` so its keydown handler fires before Latex Suite's handlers, preventing duplicate key consumption in large math blocks. Latex Suite's auto-snippets, tabstop navigation, and math-mode features work normally in vim insert mode.

## ~~Visual line navigation and replaced widget decorations~~ (Fixed)

`gj`/`gk` (and `j`/`k` when mapped to `gj`/`gk`) now correctly navigate into block MathJax (`$$`) and other replaced widget decorations in Obsidian's live preview. Previously, CM6's `moveVertically` treated replaced decorations as atomic, causing the cursor to skip over the entire widget's source range in a single step.

The fork's `findPosV` detects when `moveVertically` jumps more than one document line in a single visual-line step and places the cursor on the adjacent document line instead, allowing step-by-step navigation through the widget's source text. Folded ranges are excluded from this correction since folds legitimately collapse multiple document lines.

**Test coverage**: `test/specs/widget-navigation.e2e.ts` (6 tests covering gj/gk/j/k through single and multiple `$$` blocks).

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
