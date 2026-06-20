# Known limitations

This document tracks known limitations, architectural constraints, and intentionally deferred features.

## EasyMotion operator-pending mode

**Status**: Deferred indefinitely.

`d<leader><leader>w{label}` (delete to an EasyMotion target) does not work. EasyMotion is registered as an **action** (`defineAction`), not a **motion** (`defineMotion`). When `d` is pressed first, Vim enters operator-pending mode and expects a synchronous motion return. Actions are not dispatched in this context — the action callback never fires.

Spike test `test/specs/spikes/spike6-operator-pending.e2e.ts` confirmed this: pressing `d` then triggering the action results in `hasCapturedState: false`. The operator-pending state prevents action execution entirely.

A `defineMotion` approach is not viable either, because motions must return synchronously and EasyMotion requires async user input (waiting for a label keypress).

The only potential path would be intercepting `d`/`c`/`y` keystrokes via `vim-keypress` before EasyMotion fires, storing the pending operator externally, cancelling Vim's operator-pending state, then replaying after the jump. This is fragile and requires deep integration with Vim's internal state machine.

## Smart asterisk disambiguation

`i*` tries `**bold**` first, then falls back to `*italic*`. In the case of `***bold italic***`, the `**` pair is always matched first, making it impossible to select only the italic portion with `i*`. Use `i_` for underscore italic as a workaround.

## Multi-line delimiter scan limit

Multi-line text objects (`createMultiLineDelimiterTextObject`) scan at most 20 lines in each direction from the cursor (`MULTILINE_SCAN_LIMIT = 20` in `src/text-objects/delimiter.ts`). Bold, italic, or other delimited content spanning more than 40 lines total will not be found if the cursor is far from the opening delimiter.

This limit exists for performance — scanning the entire document on every keystroke would cause latency.

## Multi-line delimiter nesting

The multi-line text object scanner uses a simple forward/backward search for the nearest delimiter. It has no nesting awareness. Overlapping or nested delimiters across lines (e.g., bold inside italic spanning multiple lines) may produce incorrect selections.

Delimiters inside fenced code blocks are not excluded from the scan. If a code block contains the same delimiter characters, the text object may match across a code block boundary.

## Table navigation scope

`]|` and `[|` navigate between table cells. The following are intentionally not implemented:

- **`j`/`k` column tracking**: Vim's `defineMotion` has no fall-through mechanism. Overriding `j`/`k` to detect tables on every keypress is fragile and would break normal line navigation if the detection is wrong. Users can add `nmap <Tab> ]|` to their vimrc if they want Tab-based cell navigation.
- **`Tab`/`Shift-Tab`**: These conflict with Obsidian's built-in table Tab handling and insert-mode tab completion.

## Vimrc hot-reload

Changing `.obsidian.vimrc` requires reloading the plugin. The vimrc is loaded once during the first `active-leaf-change` event after plugin load. Other settings (text objects, navigation, operators, etc.) hot-reload immediately via `reloadFeatures()`, but vimrc parsing involves one-shot setup (exmap definitions, leader key state) that is not designed for re-entry.

## Scrolloff line height assumption

Scrolloff is implemented via CodeMirror 6's `EditorView.scrollMargins` facet. The margin is calculated as `lines * 22px`, assuming a 22px line height. If the user's font size or line height differs significantly from the default, the scrolloff distance may not correspond exactly to the configured number of lines.

## `set` option scope

The following `set` options are registered and can be used in `.obsidian.vimrc`:

| Option             | Aliases | Description                                                             |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| `clipboard`        | `clip`  | `unnamed` or `unnamedplus` for yank-to-clipboard                        |
| `tabstop`          | `ts`    | Tab size (stored as Vim option; Obsidian controls actual tab rendering) |
| `textwidth`        | `tw`    | Wrap width for `gq`/`gw` (default: 80, registered by codemirror-vim)    |
| `shiftwidth`       | `sw`    | Indent unit size (stored as Vim option)                                 |
| `expandtab`        | `et`    | Tabs vs spaces (stored as Vim option)                                   |
| `insertmodeescape` | `ime`   | Two-key sequence to exit insert mode (e.g., `jk`)                       |

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

Diagnostic findings (spike17):

- `Vim.setOption('textwidth', 20)` at runtime correctly updates the wrap width — `gqq` wraps at 20 columns.
- `handleEx(cm, 'set textwidth=20')` at runtime also works — `gqq` wraps at 20 columns.
- `Vim.getOption('textwidth')` returns 20 after vimrc loading — CM Vim's option value IS updated.
- Despite the option value being 20, `gqq` wraps at 80 — the plugin's internal `textwidthValue` is not updated by the vimrc pipeline.

Root cause: codemirror-vim's `defineOption` for `textwidth` runs its own callback (which has per-instance scoping via a `cm === undefined` guard) rather than our plugin's callback during vimrc loading. Our callback registered via `registerVimOptions` during `onload()` is overwritten when the CM Vim extension initializes for the first editor.

Workaround: set textwidth at runtime via Obsidian's developer console: `CodeMirrorAdapter.Vim.setOption('textwidth', 20)`.

## `noremap` cannot swap built-in single-key motions

`nnoremap j k` / `nnoremap k j` does not swap the `j` and `k` motions. This is a codemirror-vim architectural constraint: when a `noremap` mapping's rhs is dispatched, the key handler skips all user-defined keymap entries and only searches the default keymap. Since user-defined entries are inserted at the front of the keymap array via `unshift`, the `noremap` dispatch (which starts at `keyMap.length - defaultKeymapLength`) correctly finds the original motion. However, the lhs side of the swap still resolves to the original motion as well, because codemirror-vim's `noremap` flag is tracked globally during dispatch — meaning both sides of a swap end up resolving to the default keymap.

This limitation is confirmed upstream in [obsidian-vimrc-support issue #16](https://github.com/esm7/obsidian-vimrc-support/issues/16), where the maintainer noted: "CodeMirror doesn't support `noremap` [...] recursive mappings are not possible in CodeMirror anyway so `map` or `nmap` should work."

`noremap` does work for preventing recursion in multi-key mappings (e.g. `noremap G G$`) and for remapping keys to different key sequences. It only fails when trying to swap two built-in single-key motions with each other.

## EasyMotion leader key conflict with `mapCommand`

EasyMotion bindings are registered via `mapCommand(leader + leader + 'w', ...)`. This works correctly with the default leader key (`\`) because `\` has no existing binding in codemirror-vim's default keymap.

However, leader keys that **do** have default Vim bindings — such as `,` (reverse repeat find), `;` (repeat find), or space (forward char) — will not work. When the first leader keypress is sent, codemirror-vim finds a `full` match for the single character in the default keymap and consumes it immediately, preventing the multi-key sequence (`,,w`) from accumulating in the key buffer.

This is a fundamental limitation of `mapCommand`: it registers key sequences at the keymap level where single-character `full` matches always take priority over multi-character `partial` matches. The only workaround is to use a leader key that has no default Vim binding (like `\`).

A future fix would switch EasyMotion from `mapCommand` to `vim.map()` with ex command wrappers, which handles leader resolution through a different code path. This is tracked as a known limitation rather than a bug because the default configuration works correctly.

## Table navigation on non-US keyboards

`]|` and `[|` use the pipe character (`|`), which on many non-US keyboard layouts (German, Dutch, Nordic, etc.) requires AltGr or a modifier combination. codemirror-vim's `vimKeyFromEvent` translates AltGr keypresses as `<C-A-|>` or `<A-|>`, which does not match the registered `]|` keybinding.

The alternative keybindings `]c` and `[c` are provided for this reason and work on all keyboard layouts.

## Which-key overlay scope

The which-key overlay shows leader bindings from `.obsidian.vimrc` (via `nmap <leader>x :command` or similar), settings-configured leader bindings, and built-in leader-prefixed commands (EasyMotion, hint mode). It does not show non-leader plugin keybindings (`gd`, `gx`, `]h`, etc.) since those are always available regardless of leader configuration.

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

| Command            | Neovim behavior                                    | Obsidian behavior                                          | Reason                                                                                                                   |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Y`                | Mapped to `y$` by default                          | Mapped to `y$` by plugin (overrides CM Vim's `yy` default) | Follows Neovim convention per design principle #2                                                                        |
| `Q`                | Replay last recorded macro                         | Mapped to `@@` by plugin (overrides CM Vim's unmapped `Q`) | Follows Neovim convention                                                                                                |
| `:wall` / `:wa`    | Save all modified buffers                          | Saves only the current file                                | Obsidian auto-saves; a true "save all" would need to iterate all leaves                                                  |
| `gf`               | Open file path under cursor                        | Opens Obsidian quick switcher                              | Wikilinks (`gd`) are more natural for note navigation                                                                    |
| `zO` / `zC` / `zA` | Recursive fold open/close/toggle                   | Maps to the same action as `zo`/`zc`/`za`                  | Obsidian's fold API doesn't distinguish recursive from non-recursive                                                     |
| `it` / `at`        | HTML tag text objects (CM Vim native via XML mode) | Plugin-implemented via raw text scanning                   | CM Vim's `expandToTag` requires `findMatchingTag`/`findEnclosingTag` functions from a parser mode not active in Markdown |

## Test-discovered behavioral discrepancies

These were found by translating edge-case tests from Neovim's legacy test suite and replit/codemirror-vim. Each has a corresponding `it.skip()` test with a `// BUG:` comment.

### `dG` leaves trailing newline

**Status**: Skipped test, pending fix.
**Test**: `test/specs/vim-builtin/operator-combos.e2e.ts` — "dG should delete from current line to end of file"

`dG` from line 2 of a 4-line document produces `'one\n'` instead of `'one'`. codemirror-vim's linewise delete preserves a trailing newline when deleting to end of file. Neovim does not leave a trailing newline.

### `iB` does not scope to innermost blockquote nesting level

**Status**: Skipped test, pending fix.
**Test**: `test/specs/blockquote-callout.e2e.ts` — "diB with nested blockquote should delete inner content"

`diB` on `>> nested inner` inside `> outer\n>> nested inner\n> more outer` deletes all blockquote content instead of scoping to the `>>` level. The blockquote text object scanner does not distinguish nesting depth.

### `di*` operates when cursor is on the delimiter

**Status**: Skipped test, pending fix.
**Test**: `test/specs/text-objects.e2e.ts` — "di\* with cursor on delimiter should no-op"

`di*` with cursor on the `**` delimiter itself deletes the bold content. Neovim's text objects typically no-op when the cursor is on the delimiter rather than inside it. The plugin's delimiter scanner treats the delimiter position as "inside".

### Dot-repeat of `cw` + typed text unreliable

**Status**: Skipped test, pending fix.
**Test**: `test/specs/vim-builtin/normal-editing.e2e.ts` — ". should repeat cw with typed text"

`.` after `cw` followed by typing "new " does not reliably replay the inserted text. This may be a codemirror-vim timing issue with how insert-mode keystrokes are recorded for repeat, or a WDIO test timing issue where `browser.keys()` input is not captured by CM Vim's insert recording.

### `)` sentence motion cursor position at end of text

**Status**: Skipped test, pending fix.
**Test**: `test/specs/vim-builtin/normal-marks-jumps.e2e.ts` — ") at end of text should not move"

`)` at the end of `'Only sentence.'` (ch=14) moves the cursor to ch=13 (on the period) instead of staying at ch=14. codemirror-vim's sentence motion clamps to the last character of the line rather than past it.

### `n`/`N` search wrap-around unreliable in tests

**Status**: Skipped test, pending fix.
**Test**: `test/specs/vim-builtin/normal-search.e2e.ts` — "n should wrap to start when reaching end"

After `/foo` search and pressing `n` twice, the cursor lands at an unexpected position. This may be a codemirror-vim incsearch state issue where the initial `/` search already advances past the first match, or a test timing issue with the async search dialog.

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
| Settings UI keyboard navigation | Out of scope for a Vim motion plugin                                                             |
