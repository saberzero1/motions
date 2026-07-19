import { lua, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { evalLua } from './engine';
import {
    readBooleanField,
    readLuaString,
    readStringField,
    type VimApiCallbacks,
} from './api';

const LUA_TEXTOBJECT_API = `vim.textobject = vim.textobject or {}
vim.gen_spec = vim.gen_spec or {}

vim.textobject._registry = {}

function vim.gen_spec.pair(open, close, opts)
    opts = opts or {}
    return {
        _type = "pair",
        open = open,
        close = close,
        multiline = opts.multiline ~= false,
    }
end

function vim.textobject.add(keys, spec)
    if type(keys) ~= "string" or #keys < 2 then
        vim.notify("vim.textobject.add: keys must be a string of 2+ characters", vim.log.levels.ERROR)
        return
    end
    local prefix = keys:sub(1, 1)
    if prefix ~= "i" and prefix ~= "a" then
        vim.notify("vim.textobject.add: keys must start with 'i' (inner) or 'a' (around)", vim.log.levels.ERROR)
        return
    end
    if spec == nil or type(spec) ~= "table" or spec._type == nil then
        vim.notify("vim.textobject.add: spec must be a table from vim.gen_spec.*", vim.log.levels.ERROR)
        return
    end
    vim.textobject._registry[keys] = spec
    __vim_textobject_add(keys, spec)
end

function vim.textobject.del(keys)
    vim.textobject._registry[keys] = nil
    __vim_textobject_del(keys)
end
`;

export function injectTextObjectApi(
    L: lua_State,
    callbacks: VimApiCallbacks,
): void {
    evalLua(L, LUA_TEXTOBJECT_API);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const keys = readLuaString(state, 1);
        if (!keys || !lua.lua_istable(state, 2)) return 0;
        const specIndex = lua.lua_absindex(state, 2);
        const typeValue = readStringField(state, specIndex, '_type');
        if (typeValue !== 'pair') return 0;
        const open = readStringField(state, specIndex, 'open');
        const close = readStringField(state, specIndex, 'close');
        if (open === undefined || close === undefined) return 0;
        const multiline =
            readBooleanField(state, specIndex, 'multiline') ?? true;
        const inner = keys.startsWith('i');
        callbacks.onTextObjectAdd?.(keys, {
            open,
            close,
            multiline,
            inner,
        });
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('__vim_textobject_add'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const keys = readLuaString(state, 1);
        if (keys) callbacks.onTextObjectDel?.(keys);
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('__vim_textobject_del'));
}
