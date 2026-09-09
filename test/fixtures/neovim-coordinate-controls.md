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

# Phase 2 window negative controls

Executed 2026-09-09 on top of committed Phase 1 `a459329`. No Phase 1
implementation or assertion was changed. The records below are observed runs,
not predictions. All window cases live in
`test/unit/lua/coordinate-contract.test.ts`, under **coordinate contract Windows**.
Each row's case name is prefixed by that group to give its full Vitest name.
Each parameter row executes independently, with one assertion per case.

Fixture **W**: F from Phase 1, with a CM6 `EditorState` containing the exact
three canonical lines, viewport 640×200, character metrics 8×20. Resize changes
only viewport dimensions to 400×120. **N**: W initialized, then `host.cm = null`.
All API/fn calls dispatch through the real sandbox injection, never mocked Lua
handlers. No coordinate expectation comes from a shim string function.

## Commands and restoration

All commands run from `/home/saberzero1/Repos/motions`:

```bash
# WR: red first, five API names and two fn names still original stubs
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract Windows' --reporter=verbose
# WM: production mutations described below (same command, later execution)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract Windows' --reporter=verbose
# WG: restoration after WR (13:50:43) and after WM (13:51:07)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract Windows'
# SR: red-first client shutdown regression (13:51:41)
npx vitest run test/unit/lua/coordinate-oracle.test.ts --reporter=verbose
# SG: restored shutdown regression (13:52:17)
npx vitest run test/unit/lua/coordinate-oracle.test.ts
```

WR: **64 failed, 11 passed, exit 1**. The 30 A1 cases are excluded by the
Windows selector, not counted as controls or compatibility evidence.
Restoration WR: implement the seven handlers, extracting dimensions from
`window-info.ts`, using `apply_patch`; WG then **75 passed, exit 0**.
An intermediate run caught float-string spelling (`[0.0,0.0]` vs `[0,0]`);
position now uses `lua_pushinteger`, not `pushLuaAny`. Expectations were not weakened.

WM: **22 failed, 53 passed, exit 1**. Mutations applied together, with each
assertion independently executed: `win_getid` returns 1; `winnr('#')` returns 1;
validity accepts nonzero numeric handles; only the **new** `requireWindowZero`
call is bypassed; dimensions return pixels and no-editor fallback is `{1,1}`.
No existing validator or call site was touched. All WM mutations were undone
immediately with `apply_patch`; WG then **75 passed, exit 0**.

Exact WM restoration operations (all `apply_patch` updates succeeded):

```diff
# src/lua/api.ts
- lua.lua_pushboolean(state, win === win); // Negative control.
+ lua.lua_pushboolean(state, win === 0);
- // Negative control: bypass only the new window handler guard.
+ requireWindowZero(state, 1, name);
# src/lua/fn.ts, win_getid and winnr respectively
- lua.lua_pushinteger(state, 1); // Negative control.
+ lua.lua_pushinteger(state, 0);
- lua.lua_pushinteger(state, expression === '#' ? 1 : 1); // Negative control.
+ lua.lua_pushinteger(state, expression === '#' ? 0 : 1);
# src/lua/window-info.ts
- if (!view) return { width: 1, height: 1 }; // Negative control.
+ if (!view) return { width: 0, height: 0 };
- width: charWidth > 0 ? view.scrollDOM.clientWidth : 0,
- height: lineHeight > 0 ? view.scrollDOM.clientHeight : 0,
+ width: charWidth > 0 ? Math.floor(view.scrollDOM.clientWidth / charWidth) : 0,
+ height: lineHeight > 0 ? Math.floor(view.scrollDOM.clientHeight / lineHeight) : 0,
```

## Identity, geometry, and warning assertions

| Full case below `coordinate contract Windows`                                    | Fixture    | Assertion                                                 | Mutation         | Observed actual     | Expected         | Command / exit | Restoration         |
| -------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- | ---------------- | ------------------- | ---------------- | -------------- | ------------------- |
| `handle zero has one ordinal [valid]`                                            | W          | validity boolean spelling                                 | original stub    | `false`             | `true`           | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [position]`                                         | W          | exact position array                                      | original stub    | `[]`                | `[0,0]`          | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [identity]`                                         | W          | handle, ordinal, origin                                   | original stubs   | `0.0,0`             | `0,1,0,0`        | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [win_getid()]`                                      | W          | current handle                                            | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [win_getid(1)]`                                     | W          | ordinal 1 handle                                          | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [win_getid(1,1)]`                                   | W          | window/tab ordinal 1 handle                               | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [win_getid(2)]`                                     | W          | invalid window failure value                              | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [win_getid(1,2)]`                                   | W          | invalid tab failure value                                 | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [win_getid(0)]`                                     | W          | invalid ordinal failure value                             | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [winnr()]`                                          | W          | current ordinal                                           | original stub    | `0`                 | `1`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [winnr('$')]`                                       | W          | last ordinal                                              | original stub    | `0`                 | `1`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [winnr('#')]`                                       | W          | absent alternate                                          | return 1         | `1`                 | `0`              | WM / 1         | WM restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.api.nvim_win_is_valid(0)]`     | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.api.nvim_win_get_width(0)]`    | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.api.nvim_win_get_height(0)]`   | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.api.nvim_win_get_position(0)]` | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.api.nvim_win_get_number(0)]`   | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.fn.win_getid()]`               | W          | warning call count, proving promotion despite zero result | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `handle zero has one ordinal [no stub warning vim.fn.winnr()]`                   | W          | warning call count                                        | original stub    | `1`                 | `0`              | WR / 1         | WR restored, WG / 0 |
| `geometry is live cells not pixels [api]`                                        | W, resized | width/height before/after                                 | original stubs   | `[0,0,0,0]`         | `[80,10,50,6]`   | WR / 1         | WR restored, WG / 0 |
| `geometry is live cells not pixels [api]`                                        | W, resized | width/height before/after                                 | return pixels    | `[640,200,400,120]` | `[80,10,50,6]`   | WM / 1         | WM restored, WG / 0 |
| `geometry is live cells not pixels [getwininfo]`                                 | W, resized | shared dimension consistency against literal cells        | return pixels    | `[640,200,400,120]` | `[80,10,50,6]`   | WM / 1         | WM restored, WG / 0 |
| `missing editor has no measurable geometry [dimensions]`                         | N          | width/height fallback                                     | fallback `{1,1}` | `[1,1]`             | `[0,0]`          | WM / 1         | WM restored, WG / 0 |
| `missing editor has no measurable geometry [identity]`                           | N          | validity, handle, both ordinals, origin                   | original stubs   | `false:0.0,0.0,0`   | `true:0,1,1,0,0` | WR / 1         | WR restored, WG / 0 |

## Invalid-handle assertions

| Full case below `coordinate contract Windows`             | Fixture | Assertion              | Mutation                          | Observed actual                            | Expected                               | Command / exit | Restoration         |
| --------------------------------------------------------- | ------- | ---------------------- | --------------------------------- | ------------------------------------------ | -------------------------------------- | -------------- | ------------------- |
| `nonzero handles stay invalid [validity -1]`              | W       | numeric invalid handle | accept all numeric handles        | `true`                                     | `false`                                | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [validity 1]`               | W       | numeric invalid handle | accept all numeric handles        | `true`                                     | `false`                                | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_width -1]`    | W       | reject nonzero window  | bypass new guard + pixel mutation | `success: 640`                             | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_width 1]`     | W       | reject nonzero window  | bypass new guard + pixel mutation | `success: 640`                             | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_height -1]`   | W       | reject nonzero window  | bypass new guard + pixel mutation | `success: 200`                             | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_height 1]`    | W       | reject nonzero window  | bypass new guard + pixel mutation | `success: 200`                             | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_position -1]` | W       | reject nonzero window  | bypass new guard                  | `success: nil` (table is not a Lua string) | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_position 1]`  | W       | reject nonzero window  | bypass new guard                  | `success: nil` (table is not a Lua string) | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_number -1]`   | W       | reject nonzero window  | bypass new guard                  | `success: 1`                               | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |
| `nonzero handles stay invalid [nvim_win_get_number 1]`    | W       | reject nonzero window  | bypass new guard                  | `success: 1`                               | contains `window numbers other than 0` | WM / 1         | WM restored, WG / 0 |

## Count and type assertions (red first)

Every row uses W, the **original stub at a459329** mutation, exact command
**WR / exit 1**, and restoration **WR restored, WG / exit 0**. The sole
assertion checks that the returned diagnostic contains the Expected substring.
`success: nil` denotes a successful boolean/table result that is not a string,
not an import failure. All 42 cases failed on the feature.

| Full case below `coordinate contract Windows`                    | Observed actual | Expected substring               |
| ---------------------------------------------------------------- | --------------- | -------------------------------- |
| `handle zero has one ordinal [arity nvim_win_is_valid()]`        | `success: nil`  | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_is_valid(0,0)]`     | `success: nil`  | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_width()]`       | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_width(0,0)]`    | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_height()]`      | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_height(0,0)]`   | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_position()]`    | `success: nil`  | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_position(0,0)]` | `success: nil`  | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_number()]`      | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [arity nvim_win_get_number(0,0)]`   | `success: 0`    | `expected 1 argument`            |
| `handle zero has one ordinal [type nvim_win_is_valid(nil)]`      | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_is_valid(true)]`     | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_is_valid('0')]`      | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_is_valid({})]`       | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_is_valid(0.5)]`      | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_width(nil)]`     | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_width(true)]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_width('0')]`     | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_width({})]`      | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_width(0.5)]`     | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_height(nil)]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_height(true)]`   | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_height('0')]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_height({})]`     | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_height(0.5)]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_position(nil)]`  | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_position(true)]` | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_position('0')]`  | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_position({})]`   | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_position(0.5)]`  | `success: nil`  | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_number(nil)]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_number(true)]`   | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_number('0')]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_number({})]`     | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [type nvim_win_get_number(0.5)]`    | `success: 0`    | `expected integer window number` |
| `handle zero has one ordinal [fn validation win_getid(1,1,1)]`   | `success: 0.0`  | `expected at most 2 arguments`   |
| `handle zero has one ordinal [fn validation winnr("$",1)]`       | `success: 0.0`  | `expected at most 1 argument`    |
| `handle zero has one ordinal [fn validation win_getid(true)]`    | `success: 0.0`  | `expected integer ordinal`       |
| `handle zero has one ordinal [fn validation win_getid(1,{})]`    | `success: 0.0`  | `expected integer ordinal`       |
| `handle zero has one ordinal [fn validation win_getid(1.5)]`     | `success: 0.0`  | `expected integer ordinal`       |
| `handle zero has one ordinal [fn validation winnr({})]`          | `success: 0.0`  | `expected window expression`     |
| `handle zero has one ordinal [fn validation winnr("invalid")]`   | `success: 0.0`  | `invalid window expression`      |

## Native recorder shutdown control

File: `test/unit/lua/coordinate-oracle.test.ts`. Full case:
`coordinate oracle shutdown notifies quit and awaits process close, not an RPC reply`.
Fixture: real `NeovimClient` with mocked transport and child-process boundary,
manual `close` event; no editor coordinates. The old RPC is allowed to resolve
in this test so the defect fails an assertion, **not a timeout**.

SR at unfixed `a459329` exited **1**. Actual:
`{notifications: [], kills: 1, beforeClose: true, settled: true}`.
Expected:
`{notifications: [['nvim_command',['qa!']]], kills: 0, beforeClose: false, settled: true}`.
Restoration via `apply_patch`: replace awaited `command('qa!')` with
`notify('nvim_command', ['qa!'])`, install the `close` listener before sending,
await process close, and clear the bounded forced-shutdown timer on close.
SG exited **0**, **1 passed**. The first native recorder execution then exited
**0** in measured **2.645s**, printing the required success line only after
`stop()` resolved; no unsettled top-level await or dangling quit RPC remained.

## Native profile review (explicit extension of the fixture table)

Read the native artifact before accepting it. Base bytes are
`[0,2,5,9,12,13,14]`; `col` list/expression results are `[1,3,6,10,13,14,15]`;
`charcol` expression results are `[1,2,3,4,5,6,7]`. List-form `charcol` on those
**byte-number** inputs returns `[1,3,6,0,0,0,0]`, consistent with the plan's
already-character list-form correction, not a byte conversion. No disagreement
with the base specification was found. `$` was captured before output replaced
the source, not on the serialized JSON line.

Common option vector: `fileformat=unix`, `breakindent=false`, `linebreak=false`,
`number=false`, `relativenumber=false`, `signcolumn=no`, `foldcolumn=0`,
`ambiwidth=single`, `display=lastline`, `virtualedit=onemore` (permits measuring
the insertion boundary). The artifact records each complete actual option
vector. Width is measured from a real window; the narrow profile uses a native
nonfloating split because global `columns` has a larger minimum.

| Profile           | tabstop / list / listchars / wrap / width / showbreak | Inclusive cells for each canonical boundary, including EOL | `virtcol2col` for successive occupied cells |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| base              | `8 / false / tab:>- / true / 80 / ''`                 | `[[1,1],[2,2],[3,3],[4,5],[6,8],[9,9],[10,10]]`            | `[1,3,6,10,10,13,13,13,14]`                 |
| tabstop-2         | `2 / false / tab:>- / true / 80 / ''`                 | `[[1,1],[2,2],[3,3],[4,5],[6,6],[7,7],[8,8]]`              | `[1,3,6,10,10,13,14]`                       |
| list-tab-glyph    | `8 / true / tab:>- / true / 80 / ''`                  | `[[1,1],[2,2],[3,3],[4,5],[6,8],[9,9],[10,10]]`            | `[1,3,6,10,10,13,13,13,14]`                 |
| list-no-tab-glyph | `8 / true / trail:- / true / 80 / ''`                 | `[[1,1],[2,2],[3,3],[4,5],[6,7],[8,8],[9,9]]`              | `[1,3,6,10,10,13,13,14]`                    |
| nowrap            | `8 / false / tab:>- / false / 80 / ''`                | `[[1,1],[2,2],[3,3],[4,5],[6,8],[9,9],[10,10]]`            | `[1,3,6,10,10,13,13,13,14]`                 |

Narrow-showbreak is `8 / false / tab:>- / true / 8 / '>>'`, with four copies of
the canonical line. Literal native boundary extension:

| Byte offset | `col` | `charcol` expression | `charcol` list | Inclusive cells |
| ----------- | ----- | -------------------- | -------------- | --------------- |
| 0           | 1     | 1                    | 1              | `[1,1]`         |
| 2           | 3     | 2                    | 3              | `[2,2]`         |
| 5           | 6     | 3                    | 6              | `[3,3]`         |
| 9           | 10    | 4                    | 10             | `[4,5]`         |
| 12          | 13    | 5                    | 13             | `[6,8]`         |
| 13          | 14    | 6                    | 14             | `[11,11]`       |
| 14          | 15    | 7                    | 15             | `[12,12]`       |
| 16          | 17    | 8                    | 17             | `[13,13]`       |
| 19          | 20    | 9                    | 20             | `[14,14]`       |
| 23          | 24    | 10                   | 24             | `[15,16]`       |
| 26          | 27    | 11                   | 0              | `[19,28]`       |
| 27          | 28    | 12                   | 0              | `[29,29]`       |
| 28          | 29    | 13                   | 0              | `[30,30]`       |
| 30          | 31    | 14                   | 0              | `[31,31]`       |
| 33          | 34    | 15                   | 0              | `[32,32]`       |
| 37          | 38    | 16                   | 0              | `[35,36]`       |
| 40          | 41    | 17                   | 0              | `[37,40]`       |
| 41          | 42    | 18                   | 0              | `[43,43]`       |
| 42          | 43    | 19                   | 0              | `[44,44]`       |
| 44          | 45    | 20                   | 0              | `[45,45]`       |
| 47          | 48    | 21                   | 0              | `[46,46]`       |
| 51          | 52    | 22                   | 0              | `[47,48]`       |
| 54          | 55    | 23                   | 0              | `[51,60]`       |
| 55          | 56    | 24                   | 0              | `[61,61]`       |
| 56          | 57    | 25                   | 0              | `[62,62]`       |

Narrow occupied-cell inverse table, using inclusive ranges to avoid hiding
showbreak cells: `1→1, 2→3, 3→6, 4–5→10, 6–8→13, 9–11→14, 12→15, 13→17,
14→20, 15–16→24, 17–28→27, 29→28, 30→29, 31→31, 32→34, 33–36→38,
37–40→41, 41–43→42, 44→43, 45→45, 46→48, 47–48→52, 49–60→55, 61→56`.
This demonstrates why virtual columns are not simply unwrapped cell counts
and why the inverse is a containing-character lookup, not algebraic inversion.
These are native measurements only; no Phase 3 shim handlers were implemented.

## Recorder version/profile gate controls

Both controls use file `test/neovim/coordinate-oracle.ts`, the native Neovim
0.12.5 process and F (four copies for narrow wrapping). Exact command for each
negative and each restored run:

```bash
nix develop --command npx tsx test/neovim/coordinate-oracle.ts --check-version --record
```

| Gate                 | Assertion                  | Mutation                      | Observed actual | Expected                                                                | Exit | Restoration                                                                                     |
| -------------------- | -------------------------- | ----------------------------- | --------------- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| exact native version | runtime version equals pin | set VERSION to `0.12.4`       | `0.12.5`        | `0.12.4`; error `coordinate oracle: expected Neovim 0.12.4, got 0.12.5` | 1    | `apply_patch`: restore VERSION `0.12.5`; same command exit 0, six-profile success line          |
| all six profiles     | result count equals 6      | iterate `profiles.slice(0,5)` | `5`             | `6`; error `coordinate oracle: expected 6 profiles, got 5`              | 1    | `apply_patch`: restore iteration over `profiles`; same command exit 0, six-profile success line |

Both failures occur before writing the artifact and after clean process
shutdown. They are feature-gate failures, not missing-fixture, import, or
timeout failures. No weakened version check or missing-profile skip remains.

# Phase 3 coordinate negative controls

Executed 2026-09-09 against the Phase 3 working tree based on `3546847`.
These are observed executions, not predicted failures. The records below cover
**217 unit assertions and all 5 public e2e assertions (222 distinct assertions)**.
Supplementary rows preserve additional mandatory mutations of the same assertions.
Existing A1/Windows assertions were not changed; their earlier records remain above.

Each full case name is the group heading plus its case/parameter cell. Every unit
case has one reached assertion; parameter rows ran as separate Vitest cases, so
one failure did not mask another. Error matchers shown as `StringContaining`
require that substring. Vector assertions check the entire recorded vector.
For six-profile oracle objects, the recorded first differing cell tuple identifies
the failure; the assertion compares all boundary, occupied-cell, and EOL fields.

## Phase 3 fixtures and mutations

- **F**: `COORD_LINES = ['é→𝄞界\tZ', '', 'é→𝄞界\tZ']`, containing actual tabs.
  The usual host cursor is `{line:3,col:7}` (1-based UTF-16); named ordinary marks
  are `{line:2,ch:6}` (0-based UTF-16). Boundary cases set the tabulated positions.
- **F → unloaded**: initialize F, then set `host.loaded=false`.
- **F → empty**: either address F's empty second line (the `empty list position`
  cases), or replace F with that line (`['']`) for the empty-buffer cases.
- **P**: the named profile and literal results in `neovim-coordinate-oracle.json`.
  Narrow-showbreak repeats the first line four times. No expected result was
  regenerated from the shim, `strlen`, `strpart`, or the adapter.
- **76é + F[1]**: prefix the canonical line with 76 copies of `é`. A separate
  native 0.12.5 probe measured the wide character at byte column 162 as `[80,81]`
  under nowrap and `[81,82]` under wrap, with width 80. This is the discriminating
  nowrap control; the short nowrap profile alone is invariant at that width.
- **Named mark state**: `>` at infinity, finite `ch=7` with visual metadata `V`,
  or ordinary finite EOL with visual metadata `v`, as named by the case.
- Structural fixtures contain the canonical Unicode line and the shipped
  callback shapes. Production suppression inventory checks actual AST handler
  identities, separately from the structural scanner's diagnostics.

Every mutation was applied and removed with **`apply_patch`**, never a git undo
command. The `+` restoration IDs below mean: remove exactly that cohort's mutation
with `apply_patch`, then run the stated restoration command. Every restoration
exited **0**. Cohorts combine only independent defects; parameter assertions still
execute separately. No mutation remains in production or tests.

| ID  | Mutation applied                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B   | Erroneously add 1 while marshaling scalar/tuple coordinate results, at the three fn offset/inverse outputs, and at the host cursor setter. This also exposes incorrect base adjustment of invalid/unset values.                                                     |
| E   | Swallow adapter errors as successful `0`; bypass positive nonzero handle rejection in the guard definitions (no call sites changed); replace offset/line numeric checks with unchecked reads; default a malformed mark name to `a`.                                 |
| G   | Remove only `vim.fn.col` from the manifest; change cursor output line base to 2; invert the already-correct Lua seam expectations to `7` and `\tZ`.                                                                                                                 |
| I   | Bypass only mark conversion (`byteColumn(pos.ch)`); change manifest cursor column base to -1; disable the rule's member-access branch; add an unauthorized suppression in active `col`; erase the byte input brand; pass `{}` to Lua's number-accepting type probe. |
| V   | Disable the rule's bracket-access branch; insert one direct mark reference into the otherwise clean host fixture; give the valid directional type snippet a host column.                                                                                            |
| S   | Make `byteToUtf16` return the raw byte number, removing conversion, middle-byte normalization, and host EOL clamping.                                                                                                                                               |
| T   | Treat each ordinary tab as one display cell rather than advancing to the tab stop. This is the approved `list-tab-glyph` implementation control.                                                                                                                    |
| O   | Swap resolved tabstop 2 and 8. Base and tabstop-2 each receive the other setting; the between-calls case observes the swap on every call.                                                                                                                           |
| W   | Disable `list`, force `wrap=true`, and clear `showbreak`. Each affected profile differs in only its own setting: list-no-tab-glyph, nowrap wide-edge, and narrow-showbreak respectively.                                                                            |
| C   | Cursor getter returns host units only; character conversion counts UTF-16; swap `virtcol` list/window arguments; inverse lookup returns a tab's ending byte. These defects are independently observed by separate cases.                                            |
| M   | Convert the linewise-end alternative to the line's byte length instead of preserving `MAXCOL`.                                                                                                                                                                      |
| H   | Change the safe fallback for invalid tabstop values from 8 to 1, keeping the finite bounded path. This produces a feature failure, not a hung test.                                                                                                                 |
| L   | Restore the string-only, dot-only `col` handler and remove the canonical `virtcol2col` registration by temporarily renaming it.                                                                                                                                     |
| U   | Leak UTF-16 through `utf16ToByte` (`Math.min(col,text.length)`); used for the public cursor/ordinary-mark controls and the additional `col('.')` witness.                                                                                                           |
| P0  | Change both public test setup cursor positions from host `ch=6` to `ch=5`, leaving the expected precondition unchanged.                                                                                                                                             |

## Phase 3 exact commands and restoration results

All commands ran from `/home/saberzero1/Repos/motions`. The temporary custom
Vitest reporter only collected each case's `result()` into JSON and printed its
actual/expected values; it did not change tests or assertions. The permanent
tables below transcribe those results. Reporter artifacts were named by cohort.

```bash
# B
EVIDENCE_FILE=/tmp/opencode/coord-wire-bases.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t 'coordinate manifest|coordinate contract A2|coordinate contract cursor|coordinate contract mark' --reporter=/tmp/opencode/coordinate-reporter.mjs
# E
EVIDENCE_FILE=/tmp/opencode/coord-error-policies.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts -t 'coordinate manifest|coordinate contract A2' --reporter=/tmp/opencode/coordinate-reporter.mjs
# G
EVIDENCE_FILE=/tmp/opencode/coord-manifest-controls.json npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'coverage|byte-string seam|nvim_win_get_cursor cursor Z' --reporter=/tmp/opencode/coordinate-reporter.mjs
# I
EVIDENCE_FILE=/tmp/opencode/coord-isolated-gates.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/api.test.ts test/unit/lua/coordinate-types.test.ts test/unit/lua/coordinate-boundary-rule.test.ts -t 'mark after astral|mark returns byte|nvim_win_get_cursor cursor Z|coordinate adapter directionality|coordinate boundary' --reporter=/tmp/opencode/coordinate-reporter.mjs
# V
EVIDENCE_FILE=/tmp/opencode/coord-bracket-valid.json npx vitest run test/unit/lua/coordinate-types.test.ts test/unit/lua/coordinate-boundary-rule.test.ts --reporter=/tmp/opencode/coordinate-reporter.mjs
# S
EVIDENCE_FILE=/tmp/opencode/coord-set-leak.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t 'nvim_win_set_cursor|cursor middle-byte|cursor past EOL|cursor set converts' --reporter=/tmp/opencode/coordinate-reporter.mjs
# T
EVIDENCE_FILE=/tmp/opencode/coord-tab-one-cell.json npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'virtcol' --reporter=/tmp/opencode/coordinate-reporter.mjs
# O
EVIDENCE_FILE=/tmp/opencode/coord-tabstop-toggle.json npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'virtcol honors' --reporter=/tmp/opencode/coordinate-reporter.mjs
# W
EVIDENCE_FILE=/tmp/opencode/coord-window-toggles.json npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'virtcol honors' --reporter=/tmp/opencode/coordinate-reporter.mjs
# C
EVIDENCE_FILE=/tmp/opencode/coord-specific-semantics.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/api.test.ts -t 'nvim_win_get_cursor cursor Z|cursor get uses bytes|charcol cursor Z|list precedes winid|virtcol2col 0,1,7' --reporter=/tmp/opencode/coordinate-reporter.mjs
# M
EVIDENCE_FILE=/tmp/opencode/coord-sentinel.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts -t 'linewise' --reporter=/tmp/opencode/coordinate-reporter.mjs
# H
EVIDENCE_FILE=/tmp/opencode/coord-unsafe-options.json npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'unsafe tabstop' --reporter=/tmp/opencode/coordinate-reporter.mjs
# L
EVIDENCE_FILE=/tmp/opencode/coord-legacy-handlers.json npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'vim.fn.col expression EOL|vim.fn.col list column 14|vim.fn.virtcol2col 0,1,7' --reporter=/tmp/opencode/coordinate-reporter.mjs
# U
EVIDENCE_FILE=/tmp/opencode/coord-host-leak.json npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t coordinate --reporter=/tmp/opencode/coordinate-reporter.mjs
```

The restoration commands actually executed, after `apply_patch` removed each
mutation, were:

```bash
# B+ — 199 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t 'coordinate manifest|coordinate contract A2|coordinate contract cursor|coordinate contract mark'
# E+ — 196 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts -t 'coordinate manifest|coordinate contract A2'
# G+ — 4 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'coverage|byte-string seam|nvim_win_get_cursor cursor Z'
# I+ — 16 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/api.test.ts test/unit/lua/coordinate-types.test.ts test/unit/lua/coordinate-boundary-rule.test.ts -t 'mark after astral|mark returns byte|nvim_win_get_cursor cursor Z|coordinate adapter directionality|coordinate boundary'
# V+ — 13 passed
npx vitest run test/unit/lua/coordinate-types.test.ts test/unit/lua/coordinate-boundary-rule.test.ts
# S+ — 23 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t 'nvim_win_set_cursor|cursor middle-byte|cursor past EOL|cursor set converts'
# T+ — 33 passed
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t virtcol
# O+ and W+ — 8 passed each
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'virtcol honors'
# C+ — 5 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/api.test.ts -t 'nvim_win_get_cursor cursor Z|cursor get uses bytes|charcol cursor Z|list precedes winid|virtcol2col 0,1,7'
# M+ — 4 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts -t linewise
# H+ — 32 passed
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract A2'
# L+ — 3 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'vim.fn.col expression EOL|vim.fn.col list column 14|vim.fn.virtcol2col 0,1,7'
# U+ — 304 passed
npx vitest run test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-contract.test.ts test/unit/lua/api.test.ts -t coordinate
```

Cases excluded by a targeted `-t` selection are not counted as controls or
passing cases. Every negative row below exited 1 on its stated feature assertion;
every restoration exited 0. The scanner's expected error-level diagnostics on
isolated defective fixtures are not production lint failures.

## Phase 3 per-assertion unit records

### test/unit/lua/api.test.ts — vim api > vim.api — Wave 1: Cursor + line + marks

| Full case/parameter within group                                          | Fixture | Assertion                          | Observed actual | Expected      | Command / exit | Restoration |
| ------------------------------------------------------------------------- | ------- | ---------------------------------- | --------------- | ------------- | -------------- | ----------- |
| `coordinate contract cursor get uses bytes`                               | F       | Lua status and cursor tuple        | `[0,"3:6"]`     | `[0,"3:13"]`  | C / 1          | C+ / 0      |
| `coordinate contract cursor set converts bytes to host units`             | F       | Lua status and host callback calls | `[0,[[3,14]]]`  | `[0,[[3,7]]]` | S / 1          | S+ / 0      |
| `coordinate contract mark returns byte column without changing line base` | F       | Lua status and mark tuple          | `[0,"3:6"]`     | `[0,"3:13"]`  | I / 1          | I+ / 0      |

### test/unit/lua/coordinate-contract.test.ts — coordinate contract A2

| Full case/parameter within group                                         | Fixture              | Assertion                             | Observed actual                                                         | Expected                                                                | Command / exit | Restoration |
| ------------------------------------------------------------------------ | -------------------- | ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ----------- |
| `col resolves all argument forms / charcol counts astral once [col]`     | F                    | All boundary cursor/list/mark triples | `["2:2:2","4:4:4","7:7:7","11:11:11","14:14:14","15:15:15","16:16:16"]` | `["1:1:1","3:3:3","6:6:6","10:10:10","13:13:13","14:14:14","15:15:15"]` | B / 1          | B+ / 0      |
| `col resolves all argument forms / charcol counts astral once [charcol]` | F                    | All boundary cursor/list/mark triples | `["2:2:2","3:3:3","4:4:4","5:5:5","6:6:6","7:7:7","8:8:8"]`             | `["1:1:1","2:2:2","3:3:3","4:4:4","5:5:5","6:6:6","7:7:7"]`             | B / 1          | B+ / 0      |
| `virtcol list precedes winid`                                            | F                    | Inclusive cell range                  | `"7:9"`                                                                 | `"6:8"`                                                                 | B / 1          | B+ / 0      |
| `virtcol honors six window profiles ['base']`                            | P                    | Oracle object; cells at byte 12       | `[6,6]`                                                                 | `[6,8]`                                                                 | O / 1          | O+ / 0      |
| `virtcol honors six window profiles ['tabstop-2']`                       | P                    | Oracle object; cells at byte 12       | `[6,8]`                                                                 | `[6,6]`                                                                 | O / 1          | O+ / 0      |
| `virtcol honors six window profiles ['list-tab-glyph']`                  | P                    | Oracle object; cells at byte 12       | `[6,6]`                                                                 | `[6,8]`                                                                 | T / 1          | T+ / 0      |
| `virtcol honors six window profiles ['list-no-tab-glyph']`               | P                    | Oracle object; cells at byte 12       | `[6,8]`                                                                 | `[6,7]`                                                                 | W / 1          | W+ / 0      |
| `virtcol honors six window profiles ['nowrap']`                          | P                    | Oracle object; cells at byte 12       | `[6,6]`                                                                 | `[6,8]`                                                                 | T / 1          | T+ / 0      |
| `virtcol honors six window profiles ['narrow-showbreak']`                | P(narrow), F×4       | Oracle object; cells at byte 13       | `[9,9]`                                                                 | `[11,11]`                                                               | W / 1          | W+ / 0      |
| `virtcol honors six window profiles [options mutate between calls]`      | F                    | Option changes are live               | `["6:6","6:8","6:6"]`                                                   | `["6:8","6:6","6:8"]`                                                   | O / 1          | O+ / 0      |
| `virtcol honors six window profiles [nowrap wide edge transformation]`   | 76é + F[1]           | Wide edge cells                       | `"81:82"`                                                               | `"80:81"`                                                               | W / 1          | W+ / 0      |
| `virtcol2col collapses and clamps`                                       | F                    | Entire lookup vector                  | `[11,11,14,14,14,15,15,15,2,0,0,2,0,1,0]`                               | `[10,10,13,13,13,14,14,14,1,-1,-1,1,-1,0,-1]`                           | B / 1          | B+ / 0      |
| `cursor middle-byte normalization deviation [byte 1]`                    | F                    | Host cursor and wire vector           | `[{"col":2,"line":3},"3:2:3:2"]`                                        | `[{"col":1,"line":3},"3:0:1:1"]`                                        | S / 1          | S+ / 0      |
| `cursor middle-byte normalization deviation [byte 3]`                    | F                    | Host cursor and wire vector           | `[{"col":4,"line":3},"3:5:6:3"]`                                        | `[{"col":2,"line":3},"3:2:3:2"]`                                        | S / 1          | S+ / 0      |
| `cursor middle-byte normalization deviation [byte 6]`                    | F                    | Host cursor and wire vector           | `[{"col":7,"line":3},"3:13:14:6"]`                                      | `[{"col":3,"line":3},"3:5:6:3"]`                                        | S / 1          | S+ / 0      |
| `cursor past EOL clamps natively`                                        | F                    | Cursor/col/charcol vector             | `"4:15:16:8"`                                                           | `"3:14:15:7"`                                                           | B / 1          | B+ / 0      |
| `linewise mark preserves maxcol [infinity]`                              | F + named mark state | Mark and both maxcol routes           | `"3:14:2147483647:2147483647"`                                          | `"3:2147483647:2147483647:2147483647"`                                  | M / 1          | M+ / 0      |
| `linewise mark preserves maxcol [visual metadata]`                       | F + named mark state | Mark and both maxcol routes           | `"3:14:2147483647:2147483647"`                                          | `"3:2147483647:2147483647:2147483647"`                                  | M / 1          | M+ / 0      |
| `linewise mark preserves maxcol [ordinary EOL]`                          | F + named mark state | Mark and both maxcol routes           | `"4:15:2147483647:2147483647"`                                          | `"3:14:2147483647:2147483647"`                                          | B / 1          | B+ / 0      |
| `invalid positions do not masquerade as valid coverage [nil]`            | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{}]`             | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{3}]`            | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{0,1}]`          | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{4,1}]`          | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{3,-1}]`         | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{3,1.5}]`        | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `invalid positions do not masquerade as valid coverage [{3,"1"}]`        | F                    | Required Lua error                    | `"success: 0"`                                                          | contains `nvim_win_set_cursor:`                                         | E / 1          | E+ / 0      |
| `virtcol rejects unsafe tabstop [math.huge]`                             | F                    | Safe fallback cells                   | `"6:6"`                                                                 | `"6:8"`                                                                 | H / 1          | H+ / 0      |
| `virtcol rejects unsafe tabstop [1e100]`                                 | F                    | Safe fallback cells                   | `"6:6"`                                                                 | `"6:8"`                                                                 | H / 1          | H+ / 0      |
| `virtcol rejects unsafe tabstop [0.5]`                                   | F                    | Safe fallback cells                   | `"6:6"`                                                                 | `"6:8"`                                                                 | H / 1          | H+ / 0      |
| `virtcol rejects unsafe tabstop [0]`                                     | F                    | Safe fallback cells                   | `"6:6"`                                                                 | `"6:8"`                                                                 | H / 1          | H+ / 0      |
| `virtcol rejects unsafe tabstop [-1]`                                    | F                    | Safe fallback cells                   | `"6:6"`                                                                 | `"6:8"`                                                                 | H / 1          | H+ / 0      |

### test/unit/lua/coordinate-manifest.test.ts — coordinate manifest conformance

For every row, the assertion is the exact real-handler return (or host setter
position), or the required Lua error substring. All argument forms dispatch the
registered handler; none invokes the adapter directly.

| Full case/parameter within group                     | Fixture              | Observed actual                                         | Expected                               | Command / exit | Restoration |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------- | -------------------------------------- | -------------- | ----------- |
| `vim.api.nvim_buf_get_offset index 0`                | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset index 1`                | F                    | `16`                                                    | `15`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset index 2`                | F                    | `17`                                                    | `16`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset index 3`                | F                    | `32`                                                    | `31`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset DOS ignores fileformat` | F, DOS               | `32`                                                    | `31`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset unloaded`               | F → unloaded         | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset empty`                  | F → empty            | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.line2byte line 1`                            | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.line2byte line 2`                            | F                    | `17`                                                    | `16`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte line 3`                            | F                    | `18`                                                    | `17`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte line 4`                            | F                    | `33`                                                    | `32`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte DOS final boundary`                | F, DOS               | `36`                                                    | `35`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte invalid 0`                         | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte invalid 5`                         | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte invalid 1.5`                       | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte unloaded`                          | F → unloaded         | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.line2byte empty`                             | F → empty            | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 0`                            | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 1`                            | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 15`                           | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 16`                           | F                    | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 17`                           | F                    | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 31`                           | F                    | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line byte 32`                           | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 16`                       | F, DOS               | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 17`                       | F, DOS               | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 18`                       | F, DOS               | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 19`                       | F, DOS               | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 34`                       | F, DOS               | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.byte2line DOS byte 35`                       | F, DOS               | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.byte2line unloaded`                          | F → unloaded         | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.byte2line empty`                             | F → empty            | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.api.nvim_win_get_cursor cursor Z`               | F                    | `"3:6"`                                                 | `"3:13"`                               | C / 1          | C+ / 0      |
| `vim.api.nvim_win_get_cursor no cursor fallback`     | F → unloaded         | `"2:1"`                                                 | `"1:0"`                                | B / 1          | B+ / 0      |
| `vim.api.nvim_win_set_cursor byte 0`                 | F                    | `"3:2"`                                                 | `"3:1"`                                | B / 1          | B+ / 0      |
| `vim.api.nvim_win_set_cursor byte 2`                 | F                    | `"3:3"`                                                 | `"3:2"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor byte 5`                 | F                    | `"3:6"`                                                 | `"3:3"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor byte 9`                 | F                    | `"3:10"`                                                | `"3:5"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor byte 12`                | F                    | `"3:13"`                                                | `"3:6"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor byte 13`                | F                    | `"3:14"`                                                | `"3:7"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor byte 14`                | F                    | `"3:15"`                                                | `"3:8"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor past EOL`               | F                    | `"3:16"`                                                | `"3:8"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_win_set_cursor empty`                  | F → empty            | `"1:100"`                                               | `"1:1"`                                | S / 1          | S+ / 0      |
| `vim.api.nvim_buf_get_mark mark after astral`        | F                    | `"3:6"`                                                 | `"3:13"`                               | I / 1          | I+ / 0      |
| `vim.api.nvim_buf_get_mark unset`                    | F                    | `"1:1"`                                                 | `"0:0"`                                | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_mark linewise sentinel`        | F + named mark state | `"3:14"`                                                | `"3:2147483647"`                       | M / 1          | M+ / 0      |
| `vim.fn.col cursor Z`                                | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col expression EOL`                          | F                    | `0`                                                     | `15`                                   | L / 1          | L+ / 0      |
| `vim.fn.col list EOL`                                | F                    | `16`                                                    | `15`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 1`                           | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 2`                           | F                    | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 3`                           | F                    | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 4`                           | F                    | `5`                                                     | `4`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 5`                           | F                    | `6`                                                     | `5`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 6`                           | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 7`                           | F                    | `8`                                                     | `7`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 8`                           | F                    | `9`                                                     | `8`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 9`                           | F                    | `10`                                                    | `9`                                    | B / 1          | B+ / 0      |
| `vim.fn.col list column 10`                          | F                    | `11`                                                    | `10`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 11`                          | F                    | `12`                                                    | `11`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 12`                          | F                    | `13`                                                    | `12`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 13`                          | F                    | `14`                                                    | `13`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 14`                          | F                    | `bad argument #1 to 'col' (string expected, got table)` | `14`                                   | L / 1          | L+ / 0      |
| `vim.fn.col list column 15`                          | F                    | `16`                                                    | `15`                                   | B / 1          | B+ / 0      |
| `vim.fn.col list column 16`                          | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col mark a`                                  | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col mark [`                                  | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col mark ]`                                  | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col mark <`                                  | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col mark >`                                  | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.col invalid {0,1}`                           | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {4,1}`                           | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {1,0}`                           | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {}`                              | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {1}`                             | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {1,'x'}`                         | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid {'$',1}`                         | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid 'unknown'`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col invalid "'z"`                            | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.col empty list position`                     | F → empty            | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.col unloaded expression`                     | F → unloaded         | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol cursor Z`                            | F                    | `7`                                                     | `6`                                    | C / 1          | C+ / 0      |
| `vim.fn.charcol expression EOL`                      | F                    | `8`                                                     | `7`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list EOL`                            | F                    | `8`                                                     | `7`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 1`                       | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 2`                       | F                    | `3`                                                     | `2`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 3`                       | F                    | `4`                                                     | `3`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 4`                       | F                    | `5`                                                     | `4`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 5`                       | F                    | `6`                                                     | `5`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 6`                       | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 7`                       | F                    | `8`                                                     | `7`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 8`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 9`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 10`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 11`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 12`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 13`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 14`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 15`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol list column 16`                      | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol mark a`                              | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol mark [`                              | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol mark ]`                              | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol mark <`                              | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol mark >`                              | F                    | `7`                                                     | `6`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {0,1}`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {4,1}`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {1,0}`                       | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {}`                          | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {1}`                         | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {1,'x'}`                     | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid {'$',1}`                     | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid 'unknown'`                   | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol invalid "'z"`                        | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol empty list position`                 | F → empty            | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.charcol unloaded expression`                 | F → unloaded         | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol cursor Z`                            | F                    | `10`                                                    | `9`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol EOL`                                 | F                    | `11`                                                    | `10`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol list precedes winid`                 | F                    | `table.concat: table expected, got number`              | `"6:8"`                                | C / 1          | C+ / 0      |
| `vim.fn.virtcol invalid line list`                   | F                    | `"1:1"`                                                 | `"0:0"`                                | B / 1          | B+ / 0      |
| `vim.fn.virtcol invalid column list`                 | F                    | `"1:1"`                                                 | `"0:0"`                                | B / 1          | B+ / 0      |
| `vim.fn.virtcol invalid window list`                 | F                    | `"1:1"`                                                 | `"0:0"`                                | B / 1          | B+ / 0      |
| `vim.fn.virtcol malformed list flag`                 | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol unloaded expression`                 | F → unloaded         | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,4`                           | F                    | `11`                                                    | `10`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,5`                           | F                    | `11`                                                    | `10`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,6`                           | F                    | `14`                                                    | `13`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,7`                           | F                    | `14`                                                    | `13`                                   | C / 1          | C+ / 0      |
| `vim.fn.virtcol2col 0,1,8`                           | F                    | `14`                                                    | `13`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,9`                           | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,10`                          | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,999`                         | F                    | `15`                                                    | `14`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,0,1`                           | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,-1,1`                          | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,99,1`                          | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,0`                           | F                    | `2`                                                     | `1`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,1,-1`                          | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 0,2,1`                           | F                    | `1`                                                     | `0`                                    | B / 1          | B+ / 0      |
| `vim.fn.virtcol2col 99,1,1`                          | F                    | `0`                                                     | `-1`                                   | B / 1          | B+ / 0      |
| `vim.api.nvim_buf_get_offset invalid negative index` | F                    | `success: 0`                                            | contains `index out of bounds`         | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_offset invalid high index`     | F                    | `success: 0`                                            | contains `index out of bounds`         | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_offset fractional index`       | F                    | `success: 0`                                            | contains `integer`                     | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_offset invalid handle`         | F                    | `success: 0`                                            | contains `buffer numbers other than 0` | E / 1          | E+ / 0      |
| `vim.fn.line2byte malformed`                         | F                    | `success: -1`                                           | contains `number expected`             | E / 1          | E+ / 0      |
| `vim.fn.byte2line malformed`                         | F                    | `success: -1`                                           | contains `number expected`             | E / 1          | E+ / 0      |
| `vim.api.nvim_win_get_cursor invalid handle`         | F                    | `success: nil`                                          | contains `window numbers other than 0` | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid nil`            | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {}`             | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {3}`            | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {3,1.5}`        | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {3,"1"}`        | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {3,-1}`         | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {0,1}`          | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid {4,1}`          | F                    | `success: 0`                                            | contains `nvim_win_set_cursor:`        | E / 1          | E+ / 0      |
| `vim.api.nvim_win_set_cursor invalid handle`         | F                    | `success: nil`                                          | contains `window numbers other than 0` | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_mark invalid handle`           | F                    | `success: nil`                                          | contains `buffer numbers other than 0` | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_mark invalid name`             | F                    | `success: 0`                                            | contains `invalid mark name`           | E / 1          | E+ / 0      |
| `vim.api.nvim_buf_get_mark malformed name`           | F                    | `success: nil`                                          | contains `single-character`            | E / 1          | E+ / 0      |
| `vim.fn.col type 42`                                 | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.col type true`                               | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.col type nil`                                | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.col fractional list column`                  | F                    | `success: 0`                                            | contains `Float`                       | E / 1          | E+ / 0      |
| `vim.fn.charcol type 42`                             | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.charcol type true`                           | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.charcol type nil`                            | F                    | `success: 0`                                            | contains `String or List required`     | E / 1          | E+ / 0      |
| `vim.fn.charcol fractional list column`              | F                    | `success: 0`                                            | contains `Float`                       | E / 1          | E+ / 0      |

### test/unit/lua/coordinate-manifest.test.ts — coordinate manifest coverage

| Full case/parameter within group                                 | Fixture | Assertion             | Observed actual                                                                                               | Expected                                                                                          | Command / exit | Restoration |
| ---------------------------------------------------------------- | ------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- | ----------- |
| `requires exactly ten real registrations with complete metadata` | F       | Full inventory object | `{"deferredOverlap":[],"duplicate":[],"extra":[],"incomplete":[],"missing":["vim.fn.col"],"unregistered":[]}` | `{"deferredOverlap":[],"duplicate":[],"extra":[],"incomplete":[],"missing":[],"unregistered":[]}` | G / 1          | G+ / 0      |

### test/unit/lua/coordinate-manifest.test.ts — coordinate manifest Lua byte-string seam

These are the approved weakest controls for the already-correct native Lua seam:
only the literal expectation is inverted; the actual Lua result remains correct.

| Full case/parameter within group | Fixture | Assertion                                     | Observed actual | Expected under mutation | Command / exit | Restoration |
| -------------------------------- | ------- | --------------------------------------------- | --------------- | ----------------------- | -------------- | ----------- |
| `#"é→𝄞界\tZ"`                    | F       | Literal Lua byte length, serialized as string | `"14"`          | `"7"`                   | G / 1          | G+ / 0      |
| `string.sub("é→𝄞界\tZ",6,9)`     | F       | Literal Lua byte slice                        | `"𝄞"`           | `"\tZ"`                 | G / 1          | G+ / 0      |

### test/unit/lua/coordinate-boundary-rule.test.ts — coordinate boundary shipped defects

| Full case/parameter within group                       | Fixture                 | Assertion         | Observed actual   | Expected                                                                                       | Command / exit | Restoration |
| ------------------------------------------------------ | ----------------------- | ----------------- | ----------------- | ---------------------------------------------------------------------------------------------- | -------------- | ----------- |
| `reports three shipped callback leaks by name`         | Unicode source fixtures | Named diagnostics | `[]` (0 findings) | `["callbacks.getCursorCol","callbacks.getCursorPosition","callbacks.getMarkPos"]` (3 findings) | I / 1          | I+ / 0      |
| `restoring the old mark alone produces one diagnostic` | Old mark source fixture | Diagnostic count  | `0`               | `1`                                                                                            | I / 1          | I+ / 0      |

### test/unit/lua/coordinate-boundary-rule.test.ts — coordinate boundary directional and host exceptions

| Full case/parameter within group                                     | Fixture                      | Assertion        | Observed actual | Expected | Command / exit | Restoration |
| -------------------------------------------------------------------- | ---------------------------- | ---------------- | --------------- | -------- | -------------- | ----------- |
| `matches callbacks.getCursorCol()`                                   | Unicode source fixture       | Diagnostic count | `0`             | `1`      | I / 1          | I+ / 0      |
| `matches callbacks?.getCursorPosition?.()`                           | Unicode source fixture       | Diagnostic count | `0`             | `1`      | I / 1          | I+ / 0      |
| `matches const get = callbacks.getCursorCol`                         | Unicode source fixture       | Diagnostic count | `0`             | `1`      | I / 1          | I+ / 0      |
| `matches callbacks["getMarkPos"](name)`                              | Unicode source fixture       | Diagnostic count | `0`             | `1`      | V / 1          | V+ / 0      |
| `matches callbacks?.["setCursorPosition"]?.(1,2)`                    | Unicode source fixture       | Diagnostic count | `0`             | `1`      | V / 1          | V+ / 0      |
| `adapter-backed handlers and host definitions have zero diagnostics` | Adapter-backed/host fixtures | Diagnostic count | `1`             | `0`      | V / 1          | V+ / 0      |

### test/unit/lua/coordinate-boundary-rule.test.ts — coordinate boundary suppression inventory

| Full case/parameter within group                    | Fixture        | Assertion              | Observed actual                                                                                                                                                                          | Expected                                                                                                                                                                           | Command / exit | Restoration |
| --------------------------------------------------- | -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------- |
| `permits only enumerated actual handler identities` | Production AST | Exact owner list       | `["col","get_cursor","getcurpos","getcurpos","getpos","getpos","nvim_del_current_line","nvim_get_current_line","nvim_set_current_line","searchpos","set_cursor","wincol","winsaveview"]` | `["get_cursor","getcurpos","getcurpos","getpos","getpos","nvim_del_current_line","nvim_get_current_line","nvim_set_current_line","searchpos","set_cursor","wincol","winsaveview"]` | I / 1          | I+ / 0      |
| `has zero unauthorized active-handler exceptions`   | Production AST | Invalid exception list | `["col"]` (1 invalid exception)                                                                                                                                                          | `[]` (0)                                                                                                                                                                           | I / 1          | I+ / 0      |

### test/unit/lua/coordinate-types.test.ts — coordinate adapter directionality

| Full case/parameter within group         | Fixture             | Assertion        | Observed actual | Expected | Command / exit | Restoration |
| ---------------------------------------- | ------------------- | ---------------- | --------------- | -------- | -------------- | ----------- |
| `wrong direction`                        | F, compiler snippet | Diagnostic codes | `[]`            | `[2345]` | I / 1          | I+ / 0      |
| `Lua accepts the wrong unit as a number` | F, compiler snippet | Diagnostic codes | `[2345]`        | `[]`     | I / 1          | I+ / 0      |
| `valid direction`                        | F, compiler snippet | Diagnostic codes | `[2345]`        | `[]`     | V / 1          | V+ / 0      |

## Supplementary mandatory Phase 3 witnesses

These are additional controls of assertions already counted above, not additional
assertions. The source mutations, exact commands, and restorations use the same
cohort definitions.

| Test file / full case                                                                                    | Fixture | Assertion                    | Mutation                          | Observed actual                       | Expected | Command / exit | Restoration |
| -------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------- | ------------------------------------- | -------- | -------------- | ----------- |
| `coordinate-manifest.test.ts` / `coordinate manifest conformance > vim.fn.col cursor Z`                  | F       | Byte column at Z             | U: bypass host-to-byte conversion | `7`                                   | `14`     | U / 1          | U+ / 0      |
| `coordinate-manifest.test.ts` / `coordinate manifest conformance > vim.api.nvim_win_get_cursor cursor Z` | F       | Cursor tuple                 | G: manifest line base 2           | `"2:13"`                              | `"3:13"` | G / 1          | G+ / 0      |
| `coordinate-manifest.test.ts` / `coordinate manifest conformance > vim.api.nvim_win_get_cursor cursor Z` | F       | Cursor tuple                 | I: manifest column base -1        | `"3:14"`                              | `"3:13"` | I / 1          | I+ / 0      |
| `coordinate-manifest.test.ts` / `coordinate manifest conformance > vim.fn.virtcol2col 0,1,7`             | F       | Tab interior containing byte | L: absent canonical registration  | `vim.fn.virtcol2col is not available` | `13`     | L / 1          | L+ / 0      |

## Public Phase 3 e2e controls

File: **`test/specs/lua-coordinate-contract.e2e.ts`**, group **`Lua coordinate contract`**.
Every invocation below used the Bash tool's **900000 ms** timeout, under
`nix develop`, with one explicitly enumerated spec. No process was aborted.

```bash
# Public U and M controls, and each restored run after apply_patch:
npm run build:dev && time nix develop --command bash -c 'npx wdio run ./wdio.conf.mts --spec test/specs/lua-coordinate-contract.e2e.ts'
# P0 precondition control and restored run (only test setup changed):
time nix develop --command bash -c 'npx wdio run ./wdio.conf.mts --spec test/specs/lua-coordinate-contract.e2e.ts'
```

In this table **TEXT** denotes the exact `COORD_LINES.join('\n')` string, including
the empty middle line and literal tabs, not a trim or substring. These are all
five assertions in the public spec; the two assertions within the mark case are
identified separately so the earlier ordinary-mark failure cannot hide the
linewise sentinel assertion. U and M were run separately for this reason.

| Full case / assertion                                                    | Fixture                 | Mutation                        | Observed actual                    | Expected                             | Exit | Restoration command/result                                                       |
| ------------------------------------------------------------------------ | ----------------------- | ------------------------------- | ---------------------------------- | ------------------------------------ | ---- | -------------------------------------------------------------------------------- |
| `coordinate contract public byte cursor roundtrip` / precondition        | F, source mode          | P0: setup ch 5                  | `[TEXT,{line:2,ch:5},true]`        | `[TEXT,{line:2,ch:6},true]`          | 1    | `apply_patch` restore ch 6; exact P0 command above: 2 passing, exit 0            |
| `coordinate contract public byte cursor roundtrip` / roundtrip result    | F, source mode          | U: host-unit leak               | `["3:6:7:3:3",{line:2,ch:6},TEXT]` | `["3:13:14:6:9",{line:2,ch:6},TEXT]` | 1    | `apply_patch` restore converter; exact public U command above: 2 passing, exit 0 |
| `coordinate contract public mark after astral character` / precondition  | F, source mode          | P0: setup ch 5                  | `[TEXT,{line:2,ch:5},true]`        | `[TEXT,{line:2,ch:6},true]`          | 1    | `apply_patch` restore ch 6; exact P0 command above: 2 passing, exit 0            |
| `coordinate contract public mark after astral character` / ordinary mark | F, real `ma`            | U: host-unit leak               | `["3:6",TEXT]`                     | `["3:13",TEXT]`                      | 1    | `apply_patch` restore converter; exact public U command above: 2 passing, exit 0 |
| `coordinate contract public mark after astral character` / linewise mark | F, real `V` then Escape | M: sentinel through line length | `["3:14",TEXT]`                    | `["3:2147483647",TEXT]`              | 1    | `apply_patch` restore MAXCOL; exact public M command above: 2 passing, exit 0    |

Measured public control/restoration elapsed times: U **11.437s / 12.209s**;
M **12.175s / 12.344s**; P0 **10.371s / 12.235s**. U and P0 each produced
2 failing cases; M produced 1 passing and 1 failing case. These were feature
and precondition failures, not import errors, missing fixtures, or timeouts.

# Phase 4 deletebufline negative controls

Executed 2026-09-09 on top of `31955c3`. Only Phase 4 is implemented here.
**L** is the literal `é→𝄞界\tZ` (U+0009 tab); **F** is `[L,'',L]`;
**TEXT** is `L + '\n\n' + L`. All expectations are literals from Phase 4,
not calculated with a coordinate codec or a Lua string function.

Native Neovim **0.12.5** was measured before implementation, with
`vim.api.nvim_get_current_buf()` as the buffer argument: deleting line 2 gave
`0,[L,L]`; line 3 gave `0,[L,'']`; 1 through `'$'` gave `0,['']`; 2 through 99
gave `0,[L]`. First 0/-1/4, range 3..2, and range 1..0 all gave `1,F`.
Native `deletebufline(0,...)` returns 1: unlike the nvim API, this Vim function
does not interpret numeric 0 as current. This phase deliberately keeps the
plan's established **shim buffer-0-only model**, not native buffer identities.
No existing buffer validator or its call sites changed.

`deletebufline` is not added to the ten-entry encoding-coordinate manifest:
it takes whole-line bounds and returns a status, with no byte/UTF-16/character/
display conversion. The generated encoding conformance set remains unchanged;
these mutation/state tests exercise the real registered deletion handler instead.
The fn host splice uses host-native editor positions, as the plan requires;
there is no new byte/column conversion or parallel coordinate helper.

## Phase 4 commands and mutations

Commands ran from the repository root. Every WDIO invocation used the Bash
tool's **900000 ms** timeout and **one** enumerated spec. None was aborted.
Excluded pre-existing unit groups are Vitest `-t` filtering, not skipped
Phase 4 cases. Each parameter row executes independently with one composite
assertion, so an early failed field cannot hide another case.

```bash
# R: red-first against the unmodified number stub at 31955c3 (24 failures, exit 1)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract deletebufline' --reporter=verbose
# U: restored-stub S and reversed-status V controls (each 24 failures, exit 1)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract deletebufline' --reporter=dot
# I: mutate on the failure branch (18 failures, exit 1)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'invalid range or buffer|unloaded buffer leaves' --reporter=dot
# U+: after EACH production mutation was restored with apply_patch (24 passed, exit 0)
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract deletebufline'
# E: real host suffix red-first H, restored-stub S, reversed-status V;
# also each production restoration E+ (npm build exit 0 in all runs)
npm run build:dev && nix develop --command bash -c 'time npx wdio run ./wdio.conf.mts --spec test/specs/lua-coordinate-contract.e2e.ts --mochaOpts.grep "coordinate contract deletebufline"'
# P: precondition sabotage, then restoration P+ (test setup only)
nix develop --command bash -c 'time npx wdio run ./wdio.conf.mts --spec test/specs/lua-coordinate-contract.e2e.ts --mochaOpts.grep "coordinate contract deletebufline"'
```

- **R:** before the real registration exists, the original stub reports success
  while changing nothing. All 24 cases failed for feature assertions.
- **S:** after implementing and exercising the fix, temporarily rename the real
  registration to `deletebufline-control` and put `deletebufline` back into
  `numberReturnFns`. This routes the public name to the **actual original stub**
  (including its warning and `lua_pushnumber(0)`), not a mock. U and E exited 1.
  `apply_patch` restored the canonical registration and removed the stub entry;
  U+ passed 24 cases and E+ passed both public cases, exit 0.
- **H:** real handler installed, original fn host suffix splice still present.
  E observed an extra separator and failed the final-line case; delete-all
  passed. `apply_patch` moved the suffix start to the preceding host line's EOL;
  E+ passed both public cases, exit 0. The unrelated API splice is unchanged.
- **V:** change failure's pushed integer 1 to 0 and success's 0 to 1. No deletion
  logic changes; the branches are mutually exclusive. U and E exited 1.
  `apply_patch` restored both literals; U+ passed 24 and E+ passed 2, exit 0.
- **I:** insert `callbacks.setLines?.(1, 2, [])` on the production failure branch,
  leaving its return 1 intact. I exited 1 for all 18 selected cases.
  `apply_patch` removed that call; U+ passed all 24, exit 0.
- **P:** in each new public case only, insert
  `await setupEditor(COORD_LINE, { line: 0, ch: 0 }); await ensureLivePreview();`
  before capturing initial text/mode. P failed both cases on the actual
  preconditions. `apply_patch` removed those calls and their temporary import;
  P+ passed both cases, exit 0.

## Phase 4 unit records

File: **`test/unit/lua/coordinate-contract.test.ts`**, group
**`coordinate contract deletebufline`**. Every case below starts from F through
`createCoordinateState`; **U0** then sets `host.loaded=false`, and **C0** injects
`setLines: undefined`. Each success assertion compares
`{result,count,lines,warnings}`; each failure assertion compares
`{result,count,lines}`. The tables spell these tuples in that field order.

| Full case                               | Fixture | Mutation / command / exit | Observed actual | Expected       | Restoration |
| --------------------------------------- | ------- | ------------------------- | --------------- | -------------- | ----------- |
| `deletes middle empty line`             | F       | R / R / 1; S / U / 1      | `0,3,F,1`       | `0,2,[L,L],0`  | U+ / 0      |
| `deletes final line without empty tail` | F       | R / R / 1; S / U / 1      | `0,3,F,1`       | `0,2,[L,''],0` | U+ / 0      |
| `delete all leaves one empty line`      | F       | R / R / 1; S / U / 1      | `0,3,F,1`       | `0,1,[''],0`   | U+ / 0      |
| `deletes inclusive range`               | F       | R / R / 1; S / U / 1      | `0,3,F,1`       | `0,1,[L],0`    | U+ / 0      |
| `clamps oversized end`                  | F       | R / R / 1; S / U / 1      | `0,3,F,1`       | `0,1,[L],0`    | U+ / 0      |
| `deletes middle empty line`             | F       | V / U / 1                 | `1,2,[L,L],0`   | `0,2,[L,L],0`  | U+ / 0      |
| `deletes final line without empty tail` | F       | V / U / 1                 | `1,2,[L,''],0`  | `0,2,[L,''],0` | U+ / 0      |
| `delete all leaves one empty line`      | F       | V / U / 1                 | `1,1,[''],0`    | `0,1,[''],0`   | U+ / 0      |
| `deletes inclusive range`               | F       | V / U / 1                 | `1,1,[L],0`     | `0,1,[L],0`    | U+ / 0      |
| `clamps oversized end`                  | F       | V / U / 1                 | `1,1,[L],0`     | `0,1,[L],0`    | U+ / 0      |

For every invalid row below, **R/R**, **S/U**, and **V/U** each exited **1**
with the independently observed tuple **`0,3,F`**, expected **`1,3,F`**.
**I/I** independently exited **1** with **`1,2,[L,L]`**, expected **`1,3,F`**.
Thus the text-preservation fields demonstrably fail even while failure status
remains correctly 1. Each restoration used `apply_patch`, then U+ (24 passed,
exit 0); no assertion or expected value was weakened.

| Full case                                                              | Fixture | Arguments       | Return control actual → expected (R/S/V) | No-mutation control actual → expected (I) | Restoration |
| ---------------------------------------------------------------------- | ------- | --------------- | ---------------------------------------- | ----------------------------------------- | ----------- |
| `invalid range or buffer leaves text untouched [zero first]`           | F       | `0,0`           | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [negative first]`       | F       | `0,-1`          | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [past last first]`      | F       | `0,4`           | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [reversed range]`       | F       | `0,3,2`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [zero last]`            | F       | `0,1,0`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [fractional first]`     | F       | `0,1.5`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [fractional last]`      | F       | `0,1,2.5`       | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [invalid first string]` | F       | `0,'invalid'`   | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [invalid last string]`  | F       | `0,1,'invalid'` | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [nonzero buffer]`       | F       | `1,2`           | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [negative buffer]`      | F       | `-1,2`          | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [fractional buffer]`    | F       | `0.5,2`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [nil buffer]`           | F       | `nil,2`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [boolean buffer]`       | F       | `false,2`       | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [string buffer]`        | F       | `'0',2`         | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [missing first]`        | F       | `0`             | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `invalid range or buffer leaves text untouched [extra argument]`       | F       | `0,1,2,3`       | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `unloaded buffer leaves text untouched`                                | U0      | `0,2`           | `0,3,F` → `1,3,F`                        | `1,2,[L,L]` → `1,3,F`                     | U+ / 0      |
| `callback unavailable leaves text untouched`                           | C0      | `0,2`           | `0,3,F` → `1,3,F`                        | Not run: no setter exists                 | U+ / 0      |

## Phase 4 public host records

File: **`test/specs/lua-coordinate-contract.e2e.ts`**, group
**`Lua coordinate contract`**. Each of the two new cases has one composite
assertion on **`{initial,source,result,text,count}`**, with native
`editor.lineCount()` and exact untrimmed host text. Public mappings `gD`/`gA`
call the real Lua handler. The register probe is read numerically: the original
stub pushes a Lua float (`tostring(0)` is `"0.0"`), which must not become a
spurious integer-formatting regression instead of testing deletion.

| Full case                                                    | Fixture                    | Mutation / command / exit | Observed actual          | Expected               | Restoration |
| ------------------------------------------------------------ | -------------------------- | ------------------------- | ------------------------ | ---------------------- | ----------- |
| `coordinate contract deletebufline mutates host buffer`      | F, source                  | S / E / 1                 | `TEXT,true,0,TEXT,3`     | `TEXT,true,0,L+'\n',2` | E+ / 0      |
| `coordinate contract deletebufline all leaves one host line` | F, source                  | S / E / 1                 | `TEXT,true,0,TEXT,3`     | `TEXT,true,0,'',1`     | E+ / 0      |
| `coordinate contract deletebufline mutates host buffer`      | F, source                  | H / E / 1                 | `TEXT,true,0,L+'\n\n',3` | `TEXT,true,0,L+'\n',2` | E+ / 0      |
| `coordinate contract deletebufline mutates host buffer`      | F, source                  | V / E / 1                 | `TEXT,true,1,L+'\n',2`   | `TEXT,true,0,L+'\n',2` | E+ / 0      |
| `coordinate contract deletebufline all leaves one host line` | F, source                  | V / E / 1                 | `TEXT,true,1,'',1`       | `TEXT,true,0,'',1`     | E+ / 0      |
| `coordinate contract deletebufline mutates host buffer`      | F → single L, live preview | P / P / 1                 | `L,false,1,L,1`          | `TEXT,true,0,L+'\n',2` | P+ / 0      |
| `coordinate contract deletebufline all leaves one host line` | F → single L, live preview | P / P / 1                 | `L,false,0,'',1`         | `TEXT,true,0,'',1`     | P+ / 0      |

Measured WDIO command times (excluding build): H **10.177s**, H+ **10.108s**;
S **10.128s**, S+ **10.054s**; V **10.394s**, V+ **10.300s**;
P **11.292s**, P+ **10.543s**. The initial unmodified-stub e2e red run also
failed both cases (9.983s); its additional `"0.0"` versus `"0"` formatting
difference was removed from the probe before S, where both statuses read **0**
and only the unchanged buffer caused the two failures.

## Phase 4 final QA and remaining gate

The required Phase 4 command ran successfully:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'coordinate contract deletebufline' && printf 'COORD-DELETE UNIT PASS\n' && npm run build:dev && nix develop --command bash -c 'time npx wdio run ./wdio.conf.mts --spec test/specs/lua-coordinate-contract.e2e.ts --spec test/specs/lua-plugin-mini-comment.e2e.ts --spec test/specs/lua-vim-fn.e2e.ts' && printf 'COORD-DELETE E2E PASS\n'
```

Both markers printed; exit **0**. Unit: **24 passed** (137 other-phase cases
filtered). E2E: **3/3 specs**, **60 passed**, **3 existing mini.comment skips**,
no new skips. The skips were the pre-fetched plugin fetch test and the existing
empty-line/visual-mode cases, not fixture absence. Measured WDIO time:
**137.181s**. Full `npm run test:unit`: **2546 passed, 6 skipped**, 125 files,
exit **0**. `npx tsc --noEmit --skipLibCheck`: exit **0**.

All five review areas passed (goals, execution, code, security, context).
The context review confirmed `main.ts`'s separate `executeLuaForTest` splice
is test-only; normal config uses `loadInitLua`. It is outside the explicitly
scoped production callback fix, and these new public probes do not use it.

**Staging remains blocked by existing LSP errors**, not runtime QA.
`lsp_diagnostics` is clean for `fn.ts`, `loader.ts`, and `coordinate-harness.ts`.
The e2e file has no errors/warnings (six await-type hints); Markdown has no
configured LSP server. `coordinate-contract.test.ts` reports **seven errors**:
TS2732 at 4 (JSON import needs `resolveJsonModule`), downstream TS2345 at 160
and TS7006 at 181/202/223, TS2345 at 592 (indexed first line), TS2322 at 722
(indexed empty line). `git diff` confirms this phase only inserts its new
84-line group: all seven sites and the relevant unit tsconfig are unchanged
from `31955c3`. They were not repaired because Phases 1–3 are explicitly frozen.

## Phase 5 audit provenance and measured findings

Executed 2026-09-09 after `df55325`. This phase changes no API implementations,
behavior suites, documentation, or mini.comment pin. The four-category audit
records incompatibilities; its green result is **not** a compatibility pass.
Both plugins are BLOCKED. All new assertions belong to
`test/unit/lua/plugin-api-demand.test.ts`.

Pinned source acquisition (exit **0**): `bash scripts/fetch-test-plugins.sh`.
Selected `nvim-mini/mini.nvim@25f25d3e6661d942323e56711096de1850d814ec`, only
`lua/mini/surround.lua` and `lua/mini/splitjoin.lua`. The pre-existing
`echasnovski/mini.comment@main` reproducibility issue is flagged, not changed.
Independent archive-stream hash checks both exited **0**:

```bash
set -o pipefail; curl -fsSL https://github.com/nvim-mini/mini.nvim/archive/25f25d3e6661d942323e56711096de1850d814ec.tar.gz | tar -xzO mini.nvim-25f25d3e6661d942323e56711096de1850d814ec/lua/mini/surround.lua | sha256sum
set -o pipefail; curl -fsSL https://github.com/nvim-mini/mini.nvim/archive/25f25d3e6661d942323e56711096de1850d814ec.tar.gz | tar -xzO mini.nvim-25f25d3e6661d942323e56711096de1850d814ec/lua/mini/splitjoin.lua | sha256sum
```

Observed SHA-256: surround
`4f02f52cbf9d4b52389d001454d24811089df50d1ae6c7a5ff8f3b5a971303e0`;
splitjoin `b9dfb867e26503417eae366b465a360684930caef8f7c12b3e5e6983c6229b96`.
These equal the fetched-file digests independently recorded in
`mini-api-demand.json`. The artifact's demand tuples are the manually reviewed
name/line/form/reachability checklist, not a list obtained from API status docs.

The complete native UTF return arity was independently re-measured:

```bash
nvim --headless -u NONE -i NONE -c 'lua local s="é→𝄞界\tZ"; print(vim.inspect({utf_all={vim.str_utfindex(s)},utf_old={vim.str_utfindex(s,13)},utf16=vim.str_utfindex(s,"utf-16",13),utf32=vim.str_utfindex(s,"utf-32",13),byte_old=vim.str_byteindex(s,5),byte16=vim.str_byteindex(s,"utf-16",5),byte32=vim.str_byteindex(s,"utf-32",5)}))' -c 'qa!'
```

Exit **0**: `utf_all={6,7}`, `utf_old={5,6}`, `utf16=6`, `utf32=5`,
`byte_old=13`, `byte16=12`, `byte32=13`. Live sandbox probes return
`0;0;0;0` for the four UTF-index calls and `0;0;0` for byte-index calls,
**one return value each, zero warnings**. Phase **5b**, not this audit, owns
the fix. The five `str_*` names, seven encoding/URI names, eleven additional
treesitter placeholders, and four I/O placeholders are all individually
probed; `silentInventory` records their actual results and zero-warning counts.

Initial complete audit run:
`npx vitest run test/unit/lua/plugin-api-demand.test.ts` exited **0**, **140
passed**. Source discovery measured **61 names / 128 sites** (surround) and
**33 names / 58 sites** (splitjoin), no uncovered/unresolved accesses. Optional
external nvim-treesitter modules are absent in this fixed installation; the
guard requires a fresh transitive audit if those modules are later installed.

The initial load measurement exposed splitjoin's real additional blocker:
unmodified `setup({})` raises **string expr mappings are not supported
(requires Vimscript evaluation)** at its default `gS` mapping. This is a
required-form defect in a real `vim.keymap.set` handler, not an absent API.
The gate records one load-blocker separately from its four core-path blocker
groups. Surround has zero load-blockers and seven core-path blocker groups.
Source membership and actual private runtime registries agree: API
**69 supported / 88 fallback / 157 known**, fn **92 real registrations / 39
effective declared placeholders / 131 total**, with three fewer fn names
without async callbacks. Of the fn placeholders, 37 warn once; `system` and
`systemlist` intentionally reject. Three API fallbacks have implicit nil
return types (`nvim_buf_add_highlight`, `nvim_del_augroup_by_id`,
`nvim_set_extmark`); they still warn once, not silently.

# Phase 5b string-coordinate controls

Executed 2026-09-09 from `/home/saberzero1/Repos/motions`, baseline `5ad6784`.
Only Phase 5b is implemented. Phase 6/7 remain blocked; Phase 8 owns public
documentation. The historical Phase 5 JSON artifact is deliberately unchanged.

## Native contract and red-first evidence

Native `nvim --headless -u NONE -i NONE` reported **0.12.5**. Measurements used
`pcall(vim[name], s, unpack(args))` and preserved all return values in a table.
The reviewed results were added to the plan's shared fixture specification
**before implementing** any of the five handlers. Fixture **S** is
`é→𝄞界\tZ`; **E** is its empty second line; **C** is S plus U+0301.

- `str_utf_start(S,1..14)` → `[0,-1,0,-1,-2,0,-1,-2,-3,0,-1,-2,0,0]`.
- `str_utf_end(S,1..14)` → `[1,0,2,1,0,3,2,1,0,2,1,0,0,0]`.
- Both take **1-based bytes**, return **relative byte displacements**, reject
  `-1/0/15/99` and E's index 1, accept numeric string `'7'`, truncate 1.5,
  and ignore extra arguments (including `false`; it is not strictness).
- `str_utf_pos(S)` → `[1,3,6,10,13,14]`, **1-based byte starts** of code points;
  extra encoding/index arguments are ignored, E → `[]`, C →
  `[1,3,6,10,13,14,15]`. No input index/base exists for this API.
- Modern conversion strict=false maps negative/out-of-range UTF-16/32 indices
  to the end; UTF-8 preserves negative identity. Old forms remain strict;
  old byteindex's third argument selects UTF-16, not strictness. String
  interior indices round **up**, unlike D4's editor cursor ingress.

`npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'str family'`
ran against the actual old stdlib placeholders: exit **1**, **182 failed,
36 passed**, 161 unrelated cases excluded. Every observed warning count was
**0**. Scalar placeholders produced 0, old multi-return cases produced the
single value `"0"`, pos produced `""` (empty list). Invalid scalar calls
produced `"success: 0"` instead of errors; pos's invalid-text call produced
`"success: nil"`. The 36 zero/empty cases were subsequently killed by R below,
not counted as red-first proof.

`npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'coordinate manifest coverage'`
exited **1** before JS registrations existed: unregistered was
`['vim.str_byteindex','vim.str_utfindex','vim.str_utf_start','vim.str_utf_end','vim.str_utf_pos']`,
expected `[]`. No missing/import errors were used as feature evidence.

## Reproducible mutation commands

All mutations below are confined to freshly injected, disposable Lua states;
`finally` destroys the state and restores the warning spy after each row.
No production sabotage is retained. Restoration is the same command without
the `COORD_*_CONTROL` assignment; its results are recorded below.

```bash
# P: exact original silent placeholder; then restore by omitting the env assignment
COORD_STR_CONTROL=placeholder npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'str_utfindex old byte 13 returns two values'
# A: discard the old form's second return
COORD_STR_CONTROL=single npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'str_utfindex old byte 13 returns two values'
# U: send modern UTF-16 calls to UTF-32 instead
COORD_STR_CONTROL=conflated npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'str_byteindex utf-16 unit 5'
# R: replace each targeted handler with return 999 (or {999} for list rows)
COORD_STR_CONTROL=results npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'str family|vim.str_' --reporter=json --outputFile=/tmp/opencode/phase5b-results.json
# W: add one warning independently of the real result
COORD_STR_CONTROL=warnings npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'str family|vim.str_' --reporter=json --outputFile=/tmp/opencode/phase5b-warnings.json
# RW restoration (executed after each R and W run)
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'str family|vim.str_'
# D: prevent all five live promotions via a disposable return-0 replacement
COORD_DEMAND_CONTROL=promotions npx vitest run test/unit/lua/plugin-api-demand.test.ts -t 'Phase 5b promotions'
# K: delete actual API bindings while retaining expected native classifications
COORD_DEMAND_CONTROL=categories npx vitest run test/unit/lua/plugin-api-demand.test.ts -t 'vim.str_' --reporter=json --outputFile=/tmp/opencode/phase5b-categories.json
# G: omit a still-silent candidate (iconv is NOT implemented in this phase)
COORD_DEMAND_CONTROL=registry npx vitest run test/unit/lua/plugin-api-demand.test.ts -t 'source-derived silent candidates'
# B: omit a still-required blocker name (set-text is NOT fixed in this phase)
COORD_DEMAND_CONTROL=checklist npx vitest run test/unit/lua/plugin-api-demand.test.ts -t 'exact blocker name sets'
# D/K/G/B restoration
npx vitest run test/unit/lua/plugin-api-demand.test.ts -t 'plugin API-demand audit'
```

An initial P invocation used `-t 'str family > str_utfindex old byte 13 returns two values'`;
Vitest's filter does not include `>` separators, so it selected **zero** tests.
That invocation is **not evidence**. The corrected exact commands above ran
the named assertions and failed as shown here.

| Full case under `coordinate contract str family` | Fixture | Assertion                       | Observed actual        | Expected                | Command / exit | Restored result                           |
| ------------------------------------------------ | ------- | ------------------------------- | ---------------------- | ----------------------- | -------------- | ----------------------------------------- |
| `str_utfindex old byte 13 returns two values`    | S       | old return tuple and no warning | `"0"`, warnings **0**  | `"5:6"`, warnings **0** | P / 1          | same filter without env: 1 passed, exit 0 |
| `str_utfindex old byte 13 returns two values`    | S       | both old returns retained       | `"5"`, warnings **0**  | `"5:6"`, warnings **0** | A / 1          | same filter without env: 1 passed, exit 0 |
| `str_byteindex utf-16 unit 5`                    | S       | UTF-16 is not code points       | **13**, warnings **0** | **12**, warnings **0**  | U / 1          | same filter without env: 1 passed, exit 0 |

## Every generated row: R and W records

Both test files execute the **same 218 named fixture rows**, independently:

- `test/unit/lua/coordinate-contract.test.ts` → `coordinate contract str family <API> <row.name>`.
- `test/unit/lua/coordinate-manifest.test.ts` → `coordinate manifest conformance vim.<API> <row.name>`.

`<API>`, each complete `row.name`, the exact S/E/C argument expression, and the
literal expected result are recorded in `STRING_COORDINATE_CASES` in
`test/fixtures/neovim-string-coordinate-contract.ts`. The following compact
parameter-family records enumerate those names and literal values; numeric
ranges denote **separate executed tests**, never a loop hidden behind an early
assertion. Each row compares `{actual, warnings}` in one assertion.

R exited **1**, **436 failed / 0 passed**; each scalar observed **999**, each
old-return or list row observed **`"999"`**, each error row observed
**`"success: 999"`**; all warning counts remained **0**. W exited **1**,
**436 failed / 0 passed**: actual values matched the native values below, but
each observed warning count was **1**, expected **0**. Both RW restorations
exited **0**, **436 passed**, no selected case skipped. Reports reside at the
explicit paths in R/W commands; the durable observations are the tables here.

| API / full parameter-name family                                                    | Fixture / indices                                            | Expected values in parameter order (R actual as above; W actual equals this column)                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `str_utfindex old omitted returns two values`                                       | S                                                            | `6:7`                                                                                                                        |
| `str_utfindex old byte {i} returns two values`                                      | S, i=0..14                                                   | `0:0, 1:1, 1:1, 2:2, 2:2, 2:2, 3:4, 3:4, 3:4, 3:4, 4:5, 4:5, 4:5, 5:6, 6:7`                                                  |
| `str_utfindex utf-16 byte {i}`                                                      | S, i=0..14                                                   | `[0,1,1,2,2,2,4,4,4,4,5,5,5,6,7]`                                                                                            |
| `str_utfindex utf-32 byte {i}`                                                      | S, i=0..14                                                   | `[0,1,1,2,2,2,3,3,3,3,4,4,4,5,6]`                                                                                            |
| `str_utfindex empty old` / `fractional old`                                         | E / S,1.5                                                    | `0:0` / `1:1`                                                                                                                |
| `str_byteindex old code point {i}` / `old false code point {i}` / `utf-32 unit {i}` | S, i=0..6, each form separately                              | `[0,2,5,9,12,13,14]`                                                                                                         |
| `str_byteindex old true UTF-16 unit {i}` / `utf-16 unit {i}`                        | S, i=0..7, each form separately                              | `[0,2,5,9,9,12,13,14]`                                                                                                       |
| `str_byteindex empty old` / `fractional old`                                        | E / S,1.5                                                    | 0 / 2                                                                                                                        |
| both converters: `{encoding} bounds {i} strict {flag}`                              | S; enc=utf-8/16/32; i=-1/99; flag=true/false, all 12 per API | true: `index out of range`, except utf-8,-1 → -1. false: byteindex → 14, utfindex utf-8/16/32 → 14/7/6, except utf-8,-1 → -1 |
| both converters: `{encoding} omitted index`                                         | S; utf-8/16/32                                               | utfindex → 14/7/6; byteindex → error contains `index: expected number`                                                       |
| both converters: `{encoding} empty`                                                 | E; utf-8/16/32,0                                             | 0                                                                                                                            |
| both converters: `utf-8 identity {i}`                                               | S; i=0,1,6,13,14                                             | `[0,1,6,13,14]`                                                                                                              |
| both converters: `old strict bounds {i}` / `default strict bounds`                  | S; i=-1/99; modern utf-16,99                                 | error contains `index out of range`                                                                                          |
| both converters: `invalid encoding` / `invalid index` / `invalid strict`            | S; bad,1 / utf-16,false / utf-16,1,0                         | errors contain `invalid encoding` / `index: expected number` / `strict_indexing: expected boolean`                           |
| both converters: `zero bypasses encoding` / `negative fraction`                     | S; bad,0 / utf-16,-0.5                                       | 0 / 0                                                                                                                        |
| both converters: `fractional modern`                                                | S; utf-16,1.5                                                | utfindex → 1; byteindex → 2                                                                                                  |
| `str_utf_start byte {i}`                                                            | S; i=1..14                                                   | `[0,-1,0,-1,-2,0,-1,-2,-3,0,-1,-2,0,0]`                                                                                      |
| `str_utf_end byte {i}`                                                              | S; i=1..14                                                   | `[1,0,2,1,0,3,2,1,0,2,1,0,0,0]`                                                                                              |
| start/end: `bounds {args}`                                                          | `S,-1`; `S,0`; `S,15`; `S,99`; `'',1`; `S .. '́',17`          | error contains `index out of range`, each                                                                                    |
| start/end: `invalid index {args}` / `invalid text`                                  | `S`; `S,true`; `S,{}` / `{},1`                               | `number expected` / `string expected`                                                                                        |
| start/end: `numeric string` / `extra false is ignored`                              | `S,'7'` / `S,7,false`                                        | start → -1; end → 2                                                                                                          |
| start/end: `fraction truncates`                                                     | S,1.5                                                        | start → 0; end → 1                                                                                                           |
| start/end: `composing first byte` / `composing last byte`                           | C,15 / C,16                                                  | start → 0/-1; end → 1/0                                                                                                      |
| `str_utf_pos code point byte starts` / `ignored extra {arg}`                        | S; no extra, `'utf-16'`, `'utf-32'`, false, -1, 99           | `1:3:6:10:13:14`                                                                                                             |
| `str_utf_pos empty` / `composing suffix` / `invalid text`                           | E / C / {}                                                   | `""` / `1:3:6:10:13:14:15` / error contains `string expected`                                                                |

## Audit projection and guard evidence

The first post-implementation Phase 5 audit exited **1**, **8 failures**:
the two demanded conversions and five silent-inventory probes returned real
native results instead of the historical silent values, and source discovery
found **33** constant candidates instead of **38** (exactly the five removed
placeholders). This is the guard working, not an excuse to change the JSON
expectations. The live projection now promotes only dispatch observations
matching the independently measured native fixture **and zero warnings**.
The historical artifact, pins, source-site checklist, and unrelated blocker
ownership are preserved.

| Full case under `plugin API-demand audit Phase 5b promotions` | D observed actual                                                   | Expected                                   | Exit / restoration |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ | ------------------ |
| `vim.str_byteindex`                                           | `silent; 0;0;0; warnings=0`                                         | `real; 13;12;13; warnings=0`               | 1 / 0              |
| `vim.str_utfindex`                                            | `silent; 0;0;0;0; warnings=0`                                       | `real; 6,7;5,6;6;5; warnings=0`            | 1 / 0              |
| `vim.str_utf_start`                                           | `silent; 0; warnings=0`                                             | `real; -1; warnings=0`                     | 1 / 0              |
| `vim.str_utf_end`                                             | `silent; 0; warnings=0`                                             | `real; 2; warnings=0`                      | 1 / 0              |
| `vim.str_utf_pos`                                             | `real; 0; warnings=0` (wrong non-placeholder result still rejected) | `real; [1,3,6,10,13,14]; warnings=0`       | 1 / 0              |
| `removes exactly the two UTF core blockers`                   | `[]` removed                                                        | `['utf-byteindex','utf-utfindex']` removed | 1 / 0              |

K: each of the seven affected existing category/inventory cases (two under
`plugin API-demand audit category mini.surround`, all five under
`plugin API-demand audit silent placeholder inventory`) observes **absent**,
result `""`, warnings **0**, instead of **real** and the five native strings
above. The five promotion cases remain real because K mutates each assertion's
fresh sandbox, not the projection observations. K exits **1**.

G: `plugin API-demand audit source-derived silent candidates` observed **33**
candidates including `src/lua/stdlib.ts#vim.iconv`, expected **32** without it;
exit **1**. Its old negative-control target was `str_utfindex`; it legitimately
left the silent category, so the control now targets untouched `iconv`.
B: `plugin API-demand audit exact blocker name sets` observed `set-text-bytes: []`,
expected `set-text-bytes: ['vim.api.nvim_buf_set_text']`; exit **1**. Its old
control target was the retired `utf-byteindex` blocker. This changes only the
test sabotage, not the implementation or ownership of set-text.

The restored full audit command exited **0**, **156 passed**, zero skipped:
surround **61 names / 128 sites**, splitjoin **33 names / 58 sites**, zero
uncovered/unresolved accesses or fixture-hash mismatches. Surround's core list
shrunk from seven to exactly five: `surround-highlight`, `echospace`,
`getchar-context`, `input-context-and-form`, `set-text-bytes`. Both plugins
remain **BLOCKED**, not GO. No Phase 6/7 behavior suite was created or run.

## Final QA observations

After formatting with `npx prettier --write` on every changed/new file, the
Phase 5b QA commands ran: manifest **387 passed**, reporting exactly
**15/15 APIs exercised; 0 missing; 0 mismatches**; str family **218 passed**
(161 unrelated cases excluded by the requested filter). Full
`npm run test:unit`: **126 files passed, 3138 tests passed / 6 existing skipped**,
an increase of **442** assertions (218 contract + 218 manifest + 6 audit).
The existing stdlib-only regression suite also passed **43/43**.

All nine touched TypeScript files received explicit `lsp_diagnostics` calls:
**no diagnostics**. Both Markdown files were also explicitly requested;
the tool reported **no Markdown LSP configured**. The ignored local plan
contains the native specification; no public docs were edited.

The first `npm run verify` attempt stopped at lint: the new contract test's
conditional `expect.stringContaining(...)` matcher construction triggered
`vitest/no-conditional-expect`. It was moved into the same unconditional
matcher helper pattern already used by the manifest test; the assertion and
all expected values are unchanged. No rule suppression or assertion-name
allowlist was added. The subsequent gate/build result is reported by the
executor rather than predicted here.

## Phase 8 — source-derived documentation guard

Date: 2026-09-09. Test file: `test/unit/lua/api-status-counts.test.ts`.
The subject is the actual `NEOVIM_API_STATUS.md` and historical sentence in
`CHANGELOG.md`, checked against `src/lua/api.ts` and `src/lua/fn.ts` through
Phase 5's TypeScript-AST `collectApiInventory` / `collectFnInventory`.
No second source inventory or production implementation was added.

Full case names (aliases used in the tables below):

- **A:** `API status guard registration totals match source` — one compound
  assertion covering dispatch, both authoritative registry rows, independent
  API/fn total prose, the implemented-fn heading and the no-runner inventory.
- **B:** `API status guard per-name rows and summary agree` — one compound
  assertion covering exact handler/status membership, conflicting duplicates,
  API/fn canonical-name subtotals and separately listed public unknown names.
- **C:** `API status guard duplicate declarations do not inflate effective stubs`
  — one compound assertion covering declared/effective/total counts and the
  real `getwininfo` classification in the historical duplicate fixture.
- **D:** `API status guard historical baseline is explicit` — one compound
  assertion covering the reconstructed pre-work source baseline and both
  documents' explicitly historical sentences.

### Red-first document evidence

Before editing any count prose, the new guard ran against the original docs
at `55b2caa`, with current source from completed Phases 1–5b:

```bash
npx vitest run test/unit/lua/api-status-counts.test.ts -t 'API status guard'
```

Observed exit **1**, **3 failed / 1 passed**, no skipped cases. These were
feature assertion failures, not imports or setup errors:

| Case / assertion field            | Observed actual                                                                                                      | Expected                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A: dispatch                       | `[63,97,84,46]`                                                                                                      | `[69,88,92,39]`                                                                     |
| A: authoritative API              | `[63,94,157]`                                                                                                        | `[69,88,157]`                                                                       |
| A: authoritative fn               | `[84,46,130]`                                                                                                        | `[92,39,131]`                                                                       |
| A: fn total / implemented heading | `130` / `84`                                                                                                         | `131` / `92`                                                                        |
| A: no-runner figure               | `undefined`                                                                                                          | `[89,39,128]`                                                                       |
| B: public API summary             | `[46,14,95,0,9]`                                                                                                     | Original per-name rows derived `[48,15,92,0,9]`; missing registry row also reported |
| B: membership                     | 15 named errors: 13 promoted names still documented as stubs, plus missing `nvim_set_extmark` and `virtcol2col` rows | `[]`                                                                                |
| B: public unknown-name inventory  | `[]`                                                                                                                 | The nine `nvim_ui_*` names now explicitly listed in the status document             |
| D: status/changelog provenance    | `undefined` / `undefined`                                                                                            | Each `[63,94,157,84,46,130]`                                                        |

The API total prose was already **157**, matching source: it was not
"corrected". The original public table had a separate missing compatibility
row and must not be replaced with the registry's denominator. After doc edits,
the same command exited **0**, **4 passed**, on 2026-09-09 at 16:31:44.
Final public API categories are `[45,24,87,0,9]` (**165** names including nine
public N/A names, excluding private `nvim__redraw`); fn categories are
`[81,11,37,0,2]` (**131**, including two intentionally rejecting N/A stubs).

### Disposable mutation controls and immediate restoration

Every control below mutates only an in-memory copy of one source/doc fixture.
The source files and Markdown on disk are never sabotaged. Each control ran
all four cases independently, followed immediately by the restored suite:

```bash
COORD_DOC_CONTROL=<control> npx vitest run test/unit/lua/api-status-counts.test.ts -t 'API status guard'
env -u COORD_DOC_CONTROL npx vitest run test/unit/lua/api-status-counts.test.ts -t 'API status guard'
```

For **each of the sixteen control values** below, the first command exited
**1**, **1 failed / 3 passed**; its restoration command exited **0**,
**4 passed**, no skipped tests. Runs occurred at 16:36:27–16:37:25 (first
fourteen controls) and 16:38:17–16:38:24 (last two). `<control>` is replaced
literally by the first column; there is no hidden unexecuted parameter family.

| Control                 | Case / fixture mutation                                                                                            | Observed actual                                                                                                                                              | Expected                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `total`                 | A: increment only `KNOWN_NVIM_API_FUNCTIONS` total prose                                                           | `apiTotal: 158`                                                                                                                                              | `157`                                                                                            |
| `dispatch`              | A: restore stale API tier-2 prose to 97                                                                            | Dispatch `[69,97,92,39]`                                                                                                                                     | `[69,88,92,39]`                                                                                  |
| `authoritative`         | A: increment only authoritative API total cell                                                                     | `[69,88,158]`                                                                                                                                                | `[69,88,157]`                                                                                    |
| `summary`               | B: increment public implemented subtotal                                                                           | `[46,24,87,0,9]`                                                                                                                                             | `[45,24,87,0,9]`                                                                                 |
| `historical-summary`    | B: restore old implemented/limited cells 46 and 14                                                                 | `[46,14,87,0,9]` (60 real)                                                                                                                                   | `[45,24,87,0,9]` (69 real)                                                                       |
| `missing-handler`       | B: rename only the `nvim_buf_get_offset` handler registration to `nvim_guard_fake`; registry counts stay unchanged | Three errors: `nvim_buf_get_offset: missing handler`, `nvim_guard_fake: handler missing supported declaration`, `nvim_guard_fake: missing known declaration` | `[]`                                                                                             |
| `missing-row`           | B: delete only documented `nvim_buf_get_offset` row                                                                | `nvim_buf_get_offset: missing documented row`; summary implemented 45                                                                                        | `[]`; per-name implemented 44                                                                    |
| `conflict`              | B: append a conflicting stub signature for existing real `nvim_get_current_buf`                                    | `nvim_get_current_buf: documented 🔲, source real` and `nvim_get_current_buf: ✅ / 🔲`; summary `[45,24,87,0,9]`                                             | `[]`; mutated rows derive `[44,24,88,0,9]`                                                       |
| `misclassified`         | B: classify real `getwininfo` as a documented stub                                                                 | `getwininfo: documented 🔲, source real`; fn summary `[81,11,37,0,2]`                                                                                        | `[]`; mutated rows derive `[80,11,38,0,2]`                                                       |
| `unknown`               | B: add unregistered public N/A row `nvim_guard_unknown`                                                            | Public N/A 9; inventory still the nine UI names                                                                                                              | N/A 10; inventory includes `nvim_guard_unknown` plus the nine UI names                           |
| `historical`            | D: restore released changelog's stale 60/97/157                                                                    | Changelog `[60,97,157,84,46,130]`                                                                                                                            | `[63,94,157,84,46,130]`                                                                          |
| `status-historical`     | D: corrupt only status document's historical stub count                                                            | Status `[63,97,157,84,46,130]`                                                                                                                               | `[63,94,157,84,46,130]` (97 versus baseline source 94)                                           |
| `duplicate`             | C: retain historical duplicate stub but remove real `getwininfo` handler                                           | `{declared:47,effective:47,total:130,getwininfo:'stub'}`                                                                                                     | `{declared:47,effective:46,total:130,getwininfo:'real'}`                                         |
| `baseline`              | D: leave `nvim_buf_get_offset` promoted in reconstructed baseline                                                  | Source `[64,93,157,84,46,130]`; doc/changelog stay `[63,94,157,84,46,130]`                                                                                   | Source `[63,94,157,84,46,130]`; doc/changelog must equal derived source, not unrelated constants |
| `duplicate-declaration` | C: remove historical duplicate declaration while retaining real handler                                            | Declared 46, effective 46, total 130, real                                                                                                                   | Declared 47, effective 46, total 130, real                                                       |
| `duplicate-total`       | C: insert extra `guard_fake` stub in duplicate fixture                                                             | Declared 48, effective 47, total 131, real                                                                                                                   | Declared 47, effective 46, total 130, real                                                       |

The old strings **97** and **46 + 14** are retained as executable mutation
fixtures after the source advanced. The red-first rows independently observed
the historical public real subtotal **48 + 15 = 63**. The compensated
handler-name control proves that correct arithmetic alone cannot pass the
guard. Historical duplicates are reconstructed in memory, not falsely claimed
to remain in current source.

### Phase 8 gate ruling and changelog review

The user resolved the Phase 8:499 sequencing gap: the development-build gate is
`npm run build:dev` (must exit 0). E2E is conditionally waived only if the staged
diff has no `src/` path. After `git add -A`, run exactly:

```bash
git diff --cached --name-only | grep '^src/'
```

An empty match (grep exit 1) selects the docs/test-only waiver. Any match voids
it and requires `nix develop -c npx wdio run ./wdio.conf.mts --spec
test/specs/lua-plugin-mini-comment.e2e.ts`, with Bash timeout **900000 ms**.
This ruling does not reopen cancelled Phases 6/7 or authorize runtime changes.

Reviewed `git diff -- CHANGELOG.md`: the only new release content is under
Unreleased, with exactly **Fixed → Tests → Documentation**, once each. The only
released-content change is the permitted in-place historical 0.148.0 sentence
correction (old line 250), not an appended feature or a duplicate heading.
Final static/build/waiver command outcomes are reported by the executor after
execution, not predicted here.

## Remaining seams — Phase 1 text bytes (2026-09-09)

Baseline: clean `19e807b`. Scope: text get/set only; D5 is binding. The literal
fixtures are in `neovim-text-coordinate-contract.ts`. Each row is exercised
through real Lua dispatch in both `coordinate-contract.test.ts` and the
generated `coordinate-manifest.test.ts`; the same controls killed both copies.
`F` below means `é→𝄞界\tZ`, with a literal tab. Ordinary write cases start with
`[F]`; multiline cases start with `[F, '', F]`. No expected value is computed
through the adapter. Raw reads are observed with Lua `string.byte` and rendered
as hex, not decoded into a JS string.

Commands (all from the repository root; all mutations applied and removed with
`apply_patch`, never git undo):

```bash
# T0: original UTF-16 handlers, after adding the tests and host replacement mock
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'text bytes|nvim_buf_(get|set)_text'
# T1: decode/re-encode byte slices; off-by-one read clamps
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'get_text.*(interior|past EOL)'
# T2: write uses read bounds; raw byte splice instead of D5 normalization
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'set_text.*(D5|past EOL)'
# T3: ASCII read begins one byte late, host write ends one unit early;
# both manifest text names temporarily suffixed _MISSING
npx vitest run test/unit/lua/api.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'nvim_buf_set_text calls replaceRange|should implement nvim_buf_get_text|requires exactly seventeen'
# T4: adapter textRange line count temporarily zero
npx vitest run test/unit/lua/api.test.ts -t 'nvim_buf_set_text calls replaceRange|should implement nvim_buf_get_text'
```

### Per-assertion observations

The names below are the full fixture case names minus their `get_text` or
`set_text` prefix. Every row is a separate assertion, so failures do not mask
other parameter rows. T0 exited 1: **28 failed / 4 passed** (two copies of 16
cases). T1 killed the two read-clamp cases that passed T0 as well as the raw read:
**6 failed**, exit 1. T2: **10 failed**, exit 1.

| API / case                                            | Control | Observed actual                                                     | Expected                                           |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| get / native match accented byte span                 | T0      | `é→`                                                                | `é`                                                |
| get / native match arrow byte span                    | T0      | `𝄞界`                                                               | `→`                                                |
| get / native match astral byte span                   | T0      | `\tZ`                                                               | `𝄞`                                                |
| get / interior raw bytes are a native match           | T0; T1  | hex `e28692eda0b4`; hex `efbfbdefbfbd` (two replacement characters) | hex `a9e2`                                         |
| get / past EOL clamps natively unlike set_text        | T1      | `é→𝄞界\t`                                                           | `é→𝄞界\tZ`                                         |
| get / native match multiline byte endpoints           | T0      | `\tZ\n\né→𝄞界\tZ`                                                   | `𝄞界\tZ\n\né→𝄞`                                    |
| get / native match start past EOL clamps              | T1      | `Z`                                                                 | empty string                                       |
| set / native match replaces accented span             | T0      | `X𝄞界\tZ`                                                           | `X→𝄞界\tZ`                                         |
| set / native match empty range inserts                | T0      | `é→𝄞界X\tZ`                                                         | `é→X𝄞界\tZ`                                        |
| set / past EOL errors natively unlike get_text        | T0; T2  | `success: nil`; T2 replaced the whole line with `X` (raw hex `58`)  | error contains `Invalid 'end_col': out of range`   |
| set / native match exact byte length is valid         | T0      | `é→𝄞界\tZX`                                                         | `é→𝄞界\tX`                                         |
| set / D5 deviation normalizes both interior endpoints | T0; T2  | `éX\udd1e界\tZ`; T2 host `\ufffdX\ufffd\ufffd𝄞界\tZ`                | `X𝄞界\tZ`                                          |
| set / D5 deviation rounds interior start down         | T0; T2  | `é→𝄞界\tX`; T2 host `é→\ufffdX界\tZ`                                | `é→X界\tZ`                                         |
| set / D5 deviation rounds interior end up             | T0; T2  | `é→𝄞界X`; T2 host `é→X\ufffd界\tZ`                                  | `é→X界\tZ`                                         |
| set / native match multiline byte endpoints           | T0      | `é→𝄞界X\nY`                                                         | `é→X\nY界\tZ`                                      |
| set / native match start past EOL errors              | T0; T2  | `success: nil`; T2 appended `X` to F                                | error contains `Invalid 'start_col': out of range` |

T2 logged the actual invalid byte sequence before the host write:
`c3588692f09d849ee7958c095a` for `(1,3)`,
`c3a9e28692f058e7958c095a` for `(6,9)`, and
`c3a9e28692589ee7958c095a` for `(5,8)`. The mutation passed these bytes through
`TextDecoder` to `replaceRange`; the observed host strings above contain U+FFFD.
This is the unrepresentability D5 addresses, **not** a claim that JS stored raw
invalid UTF-8. The final implementation never takes that lossy path.

T3 exited 1 with **3 failures**: ASCII replacement callback actually received
`['hello',0,0,0,4]` versus `['hello',0,0,0,5]`; ASCII read returned `orld` versus
`world`; manifest coverage actually had both text names in `missing` and their
`_MISSING` variants in `extra`, versus empty lists. T4 exited 1 with **2 failures**:
both existing API tests observed Lua status `2` versus expected `0`, independently
of the content/callback assertions tested by T3. The existing ASCII tests only
needed realistic `getLines`/`getLineCount` callbacks added; expectations stayed.

### Restored results

After restoring T0/T1, exact T0 ran at 17:02:02: **32 passed**, exit 0.
After restoring T2, exact T2 ran at 17:02:33: **10 passed**, exit 0.
After restoring T3, exact T3 ran at 17:02:58: **3 passed**, exit 0.
After restoring T4, exact T4 ran at 17:03:29: **2 passed**, exit 0.
No control mutations remain. Required final manifest/text/static/build/e2e gates
are reported by the executor after execution, not predicted here.

Additional native probes used `nvim --headless -u NONE -l /dev/stdin`, buffer
`[F,'',F]`: get `(0,5,2,9)` returned `{'𝄞界\tZ','','é→𝄞'}`; get start/end 99
returned `{''}` while set errored on `start_col`. Negative rows count from the
end; negative columns add byte length plus one. Further probes showed get
columns `-99` clamp to zero while set rejects them, and nonintegral columns
raise `Invalid 'end_col': Number is not integral`. These measurements informed
adapter bounds handling; they do not change any pinned plan contract.

### T5 — strict numeric marshalling (review follow-up)

Native 0.12.5 probes for both APIs confirmed start columns `nil`, `false`,
`"0"`, and `{}` raise `Invalid 'start_col': Expected Lua number`, while `1.5`
raises `Invalid 'start_col': Number is not integral`. Ten literal cases were
added (five per API), each generated in both suites.

Mutation: replace `readTextCoordinates`' scalar reader with
`Math.trunc(lua.lua_tonumber(L,index))`, removing the Lua-type check and
truncating fractions. Exact command:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'text bytes|rejects start_col'
```

At 17:06:33, **20 failed / 16 passed**, exit 1. Each of the ten new cases
observed `success: nil`, versus the corresponding native error above; both
generated copies failed. After restoring via `apply_patch`, exact command at
17:06:43: **36 passed**, exit 0. Strict type checking belongs to the wire;
integer and range validation remain in the coordinate adapter.

### T6 — stale demand-audit text expectations (Phase 1 completion)

The full-unit-suite follow-up exposed stale recorded semantic results, not
additional implementation defects. Before editing the artifact, the complete
`npx vitest run test/unit/lua/plugin-api-demand.test.ts` at 17:14:11 reported
**3 failed / 153 passed**. Only `nvim_buf_set_text` (both plugins) and
`nvim_buf_get_text` (mini.splitjoin) differed. Their categories remained `real`
and their warning counts remained zero; no other name's status/result changed.

Updated only those demand dispositions to `allow`, their literal `liveResults`,
and the corresponding blocker records/lists in `mini-api-demand.json`. The
existing test assertions, comparisons, source-site inventory, historical
five-string-helper promotion checks, and BLOCKED verdicts are unchanged.

For the negative control, restored the two stale `liveResults` via `apply_patch`
while retaining the corrected dispositions and blocker lists. Re-ran the same
complete audit command at 17:14:47: **3 failed / 153 passed**, exit 1. The guard
still rejects wrong recorded results even when the declared blocker lists agree.

| Assertion                                    | Observed actual                                    | Stale expected                                     |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| mini.surround / `vim.api.nvim_buf_set_text`  | `{category:'real', result:'é→é界\tZ', warnings:0}` | `{category:'real', result:'é→𝄞界é', warnings:0}`   |
| mini.splitjoin / `vim.api.nvim_buf_set_text` | `{category:'real', result:'é→é界\tZ', warnings:0}` | `{category:'real', result:'é→𝄞界é', warnings:0}`   |
| mini.splitjoin / `vim.api.nvim_buf_get_text` | `{category:'real', result:'["𝄞"]', warnings:0}`    | `{category:'real', result:'["\\tZ"]', warnings:0}` |

Restored the corrected literals with `apply_patch`. Restoration is checked by
the mandatory **full** `npm run test:unit` run, followed by `npm run verify`
and `npm run build:dev`; final outcomes are reported after execution.

Observed effective blocker lists (after the existing Phase 5b promotions):

- mini.surround core before: `surround-highlight`, `echospace`, `getchar-context`,
  `input-context-and-form`, `set-text-bytes`; after: `surround-highlight`,
  `echospace`, `getchar-context`, `input-context-and-form`. No load blockers;
  optional blockers unchanged. Verdict remains **BLOCKED**.
- mini.splitjoin core before: `local-comments`, `set-text-bytes`, `getpos-bytes`,
  `extmark-columns`; after: `local-comments`, `getpos-bytes`, `extmark-columns`.
  Load blocker remains `string-expr-mapping`; verdict remains **BLOCKED**.
  The same authorized `nvim_buf_get_text` correction removes its separately named
  **optional** `get-text-bytes` blocker; no other optional blocker changes.

Thus the **core** blocker delta is exactly `set-text-bytes` for each plugin.
Full units are required before declaring any remaining phase complete;
targeted tests plus `verify` do not substitute for the full suite.

## Remaining-coordinate seams Phase 2 — legacy positions

Executed against `f1d5b79`, using `apply_patch` for every mutation and undo.
Native display measurements used **`nvim --clean --headless -i NONE`**, version
0.12.5, and F above. At cursor bytes `[0,2,5,9,12,13]`, measured `getcurpos()`
columns were `[1,3,6,10,13,14]` and fifth elements `[1,2,3,4,8,9]`.
The wide `界` occupies cells 4–5 but its desired column is 4; the tab's is 8.
`normal! $` produced `{0,3,14,0,2147483647}`. `setpos('.', {0,3,6,0})`
returned 0 and `getpos('.')` then returned `{0,3,6,0}`.

### L0 — red-first legacy registrations

Before changing production code, ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'legacy positions'
```

At 17:24:19, exit 1: **19 failed / 1 passed**. Position numbers were pushed as
Lua floats in the old handlers, so concatenation included `.0`. The failures
with behavioral significance included `getpos` `{0,3,7,0}` vs `{0,3,14,0}`;
`getcurpos` at Z `{0,3,7,0,7}` vs `{0,3,14,0,9}`; at `界`
`{0,3,5,0,5}` vs `{0,3,10,0,4}`; `$` desired 7 vs 2147483647;
and `setpos` return `nil` vs 0. Cursor byte inputs `[1,3,6,10,13,14]`
left host columns `[1,3,6,10,13,14]` vs `[1,2,3,5,6,7]`; mark byte 6
left host `ch=5` vs 2. The three deferred-consumer expectations were corrected
to preserve the observed **existing** float serialization, not change production
behavior; their real negative controls are L4 below. The first-character
`getcurpos` tuple initially differed only in formatting; L2 proves its shape
assertion detects a real defect too.

### L1 — handler leakage, ingress conversion and exception inventory

Temporarily replaced the `getpos` handler with a raw shared-callback tuple,
including a boundary-rule suppression, and changed `writeLegacyPosition` to
use `col - 1` as the host column. Ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts test/unit/lua/coordinate-boundary-rule.test.ts -t 'getpos uses|setpos cursor byte 6|setpos mark|vim.fn.getpos|vim.fn.setpos|coordinate boundary suppression'
```

At 17:27:56, exit 1: **9 failed**. Observed `getpos('.')` `{0,3,7,0}` vs
`{0,3,14,0}` while `col('.')` remained 14. Manifest cursor/mark reads both
observed `0:3:7:0` vs `0:3:14:0`; unset mark observed `0:3:7:0` vs
`0:0:0:0`. Cursor set/get byte 6 misleadingly round-tripped as 6, but the
host assertion caught **column 6 vs 3**; the manifest observed
`0;3:6;0:3:6:0` vs `0;3:3;0:3:6:0`. Mark ingress observed host `ch=5` vs 2.
Both inventory assertions failed: extra owner `getpos`, unauthorized set
`['getpos']` vs `[]`. Restored both production edits before L2.

### L2 — dropped fifth element

Removed the adapter's fifth-element push. Ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'getcurpos'
```

At 17:28:09, exit 1: **12 failed**. Length was **4 vs 5**. All six boundary
tuples, both special-goal/option tuples, and all three manifest tuples were
missing their expected fifth elements: `[1,2,3,4,8,9]`, `2147483647`, `7`,
and `[9,4,8]`, respectively. Restored the push before L3.

### L3 — using scalar virtcol for curswant

Changed the drawn-cell selection to `span.last` unconditionally. Ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'getcurpos drawn cell at host column 5|getcurpos wide character'
```

At 17:28:22, exit 1: **2 failed**. Both observed `{0,3,10,0,5}` vs
`{0,3,10,0,4}`: desired column **5 vs 4** at `界`. Restored the wide-first,
tab-last selection before L4.

### L4 — conversion inside the shared callback

Temporarily changed the harness's shared `getCursorCol` to return the UTF-8
length of the host line prefix plus one instead of the untouched host column.
This mutates the callback used by all real fn handlers, not any handler's
result. The search guard uses production `searchBufferLines`, with `cnW` to
accept the current match without wrapping. Ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'leaves deferred'
```

At 17:28:45, exit 1: **3 failed**, with these observed vs expected results:

| Deferred consumer                                            | Observed with broken shared callback | Expected unchanged behavior |
| ------------------------------------------------------------ | ------------------------------------ | --------------------------- |
| `wincol()` without CM geometry                               | `15.0`                               | `8.0`                       |
| `searchpos('Z','cnW')`                                       | `{0,0}` (no match)                   | `{3,7}`                     |
| `winsaveview()` `{lnum,col,curswant,coladd,topline,leftcol}` | `{3,13,13,0,1,0}`                    | `{3,6,6,0,1,0}`             |

Restored `getCursorCol: () => host.cursor.col` before L5. Loader callbacks,
`getCursorPosition`, and `getMarkPos` were never changed.

### L5 — missing active manifest entry

Temporarily removed `setpos` from the three-name manifest entry generation.
Ran:

```bash
npx vitest run test/unit/lua/coordinate-manifest.test.ts -t 'requires exactly twenty'
```

At 17:29:02, exit 1: **1 failed**. Observed `missing: ['vim.fn.setpos']`
vs `missing: []`; restored the entry immediately.

### L6 — demand facts, not assertions

The complete demand audit at 17:25:44 exited 1 with **1 failed / 155 passed**.
Only `mini.splitjoin / vim.fn.getpos` differed: observed
`{category:'real',result:'[0,3,14,0]',warnings:0}` vs the artifact's stale
`{category:'real',result:'[0,3,7,0]',warnings:0}`. Updated only its recorded
result/disposition and removed the `getpos-bytes` blocker record/list entry.
No demand-audit assertions, source sites, other names or verdicts changed.
The intended blocker delta is exactly `getpos-bytes`: mini.surround retains
`surround-highlight`, `echospace`, `getchar-context`, `input-context-and-form`;
mini.splitjoin retains load `string-expr-mapping` and core `local-comments`,
`extmark-columns`. Both remain BLOCKED.

### L7 — measured fork goal state and D6's two branches

The installed fork was bundled with a real CM6 `EditorView` and driven through
`Vim.handleKey` in Chromium, not through mocked motion handlers. The document
was `[S, '', S, '']`, tab size 8. The temporary probe lived in `/tmp/opencode/`;
generated browser artifacts were removed and `.playwright-mcp/` is now ignored.
Native comparisons used `nvim --clean --headless -i NONE` (0.12.5).

| Sequence              | Fork cursor `{line,ch}` | Fork `lastHPos` | Fork `lastHSPos` (pixels) | Native `getcurpos()`    |
| --------------------- | ----------------------- | --------------- | ------------------------- | ----------------------- |
| `10\|`                | `{0,6}`                 | `9`             | `6`                       | `{0,1,14,0,10}`         |
| then `j`              | `{1,0}`                 | `9`             | `6`                       | `{0,2,1,0,10}`          |
| then `j`              | `{2,6}`                 | `9`             | `95.265625`               | `{0,3,14,0,10}`         |
| then `$`              | `{2,6}`                 | `Infinity`      | `85.359375`               | `{0,3,14,0,2147483647}` |
| then `j`              | `{3,0}`                 | `Infinity`      | `6`                       | `{0,4,1,0,2147483647}`  |
| fresh editor, `lllll` | `{0,6}`                 | `-1`            | `-1`                      | `{0,1,14,0,9}`          |

Thus `$` stores **Infinity**, not Neovim's integer sentinel. `lastHPos` is the
faithful field for the measured sticky goal; `lastHSPos` is pixel geometry and
collapses on shorter lines. The fallback after pure horizontal motion is
necessary. Unit cases replay these literal observed cursor/goal snapshots;
they do not claim to execute fork motion machinery in the unit harness.

**Goal branch red-first:** before adding finite-goal handling, ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'sticky.*goal'
```

At 17:42:30, exit 1: **4 failed / 2 passed**. `10|` and `10|jj` observed
desired column **9 vs 10**; `10|j` observed **1 vs 10**, both in the direct
contract and the generated manifest. The two `$` rows already passed.

**Fallback/sentinel control:** after implementation, temporarily treated `-1`
as an ordinary goal and mapped Infinity to zero. Ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts -t 'getcurpos fallback|getcurpos sticky fork goal|cursor Z five elements'
```

At 17:42:58, exit 1: **5 failed / 3 passed**. Horizontal fallback at Z leaked
desired column **0 vs 9** in both the direct and manifest cases. Wide fallback
observed **`0:5` vs `4:5`** (`curswant:virtcol`). `$` on line 3 and `$j` on
empty line 4 both observed desired column **0 vs 2147483647**. The three finite
goal rows passed, distinguishing the two branches. Restored both mutations.

**Drawn-cell fallback control:** changed only the non-tab fallback from
`span.first` to `span.last` and ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'getcurpos fallback wide'
```

At 17:43:10, exit 1: **1 failed**. Observed **`5:5` vs `4:5`**, proving the
fallback does not merely return scalar `virtcol`. Restored `span.first` with
`apply_patch`; no negative-control mutations remain.

Restored Phase 2 QA ran at 17:43:55–17:44:09: manifest **421 passed** and
**20/20 APIs exercised; 0 missing; 0 mismatches**; legacy positions **27 passed**;
boundary rule **10 passed**; complete demand audit **156 passed**. Both plugin
verdicts remain BLOCKED with the L6 lists, confirming the only blocker delta
is `getpos-bytes`. The full unit suite, static gates, development build and
two-spec e2e gate are separately required for final completion.

## Remaining seams Phase 3 — extmark columns (2026-09-09)

### Interior-byte decision and serialization prerequisite

Native `nvim --clean --headless -i NONE` confirmed the plan's five cases:
`col=5,end_col=9` reports `5..9`; `col=6` reports `6`; EOL `14`
is accepted; `col=15` and `end_col=99` error with the named column out
of range. The CM6 document has length 7 UTF-16 units, not 14 bytes.
Enumerating integer UTF-16 prefix offsets with `EditorState` and encoding
their strings produced byte lengths `[0,2,5,8,9,12,13,14]`. The `8` is a
replacement-encoded lone surrogate, not an exact UTF-8 byte position in the
original document; in particular no host offset represents byte 6.

**Deviation beside D4/D5:** normalize start down and exclusive end up,
without retaining a byte-remainder shadow. Native interior `col=6` becomes
byte 5 / host offset 2; native `5..6` becomes `5..9` / host `2..4`.
The end-up ruling supersedes the initially proposed both-down policy.
No shared callbacks or text get/set bounds policies changed.

The first red-first run (17:54:17; 34 failures across contract and manifest)
also exposed both getters' scalar-only `pushLuaValue` turning their modeled
details object into nil. Execution halted and the user authorized the narrow
prerequisite. The fix uses the existing recursive `pushLuaAny` only at those
two getter call sites, serializing the fields already populated by the engine.
No new extmark options or option parsing were added.

### Observed negative controls

All mutations below were applied and restored with `apply_patch`, never git
restore/checkout/reset. Each invocation exited 1. The fixture's setter result
is `id;hostFrom:hostTo;byIdRow:col:endRow:endCol;listRow:col:endRow:endCol`.
Getter fixtures seed the real CM6 engine in host units independently of the
Lua setter, so matching ingress/egress mistakes cannot cancel each other.

Common command prefix:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts test/unit/lua/coordinate-manifest.test.ts
```

| Control / time          | Mutation and test filter                                                                       | Observed                                                                                                  | Required                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| E1 / 17:57:01           | `extmarkColumnToByte` returned its UTF-16 column; `-t 'extmark.*astral'` (8 failed)            | Byte-5 mark reported **2**, both getters: `1;2:4;0:2:0:9;0:2:0:9`; independently seeded getters `0:2:0:9` | Reported **5**: `1;2:4;0:5:0:9;0:5:0:9`, getters `0:5:0:9`                  |
| E2 / 17:57:15           | Bounds failure returned clamped host column; `-t 'extmark.*(past EOL                           | negative)'` (8 failed)                                                                                    | `col=15`, `end_col=99`, and negative columns each returned **`success: 1`** | `Invalid 'col': out of range` / `Invalid 'end_col': out of range` |
| E3 / 17:57:26           | Removed `opts.endCol = hostEndCol.value`; `-t 'extmark.*astral span with implicit'` (2 failed) | Asymmetric **`5..14`**, host **`2..7`**: `1;2:7;0:5:0:14;0:5:0:14`                                        | **`5..9`**, host **`2..4`**: `1;2:4;0:5:0:9;0:5:0:9`                        |
| E4 / 17:57:36           | Removed end-up branch (both-down); `-t 'extmark.*interior end'` (4 failed)                     | `end_col=6` became empty **`5..5`**, host **`2..2`**: `1;2:2;0:5:0:5;0:5:0:5`. End 8 also reported 5      | **`5..9`**, host **`2..4`**. End 8 reports 9                                |
| E5 / 17:57:48           | Restored scalar-only `pushLuaValue` at both getters; `-t 'extmark.*(host                       | empty line                                                                                                | EOL byte                                                                    | interior start)'` (20 failed)                                     | **`details=nil`** from both getters, including host-seeded astral/EOL/multiline spans | Table with byte `end_col`: astral `0:5:0:9`, EOL `0:14:0:14`, multiline `0:5:1:6`; setter roundtrips retain their full tuples |
| E5 continued / 17:58:03 | Same scalar-only mutation; `-t 'extmark.*end column uses                                       | requires exactly twenty-three'`                                                                           | Multiline setter: `1;2:11;details=nil;details=nil`                          | `1;2:11;0:5:1:6;0:5:1:6`                                          |
| E6 / 17:58:03           | Removed `nvim_buf_get_extmark_by_id` manifest entry with the preceding filter                  | `missing: ['vim.api.nvim_buf_get_extmark_by_id']`                                                         | `missing: []`                                                               |

All five required mutations plus the manifest omission have been restored.
Together they exercised every added fixture assertion in both test suites.

### Demand facts, not assertions

At 17:58:21, `npx vitest run test/unit/lua/plugin-api-demand.test.ts -t
'category mini.splitjoin'` reported **2 failed / 31 passed / 123 skipped**.
Only `nvim_buf_set_extmark` and `nvim_buf_get_extmark_by_id` changed: observed
`{category:'real',result:'[0,13]',warnings:0}`, previously `[0,7]`.
Updated only those two recorded results/dispositions and removed the
`extmark-columns` blocker record/list entry. Audit assertions are unchanged.
The blocker delta is exactly **`extmark-columns`**: mini.splitjoin retains
load `string-expr-mapping` and core `local-comments`; mini.surround retains
`surround-highlight`, `echospace`, `getchar-context`, `input-context-and-form`
after its existing live string promotions. Both verdicts remain BLOCKED.

### Restored Phase 3 QA

After restoring every control, ran the plan's manifest command (exit 0,
**23/23 APIs exercised; 0 missing; 0 mismatches**) and extmark-columns contract
command (exit 0, **18 passed / 432 skipped**). The complete `npm run test:unit`
also exited 0: **Test Files 127 passed (127)**;
**Tests 3265 passed | 6 skipped (3271)**. This includes the unchanged demand
audit assertions with only the recorded extmark facts updated.

### E7 — authorized modeled `virt_text` shape correction

Final review found that the now-visible `virt_text` was still the engine's
keyed `{text,hlGroup}` representation. Execution halted; the user measured
native `nvim --clean` and authorized positional two-element chunk arrays.
Only the two getters' already-modeled `virt_text` field is reshaped. No option
parsing, new native detail fields, stored chunks, or rendering was changed.

Two real-Lua/CM6 regressions set `{{'A','ErrorMsg'},{'B','WarningMsg'}}` and
read through each public getter. They assert outer type/count, each chunk's
type/length, both positional fields, and absence of the keyed `.text` field.
Red-first (18:05:58), then explicitly restoring the keyed shape after adding
the fix (18:06:25), each ran:

```bash
npx vitest run test/unit/lua/coordinate-contract.test.ts -t 'serializes virt_text'
```

Both runs exited 1 with **2 failed / 450 skipped**. Observed in both getters:
`#virt_text=2`, but `#chunk1=0`, `chunk1[1]=nil` (required **`'A'`**),
`chunk1[2]=nil` (required **`'ErrorMsg'`**), `chunk1.text='A'` (required nil).
Chunk 2 likewise had length 0 and nil positional fields instead of length 2,
`'B'`, `'WarningMsg'`. Required lengths are **2** for both chunks.

### E8 — multi-chunk discrimination

Temporarily kept only the first correctly shaped chunk with `.slice(0,1)`
in both getters. The same command at 18:06:34 exited 1, **2 failed / 450 skipped**:
observed **`#virt_text=1` vs 2**, chunk 1 correctly `{'A','ErrorMsg'}`,
and chunk 2 absent vs required `{'B','WarningMsg'}`. This isolates outer-array
cardinality from the E7 keyed-chunk error. Both mutations were restored using
`apply_patch`; no negative-control mutation remains.

Restored shape acceptance: the full `npm run test:unit` at 18:07:16 exited 0:
**Test Files 127 passed (127)**; **Tests 3267 passed | 6 skipped (3273)**.
The two additional tests pass with `#virt_text=2`, both chunks length 2,
positional `A/ErrorMsg` and `B/WarningMsg`, and no keyed `.text` field.
Manifest remains **23/23 APIs exercised; 0 missing; 0 mismatches**.
The unchanged demand assertions still report mini.surround BLOCKED with the
same four core blockers and mini.splitjoin BLOCKED with load
`string-expr-mapping` / core `local-comments`; no blocker besides
`extmark-columns` has moved in Phase 3. The focused review now passes.

## Remaining coordinate seams — Phase 4 re-audit and documentation

Executed 2026-09-09 after `c0a7672`. No API implementation or assertion changed.
The accepted cumulative Phases 1–3 delta is exactly core `set-text-bytes`,
`getpos-bytes`, `extmark-columns`, plus optional `get-text-bytes`.
Phase 1 repaired both text functions, so the optional removal is part of the
same fix, not an unrelated promotion. Before → now (after the predecessor
plan's five string-helper repairs):

| Plugin         | Load blockers                       | Core blockers                                                                                                                                                           |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mini.surround  | `[]` → `[]`                         | `[surround-highlight, echospace, getchar-context, input-context-and-form, set-text-bytes]` → `[surround-highlight, echospace, getchar-context, input-context-and-form]` |
| mini.splitjoin | `[string-expr-mapping]` → unchanged | `[local-comments, set-text-bytes, getpos-bytes, extmark-columns]` → `[local-comments]`                                                                                  |

mini.splitjoin optional `[get-text-bytes]` → `[]`; mini.surround optional
blockers are unchanged. Both remain **BLOCKED**. `string-expr-mapping` needs
unavailable Vimscript evaluation, an architectural constraint, not a missing
function or a to-do item. No behavior suite was added or unblocked.

At 18:14:46, this command exited **0**, **2 files / 160 tests passed**:

```bash
npx vitest run test/unit/lua/plugin-api-demand.test.ts test/unit/lua/api-status-counts.test.ts
```

The live audit reported mini.surround **61 names / 128 sites**, mini.splitjoin
**33 names / 58 sites**, both **0 uncovered / 0 unresolved**; load counts **0 / 1**
and core lists match the table above. The source-derived guard recomputed API
**69 real / 88 stubs / 157 total**, fn **92 / 39 / 131**, and fn without async
callbacks **89 / 39 / 128**. These are unchanged: Phases 1–3 repaired handlers
already counted real. The count guard checks registered surface, not semantic
correctness; the demand probes and coordinate contracts supply that evidence.

### Documentation count negative control

Fixture: current `NEOVIM_API_STATUS.md`. Using `apply_patch`, changed only
`KNOWN_NVIM_API_FUNCTIONS holds 157 names total` to **158**, leaving the source,
all assertions, authoritative table and other figures unchanged. Command:

```bash
npx vitest run test/unit/lua/api-status-counts.test.ts
```

At **18:19:10**, exit **1**, **1 failed / 3 passed**. Full failing case:
`API status guard registration totals match source`. Observed **`apiTotal: 158`**
versus source-derived expected **`apiTotal: 157`**; the authoritative API array
remained **`[69,88,157]`**. This is a measured count mismatch, not an import or
infrastructure failure.

Restored **157** with `apply_patch` and ran the same command at **18:19:19**:
exit **0**, **Test Files 1 passed (1)**, **Tests 4 passed (4)**. No mutation or
assertion change remains; the guard did not need weakening or new expectations.
