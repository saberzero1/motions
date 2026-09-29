---
title: Neovim backend
description: Use Neovim as the editing engine for Markdown notes while Obsidian continues to own the workspace and vault.
tags:
    - features
    - configuration
---

# Neovim backend

The Neovim backend is an opt-in, desktop-only alternative to the bundled Vim engine. It starts a user-supplied Neovim 0.12+ process, connects over msgpack-RPC, and mirrors the active Markdown editor into a Neovim `acwrite` buffer.

## Enable

Configure the three options under **Settings → Vim Motions → Vim engine**:

- **Use Neovim backend** enables the connection. It is off by default.
- **Neovim binary path** selects the Neovim executable. Leave it empty to use `nvim` from your system `PATH`.
- **Neovim configuration path** optionally selects an Obsidian-specific `init.lua`. A configured file loads under `--clean`; an empty value loads your normal Neovim configuration.

## Security

> [!warning] Neovim is not sandboxed
> Enabling this backend runs the binary and configuration you supply as arbitrary code. That code can load native libraries through LuaJIT FFI and read or write files outside the vault. Vim Motions never downloads or installs Neovim itself; it installs or updates Neovim plugins only when you ask it to and confirm what will be fetched.

## Troubleshooting the connection

### Check the version first

The backend requires **Neovim 0.12 or newer**, which reports API level 14. Earlier releases are refused, because the bridge uses APIs they do not have:

```
nvim --version
nvim --clean --headless -u NONE -c 'lua io.write(vim.version().api_level)' -c 'qa'
```

If that prints `13` or lower, upgrade from the [official Neovim releases](https://github.com/neovim/neovim/releases). Vim Motions never installs Neovim itself.

### Reading the failure notice

The notice tells you which half of the startup failed.

| Notice                                                             | What it means                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `could not start Neovim at "…": the binary was not found (ENOENT)` | The path does not resolve to a file. Point it at the executable itself, not its folder, or clear the setting to use `nvim` from your `PATH`.                                                                                              |
| `could not start Neovim at "…": … (EACCES)`                        | The file was found but the operating system refused to run it. On Windows, see below.                                                                                                                                                     |
| `could not start Neovim at "…": … (EPERM)`                         | Access was denied. Check the file permissions, and any antivirus or endpoint-protection software.                                                                                                                                         |
| `Neovim 0.12 or newer is required at "…"`                          | The binary ran and is too old. See [Check the version first](#check-the-version-first).                                                                                                                                                   |
| `Neovim started at "…" but the connection failed: …`               | The binary and its path are fine — Neovim is running. The quoted text is Neovim's own error, so the cause is in your Neovim configuration or in a plugin it loads.                                                                        |
| `E325: ATTENTION` / `Found a swap file`                            | A version before this fix left a swap file behind for every note it mirrored. The mirror no longer uses swap files and ignores the old ones, so nothing needs doing; delete them from `stdpath('state')/swap` if you want the space back. |

> [!tip] The path is only implicated by the first three
> A notice that begins **Neovim started at** has already proved the path works. Moving the binary or changing its permissions cannot help; read the quoted Neovim error instead.

### Windows

- **Point the setting at `nvim.exe`**, not at the folder that contains it. `C:\Program Files\Neovim\bin\nvim.exe` is correct; `C:\Program Files\Neovim\bin` is not.
- **Spaces in the path are fine.** The path is handed to the operating system directly rather than through a shell, so `C:\Program Files\…` needs no quoting and no escaping. Backslashes and forward slashes both work.
- **`EACCES` on Windows means Windows refused to launch the executable**, not that a permission bit is missing — a missing permission arrives as `EPERM` instead. Try toggling **Run this program as an administrator** under the executable's **Properties → Compatibility**, in whichever direction it is not currently set. The flag has to agree with how Obsidian itself is running: the plugin starts Neovim with `CreateProcess`, which cannot raise elevation on its own and fails outright rather than prompting. In the case reported in [#199](https://github.com/saberzero1/motions/issues/199), switching it **on** was what let Neovim start.
- **WSL is not supported.** Vim Motions launches the binary directly, with no shell, so a `.bat` or `.cmd` wrapper — including one that runs `wsl.exe -e /usr/bin/nvim` — is not a valid target, and a Linux `nvim` reached through `\\wsl$\…` or a mapped drive is not a Windows executable. Install Neovim for Windows and point the setting at that.

## Ownership

While connected, Neovim owns editor input, text, mode, cursor, visual selection, registers, undo and redo, folds, dot-repeat, macros, persistent extmarks, floating windows, structural motions, Markdown text objects, and hard-wrap operations. Native IME preedit stays in a cursor-positioned host input; only committed text is sent through `nvim_input`.

Neovim errors, warnings, notifications, echoes, Lua prints, and shell output appear as Obsidian Notices. Identical messages are limited to one Notice every five seconds. Routine undo, search-count, progress, completion, and command-list messages remain silent.

The external command line renders `:`, `/`, and `?` input with byte-correct caret placement. Prompt text and nested command-line levels are preserved, so `vim.ui.input()` and the generic `vim.ui.select()` flow remain visible and cancellable. With `wildoptions=pum`, command-line completion appears above the command line; insert completion appears at its reported editor-grid position. Selection changes and cancellation update the same popup.

When the status bar is enabled, Neovim's `msg_showmode` output takes precedence over the bundled fork's mode events while RPC is connected. Disconnecting clears that ownership and restores the fork-driven status text.

Obsidian continues to own the vault, Markdown rendering, properties widgets, workspace panes and tabs, pickers, file navigation, Oil, Harpoon storage, cross-note jumps, and the undo-tree sidebar. `:w` routes through Obsidian's active-editor save command, while `:e` and `:e!` re-seed from the current Obsidian document rather than reading behind Obsidian's back.

Both **Settings → Editor → Properties in document** modes are supported. Source frontmatter remains navigable. Rendered frontmatter is protected by a Neovim fold while the properties widget remains owned by Obsidian. That fold is the only one closed when a pane is activated — headings, callouts and blockquotes arrive unfolded, and fold commands behave normally from there.

## Configuration

RPC mode uses your own Neovim configuration for everything Neovim owns. The plugin's `.obsidian.init.lua` and `.obsidian.vimrc` continue to load, but they configure the bundled Vim engine, which stands down while Neovim owns keys.

- **Editor keymaps defined in the plugin's Lua or vimrc config do not fire in RPC mode.** A `vim.keymap.set('n', ...)` there targets the bundled engine. Put the Neovim equivalent in your `init.lua` instead.
- **Features Obsidian renders from synchronised state still apply**: line-number, sign, and fold gutters, cursor-line highlighting, the status bar, and the picker.
- **Features driven by the bundled engine's own key and mode events do not**, because that engine is stood down. See [What changes in RPC mode](#what-changes-in-rpc-mode).
- **The Obsidian action bindings the bridge installs into Neovim come from the plugin's own registration data.** They follow your configured leader key, but not arbitrary `vim.keymap.set` remaps.

## What changes in RPC mode

Most behaviour that lives in the bundled Vim engine is not carried across, because Neovim owns editor keys. This is by design — Neovim users are expected to configure their own equivalents — so the feature list elsewhere in these docs describes bundled-engine behaviour unless a page says otherwise.

**Carried across from your settings**, where Neovim can provide the behaviour natively and the setting is projected onto the mirrored buffer:

| Setting                 | In RPC mode                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smart list continuation | `o`/`O` continues `-`, `*`, and `+` bullets, and `> ` blockquotes. Numbered lists, checkboxes, and list markers inside a blockquote are not continued, because Vim's `comments` cannot increment a counter or express them. Indentation style follows your **Settings → Editor → Indent using tabs** and **Tab indent size**. |
| Yank highlight          | Both `solid` and `fade` render at the configured duration. Blockwise yanks are skipped, matching the bundled engine.                                                                                                                                                                                                          |
| Hard-wrap width         | `textwidth` drives native `gq`/`gw`.                                                                                                                                                                                                                                                                                          |
| Cursor shapes           | The per-mode shape follows Neovim's mode, including operator-pending and the three visual modes.                                                                                                                                                                                                                              |
| Input-method switching  | Automatic per-mode switching fires on Neovim's mode, so CJK input methods follow insert and normal as they do in bundled-engine mode.                                                                                                                                                                                         |

**Neovim's own behaviour applies instead:**

| Feature             | In RPC mode                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Increment/decrement | Native `<C-a>`/`<C-x>`. Hex colours, booleans, dates, and checkboxes are not recognised.                                           |
| Subword motions     | Native `w`/`b`/`e`/`ge`. camelCase, snake_case, and kebab-case boundaries are not recognised.                                      |
| Flash motions       | Native `f`/`F`/`t`/`T` without labels, multi-line targeting, or clever-f. `s` is Vim's substitute, not a flash jump.               |
| Marks               | Neovim owns lowercase marks. Uppercase `A`–`Z` cross-file motions are deferred, and the sign gutter does not track Neovim's marks. |

**Unavailable in RPC mode — but the plugin can set them up for you.** Most of these features were modelled on a Neovim plugin, so **Settings → Vim Motions → Vim engine → Set up Neovim** offers to install or update the originals and write configuration wiring them to your settings:

| Feature                      | Generated for    |
| ---------------------------- | ---------------- |
| Surround (`ys`/`cs`/`ds`)    | `nvim-surround`  |
| Increment/decrement          | `dial.nvim`      |
| Subword motions              | `spider.nvim`    |
| Yank-ring cycling            | `yanky.nvim`     |
| Flash motions, EasyMotion    | `flash.nvim`     |
| Replace-with-register (`gr`) | `mini.operators` |
| Snippets (JSON)              | `LuaSnip`        |

It writes `lua/vim_motions.lua` beside your Neovim configuration and **does nothing until you opt in**, by adding one line to your `init.lua`:

```lua
require('vim_motions')
```

Place that line before your own plugin setup if you want yours to win, or after if you want the generated values to. Equally, treat the file as a starting point and copy the parts you want — there is a **Copy** button for exactly that.

> [!info] Installing is opt-in and shown to you first
> **Set up Neovim** previews exactly what will happen — which plugins Neovim will fetch or update, and the configuration that will be written — and does nothing until you confirm. Installing uses Neovim's own `vim.pack`, into Neovim's data directory; Vim Motions never installs Neovim itself. Every generated block is wrapped in `pcall(require, …)`, so the file is safe to require even if you decline the install or remove a plugin later.

The file is yours once you touch it: if its generated header is gone, regenerating refuses to overwrite and points you at **Copy** instead. When settings it covers change, the setting shows that a regeneration is due; **Regenerate automatically** (off by default) does it for you.

> [!warning] A starting point, not parity
> The generated configuration wires up the plugin each feature was modelled on, and tunes it where a default would fall short — `dial.nvim` is configured with boolean, hex-colour and checkbox augends alongside its built-in number and date handling, so `<C-a>` behaves as it does in bundled-engine mode. It still will not match the bundled behaviour in every detail: these are different implementations and their edge cases differ. Treat the file as a working starting point and tune it from there.

**Snippets work for JSON, not for the Lua DSL.** The plugin's JSON snippets are plain VS Code format, which LuaSnip reads verbatim, so **Set up Neovim** installs LuaSnip, writes the bundled snippets beside the generated config, points it at those and at your own snippet directory, and maps `<Tab>`/`<S-Tab>` to expand and jump.

The Lua DSL does not carry across. Its `vim.snippet.s/t/i/c` namespace and `add(trigger, …)` signature differ from LuaSnip's, and its reactive `f()`/`d()` nodes call into Obsidian's vault and workspace, which Neovim has no equivalent for. The `context` field on a JSON snippet is also a Vim Motions extension that LuaSnip ignores, so context-gated snippets become unconditional.

**The table-nav overlay works.** Obsidian's keymap scope consumes its keys before the delegation listener sees them, so navigating a table does not also move Neovim's cursor. Measured: `l` moved the highlighted cell from column 0 to column 1 while Neovim's row stayed put and the buffer was unchanged. Setting **table widget mode** to `raw` disables the overlay and leaves the table as ordinary Markdown, which is the option to choose if you would rather use a Neovim table plugin.

**Modal overlays work, once triggered from Neovim.** They capture keys on the document ahead of the editor, so their keystrokes never reach Neovim's buffer. Hint mode is bridged: `:hintactivate`, `:hintopennew`, `:hintyank`, `:hintclose`, `:hintcontextmenu`, and the `<leader><leader>h` binding. Flash and EasyMotion triggers are not bridged, because `s` and `<leader><leader>` already mean something to Neovim.

**Host features that read the bundled engine's events:**

| Feature   | In RPC mode                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which-key | Not shown in the Markdown editor; it renders the bundled engine's keymap, which is not the one in force. Install [which-key.nvim](https://github.com/folke/which-key.nvim) instead — it draws in a floating window, which the bridge already renders, and it shows Neovim's real keymap including the bindings generated below. |

## Obsidian commands

The bridge installs the plugin's own features into Neovim as real keymaps and user commands, which an allowlist enumerates. `:ob` is the exception that escapes it: it runs **any** Obsidian command by ID, including commands registered by other plugins, which an allowlist cannot enumerate by construction.

```vim
:ob theme:use-dark
:ob workspace:toggle-pin
```

Every generated binding carries a readable `desc`, prefixed `Vim Motions:`, so `:map`, `:command` and which-key.nvim describe them in words rather than as internal ids. That covers the companion's structural motions and Markdown text objects as well as the bridged actions — `]h` reads as "Next heading", `iC` as "Inner code fence".

The leader prefixes are registered as `<Nop>` mappings carrying only a group label (`+find`, `+harpoon`), so which-key.nvim renders a menu rather than a flat list. Nothing executes them: Neovim resolves the longer binding, and the leader key itself is never mapped.

Because the bridged entries are ordinary Neovim objects, your own `init.lua` can build on them:

```lua
vim.keymap.set('n', '<leader>td', function() vim.cmd('Ob theme:use-dark') end)
```

Run `:ob` with no arguments for the command picker. The plugin's `exmap` and `gmap` are bundled-engine constructs and do not apply here — use `vim.keymap.set` as above instead.

## Plugin compatibility

Neovim plugins run inside your own Neovim, so the question is never whether a plugin loads — it is whether what the plugin draws can reach Obsidian. The bridge carries buffer-coordinate data only and never reconstructs Neovim's screen grid, which is attached purely as a redraw clock. That boundary decides compatibility by mechanism rather than by plugin name.

Bridged:

- Buffer text, cursor, modes, registers, marks, undo and redo, dot-repeat, and macros.
- Persistent extmarks in every namespace — highlights, `overlay`/`eol`/`inline` virtual text, `virt_lines` block text, `sign_text` in the sign gutter, and `line_hl_group` whole-line highlighting, carrying Neovim's own priorities and highlight groups. This is what diagnostic signs, diagnostic `virtual_lines`, code lens and gitsigns are expressed in.
- The visual selection, in charwise, linewise and blockwise modes. It is rendered as a decoration rather than as Obsidian's own selection, because a real selection makes Obsidian consume the Escape keydown before the backend sees it.
- Language servers: a client attaches on every note activation, and the mirrored document is closed and reopened as the note changes so its URI follows.
- `nvim_buf_add_highlight()`, which creates an ordinary extmark and renders like any other.
- Floating windows, including their buffer content, extmarks, border presence, and z-index. Placement is approximate.
- Folds, treesitter, and LuaJIT FFI, all native to the Neovim you supply.

Not bridged, by construction:

| Mechanism                                   | Why it cannot cross                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screenpos()` and other screen-cell queries | The bridge transports buffer coordinates. Grid events are discarded, and proportional Markdown typography has no stable cell grid to answer with. |
| `matchadd()`                                | Matches are window-local and are not extmarks, so no buffer extmark query returns them.                                                           |
| Ephemeral extmarks                          | They exist only during Neovim's own redraw pass and are gone before any query can read them.                                                      |
| Legacy non-extmark highlights               | Same: nothing persists for the bridge to read.                                                                                                    |

> [!info] This is a class boundary, not a per-plugin certification
> A plugin whose output is extmarks and floating windows will render; one that positions by screen cell will not. flash.nvim is the measured case — its labels, jump, and floating prompt all bridge, and its own extmarks are the oracle the decoration and float test suites assert against.

## Supported keybindings

These bindings are provided in RPC mode, by Neovim companion mappings or by the feature bridge, and match their bundled-engine spelling. They are not the plugin's whole keymap — see [What changes in RPC mode](#what-changes-in-rpc-mode) for what the bundled engine keeps.

![[keybindings#Markdown text objects]]

![[keybindings#Structural navigation]]

![[keybindings#Hard-wrap operators]]

![[keybindings#Fold commands]]

## Known limitations

- Which-key is not shown in the Markdown editor; use which-key.nvim instead.
- Editor keymaps from the plugin's own Lua and vimrc config do not fire; Neovim owns editor keys. See [Configuration](#configuration).
- Bundled-engine features are replaced by Neovim's own or need a Neovim equivalent. See [What changes in RPC mode](#what-changes-in-rpc-mode).
- Only the active Markdown editor is mirrored; multi-leaf and multi-buffer ownership is deferred.
- Floating-window terminal cells are mapped onto proportional Markdown typography, so placement is approximate.
- Ephemeral extmarks and legacy non-extmark highlights are not mirrored.
- Fold persistence and the `i=` / `a=` highlight text object are unavailable in RPC mode.
- Quickfix entries are browsable through **Picker: Quickfix list** (`:quickfix` / `:qf`); Neovim's own `:copen` window is not mirrored.
- `number_hl_group` and `conceal` extmark fields are not mirrored; the first needs a line-number renderer the gutter does not expose, and the second would fight Obsidian's own Live Preview concealment.
- Uppercase cross-file mark motions are deferred. Lowercase within-buffer marks remain native to Neovim.
- Oil's embedded editor intentionally continues to use the bundled Vim engine.

See [[known-limitations#Neovim RPC backend]] for the detailed compatibility boundary and current latency measurements.
