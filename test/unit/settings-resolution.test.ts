import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings';
import {
    migrateConfigModeSettings,
    migrateSigncolumnSettings,
} from '../../src/settings-migration';

describe('DEFAULT_SETTINGS', () => {
    it('has no undefined values (except optional data fields)', () => {
        const optionalFields = new Set(['frecencyData']);
        for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
            if (optionalFields.has(key)) continue;
            expect(
                val,
                `DEFAULT_SETTINGS.${key} is undefined`,
            ).not.toBeUndefined();
        }
    });
});

describe('settings merge', () => {
    it('Object.assign with null data equals DEFAULT_SETTINGS', () => {
        const result = Object.assign({}, DEFAULT_SETTINGS, null ?? {});
        expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it('Object.assign with empty object equals DEFAULT_SETTINGS', () => {
        const result = Object.assign({}, DEFAULT_SETTINGS, {});
        expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it('partial override preserves unset defaults', () => {
        const result = Object.assign({}, DEFAULT_SETTINGS, { picker: false });
        expect(result.picker).toBe(false);
        expect(result.configMode).toBe(DEFAULT_SETTINGS.configMode);
        expect(result.flash).toBe(DEFAULT_SETTINGS.flash);
    });
});

describe('migrateConfigModeSettings()', () => {
    it('enableVimrc=true, enableLuaConfig=true → lua-vimrc', () => {
        const data = { enableVimrc: true, enableLuaConfig: true };
        const result = migrateConfigModeSettings(data);
        expect(result?.configMode).toBe('lua-vimrc');
    });

    it('enableVimrc=true, enableLuaConfig=false → vimrc', () => {
        const data = { enableVimrc: true, enableLuaConfig: false };
        const result = migrateConfigModeSettings(data);
        expect(result?.configMode).toBe('vimrc');
    });

    it('enableVimrc=false, enableLuaConfig=true → lua', () => {
        const data = { enableVimrc: false, enableLuaConfig: true };
        const result = migrateConfigModeSettings(data);
        expect(result?.configMode).toBe('lua');
    });

    it('enableVimrc=false, enableLuaConfig=false → settings', () => {
        const data = { enableVimrc: false, enableLuaConfig: false };
        const result = migrateConfigModeSettings(data);
        expect(result?.configMode).toBe('settings');
    });

    it('is idempotent (run twice, same result)', () => {
        const data = { enableVimrc: true, enableLuaConfig: true };
        const first = migrateConfigModeSettings(data);
        const second = migrateConfigModeSettings({ ...first });
        expect(second?.configMode).toBe('lua-vimrc');
    });

    it('no-ops when configMode already set', () => {
        const data = { configMode: 'lua' as const };
        const result = migrateConfigModeSettings(data);
        expect(result?.configMode).toBe('lua');
    });

    it('returns null for null input', () => {
        expect(migrateConfigModeSettings(null)).toBeNull();
    });
});

describe('migrateSigncolumnSettings()', () => {
    it('enableMarkGutter=false → signcolumn "no"', () => {
        const data = { enableMarkGutter: false } as Record<string, unknown>;
        const result = migrateSigncolumnSettings(data);
        expect((result as Record<string, unknown>).signcolumn).toBe('no');
    });

    it('enableMarkGutter=true → signcolumn "auto"', () => {
        const data = { enableMarkGutter: true } as Record<string, unknown>;
        const result = migrateSigncolumnSettings(data);
        expect((result as Record<string, unknown>).signcolumn).toBe('auto');
    });

    it('is idempotent', () => {
        const data = { enableMarkGutter: true } as Record<string, unknown>;
        const first = migrateSigncolumnSettings(data);
        const second = migrateSigncolumnSettings({ ...first });
        expect((second as Record<string, unknown>).signcolumn).toBe('auto');
    });

    it('no-ops when enableMarkGutter absent', () => {
        const data = { configMode: 'lua' };
        const result = migrateSigncolumnSettings(data);
        expect((result as Record<string, unknown>).signcolumn).toBeUndefined();
    });

    it('returns null for null input', () => {
        expect(migrateSigncolumnSettings(null)).toBeNull();
    });
});
