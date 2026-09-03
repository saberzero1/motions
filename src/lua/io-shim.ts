import { lua, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import { Platform } from 'obsidian';

export interface IoShimCallbacks {
    vaultRead?: (path: string) => string | null;
    vaultWrite?: (path: string, content: string) => boolean;
    vaultAppend?: (path: string, content: string) => boolean;
    vaultExists?: (path: string) => boolean;
}

const IO_OUTPUT_BUFFER: string[] = [];

interface FileHandle {
    path: string;
    content: string;
    pos: number;
    mode: string;
    closed: boolean;
}

const openHandles = new Map<number, FileHandle>();
let handleCounter = 1;

function getExternalFs(): {
    readFileSync: (path: string, enc: string) => string;
    writeFileSync: (path: string, data: string) => void;
    appendFileSync: (path: string, data: string) => void;
    existsSync: (path: string) => boolean;
} | null {
    if (!Platform.isDesktop) return null;
    try {
        const reqFn = (window as Window & { require?: (m: string) => unknown })
            .require;
        if (!reqFn) return null;
        return reqFn('fs') as {
            readFileSync: (path: string, enc: string) => string;
            writeFileSync: (path: string, data: string) => void;
            appendFileSync: (path: string, data: string) => void;
            existsSync: (path: string) => boolean;
        };
    } catch {
        return null;
    }
}

function isAbsolutePath(p: string): boolean {
    if (p.startsWith('/') || p.startsWith('~')) return true;
    if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return true;
    return false;
}

function readFile(path: string, callbacks: IoShimCallbacks): string | null {
    if (isAbsolutePath(path)) {
        const fs = getExternalFs();
        if (!fs) return null;
        try {
            return fs.readFileSync(path, 'utf-8');
        } catch {
            return null;
        }
    }
    return callbacks.vaultRead?.(path) ?? null;
}

function writeFile(
    path: string,
    content: string,
    callbacks: IoShimCallbacks,
): boolean {
    if (isAbsolutePath(path)) {
        const fs = getExternalFs();
        if (!fs) return false;
        try {
            fs.writeFileSync(path, content);
            return true;
        } catch {
            return false;
        }
    }
    return callbacks.vaultWrite?.(path, content) ?? false;
}

function appendFile(
    path: string,
    content: string,
    callbacks: IoShimCallbacks,
): boolean {
    if (isAbsolutePath(path)) {
        const fs = getExternalFs();
        if (!fs) return false;
        try {
            fs.appendFileSync(path, content);
            return true;
        } catch {
            return false;
        }
    }
    return callbacks.vaultAppend?.(path, content) ?? false;
}

function pushFileHandle(
    L: lua_State,
    id: number,
    callbacks: IoShimCallbacks,
): void {
    lua.lua_newtable(L);
    const tblIndex = lua.lua_gettop(L);

    lua.lua_pushnumber(L, id);
    lua.lua_setfield(L, tblIndex, to_luastring('_id'));

    registerHandleMethods(L, tblIndex, callbacks);
}

function getHandleId(L: lua_State, index: number): number | null {
    if (!lua.lua_istable(L, index)) return null;
    lua.lua_getfield(L, index, to_luastring('_id'));
    if (!lua.lua_isnumber(L, -1)) {
        lua.lua_pop(L, 1);
        return null;
    }
    const id = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return id;
}

function getHandle(L: lua_State, index: number): FileHandle | null {
    const id = getHandleId(L, index);
    if (id === null) return null;
    return openHandles.get(id) ?? null;
}

function registerHandleMethods(
    L: lua_State,
    tblIndex: number,
    callbacks: IoShimCallbacks,
): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (!handle || handle.closed) {
            lua.lua_pushnil(state);
            lua.lua_pushstring(
                state,
                to_luastring('attempt to use a closed file'),
            );
            return 2;
        }
        const fmt =
            lua.lua_gettop(state) >= 2 && lua.lua_isstring(state, 2)
                ? to_jsstring(lua.lua_tolstring(state, 2)!)
                : '*l';
        if (fmt === '*a' || fmt === 'a') {
            const rest = handle.content.slice(handle.pos);
            handle.pos = handle.content.length;
            lua.lua_pushstring(state, to_luastring(rest));
            return 1;
        }
        if (fmt === '*l' || fmt === 'l') {
            if (handle.pos >= handle.content.length) {
                lua.lua_pushnil(state);
                return 1;
            }
            const nl = handle.content.indexOf('\n', handle.pos);
            const line =
                nl === -1
                    ? handle.content.slice(handle.pos)
                    : handle.content.slice(handle.pos, nl);
            handle.pos = nl === -1 ? handle.content.length : nl + 1;
            lua.lua_pushstring(state, to_luastring(line));
            return 1;
        }
        if (fmt === '*n' || fmt === 'n') {
            const sub = handle.content.slice(handle.pos);
            const match = sub.match(/^[\s]*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)/);
            if (!match) {
                lua.lua_pushnil(state);
                return 1;
            }
            handle.pos += match[0].length;
            lua.lua_pushnumber(state, Number(match[1]));
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('read'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (!handle || handle.closed) {
            lua.lua_pushnil(state);
            lua.lua_pushstring(
                state,
                to_luastring('attempt to use a closed file'),
            );
            return 2;
        }
        const parts: string[] = [];
        for (let i = 2; i <= lua.lua_gettop(state); i++) {
            if (lua.lua_isstring(state, i)) {
                parts.push(to_jsstring(lua.lua_tolstring(state, i)!));
            } else if (lua.lua_isnumber(state, i)) {
                parts.push(String(lua.lua_tonumber(state, i)));
            }
        }
        const text = parts.join('');
        if (handle.mode.includes('a')) {
            appendFile(handle.path, text, callbacks);
        } else {
            handle.content =
                handle.content.slice(0, handle.pos) +
                text +
                handle.content.slice(handle.pos + text.length);
            handle.pos += text.length;
            writeFile(handle.path, handle.content, callbacks);
        }
        lua.lua_pushvalue(state, 1);
        return 1;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('write'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (!handle || handle.closed) {
            lua.lua_pushboolean(state, true);
            return 1;
        }
        handle.closed = true;
        const id = getHandleId(state, 1);
        if (id !== null) openHandles.delete(id);
        lua.lua_pushboolean(state, true);
        return 1;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('close'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (!handle || handle.closed) {
            lua.lua_pushnil(state);
            return 1;
        }
        const whence =
            lua.lua_gettop(state) >= 2 && lua.lua_isstring(state, 2)
                ? to_jsstring(lua.lua_tolstring(state, 2)!)
                : 'cur';
        const offset =
            lua.lua_gettop(state) >= 3 ? lua.lua_tonumber(state, 3) : 0;
        if (whence === 'set') {
            handle.pos = offset;
        } else if (whence === 'cur') {
            handle.pos += offset;
        } else if (whence === 'end') {
            handle.pos = handle.content.length + offset;
        }
        handle.pos = Math.max(0, Math.min(handle.pos, handle.content.length));
        lua.lua_pushnumber(state, handle.pos);
        return 1;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('seek'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('flush'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (!handle || handle.closed) {
            lua.lua_pushnil(state);
            return 1;
        }
        const iterState = { handle };
        lua.lua_pushjsfunction(L, (st: lua_State) => {
            if (iterState.handle.pos >= iterState.handle.content.length) {
                lua.lua_pushnil(st);
                return 1;
            }
            const nl = iterState.handle.content.indexOf(
                '\n',
                iterState.handle.pos,
            );
            const line =
                nl === -1
                    ? iterState.handle.content.slice(iterState.handle.pos)
                    : iterState.handle.content.slice(iterState.handle.pos, nl);
            iterState.handle.pos =
                nl === -1 ? iterState.handle.content.length : nl + 1;
            lua.lua_pushstring(st, to_luastring(line));
            return 1;
        });
        return 1;
    });
    lua.lua_setfield(L, tblIndex, to_luastring('lines'));
}

export function injectIoShim(L: lua_State, callbacks: IoShimCallbacks): void {
    lua.lua_newtable(L);
    const ioIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = lua.lua_isstring(state, 1)
            ? to_jsstring(lua.lua_tolstring(state, 1)!)
            : null;
        if (!path) {
            lua.lua_pushnil(state);
            lua.lua_pushstring(state, to_luastring('io.open: expected path'));
            return 2;
        }
        const mode =
            lua.lua_gettop(state) >= 2 && lua.lua_isstring(state, 2)
                ? to_jsstring(lua.lua_tolstring(state, 2)!)
                : 'r';

        if (mode.includes('r')) {
            const content = readFile(path, callbacks);
            if (content === null) {
                lua.lua_pushnil(state);
                lua.lua_pushstring(
                    state,
                    to_luastring(`cannot open '${path}': No such file`),
                );
                return 2;
            }
            const id = handleCounter++;
            openHandles.set(id, {
                path,
                content,
                pos: 0,
                mode,
                closed: false,
            });
            pushFileHandle(state, id, callbacks);
            return 1;
        }

        if (mode.includes('w') || mode.includes('a')) {
            const existing = mode.includes('a')
                ? (readFile(path, callbacks) ?? '')
                : '';
            const id = handleCounter++;
            openHandles.set(id, {
                path,
                content: existing,
                pos: mode.includes('a') ? existing.length : 0,
                mode,
                closed: false,
            });
            if (mode.includes('w')) {
                writeFile(path, '', callbacks);
            }
            pushFileHandle(state, id, callbacks);
            return 1;
        }

        lua.lua_pushnil(state);
        lua.lua_pushstring(state, to_luastring(`unsupported mode '${mode}'`));
        return 2;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('open'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const handle = getHandle(state, 1);
        if (handle && !handle.closed) {
            handle.closed = true;
            const id = getHandleId(state, 1);
            if (id !== null) openHandles.delete(id);
        }
        lua.lua_pushboolean(state, true);
        return 1;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('close'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const parts: string[] = [];
        for (let i = 1; i <= lua.lua_gettop(state); i++) {
            if (lua.lua_isstring(state, i)) {
                parts.push(to_jsstring(lua.lua_tolstring(state, i)!));
            } else if (lua.lua_isnumber(state, i)) {
                parts.push(String(lua.lua_tonumber(state, i)));
            }
        }
        IO_OUTPUT_BUFFER.push(parts.join(''));
        return 0;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('write'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('read'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = lua.lua_isstring(state, 1)
            ? to_jsstring(lua.lua_tolstring(state, 1)!)
            : null;
        if (!path) {
            lua.lua_pushnil(state);
            return 1;
        }
        const content = readFile(path, callbacks);
        if (content === null) {
            lua.lua_pushnil(state);
            return 1;
        }
        let pos = 0;
        lua.lua_pushjsfunction(L, (st: lua_State) => {
            if (pos >= content.length) {
                lua.lua_pushnil(st);
                return 1;
            }
            const nl = content.indexOf('\n', pos);
            const line =
                nl === -1 ? content.slice(pos) : content.slice(pos, nl);
            pos = nl === -1 ? content.length : nl + 1;
            lua.lua_pushstring(st, to_luastring(line));
            return 1;
        });
        return 1;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('lines'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (lua.lua_gettop(state) === 0 || lua.lua_isnil(state, 1)) {
            lua.lua_pushstring(state, to_luastring('closed file'));
            return 1;
        }
        const id = getHandleId(state, 1);
        if (id === null) {
            lua.lua_pushnil(state);
            return 1;
        }
        const handle = openHandles.get(id);
        if (!handle) {
            lua.lua_pushstring(state, to_luastring('closed file'));
            return 1;
        }
        lua.lua_pushstring(state, to_luastring('file'));
        return 1;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('type'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('tmpfile'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('input'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, ioIndex, to_luastring('output'));

    lua.lua_pushvalue(L, ioIndex);
    lua.lua_setglobal(L, to_luastring('io'));
    lua.lua_pop(L, 1);
}
