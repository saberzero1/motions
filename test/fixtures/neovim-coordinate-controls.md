# Phase 1 coordinate negative controls

Executed 2026-09-09 against baseline `713fd5f`. This records executions, not
predictions. Only Phase 1 is implemented. No expectations use `strlen`,
`strpart`, the new codec, or Lua byte operations as an oracle.

## Fixtures and commands

Every case below is in `test/unit/lua/coordinate-contract.test.ts`, under
`coordinate contract A1`. Each table row names the full case below that group
and its sole assertion. Parameter rows are separate Vitest cases: one failing
assertion cannot prevent another row from executing. Vector assertions collect
every real-handler result before comparing to a literal vector.

- **F**: `COORD_LINES = ['é→𝄞界\tZ', '', 'é→𝄞界\tZ']` (literal tab).
- **C**: F loaded, first line plus U+0301 (`'é→𝄞界\tŹ'`).
- **U**: F loaded first, then `host.loaded = false`; callbacks report zero lines.
- **E**: F loaded first, then replaced with its empty second line (`['']`).
- **S**: literal span tuples `[byteStart,byteEnd,utf16Start,utf16End]`:
  `[[0,2,0,1],[2,5,1,2],[5,9,2,4],[9,12,4,5],[12,13,5,6],[13,14,6,7]]`.
- **BU**: byte2line results for every Unix byte 0 through 32:
  `[-1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,-1]`.
- **BD**: byte2line results for every DOS byte 0 through 35:
  `[-1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,-1]`.

All commands below ran from `/home/saberzero1/Repos/motions`. Command IDs in
the records refer to these exact commands, not abbreviated instructions:

```bash
# R: red-first, extraction present but all three offset registrations still stubs
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract A1' --reporter=verbose
# S: remove first span
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'UTF-8 spans' --reporter=verbose
# L: substitute UTF-16 length
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'base bytes|composing bytes|offset ignores DOS' --reporter=verbose
# H: truncate host fixture
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'host fixture' --reporter=verbose
# D: force one-byte EOL for line2byte
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'line byte offsets honor DOS fileformat' --reporter=verbose
# B: return -1 instead of raising for offset bounds
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'offset bounds.*index' --reporter=verbose
# U: remove offset unloaded branch
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'unloaded vim.api' --reporter=verbose
```

## Red-first records (R)

Mutation: unimplemented handlers at `713fd5f`, before promotion. All three
names actually emitted their stub warnings at runtime and returned zero.
R exited **1**, with **19 failed / 11 passed**, no excluded cases.

| Full case under `coordinate contract A1`                                               | Fixture | Assertion                                              | Observed actual                                                             | Expected                               | Command / exit | Restoration |
| -------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------- | -------------- | ----------- |
| `offset ignores DOS fileformat ['unix']`                                               | F, unix | offset indices 0..3                                    | `[0,0,0,0]`                                                                 | `[0,15,16,31]`                         | R / 1          | R restored  |
| `offset ignores DOS fileformat ['dos']`                                                | F, dos  | offset indices 0..3                                    | `[0,0,0,0]`                                                                 | `[0,15,16,31]`                         | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat ['unix']`                                      | F, unix | line2byte lines 1..4                                   | `[0,0,0,0]`                                                                 | `[1,16,17,32]`                         | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat ['dos']`                                       | F, dos  | line2byte lines 1..4                                   | `[0,0,0,0]`                                                                 | `[1,17,19,35]`                         | R / 1          | R restored  |
| `byte2line includes each EOL byte ['unix']`                                            | F, unix | byte2line bytes 0..32                                  | `[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]`       | BU                                     | R / 1          | R restored  |
| `byte2line includes each EOL byte ['dos']`                                             | F, dos  | byte2line bytes 0..35                                  | `[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]` | BD                                     | R / 1          | R restored  |
| `offset bounds throw rather than return minus one [index -1]`                          | F       | Lua error contains bounds message                      | `success: 0`                                                                | contains `index out of bounds`         | R / 1          | R restored  |
| `offset bounds throw rather than return minus one [index 4]`                           | F       | Lua error contains bounds message                      | `success: 0`                                                                | contains `index out of bounds`         | R / 1          | R restored  |
| `offset bounds throw rather than return minus one [fraction]`                          | F       | index 1.5 raises integer error                         | `success: 0`                                                                | contains `integer`                     | R / 1          | R restored  |
| `offset bounds throw rather than return minus one [handle]`                            | U       | buffer 1 still raises                                  | `success: 0`                                                                | contains `buffer numbers other than 0` | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat [invalid vim.fn.line2byte(0)]`                 | F       | invalid line returns -1                                | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat [invalid vim.fn.line2byte(5)]`                 | F       | invalid line returns -1                                | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat [invalid vim.fn.line2byte(1.5)]`               | F       | noninteger line returns -1                             | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `line byte offsets honor DOS fileformat [invalid vim.fn.byte2line(1.5)]`               | F       | noninteger byte returns -1                             | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `unloaded and empty buffers are distinct [unloaded vim.api.nvim_buf_get_offset(0, 0)]` | U       | unloaded offset                                        | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `unloaded and empty buffers are distinct [unloaded vim.fn.line2byte(1)]`               | U       | unavailable line                                       | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `unloaded and empty buffers are distinct [unloaded vim.fn.byte2line(1)]`               | U       | unavailable byte                                       | `0`                                                                         | `-1`                                   | R / 1          | R restored  |
| `unloaded and empty buffers are distinct [empty unix]`                                 | E, unix | offsets; line2byte; byte2line including final boundary | `0,0;0.0,0.0;0.0,0.0`                                                       | `0,1;1,2;1,-1`                         | R / 1          | R restored  |
| `unloaded and empty buffers are distinct [empty dos]`                                  | E, dos  | offsets; line2byte; CR/LF and final boundary           | `0,0;0.0,0.0;0.0,0.0,0.0`                                                   | `0,1;1,3;1,1,-1`                       | R / 1          | R restored  |

**R restored:** implemented handlers and wired resolved option readers using
`apply_patch` (no git undo command). Re-ran exact R at 09:53:18 local:
**30 passed, exit 0**, including all previously failing assertions. Runtime
nonzero answers establish real dispatch, not merely callable-name membership.

## Existing-code extraction and precondition controls

Each mutation was applied and undone with `apply_patch`; no mutation remains.

| Full case under `coordinate contract A1`                                       | Fixture | Assertion                      | Mutation                                   | Observed actual                                            | Expected                     | Command / exit | Restoration |
| ------------------------------------------------------------------------------ | ------- | ------------------------------ | ------------------------------------------ | ---------------------------------------------------------- | ---------------------------- | -------------- | ----------- |
| `UTF-8 spans preserve astral and composing boundaries [host fixture]`          | F       | exact loaded host buffer       | H: initialize host with `lines.slice(0,2)` | `['é→𝄞界\tZ','']`                                          | `['é→𝄞界\tZ','','é→𝄞界\tZ']` | H / 1          | H restored  |
| `UTF-8 spans preserve astral and composing boundaries [span ranges]`           | F       | all byte/UTF-16 ranges equal S | S: `spans.shift()` before return           | `[[2,5,1,2],[5,9,2,4],[9,12,4,5],[12,13,5,6],[13,14,6,7]]` | S                            | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [base bytes]`            | F       | utf8Length first line          | L: return `text.length` instead of total   | `7`                                                        | `14`                         | L / 1          | L restored  |
| `UTF-8 spans preserve astral and composing boundaries [composing bytes]`       | C       | utf8Length combining variant   | L: return `text.length` instead of total   | `8`                                                        | `16`                         | L / 1          | L restored  |
| `UTF-8 spans preserve astral and composing boundaries [folded count]`          | C       | default span count             | S: `spans.shift()` before return           | `5`                                                        | `6`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [composing count]`       | C       | count-composing span count     | S: `spans.shift()` before return           | `6`                                                        | `7`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [charidx astral]`        | C       | real `charidx(s,8)`            | S: `spans.shift()` before return           | `1`                                                        | `2`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [byteidx after astral]`  | C       | real `byteidx(s,3)`            | S: `spans.shift()` before return           | `12`                                                       | `9`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [charidx folded EOL]`    | C       | real `charidx(s,16)`           | S: `spans.shift()` before return           | `5`                                                        | `6`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [charidx composing EOL]` | C       | real `charidx(s,16,1)`         | S: `spans.shift()` before return           | `6`                                                        | `7`                          | S / 1          | S restored  |
| `UTF-8 spans preserve astral and composing boundaries [byteidx composing EOL]` | C       | real `byteidx(s,6)`            | S: `spans.shift()` before return           | `-1`                                                       | `16`                         | S / 1          | S restored  |

## Additional required production mutations

| Full case under `coordinate contract A1`                                               | Fixture | Assertion               | Mutation                                           | Observed actual              | Expected                       | Command / exit | Restoration |
| -------------------------------------------------------------------------------------- | ------- | ----------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------ | -------------- | ----------- |
| `offset ignores DOS fileformat ['unix']`                                               | F, unix | all offsets             | L: UTF-16 length                                   | `[0,8,9,17]`                 | `[0,15,16,31]`                 | L / 1          | L restored  |
| `offset ignores DOS fileformat ['dos']`                                                | F, dos  | all offsets             | L: UTF-16 length                                   | `[0,8,9,17]`                 | `[0,15,16,31]`                 | L / 1          | L restored  |
| `line byte offsets honor DOS fileformat ['dos']`                                       | F, dos  | all line byte positions | D: force `eolBytes = 1` only in line2byte          | `[1,16,17,32]` (line 3 = 17) | `[1,17,19,35]` (line 3 = 19)   | D / 1          | D restored  |
| `offset bounds throw rather than return minus one [index -1]`                          | F       | error, not sentinel     | B: replace bounds error with successful integer -1 | `success: -1`                | contains `index out of bounds` | B / 1          | B restored  |
| `offset bounds throw rather than return minus one [index 4]`                           | F       | error, not sentinel     | B: replace bounds error with successful integer -1 | `success: -1`                | contains `index out of bounds` | B / 1          | B restored  |
| `unloaded and empty buffers are distinct [unloaded vim.api.nvim_buf_get_offset(0, 0)]` | U       | unloaded sentinel       | U: delete offset's `lineCount === 0` branch        | `0`                          | `-1`                           | U / 1          | U restored  |

### Restoration commands and observed results

The named mutation was undone **before** its listed command ran. Excluded
tests in targeted runs are not counted as control evidence; all selected
assertions execute, and the complete restored A1 gate runs separately.

```bash
# S restored: remove spans.shift(); 11 passed, exit 0 (09:53:54)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'UTF-8 spans'
# L restored: restore return total; 4 passed, exit 0 (09:54:11)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'base bytes|composing bytes|offset ignores DOS'
# H restored: restore lines: [...lines]; 1 passed, exit 0 (09:54:25)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'host fixture'
# D restored: restore resolved DOS EOL expression; 6 passed, exit 0 (09:54:52)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'line byte offsets honor DOS fileformat'
# B restored: restore luaL_error bounds branch; 2 passed, exit 0 (09:55:09)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'offset bounds.*index'
# U restored: restore lineCount === 0 branch; 1 passed, exit 0 (09:55:34)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'unloaded vim.api'
```

## Before-change integration baseline

### Exact mutation restoration operations

These are the literal `patchText` operations passed to the `apply_patch` tool.
Each returned `Success. Updated the following files` for the named path; the
matching restored-run exit status and time are recorded above. They are edit
operations, not git commands. R was the unfixed revision, not sabotage: its
restoration was the initial implementation patch (included last).

```text
# S
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/coordinates.ts
@@
-    spans.shift(); // Negative control: discard the first Unicode character.
     return spans;
*** End Patch

# L
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/coordinates.ts
@@
-    return text.length; // Negative control: host UTF-16 instead of UTF-8.
+    return total;
*** End Patch

# H
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/test/unit/lua/coordinate-harness.ts
@@
-        lines: lines.slice(0, 2),
+        lines: [...lines],
*** End Patch

# D
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/fn.ts
@@
-        const eolBytes = 1; // Negative control: reuse API offset EOL policy.
+        const eolBytes = callbacks.getBufferOption?.('fileformat') === 'dos' ? 2 : 1;
*** End Patch

# B
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/api.ts
@@
         if (index < 0 || index > lineCount) {
-            lua.lua_pushinteger(state, -1);
-            return 1;
+            return lauxlib.luaL_error(
+                state,
+                to_luastring('nvim_buf_get_offset: index out of bounds'),
+            );
*** End Patch

# U
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/api.ts
@@
         // there is no loaded current buffer, not a zero-line text document.
         const lineCount = callbacks.getLineCount?.() ?? 0;
+        if (lineCount === 0) {
+            lua.lua_pushinteger(state, -1);
+            return 1;
+        }
         if (index < 0 || index > lineCount) {
*** End Patch

# R
*** Begin Patch
*** Update File: /home/saberzero1/Repos/motions/src/lua/api.ts
@@
 import { replaceTermcodes, termcodesToNotation } from './termcodes';
+import { utf8Length } from './coordinates';
@@
     'nvim_buf_line_count',
+    'nvim_buf_get_offset',
     'nvim_win_get_cursor',
@@
         'nvim_buf_get_changedtick',
-        'nvim_buf_get_offset',
         'nvim_win_get_height',
@@
 export interface VimApiState {
     globals: Map<string, unknown>;
+    getBufferOption: (name: string) => unknown;
+    getWindowOption: (name: string) => unknown;
@@
     lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_line_count'));

+    lua.lua_pushjsfunction(L, (state: lua_State) => {
+        requireBufferZero(state, 1, 'nvim_buf_get_offset');
+        const index = lauxlib.luaL_checkinteger(state, 2);
+        // Host editors have at least one line, even when empty. Zero means
+        // there is no loaded current buffer, not a zero-line text document.
+        const lineCount = callbacks.getLineCount?.() ?? 0;
+        if (lineCount === 0) {
+            lua.lua_pushinteger(state, -1);
+            return 1;
+        }
+        if (index < 0 || index > lineCount) {
+            return lauxlib.luaL_error(
+                state,
+                to_luastring('nvim_buf_get_offset: index out of bounds'),
+            );
+        }
+        let offset = 0;
+        for (const line of callbacks.getLines?.(0, index) ?? []) {
+            // Unlike line2byte(), this API always counts a single-byte EOL.
+            offset += utf8Length(line) + 1;
+        }
+        lua.lua_pushinteger(state, offset);
+        return 1;
+    });
+    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_offset'));
+
@@
-    return { globals };
+    return {
+        globals,
+        getBufferOption: (name) => readBufferOption(callbacks, name),
+        getWindowOption: (name) => readWindowOption(callbacks, name),
+    };
*** Update File: /home/saberzero1/Repos/motions/src/lua/fn.ts
@@
     getOption: (name: string) => unknown;
+    /** Resolved readers from VimApiState, including vim.bo/vim.wo shadows. */
+    getBufferOption?: (name: string) => unknown;
+    getWindowOption?: (name: string) => unknown;
@@
-    const numberReturnFns = new Set([
-        'byte2line',
-        'line2byte',
+    registry.set('line2byte', (state) => {
+        const lineNumber = lauxlib.luaL_checknumber(state, 1);
+        const lineCount = callbacks.getLineCount();
+        if (!Number.isInteger(lineNumber) || lineCount === 0 ||
+            lineNumber < 1 || lineNumber > lineCount + 1) {
+            lua.lua_pushinteger(state, -1);
+            return 1;
+        }
+        const eolBytes = callbacks.getBufferOption?.('fileformat') === 'dos' ? 2 : 1;
+        let position = 1;
+        for (const line of callbacks.getLines(0, lineNumber - 1)) {
+            position += utf8Length(line) + eolBytes;
+        }
+        lua.lua_pushinteger(state, position);
+        return 1;
+    });
+
+    registry.set('byte2line', (state) => {
+        const position = lauxlib.luaL_checknumber(state, 1);
+        const lineCount = callbacks.getLineCount();
+        if (!Number.isInteger(position) || position < 1 || lineCount === 0) {
+            lua.lua_pushinteger(state, -1);
+            return 1;
+        }
+        const eolBytes = callbacks.getBufferOption?.('fileformat') === 'dos' ? 2 : 1;
+        let end = 0;
+        let lineNumber = 0;
+        for (const line of callbacks.getLines(0, lineCount)) {
+            end += utf8Length(line) + eolBytes;
+            lineNumber++;
+            if (position <= end) {
+                lua.lua_pushinteger(state, lineNumber);
+                return 1;
+            }
+        }
+        lua.lua_pushinteger(state, -1);
+        return 1;
+    });
+
+    const numberReturnFns = new Set([
*** Update File: /home/saberzero1/Repos/motions/src/lua/loader.ts
@@
-    const { globals } = injectVimApi(L, callbacks);
+    const { globals, getBufferOption, getWindowOption } = injectVimApi(L, callbacks);
@@
     injectVimFn(L, {
+        getBufferOption,
+        getWindowOption,
         getCmAdapter: callbacks.getCmAdapter,
*** Update File: /home/saberzero1/Repos/motions/test/unit/lua/coordinate-harness.ts
@@
         injectVimFn(L, {
+            getBufferOption: api.getBufferOption,
+            getWindowOption: api.getWindowOption,
*** End Patch
```

### Baseline execution

Ran the plan's fetch and development build, then the two enumerated specs:

```bash
ls test-vault test/fixtures /tmp/opencode && bash scripts/fetch-test-plugins.sh && npm run build:dev
set -euo pipefail; sha256sum test-vault/lua/mini/comment.lua; time nix develop --command bash -c 'npx wdio run ./wdio.conf.mts --spec test/specs/lua-plugin-mini-comment.e2e.ts --spec test/specs/lua-vim-fn.e2e.ts' && printf 'COORD-BASELINE PASS\n'
```

Observed marker **COORD-BASELINE PASS**, exit 0. Measured elapsed **1m58.840s**;
WDIO reported 2/2 specs passed in 1m56s. mini.comment: **21 passed, 3 skipped**.
vim.fn: **35 passed, 0 skipped**. Fixture SHA-256:
`040c3881a6bd3e9a697d07fc64626275d2602d514029d0bb029cf422e97c4aa4`.

Existing skips (not compatibility proof, none caused by absent fixtures):

- `mini.comment plugin integration > plugin fetch > vim.plugins.add fetches mini.comment from GitHub` (fixture already fetched).
- `mini.comment plugin integration > default commentstring (%% %s %%) > gcc on empty line adds comment markers` (existing explicit skip).
- `mini.comment plugin integration > default commentstring (%% %s %%) > gc in visual mode comments selected lines` (existing explicit skip).

Passing case names, with suite prefixes retained:

- `mini.comment plugin integration > setup() loads without errors`: `pcall(require, "mini.comment").setup succeeds`.
- `mini.comment plugin integration > default commentstring (%% %s %%)`: `gc mapping is registered after setup`; `g@ operator with manual operatorfunc works`; `vim.cmd lua executes inline Lua code`; `feedKeys g@_ from action callback triggers operatorfunc`; `MiniComment.operator via operatorfunc reports errors`; `nvim_buf_set_lines via operatorfunc callback`; `MiniComment.toggle_lines works from keymap`; `fn keymap callback modifies buffer via nvim_buf_set_lines`; `fn keymap callback modifies buffer via scrolloff side effect`; `gcc toggles comment on a single line`; `gcc uncomments a commented line`; `gcj comments two lines (current + next)`.
- `mini.comment plugin integration > custom commentstring (HTML)`: `gcc toggles HTML comment`; `gcc uncomments HTML comment`.
- `mini.comment plugin integration > custom commentstring (C-style)`: `gcc toggles C-style comment`; `gcc uncomments C-style comment`; `gcj comments two lines with C-style`.
- `mini.comment plugin integration > custom commentstring (hash)`: `gcc toggles hash comment`; `gcc uncomments hash comment`.
- `mini.comment plugin integration > disabled via vim.b`: `gcc does nothing when minicomment_disable is set`.
- `vim.fn functions > Registers`: `setreg sets register content`; `getreg reads back register content set by setreg`; `getregtype returns V for linewise register`.
- `vim.fn functions > Buffer modification`: `setline replaces a line`; `append inserts a string after a line`; `append inserts a list of strings after a line`; `indent returns indentation level in spaces`.
- `vim.fn functions > Position/cursor`: `nextnonblank finds the next non-blank line`; `prevnonblank finds the previous non-blank line`; `cursor moves the cursor to a 1-based position`; `setpos sets cursor position via dot expr`; `getpos returns cursor position as a 4-element list`; `getcurpos returns cursor position as a 5-element list`.
- `vim.fn functions > Type/introspection`: `type returns 0 for number`; `type returns 1 for string`; `type returns 3 for list`; `type returns 4 for dict`; `type returns 6 for bool`; `len returns string length`; `len returns table length`; `empty detects empty string and zero`.
- `vim.fn functions > Pattern matching`: `matchstr extracts the first regex match`; `match returns the byte index of the first match`; `matchlist returns capture groups`; `escape prepends backslash to specified characters`.
- `vim.fn functions > String/list utilities`: `repeat repeats a string N times`; `reverse reverses a string`; `range generates a number sequence`; `sort sorts a list in-place`; `uniq removes consecutive duplicates`; `max returns the largest number in a list`; `min returns the smallest number in a list`; `abs returns absolute value`; `index finds item position in a list (0-based)`; `count returns number of occurrences in a list`.

## Restored Phase 1 acceptance

Exact final QA invocation (Bash timeout **900000 ms**):

```bash
set -euo pipefail; bash scripts/fetch-test-plugins.sh; sha256sum test-vault/lua/mini/comment.lua; test "$(sha256sum test-vault/lua/mini/comment.lua)" = '040c3881a6bd3e9a697d07fc64626275d2602d514029d0bb029cf422e97c4aa4  test-vault/lua/mini/comment.lua'; npm run build:dev; time nix develop --command bash -c 'npx wdio run ./wdio.conf.mts --spec test/specs/lua-plugin-mini-comment.e2e.ts --spec test/specs/lua-vim-fn.e2e.ts' && printf 'COORD-BASELINE PASS\n'; npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract A1' && printf 'COORD-A1 PASS\n'
```

Observed **COORD-BASELINE PASS** and **COORD-A1 PASS**, exit **0**.
Final WDIO measured **1m54.558s** (reporter 1m52s); **56 passed, the same 3
existing skips**, no failed cases or fixture-absence skips. Every case listed
in the before-change baseline retained its status. The explicit SHA-256 check
passed: before and after used identical mini.comment bytes.

All **30 A1 cases / six families** executed, **zero skipped**, in **712ms**:
offsets `[0,15,16,31]` in both formats, line2byte `[1,16,17,32]` Unix and
`[1,17,19,35]` DOS. All mutations had already been restored.

Related unit regressions also passed (**209 tests**, exit 0):

```bash
npx vitest run test/unit/lua/api.test.ts test/unit/lua/fn.test.ts test/unit/lua/api-compat.test.ts
```

LSP reported **no diagnostics** for all seven touched TypeScript files.
The evidence Markdown was submitted too, but no `.md` LSP server is configured;
Markdown formatting is covered by the repository's Prettier gate instead.
