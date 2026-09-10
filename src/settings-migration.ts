import type { VimMotionsSettings } from './settings';
import { invariant } from './util/invariant';

export function migrateConfigModeSettings(
    data:
        | (Partial<VimMotionsSettings> & {
              enableVimrc?: boolean;
              enableLuaConfig?: boolean;
          })
        | null,
):
    | (Partial<VimMotionsSettings> & {
          enableVimrc?: boolean;
          enableLuaConfig?: boolean;
      })
    | null {
    if (!data) return data;
    if (
        !('configMode' in data) &&
        ('enableVimrc' in data || 'enableLuaConfig' in data)
    ) {
        const vimrc = data.enableVimrc !== false;
        const lua = data.enableLuaConfig === true;
        if (vimrc && lua) data.configMode = 'lua-vimrc';
        else if (vimrc) data.configMode = 'vimrc';
        else if (lua) data.configMode = 'lua';
        else data.configMode = 'settings';
        invariant(
            ['lua-vimrc', 'lua', 'vimrc', 'settings'].includes(data.configMode),
            `Migration produced invalid configMode: "${data.configMode}"`,
        );
        delete data.enableVimrc;
        delete data.enableLuaConfig;
    }
    return data;
}

/**
 * `cursorlineopt` defaulted to `number` before it gained Neovim's full grammar;
 * the default is now Neovim's `both`. An install that already has settings on
 * disk but no stored `cursorlineopt` predates the change, so it keeps the old
 * value and sees no visual change. A fresh install (`data === null`) falls
 * through to the new default.
 */
export function migrateCursorlineoptSettings(
    data: Partial<VimMotionsSettings> | null,
): Partial<VimMotionsSettings> | null {
    if (!data) return data;
    const raw = data as Record<string, unknown>;
    if (!('cursorlineopt' in raw)) {
        raw.cursorlineopt = 'number';
    }
    return data;
}

export function migrateSigncolumnSettings(
    data: Partial<VimMotionsSettings> | null,
): Partial<VimMotionsSettings> | null {
    if (!data) return data;
    const raw = data as Record<string, unknown>;
    if (!('signcolumn' in raw) && 'enableMarkGutter' in raw) {
        raw.signcolumn = raw.enableMarkGutter === false ? 'no' : 'auto';
        delete raw.enableMarkGutter;
    }
    return data;
}
