import { lua, lauxlib, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import {
    MODE_PROMPT_MAP,
    pushLuaAny,
    readLuaString,
    readStringField,
    replaceLeaderKey,
} from './api';
import type { VimApiCallbacks } from './api';

export function injectObsidianApi(
    L: lua_State,
    vimTableIndex: number,
    callbacks: VimApiCallbacks,
    getLeaderKey: () => string,
): void {
    lua.lua_newtable(L);
    const obsidianIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = callbacks.getVaultName();
        lua.lua_pushstring(state, to_luastring(name));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('vault_name'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const version = callbacks.getAppVersion?.() ?? '';
        lua.lua_pushstring(state, to_luastring(version));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('app_version'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const version = callbacks.getPluginVersion?.() ?? '';
        lua.lua_pushstring(state, to_luastring(version));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('plugin_version'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const id = readLuaString(state, 1);
        if (!id) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.run_command expects an id string'),
            );
        }
        callbacks.executeCommand?.(id);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('run_command'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const list = callbacks.listCommands?.() ?? [];
        pushLuaAny(state, list);
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('list_commands'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.open_file expects a path string'),
            );
        }
        callbacks.openFile?.(path);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('open_file'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const source = readLuaString(state, 1);
        if (!source) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.pick expects a source string'),
            );
        }
        let query: string | undefined;
        if (lua.lua_istable(state, 2)) {
            query = readStringField(state, 2, 'query');
        }
        callbacks.openPicker?.(source, query ? { query } : undefined);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('pick'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.pick_keymap expects a table'),
            );
        }
        const keymap: Record<string, string[]> = {};
        const fields = [
            'move_down',
            'move_up',
            'confirm',
            'split_h',
            'split_v',
            'open_tab',
            'scroll_down',
            'scroll_up',
            'close',
        ];
        for (const field of fields) {
            lua.lua_getfield(state, 1, to_luastring(field));
            if (lua.lua_istable(state, -1)) {
                const arr: string[] = [];
                const len = lauxlib.luaL_len(state, -1);
                for (let i = 1; i <= len; i++) {
                    lua.lua_rawgeti(state, -1, i);
                    const val = readLuaString(state, -1);
                    if (val) arr.push(val);
                    lua.lua_pop(state, 1);
                }
                const camelField = field.replace(/_([a-z])/g, (_, c: string) =>
                    c.toUpperCase(),
                );
                keymap[camelField] = arr;
            }
            lua.lua_pop(state, 1);
        }
        callbacks.onPickerKeymapChange?.(keymap);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('pick_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const file = callbacks.getCurrentFile?.() ?? null;
        if (!file) {
            lua.lua_pushnil(state);
            return 1;
        }
        pushLuaAny(state, file);
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('current_file'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = callbacks.getVaultPath?.() ?? null;
        if (!path) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_pushstring(state, to_luastring(path));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('vault_path'));

    // vim.obsidian.keymap sub-table
    lua.lua_newtable(L);
    const obsKeymapIndex = lua.lua_gettop(L);
    // vim.obsidian.keymap.set(lhs, rhs, opts?)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lhsRaw = readLuaString(state, 1);
        if (!lhsRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.keymap.set expects a lhs string'),
            );
        }
        const rhs = readLuaString(state, 2);
        if (!rhs) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.keymap.set expects a rhs string'),
            );
        }
        if (!rhs.startsWith(':')) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    "vim.obsidian.keymap.set: rhs must start with ':' (e.g., ':obcommand app:reload' or ':sidebar left')",
                ),
            );
        }
        let desc: string | undefined;
        if (lua.lua_istable(state, 3)) {
            desc = readStringField(state, 3, 'desc');
        }
        const leaderKey = getLeaderKey();
        const lhs = replaceLeaderKey(lhsRaw, leaderKey);
        callbacks.onGlobalKeymap?.({ lhs, rhs, desc });
        return 0;
    });
    lua.lua_setfield(L, obsKeymapIndex, to_luastring('set'));
    // vim.obsidian.keymap.del(lhs)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lhsRaw = readLuaString(state, 1);
        if (!lhsRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.keymap.del expects a lhs string'),
            );
        }
        const leaderKey = getLeaderKey();
        const lhs = replaceLeaderKey(lhsRaw, leaderKey);
        callbacks.onGlobalKeymapDel?.(lhs);
        return 0;
    });
    lua.lua_setfield(L, obsKeymapIndex, to_luastring('del'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('keymap'));

    // vim.obsidian.whichkey sub-table
    lua.lua_newtable(L);
    const obsWhichkeyIndex = lua.lua_gettop(L);
    // vim.obsidian.whichkey.set_group(key, label, opts?)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const keyRaw = readLuaString(state, 1);
        if (!keyRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.whichkey.set_group expects a key string',
                ),
            );
        }
        const label = readLuaString(state, 2);
        if (!label) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.whichkey.set_group expects a label string',
                ),
            );
        }
        let context: 'editor' | 'global' = 'editor';
        if (lua.lua_istable(state, 3)) {
            const ctx = readStringField(state, 3, 'context');
            if (ctx === 'global') context = 'global';
        }
        const leaderKey = getLeaderKey();
        const key = replaceLeaderKey(keyRaw, leaderKey);
        callbacks.onWhichKeyGroupLabel?.(key, label, context);
        return 0;
    });
    lua.lua_setfield(L, obsWhichkeyIndex, to_luastring('set_group'));
    // vim.obsidian.whichkey.set_label(key, label, opts?)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const keyRaw = readLuaString(state, 1);
        if (!keyRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.whichkey.set_label expects a key string',
                ),
            );
        }
        const label = readLuaString(state, 2);
        if (!label) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.whichkey.set_label expects a label string',
                ),
            );
        }
        let context: 'editor' | 'global' = 'editor';
        if (lua.lua_istable(state, 3)) {
            const ctx = readStringField(state, 3, 'context');
            if (ctx === 'global') context = 'global';
        }
        const leaderKey = getLeaderKey();
        const key = replaceLeaderKey(keyRaw, leaderKey);
        callbacks.onWhichKeyCommandLabel?.(key, label, context);
        return 0;
    });
    lua.lua_setfield(L, obsWhichkeyIndex, to_luastring('set_label'));
    // vim.obsidian.whichkey.add(entries)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.whichkey.add expects a table of entries',
                ),
            );
        }
        const leaderKey = getLeaderKey();
        const len = lauxlib.luaL_len(state, 1);
        for (let i = 1; i <= len; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (!lua.lua_istable(state, -1)) {
                lua.lua_pop(state, 1);
                continue;
            }
            const entryIndex = lua.lua_gettop(state);
            lua.lua_rawgeti(state, entryIndex, 1);
            const keyRaw = readLuaString(state, -1);
            lua.lua_pop(state, 1);
            if (!keyRaw) {
                lua.lua_pop(state, 1);
                continue;
            }
            const key = replaceLeaderKey(keyRaw, leaderKey);
            let context: 'editor' | 'global' = 'editor';
            const ctx = readStringField(state, entryIndex, 'context');
            if (ctx === 'global') context = 'global';
            const group = readStringField(state, entryIndex, 'group');
            const desc = readStringField(state, entryIndex, 'desc');
            if (group) {
                callbacks.onWhichKeyGroupLabel?.(key, group, context);
            } else if (desc) {
                callbacks.onWhichKeyCommandLabel?.(key, desc, context);
            }
            lua.lua_pop(state, 1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsWhichkeyIndex, to_luastring('add'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('whichkey'));

    // vim.obsidian.cursor sub-table
    const VALID_CURSOR_SHAPES = new Set([
        'block',
        'bar',
        'underline',
        'hollow',
    ]);
    const CURSOR_MODE_MAP: Record<string, string> = {
        normal: 'normal',
        insert: 'insert',
        visual: 'visual',
        replace: 'replace',
        operator_pending: 'operatorPending',
    };
    lua.lua_newtable(L);
    const obsCursorIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.cursor.set expects a table'),
            );
        }
        const shapes: Record<string, string> = {};
        for (const [luaKey, tsKey] of Object.entries(CURSOR_MODE_MAP)) {
            const val = readStringField(state, 1, luaKey);
            if (val !== undefined) {
                if (!VALID_CURSOR_SHAPES.has(val)) {
                    return lauxlib.luaL_error(
                        state,
                        to_luastring(
                            `vim.obsidian.cursor.set: invalid shape "${val}" for mode "${luaKey}". Valid: block, bar, underline, hollow`,
                        ),
                    );
                }
                shapes[tsKey] = val;
            }
        }
        if (Object.keys(shapes).length > 0) {
            callbacks.onCursorConfig?.(shapes);
        }
        return 0;
    });
    lua.lua_setfield(L, obsCursorIndex, to_luastring('set'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('cursor'));

    // vim.obsidian.modeprompt sub-table
    lua.lua_newtable(L);
    const obsModePromptIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.modeprompt.set expects a table'),
            );
        }
        const prompts: Record<string, string> = {};
        for (const [luaKey, tsKey] of Object.entries(MODE_PROMPT_MAP)) {
            const val = readStringField(state, 1, luaKey);
            if (val !== undefined) {
                prompts[tsKey] = val;
            }
        }
        if (Object.keys(prompts).length > 0) {
            callbacks.onModePromptConfig?.(prompts);
        }
        return 0;
    });
    lua.lua_setfield(L, obsModePromptIndex, to_luastring('set'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('modeprompt'));

    // vim.obsidian.surround sub-table
    lua.lua_newtable(L);
    const obsSurroundIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const trigger = readLuaString(state, 1);
        if (!trigger || trigger.length !== 1) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.surround.set expects a single-character trigger string',
                ),
            );
        }
        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.surround.set expects a table with left and right fields',
                ),
            );
        }
        const left = readStringField(state, 2, 'left');
        const right = readStringField(state, 2, 'right');
        if (!left || !right) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.surround.set: table must have non-empty left and right fields',
                ),
            );
        }
        callbacks.onSurroundPair?.(trigger, left, right);
        return 0;
    });
    lua.lua_setfield(L, obsSurroundIndex, to_luastring('set'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const trigger = readLuaString(state, 1);
        if (!trigger) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.surround.del expects a trigger string',
                ),
            );
        }
        callbacks.onSurroundPairDel?.(trigger);
        return 0;
    });
    lua.lua_setfield(L, obsSurroundIndex, to_luastring('del'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.surround.add expects a table of entries',
                ),
            );
        }
        const len = lauxlib.luaL_len(state, 1);
        for (let i = 1; i <= len; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (!lua.lua_istable(state, -1)) {
                lua.lua_pop(state, 1);
                continue;
            }
            const entryIndex = lua.lua_gettop(state);
            lua.lua_rawgeti(state, entryIndex, 1);
            const trigger = readLuaString(state, -1);
            lua.lua_pop(state, 1);
            if (!trigger || trigger.length !== 1) {
                lua.lua_pop(state, 1);
                continue;
            }
            const left = readStringField(state, entryIndex, 'left');
            const right = readStringField(state, entryIndex, 'right');
            if (left && right) {
                callbacks.onSurroundPair?.(trigger, left, right);
            }
            lua.lua_pop(state, 1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsSurroundIndex, to_luastring('add'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('surround'));

    // vim.obsidian.leader sub-table
    lua.lua_newtable(L);
    const obsLeaderIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 1);
        if (!key) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.leader.set expects a key string'),
            );
        }
        const commandId = readLuaString(state, 2);
        if (!commandId) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.leader.set expects a command ID string',
                ),
            );
        }
        let desc: string | undefined;
        if (lua.lua_istable(state, 3)) {
            desc = readStringField(state, 3, 'desc');
        }
        const leaderKey = getLeaderKey();
        const lhs = leaderKey + key;
        const rhs = ':ob ' + commandId + '<CR>';
        callbacks.onKeymap({
            mode: 'normal',
            lhs,
            rhs,
            noremap: true,
            desc,
        });
        callbacks.onLeaderBinding?.(key, commandId, desc);
        if (desc) {
            callbacks.onWhichKeyCommandLabel?.(lhs, desc, 'editor');
        }
        return 0;
    });
    lua.lua_setfield(L, obsLeaderIndex, to_luastring('set'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 1);
        if (!key) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.leader.del expects a key string'),
            );
        }
        const leaderKey = getLeaderKey();
        const lhs = leaderKey + key;
        callbacks.onKeymapDel({ mode: 'normal', lhs });
        callbacks.onLeaderBindingDel?.(key);
        return 0;
    });
    lua.lua_setfield(L, obsLeaderIndex, to_luastring('del'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.leader.add expects a table of entries',
                ),
            );
        }
        const leaderKey = getLeaderKey();
        const len = lauxlib.luaL_len(state, 1);
        for (let i = 1; i <= len; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (!lua.lua_istable(state, -1)) {
                lua.lua_pop(state, 1);
                continue;
            }
            const entryIndex = lua.lua_gettop(state);
            lua.lua_rawgeti(state, entryIndex, 1);
            const key = readLuaString(state, -1);
            lua.lua_pop(state, 1);
            if (!key) {
                lua.lua_pop(state, 1);
                continue;
            }
            lua.lua_rawgeti(state, entryIndex, 2);
            const commandId = readLuaString(state, -1);
            lua.lua_pop(state, 1);
            if (!commandId) {
                lua.lua_pop(state, 1);
                continue;
            }
            const desc = readStringField(state, entryIndex, 'desc');
            const lhs = leaderKey + key;
            const rhs = ':ob ' + commandId + '<CR>';
            callbacks.onKeymap({
                mode: 'normal',
                lhs,
                rhs,
                noremap: true,
                desc,
            });
            callbacks.onLeaderBinding?.(key, commandId, desc);
            if (desc) {
                callbacks.onWhichKeyCommandLabel?.(lhs, desc, 'editor');
            }
            lua.lua_pop(state, 1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsLeaderIndex, to_luastring('add'));
    lua.lua_setfield(L, obsidianIndex, to_luastring('leader'));

    // vim.obsidian.get_leaf_type()
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const info = callbacks.getActiveLeafInfo?.();
        if (!info) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_pushstring(state, to_luastring(info.type));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('get_leaf_type'));

    // vim.obsidian.get_active_leaf()
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const info = callbacks.getActiveLeafInfo?.();
        if (!info) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_newtable(state);
        lua.lua_pushstring(state, to_luastring(info.id));
        lua.lua_setfield(state, -2, to_luastring('id'));
        lua.lua_pushstring(state, to_luastring(info.type));
        lua.lua_setfield(state, -2, to_luastring('type'));
        lua.lua_pushboolean(state, info.pinned);
        lua.lua_setfield(state, -2, to_luastring('pinned'));
        if (info.filePath) {
            lua.lua_pushstring(state, to_luastring(info.filePath));
        } else {
            lua.lua_pushnil(state);
        }
        lua.lua_setfield(state, -2, to_luastring('file_path'));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('get_active_leaf'));

    // vim.obsidian.list_leaves()
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const leaves = callbacks.listLeaves?.() ?? [];
        lua.lua_newtable(state);
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i]!;
            lua.lua_newtable(state);
            lua.lua_pushstring(state, to_luastring(leaf.id));
            lua.lua_setfield(state, -2, to_luastring('id'));
            lua.lua_pushstring(state, to_luastring(leaf.type));
            lua.lua_setfield(state, -2, to_luastring('type'));
            lua.lua_pushboolean(state, leaf.pinned);
            lua.lua_setfield(state, -2, to_luastring('pinned'));
            if (leaf.filePath) {
                lua.lua_pushstring(state, to_luastring(leaf.filePath));
            } else {
                lua.lua_pushnil(state);
            }
            lua.lua_setfield(state, -2, to_luastring('file_path'));
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('list_leaves'));

    // vim.obsidian.is_markdown_view()
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const result = callbacks.isMarkdownView?.() ?? false;
        lua.lua_pushboolean(state, result);
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('is_markdown_view'));

    // vim.obsidian.follow_link()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('editor:follow-link');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('follow_link'));

    // vim.obsidian.backlinks()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('backlink:open');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('backlinks'));

    // vim.obsidian.daily()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('daily-notes');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('daily'));

    // vim.obsidian.search()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('global-search:open');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('search'));

    // vim.obsidian.tags()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('tag-pane:open');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('tags'));

    // vim.obsidian.new_note()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('file-explorer:new-file');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('new_note'));

    // vim.obsidian.rename()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('workspace:edit-file-title');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('rename'));

    // vim.obsidian.toggle_checkbox()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('editor:toggle-checklist-status');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('toggle_checkbox'));

    // vim.obsidian.template()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('insert-template');
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('template'));

    // vim.obsidian.focus(direction)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const direction = readLuaString(state, 1);
        if (!direction) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.focus expects a direction string'),
            );
        }
        const valid = new Set(['left', 'right', 'top', 'bottom']);
        if (!valid.has(direction)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `vim.obsidian.focus: invalid direction "${direction}". Valid: left, right, top, bottom`,
                ),
            );
        }
        callbacks.focusDirection?.(direction);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('focus'));

    // vim.obsidian.close_leaf()
    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.closeActiveLeaf?.();
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('close_leaf'));

    // vim.obsidian.split(direction)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const direction = readLuaString(state, 1);
        if (!direction) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.split expects a direction string'),
            );
        }
        const valid = new Set(['vertical', 'horizontal']);
        if (!valid.has(direction)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `vim.obsidian.split: invalid direction "${direction}". Valid: vertical, horizontal`,
                ),
            );
        }
        callbacks.splitDirection?.(direction);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('split'));

    // vim.obsidian.get_leaf_for_file(path)
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.get_leaf_for_file expects a path string',
                ),
            );
        }
        const info = callbacks.getLeafForFile?.(path) ?? null;
        if (!info) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_newtable(state);
        lua.lua_pushstring(state, to_luastring(info.id));
        lua.lua_setfield(state, -2, to_luastring('id'));
        lua.lua_pushstring(state, to_luastring(info.type));
        lua.lua_setfield(state, -2, to_luastring('type'));
        lua.lua_pushboolean(state, info.pinned);
        lua.lua_setfield(state, -2, to_luastring('pinned'));
        if (info.filePath) {
            lua.lua_pushstring(state, to_luastring(info.filePath));
        } else {
            lua.lua_pushnil(state);
        }
        lua.lua_setfield(state, -2, to_luastring('file_path'));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('get_leaf_for_file'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const mode = callbacks.getMode?.() ?? 'n';
        lua.lua_pushstring(state, to_luastring(mode));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('mode'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const msg = readLuaString(state, 1);
        if (msg !== null) callbacks.showNotice?.(msg);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('notice'));

    // vim.obsidian.fs sub-table
    lua.lua_newtable(L);
    const obsFsIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pattern = readLuaString(state, 1) ?? undefined;
        const files = callbacks.fsFiles?.(pattern) ?? [];
        pushLuaAny(state, files);
        return 1;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('files'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const files = callbacks.fsAllFiles?.() ?? [];
        pushLuaAny(state, files);
        return 1;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('all_files'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const folders = callbacks.fsFolders?.() ?? [];
        pushLuaAny(state, folders);
        return 1;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('folders'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.fs.exists expects a path string'),
            );
        }
        const result = callbacks.fsExists?.(path) ?? false;
        lua.lua_pushboolean(state, result);
        return 1;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('exists'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const info = callbacks.fsStat?.(path) ?? null;
        if (!info) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_newtable(state);
        lua.lua_pushnumber(state, info.ctime);
        lua.lua_setfield(state, -2, to_luastring('ctime'));
        lua.lua_pushnumber(state, info.mtime);
        lua.lua_setfield(state, -2, to_luastring('mtime'));
        lua.lua_pushnumber(state, info.size);
        lua.lua_setfield(state, -2, to_luastring('size'));
        return 1;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('stat'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.obsidian.fs.create expects a path string'),
            );
        }
        const content = readLuaString(state, 2) ?? '';
        callbacks.fsCreate?.(path, content);
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('create'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const arg1 = readLuaString(state, 1);
        const arg2 = readLuaString(state, 2);
        if (arg1 === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.fs.write expects (path, content) or (content)',
                ),
            );
        }
        if (arg2 !== null) {
            callbacks.fsWrite?.(arg1, arg2);
        } else {
            callbacks.fsWrite?.(undefined, arg1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('write'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const arg1 = readLuaString(state, 1);
        const arg2 = readLuaString(state, 2);
        if (arg1 === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.fs.append expects (path, content) or (content)',
                ),
            );
        }
        if (arg2 !== null) {
            callbacks.fsAppend?.(arg1, arg2);
        } else {
            callbacks.fsAppend?.(undefined, arg1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('append'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const arg1 = readLuaString(state, 1);
        const arg2 = readLuaString(state, 2);
        if (arg1 === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.fs.rename expects (path, new_path) or (new_path)',
                ),
            );
        }
        if (arg2 !== null) {
            callbacks.fsRename?.(arg1, arg2);
        } else {
            callbacks.fsRename?.(undefined, arg1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('rename'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const arg1 = readLuaString(state, 1);
        const arg2 = readLuaString(state, 2);
        if (arg1 === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.fs.move expects (path, dest) or (dest)',
                ),
            );
        }
        if (arg2 !== null) {
            callbacks.fsMove?.(arg1, arg2);
        } else {
            callbacks.fsMove?.(undefined, arg1);
        }
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('move'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        callbacks.fsTrash?.(path);
        return 0;
    });
    lua.lua_setfield(L, obsFsIndex, to_luastring('trash'));

    lua.lua_setfield(L, obsidianIndex, to_luastring('fs'));

    // vim.obsidian.meta sub-table
    lua.lua_newtable(L);
    const obsMetaIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const fm = callbacks.getFileFrontmatter?.(path) ?? null;
        if (!fm) {
            lua.lua_pushnil(state);
            return 1;
        }
        pushLuaAny(state, fm);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('frontmatter'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const tags = callbacks.getFileTags?.(path) ?? [];
        pushLuaAny(state, tags);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('tags'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const links = callbacks.getFileLinks?.(path) ?? [];
        pushLuaAny(state, links);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('links'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const backlinks = callbacks.getFileBacklinks?.(path) ?? [];
        pushLuaAny(state, backlinks);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('backlinks'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const headings = callbacks.getFileHeadings?.(path) ?? [];
        pushLuaAny(state, headings);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('headings'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const embeds = callbacks.getFileEmbeds?.(path) ?? [];
        pushLuaAny(state, embeds);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('embeds'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const aliases = callbacks.getFileAliases?.(path) ?? [];
        pushLuaAny(state, aliases);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('aliases'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const tasks = callbacks.getFileTasks?.(path) ?? [];
        pushLuaAny(state, tasks);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('tasks'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? undefined;
        const lists = callbacks.getFileLists?.(path) ?? [];
        pushLuaAny(state, lists);
        return 1;
    });
    lua.lua_setfield(L, obsMetaIndex, to_luastring('lists'));

    lua.lua_setfield(L, obsidianIndex, to_luastring('meta'));

    // vim.obsidian.ui sub-table
    lua.lua_newtable(L);
    const obsUiIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const side = readLuaString(state, 1);
        const stateArg = readLuaString(state, 2);
        if (!side) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.ui.sidebar expects a side string ("left" or "right")',
                ),
            );
        }
        const validSides = new Set(['left', 'right']);
        if (!validSides.has(side)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `vim.obsidian.ui.sidebar: invalid side "${side}". Valid: left, right`,
                ),
            );
        }
        const command = stateArg
            ? `:sidebar ${side} ${stateArg}`
            : `:sidebar ${side}`;
        callbacks.handleExCommand(command.slice(1));
        return 0;
    });
    lua.lua_setfield(L, obsUiIndex, to_luastring('sidebar'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('command-palette:open');
        return 0;
    });
    lua.lua_setfield(L, obsUiIndex, to_luastring('command_palette'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.executeCommand?.('switcher:open');
        return 0;
    });
    lua.lua_setfield(L, obsUiIndex, to_luastring('quickswitch'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const msg = readLuaString(state, 1);
        if (msg !== null) callbacks.showNotice?.(msg);
        return 0;
    });
    lua.lua_setfield(L, obsUiIndex, to_luastring('notice'));

    lua.lua_setfield(L, obsidianIndex, to_luastring('ui'));

    // vim.obsidian editor state functions
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const sel = callbacks.getSelection?.() ?? null;
        if (sel === null) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_pushstring(state, to_luastring(sel));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('get_selection'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pos = callbacks.getCursorPosition?.() ?? null;
        if (!pos) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_newtable(state);
        lua.lua_pushnumber(state, pos.line);
        lua.lua_setfield(state, -2, to_luastring('line'));
        lua.lua_pushnumber(state, pos.col);
        lua.lua_setfield(state, -2, to_luastring('col'));
        return 1;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('get_cursor'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_isnumber(state, 1) || !lua.lua_isnumber(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.obsidian.set_cursor expects two number arguments (line, col)',
                ),
            );
        }
        const line = lua.lua_tonumber(state, 1);
        const col = lua.lua_tonumber(state, 2);
        callbacks.setCursorPosition?.(line, col);
        return 0;
    });
    lua.lua_setfield(L, obsidianIndex, to_luastring('set_cursor'));

    lua.lua_newtable(L);
    const obsOilIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readLuaString(state, 1) ?? '';
        callbacks.oilOpen?.(path);
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('open'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilClose?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('close'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilParent?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('parent'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilRoot?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('root'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilRefresh?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('refresh'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilToggleHidden?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('toggle_hidden'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilCycleSort?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('cycle_sort'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilYankPath?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('yank_path'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilReveal?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('reveal'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        callbacks.oilOpenEntry?.();
        return 0;
    });
    lua.lua_setfield(L, obsOilIndex, to_luastring('open_entry'));

    lua.lua_setfield(L, obsidianIndex, to_luastring('oil'));

    lua.lua_pushvalue(L, obsidianIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('obsidian'));
    lua.lua_pop(L, 1);

    lua.lua_getfield(L, vimTableIndex, to_luastring('obsidian'));
    lua.lua_setfield(L, vimTableIndex, to_luastring('ob'));
}
