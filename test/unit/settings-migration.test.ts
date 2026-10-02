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
import {
    migrateConfigModeSettings,
    migrateCursorlineoptSettings,
    migrateTableWidgetMode,
} from '../../src/settings-migration';

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

describe('migrateCursorlineoptSettings', () => {
    it('leaves a fresh install alone so it gets the new default', () => {
        expect(migrateCursorlineoptSettings(null)).toBeNull();
        expect(DEFAULT_SETTINGS.cursorlineopt).toBe('both');
    });

    it('pins an existing install without the key to the old default', () => {
        const data: Record<string, unknown> = { cursorline: true };
        migrateCursorlineoptSettings(data as Partial<VimMotionsSettings>);
        expect(data.cursorlineopt).toBe('number');
    });

    it('never overwrites a value the user already has', () => {
        for (const stored of ['number', 'line', 'both', 'screenline']) {
            const data: Record<string, unknown> = { cursorlineopt: stored };
            migrateCursorlineoptSettings(data as Partial<VimMotionsSettings>);
            expect(data.cursorlineopt).toBe(stored);
        }
    });

    it('resolves an existing install to the value it rendered before', () => {
        const data: Record<string, unknown> = { cursorline: true };
        const merged = Object.assign(
            {},
            DEFAULT_SETTINGS,
            migrateCursorlineoptSettings(data as Partial<VimMotionsSettings>),
        );
        expect(merged.cursorlineopt).toBe('number');
    });
});

describe('tableWidgetMode migration', () => {
    it('retargets suppressTableWidget=true to native, not raw', () => {
        // The legacy flag meant "hide the widget", and `raw` is what used to
        // implement that — but `raw` renders the table as nothing, so native
        // is the honest destination.
        expect(migrateTableWidgetMode({ suppressTableWidget: true })).toBe(
            'native',
        );
    });

    it('retargets suppressTableWidget=false to native', () => {
        expect(migrateTableWidgetMode({ suppressTableWidget: false })).toBe(
            'native',
        );
    });

    it('retargets tablewidget=always to native, not raw', () => {
        expect(migrateTableWidgetMode({ tableWidgetMode: 'always' })).toBe(
            'native',
        );
    });

    it.each(['off', 'cursor', 'embedded'])(
        'retargets the legacy value %s to native',
        (legacy) => {
            expect(migrateTableWidgetMode({ tableWidgetMode: legacy })).toBe(
                'native',
            );
        },
    );

    it('leaves an explicit raw alone, because this release only deprecates it', () => {
        // The load-bearing case. Migrating a user off a documented option they
        // chose is precisely what a deprecation exists to avoid.
        expect(migrateTableWidgetMode({ tableWidgetMode: 'raw' })).toBeNull();
    });

    it('leaves current values alone', () => {
        expect(
            migrateTableWidgetMode({ tableWidgetMode: 'native' }),
        ).toBeNull();
        expect(migrateTableWidgetMode({ tableWidgetMode: 'owned' })).toBeNull();
    });

    it('returns null for absent, null and non-string data', () => {
        expect(migrateTableWidgetMode(null)).toBeNull();
        expect(migrateTableWidgetMode({})).toBeNull();
        expect(migrateTableWidgetMode({ tableWidgetMode: 42 })).toBeNull();
    });
});
