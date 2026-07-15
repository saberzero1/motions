import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { KNOWN_SET_OPTIONS } from '../../src/vimrc/loader';

describe('textarea vim settings', () => {
    it('enableVimTextareas defaults to false', () => {
        expect(DEFAULT_SETTINGS.enableVimTextareas).toBe(false);
    });

    it('vimtextareas is in KNOWN_SET_OPTIONS', () => {
        expect(KNOWN_SET_OPTIONS).toHaveProperty('vimtextareas');
        expect(KNOWN_SET_OPTIONS.vimtextareas).toMatchObject({
            type: 'boolean',
            settingsKey: 'enableVimTextareas',
        });
    });

    it('vta alias is in KNOWN_SET_OPTIONS', () => {
        expect(KNOWN_SET_OPTIONS).toHaveProperty('vta');
        expect(KNOWN_SET_OPTIONS.vta).toMatchObject({
            type: 'boolean',
            settingsKey: 'enableVimTextareas',
        });
    });
});
