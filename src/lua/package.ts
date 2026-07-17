import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';

export function injectPackageAndRequire(
    L: lua_State,
    _configDir: string,
): void {
    const basePath = 'lua';

    lua.lua_newtable(L);
    const packageIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    lua.lua_setfield(L, packageIndex, to_luastring('loaded'));

    lua.lua_pushstring(L, to_luastring(`${basePath}/?.lua`));
    lua.lua_setfield(L, packageIndex, to_luastring('path'));

    lua.lua_pushstring(L, to_luastring('\n;\n?\n!\n-'));
    lua.lua_setfield(L, packageIndex, to_luastring('config'));

    lua.lua_setglobal(L, to_luastring('package'));

    injectSandboxedLoad(L);
    injectRequireFunction(L, basePath);
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

function injectRequireFunction(L: lua_State, basePath: string): void {
    const escapedBasePath = basePath
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

    const requireLua = `
local _base_path = '${escapedBasePath}'

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

    local rel_path = modname:gsub("%.", "/")
    local file_path = _base_path .. "/" .. rel_path .. ".lua"

    package.loaded[modname] = true

    local read_ok, source = pcall(vim.ob.fs.read, file_path)
    if not read_ok then
        package.loaded[modname] = nil
        error("module '" .. modname .. "' not found: " .. tostring(source), 2)
    end

    local chunk, compile_err = load(source, "@" .. file_path)
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

    const status = lauxlib.luaL_dostring(L, to_luastring(requireLua));
    if (status !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        console.error(
            'Vim Motions: failed to inject require:',
            msg ? to_jsstring(msg) : 'unknown error',
        );
        lua.lua_pop(L, 1);
    }
}
