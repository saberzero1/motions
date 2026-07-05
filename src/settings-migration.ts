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
