import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import type { LuaModuleSnapshot } from './module-snapshot';

export interface RequireDeps {
    /** Consulted before the adapter. Omitted: every miss goes to the adapter. */
    snapshot?: LuaModuleSnapshot;
    /** Whether the calling state may yield. Omitted: assumed yes. */
    isAsyncCapable?: (L: lua_State) => boolean;
}

export function injectPackageAndRequire(
    L: lua_State,
    _configDir: string,
    deps: RequireDeps = {},
): void {
    const basePath = 'lua';

    lua.lua_newtable(L);
    const packageIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    lua.lua_setfield(L, packageIndex, to_luastring('loaded'));

    lua.lua_pushstring(
        L,
        to_luastring(`${basePath}/?.lua;${basePath}/?/init.lua`),
    );
    lua.lua_setfield(L, packageIndex, to_luastring('path'));

    lua.lua_pushstring(L, to_luastring('\n;\n?\n!\n-'));
    lua.lua_setfield(L, packageIndex, to_luastring('config'));

    lua.lua_setglobal(L, to_luastring('package'));

    injectSandboxedLoad(L);
    injectRequireFunction(L, basePath, deps);
}

function injectSandboxedLoad(L: lua_State): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const chunkBytes = lua.lua_tolstring(state, 1);
        if (!chunkBytes) {
            lua.lua_pushnil(state);
            lua.lua_pushstring(
                state,
                to_luastring('load expects a string chunk'),
            );
            return 2;
        }

        const status = lauxlib.luaL_loadstring(state, chunkBytes);
        if (status !== lua.LUA_OK) {
            const errMsg = lua.lua_tolstring(state, -1);
            lua.lua_pop(state, 1);
            lua.lua_pushnil(state);
            lua.lua_pushstring(
                state,
                errMsg ?? to_luastring('compilation error'),
            );
            return 2;
        }
        return 1;
    });
    lua.lua_setglobal(L, to_luastring('load'));
}

function injectRequireFunction(
    L: lua_State,
    basePath: string,
    deps: RequireDeps,
): void {
    const escapedBasePath = basePath
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

    const requireLua = `
local _snapshot_read, _async_capable = ...
local _base_path = '${escapedBasePath}'
local _NATIVE_UNAVAILABLE = {
    ffi = 'the FFI library',
    jit = 'the jit namespace',
}

function require(modname)
    if type(modname) ~= "string" then
        error("bad argument #1 to 'require' (string expected, got " .. type(modname) .. ")", 2)
    end

    if modname:find("%.%.") or modname:sub(1,1) == "/" or modname:sub(1,1) == "\\\\" then
        error("require: invalid module name '" .. modname .. "' (path traversal not allowed)", 2)
    end

    if package.loaded[modname] ~= nil then
        return package.loaded[modname]
    end

    -- LuaJIT-only natives. Without this they fall through to the file read and
    -- surface whatever that fails with, which describes the wrong problem.
    if _NATIVE_UNAVAILABLE[modname] then
        error(
            "module '" .. modname .. "' is not available: " ..
            _NATIVE_UNAVAILABLE[modname] ..
            " requires LuaJIT, and this runtime is a pure-Lua VM",
            2
        )
    end

    local rel_path = modname:gsub("%.", "/")
    local file_path = _base_path .. "/" .. rel_path .. ".lua"
    local init_path = _base_path .. "/" .. rel_path .. "/init.lua"

    package.loaded[modname] = true

    -- The snapshot resolves without yielding, which is the whole point: a lazy
    -- require from a keymap callback runs on the main state and cannot yield.
    local chunk_path = file_path
    local source = _snapshot_read(file_path)
    if source == nil then
        source = _snapshot_read(init_path)
        if source ~= nil then
            chunk_path = init_path
        end
    end

    if source == nil then
        if not _async_capable() then
            package.loaded[modname] = nil
            error(
                "module '" .. modname .. "' not present in the configuration snapshot" ..
                " (looked for " .. file_path .. " and " .. init_path .. "). The snapshot" ..
                " is built when the configuration loads, so reload the configuration if" ..
                " the file was added since, and check the developer console for files" ..
                " skipped against the snapshot's size limits.",
                2
            )
        end

        local read_ok
        read_ok, source = pcall(vim.ob.fs.read, file_path)
        if not read_ok then
            read_ok, source = pcall(vim.ob.fs.read, init_path)
            if read_ok then
                chunk_path = init_path
            end
        end
        if not read_ok then
            package.loaded[modname] = nil
            error("module '" .. modname .. "' not found: " .. tostring(source), 2)
        end
    end

    local chunk, compile_err = load(source, "@" .. chunk_path)
    if not chunk then
        package.loaded[modname] = nil
        error("error loading module '" .. modname .. "': " .. tostring(compile_err), 2)
    end

    local exec_ok, result = pcall(chunk)
    if not exec_ok then
        package.loaded[modname] = nil
        error("error in module '" .. modname .. "': " .. tostring(result), 2)
    end

    if result ~= nil then
        package.loaded[modname] = result
    end

    return package.loaded[modname]
end
`;

    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(requireLua));
    if (loadStatus !== lua.LUA_OK) {
        reportInjectionFailure(L);
        return;
    }

    // Passed as chunk arguments rather than set as globals, so the sandbox
    // never sees them and user code cannot reach the snapshot.
    const { snapshot, isAsyncCapable } = deps;

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pathBytes = lua.lua_tolstring(state, 1);
        const source =
            pathBytes && snapshot
                ? snapshot.get(to_jsstring(pathBytes))
                : undefined;
        if (source === undefined) {
            lua.lua_pushnil(state);
        } else {
            lua.lua_pushstring(state, to_luastring(source));
        }
        return 1;
    });

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushboolean(
            state,
            isAsyncCapable ? isAsyncCapable(state) : true,
        );
        return 1;
    });

    if (lua.lua_pcall(L, 2, 0, 0) !== lua.LUA_OK) {
        reportInjectionFailure(L);
    }
}

function reportInjectionFailure(L: lua_State): void {
    const msg = lua.lua_tolstring(L, -1);
    console.error(
        'Vim Motions: failed to inject require:',
        msg ? to_jsstring(msg) : 'unknown error',
    );
    lua.lua_pop(L, 1);
}
