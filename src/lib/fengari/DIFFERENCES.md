# Differences from upstream fengari

This is a browser/Obsidian-only fork of [fengari](https://github.com/fengari-lua/fengari) (v0.1.5), absorbed into the plugin monorepo at `src/lib/fengari/`. All Node.js dependencies have been removed to produce a bundle that works in browser and Electron environments without triggering security scanner warnings.

## Module format

Upstream fengari ships as CommonJS `.js` files with `require()`/`module.exports`. This fork has been converted to TypeScript ESM (`.ts` files with `import`/`export`).

### TypeScript typing

All 37 source files are fully typed with `strict: true` — no `@ts-nocheck`, no `any`. The core `TValue` class uses the hybrid-A pattern: `value: unknown` with `this is` type predicates on all `ttis*()` methods, plus typed accessor methods (`nvalue()`, `hvalue()`, `clLvalue()`, etc.) that assert the tag and return the narrowed type. See the `TValue` class in `lobject.ts` for the full set.

### Circular dependency resolution

The ESM conversion required breaking two circular dependencies that were evaluation-order safe in CJS but cause TDZ violations in ESM:

- **`defs.ts` ↔ `luaconf.ts`**: `luaconf` uses `to_luastring` from `defs` at module-evaluation time. Fixed by inlining `LUAI_MAXSTACK = 1000000` in `defs.ts` instead of importing it from `luaconf.ts`.
- **`linit.ts` ↔ `lualib.ts`**: `linit` accessed `lualib.LUA_COLIBNAME` etc. at evaluation time. Fixed by inlining the library name strings (`'coroutine'`, `'table'`, etc.) in `linit.ts`.

All other circular dependencies (28 mutual pairs) are call-time safe — cross-module dereferences happen inside function bodies, not at module-evaluation time.

### Platform abstraction

`platform.ts` provides `setPlatformProvider()` for dependency injection of `isDesktop` and `requireModule`, replacing all `typeof require`/`typeof process` guards in the original source.

## Files removed

### `liolib.js` — Lua `io` library

Entirely Node.js-dependent. Contains an unconditional `require('fs')` at module load time that cannot be conditionally guarded. The `io` library (`io.open`, `io.read`, `io.write`, `io.lines`, etc.) is not available in this fork.

### `loadlib.js` — Lua `package` library / `require()` system

Uses `require('path')`, `require('fs')`, `process.cwd()`, and `(0, eval)('this')` for module resolution. The Lua `require()` function and `package.*` namespace are not available in this fork.

## Files modified

### `luaconf.ts`

- Removed unconditional `process.env.FENGARICONF` access on line 3 (replaced with `const conf = {}`). This was a crash-on-mobile bug — `process` is undefined in non-Electron browser environments.
- Removed `require('os').platform()` Windows/Linux path detection branch. Collapsed the `if/else if/else` conditional to always use the browser path defaults (`LUA_DIRSEP = "/"`, relative `LUA_LDIR`/`LUA_JSDIR` paths).
- `LUA_EXEC_DIR` export remains but is unused (was only consumed by the removed `loadlib.js`).
- The `FENGARICONF` environment variable for runtime configuration is not supported.
- Integer widening: `LUA_MAXINTEGER` changed from `2147483647` to `9007199254740991`. `LUA_MININTEGER` changed from `-2147483648` to `-9007199254740991`. `lua_numbertointeger` bounds check changed from `n < -LUA_MININTEGER` to `n <= LUA_MAXINTEGER` (symmetric bounds fix).
- `constant_types` and `thread_status` objects (defined in `defs.ts`) use `as const` for literal tag types. Subtype constants (`LUA_TSHRSTR`, `LUA_TNUMFLT`, etc.) are inlined into the object rather than assigned after creation.

### `lbaselib.ts`

- Removed `process.stdout.write(Buffer.from(s))` branch for `print()` output. Always uses the browser implementation (`TextDecoder` + `console.log`, or `to_jsstring` + `console.log` fallback).
- Integer widening: `b_str2int` (`tonumber` with base) replaced `v|0` with `Math.trunc(v)` to avoid 32-bit truncation of `parseInt` results.

### `lauxlib.ts`

- `luaL_loadfilex` re-implemented for Node/Electron environments: reads files via `require('fs').readFileSync` (binary mode for byte fidelity), compiles with `luaL_loadbufferx`. Falls back to `LUA_ERRFILE` with "file loading not available on this platform" in browser/mobile environments where `require` is not available. `luaL_loadfile` and `luaL_dofile` work on desktop via this implementation.
- `luaL_loadfile` and `luaL_dofile` still exist as thin wrappers over the stub, so code referencing them will compile but always fail at runtime.
- `lua_writestringerror` always uses `console.error()` (removed `process.stderr.write()` branch).
- Removed all `require('fs')`, `Buffer`, and `process.stdin.fd` references.

### `loslib.ts`

Retained browser-safe functions:

| Function       | Implementation                                |
| -------------- | --------------------------------------------- |
| `os.date`      | JavaScript `Date` with custom `strftime`      |
| `os.time`      | JavaScript `Date` / `Math.floor(date / 1000)` |
| `os.difftime`  | Subtraction of two time values                |
| `os.clock`     | `performance.now() / 1000`                    |
| `os.setlocale` | Always reports `"C"` locale                   |

Re-introduced with platform guards (via `platform.ts` `requireModule()` dependency injection):

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

### `ldblib.ts`

- Removed `require('readline-sync')` import and `debug.debug()` interactive REPL function. The `debug.debug()` function is not available in this fork.
- All other debug library functions are retained (`debug.traceback`, `debug.getinfo`, `debug.sethook`, `debug.gethook`, `debug.getlocal`, `debug.setlocal`, `debug.getupvalue`, `debug.setupvalue`, `debug.upvalueid`, `debug.upvaluejoin`, `debug.getuservalue`, `debug.setuservalue`, `debug.getmetatable`, `debug.setmetatable`, `debug.getregistry`). These are all pure JavaScript.

### `lstrlib.ts`

- Replaced `sprintf-js` dependency with custom `luaSprintf` function for `string.format` implementation. All `sprintf` call sites replaced with the built-in formatter.
- Integer widening: `SZINT` changed from 4 to 8. `packint` byte extraction rewritten to use `Math.floor(n / 256)` instead of `n >>= 8` (32-bit shift). `unpackint` accumulation rewritten to use `res * 256 + byte` instead of `res <<= 8 | byte`. Sign extension and overflow checks updated for sizes 5-7 (newly reachable with SZINT=8).

### `lvm.ts`

- Integer widening: removed `|0` truncation from integer add, sub, unary minus, for-loop step/init, IDIV, MOD. Replaced `Math.imul` with standard `*` operator in `luaV_imul`.

### `lobject.ts`

- Integer widening: removed `|0` truncation from `intarith` (add, sub, unary minus) and `l_str2int` (hex/decimal parsing, result).

### `ltable.ts`

- Integer widening: replaced `(key|0) === key` integer checks with `Number.isSafeInteger(key)` in `luaH_getint`, `luaH_setint`, and `luaH_setfrom`.

### `lapi.ts`

- Integer widening: replaced `(n|0) === n` with `Number.isSafeInteger(n)` in `fengari_argcheckinteger` and upvalue index validation.

### `ldo.ts`

- Integer widening: replaced `(n|0) !== n` with `!Number.isSafeInteger(n)` in JS function return value validation.

### `llimits.ts`

- Integer widening: `MAX_INT` changed from `2147483647` to `9007199254740991` (`Number.MAX_SAFE_INTEGER`). Controls `l_str2int` overflow detection.

### `lmathlib.ts`

- Integer widening: removed `|0` truncation from `math.abs` and `math.fmod`. `l_rand` and `l_srand` remain 32-bit (LCG is 31-bit internal).

### `lualib.ts`

- Removed `io` library exports (`LUA_IOLIBNAME`, `luaopen_io`).
- Removed `package` library exports (`LUA_LOADLIBNAME`, `luaopen_package`).

### `linit.ts`

- Removed `io` and `package` from `loadedlibs` registration.
- Library name strings inlined directly (no longer imported from `lualib.ts`) to break the `linit`↔`lualib` circular dependency.
- `luaL_openlibs` now opens: `_G` (base), `coroutine`, `table`, `os` (safe subset), `string`, `math`, `utf8`, `debug` (minus `debug.debug()`), `fengari`.

## Dependencies removed

| Package         | Was used by                                     | Reason                          |
| --------------- | ----------------------------------------------- | ------------------------------- |
| `readline-sync` | `ldblib.ts` (`debug.debug()` interactive input) | Node.js-only CLI package        |
| `tmp`           | `loslib.ts` (`os.tmpname`)                      | Node.js-only temp file creation |

## Dependencies removed (fork-specific)

| Package      | Was used by                        | Replacement                                                                                                                                                                                                         |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprintf-js` | `lstrlib.ts` (Lua `string.format`) | Custom `luaSprintf` — purpose-built formatter handling Lua's format specifiers (`%d`, `%i`, `%u`, `%o`, `%x`, `%X`, `%e`, `%E`, `%f`, `%g`, `%G`, `%c`, `%s`, `%%`). Eliminates the fork's last runtime dependency. |

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

Validation tests in `test/unit/fengari/coroutine-promise-bridge.test.ts` confirm:

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

## Test suite

Tests live in `test/unit/fengari/`. Two categories:

**Fork-specific tests** (6 files, 52 tests): validate fork-specific changes — 53-bit integer widening, `lua_atnativeerror`, `collectgarbage` safe modes, `__gc` finalizers via `FinalizationRegistry`, `os.*` platform-guarded functions, and the coroutine↔Promise bridge.

**Absorbed upstream tests** (17 files, 217 tests, 6 skipped): the original fengari test suite converted from CJS/Jest to ESM/Vitest. Skipped tests cover stripped features: `loadlib` (4 tests), `debug.debug()` (1 test), `os.execute` (1 test). The `loadlib.test.js` file was not absorbed (entire library stripped).

## Upstream sync policy

Upstream fengari is essentially frozen (last release: v0.1.5). This fork will check upstream quarterly and cherry-pick only security or correctness fixes.
