import { describe, expect, it } from 'vitest';
import type { VimMotionsSettings } from '../../src/settings';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { migrateConfigModeSettings } from '../../src/settings-migration';

const applyMigration = (
    data:
        | (Partial<VimMotionsSettings> & {
              enableVimrc?: boolean;
              enableLuaConfig?: boolean;
          })
        | null,
): VimMotionsSettings => {
    const migrated = migrateConfigModeSettings(data);
    return { ...DEFAULT_SETTINGS, ...(migrated ?? {}) };
};

describe('configMode migration', () => {
    it('migrates enableVimrc + enableLuaConfig to lua-vimrc', () => {
        const settings = applyMigration({
            enableVimrc: true,
            enableLuaConfig: true,
        });
        expect(settings.configMode).toBe('lua-vimrc');
    });

    it('migrates enableVimrc true + enableLuaConfig false to vimrc', () => {
        const settings = applyMigration({
            enableVimrc: true,
            enableLuaConfig: false,
        });
        expect(settings.configMode).toBe('vimrc');
    });

    it('migrates enableVimrc false + enableLuaConfig true to lua', () => {
        const settings = applyMigration({
            enableVimrc: false,
            enableLuaConfig: true,
        });
        expect(settings.configMode).toBe('lua');
    });

    it('migrates enableVimrc false + enableLuaConfig false to settings', () => {
        const settings = applyMigration({
            enableVimrc: false,
            enableLuaConfig: false,
        });
        expect(settings.configMode).toBe('settings');
    });

    it('keeps configMode when already set', () => {
        const settings = applyMigration({ configMode: 'lua' });
        expect(settings.configMode).toBe('lua');
    });

    it('defaults to lua-vimrc when no legacy keys exist', () => {
        const settings = applyMigration({});
        expect(settings.configMode).toBe('lua-vimrc');
    });
});
