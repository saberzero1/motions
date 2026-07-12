import type { VimMotionsSettings } from './settings';

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
        delete data.enableVimrc;
        delete data.enableLuaConfig;
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
