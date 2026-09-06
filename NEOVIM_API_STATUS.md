# Neovim API implementation status

This document tracks the implementation status of every Neovim API function in the plugin's Lua subsystem, based on **Neovim 0.12.5** (the version used for golden test recording). Use it to identify gaps, prioritize work, and measure progress toward plugin compatibility.

Every function listed here exists in Neovim 0.12. Functions not yet implemented are generally registered as stubs so a plugin that calls them does not crash outright — but see the note below on why a stub is not automatically the safer choice.

**Legend:**

| Symbol | Meaning                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------- |
| ✅     | Fully implemented                                                                              |
| ⚠️     | Implemented with limitations (see notes)                                                       |
| 🔲     | **Registered stub** — callable, warns once, returns a type-shaped placeholder. Does not error. |
| ❌     | **Not registered** — calling it raises a Lua error                                             |
| 🚫     | Not applicable (no Obsidian equivalent)                                                        |

> [!important]
> `🔲` and `❌` are very different failure modes. A `🔲` stub returns a plausible-looking value (`0`, `''`, `{}`, `false`, `nil`), so a plugin calling it **silently misbehaves** rather than failing loudly. For example, `vim.fn.search()` returns `0`, which is indistinguishable from "pattern not found" — a plugin relying on it silently finds nothing. When triaging a plugin that "does nothing", check the console for `is not implemented` warnings before assuming the API is missing.

## How dispatch works

Both `vim.api` and `vim.fn` resolve names through a metatable with three tiers. Knowing which tier a function falls into tells you what happens when a plugin calls it.

**`vim.api`** (`src/lua/api.ts:3605-3663`):

| Tier | Membership                                       | Count | Behavior                                                  |
| ---- | ------------------------------------------------ | ----- | --------------------------------------------------------- |
| 1    | `SUPPORTED_NVIM_API_FUNCTIONS`                   | 60    | Real implementation                                       |
| 2    | `KNOWN_NVIM_API_FUNCTIONS` minus tier 1          | 96    | Warn once, return placeholder per `NVIM_API_RETURN_TYPES` |
| 3    | Anything else (e.g. `nvim_ui_*`, `nvim__redraw`) | —     | `luaL_error` listing the supported set                    |

`KNOWN_NVIM_API_FUNCTIONS` holds 156 names total.

**`vim.fn`** (`src/lua/fn.ts:1631-1650`):

| Tier | Membership          | Count | Behavior                                      |
| ---- | ------------------- | ----- | --------------------------------------------- |
| 1    | `registry.set(...)` | 79    | Real implementation                           |
| 2    | `registerStub(...)` | 37    | Warn once, return `''` / `0` / `{}`, or throw |
| 3    | Anything else       | —     | `errorUnsupported` — raises a Lua error       |

116 `vim.fn` names are registered in total. `getchar`, `getcharstr`, and `input` are registered only when the async coroutine runner is available.

**Adding a function** is cheap in both cases: replace the stub registration with a real handler. For `vim.api`, also add the name to `SUPPORTED_NVIM_API_FUNCTIONS`. The lookup machinery never needs to change.

**Plugin demand** is based on verified call sites in the source of the plugins analyzed (mini.comment, mini.surround, mini.pairs, mini.ai, nvim-autopairs, Comment.nvim, flash.nvim, leap.nvim, nvim-surround) — not on estimates.

> [!note]
> Only **mini.comment** is proven to load and run end-to-end inside the embedded runtime (`test/specs/lua-plugin-mini-comment.e2e.ts`). **nvim-surround** is validated as an _external golden reference_ via headless Neovim (`test/specs/vim-builtin/surround-golden.e2e.ts`) — the plugin itself does not run under the shim. Every other plugin named in this document is analysis-only.

---

## vim.api (nvim\_\* functions)

### Global functions

| Function                                                    | Status | Notes                                                  | Plugin demand                       |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------ | ----------------------------------- |
| `nvim_chan_send(chan, data)`                                | 🔲     |                                                        | 🚫 RPC only                         |
| `nvim_create_buf(listed, scratch)`                          | 🔲     | No multi-buffer model                                  | Low                                 |
| `nvim_del_current_line()`                                   | ✅     |                                                        | Low                                 |
| `nvim_del_keymap(mode, lhs)`                                | ✅     | Subset of modes                                        | Low                                 |
| `nvim_del_mark(name)`                                       | 🔲     | Uppercase/file marks                                   | Low                                 |
| `nvim_del_var(name)`                                        | 🔲     |                                                        | Low                                 |
| `nvim_echo(chunks, history, opts)`                          | ⚠️     | Highlight groups ignored (plain text only)             | Medium (flash, leap, mini.surround) |
| `nvim_eval(expr)`                                           | 🔲     | Requires Vimscript eval                                | Low                                 |
| `nvim_eval_statusline(str, opts)`                           | 🔲     |                                                        | Low                                 |
| `nvim_exec_lua(code, args)`                                 | 🔲     | RPC only                                               | 🚫                                  |
| `nvim_feedkeys(keys, mode, escape_ks)`                      | ⚠️     | Only `'n'` and `'m'` mode flags                        | Medium (flash, leap)                |
| `nvim_get_all_options_info()`                               | 🔲     |                                                        | Low                                 |
| `nvim_get_api_info()`                                       | 🔲     |                                                        | Low                                 |
| `nvim_get_autocmds(opts)`                                   | 🔲     |                                                        | Low                                 |
| `nvim_get_chan_info(chan)`                                  | 🔲     |                                                        | 🚫                                  |
| `nvim_get_color_by_name(name)`                              | 🔲     |                                                        | Low                                 |
| `nvim_get_color_map()`                                      | 🔲     |                                                        | Low                                 |
| `nvim_get_commands(opts)`                                   | 🔲     |                                                        | Low                                 |
| `nvim_get_context(opts)`                                    | 🔲     |                                                        | Low                                 |
| `nvim_get_current_buf()`                                    | ✅     | Returns 0                                              | Medium                              |
| `nvim_get_current_line()`                                   | ✅     |                                                        | Low                                 |
| `nvim_get_current_tabpage()`                                | ✅     | Returns 0                                              | Low                                 |
| `nvim_get_current_win()`                                    | ✅     | Returns 0                                              | Medium (flash, leap)                |
| `nvim_get_hl(ns, opts)`                                     | ⚠️     | ns must be 0                                           | Low                                 |
| `nvim_get_hl_id_by_name(name)`                              | 🔲     |                                                        | Low                                 |
| `nvim_get_hl_ns(opts)`                                      | 🔲     |                                                        | Low                                 |
| `nvim_get_keymap(mode)`                                     | ✅     |                                                        | Low                                 |
| `nvim_get_mark(name)`                                       | 🔲     | Global marks                                           | Low                                 |
| `nvim_get_mode()`                                           | ✅     | Returns `{mode, blocking}` table                       | Low                                 |
| `nvim_get_namespaces()`                                     | 🔲     |                                                        | Low                                 |
| `nvim_get_option_value(name, opts)`                         | ⚠️     | opts scope ignored                                     | Low                                 |
| `nvim_get_proc(pid)`                                        | 🔲     |                                                        | 🚫                                  |
| `nvim_get_proc_children(pid)`                               | 🔲     |                                                        | 🚫                                  |
| `nvim_get_runtime_file(name, all)`                          | 🔲     |                                                        | Low                                 |
| `nvim_get_var(name)`                                        | 🔲     |                                                        | Low                                 |
| `nvim_get_vvar(name)`                                       | ✅     |                                                        | Medium (mini.comment, Comment.nvim) |
| `nvim_input(keys)`                                          | 🔲     |                                                        | Low                                 |
| `nvim_input_mouse(button, action, mod, grid, row, col)`     | 🔲     |                                                        | 🚫                                  |
| `nvim_list_bufs()`                                          | 🔲     |                                                        | Low                                 |
| `nvim_list_chans()`                                         | 🔲     |                                                        | 🚫                                  |
| `nvim_list_runtime_paths()`                                 | 🔲     |                                                        | Low                                 |
| `nvim_list_tabpages()`                                      | 🔲     |                                                        | Low                                 |
| `nvim_list_uis()`                                           | 🔲     |                                                        | 🚫                                  |
| `nvim_list_wins()`                                          | ✅     | Returns `{0}`                                          | Medium (flash multi-window)         |
| `nvim_load_context(dict)`                                   | 🔲     |                                                        | Low                                 |
| `nvim_open_tabpage(opts)`                                   | 🔲     |                                                        | Low                                 |
| `nvim_open_term(buf, opts)`                                 | 🔲     |                                                        | 🚫                                  |
| `nvim_open_win(buf, enter, config)`                         | 🔲     | Floating windows                                       | Low                                 |
| `nvim_parse_cmd(str, opts)`                                 | 🔲     |                                                        | Low                                 |
| `nvim_parse_expression(expr, flags, hl)`                    | 🔲     |                                                        | Low                                 |
| `nvim_paste(data, crlf, phase)`                             | 🔲     |                                                        | Low                                 |
| `nvim_put(lines, type, after, follow)`                      | 🔲     |                                                        | Low                                 |
| `nvim_replace_termcodes(str, from_part, do_lt, special)`    | ✅     | Real Neovim byte encoding; see note on `nvim_feedkeys` | Medium (mini.pairs, nvim-surround)  |
| `nvim_select_popupmenu_item(item, insert, finish, opts)`    | 🔲     |                                                        | 🚫                                  |
| `nvim_set_client_info(name, version, type, methods, attrs)` | 🔲     |                                                        | 🚫                                  |
| `nvim_set_current_buf(buf)`                                 | 🔲     |                                                        | Low                                 |
| `nvim_set_current_dir(dir)`                                 | 🔲     |                                                        | Low                                 |
| `nvim_set_current_line(line)`                               | ✅     |                                                        | Low                                 |
| `nvim_set_current_tabpage(tabpage)`                         | 🔲     |                                                        | Low                                 |
| `nvim_set_current_win(win)`                                 | 🔲     |                                                        | Low                                 |
| `nvim_set_decoration_provider(ns, opts)`                    | 🔲     |                                                        | Low                                 |
| `nvim_set_hl(ns, name, val)`                                | ⚠️     | ns must be 0                                           | Medium (flash, mini.surround)       |
| `nvim_set_hl_ns(ns)`                                        | 🔲     |                                                        | Low                                 |
| `nvim_set_hl_ns_fast(ns)`                                   | 🔲     |                                                        | Low                                 |
| `nvim_set_keymap(mode, lhs, rhs, opts)`                     | ✅     | Subset of modes                                        | Medium                              |
| `nvim_set_option_value(name, value, opts)`                  | ⚠️     | opts scope ignored                                     | Low                                 |
| `nvim_set_var(name)`                                        | 🔲     |                                                        | Low                                 |
| `nvim_set_vvar(name, value)`                                | ⚠️     | Only `searchforward` and `char` writable               | Low                                 |
| `nvim_strwidth(text)`                                       | ✅     | With CJK wide char support                             | Low                                 |

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

| Function                                             | Status | Notes                                                  | Plugin demand                        |
| ---------------------------------------------------- | ------ | ------------------------------------------------------ | ------------------------------------ |
| `nvim_buf_attach(buf, send_buffer, opts)`            | 🔲     |                                                        | Low                                  |
| `nvim_buf_call(buf, fun)`                            | ✅     | buf must be 0; invokes the function directly           | Low                                  |
| `nvim_buf_delete(buf, opts)`                         | 🔲     |                                                        | Low                                  |
| `nvim_buf_detach(buf)`                               | 🔲     |                                                        | Low                                  |
| `nvim_buf_get_changedtick(buf)`                      | 🔲     |                                                        | Low                                  |
| `nvim_buf_get_commands(buf, opts)`                   | 🔲     | Deprecated                                             | Low                                  |
| `nvim_buf_get_lines(buf, start, end, strict)`        | ✅     | buf must be 0                                          | High (5+ plugins)                    |
| `nvim_buf_get_mark(buf, name)`                       | ⚠️     | Returns char offsets (not byte offsets); buf must be 0 | Medium (mini.comment, nvim-surround) |
| `nvim_buf_get_name(buf)`                             | ✅     | buf must be 0                                          | Low                                  |
| `nvim_buf_get_offset(buf, index)`                    | 🔲     | Byte offset of line                                    | Low                                  |
| `nvim_buf_get_text(buf, sr, sc, er, ec, opts)`       | ✅     | buf must be 0                                          | Low                                  |
| `nvim_buf_get_var(buf, name)`                        | ✅     | buf must be 0                                          | Medium (nvim-autopairs)              |
| `nvim_buf_is_loaded(buf)`                            | 🔲     |                                                        | Low                                  |
| `nvim_buf_is_valid(buf)`                             | ✅     | Returns true for buf 0                                 | Medium (flash, leap)                 |
| `nvim_buf_line_count(buf)`                           | ✅     | buf must be 0                                          | Medium (mini.comment, mini.surround) |
| `nvim_buf_set_lines(buf, start, end, strict, lines)` | ✅     | buf must be 0                                          | High (5+ plugins)                    |
| `nvim_buf_set_mark(buf, name, line, col, opts)`      | ✅     | buf must be 0                                          | Low                                  |
| `nvim_buf_set_name(buf, name)`                       | 🔲     |                                                        | Low                                  |
| `nvim_buf_set_text(buf, sr, sc, er, ec, lines)`      | ✅     | buf must be 0                                          | Medium (nvim-surround)               |
| `nvim_buf_set_var(buf, name)`                        | ✅     | buf must be 0                                          | Medium (nvim-autopairs)              |
| `nvim_buf_del_mark(buf, name)`                       | ✅     | buf must be 0                                          | Low                                  |
| `nvim_buf_del_var(buf, name)`                        | 🔲     |                                                        | Low                                  |

### Deprecated buffer functions (still must be stubbed)

| Function                                                | Status | Notes                                  | Plugin demand |
| ------------------------------------------------------- | ------ | -------------------------------------- | ------------- |
| `nvim_buf_get_option(buf, name)`                        | ⚠️     | Deprecated compat alias; buf must be 0 | Low           |
| `nvim_buf_set_option(buf, name, value)`                 | ⚠️     | Deprecated compat alias; buf must be 0 | Low           |
| `nvim_buf_add_highlight(buf, ns, hl, line, start, end)` | 🔲     | Deprecated in favor of extmarks        | Low           |

### Extmark operations

| Function                                           | Status | Notes                                                             | Plugin demand                     |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------- | --------------------------------- |
| `nvim_buf_set_extmark(buf, ns, line, col, opts)`   | ⚠️     | hl_group, virt_text (overlay/eol/inline), priority; buf must be 0 | High (flash, leap, nvim-surround) |
| `nvim_buf_get_extmarks(buf, ns, start, end, opts)` | ⚠️     | limit, details supported; buf must be 0                           | Medium (flash, nvim-surround)     |
| `nvim_buf_get_extmark_by_id(buf, ns, id, opts)`    | ✅     | buf must be 0                                                     | Medium (flash, nvim-surround)     |
| `nvim_buf_del_extmark(buf, ns, id)`                | ✅     | buf must be 0                                                     | Medium (flash, nvim-surround)     |
| `nvim_buf_clear_namespace(buf, ns, start, end)`    | ✅     | buf must be 0                                                     | High (flash, leap)                |

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

| Function                           | Status | Notes                                                          | Plugin demand                     |
| ---------------------------------- | ------ | -------------------------------------------------------------- | --------------------------------- |
| `nvim_win_call(win, fun)`          | ✅     | win must be 0; invokes the function directly                   | Medium (flash)                    |
| `nvim_win_close(win, force)`       | 🔲     |                                                                | Low                               |
| `nvim_win_del_var(win, name)`      | 🔲     |                                                                | Low                               |
| `nvim_win_get_buf(win)`            | ✅     | win must be 0; returns 0                                       | Low                               |
| `nvim_win_get_config(win)`         | ✅     | win must be 0; reports a non-floating window (`relative = ''`) | Medium (flash, leap)              |
| `nvim_win_get_cursor(win)`         | ✅     | win must be 0                                                  | High (flash, leap, nvim-surround) |
| `nvim_win_get_height(win)`         | 🔲     |                                                                | Low                               |
| `nvim_win_get_number(win)`         | 🔲     |                                                                | Low                               |
| `nvim_win_get_position(win)`       | 🔲     |                                                                | Low                               |
| `nvim_win_get_tabpage(win)`        | 🔲     |                                                                | Low                               |
| `nvim_win_get_var(win, name)`      | 🔲     |                                                                | Low                               |
| `nvim_win_get_width(win)`          | 🔲     |                                                                | Low                               |
| `nvim_win_hide(win)`               | 🔲     |                                                                | Low                               |
| `nvim_win_is_valid(win)`           | 🔲     |                                                                | Low                               |
| `nvim_win_set_buf(win, buf)`       | 🔲     |                                                                | Low                               |
| `nvim_win_set_config(win, config)` | 🔲     |                                                                | Low                               |
| `nvim_win_set_cursor(win, pos)`    | ✅     | win must be 0                                                  | High (flash, nvim-surround)       |
| `nvim_win_set_height(win, h)`      | 🔲     |                                                                | Low                               |
| `nvim_win_set_hl_ns(win, ns)`      | 🔲     |                                                                | Low                               |
| `nvim_win_set_var(win, name, val)` | 🔲     |                                                                | Low                               |
| `nvim_win_set_width(win, w)`       | 🔲     |                                                                | Low                               |
| `nvim_win_text_height(win, opts)`  | 🔲     |                                                                | Low                               |

### Deprecated window functions (still must be stubbed)

| Function                              | Status | Notes      | Plugin demand |
| ------------------------------------- | ------ | ---------- | ------------- |
| `nvim_win_get_option(win, name)`      | 🔲     | Deprecated | Low           |
| `nvim_win_set_option(win, name, val)` | 🔲     | Deprecated | Low           |

### Tab page operations

| Function                               | Status | Notes     | Plugin demand              |
| -------------------------------------- | ------ | --------- | -------------------------- |
| `nvim_get_current_tabpage()`           | ✅     | Returns 0 | Low                        |
| `nvim_tabpage_del_var(tab, name)`      | 🔲     |           | Low                        |
| `nvim_tabpage_get_number(tab)`         | 🔲     |           | Low                        |
| `nvim_tabpage_get_var(tab, name)`      | 🔲     |           | Low                        |
| `nvim_tabpage_get_win(tab)`            | 🔲     |           | Low                        |
| `nvim_tabpage_is_valid(tab)`           | 🔲     |           | Low                        |
| `nvim_tabpage_list_wins(tab)`          | 🔲     |           | Medium (leap cross-window) |
| `nvim_tabpage_set_var(tab, name, val)` | 🔲     |           | Low                        |
| `nvim_tabpage_set_win(tab, win)`       | 🔲     |           | Low                        |

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

### Implemented (65 functions)

| Function                           | Status | Notes                                          | Plugin demand                      |
| ---------------------------------- | ------ | ---------------------------------------------- | ---------------------------------- |
| `has(feature)`                     | ✅     | Obsidian/platform features                     | Medium                             |
| `expand(expr)`                     | ⚠️     | Only `%` with `:p`, `:t`, `:e`, `:r` modifiers | Low                                |
| `exists(name)`                     | ✅     |                                                | Low                                |
| `undotree()`                       | ✅     |                                                | Low                                |
| `localtime()`                      | ✅     |                                                | Low                                |
| `strftime(format, time?)`          | ✅     |                                                | Low                                |
| `filereadable(path)`               | ✅     |                                                | Low                                |
| `fnamemodify(path, modifier)`      | ✅     |                                                | Low                                |
| `glob(pattern)`                    | ✅     |                                                | Low                                |
| `isdirectory(path)`                | ✅     |                                                | Low                                |
| `mode()`                           | ✅     |                                                | Medium (flash, Comment.nvim)       |
| `line(expr)`                       | ✅     |                                                | Medium (leap, nvim-surround)       |
| `col(expr)`                        | ✅     |                                                | Medium (nvim-surround, leap)       |
| `getline(lnum)`                    | ✅     |                                                | Medium (leap, mini.surround)       |
| `tolower(str)`                     | ✅     |                                                | Low                                |
| `toupper(str)`                     | ✅     |                                                | Low                                |
| `trim(str)`                        | ✅     |                                                | Low                                |
| `strlen(str)`                      | ✅     |                                                | Low                                |
| `strwidth(str)`                    | ✅     |                                                | Low                                |
| `stridx(str, sub)`                 | ✅     |                                                | Low                                |
| `strridx(str, sub)`                | ✅     |                                                | Low                                |
| `strpart(str, start, len?)`        | ✅     |                                                | Low                                |
| `substitute(str, pat, sub, flags)` | ✅     |                                                | Low                                |
| `nr2char(nr)`                      | ✅     |                                                | Low                                |
| `char2nr(char)`                    | ✅     |                                                | Low                                |
| `getreg(name?)`                    | ✅     |                                                | Low                                |
| `setreg(name, value, opts?)`       | ✅     |                                                | Low                                |
| `getregtype(name?)`                | ✅     |                                                | Low                                |
| `setline(lnum, text)`              | ✅     |                                                | Low                                |
| `append(lnum, text)`               | ✅     |                                                | Low                                |
| `indent(lnum)`                     | ✅     |                                                | Low (mini.surround, nvim-surround) |
| `nextnonblank(lnum)`               | ✅     |                                                | Low (mini.surround)                |
| `prevnonblank(lnum)`               | ✅     |                                                | Low                                |
| `getpos(expr)`                     | ✅     |                                                | Medium (leap)                      |
| `setpos(expr, list)`               | ✅     |                                                | Low                                |
| `cursor(lnum, col)`                | ✅     |                                                | Medium (nvim-surround, leap)       |
| `getcurpos()`                      | ✅     |                                                | Low                                |
| `type(expr)`                       | ✅     |                                                | Low                                |
| `len(expr)`                        | ✅     |                                                | Low                                |
| `empty(expr)`                      | ✅     |                                                | Low                                |
| `matchstr(str, pat)`               | ✅     |                                                | Low (leap)                         |
| `match(str, pat)`                  | ✅     |                                                | Low                                |
| `matchlist(str, pat)`              | ✅     |                                                | Low                                |
| `escape(str, chars)`               | ✅     |                                                | Low                                |
| `repeat(expr, count)`              | ✅     |                                                | Low                                |
| `reverse(list_or_str)`             | ✅     |                                                | Low                                |
| `range(start, end?, stride?)`      | ✅     |                                                | Low                                |
| `sort(list, func?)`                | ✅     |                                                | Low                                |
| `uniq(list)`                       | ✅     |                                                | Low                                |
| `max(list)`                        | ✅     |                                                | Low                                |
| `min(list)`                        | ✅     |                                                | Low                                |
| `abs(expr)`                        | ✅     |                                                | Low                                |
| `index(list, expr)`                | ✅     |                                                | Low                                |
| `count(list, expr)`                | ✅     |                                                | Low                                |
| `add(list, item)`                  | ✅     |                                                | Low                                |
| `remove(list, idx)`                | ✅     |                                                | Low                                |
| `extend(list, other)`              | ✅     |                                                | Low                                |
| `copy(expr)`                       | ✅     |                                                | Low                                |
| `deepcopy(expr)`                   | ✅     |                                                | Low                                |
| `keys(dict)`                       | ✅     |                                                | Low                                |
| `values(dict)`                     | ✅     |                                                | Low                                |
| `items(dict)`                      | ✅     |                                                | Low                                |
| `flatten(list, maxdepth?)`         | ✅     |                                                | Low (nvim-autopairs)               |
| `split(str, pat?, keepempty?)`     | ✅     |                                                | Low                                |
| `join(list, sep?)`                 | ✅     |                                                | Low                                |

### Not implemented (high demand from plugins)

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

### Not implemented (medium demand from plugins)

| Function                             | Status | Notes                                          | Plugin demand                      |
| ------------------------------------ | ------ | ---------------------------------------------- | ---------------------------------- |
| `maparg(name, mode?, abbr?, dict?)`  | ⚠️     | Returns buffer-local maps only; limited fields | Medium (leap)                      |
| `mapcheck(name, mode?, abbr?)`       | 🔲     | Check mapping conflicts                        | Low (leap)                         |
| `hasmapto(what, mode?, abbr?)`       | 🔲     | Check if mapping exists                        | Low (leap)                         |
| `getchar()`                          | ✅     | Async via coroutine runner                     | Low                                |
| `strcharpart(str, start, len?)`      | ✅     | Unicode code-point aware                       | Low (mini.surround, flash)         |
| `strdisplaywidth(str)`               | ⚠️     | Simplified; no full Unicode East Asian Width   | Low (nvim-surround)                |
| `byte2line(byte)`                    | 🔲     | Byte offset to line number                     | Low (nvim-surround)                |
| `line2byte(lnum)`                    | 🔲     | Line number to byte offset                     | Low (nvim-surround)                |
| `search(pattern, flags?, stopline?)` | 🔲     | Search for pattern                             | Low (leap)                         |
| `win_getid(winnr?, tabnr?)`          | 🔲     | Get window ID                                  | Low (leap)                         |
| `getcmdtype()`                       | 🔲     | Current command-line type                      | Low (flash)                        |
| `reg_recording()`                    | 🔲     | Currently recording register                   | Low (flash)                        |
| `reg_executing()`                    | 🔲     | Currently executing register                   | Low (flash)                        |
| `shiftwidth()`                       | ✅     | Effective shiftwidth                           | Low (mini.surround, nvim-surround) |

### Not implemented (low demand / not applicable)

| Function                                  | Status | Notes                   | Plugin demand  |
| ----------------------------------------- | ------ | ----------------------- | -------------- |
| `getbufline(buf, lnum, end?)`             | 🔲     |                         | Low            |
| `setbufline(buf, lnum, text)`             | 🔲     |                         | Low            |
| `deletebufline(buf, first, last?)`        | 🔲     |                         | Low            |
| `bufnr(expr?)`                            | 🔲     |                         | Low            |
| `bufname(expr?)`                          | 🔲     |                         | Low            |
| `buflisted(buf)`                          | 🔲     |                         | Low            |
| `bufexists(buf)`                          | 🔲     |                         | Low            |
| `winnr(expr?)`                            | 🔲     |                         | Low            |
| `tabpagenr(expr?)`                        | 🔲     |                         | Low            |
| `changenr()`                              | 🔲     |                         | Low            |
| `virtcol(expr)`                           | 🔲     | Virtual column number   | Low (leap)     |
| `charcol(expr)`                           | 🔲     |                         | Low            |
| `screencol()`                             | 🔲     |                         | Low            |
| `screenrow()`                             | 🔲     |                         | Low            |
| `synID(lnum, col, trans)`                 | 🔲     |                         | Low            |
| `synIDattr(id, what, mode?)`              | 🔲     |                         | Low            |
| `synIDtrans(id)`                          | 🔲     |                         | Low            |
| `complete(startcol, matches)`             | 🔲     |                         | Low            |
| `pumvisible()`                            | 🔲     |                         | Low            |
| `confirm(msg, choices?, default?, type?)` | 🔲     |                         | Low            |
| `feedkeys(keys, mode?, escape_ks?)`       | 🔲     | Use `nvim_feedkeys`     | Low            |
| `system(cmd, input?)`                     | 🚫     | No shell access         | Not applicable |
| `systemlist(cmd, input?)`                 | 🚫     | No shell access         | Not applicable |
| `execute(cmd)`                            | 🔲     |                         | Low            |
| `json_encode(expr)`                       | 🔲     | Use `vim.json.encode`   | Low            |
| `json_decode(str)`                        | 🔲     | Use `vim.json.decode`   | Low            |
| `printf(fmt, ...)`                        | 🔲     | Use Lua `string.format` | Low            |
| `string(expr)`                            | 🔲     |                         | Low            |

---

## vim.\* core utilities

### vim.opt / vim.o / vim.go / vim.wo / vim.bo / variable scopes

| Feature                                                   | Status | Notes                                                                                                  | Plugin demand                                      |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `vim.opt` (option proxy)                                  | ✅     | 12 Neovim-standard + 27+ plugin-specific options. `operatorfunc` works here and on `vim.o` / `vim.go`  | Medium                                             |
| `vim.opt:get()` / `vim.opt:append()` / `vim.opt:remove()` | ❌     | `vim.opt` is a plain value proxy, not an option object. These names fall through `__index` → `nil`     | Low                                                |
| `vim.opt_local`                                           | ❌     | Not registered                                                                                         | Low                                                |
| `vim.opt_global`                                          | ❌     | Not registered                                                                                         | Low                                                |
| `vim.o` (global options proxy)                            | ✅     | Engine value wins, then shadow store, then Neovim defaults. `operatorfunc` fully wired                 | High (mini.ai, mini.surround, mini.comment, flash) |
| `vim.go` (global-only options proxy)                      | ✅     | Shares the shadow store and `operatorfunc` wiring with `vim.o`                                         | Medium (nvim-surround, flash)                      |
| `vim.wo` (window options proxy)                           | 🔲     | `createWarnVarTable` — read warns and returns `nil`; write raw-stores                                  | Low                                                |
| `vim.bo` (buffer options proxy)                           | ✅     | `commentstring`, `filetype`, `expandtab`, `shiftwidth`/`tabstop`, `modifiable`, `buftype`, `textwidth` | Medium (Comment.nvim, nvim-surround)               |
| `vim.bo.commentstring`                                    | ⚠️     | Hardcoded `%% %s %%`; no treesitter-contextual detection                                               | Medium                                             |
| `vim.g` (global variables)                                | ✅     |                                                                                                        | Medium                                             |
| `vim.b` (buffer variables)                                | ✅     |                                                                                                        | Medium (nvim-autopairs)                            |
| `vim.w` (window variables)                                | 🔲     | `createWarnVarTable` — read warns and returns `nil`; write raw-stores                                  | Low                                                |
| `vim.t` (tabpage variables)                               | 🔲     | `createWarnVarTable` — read warns and returns `nil`; write raw-stores                                  | Low                                                |
| `vim.v` (v: variables)                                    | ✅     | See vim.v section below                                                                                | Medium                                             |
| `vim.env` (environment variables)                         | ✅     | Sandboxed (empty)                                                                                      | Low                                                |

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

| Function                                                  | Status | Notes                                               | Plugin demand |
| --------------------------------------------------------- | ------ | --------------------------------------------------- | ------------- |
| `vim.split(s, sep, opts?)`                                | ✅     | `{ plain, trimempty }`                              | Low           |
| `vim.gsplit(s, sep, opts?)`                               | ✅     | Iterator version of split                           | Low           |
| `vim.trim(s)`                                             | ✅     |                                                     | Low           |
| `vim.startswith(s, prefix)`                               | ✅     |                                                     | Low           |
| `vim.endswith(s, suffix)`                                 | ✅     |                                                     | Low           |
| `vim.pesc(s)`                                             | ✅     | Lua pattern escape                                  | Low           |
| `vim.stricmp(a, b)`                                       | ✅     | Case-insensitive compare                            | Low           |
| `vim.str_byteindex(s, encoding, index, strict_indexing?)` | 🔲     | Returns 0                                           | Low           |
| `vim.str_utfindex(s, encoding, index, strict_indexing?)`  | 🔲     | Returns 0                                           | Low           |
| `vim.str_utf_start(s, index)`                             | 🔲     | Returns 0                                           | Low           |
| `vim.str_utf_end(s, index)`                               | 🔲     | Returns 0                                           | Low           |
| `vim.str_utf_pos(s, encoding?)`                           | 🔲     | Returns empty table                                 | Low           |
| `vim.iconv(str, from, to)`                                | 🔲     | Returns str unchanged                               | Low           |
| `vim.keycode(str)`                                        | ✅     | Translates <CR>, <Esc>, <Space>, etc. to char codes | Low           |

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

| Function                   | Status | Notes                     | Plugin demand |
| -------------------------- | ------ | ------------------------- | ------------- |
| `vim.regex(pattern)`       | ✅     | ECMAScript RegExp wrapper | Low           |
| `:match_str(str)`          | ✅     | Returns start, end        | Low           |
| `:match_line(bufnr, lnum)` | ✅     | Alias for match_str       | Low           |
| `:match_pos(str)`          | ✅     |                           | Low           |
| `:replace(str, repl)`      | ✅     |                           | Low           |
| `:test(str)`               | ✅     |                           | Low           |

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

| Function                               | Status | Notes                  |
| -------------------------------------- | ------ | ---------------------- |
| `vim.uri_decode(str)`                  | 🔲     | Returns str unchanged  |
| `vim.uri_encode(str)`                  | 🔲     | Returns str unchanged  |
| `vim.uri_from_bufnr(bufnr)`            | 🔲     | Returns empty string   |
| `vim.uri_from_fname(path)`             | 🔲     | Returns file:// + path |
| `vim.uri_to_bufnr(uri)`                | 🔲     | Returns 0              |
| `vim.uri_to_fname(uri)`                | 🔲     | Returns uri unchanged  |
| `vim.ui_attach(ns, opts, callback)`    | ❌     |                        |
| `vim.ui_detach(ns)`                    | ❌     |                        |
| `vim.rpcnotify(channel, method, ...)`  | 🚫     | RPC only               |
| `vim.rpcrequest(channel, method, ...)` | 🚫     | RPC only               |

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

`vim.ui` is **not** in the namespace-stub list, so it is `nil` and any access raises an error rather than degrading quietly. An Obsidian-specific equivalent exists at `vim.obsidian.ui` (`src/lua/obsidian-api.ts`).

| Function                                | Status | Notes                                  |
| --------------------------------------- | ------ | -------------------------------------- |
| `vim.ui.input(opts, on_confirm)`        | ❌     | See `vim.fn.input()` (async via modal) |
| `vim.ui.open(path, opts?)`              | ❌     |                                        |
| `vim.ui.progress_status(opts?)`         | ❌     |                                        |
| `vim.ui.select(items, opts, on_choice)` | ❌     | See the plugin's picker API            |

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

These are called by the analyzed plugins but were absent from this document. They fall into dispatch **tier 3** — not registered at all, so they raise a Lua error rather than returning a placeholder. That makes them hard blockers, not soft degradations.

| Function                   | Status | Used by                       | Notes                                                     |
| -------------------------- | ------ | ----------------------------- | --------------------------------------------------------- |
| `nvim__redraw(opts)`       | ❌     | flash, leap (hot path)        | Internal Neovim API; forced redraw during label rendering |
| `vim.fn.charidx(s, idx)`   | ❌     | flash, mini.pairs             | Byte index → character index                              |
| `vim.fn.byteidx(s, idx)`   | ❌     | flash                         | Character index → byte index                              |
| `vim.fn.strchars(s)`       | ❌     | flash                         | Character count                                           |
| `vim.fn.winlayout()`       | ❌     | flash                         | Window tree; used for layout save/restore                 |
| `vim.fn.wincol()`          | ❌     | leap                          | Cursor screen column                                      |
| `vim.fn.mapset(dict)`      | ❌     | flash                         | Restore a mapping saved by `maparg()`                     |
| `vim.fn.histadd(hist, s)`  | ❌     | flash                         | Append to search history                                  |
| `vim.fn.histdel(hist, s)`  | ❌     | flash                         |                                                           |
| `vim.fn.getcmdline()`      | ❌     | flash                         | Command-line contents during `/` search integration       |
| `vim.fn.setcmdline(s)`     | ❌     | flash                         |                                                           |
| `vim.fn.getcmdpos()`       | ❌     | mini.pairs                    |                                                           |
| `vim.fn.getcmdwintype()`   | ❌     | mini.ai                       |                                                           |
| `vim.fn.wildmenumode()`    | ❌     | mini.pairs                    |                                                           |
| `vim.fn.complete_info()`   | ❌     | nvim-autopairs                |                                                           |
| `vim.bo.iminsert`          | ❌     | flash, leap                   | Buffer-local option not in the `vim.bo` set               |
| `vim.bo.fileformat`        | ❌     | nvim-surround                 | Buffer-local option not in the `vim.bo` set               |
| `vim.o.eventignore`        | ❌     | mini.ai                       | Saved/restored around every textobject call               |
| `vim.o.selection`          | ❌     | mini.ai, mini.surround, flash |                                                           |
| `vim.o.cmdheight`          | ❌     | mini.ai, mini.surround        |                                                           |
| `vim.o.columns`            | ❌     | mini.ai, mini.surround, flash | flash reads it as `vim.go.columns`                        |
| `vim.o.cpo`                | ❌     | leap                          |                                                           |
| `vim.wo.wrap`              | 🔲     | leap                          | `vim.wo` warns and returns `nil`                          |
| `vim.hl` / `vim.highlight` | 🔲     | leap                          | Generic namespace stub                                    |

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

| #   | Work item                                                                                | Plugins unblocked                                                  | Status              |
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

| Work item                                                         | Plugins                    | Effort | Notes                                                                             |
| ----------------------------------------------------------------- | -------------------------- | ------ | --------------------------------------------------------------------------------- |
| Drive **mini.surround** to a green e2e suite                      | mini.surround              | Medium | Would make it the second proven embedded plugin after mini.comment                |
| `vim.fn.byte2line()` / `line2byte()`                              | nvim-surround              | Small  | Currently `0`-returning stubs                                                     |
| Unlisted tier-3 surface (`nvim__redraw`, `charidx`, `byteidx`, …) | flash, leap                | Medium | See "Unlisted API surface used by real plugins" — these raise rather than degrade |
| `vim.bo.iminsert` / `vim.bo.fileformat`                           | flash, leap, nvim-surround | Small  | Buffer-local options missing from the `vim.bo` set                                |
| `nvim_set_decoration_provider`, floating-window APIs              | flash                      | Large  | flash's prompt and default rendering path                                         |

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
| `vim.fn.getwininfo()`              | flash, leap                                           |
| ~~`vim.fn.input()`~~               | ~~nvim-surround~~ (Now implemented ⚠️)                |
| ~~`vim.fn.foldclosed()`~~          | ~~flash~~ (Now implemented)                           |
| ~~`vim.validate()`~~               | ~~nvim-surround, mini.*~~ (Now implemented)           |
| ~~`vim.o` (global options proxy)~~ | ~~nvim-surround, mini.comment~~ (Already implemented) |

### Tier 3 — Enables specific plugins

| Function                                         | Plugin needing it                                              |
| ------------------------------------------------ | -------------------------------------------------------------- |
| ~~`vim.fn.maparg()`~~                            | ~~leap, mini.ai, mini.pairs~~ (Now implemented ⚠️)             |
| `vim.fn.mapcheck()`                              | leap only — unused by the other eight plugins                  |
| `vim.fn.byte2line()` / `line2byte()`             | nvim-surround                                                  |
| ~~`vim.fn.strcharpart()`~~                       | ~~mini.surround, flash~~ (Now implemented)                     |
| ~~`vim.fn.strdisplaywidth()`~~                   | ~~nvim-surround~~ (Now implemented ⚠️)                         |
| ~~`vim.fn.getcmdtype()`~~                        | ~~flash~~ (Not a blocker — stub returns the correct value)     |
| ~~`vim.fn.reg_recording()` / `reg_executing()`~~ | ~~flash~~ (Not a blocker — stub returns the correct value)     |
| `vim.go.operatorfunc`                            | nvim-surround (see item 1 in the recommended slate)            |
| `vim.treesitter.query.get()` file loading        | nvim-surround; partially mini.ai / mini.surround (opt-in only) |

---

## Summary

Counts are derived from the tables above and cross-checked against the registration sets in `src/lua/api.ts` and `src/lua/fn.ts`.

| Category                                      | ✅ Impl | ⚠️ Limited | 🔲 Stub | ❌ Missing | 🚫 N/A |
| --------------------------------------------- | ------- | ---------- | ------- | ---------- | ------ |
| `vim.api.nvim_*` (public)                     | 46      | 14         | 95      | 0          | 9      |
| `vim.fn.*`                                    | 74      | 5          | 35      | 0          | 2      |
| `vim.tbl_*` / core utils                      | 78      | 5          | 20      | 9          | 4      |
| `vim.treesitter.*` (all sub-namespaces)       | 84      | 4          | 6       | 3          | 0      |
| `vim.fs.*`                                    | 0       | 0          | 15      | 0          | 0      |
| `vim.version.*`                               | 11      | 0          | 0       | 0          | 0      |
| `vim.snippet.*`                               | 0       | 0          | 0       | 4          | 0      |
| `vim.filetype.*`                              | 1       | 0          | 0       | 2          | 0      |
| `vim.hl.*`                                    | 0       | 0          | 2       | 0          | 0      |
| `vim.ui.*`                                    | 0       | 0          | 0       | 4          | 0      |
| `vim.health.*`                                | 0       | 0          | 5       | 0          | 0      |
| `vim.loader.*`                                | 0       | 0          | 3       | 0          | 0      |
| `vim.lpeg.*` / `vim.re.*`                     | 0       | 0          | 10      | 0          | 0      |
| `vim.text.*` / `vim.base64.*` / `vim.spell.*` | 0       | 0          | 7       | 0          | 0      |
| `vim.glob.*`                                  | 0       | 0          | 1       | 0          | 0      |
| `vim.secure.*`                                | 0       | 0          | 2       | 0          | 0      |
| `vim.pos` / `vim.range`                       | 0       | 0          | 0       | 2          | 0      |
| Unlisted surface used by real plugins         | 0       | 0          | 2       | 22         | 0      |
| `vim.lsp.*`                                   | 0       | 0          | 0       | 0          | ~51    |
| `vim.diagnostic.*`                            | 0       | 0          | 0       | 0          | 21     |

### Registration totals (authoritative, from source)

| Registry             | Real implementations | Registered stubs | Total registered | Behavior outside the registry |
| -------------------- | -------------------- | ---------------- | ---------------- | ----------------------------- |
| `vim.api` (`api.ts`) | 60                   | 96               | 156              | Lua error                     |
| `vim.fn` (`fn.ts`)   | 79                   | 37               | 116              | Lua error                     |

Generic namespace stubs cover 15 namespaces: `fs`, `snippet`, `hl`, `health`, `loader`, `lpeg`, `re`, `glob`, `text`, `base64`, `spell`, `secure`, `pos`, `range`, `iter`. Both `snippet` and `iter` are subsequently replaced by real implementations, leaving 13 effectively stubbed.

**Based on Neovim 0.12.5** (golden test version, recorded 2026-09-01).

**Total Neovim 0.12 API surface**: ~400+ functions across ~30 namespaces.
**Real implementations**: ~295 (✅ + ⚠️).
**Registered stubs** (callable, warn once, return a placeholder): ~190 (🔲).
**Not applicable**: ~90 (🚫).
**Not registered** (raise an error when called): ~50 (❌), of which 22 are actively called by the analyzed plugins — see "Unlisted API surface used by real plugins".
