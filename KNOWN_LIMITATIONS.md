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

Changing `.obsidian.vimrc` requires reloading the plugin. The vimrc is loaded once during `onload()`. Other settings (text objects, navigation, operators, etc.) hot-reload immediately via `reloadFeatures()`, but vimrc parsing involves one-shot setup (exmap definitions, leader key state) that is not designed for re-entry.

## Scrolloff cleanup on disable

Scrolloff is implemented via CSS `scroll-padding`. When the scrolloff setting is changed, the CSS is updated on the next plugin reload. Toggling scrolloff off via settings hot-reload does not remove the existing `scroll-padding` — a plugin reload is needed for full cleanup.

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
