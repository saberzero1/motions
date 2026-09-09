# Neovim API implementation status

This document tracks the implementation status of every Neovim API function in the plugin's Lua subsystem, based on **Neovim 0.12.5** (the version used for golden test recording). Use it to identify gaps, prioritize work, and measure progress toward plugin compatibility.

The tables cover Neovim 0.12 and explicitly noted legacy compatibility names in the shim registry. Functions not yet implemented are generally registered as stubs so a plugin that calls them does not crash outright — but see the note below on why a stub is not automatically the safer choice.

**Legend:**

| Symbol | Meaning                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- |
| ✅     | Fully implemented                                                                                    |
| ⚠️     | Implemented with limitations (see notes)                                                             |
| 🔲     | **Registered stub** — callable, warns once, returns a type-shaped placeholder. Does not error.       |
| ❌     | **Not registered** — calling it raises a Lua error                                                   |
| 🚫     | Not applicable (no Obsidian equivalent)                                                              |
| 🔇     | **Silent placeholder** — callable identity/constant/no-op with no warning; not a real implementation |

> [!important]
> `🔲` and `❌` are very different failure modes. A `🔲` stub returns a plausible-looking value (`0`, `''`, `{}`, `false`, `nil`), so a plugin calling it **silently misbehaves** rather than failing loudly. For example, `vim.fn.search()` returns `0`, which is indistinguishable from "pattern not found" — a plugin relying on it silently finds nothing. When triaging a plugin that "does nothing", check the console for `is not implemented` warnings before assuming the API is missing.

`🔇` is worse for diagnosis than a warn-once stub: it leaves **no console trace**. The twelve placeholders audited at the pre-work `src/lua/stdlib.ts:1055-1111` are inventoried below under String utilities. Five (`str_byteindex`, `str_utfindex`, `str_utf_start`, `str_utf_end`, `str_utf_pos`) now have real handlers; seven (`iconv`, `uri_decode`, `uri_encode`, `uri_from_bufnr`, `uri_from_fname`, `uri_to_bufnr`, `uri_to_fname`) remain silent. Callable presence is not compatibility evidence.

## How dispatch works

Both `vim.api` and `vim.fn` resolve names through a metatable with three tiers. Knowing which tier a function falls into tells you what happens when a plugin calls it.

**`vim.api`** (`src/lua/api.ts`, `injectVimApi`'s `__index` dispatcher):

| Tier | Membership                              | Count | Behavior                                                                           |
| ---- | --------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| 1    | `SUPPORTED_NVIM_API_FUNCTIONS`          | 69    | Real implementation                                                                |
| 2    | `KNOWN_NVIM_API_FUNCTIONS` minus tier 1 | 88    | Warn once, return placeholder per `NVIM_API_RETURN_TYPES`; includes `nvim__redraw` |
| 3    | Anything else (e.g. `nvim_ui_*`)        | —     | `luaL_error` listing the supported set                                             |

`KNOWN_NVIM_API_FUNCTIONS` holds 157 names total.

**`vim.fn`** (`src/lua/fn.ts`, `injectVimFn`'s `__index` dispatcher):

| Tier | Membership          | Count | Behavior                                                |
| ---- | ------------------- | ----- | ------------------------------------------------------- |
| 1    | `registry.set(...)` | 92    | Real implementation                                     |
| 2    | `registerStub(...)` | 39    | Warn once, return `''` / `0` / `{}` / nothing, or throw |
| 3    | Anything else       | —     | `errorUnsupported` — raises a Lua error                 |

131 `vim.fn` names are registered in total. `getchar`, `getcharstr`, and `input` require the async coroutine runner and corresponding callbacks. Without the runner: 89 real / 39 stubs / 128 total.

**Counts measure surface, not correctness.** The source-derived count guard cannot detect semantic repair: a function is counted real because it has a registered handler, even when that handler returns incorrect results. Closing the text, legacy-position and extmark coordinate seams repaired already-real handlers, so the counts remain **69/88/157** for API and **92/39/131** for fn (**89/39/128** without async callbacks). Counts measure the registered surface; the demand audit measures correctness of the probed calls. Neither substitutes for the other, and neither proves complete plugin compatibility.

The audited historical baseline was 63/94/157 and 84/46/130 (API and fn real/stub/total, full callbacks), before the coordinate work. The earlier tier-2 prose said 97, not 94; the authoritative 157 total was already correct. Six API promotions: `nvim_buf_get_offset`, `nvim_win_is_valid`, `nvim_win_get_width`, `nvim_win_get_height`, `nvim_win_get_position`, `nvim_win_get_number`. Seven fn promotions: `line2byte`, `byte2line`, `win_getid`, `winnr`, `charcol`, `virtcol`, `deletebufline`; `virtcol2col` adds one previously absent name. Phase 5b's five string helpers are outside these two registries. The historical duplicate `getwininfo` stub declaration yielded 47 declared but only 46 effective stubs; it is not present in today's source.

**Adding a function** is cheap in both cases: replace the stub registration with a real handler. For `vim.api`, also add the name to `SUPPORTED_NVIM_API_FUNCTIONS`. The lookup machinery never needs to change.

**Plugin demand** is based on verified call sites in the source of the plugins analyzed (mini.comment, mini.surround, mini.pairs, mini.ai, nvim-autopairs, Comment.nvim, flash.nvim, leap.nvim, nvim-surround) — not on estimates.

> [!note]
> Only **mini.comment** has existing end-to-end embedded-runtime coverage (`test/specs/lua-plugin-mini-comment.e2e.ts`), now using the immutable pin below. **nvim-surround** is an _external golden reference_ via headless Neovim (`test/specs/vim-builtin/surround-golden.e2e.ts`), not a plugin running under the shim. Other named plugins have no passing end-to-end compatibility claim; mini.surround/mini.splitjoin have measured blocked audits.

The Phase 4 re-run of the Phase 5/5b demand audit (`test/unit/lua/plugin-api-demand.test.ts`, `test/fixtures/mini-api-demand.json`) leaves **both suites BLOCKED**; integration Phases 6/7 are cancelled and deferred, not passed:

- **mini.surround:** no load blockers; core blockers `surround-highlight`, `echospace`, `getchar-context`, `input-context-and-form`.
- **mini.splitjoin:** one load blocker, `string-expr-mapping`, and core blocker `local-comments`. String expression mappings require Vimscript evaluation, which this host does not have. This is an **architectural constraint**, not a missing function or a to-do item; it may never be unblockable in this host. See the pinned audit artifact for the exact load error.
- **flash.nvim:** terminally blocked by LuaJIT FFI (`module 'ffi' is not available`), proven by `test/specs/lua-plugin-flash-diagnostic.e2e.ts`. No shim API work unblocks it.
- **Reproducibility:** Phase 0 pinned mini.comment in `test/fixtures/test-plugins.json` to `27a29d6b949b9497f80a0a03421e89fed71d8c37`, replacing the moving `main` branch. Coverage still establishes only the tested operations.

Cumulative Phases 1–3 delta: core `set-text-bytes` (both plugins), `getpos-bytes` and `extmark-columns` (mini.splitjoin), plus optional `get-text-bytes` (mini.splitjoin). No other blocker moved. Before → now:

| Plugin         | Load blockers                       | Core blockers                                                                                                                                                           |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mini.surround  | `[]` → `[]`                         | `[surround-highlight, echospace, getchar-context, input-context-and-form, set-text-bytes]` → `[surround-highlight, echospace, getchar-context, input-context-and-form]` |
| mini.splitjoin | `[string-expr-mapping]` → unchanged | `[local-comments, set-text-bytes, getpos-bytes, extmark-columns]` → `[local-comments]`                                                                                  |

mini.splitjoin's optional `[get-text-bytes]` → `[]` is the same Phase 1 text fix reaching the optional tier. mini.surround's optional blockers are unchanged. Outstanding non-coordinate work remains `vim.hl.range`, `v:echospace`, getchar context, input context/form and `vim.opt_local.comments`; neither behavior suite is unblocked.

The coordinate contract covers only the 23 enumerated APIs in `test/fixtures/neovim-coordinate-api-manifest.ts`, including the five string helpers. The text get/set, legacy-position (`getpos`/`getcurpos`/`setpos`) and extmark-column seams are closed through the adapter, subject to the deviations below. This is **not** a claim that the whole shim is byte-correct. Remaining seams: `nvim_buf_set_mark`, `cursor`, view save/restore, `wincol`, `searchpos`, and JS-backed `strlen`/`strpart`/`stridx`/`strridx`. `vim.fn.strwidth` still returns UTF-16 `s.length`, a separate quarantined display-width defect. The seven silent `iconv`/`uri_*` placeholders named above also remain unchanged.

**D4 deviation:** interior-byte `nvim_win_set_cursor` writes normalize to the containing character's first byte. Neovim preserves interior bytes; a UTF-16 host cannot represent them. This is not parity. Past-EOL clamping is native and unchanged.

**D5 deviation:** `nvim_buf_get_text` slices the UTF-8 encoding exactly, including split characters: fengari holds Lua strings as `Uint8Array`. `nvim_buf_set_text` instead normalizes interior start columns down and exclusive end columns up to character boundaries, because the host document is a JS UTF-16 string in which invalid UTF-8 has no representation. Reads clamp past EOL; writes reject past-EOL columns.

**D6 deviation:** `getcurpos` retains its fifth, sticky `curswant` element by reading the fork's `vim.lastHPos`, not its pixel-valued `lastHSPos`. An unset goal (`-1`) uses the cursor's positional display cell (first cell of a wide character, last cell of a tab); a stored goal is made 1-based, and `Infinity` after `$` maps to `2147483647`. This reports the host's partial goal state, not full Neovim goal-state parity.

**Extmark deviation:** CM6 offsets cannot retain interior UTF-8 byte remainders. Start columns normalize down and exclusive `end_col` up, like D5; getters report the normalized byte columns, not Neovim's preserved interior bytes. Valid columns are `0..bytelen` inclusive; out-of-range columns error, not clamp.

---

## vim.api (nvim\_\* functions)

### Global functions

| Function                                                    | Status | Notes                                                             | Plugin demand                       |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------- | ----------------------------------- |
| `nvim_chan_send(chan, data)`                                | 🔲     |                                                                   | 🚫 RPC only                         |
| `nvim_create_buf(listed, scratch)`                          | 🔲     | No multi-buffer model                                             | Low                                 |
| `nvim_del_current_line()`                                   | ✅     |                                                                   | Low                                 |
| `nvim_del_keymap(mode, lhs)`                                | ✅     | Subset of modes                                                   | Low                                 |
| `nvim_del_mark(name)`                                       | 🔲     | Uppercase/file marks                                              | Low                                 |
| `nvim_del_var(name)`                                        | 🔲     |                                                                   | Low                                 |
| `nvim_echo(chunks, history, opts)`                          | ⚠️     | Highlight groups ignored (plain text only)                        | Medium (flash, leap, mini.surround) |
| `nvim_eval(expr)`                                           | 🔲     | Requires Vimscript eval                                           | Low                                 |
| `nvim_eval_statusline(str, opts)`                           | 🔲     |                                                                   | Low                                 |
| `nvim_exec_lua(code, args)`                                 | 🔲     | RPC only                                                          | 🚫                                  |
| `nvim_feedkeys(keys, mode, escape_ks)`                      | ⚠️     | Only `'n'` and `'m'` mode flags                                   | Medium (flash, leap)                |
| `nvim_get_all_options_info()`                               | 🔲     |                                                                   | Low                                 |
| `nvim_get_api_info()`                                       | 🔲     |                                                                   | Low                                 |
| `nvim_get_autocmds(opts)`                                   | 🔲     |                                                                   | Low                                 |
| `nvim_get_chan_info(chan)`                                  | 🔲     |                                                                   | 🚫                                  |
| `nvim_get_color_by_name(name)`                              | 🔲     |                                                                   | Low                                 |
| `nvim_get_color_map()`                                      | 🔲     |                                                                   | Low                                 |
| `nvim_get_commands(opts)`                                   | 🔲     |                                                                   | Low                                 |
| `nvim_get_context(opts)`                                    | 🔲     |                                                                   | Low                                 |
| `nvim_get_current_buf()`                                    | ✅     | Returns 0                                                         | Medium                              |
| `nvim_get_current_line()`                                   | ✅     |                                                                   | Low                                 |
| `nvim_get_current_tabpage()`                                | ✅     | Returns 0                                                         | Low                                 |
| `nvim_get_current_win()`                                    | ✅     | Returns 0                                                         | Medium (flash, leap)                |
| `nvim_get_hl(ns, opts)`                                     | ⚠️     | ns must be 0                                                      | Low                                 |
| `nvim_get_hl_id_by_name(name)`                              | 🔲     |                                                                   | Low                                 |
| `nvim_get_hl_ns(opts)`                                      | 🔲     |                                                                   | Low                                 |
| `nvim_get_keymap(mode)`                                     | ✅     |                                                                   | Low                                 |
| `nvim_get_mark(name)`                                       | 🔲     | Global marks                                                      | Low                                 |
| `nvim_get_mode()`                                           | ✅     | Returns `{mode, blocking}` table                                  | Low                                 |
| `nvim_get_namespaces()`                                     | 🔲     |                                                                   | Low                                 |
| `nvim_get_option_value(name, opts)`                         | ⚠️     | opts scope ignored                                                | Low                                 |
| `nvim_get_proc(pid)`                                        | 🔲     |                                                                   | 🚫                                  |
| `nvim_get_proc_children(pid)`                               | 🔲     |                                                                   | 🚫                                  |
| `nvim_get_runtime_file(name, all)`                          | 🔲     |                                                                   | Low                                 |
| `nvim_get_var(name)`                                        | 🔲     |                                                                   | Low                                 |
| `nvim_get_vvar(name)`                                       | ✅     |                                                                   | Medium (mini.comment, Comment.nvim) |
| `nvim_input(keys)`                                          | 🔲     |                                                                   | Low                                 |
| `nvim_input_mouse(button, action, mod, grid, row, col)`     | 🔲     |                                                                   | 🚫                                  |
| `nvim_list_bufs()`                                          | ✅     | Returns `{0}`                                                     | Medium (flash)                      |
| `nvim_list_chans()`                                         | 🔲     |                                                                   | 🚫                                  |
| `nvim_list_runtime_paths()`                                 | 🔲     |                                                                   | Low                                 |
| `nvim_list_tabpages()`                                      | 🔲     |                                                                   | Low                                 |
| `nvim_list_uis()`                                           | 🔲     |                                                                   | 🚫                                  |
| `nvim_list_wins()`                                          | ✅     | Returns `{0}`                                                     | Medium (flash multi-window)         |
| `nvim_load_context(dict)`                                   | 🔲     |                                                                   | Low                                 |
| `nvim_open_tabpage(opts)`                                   | 🔲     |                                                                   | Low                                 |
| `nvim_open_term(buf, opts)`                                 | 🔲     |                                                                   | 🚫                                  |
| `nvim_open_win(buf, enter, config)`                         | 🔲     | Floating windows                                                  | Low                                 |
| `nvim_parse_cmd(str, opts)`                                 | 🔲     |                                                                   | Low                                 |
| `nvim_parse_expression(expr, flags, hl)`                    | 🔲     |                                                                   | Low                                 |
| `nvim_paste(data, crlf, phase)`                             | 🔲     |                                                                   | Low                                 |
| `nvim_put(lines, type, after, follow)`                      | 🔲     |                                                                   | Low                                 |
| `nvim_replace_termcodes(str, from_part, do_lt, special)`    | ✅     | Real Neovim byte encoding; see note on `nvim_feedkeys`            | Medium (mini.pairs, nvim-surround)  |
| `nvim_select_popupmenu_item(item, insert, finish, opts)`    | 🔲     |                                                                   | 🚫                                  |
| `nvim_set_client_info(name, version, type, methods, attrs)` | 🔲     |                                                                   | 🚫                                  |
| `nvim_set_current_buf(buf)`                                 | 🔲     |                                                                   | Low                                 |
| `nvim_set_current_dir(dir)`                                 | 🔲     |                                                                   | Low                                 |
| `nvim_set_current_line(line)`                               | ✅     |                                                                   | Low                                 |
| `nvim_set_current_tabpage(tabpage)`                         | 🔲     |                                                                   | Low                                 |
| `nvim_set_current_win(win)`                                 | 🔲     |                                                                   | Low                                 |
| `nvim_set_decoration_provider(ns, opts)`                    | ⚠️     | `on_start`/`on_buf`/`on_win`/`on_end`; `on_line`/`on_range` error | Medium (flash)                      |
| `nvim_set_hl(ns, name, val)`                                | ⚠️     | ns must be 0                                                      | Medium (flash, mini.surround)       |
| `nvim_set_hl_ns(ns)`                                        | 🔲     |                                                                   | Low                                 |
| `nvim_set_hl_ns_fast(ns)`                                   | 🔲     |                                                                   | Low                                 |
| `nvim_set_keymap(mode, lhs, rhs, opts)`                     | ✅     | Subset of modes                                                   | Medium                              |
| `nvim_set_option_value(name, value, opts)`                  | ⚠️     | opts scope ignored                                                | Low                                 |
| `nvim_set_var(name)`                                        | 🔲     |                                                                   | Low                                 |
| `nvim_set_vvar(name, value)`                                | ⚠️     | Only `searchforward` and `char` writable                          | Low                                 |
| `nvim_strwidth(text)`                                       | ✅     | With CJK wide char support                                        | Low                                 |

### Deprecated global functions (still must be stubbed)

| Function                                  | Status | Notes                   | Plugin demand |
| ----------------------------------------- | ------ | ----------------------- | ------------- |
| `nvim_call_dict_function(dict, fn, args)` | 🔲     | Deprecated              | Low           |
| `nvim_call_function(fn, args)`            | 🔲     | Deprecated              | Low           |
| `nvim_cmd(cmd, opts)`                     | 🔲     |                         | Low           |
| `nvim_command(cmd)`                       | ✅     |                         | Low           |
| `nvim_err_write(str)`                     | 🔲     | Deprecated              | Low           |
| `nvim_err_writeln(str)`                   | 🔲     | Deprecated              | Low           |
| `nvim_exec_autocmds(event, opts)`         | 🔲     |                         | Low           |
| `nvim_get_option(name)`                   | ⚠️     | Deprecated compat alias | Low           |
| `nvim_out_write(str)`                     | 🔲     | Deprecated              | Low           |
| `nvim_set_option(name, value)`            | ⚠️     | Deprecated compat alias | Low           |

### Buffer operations

| Function                                             | Status | Notes                                                                               | Plugin demand                        |
| ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- | ------------------------------------ |
| `nvim_buf_attach(buf, send_buffer, opts)`            | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_call(buf, fun)`                            | ✅     | buf must be 0; invokes the function directly                                        | Low                                  |
| `nvim_buf_delete(buf, opts)`                         | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_detach(buf)`                               | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_get_changedtick(buf)`                      | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_get_commands(buf, opts)`                   | 🔲     | Deprecated                                                                          | Low                                  |
| `nvim_buf_get_lines(buf, start, end, strict)`        | ✅     | buf must be 0                                                                       | High (5+ plugins)                    |
| `nvim_buf_get_mark(buf, name)`                       | ⚠️     | Line 1 / UTF-8 byte col 0; unset `{0,0}`, linewise end `v:maxcol`; buf must be 0    | Medium (mini.comment, nvim-surround) |
| `nvim_buf_get_name(buf)`                             | ✅     | buf must be 0                                                                       | Low                                  |
| `nvim_buf_get_offset(buf, index)`                    | ✅     | Line index 0 → byte offset 0; EOL always one byte, unloaded -1, bounds error; buf 0 | Low                                  |
| `nvim_buf_get_text(buf, sr, sc, er, ec, opts)`       | ⚠️     | buf 0; byte columns, exact split-byte reads; past-EOL clamp                         | Low                                  |
| `nvim_buf_get_var(buf, name)`                        | ✅     | buf must be 0                                                                       | Medium (nvim-autopairs)              |
| `nvim_buf_is_loaded(buf)`                            | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_is_valid(buf)`                             | ✅     | Returns true for buf 0                                                              | Medium (flash, leap)                 |
| `nvim_buf_line_count(buf)`                           | ✅     | buf must be 0                                                                       | Medium (mini.comment, mini.surround) |
| `nvim_buf_set_lines(buf, start, end, strict, lines)` | ✅     | buf must be 0                                                                       | High (5+ plugins)                    |
| `nvim_buf_set_mark(buf, name, line, col, opts)`      | ⚠️     | buf must be 0; setter columns still UTF-16                                          | Low                                  |
| `nvim_buf_set_name(buf, name)`                       | 🔲     |                                                                                     | Low                                  |
| `nvim_buf_set_text(buf, sr, sc, er, ec, lines)`      | ⚠️     | buf 0; byte columns with D5 normalization; past-EOL error                           | Medium (nvim-surround)               |
| `nvim_buf_set_var(buf, name)`                        | ✅     | buf must be 0                                                                       | Medium (nvim-autopairs)              |
| `nvim_buf_del_mark(buf, name)`                       | ✅     | buf must be 0                                                                       | Low                                  |
| `nvim_buf_del_var(buf, name)`                        | 🔲     |                                                                                     | Low                                  |

### Deprecated buffer functions (still must be stubbed)

| Function                                                | Status | Notes                                  | Plugin demand |
| ------------------------------------------------------- | ------ | -------------------------------------- | ------------- |
| `nvim_buf_get_option(buf, name)`                        | ⚠️     | Deprecated compat alias; buf must be 0 | Low           |
| `nvim_buf_set_option(buf, name, value)`                 | ⚠️     | Deprecated compat alias; buf must be 0 | Low           |
| `nvim_buf_add_highlight(buf, ns, hl, line, start, end)` | 🔲     | Deprecated in favor of extmarks        | Low           |

### Extmark operations

| Function                                           | Status | Notes                                                                                      | Plugin demand                     |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ | --------------------------------- |
| `nvim_buf_set_extmark(buf, ns, line, col, opts)`   | ⚠️     | hl_group, virt_text (overlay/eol/inline), priority; buf must be 0                          | High (flash, leap, nvim-surround) |
| `nvim_buf_get_extmarks(buf, ns, start, end, opts)` | ⚠️     | limit, details supported; buf must be 0                                                    | Medium (flash, nvim-surround)     |
| `nvim_buf_get_extmark_by_id(buf, ns, id, opts)`    | ✅     | buf must be 0                                                                              | Medium (flash, nvim-surround)     |
| `nvim_buf_del_extmark(buf, ns, id)`                | ✅     | buf must be 0                                                                              | Medium (flash, nvim-surround)     |
| `nvim_buf_clear_namespace(buf, ns, start, end)`    | ✅     | buf must be 0                                                                              | High (flash, leap)                |
| `nvim_set_extmark(...)`                            | 🔲     | Legacy compatibility name in the registry; use `nvim_buf_set_extmark`. Not a real handler. | Low                               |

Extmark setters and getters now convert byte columns through the adapter, with the interior-byte deviation above. Both getters' `details` serialization was repaired: modeled fields now form Lua tables instead of silently returning nil; `end_col` is converted to bytes and `virt_text` is serialized as `{text, highlight_group}` pairs, not internal JS objects. No new options were added. `hl_eol` is already parsed in `nvim_buf_set_extmark`, and `src/lua/extmarks.ts` already sorts by priority. Visual precedence relative to native CM6 decorations remains limited (see `KNOWN_LIMITATIONS.md`); deferred fields include `virt_lines`, `conceal`, `line_hl_group`, and `sign_text`.

### Buffer keymap operations

| Function                                         | Status | Notes         | Plugin demand |
| ------------------------------------------------ | ------ | ------------- | ------------- |
| `nvim_buf_set_keymap(buf, mode, lhs, rhs, opts)` | ✅     | buf must be 0 | Medium        |
| `nvim_buf_del_keymap(buf, mode, lhs)`            | ✅     | buf must be 0 | Low           |
| `nvim_buf_get_keymap(buf, mode)`                 | ✅     | buf must be 0 | Low           |

### User commands

| Function                                             | Status | Notes | Plugin demand          |
| ---------------------------------------------------- | ------ | ----- | ---------------------- |
| `nvim_create_user_command(name, cmd, opts)`          | ✅     |       | Medium (nvim-surround) |
| `nvim_del_user_command(name)`                        | ✅     |       | Low                    |
| `nvim_buf_create_user_command(buf, name, cmd, opts)` | 🔲     |       | Low                    |
| `nvim_buf_del_user_command(buf, name)`               | 🔲     |       | Low                    |

### Autocommands

| Function                           | Status | Notes               | Plugin demand     |
| ---------------------------------- | ------ | ------------------- | ----------------- |
| `nvim_create_autocmd(event, opts)` | ✅     | 19 supported events | High (5+ plugins) |
| `nvim_create_augroup(name, opts)`  | ✅     |                     | High (5+ plugins) |
| `nvim_del_autocmd(id)`             | ✅     |                     | Low               |
| `nvim_del_augroup_by_id(id)`       | 🔲     |                     | Low               |
| `nvim_del_augroup_by_name(name)`   | ✅     |                     | Low               |
| `nvim_clear_autocmds(opts)`        | ✅     |                     | Low               |
| `nvim_exec_autocmds(event, opts)`  | 🔲     |                     | Low               |
| `nvim_get_autocmds(opts)`          | 🔲     |                     | Low               |

### Highlights and namespaces

| Function                       | Status | Notes        | Plugin demand                       |
| ------------------------------ | ------ | ------------ | ----------------------------------- |
| `nvim_create_namespace(name)`  | ✅     |              | Medium (flash, leap, nvim-surround) |
| `nvim_set_hl(ns, name, val)`   | ⚠️     | ns must be 0 | Medium (flash, mini.surround)       |
| `nvim_get_hl(ns, opts)`        | ⚠️     | ns must be 0 | Low                                 |
| `nvim_get_hl_id_by_name(name)` | 🔲     |              | Low                                 |
| `nvim_get_hl_ns(opts)`         | 🔲     |              | Low                                 |
| `nvim_get_namespaces()`        | 🔲     |              | Low                                 |
| `nvim_set_hl_ns(ns)`           | 🔲     |              | Low                                 |
| `nvim_set_hl_ns_fast(ns)`      | 🔲     |              | Low                                 |

### Window operations

| Function                           | Status | Notes                                                                                        | Plugin demand                     |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------- | --------------------------------- |
| `nvim_win_call(win, fun)`          | ✅     | win must be 0; invokes the function directly                                                 | Medium (flash)                    |
| `nvim_win_close(win, force)`       | 🔲     |                                                                                              | Low                               |
| `nvim_win_del_var(win, name)`      | 🔲     |                                                                                              | Low                               |
| `nvim_win_get_buf(win)`            | ✅     | win must be 0; returns 0                                                                     | Low                               |
| `nvim_win_get_config(win)`         | ✅     | win must be 0; reports a non-floating window (`relative = ''`)                               | Medium (flash, leap)              |
| `nvim_win_get_cursor(win)`         | ✅     | Line 1 / UTF-8 byte col 0; no cursor `{1,0}`; win must be 0                                  | High (flash, leap, nvim-surround) |
| `nvim_win_get_height(win)`         | ⚠️     | CM6 viewport cells, 0 without editor; win 0 only                                             | Low                               |
| `nvim_win_get_number(win)`         | ⚠️     | Synthetic ordinal 1; win 0 only                                                              | Low                               |
| `nvim_win_get_position(win)`       | ⚠️     | Synthetic grid origin `{0,0}`; win 0 only                                                    | Low                               |
| `nvim_win_get_tabpage(win)`        | 🔲     |                                                                                              | Low                               |
| `nvim_win_get_var(win, name)`      | 🔲     |                                                                                              | Low                               |
| `nvim_win_get_width(win)`          | ⚠️     | CM6 viewport cells, 0 without editor; win 0 only                                             | Low                               |
| `nvim_win_hide(win)`               | 🔲     |                                                                                              | Low                               |
| `nvim_win_is_valid(win)`           | ⚠️     | True only for integer handle 0; invalid types/arity error                                    | Low                               |
| `nvim_win_set_buf(win, buf)`       | 🔲     |                                                                                              | Low                               |
| `nvim_win_set_config(win, config)` | 🔲     |                                                                                              | Low                               |
| `nvim_win_set_cursor(win, pos)`    | ⚠️     | Line 1 / UTF-8 byte col 0; D4 interior-byte normalization, native past-EOL clamp; win 0 only | High (flash, nvim-surround)       |
| `nvim_win_set_height(win, h)`      | 🔲     |                                                                                              | Low                               |
| `nvim_win_set_hl_ns(win, ns)`      | 🔲     |                                                                                              | Low                               |
| `nvim_win_set_var(win, name, val)` | 🔲     |                                                                                              | Low                               |
| `nvim_win_set_width(win, w)`       | 🔲     |                                                                                              | Low                               |
| `nvim_win_text_height(win, opts)`  | 🔲     |                                                                                              | Low                               |

### Deprecated window functions (still must be stubbed)

| Function                              | Status | Notes      | Plugin demand |
| ------------------------------------- | ------ | ---------- | ------------- |
| `nvim_win_get_option(win, name)`      | 🔲     | Deprecated | Low           |
| `nvim_win_set_option(win, name, val)` | 🔲     | Deprecated | Low           |

### Tab page operations

| Function                               | Status | Notes         | Plugin demand        |
| -------------------------------------- | ------ | ------------- | -------------------- |
| `nvim_get_current_tabpage()`           | ✅     | Returns 0     | Low                  |
| `nvim_tabpage_del_var(tab, name)`      | 🔲     |               | Low                  |
| `nvim_tabpage_get_number(tab)`         | 🔲     |               | Low                  |
| `nvim_tabpage_get_var(tab, name)`      | 🔲     |               | Low                  |
| `nvim_tabpage_get_win(tab)`            | 🔲     |               | Low                  |
| `nvim_tabpage_is_valid(tab)`           | 🔲     |               | Low                  |
| `nvim_tabpage_list_wins(tab)`          | ✅     | Returns `{0}` | Medium (flash, leap) |
| `nvim_tabpage_set_var(tab, name, val)` | 🔲     |               | Low                  |
| `nvim_tabpage_set_win(tab, win)`       | 🔲     |               | Low                  |

### UI functions (not applicable — Obsidian is not a Neovim UI)

| Function                                          | Status | Notes |
| ------------------------------------------------- | ------ | ----- |
| `nvim_ui_attach(width, height, opts)`             | 🚫     |       |
| `nvim_ui_detach()`                                | 🚫     |       |
| `nvim_ui_pum_set_bounds(width, height, row, col)` | 🚫     |       |
| `nvim_ui_pum_set_height(height)`                  | 🚫     |       |
| `nvim_ui_send(data)`                              | 🚫     |       |
| `nvim_ui_set_focus(gained)`                       | 🚫     |       |
| `nvim_ui_set_option(name, value)`                 | 🚫     |       |
| `nvim_ui_try_resize(width, height)`               | 🚫     |       |
| `nvim_ui_try_resize_grid(grid, width, height)`    | 🚫     |       |

---

## vim.fn (Vimscript functions)

### Implemented (92 functions)

The count includes the implemented entries in the demand-grouped tables below; those groups are not claims that every row remains a stub.

| Function                           | Status | Notes                                                                                  | Plugin demand                      |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------- | ---------------------------------- |
| `has(feature)`                     | ✅     | Obsidian/platform features                                                             | Medium                             |
| `expand(expr)`                     | ⚠️     | Only `%` with `:p`, `:t`, `:e`, `:r` modifiers                                         | Low                                |
| `exists(name)`                     | ✅     |                                                                                        | Low                                |
| `undotree()`                       | ✅     |                                                                                        | Low                                |
| `localtime()`                      | ✅     |                                                                                        | Low                                |
| `strftime(format, time?)`          | ✅     |                                                                                        | Low                                |
| `filereadable(path)`               | ✅     |                                                                                        | Low                                |
| `fnamemodify(path, modifier)`      | ✅     |                                                                                        | Low                                |
| `glob(pattern)`                    | ✅     |                                                                                        | Low                                |
| `isdirectory(path)`                | ✅     |                                                                                        | Low                                |
| `mode()`                           | ✅     |                                                                                        | Medium (flash, Comment.nvim)       |
| `line(expr)`                       | ✅     |                                                                                        | Medium (leap, nvim-surround)       |
| `col(expr)`                        | ✅     | 1-based byte column: `.`, `$`, marks or `{lnum,col}`; invalid position 0               | Medium (nvim-surround, leap)       |
| `getline(lnum)`                    | ✅     |                                                                                        | Medium (leap, mini.surround)       |
| `tolower(str)`                     | ✅     |                                                                                        | Low                                |
| `toupper(str)`                     | ✅     |                                                                                        | Low                                |
| `trim(str)`                        | ✅     |                                                                                        | Low                                |
| `strlen(str)`                      | ✅     |                                                                                        | Low                                |
| `strwidth(str)`                    | ⚠️     | UTF-16 `s.length`, not display width; quarantined defect                               | Low                                |
| `stridx(str, sub)`                 | ✅     |                                                                                        | Low                                |
| `strridx(str, sub)`                | ✅     |                                                                                        | Low                                |
| `strpart(str, start, len?)`        | ✅     |                                                                                        | Low                                |
| `substitute(str, pat, sub, flags)` | ✅     |                                                                                        | Low                                |
| `nr2char(nr)`                      | ✅     |                                                                                        | Low                                |
| `char2nr(char)`                    | ✅     |                                                                                        | Low                                |
| `getreg(name?)`                    | ✅     |                                                                                        | Low                                |
| `setreg(name, value, opts?)`       | ✅     |                                                                                        | Low                                |
| `getregtype(name?)`                | ✅     |                                                                                        | Low                                |
| `setline(lnum, text)`              | ✅     |                                                                                        | Low                                |
| `append(lnum, text)`               | ✅     |                                                                                        | Low                                |
| `indent(lnum)`                     | ✅     |                                                                                        | Low (mini.surround, nvim-surround) |
| `nextnonblank(lnum)`               | ✅     |                                                                                        | Low (mini.surround)                |
| `prevnonblank(lnum)`               | ✅     |                                                                                        | Low                                |
| `getpos(expr)`                     | ✅     | Current cursor/mark tuple uses 1-based byte columns                                    | Medium (leap)                      |
| `setpos(expr, list)`               | ✅     | Current cursor/mark writes convert 1-based byte columns; interior bytes normalize down | Low                                |
| `cursor(lnum, col)`                | ✅     |                                                                                        | Medium (nvim-surround, leap)       |
| `getcurpos()`                      | ✅     | Five-element tuple: byte column plus D6 host-goal `curswant`; see deviation above      | Low                                |
| `type(expr)`                       | ✅     |                                                                                        | Low                                |
| `len(expr)`                        | ✅     |                                                                                        | Low                                |
| `empty(expr)`                      | ✅     |                                                                                        | Low                                |
| `matchstr(str, pat)`               | ✅     |                                                                                        | Low (leap)                         |
| `match(str, pat)`                  | ✅     |                                                                                        | Low                                |
| `matchlist(str, pat)`              | ✅     |                                                                                        | Low                                |
| `escape(str, chars)`               | ✅     |                                                                                        | Low                                |
| `repeat(expr, count)`              | ✅     |                                                                                        | Low                                |
| `reverse(list_or_str)`             | ✅     |                                                                                        | Low                                |
| `range(start, end?, stride?)`      | ✅     |                                                                                        | Low                                |
| `sort(list, func?)`                | ✅     |                                                                                        | Low                                |
| `uniq(list)`                       | ✅     |                                                                                        | Low                                |
| `max(list)`                        | ✅     |                                                                                        | Low                                |
| `min(list)`                        | ✅     |                                                                                        | Low                                |
| `abs(expr)`                        | ✅     |                                                                                        | Low                                |
| `index(list, expr)`                | ✅     |                                                                                        | Low                                |
| `count(list, expr)`                | ✅     |                                                                                        | Low                                |
| `add(list, item)`                  | ✅     |                                                                                        | Low                                |
| `remove(list, idx)`                | ✅     |                                                                                        | Low                                |
| `extend(list, other)`              | ✅     |                                                                                        | Low                                |
| `copy(expr)`                       | ✅     |                                                                                        | Low                                |
| `deepcopy(expr)`                   | ✅     |                                                                                        | Low                                |
| `keys(dict)`                       | ✅     |                                                                                        | Low                                |
| `values(dict)`                     | ✅     |                                                                                        | Low                                |
| `items(dict)`                      | ✅     |                                                                                        | Low                                |
| `flatten(list, maxdepth?)`         | ✅     |                                                                                        | Low (nvim-autopairs)               |
| `split(str, pat?, keepempty?)`     | ✅     |                                                                                        | Low                                |
| `join(list, sep?)`                 | ✅     |                                                                                        | Low                                |
| `strchars(s, skipcc?)`             | ✅     | Composing marks counted unless `skipcc`                                                | High (flash)                       |
| `charidx(s, idx, countcc?)`        | ✅     | Byte index → char index                                                                | High (flash, mini.pairs)           |
| `byteidx(s, nr)`                   | ✅     | Char index → byte index                                                                | High (flash)                       |
| `wincol()`                         | ✅     | CM6 geometry; measured from the window edge                                            | High (leap)                        |
| `winlayout()`                      | ✅     | Single leaf, matching `nvim_list_wins()`                                               | High (flash)                       |

### High demand from plugins

| Function                                | Status | Notes                                          | Plugin demand                                        |
| --------------------------------------- | ------ | ---------------------------------------------- | ---------------------------------------------------- |
| `getcharstr()`                          | ✅     | Async via coroutine runner; waits for keypress | High (mini.surround, mini.ai, leap, nvim-surround)   |
| `searchpos(pattern, flags?, stopline?)` | ✅     | Forward/backward search with wrapscan          | High (flash, nvim-surround, leap)                    |
| `winsaveview()`                         | ✅     |                                                | High (flash, nvim-surround)                          |
| `winrestview(dict)`                     | ✅     |                                                | High (flash, nvim-surround)                          |
| `visualmode()`                          | ⚠️     | Uses lastSelection from vim state              | Medium (Comment.nvim, nvim-autopairs, nvim-surround) |
| `getwininfo(winid?)`                    | ✅     | Real CM6 viewport geometry; single window      | Medium (flash, leap)                                 |
| `input(prompt, default?, completion?)`  | ⚠️     | Async via modal; completion arg ignored        | Medium (nvim-surround)                               |
| `foldclosed(lnum)`                      | ✅     | Queries CM6 fold state                         | Medium (flash)                                       |
| `foldclosedend(lnum)`                   | ✅     |                                                | Low                                                  |

### Medium demand from plugins

| Function                             | Status | Notes                                                                           | Plugin demand                      |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------- | ---------------------------------- |
| `maparg(name, mode?, abbr?, dict?)`  | ⚠️     | Returns buffer-local maps only; limited fields                                  | Medium (leap)                      |
| `mapcheck(name, mode?, abbr?)`       | 🔲     | Check mapping conflicts                                                         | Low (leap)                         |
| `hasmapto(what, mode?, abbr?)`       | 🔲     | Check if mapping exists                                                         | Low (leap)                         |
| `getchar()`                          | ✅     | Async via coroutine runner                                                      | Low                                |
| `strcharpart(str, start, len?)`      | ✅     | Unicode code-point aware                                                        | Low (mini.surround, flash)         |
| `strdisplaywidth(str)`               | ⚠️     | Simplified; no full Unicode East Asian Width                                    | Low (nvim-surround)                |
| `byte2line(byte)`                    | ✅     | 1-based bytes → line 1; invalid -1; both DOS EOL bytes belong to preceding line | Low (nvim-surround)                |
| `line2byte(lnum)`                    | ✅     | Line 1 → byte position 1; honors fileformat; invalid -1, one-past-last allowed  | Low (nvim-surround)                |
| `search(pattern, flags?, stopline?)` | 🔲     | Search for pattern                                                              | Low (leap)                         |
| `win_getid(winnr?, tabnr?)`          | ⚠️     | Synthetic current handle 0; invalid ordinals also 0, invalid types/arity error  | Low (leap)                         |
| `getcmdtype()`                       | 🔲     | Current command-line type                                                       | Low (flash)                        |
| `reg_recording()`                    | 🔲     | Currently recording register                                                    | Low (flash)                        |
| `reg_executing()`                    | 🔲     | Currently executing register                                                    | Low (flash)                        |
| `shiftwidth()`                       | ✅     | Effective shiftwidth                                                            | Low (mini.surround, nvim-surround) |

### Low demand / not applicable

| Function                                  | Status | Notes                                                                                                                                | Plugin demand  |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `getbufline(buf, lnum, end?)`             | 🔲     |                                                                                                                                      | Low            |
| `setbufline(buf, lnum, text)`             | 🔲     |                                                                                                                                      | Low            |
| `deletebufline(buf, first, last?)`        | ⚠️     | buf 0 only, 1-based inclusive range, last accepts `$`; 0 success / 1 failure                                                         | Low            |
| `bufnr(expr?)`                            | 🔲     |                                                                                                                                      | Low            |
| `bufname(expr?)`                          | 🔲     |                                                                                                                                      | Low            |
| `buflisted(buf)`                          | 🔲     |                                                                                                                                      | Low            |
| `bufexists(buf)`                          | 🔲     |                                                                                                                                      | Low            |
| `winnr(expr?)`                            | ⚠️     | `''`/`$` → 1, `#` → 0; other forms error; synthetic window                                                                           | Low            |
| `tabpagenr(expr?)`                        | 🔲     |                                                                                                                                      | Low            |
| `changenr()`                              | 🔲     |                                                                                                                                      | Low            |
| `virtcol(expr, list?, win?)`              | ⚠️     | Display column 1 or `[first,last]`; window 0 only, resolved tabstop/list/listchars/wrap/showbreak and measured width                 | Low (leap)     |
| `charcol(expr)`                           | ✅     | Expression → character column 1; `{lnum,col}` already-character list echoed after validation; invalid 0                              | Low            |
| `virtcol2col(win, lnum, col)`             | ⚠️     | Display col 1 → containing character's byte col 1; window 0, invalid -1; zero inputs clamp up, empty line 0, past EOL last character | Low            |
| `screencol()`                             | 🔲     |                                                                                                                                      | Low            |
| `screenrow()`                             | 🔲     |                                                                                                                                      | Low            |
| `synID(lnum, col, trans)`                 | 🔲     |                                                                                                                                      | Low            |
| `synIDattr(id, what, mode?)`              | 🔲     |                                                                                                                                      | Low            |
| `synIDtrans(id)`                          | 🔲     |                                                                                                                                      | Low            |
| `complete(startcol, matches)`             | 🔲     |                                                                                                                                      | Low            |
| `pumvisible()`                            | 🔲     |                                                                                                                                      | Low            |
| `confirm(msg, choices?, default?, type?)` | 🔲     |                                                                                                                                      | Low            |
| `feedkeys(keys, mode?, escape_ks?)`       | 🔲     | Use `nvim_feedkeys`                                                                                                                  | Low            |
| `system(cmd, input?)`                     | 🚫     | No shell access                                                                                                                      | Not applicable |
| `systemlist(cmd, input?)`                 | 🚫     | No shell access                                                                                                                      | Not applicable |
| `execute(cmd)`                            | 🔲     |                                                                                                                                      | Low            |
| `json_encode(expr)`                       | 🔲     | Use `vim.json.encode`                                                                                                                | Low            |
| `json_decode(str)`                        | 🔲     | Use `vim.json.decode`                                                                                                                | Low            |
| `printf(fmt, ...)`                        | 🔲     | Use Lua `string.format`                                                                                                              | Low            |
| `string(expr)`                            | 🔲     |                                                                                                                                      | Low            |

---

## vim.\* core utilities

### vim.opt / vim.o / vim.go / vim.wo / vim.bo / variable scopes

| Feature                                                   | Status | Notes                                                                                                 | Plugin demand                                      |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `vim.opt` (option proxy)                                  | ✅     | 12 Neovim-standard + 27+ plugin-specific options. `operatorfunc` works here and on `vim.o` / `vim.go` | Medium                                             |
| `vim.opt:get()` / `vim.opt:append()` / `vim.opt:remove()` | ❌     | `vim.opt` is a plain value proxy, not an option object. These names fall through `__index` → `nil`    | Low                                                |
| `vim.opt_local`                                           | ❌     | Not registered                                                                                        | Low                                                |
| `vim.opt_global`                                          | ❌     | Not registered                                                                                        | Low                                                |
| `vim.o` (global options proxy)                            | ✅     | Engine value wins, then shadow store, then Neovim defaults. `operatorfunc` fully wired                | High (mini.ai, mini.surround, mini.comment, flash) |
| `vim.go` (global-only options proxy)                      | ✅     | Shares the shadow store and `operatorfunc` wiring with `vim.o`                                        | Medium (nvim-surround, flash)                      |
| `vim.wo` (window options proxy)                           | ✅     | `wrap` from CM6; writes shadow; every other key falls back to the global scope (single-window model)  | Low                                                |
| `vim.bo` (buffer options proxy)                           | ✅     | Adds `softtabstop`, `iminsert`, `fileformat`; writes round-trip via a per-file shadow store           | Medium (Comment.nvim, nvim-surround)               |
| `vim.bo.commentstring`                                    | ⚠️     | Hardcoded `%% %s %%`; no treesitter-contextual detection                                              | Medium                                             |
| `vim.g` (global variables)                                | ✅     |                                                                                                       | Medium                                             |
| `vim.b` (buffer variables)                                | ✅     |                                                                                                       | Medium (nvim-autopairs)                            |
| `vim.w` (window variables)                                | 🔲     | `createWarnVarTable` — read warns and returns `nil`; write raw-stores                                 | Low                                                |
| `vim.t` (tabpage variables)                               | 🔲     | `createWarnVarTable` — read warns and returns `nil`; write raw-stores                                 | Low                                                |
| `vim.v` (v: variables)                                    | ✅     | See vim.v section below                                                                               | Medium                                             |
| `vim.env` (environment variables)                         | ✅     | Sandboxed (empty)                                                                                     | Low                                                |

#### Resolution order for `vim.o` / `vim.go`

Both are global scopes and share one backing implementation (`src/lua/api.ts:1118-1148`). Reads resolve in this order:

1. The codemirror-vim engine, via `callbacks.getOption` — authoritative for every option the fork defines.
2. A shared **shadow store**, holding anything previously written through `vim.o` / `vim.go`.
3. A table of **Neovim-accurate defaults** for globals the fork does not define: `eventignore`, `selection`, `cmdheight`, `columns`, `lines`, `cpo`, `background`. `background` is derived from Obsidian's active theme.
4. Otherwise `nil`.

Writes always record into the shadow store, even when the fork rejects the option, so unmapped globals round-trip. This is what lets mini.ai save and restore `eventignore` / `selection` / `cmdheight` / `columns` around every textobject invocation.

`operatorfunc` is special-cased on `vim.opt`, `vim.o`, `vim.go`, `nvim_get_option` / `nvim_set_option`, and `nvim_get_option_value` / `nvim_set_option_value`, all routed through one pair of shared helpers (`api.ts:1048`, `:1056`). Assigning a Lua function, a function-name string, or `nil` all behave as in Neovim.

> [!note]
> The fork _returns_ (rather than throws) an `Error` object for unknown option names. That value is normalised at `src/lua/loader.ts:560`; previously it could leak through as a truthy result.

### vim.v (predefined variables)

| Variable                                                                     | Status | Notes                                          | Plugin demand         |
| ---------------------------------------------------------------------------- | ------ | ---------------------------------------------- | --------------------- |
| `vim.v.count` / `vim.v.count1`                                               | ✅     | Unreliable after async yield                   | Medium                |
| `vim.v.register`                                                             | ✅     |                                                | Low                   |
| `vim.v.operator`                                                             | ✅     |                                                | Medium (Comment.nvim) |
| `vim.v.searchforward`                                                        | ✅     |                                                | Low                   |
| `vim.v.insertmode`                                                           | ✅     | `'i'`, `'r'`, `'v'`, `''`                      | Low                   |
| `vim.v.char`                                                                 | ⚠️     | Writable but never set (needs `InsertCharPre`) | Low                   |
| `vim.v.hlsearch`                                                             | ✅     |                                                | Low                   |
| `vim.v.event`                                                                | ✅     | Populated in autocmd callbacks                 | Low                   |
| `vim.v.true` / `vim.v.false` / `vim.v.null`                                  | ✅     | Neovim constants                               | Low                   |
| `vim.v.numbermax` / `vim.v.numbermin` / `vim.v.numbersize`                   | ✅     |                                                | Low                   |
| `vim.v.echospace`                                                            | ❌     |                                                | Low (mini.surround)   |
| `vim.v.foldstart` / `vim.v.foldend` / `vim.v.foldlevel` / `vim.v.folddashes` | 🔲     | Return 0/`''`; deferred to foldtext v2         | Low                   |
| `vim.v.lnum` / `vim.v.relnum` / `vim.v.virtnum`                              | 🔲     | Return 0; deferred to statuscolumn v2          | Low                   |

### vim.keymap

| Function                               | Status | Notes                                                                  | Plugin demand      |
| -------------------------------------- | ------ | ---------------------------------------------------------------------- | ------------------ |
| `vim.keymap.set(mode, lhs, rhs, opts)` | ✅     | Function callbacks, `{ expr = true }`, `{ buffer = true }`, `{ desc }` | High (all plugins) |
| `vim.keymap.del(mode, lhs, opts)`      | ✅     |                                                                        | Medium             |

### vim.cmd / vim.notify / vim.schedule

| Function                              | Status | Notes                                                                | Plugin demand  |
| ------------------------------------- | ------ | -------------------------------------------------------------------- | -------------- |
| `vim.cmd(command)`                    | ✅     | Routes to ex command handler                                         | Medium         |
| `vim.notify(msg, level?, opts?)`      | ✅     | Maps to Obsidian Notice                                              | Medium         |
| `vim.notify_once(msg, level?, opts?)` | ✅     | Deduplicates by message text                                         | Low            |
| `vim.schedule(fn)`                    | ✅     | Deferred callback execution                                          | Low            |
| `vim.schedule_wrap(fn)`               | ✅     |                                                                      | Low            |
| `vim.defer_fn(fn, timeout)`           | ✅     | setTimeout wrapper                                                   | Low            |
| `vim.wait(timeout, cond?, interval?)` | ⚠️     | Checks condition once, no polling                                    | Low            |
| `vim.on_key(fn, ns?)`                 | ⚠️     | Real namespace registry and dispatch, but **pre-mapping** (see note) | Medium (flash) |

### Table utilities (vim.tbl\_\*)

| Function                                     | Status | Notes                            | Plugin demand      |
| -------------------------------------------- | ------ | -------------------------------- | ------------------ |
| `vim.tbl_extend(behavior, ...)`              | ✅     | `'force'`, `'keep'`, `'error'`   | High (all plugins) |
| `vim.tbl_deep_extend(behavior, ...)`         | ✅     |                                  | High (all plugins) |
| `vim.tbl_contains(t, value, opts?)`          | ✅     | `{ predicate = true }` supported | Low                |
| `vim.tbl_keys(t)`                            | ✅     |                                  | Low                |
| `vim.tbl_values(t)`                          | ✅     |                                  | Low                |
| `vim.tbl_map(fn, t)`                         | ✅     |                                  | Low                |
| `vim.tbl_filter(fn, t)`                      | ✅     | List-aware                       | Low                |
| `vim.tbl_count(t)`                           | ✅     |                                  | Low                |
| `vim.tbl_isempty(t)`                         | ✅     |                                  | Low                |
| `vim.tbl_get(t, ...)`                        | ✅     | Nested key traversal             | Low                |
| `vim.list_extend(dst, src, start?, finish?)` | ✅     |                                  | Low                |
| `vim.list_contains(t, value)`                | ✅     |                                  | Low                |
| `vim.list_slice(t, start?, finish?)`         | ✅     |                                  | Low                |
| `vim.islist(t)` / `vim.isarray(t)`           | ✅     |                                  | Low                |
| `vim.defaulttable(create?)`                  | ✅     |                                  | Low                |
| `vim.ringbuf(size)`                          | ✅     |                                  | Low                |
| `vim.spairs(t)`                              | ✅     | Sorted pairs iterator            | Low                |
| `vim.empty_dict()`                           | ✅     |                                  | Low                |

### Deprecated table utilities (still must be stubbed)

| Function                        | Status | Notes                            |
| ------------------------------- | ------ | -------------------------------- |
| `vim.tbl_flatten(t)`            | ✅     | Deprecated                       |
| `vim.tbl_islist(t)`             | ✅     | Deprecated; alias for vim.islist |
| `vim.tbl_add_reverse_lookup(t)` | ✅     | Deprecated                       |

### String utilities

| Function                                                  | Status | Notes                                                                      | Plugin demand |
| --------------------------------------------------------- | ------ | -------------------------------------------------------------------------- | ------------- |
| `vim.split(s, sep, opts?)`                                | ✅     | `{ plain, trimempty }`                                                     | Low           |
| `vim.gsplit(s, sep, opts?)`                               | ✅     | Iterator version of split                                                  | Low           |
| `vim.trim(s)`                                             | ✅     |                                                                            | Low           |
| `vim.startswith(s, prefix)`                               | ✅     |                                                                            | Low           |
| `vim.endswith(s, suffix)`                                 | ✅     |                                                                            | Low           |
| `vim.pesc(s)`                                             | ✅     | Lua pattern escape                                                         | Low           |
| `vim.stricmp(a, b)`                                       | ✅     | Case-insensitive compare                                                   | Low           |
| `vim.str_byteindex(s, encoding, index, strict_indexing?)` | ✅     | UTF-8/16/32 index → byte offset; legacy numeric-index overload supported   | Low           |
| `vim.str_utfindex(s, encoding, index, strict_indexing?)`  | ✅     | Byte offset → UTF index; legacy overload returns UTF-32 and UTF-16 indices | Low           |
| `vim.str_utf_start(s, index)`                             | ✅     | Offset back to containing UTF-8 character start                            | Low           |
| `vim.str_utf_end(s, index)`                               | ✅     | Offset forward to containing UTF-8 character's final byte                  | Low           |
| `vim.str_utf_pos(s)`                                      | ✅     | 1-based UTF-8 start positions                                              | Low           |
| `vim.iconv(str, from, to)`                                | 🔇     | Returns str unchanged; no encoding conversion, no warning                  | Low           |
| `vim.keycode(str)`                                        | ✅     | Translates <CR>, <Esc>, <Space>, etc. to char codes                        | Low           |

### Other core utilities

| Function                                             | Status | Notes                                               | Plugin demand                  |
| ---------------------------------------------------- | ------ | --------------------------------------------------- | ------------------------------ |
| `vim.deepcopy(obj)`                                  | ✅     | Cycle-safe                                          | Low                            |
| `vim.deep_equal(a, b)`                               | ✅     |                                                     | Low                            |
| `vim.is_callable(f)`                                 | ⚠️     | Does not detect `__call` metamethods                | Low                            |
| `vim.validate(spec)`                                 | ✅     | Both old table form and new positional form (0.11+) | Medium (nvim-surround, mini.*) |
| `vim.print(...)`                                     | ✅     |                                                     | Low                            |
| `vim.inspect(value, opts?)`                          | ✅     | Full inspect.lua port                               | Low                            |
| `vim.inspect_pos(buf?, row?, col?, filter?)`         | ❌     |                                                     | Low                            |
| `vim.show_pos(buf?, row?, col?, filter?)`            | ❌     |                                                     | Low                            |
| `vim.in_fast_event()`                                | ✅     | Always returns false                                | Low                            |
| `vim.call(fn, ...)`                                  | ✅     | Delegates to vim.fn[fn](...)                        | Low                            |
| `vim.paste(lines, phase)`                            | 🔲     | Returns true (no-op)                                | Low                            |
| `vim.deprecate(name, alt, ver, plugin?, backtrace?)` | 🔲     | No-op stub                                          | Low                            |
| `vim.lua_omnifunc(findstart, base)`                  | ❌     |                                                     | 🚫                             |
| `vim.diff(a, b, opts?)`                              | 🔲     | Returns empty string                                | Low                            |
| `vim.system(cmd, opts?, on_exit?)`                   | 🚫     | No shell access                                     | Not applicable                 |

### vim.regex

| Function                   | Status | Notes                              | Plugin demand |
| -------------------------- | ------ | ---------------------------------- | ------------- |
| `vim.regex(pattern)`       | ✅     | Vim patterns, translated to RegExp | Low           |
| `:match_str(str)`          | ✅     | Returns start, end                 | Low           |
| `:match_line(bufnr, lnum)` | ✅     | Alias for match_str                | Low           |
| `:match_pos(str)`          | ✅     |                                    | Low           |
| `:replace(str, repl)`      | ✅     |                                    | Low           |
| `:test(str)`               | ✅     |                                    | Low           |

### vim.json

| Function                 | Status | Notes          |
| ------------------------ | ------ | -------------- |
| `vim.json.encode(value)` | ✅     | JSON.stringify |
| `vim.json.decode(str)`   | ✅     | JSON.parse     |

### vim.iter

| Function        | Status | Notes                                                                                                                                 | Plugin demand                                   |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `vim.iter(src)` | ✅     | Real iterator. Sources: list-like table, map-like table, iterator function, callable table. 26 methods. Overrides the namespace stub. | Medium (mini.ai, mini.surround, nvim-autopairs) |

### vim.uv (libuv bindings)

| Function             | Status | Notes                                                                                | Plugin demand  |
| -------------------- | ------ | ------------------------------------------------------------------------------------ | -------------- |
| `vim.uv.new_timer()` | ✅     | `start(delay, repeat, callback)`, `stop()`, `close()`, `is_closing()`, `is_active()` | Low            |
| All other `vim.uv.*` | 🚫     | libuv not available in browser                                                       | Not applicable |

### vim.uri utilities

| Function                               | Status | Notes                              |
| -------------------------------------- | ------ | ---------------------------------- |
| `vim.uri_decode(str)`                  | 🔇     | Returns str unchanged; no warning  |
| `vim.uri_encode(str)`                  | 🔇     | Returns str unchanged; no warning  |
| `vim.uri_from_bufnr(bufnr)`            | 🔇     | Returns empty string; no warning   |
| `vim.uri_from_fname(path)`             | 🔇     | Returns file:// + path; no warning |
| `vim.uri_to_bufnr(uri)`                | 🔇     | Returns 0; no warning              |
| `vim.uri_to_fname(uri)`                | 🔇     | Returns uri unchanged; no warning  |
| `vim.ui_attach(ns, opts, callback)`    | ❌     |                                    |
| `vim.ui_detach(ns)`                    | ❌     |                                    |
| `vim.rpcnotify(channel, method, ...)`  | 🚫     | RPC only                           |
| `vim.rpcrequest(channel, method, ...)` | 🚫     | RPC only                           |

### Sentinel values and constants

| Value                          | Status | Notes                                   |
| ------------------------------ | ------ | --------------------------------------- |
| `vim.NIL`                      | ✅     | Sentinel table                          |
| `vim.EMPTY`                    | ✅     | Alias for vim.NIL (deprecated)          |
| `vim.log.levels`               | ✅     | DEBUG=0, INFO=1, WARN=2, ERROR=3, OFF=4 |
| `vim.F.if_nil(val, default)`   | ✅     |                                         |
| `vim.F.ok_or_nil(status, ...)` | ✅     |                                         |

### Plugin management (Obsidian-specific)

| Function                | Status | Notes                                       |
| ----------------------- | ------ | ------------------------------------------- |
| `vim.plugins.add(spec)` | ✅     | GitHub tarball download, staging, lock file |
| `vim.plugins.list()`    | ✅     |                                             |

---

## vim.fs (filesystem)

All entries are backed by the generic namespace stub (`src/lua/namespace-stubs.ts`): reading any key warns once and returns a no-op function that returns `0`. Real file I/O is available through `vim.ob.fs.read` / `readlines`.

| Function                       | Status | Notes |
| ------------------------------ | ------ | ----- |
| `vim.fs.abspath(path)`         | 🔲     |       |
| `vim.fs.basename(path)`        | 🔲     |       |
| `vim.fs.copy(src, dst, opts?)` | 🔲     |       |
| `vim.fs.dir(path, opts?)`      | 🔲     |       |
| `vim.fs.dirname(path)`         | 🔲     |       |
| `vim.fs.exists(path)`          | 🔲     |       |
| `vim.fs.ext(path)`             | 🔲     |       |
| `vim.fs.find(names, opts?)`    | 🔲     |       |
| `vim.fs.joinpath(...)`         | 🔲     |       |
| `vim.fs.normalize(path)`       | 🔲     |       |
| `vim.fs.parents(path)`         | 🔲     |       |
| `vim.fs.read(path, opts?)`     | 🔲     |       |
| `vim.fs.relpath(path, base)`   | 🔲     |       |
| `vim.fs.rm(path, opts?)`       | 🔲     |       |
| `vim.fs.root(source, marker)`  | 🔲     |       |

---

## vim.version

| Function                         | Status | Notes                                |
| -------------------------------- | ------ | ------------------------------------ |
| `vim.version()`                  | ✅     | Returns {major=0, minor=12, patch=5} |
| `vim.version.cmp(v1, v2)`        | ✅     |                                      |
| `vim.version.eq(v1, v2)`         | ✅     |                                      |
| `vim.version.ge(v1, v2)`         | ✅     |                                      |
| `vim.version.gt(v1, v2)`         | ✅     |                                      |
| `vim.version.le(v1, v2)`         | ✅     |                                      |
| `vim.version.lt(v1, v2)`         | ✅     |                                      |
| `vim.version.intersect(spec, v)` | ✅     |                                      |
| `vim.version.last(versions)`     | ✅     |                                      |
| `vim.version.parse(str)`         | ✅     |                                      |
| `vim.version.range(spec)`        | ✅     | Returns range with :has() method     |

---

## vim.snippet

`vim.snippet` is initially registered as a generic namespace stub, then **replaced by a real implementation** (`src/lua/snippet-api.ts:304-362`, injected at `src/lua/loader.ts:1740-1742`). The implementation exposes a LuaSnip-inspired DSL rather than the Neovim `vim.snippet` API.

Implemented members: `t`, `i`, `c`, `rep`, `f`, `d`, `sn`, `r`, `fmt`, `s`, `add`, `add_all`.

The upstream Neovim `vim.snippet` surface is not provided:

| Function                      | Status | Notes                                              |
| ----------------------------- | ------ | -------------------------------------------------- |
| `vim.snippet.active(filter?)` | ❌     | Plugin has its own snippet system; use the Lua DSL |
| `vim.snippet.expand(input)`   | ❌     |                                                    |
| `vim.snippet.jump(direction)` | ❌     |                                                    |
| `vim.snippet.stop()`          | ❌     |                                                    |

---

## vim.filetype

Registered as a real table at `src/lua/api.ts:3664-3711` (not a generic namespace stub).

| Function                                    | Status | Notes                    | Plugin demand      |
| ------------------------------------------- | ------ | ------------------------ | ------------------ |
| `vim.filetype.add(filetypes)`               | ❌     | Not present on the table | Low                |
| `vim.filetype.get_option(filetype, option)` | ✅     | Implemented              | Low (mini.comment) |
| `vim.filetype.match(args)`                  | ❌     | Not present on the table | Low                |

---

## vim.hl (highlight utilities)

| Function                                            | Status | Notes                         |
| --------------------------------------------------- | ------ | ----------------------------- |
| `vim.hl.on_yank(opts?)`                             | 🔲     | Plugin has own yank highlight |
| `vim.hl.range(buf, ns, hlgroup, start, end, opts?)` | 🔲     |                               |

---

## vim.ui

`vim.ui` is a real, **plain mutable table with no metatable** (`src/lua/ui-api.ts`), so plugins that replace and restore its fields — dressing.nvim, telescope-ui-select, snacks — work as written. An Obsidian-specific namespace also exists at `vim.obsidian.ui` (`src/lua/obsidian-api.ts`); the two coexist and are not aliases.

`select` and `input` are **non-blocking**: they return immediately and invoke their callback later on a coroutine thread, so they work from a `vim.keymap.set` callback, where a yield-based design would raise.

| Function                                | Status | Notes                                                                         |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `vim.ui.select(items, opts, on_choice)` | ✅     | Backed by the picker; `on_choice` gets the original Lua value + 1-based index |
| `vim.ui.input(opts, on_confirm)`        | ✅     | `''` on empty confirm, `nil` on cancel                                        |
| `vim.ui.open(path, opts?)`              | ⚠️     | Desktop only; `nil, errmsg` elsewhere. `opts.cmd` rejected                    |
| `vim.ui.progress_status(opts?)`         | 🔲     | `''` — exactly Neovim's idle value                                            |
| `vim.ui_attach` / `vim.ui_detach`       | ❌     | Absent by decision — see `.sisyphus/plans/vim-ui-namespace.md` §3.4           |

---

## vim.health

| Function                     | Status | Notes |
| ---------------------------- | ------ | ----- |
| `vim.health.error(msg, ...)` | 🔲     |       |
| `vim.health.info(msg, ...)`  | 🔲     |       |
| `vim.health.ok(msg, ...)`    | 🔲     |       |
| `vim.health.start(name)`     | 🔲     |       |
| `vim.health.warn(msg, ...)`  | 🔲     |       |

---

## vim.loader

| Function                          | Status | Notes                   |
| --------------------------------- | ------ | ----------------------- |
| `vim.loader.enable(opts?)`        | 🔲     | Byte-compiled Lua cache |
| `vim.loader.find(modname, opts?)` | 🔲     |                         |
| `vim.loader.reset(path?)`         | 🔲     |                         |

---

## vim.lpeg / vim.re (parsing expression grammars)

| Function                                     | Status | Notes |
| -------------------------------------------- | ------ | ----- |
| `vim.lpeg.locale(tab?)`                      | 🔲     |       |
| `vim.lpeg.match(pattern, subject, init?)`    | 🔲     |       |
| `vim.lpeg.setmaxstack(max)`                  | 🔲     |       |
| `vim.lpeg.type(value)`                       | 🔲     |       |
| `vim.lpeg.version()`                         | 🔲     |       |
| `vim.re.compile(string, defs?)`              | 🔲     |       |
| `vim.re.find(subject, pattern, init?)`       | 🔲     |       |
| `vim.re.gsub(subject, pattern, replacement)` | 🔲     |       |
| `vim.re.match(subject, pattern, init?)`      | 🔲     |       |
| `vim.re.updatelocale()`                      | 🔲     |       |

---

## vim.glob

| Function                    | Status | Notes |
| --------------------------- | ------ | ----- |
| `vim.glob.to_lpeg(pattern)` | 🔲     |       |

---

## vim.text

| Function                          | Status | Notes |
| --------------------------------- | ------ | ----- |
| `vim.text.diff(a, b, opts?)`      | 🔲     |       |
| `vim.text.hexdecode(str)`         | 🔲     |       |
| `vim.text.hexencode(str)`         | 🔲     |       |
| `vim.text.indent(n, text, opts?)` | 🔲     |       |

---

## vim.base64

| Function                 | Status | Notes |
| ------------------------ | ------ | ----- |
| `vim.base64.decode(str)` | 🔲     |       |
| `vim.base64.encode(str)` | 🔲     |       |

---

## vim.spell

| Function               | Status | Notes |
| ---------------------- | ------ | ----- |
| `vim.spell.check(str)` | 🔲     |       |

---

## vim.secure

| Function                 | Status | Notes |
| ------------------------ | ------ | ----- |
| `vim.secure.read(path)`  | 🔲     |       |
| `vim.secure.trust(opts)` | 🔲     |       |

---

## vim.pos / vim.range

| Feature     | Status | Notes                                        |
| ----------- | ------ | -------------------------------------------- |
| `vim.pos`   | ❌     | Position representation/conversion utilities |
| `vim.range` | ❌     | Range representation/conversion utilities    |

---

## vim.lsp (not applicable — no LSP server in Obsidian)

All `vim.lsp.*` functions are 🚫 not applicable. Listed for completeness.

| Namespace                | Function count | Status |
| ------------------------ | -------------- | ------ |
| `vim.lsp` (core)         | ~15            | 🚫     |
| `vim.lsp.buf`            | ~20            | 🚫     |
| `vim.lsp.codelens`       | ~5             | 🚫     |
| `vim.lsp.completion`     | ~3             | 🚫     |
| `vim.lsp.diagnostic`     | ~5             | 🚫     |
| `vim.lsp.document_color` | ~3             | 🚫     |
| **Total**                | **~51**        | 🚫     |

---

## vim.diagnostic (not applicable — no diagnostic system)

| Function                                                        | Status | Notes |
| --------------------------------------------------------------- | ------ | ----- |
| `vim.diagnostic.config(opts?, ns?)`                             | 🚫     |       |
| `vim.diagnostic.count(buf?, opts?)`                             | 🚫     |       |
| `vim.diagnostic.enable(enable, filter?)`                        | 🚫     |       |
| `vim.diagnostic.fromqflist(list)`                               | 🚫     |       |
| `vim.diagnostic.get(buf?, opts?)`                               | 🚫     |       |
| `vim.diagnostic.get_namespace(ns)`                              | 🚫     |       |
| `vim.diagnostic.get_namespaces()`                               | 🚫     |       |
| `vim.diagnostic.get_next(opts?)`                                | 🚫     |       |
| `vim.diagnostic.get_prev(opts?)`                                | 🚫     |       |
| `vim.diagnostic.hide(ns?, buf?)`                                | 🚫     |       |
| `vim.diagnostic.is_enabled(filter?)`                            | 🚫     |       |
| `vim.diagnostic.jump(opts)`                                     | 🚫     |       |
| `vim.diagnostic.match(str, pat, groups?, severity?, defaults?)` | 🚫     |       |
| `vim.diagnostic.open_float(opts?)`                              | 🚫     |       |
| `vim.diagnostic.reset(ns?, buf?)`                               | 🚫     |       |
| `vim.diagnostic.set(ns, buf, diagnostics, opts?)`               | 🚫     |       |
| `vim.diagnostic.setloclist(opts?)`                              | 🚫     |       |
| `vim.diagnostic.setqflist(opts?)`                               | 🚫     |       |
| `vim.diagnostic.show(ns?, buf?, diagnostics?, opts?)`           | 🚫     |       |
| `vim.diagnostic.status(ns?, buf?)`                              | 🚫     |       |
| `vim.diagnostic.toqflist(diagnostics)`                          | 🚫     |       |

---

## vim.treesitter

### Core functions

| Function                                                  | Status | Notes                                           | Plugin demand                          |
| --------------------------------------------------------- | ------ | ----------------------------------------------- | -------------------------------------- |
| `vim.treesitter.get_parser(buf?, lang?)`                  | ✅     | Returns LanguageTree; buf ignored (current doc) | High (5+ plugins)                      |
| `vim.treesitter.get_string_parser(str, lang?)`            | ✅     | Parse arbitrary string                          | Low                                    |
| `vim.treesitter.get_node(opts?)`                          | ✅     | `{ pos, lang }`                                 | Medium (nvim-autopairs, nvim-surround) |
| `vim.treesitter.get_node_text(node, source, opts?)`       | ✅     |                                                 | Medium (nvim-autopairs)                |
| `vim.treesitter.get_range(node, source?, metadata?)`      | ✅     | Returns 6 values                                | Low                                    |
| `vim.treesitter.get_node_range(node, source?, metadata?)` | ✅     | Returns 4 values                                | Low                                    |
| `vim.treesitter.is_in_node_range(node, line, col)`        | ✅     |                                                 | Low                                    |
| `vim.treesitter.is_ancestor(dest, source)`                | ✅     |                                                 | Low                                    |
| `vim.treesitter.node_contains(node, range)`               | ✅     |                                                 | Low                                    |
| `vim.treesitter.get_captures_at_pos(buf, row, col)`       | 🔲     | Returns empty table (needs highlights query)    | Low                                    |
| `vim.treesitter.get_captures_at_cursor(winnr?)`           | 🔲     | Returns empty table (needs highlights query)    | Low                                    |
| `vim.treesitter.start(buf?, lang?)`                       | 🔲     | No-op; plugin uses Lezer highlighting           | Low                                    |
| `vim.treesitter.stop(buf?)`                               | 🔲     | No-op                                           | Low                                    |
| `vim.treesitter.foldexpr(lnum?)`                          | 🔲     | Returns `"0"`; plugin has own fold system       | Low                                    |
| `vim.treesitter.inspect_tree(opts?)`                      | 🔲     | No-op; debug UI not implemented                 | Low                                    |

### Query API (`vim.treesitter.query`)

| Function                                          | Status | Notes                                                                                       | Plugin demand                                  |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `query.parse(lang, query_str)`                    | ✅     | Returns Query object                                                                        | Medium                                         |
| `query.get(lang, query_name)`                     | ✅     | `query.set()` → user `.scm` → plugin `.scm` → bundled. Synchronous via a preloaded snapshot | Medium (mini.ai, mini.surround, nvim-surround) |
| `query.set(lang, query_name, query_str)`          | ✅     | Pre-registers queries                                                                       | Low                                            |
| `query.get_files(lang, query_name, is_included?)` | ⚠️     | Returns vault-relative physical paths; bundled queries have no path and are omitted         | Low                                            |
| `query.edit(lang, query_name)`                    | ❌     | Opens query in editor                                                                       | 🚫                                             |
| `query.lint(buf?, opts?)`                         | ❌     |                                                                                             | 🚫                                             |
| `query.omnifunc(findstart, base)`                 | ❌     |                                                                                             | 🚫                                             |
| `query.list_predicates()`                         | ✅     |                                                                                             | Low                                            |
| `query.list_directives()`                         | ✅     |                                                                                             | Low                                            |
| `query.add_predicate(name, handler, opts?)`       | ✅     | Custom predicate registration                                                               | Low                                            |
| `query.add_directive(name, handler, opts?)`       | ⚠️     | Handler is a no-op stub                                                                     | Low                                            |

### Query object methods

| Method                                                  | Status | Notes            |
| ------------------------------------------------------- | ------ | ---------------- |
| `Query:iter_captures(node, source, start?, end?)`       | ✅     | Returns iterator |
| `Query:iter_matches(node, source, start?, end?, opts?)` | ✅     | Returns iterator |
| `Query:disable_capture(name)`                           | ✅     |                  |
| `Query:disable_pattern(index)`                          | ✅     |                  |

### Built-in predicates

| Predicate         | Status | Notes                                                  |
| ----------------- | ------ | ------------------------------------------------------ |
| `#eq?`            | ✅     |                                                        |
| `#match?`         | ✅     | ECMAScript regex                                       |
| `#any-of?`        | ✅     |                                                        |
| `#has-ancestor?`  | ✅     |                                                        |
| `#has-parent?`    | ✅     |                                                        |
| `#contains?`      | ✅     |                                                        |
| `#vim-match?`     | ✅     |                                                        |
| `#lua-match?`     | ⚠️     | Falls back to ECMAScript regex instead of Lua patterns |
| `#not-*` generics | ✅     | Auto-generated negations                               |
| `#any-*` generics | ✅     | Auto-generated any-match variants                      |

### Built-in directives

| Directive  | Status |
| ---------- | ------ |
| `#set!`    | ✅     |
| `#offset!` | ✅     |
| `#gsub!`   | ✅     |
| `#trim!`   | ✅     |

### Language API (`vim.treesitter.language`)

| Function                            | Status | Notes                                                | Plugin demand       |
| ----------------------------------- | ------ | ---------------------------------------------------- | ------------------- |
| `language.register(lang, filetype)` | ✅     |                                                      | Low                 |
| `language.get_lang(filetype)`       | ✅     |                                                      | Low (nvim-surround) |
| `language.get_filetypes(lang)`      | ✅     |                                                      | Low                 |
| `language.add(lang, opts?)`         | ⚠️     | Only bundled grammars (markdown, html); no CDN fetch | Low                 |
| `language.inspect(lang)`            | ✅     | Returns ABI, fields, symbols, supertypes             | Low                 |

### LanguageTree methods

| Method                                       | Status | Notes                                                              |
| -------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `LanguageTree:parse(range?)`                 | ✅     | Returns tree table                                                 |
| `LanguageTree:trees()`                       | ✅     |                                                                    |
| `LanguageTree:lang()`                        | ✅     |                                                                    |
| `LanguageTree:source()`                      | ✅     | Returns 0 (buffer source)                                          |
| `LanguageTree:children()`                    | ✅     | Child language trees                                               |
| `LanguageTree:parent()`                      | ✅     |                                                                    |
| `LanguageTree:is_valid()`                    | ✅     |                                                                    |
| `LanguageTree:included_regions()`            | ✅     |                                                                    |
| `LanguageTree:contains(range)`               | ✅     |                                                                    |
| `LanguageTree:tree_for_range(range)`         | ✅     |                                                                    |
| `LanguageTree:node_for_range(range)`         | ✅     |                                                                    |
| `LanguageTree:named_node_for_range(range)`   | ✅     |                                                                    |
| `LanguageTree:language_for_range(range)`     | ✅     |                                                                    |
| `LanguageTree:for_each_tree(fn)`             | ✅     |                                                                    |
| `LanguageTree:register_cbs(cbs, recursive?)` | ✅     | `on_changedtree`, `on_bytes`, `on_child_added`, `on_child_removed` |
| `LanguageTree:invalidate(reload?)`           | ✅     |                                                                    |
| `LanguageTree:destroy()`                     | ✅     |                                                                    |
| `LanguageTree:root()`                        | ✅     | Returns root TSNode                                                |

### TSNode methods

| Method                                            | Status |
| ------------------------------------------------- | ------ |
| `node:parent()`                                   | ✅     |
| `node:child(index)`                               | ✅     |
| `node:named_child(index)`                         | ✅     |
| `node:next_sibling()`                             | ✅     |
| `node:prev_sibling()`                             | ✅     |
| `node:next_named_sibling()`                       | ✅     |
| `node:prev_named_sibling()`                       | ✅     |
| `node:child_with_descendant(desc)`                | ✅     |
| `node:descendant_for_range(sr, sc, er, ec)`       | ✅     |
| `node:named_descendant_for_range(sr, sc, er, ec)` | ✅     |
| `node:named_children()`                           | ✅     |
| `node:field(name)`                                | ✅     |
| `node:iter_children()`                            | ✅     |
| `node:child_count()`                              | ✅     |
| `node:named_child_count()`                        | ✅     |
| `node:start()`                                    | ✅     |
| `node:end_()`                                     | ✅     |
| `node:range(include_bytes?)`                      | ✅     |
| `node:byte_length()`                              | ✅     |
| `node:type()`                                     | ✅     |
| `node:symbol()`                                   | ✅     |
| `node:named()`                                    | ✅     |
| `node:missing()`                                  | ✅     |
| `node:extra()`                                    | ✅     |
| `node:has_error()`                                | ✅     |
| `node:has_changes()`                              | ✅     |
| `node:sexpr()`                                    | ✅     |
| `node:id()`                                       | ✅     |
| `node:equal(other)`                               | ✅     |
| `node:tree()`                                     | ✅     |

---

## Unlisted API surface used by real plugins

These are called by the analyzed plugins but were absent from earlier revisions of this document. All but one are now registered.

Classification comes from reading the plugin source, not from estimates:

- **REQUIRED** — reached on a minimal default config, with no guard.
- **OPTIONAL** — behind an opt-in config flag.
- **GUARD** — the plugin only probes for the value; the placeholder is the correct answer.

| Function                   | Status | Reachability | Used by                       | Notes                                                                                    |
| -------------------------- | ------ | ------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `nvim__redraw(opts)`       | 🔲     | GUARD        | flash, leap                   | Tier-2 warn-once stub, not absent; truthiness can select an unsupported path (see below) |
| `vim.fn.charidx(s, idx)`   | ✅     | REQUIRED     | flash, mini.pairs             | Byte index → character index; folds composing marks                                      |
| `vim.fn.byteidx(s, idx)`   | ✅     | REQUIRED     | flash                         | Character index → byte index                                                             |
| `vim.fn.strchars(s)`       | ✅     | REQUIRED     | flash                         | Character count; `skipcc` folds composing marks                                          |
| `vim.fn.winlayout()`       | ✅     | REQUIRED     | flash                         | Single leaf, matching `nvim_list_wins()`                                                 |
| `vim.fn.wincol()`          | ✅     | REQUIRED     | leap                          | Cursor screen column from CM6 geometry; the gutter counts                                |
| `vim.fn.mapset(dict)`      | 🔲     | OPTIONAL     | flash                         | Only when `remote_op.restore` is enabled                                                 |
| `vim.fn.histadd(hist, s)`  | 🔲     | OPTIONAL     | flash                         | Only when `jump.history` is enabled (default off)                                        |
| `vim.fn.histdel(hist, s)`  | 🔲     | OPTIONAL     | flash                         | Search-mode cleanup; search mode defaults off                                            |
| `vim.fn.getcmdline()`      | 🔲     | OPTIONAL     | flash                         | `''` is correct when not on the command line                                             |
| `vim.fn.setcmdline(s)`     | 🔲     | OPTIONAL     | flash                         | Operator-pending search only                                                             |
| `vim.fn.getcmdpos()`       | 🔲     | GUARD        | mini.pairs                    | `0` is correct when not on the command line                                              |
| `vim.fn.getcmdwintype()`   | 🔲     | GUARD        | mini.ai                       | `''` is correct outside the command-line window                                          |
| `vim.fn.wildmenumode()`    | 🔲     | GUARD        | mini.pairs                    | `0` is correct when the wildmenu is not open                                             |
| `vim.fn.complete_info()`   | 🔲     | GUARD        | nvim-autopairs                | Empty dict; no completion popup exists                                                   |
| `vim.bo.iminsert`          | ✅     | REQUIRED     | flash, leap                   | Returns `0`; read on every leap invocation and flash `State.new`                         |
| `vim.bo.fileformat`        | ✅     | REQUIRED     | nvim-surround                 | Returns `'unix'`                                                                         |
| `vim.o.eventignore`        | ✅     | REQUIRED     | mini.ai                       | Neovim-accurate default plus shadow store (see resolution order)                         |
| `vim.o.selection`          | ✅     | REQUIRED     | mini.ai, mini.surround, flash |                                                                                          |
| `vim.o.cmdheight`          | ✅     | REQUIRED     | mini.ai, mini.surround        |                                                                                          |
| `vim.o.columns`            | ✅     | REQUIRED     | mini.ai, mini.surround, flash | flash reads it as `vim.go.columns`                                                       |
| `vim.o.cpo`                | ✅     | REQUIRED     | leap                          | Core search loop saves/restores it                                                       |
| `vim.wo.wrap`              | ✅     | REQUIRED     | leap                          | Real CM6 line-wrapping state                                                             |
| `vim.hl` / `vim.highlight` | 🔲     | —            | leap                          | Generic namespace stub                                                                   |

### Absence policy and feature detection

Tier 3 raises on **property read**, not on call. Both plugins that use `nvim__redraw` guard it:

- flash: `if vim.api.nvim__redraw then` (`lua/flash/highlight.lua`, `lua/flash/hacks.lua`)
- leap: `pcall(vim.api.nvim__redraw, ...)` (`lua/leap/jump.lua`)

Neither guard protects the read — leap's argument is evaluated before `pcall` receives it — so leaving the name unregistered converted a defensive check into a crash.

But a warn-once tier-2 stub can also select the wrong branch. Stubs are truthy, so `if vim.api.nvim__redraw then` takes the branch intended for hosts that have the API. flash's alternative draws a cursor highlight with `nvim_buf_set_extmark`, supported only with the documented coordinate/rendering limitations here. This branch analysis is not proof that flash runs: its FFI blocker remains terminal.

The canonical policy is to document the actual read/call behavior, not infer support from truthiness. There is **no `ABSENT_NVIM_API_FUNCTIONS` tier in source**. That was a proposal, not an implementation: known names including `nvim__redraw` still read as warn-once stubs, unknown `vim.api`/`vim.fn` names raise on read, and deliberately absent fields in plain namespaces read as `nil`. A future nil-returning tier needs its own reviewed change and fallback tests.

| Dispatch tier                  | Read result        | Use when                                                   |
| ------------------------------ | ------------------ | ---------------------------------------------------------- |
| `SUPPORTED_NVIM_API_FUNCTIONS` | the implementation | Implemented                                                |
| `KNOWN_NVIM_API_FUNCTIONS`     | warn-once stub     | Callers do not feature-detect; a placeholder is survivable |
| unregistered                   | Lua error          | Not part of the compatibility surface                      |

The same reasoning applies to the command-line and history functions above: their placeholder values (`''`, `0`, `{}`) are exactly what Neovim returns when no command line, wildmenu, or completion popup is active.

## Corrections to previously stated blockers

Two entries in earlier revisions of this document overstated the problem. Verified against plugin source:

| Previously stated                                                        | Actual                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getcmdtype()`, `reg_recording()`, `reg_executing()` block flash         | **Not blockers.** flash uses all three purely as guards. The `''` stub is the _correct_ value when not recording and not on the command line. No work needed.                                                                                                                                                                                                                                                         |
| `vim.treesitter.query.get()` file loading blocks mini.ai / mini.surround | **Overstated.** Both default `use_nvim_treesitter = false`, and their treesitter textobjects are opt-in — the core textobject engine works without them. Neovim's own `query.get()` checks `query.set()`-registered queries _before_ reading runtimepath, and `query.set()` is already implemented. Bundling a `markdown/textobjects.scm` via `query.set()` captures most of the value without filesystem resolution. |

## Architectural constraints

These are fundamental limitations of the Obsidian environment that affect API compatibility:

| Constraint                      | Impact                                                              | Workaround                                 |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| **Single-buffer model**         | All `buf` handles must be `0`                                       | Map Obsidian leaves to virtual buffer IDs  |
| **No multi-window**             | All `win` handles must be `0`                                       | Map Obsidian panes to virtual window IDs   |
| **No Vimscript evaluation**     | String expr mappings, `nvim_eval` unavailable                       | Use Lua function callbacks                 |
| **No shell access**             | `system()`, `systemlist()`, `jobstart()` unavailable                | Use `vim.ob.fs.*` for file I/O             |
| **Browser runtime**             | No `os`, `io`, `debug` libraries; no `require()` for native modules | Plugin provides safe alternatives          |
| **Lezer-based highlighting**    | `vim.treesitter.start()`/`stop()` are no-ops                        | Lezer handles syntax highlighting natively |
| **Only Markdown/HTML grammars** | Other language grammars not bundled                                 | CDN-based grammar fetching planned         |
| **No LSP**                      | `vim.lsp.*` entirely unavailable                                    | Not applicable in Obsidian                 |
| **No diagnostics**              | `vim.diagnostic.*` entirely unavailable                             | Not applicable in Obsidian                 |

---

## Priority matrix for plugin compatibility

Ranked by verified call sites across the nine analyzed plugins, weighted by implementation cost. Implementing from the top down maximizes plugin compatibility per unit of effort.

### Completed slate (all nine shipped)

Every item from the previous recommended slate is implemented. Retained for provenance.

| #   | Work item                                                                                | Dependent plugins (not compatibility proof)                        | Status              |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| 1   | `operatorfunc` via `vim.o`, `vim.go`, `nvim_get/set_option`, `nvim_get/set_option_value` | mini.ai, mini.surround, mini.comment, nvim-surround, Comment.nvim  | ✅                  |
| 2   | `vim.o` / `vim.go` shadow store for unmapped globals                                     | mini.ai, mini.surround, flash                                      | ✅                  |
| 3   | Real `vim.iter`                                                                          | mini.ai, mini.surround, nvim-autopairs                             | ✅                  |
| 4   | `nvim_win_call` / `nvim_buf_call` for handle `0`                                         | flash                                                              | ✅                  |
| 5   | `nvim_win_get_config` for handle `0`                                                     | flash, leap                                                        | ✅                  |
| 6   | Real `vim.fn.getwininfo()`                                                               | flash, leap                                                        | ✅                  |
| 7   | Real `nvim_replace_termcodes`                                                            | mini.ai, mini.pairs, nvim-surround, nvim-autopairs                 | ✅                  |
| 8   | `vim.on_key`                                                                             | flash                                                              | ⚠️ pre-mapping only |
| 9   | `query.get()` `.scm` resolution + bundled textobjects queries                            | mini.ai, mini.surround, nvim-surround, nvim-treesitter-textobjects | ✅                  |

#### `vim.on_key` parity gap

The registry, namespace allocation, replacement, removal and teardown are complete, and dispatch reuses the existing `GlobalKeyHandler` observation point rather than adding a competing global listener. But it observes **physical, pre-mapping** input, whereas Neovim's `on_key` fires **post-mapping**. Consequences:

- Mapped expansions and programmatic `feedkeys` are not separately observed.
- Callback return values cannot discard keys.
- Both callback arguments carry the same physical input.

Closing this requires changing key processing itself, which was judged too high-risk for the value.

### Next candidates

| Work item                                                        | Plugins                       | Effort        | Notes                                                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audited mini.surround / mini.splitjoin prerequisites             | mini.surround, mini.splitjoin | Separate plan | Both BLOCKED; see current blocker lists above. Phases 6/7 cancelled, not integration success.                                                                   |
| Floating-window APIs (`nvim_open_win`)                           | —                             | Large         | Deferred. No API work unblocks flash.nvim: LuaJIT FFI is terminal (`module 'ffi' is not available`), proven by `test/specs/lua-plugin-flash-diagnostic.e2e.ts`. |
| Extmark `sign_text` / `conceal` / `virt_lines` / `line_hl_group` | —                             | Separate plan | Not populated from Lua; column byte semantics also deferred.                                                                                                    |
| Extmark visual precedence                                        | —                             | Separate plan | Priority sorting is already implemented; CM6 nesting still controls visible overlap.                                                                            |

#### Completed since the previous revision

`nvim_set_decoration_provider` is **already implemented at `src/lua/api.ts:2957-2996`** (pre-coordinate source anchor): registers `on_start`/`on_buf`/`on_win`/`on_end`, rejects `on_line`/`on_range`. This corrects the stale Next candidates row; it is not a claim that flash only uses `on_start`.

The enumerated byte-offset/column APIs and synthetic current-window APIs are implemented; `hl_eol` parsing and extmark priority sorting were already implemented. None establishes third-party plugin compatibility beyond executed operations.

| Work item                                                                      | Plugins                     | Status |
| ------------------------------------------------------------------------------ | --------------------------- | ------ |
| Tier-3 → tier-2 conversion for every plugin-called name (incl. `nvim__redraw`) | flash, leap, mini.*         | ✅     |
| `strchars` / `charidx` / `byteidx`                                             | flash, mini.pairs           | ✅     |
| `wincol()` / `winlayout()`                                                     | leap, flash                 | ✅     |
| `vim.bo.iminsert` / `vim.bo.fileformat`                                        | flash, leap, nvim-surround  | ✅     |
| `vim.bo` writes round-trip (`setBufferOption` was a no-op)                     | nvim-surround, Comment.nvim | ✅     |
| Real `vim.wo` with CM6-backed `wrap` and global fallback                       | leap                        | ✅     |

Still deferred: multi-window/tabpage handles, `vim.fs`, `vim.ui`, `vim.lpeg` / `vim.re`, `vim.base64` / `vim.text` / `vim.spell` / `vim.secure`.

### Historical tiers

Retained for provenance. Struck-through items are complete.

### Tier 1 — Unblocks 3+ plugins

| Function                                     | Plugins needing it                                                   |
| -------------------------------------------- | -------------------------------------------------------------------- |
| ~~`vim.fn.getcharstr()`~~                    | ~~mini.surround, mini.ai, leap, nvim-surround~~ (Now implemented)    |
| ~~`vim.fn.searchpos()`~~                     | ~~flash, nvim-surround, leap~~ (Now implemented)                     |
| ~~`vim.fn.winsaveview()` / `winrestview()`~~ | ~~flash, nvim-surround~~ (Now implemented)                           |
| ~~`vim.fn.visualmode()`~~                    | ~~Comment.nvim, nvim-autopairs, nvim-surround~~ (Now implemented ⚠️) |
| ~~`nvim_buf_clear_namespace()`~~             | ~~flash, leap~~ (Now implemented)                                    |
| ~~`nvim_set_extmark()`~~                     | ~~flash, leap, nvim-surround~~ (Now implemented ⚠️)                  |

### Tier 2 — Unblocks 2 plugins

| Function                           | Plugins needing it                                    |
| ---------------------------------- | ----------------------------------------------------- |
| ~~`nvim_buf_get_extmarks()`~~      | ~~flash, nvim-surround~~ (Now implemented ⚠️)         |
| ~~`nvim_get_vvar()`~~              | ~~mini.comment, Comment.nvim~~ (Now implemented)      |
| ~~`vim.fn.getwininfo()`~~          | flash, leap (Now implemented)                         |
| ~~`vim.fn.input()`~~               | ~~nvim-surround~~ (Now implemented ⚠️)                |
| ~~`vim.fn.foldclosed()`~~          | ~~flash~~ (Now implemented)                           |
| ~~`vim.validate()`~~               | ~~nvim-surround, mini.*~~ (Now implemented)           |
| ~~`vim.o` (global options proxy)~~ | ~~nvim-surround, mini.comment~~ (Already implemented) |

### Tier 3 — Enables specific plugins

| Function                                         | Plugin needing it                                              |
| ------------------------------------------------ | -------------------------------------------------------------- |
| ~~`vim.fn.maparg()`~~                            | ~~leap, mini.ai, mini.pairs~~ (Now implemented ⚠️)             |
| `vim.fn.mapcheck()`                              | leap only — unused by the other eight plugins                  |
| ~~`vim.fn.byte2line()` / `line2byte()`~~         | nvim-surround (Now implemented)                                |
| ~~`vim.fn.strcharpart()`~~                       | ~~mini.surround, flash~~ (Now implemented)                     |
| ~~`vim.fn.strdisplaywidth()`~~                   | ~~nvim-surround~~ (Now implemented ⚠️)                         |
| ~~`vim.fn.getcmdtype()`~~                        | ~~flash~~ (Not a blocker — stub returns the correct value)     |
| ~~`vim.fn.reg_recording()` / `reg_executing()`~~ | ~~flash~~ (Not a blocker — stub returns the correct value)     |
| `vim.go.operatorfunc`                            | nvim-surround (see item 1 in the recommended slate)            |
| `vim.treesitter.query.get()` file loading        | nvim-surround; partially mini.ai / mini.surround (opt-in only) |

---

## Summary

The API/fn counts are enforced by `test/unit/lua/api-status-counts.test.ts`, which reuses the TypeScript-AST inventory from `api-inventory.ts`, checks exact handler/status membership, and groups duplicate signatures by canonical name. The public API subtotal includes public missing/N/A rows, including compatibility names, but excludes private `nvim__redraw`; it is **not** the all-registered denominator. The pre-work public implemented subtotal was 48 + 15 = 63, not the stale 46 + 14 = 60. Other namespace summaries remain descriptive inventories rather than AST-guarded registries.

Public names outside the registry: `nvim_ui_attach`, `nvim_ui_detach`, `nvim_ui_pum_set_bounds`, `nvim_ui_pum_set_height`, `nvim_ui_send`, `nvim_ui_set_focus`, `nvim_ui_set_option`, `nvim_ui_try_resize`, `nvim_ui_try_resize_grid`. They remain in the public N/A denominator, not silently dropped. `system`/`systemlist` are intentional rejecting fn stubs, included in registration totals despite the N/A status.

| Category                                      | ✅ Impl | ⚠️ Limited | 🔲 Stub | ❌ Missing | 🚫 N/A |
| --------------------------------------------- | ------- | ---------- | ------- | ---------- | ------ |
| `vim.api.nvim_*` (public)                     | 45      | 24         | 87      | 0          | 9      |
| `vim.fn.*`                                    | 81      | 11         | 37      | 0          | 2      |
| `vim.tbl_*` / core utils (grouped rows)       | 84      | 5          | 7       | 9          | 4      |
| `vim.treesitter.*` (all sub-namespaces)       | 84      | 4          | 6       | 3          | 0      |
| `vim.fs.*`                                    | 0       | 0          | 15      | 0          | 0      |
| `vim.version.*`                               | 11      | 0          | 0       | 0          | 0      |
| `vim.snippet.*`                               | 0       | 0          | 0       | 4          | 0      |
| `vim.filetype.*`                              | 1       | 0          | 0       | 2          | 0      |
| `vim.hl.*`                                    | 0       | 0          | 2       | 0          | 0      |
| `vim.ui.*`                                    | 2       | 1          | 1       | 2          | 0      |
| `vim.health.*`                                | 0       | 0          | 5       | 0          | 0      |
| `vim.loader.*`                                | 0       | 0          | 3       | 0          | 0      |
| `vim.lpeg.*` / `vim.re.*`                     | 0       | 0          | 10      | 0          | 0      |
| `vim.text.*` / `vim.base64.*` / `vim.spell.*` | 0       | 0          | 7       | 0          | 0      |
| `vim.glob.*`                                  | 0       | 0          | 1       | 0          | 0      |
| `vim.secure.*`                                | 0       | 0          | 2       | 0          | 0      |
| `vim.pos` / `vim.range`                       | 0       | 0          | 0       | 2          | 0      |
| Unlisted surface used by real plugins         | 12      | 0          | 12      | 0          | 0      |
| `vim.lsp.*`                                   | 0       | 0          | 0       | 0          | ~51    |
| `vim.diagnostic.*`                            | 0       | 0          | 0       | 0          | 21     |

### Registration totals (authoritative, from source)

The core-utility row counts the 116 grouped rows in that section, not individual overloads/methods. Its five displayed categories account for 109 rows; the remaining **7 are 🔇 silent placeholders**, listed by name above, not warn-once stubs. Five formerly silent string-coordinate helpers are now real. This grouped-row denominator is separate from the API/fn canonical-name inventories.

| Registry             | Real implementations | Registered stubs | Total registered | Behavior outside the registry |
| -------------------- | -------------------- | ---------------- | ---------------- | ----------------------------- |
| `vim.api` (`api.ts`) | 69                   | 88               | 157              | Lua error                     |
| `vim.fn` (`fn.ts`)   | 92                   | 39               | 131              | Lua error                     |

Generic namespace stubs cover 15 namespaces: `fs`, `snippet`, `hl`, `health`, `loader`, `lpeg`, `re`, `glob`, `text`, `base64`, `spell`, `secure`, `pos`, `range`, `iter`. Both `snippet` and `iter` are subsequently replaced by real implementations, leaving 13 effectively stubbed.

**Based on Neovim 0.12.5** (golden test version, recorded 2026-09-01).

**Total Neovim 0.12 API surface**: ~400+ functions across ~30 namespaces.
No cross-namespace grand total is claimed: grouped methods, aliases and subsequently replaced namespace stubs use different denominators. Use the source-guarded API/fn totals above. The seven audited silent string/URI placeholders (🔇) are distinct from warn-once stubs (🔲), and the plugin audit explicitly records missing/blocked demands rather than claiming none are called.
