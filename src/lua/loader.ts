import type { App } from 'obsidian';
import type { VimApi } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { createSandboxedState, evalLua } from './engine';
import { injectVimApi, LuaKeymap, LuaKeymapDelete } from './api';
import type { lua_State } from 'fengari';

export interface LuaLoadResult {
    found: boolean;
    ready: boolean;
    error?: string;
    path: string;
    maps: LuaKeymap[];
    unmaps: LuaKeymapDelete[];
    commandLabels: Array<{ key: string; label: string }>;
    pendingExCommands: string[];
    mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    >;
    commandCount: number;
    state: lua_State | null;
}

function getLuaConfigPath(app: App, customPath?: string): string {
    if (customPath) return customPath;
    return `${app.vault.configDir}.init.lua`;
}

async function readLuaFile(app: App, path: string): Promise<string | null> {
    try {
        return await app.vault.adapter.read(path);
    } catch {
        return null;
    }
}

export async function loadInitLua(
    app: App,
    vim: VimApi,
    leaderRegistry?: LeaderRegistry,
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void,
    customPath?: string,
): Promise<LuaLoadResult> {
    const path = getLuaConfigPath(app, customPath);

    const content = await readLuaFile(app, path);
    if (content === null) {
        return {
            found: false,
            ready: true,
            path,
            maps: [],
            unmaps: [],
            commandLabels: [],
            pendingExCommands: [],
            mapOperations: [],
            commandCount: 0,
            state: null,
        };
    }

    let commandCount = 0;
    const maps: LuaKeymap[] = [];
    const unmaps: LuaKeymapDelete[] = [];
    const commandLabels: Array<{ key: string; label: string }> = [];
    const pendingExCommands: string[] = [];
    const mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    > = [];

    const L = createSandboxedState();
    injectVimApi(L, {
        onSettingOverride: (key, value, directive) => {
            commandCount++;
            onSettingOverride?.(key, value, directive);
        },
        handleExCommand: (command: string) => {
            commandCount++;
            pendingExCommands.push(command);
        },
        getVaultName: () => app.vault.getName(),
        onKeymap: (map) => {
            commandCount++;
            maps.push(map);
            mapOperations.push({ type: 'map', map });
            if (map.desc) {
                commandLabels.push({ key: map.lhs, label: map.desc });
            }
        },
        onKeymapDel: (map) => {
            commandCount++;
            unmaps.push(map);
            mapOperations.push({ type: 'unmap', map });
        },
        getLeaderKey: () => leaderRegistry?.getLeaderKey() ?? '\\',
        setLeaderKey: (key) => leaderRegistry?.setLeaderKey(key),
        getOption: (name) => {
            try {
                return vim.getOption(name);
            } catch {
                return undefined;
            }
        },
    });

    const result = evalLua(L, content);
    if (!result.ok) {
        return {
            found: true,
            ready: true,
            error: result.error,
            path,
            maps: [],
            unmaps: [],
            commandLabels: [],
            pendingExCommands: [],
            mapOperations: [],
            commandCount: 0,
            state: L,
        };
    }

    return {
        found: true,
        ready: true,
        path,
        maps,
        unmaps,
        commandLabels,
        pendingExCommands,
        mapOperations,
        commandCount,
        state: L,
    };
}
