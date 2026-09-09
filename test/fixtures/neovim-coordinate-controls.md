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
