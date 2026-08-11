import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    AbstractInputSuggest: class {},
    App: class {},
    View: class {},
    MarkdownView: class {},
    Modal: class {
        open() {}
    },
    Notice: class {},
    Platform: { isDesktop: true },
    PluginSettingTab: class {},
    Setting: class {},
    SuggestModal: class {},
    TFile: class {},
    TextComponent: class {},
    setIcon: () => {},
}));

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
