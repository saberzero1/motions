import { describe, expect, it, vi, beforeEach } from 'vitest';

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
    Setting: class {
        addButton() {
            return this;
        }
    },
    SuggestModal: class {},
    TFile: class {},
    TextComponent: class {},
    setIcon: () => {},
}));

import { DEFAULT_SETTINGS } from '../../src/settings';
import {
    KNOWN_SET_OPTIONS,
    clearSetOptionWarnings,
} from '../../src/vimrc/loader';

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

describe('clearSetOptionWarnings', () => {
    beforeEach(() => {
        clearSetOptionWarnings();
    });

    it('is a function export from the loader', () => {
        expect(typeof clearSetOptionWarnings).toBe('function');
    });

    it('does not throw when called multiple times', () => {
        expect(() => {
            clearSetOptionWarnings();
            clearSetOptionWarnings();
        }).not.toThrow();
    });
});
