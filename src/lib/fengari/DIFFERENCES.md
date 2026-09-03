# Differences from upstream fengari

This is a browser/Obsidian-only fork of [fengari](https://github.com/fengari-lua/fengari) (v0.1.5). All Node.js dependencies have been removed to produce a bundle that works in browser and Electron environments without triggering security scanner warnings.

## Files removed

### `src/liolib.js` — Lua `io` library

Entirely Node.js-dependent. Contains an unconditional `require('fs')` at module load time that cannot be conditionally guarded. The `io` library (`io.open`, `io.read`, `io.write`, `io.lines`, etc.) is not available in this fork.

### `src/loadlib.js` — Lua `package` library / `require()` system

Uses `require('path')`, `require('fs')`, `process.cwd()`, and `(0, eval)('this')` for module resolution. The Lua `require()` function and `package.*` namespace are not available in this fork.

## Files modified

### `src/luaconf.js`

- Removed unconditional `process.env.FENGARICONF` access on line 3 (replaced with `const conf = {}`). This was a crash-on-mobile bug — `process` is undefined in non-Electron browser environments.
- Removed `require('os').platform()` Windows/Linux path detection branch. Collapsed the `if/else if/else` conditional to always use the browser path defaults (`LUA_DIRSEP = "/"`, relative `LUA_LDIR`/`LUA_JSDIR` paths).
- `LUA_EXEC_DIR` export remains but is unused (was only consumed by the removed `loadlib.js`).
- The `FENGARICONF` environment variable for runtime configuration is not supported.
- Integer widening: `LUA_MAXINTEGER` changed from `2147483647` to `9007199254740991`. `LUA_MININTEGER` changed from `-2147483648` to `-9007199254740991`. `lua_numbertointeger` bounds check changed from `n < -LUA_MININTEGER` to `n <= LUA_MAXINTEGER` (symmetric bounds fix).

### `src/lbaselib.js`

- Removed `process.stdout.write(Buffer.from(s))` branch for `print()` output. Always uses the browser implementation (`TextDecoder` + `console.log`, or `to_jsstring` + `console.log` fallback).
- Integer widening: `b_str2int` (`tonumber` with base) replaced `v|0` with `Math.trunc(v)` to avoid 32-bit truncation of `parseInt` results.

### `src/lauxlib.js`

- `luaL_loadfilex` re-implemented for Node/Electron environments: reads files via `require('fs').readFileSync` (binary mode for byte fidelity), compiles with `luaL_loadbufferx`. Falls back to `LUA_ERRFILE` with "file loading not available on this platform" in browser/mobile environments where `require` is not available. `luaL_loadfile` and `luaL_dofile` work on desktop via this implementation.
- `luaL_loadfile` and `luaL_dofile` still exist as thin wrappers over the stub, so code referencing them will compile but always fail at runtime.
- `lua_writestringerror` always uses `console.error()` (removed `process.stderr.write()` branch).
- Removed all `require('fs')`, `Buffer`, and `process.stdin.fd` references.

### `src/loslib.js`

Retained browser-safe functions:

| Function       | Implementation                                |
| -------------- | --------------------------------------------- |
| `os.date`      | JavaScript `Date` with custom `strftime`      |
| `os.time`      | JavaScript `Date` / `Math.floor(date / 1000)` |
| `os.difftime`  | Subtraction of two time values                |
| `os.clock`     | `performance.now() / 1000`                    |
| `os.setlocale` | Always reports `"C"` locale                   |

Re-introduced with platform guards (lazy `require('fs')` / `require('os')`, guarded by `typeof process !== 'undefined'`):

| Function              | Desktop/Node implementation      | Browser/mobile fallback                 |
| --------------------- | -------------------------------- | --------------------------------------- |
| `os.getenv(varname)`  | `process.env[varname]`           | `nil`                                   |
| `os.remove(filename)` | `fs.unlinkSync(filename)`        | `nil, "not available on this platform"` |
| `os.rename(old, new)` | `fs.renameSync(old, new)`        | `nil, "not available on this platform"` |
| `os.tmpname()`        | `os.tmpdir() + '/lua_' + random` | `nil`                                   |

Blocked functions (intentionally disabled for safety):

| Function              | Behavior                                  | Reason                                                          |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `os.execute(command)` | Returns `nil, "os.execute is disabled"`   | Arbitrary shell execution is a security risk in plugin contexts |
| `os.exit(code)`       | Returns `nil, "os.exit is not available"` | Would terminate the host application (Obsidian)                 |

### `src/ldblib.js`

- Removed `require('readline-sync')` import and `debug.debug()` interactive REPL function. The `debug.debug()` function is not available in this fork.
- All other debug library functions are retained (`debug.traceback`, `debug.getinfo`, `debug.sethook`, `debug.gethook`, `debug.getlocal`, `debug.setlocal`, `debug.getupvalue`, `debug.setupvalue`, `debug.upvalueid`, `debug.upvaluejoin`, `debug.getuservalue`, `debug.setuservalue`, `debug.getmetatable`, `debug.setmetatable`, `debug.getregistry`). These are all pure JavaScript.

### `src/lstrlib.js`

- Replaced `sprintf-js` dependency with custom `luaSprintf` function for `string.format` implementation. All `sprintf` call sites replaced with the built-in formatter.
- Integer widening: `SZINT` changed from 4 to 8. `packint` byte extraction rewritten to use `Math.floor(n / 256)` instead of `n >>= 8` (32-bit shift). `unpackint` accumulation rewritten to use `res * 256 + byte` instead of `res <<= 8 | byte`. Sign extension and overflow checks updated for sizes 5-7 (newly reachable with SZINT=8).

### `src/lvm.js`

- Integer widening: removed `|0` truncation from integer add, sub, unary minus, for-loop step/init, IDIV, MOD. Replaced `Math.imul` with standard `*` operator in `luaV_imul`.

### `src/lobject.js`

- Integer widening: removed `|0` truncation from `intarith` (add, sub, unary minus) and `l_str2int` (hex/decimal parsing, result).

### `src/ltable.js`

- Integer widening: replaced `(key|0) === key` integer checks with `Number.isSafeInteger(key)` in `luaH_getint`, `luaH_setint`, and `luaH_setfrom`.

### `src/lapi.js`

- Integer widening: replaced `(n|0) === n` with `Number.isSafeInteger(n)` in `fengari_argcheckinteger` and upvalue index validation.

### `src/ldo.js`

- Integer widening: replaced `(n|0) !== n` with `!Number.isSafeInteger(n)` in JS function return value validation.

### `src/llimits.js`

- Integer widening: `MAX_INT` changed from `2147483647` to `9007199254740991` (`Number.MAX_SAFE_INTEGER`). Controls `l_str2int` overflow detection.

### `src/lmathlib.js`

- Integer widening: removed `|0` truncation from `math.abs` and `math.fmod`. `l_rand` and `l_srand` remain 32-bit (LCG is 31-bit internal).

### `src/lualib.js`

- Removed `io` library exports (`LUA_IOLIBNAME`, `luaopen_io`).
- Removed `package` library exports (`LUA_LOADLIBNAME`, `luaopen_package`).

### `src/linit.js`

- Removed `io` and `package` from `loadedlibs` registration.
- Removed `require('./loadlib.js')` and conditional `require('./liolib.js')`.
- `luaL_openlibs` now opens: `_G` (base), `coroutine`, `table`, `os` (safe subset), `string`, `math`, `utf8`, `debug` (minus `debug.debug()`), `fengari`.

### `test/test-suite/ltests.js`

- Replaced `sprintf-js` dependency with inline JS formatting function (5 usages, simple `%4d`/`%-12s` patterns)
- Guarded `require('../../src/liolib.js')` and `require('../../src/loadlib.js')` with `try/catch` — test suites that depend on `ltests.js` now load even when `io` and `package` libraries are absent
- `loadlib` function conditionally registers `io` and `package` libraries only when available

## Dependencies removed

| Package         | Was used by                                     | Reason                          |
| --------------- | ----------------------------------------------- | ------------------------------- |
| `readline-sync` | `ldblib.js` (`debug.debug()` interactive input) | Node.js-only CLI package        |
| `tmp`           | `loslib.js` (`os.tmpname`)                      | Node.js-only temp file creation |

## Dependencies removed (fork-specific)

| Package      | Was used by                        | Replacement                                                                                                                                                                                                         |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprintf-js` | `lstrlib.js` (Lua `string.format`) | Custom `luaSprintf` — purpose-built formatter handling Lua's format specifiers (`%d`, `%i`, `%u`, `%o`, `%x`, `%X`, `%e`, `%E`, `%f`, `%g`, `%G`, `%c`, `%s`, `%%`). Eliminates the fork's last runtime dependency. |

## Dependencies kept

None. This fork ships with zero runtime dependencies.

## Behavioral differences

| Behavior                      | Upstream fengari                                                   | This fork                                                                                    |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `print()` output              | `process.stdout.write()` in Node, `console.log` in browser         | Always `console.log`                                                                         |
| `os.clock()`                  | `process.uptime()` in Node, `performance.now()/1000` in browser    | Always `performance.now()/1000`                                                              |
| `luaL_loadfilex`              | `fs`-based in Node, `XMLHttpRequest`-based in browser              | `fs.readFileSync` on Node/Electron, `LUA_ERRFILE` on browser/mobile                          |
| `luaL_openlibs`               | Opens all 10 libraries (io conditionally)                          | Opens 9 libraries (no io, no package)                                                        |
| `debug.debug()`               | `readline-sync` in Node, `window.prompt` in browser                | Not available                                                                                |
| `FENGARICONF` env var         | Reads `process.env.FENGARICONF` for runtime config                 | Not supported                                                                                |
| Error output                  | `process.stderr.write()` in Node, `console.error` in browser       | Always `console.error`                                                                       |
| Path defaults                 | Platform-specific (Windows `\`, Linux `/usr/local/`, browser `./`) | Always browser defaults (`./lua/5.3/`)                                                       |
| Integer range                 | 32-bit (±2^31)                                                     | 53-bit (±(2^53 - 1)) — see [Integer widening](#integer-widening-32-bit--53-bit)              |
| `string.packsize("j")`        | 4                                                                  | 8                                                                                            |
| `string.format`               | Via `sprintf-js` npm package                                       | Custom `luaSprintf` (zero dependencies)                                                      |
| Bitwise operations            | 32-bit                                                             | 32-bit (unchanged)                                                                           |
| `collectgarbage("count")`     | Returns allocated memory in KB (two values)                        | Returns `0, 0` (no memory tracking)                                                          |
| `collectgarbage("collect")`   | Full GC cycle                                                      | Drains `__gc` finalizer queue                                                                |
| `collectgarbage("isrunning")` | GC running state                                                   | Always `false`                                                                               |
| Other `collectgarbage` modes  | GC tuning                                                          | No-op, returns `0`                                                                           |
| `__gc` metamethods            | Called synchronously by GC on userdata                             | Called via `FinalizationRegistry` + explicit drain (non-deterministic timing; userdata only) |

## Coroutine↔Promise bridge validation

The fork's `lua_yieldk`/`lua_resume` implementation (ported from PUC-Rio Lua 5.3) has been validated for use as a coroutine↔Promise bridge — enabling JS-hosted async operations (e.g., file reads via Obsidian's vault API) to be called transparently from Lua code.

Validation tests in `test/coroutine-promise-bridge.test.js` confirm:

| Test | Description                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | C-function yields via `lua_yieldk` with continuation, JS resumes, continuation receives correct status and context                       |
| T2   | `lua_isyieldable` returns `true` inside a resumed thread, `false` on main state                                                          |
| T3   | `pcall` around a yielding function works — yield propagates through `pcall` and resume value is returned                                 |
| T4   | Instruction count hook (`lua_sethook` with `LUA_MASKCOUNT`) fires correctly on thread after yield/resume                                 |
| T5   | Error propagation via continuation — `nil + errmsg` protocol, `luaL_error` from continuation                                             |
| T6   | Error propagation through `pcall` across yield — `pcall` catches continuation error, returns `(false, msg)`                              |
| T7   | Sequential yields — two async calls in one function, both resume correctly                                                               |
| T8   | Lua-level `coroutine.create` captures yield internally — JS host cannot detect it (confirms C-level `lua_newthread` required for bridge) |

Key finding: `lua_newthread` pushes the thread onto the parent's stack. Using `lua_xmove` immediately after `lua_newthread` moves the thread value itself, not the intended function. The correct pattern: compile the chunk directly on the thread via `luaL_loadstring(thread, code)` — the thread shares globals with the main state. Alternatively, use `lua_rawgeti(thread, LUA_REGISTRYINDEX, ref)` to load from the shared registry.

## Integer widening (32-bit → 53-bit)

Upstream fengari uses 32-bit integers (`LUA_INT_TYPE=LUA_INT_LONG` equivalent). This fork widens integers to 53-bit using JavaScript `Number` precision.

### What changed

| Aspect                       | Upstream fengari             | This fork                                    |
| ---------------------------- | ---------------------------- | -------------------------------------------- |
| `math.maxinteger`            | `2147483647` (2^31 - 1)      | `9007199254740991` (2^53 - 1)                |
| `math.mininteger`            | `-2147483648` (-(2^31))      | `-9007199254740991` (-(2^53 - 1), symmetric) |
| `string.packsize("j")`       | 4                            | 8                                            |
| Integer arithmetic           | 32-bit with `\|0` truncation | 53-bit, no truncation                        |
| `tonumber("1099511627776")`  | `nil` (overflow)             | `1099511627776` (valid integer)              |
| `tonumber("FFFFFFFFFF", 16)` | `nil` (overflow)             | `1099511627775` (valid integer)              |
| Bitwise operations           | 32-bit                       | 32-bit (unchanged — JS platform limitation)  |

### Remaining limitations

- **Bitwise operations remain 32-bit**: `&`, `|`, `^`, `~`, `<<`, `>>` coerce operands to 32-bit signed integers via JavaScript's `ToInt32`. Values > 2^31 are silently truncated. This is a fundamental JavaScript platform constraint.
- **Multiplication precision**: `a * b` where both operands > 2^26 may produce a product > 2^53, silently losing precision. Standard Lua 5.3 wraps via 2's complement; this fork loses low bits.
- **Overflow behavior**: Arithmetic exceeding 2^53 - 1 silently loses precision (matches JavaScript `Number` behavior). Standard Lua wraps.
- **Symmetric bounds**: `math.mininteger = -(2^53 - 1)`, not `-(2^53)`. Standard Lua uses asymmetric 2's complement. `math.ult` semantics may differ for negative inputs.
- **Hex overflow precision**: `tonumber("0x...", 16)` for hex values > 2^53 may lose precision. No explicit overflow check — matching PUC-Rio Lua's hex parsing design (no overflow detection in hex path).

### `string.format` implementation

`string.format` uses a custom `luaSprintf` function (replacing `sprintf-js`). The formatter handles all Lua format specifiers and modifiers. Output is byte-identical to the previous `sprintf-js` implementation for all standard format patterns. The `%a`/`%A` (hex float) mantissa is built manually in `num2straux`; only the exponent part (`p%+d`) goes through `luaSprintf`.

## Inherited limitations from upstream

These are upstream fengari limitations that this fork does not attempt to address:

- Weak tables (`__mode`) are not supported
- `lua_gc` is not implemented (but `collectgarbage` Lua function works — see behavioral differences)

Previously inherited, now addressed by this fork:

- `__gc` metamethods: implemented via `FinalizationRegistry` for userdata (not tables). Finalizers fire on explicit drain (`collectgarbage("collect")`, `lua_close`, or outermost `luaD_pcall` return). Timing is non-deterministic. Finalization order is unspecified.
- `collectgarbage`: all modes return safe values instead of erroring. `"count"` returns `0, 0` (no memory tracking). `"collect"` drains the finalizer queue.

## Upstream sync policy

Upstream fengari is essentially frozen (last release: v0.1.5). This fork will check upstream quarterly and cherry-pick only security or correctness fixes.
