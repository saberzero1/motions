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
import { KNOWN_SET_OPTIONS } from '../../src/vimrc/loader';

/**
 * Settings keys that are intentionally excluded from KNOWN_SET_OPTIONS.
 *
 * Each exclusion must have a documented reason — add a comment when extending.
 */
const EXCLUDED_SETTINGS_KEYS = new Set([
    // Persisted data — not user-facing settings
    'frecencyData',
    'persistedUndoTrees',
    'persistedImState',

    // Meta — controls the config system itself (circular to set from config)
    'configMode',
    'vimrcPath',
    'luaConfigPath',
    'globalConfigSearch',
    'showConfigNotifications',

    // Persisted binding/label arrays — configured via ex commands, not :set
    'leaderBindings',
    'whichKeyGroupLabels',
    'whichKeyCommandLabels',

    // Internal UI state
    'conflictNoticeDismissedVersion',

    // Platform/runtime toggles — not vim options
    'enableOnMobile',
    'vimEnabled',

    // Nested objects — configured via dedicated commands or sub-options
    'modePrompts', // via `let g:mode_prompt_*`
    'cursorShapes', // via `set guicursor`
    'pickerKeymap', // complex array-valued keys, not suited for :set
]);

/**
 * Side-effect options map their settingsKey inside apply(), not via a static
 * field. Track the settings keys they cover so the coverage test accounts
 * for them.
 */
const SIDE_EFFECT_SETTINGS_KEYS = new Set([
    'clipboard',
    'textwidth',
    'animatedCursor',
    'smoothCursor',
    'cursorSmoothness',
    'smearTrail',
    'smearStiffness',
    'smearTrailingStiffness',
    'smearDamping',
    'smearMaxLength',
]);

function getSettingsKeysFromKnownOptions(): Set<string> {
    const keys = new Set<string>();
    for (const opt of Object.values(KNOWN_SET_OPTIONS)) {
        if ('settingsKey' in opt) {
            keys.add(opt.settingsKey);
        }
    }
    return keys;
}

describe('KNOWN_SET_OPTIONS coverage', () => {
    it('every non-excluded settings key has a KNOWN_SET_OPTIONS entry', () => {
        const coveredKeys = getSettingsKeysFromKnownOptions();
        const allKeys = Object.keys(DEFAULT_SETTINGS);
        const missing: string[] = [];

        for (const key of allKeys) {
            if (EXCLUDED_SETTINGS_KEYS.has(key)) continue;
            if (SIDE_EFFECT_SETTINGS_KEYS.has(key)) continue;
            if (!coveredKeys.has(key)) {
                missing.push(key);
            }
        }

        expect(
            missing,
            `Settings keys missing from KNOWN_SET_OPTIONS (add to KNOWN_SET_OPTIONS or EXCLUDED_SETTINGS_KEYS with a reason): ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('excluded keys list has no stale entries', () => {
        const allKeys = new Set(Object.keys(DEFAULT_SETTINGS));
        const stale: string[] = [];

        for (const key of EXCLUDED_SETTINGS_KEYS) {
            if (!allKeys.has(key)) {
                stale.push(key);
            }
        }

        expect(
            stale,
            `EXCLUDED_SETTINGS_KEYS contains keys not in DEFAULT_SETTINGS (remove stale entries): ${stale.join(', ')}`,
        ).toEqual([]);
    });

    it('no KNOWN_SET_OPTIONS settingsKey points to a non-existent setting', () => {
        const allKeys = new Set(Object.keys(DEFAULT_SETTINGS));
        // Side-effect options may use keys handled specially in applySettingOverride
        // (e.g., updatetime, jumplist, jumplistsize) — not part of VimMotionsSettings.
        const sideEffectOnlyKeys = new Set([
            'updatetime',
            'jumplist',
            'jumplistsize',
        ]);
        const invalid: string[] = [];

        for (const [optName, opt] of Object.entries(KNOWN_SET_OPTIONS)) {
            if (!('settingsKey' in opt)) continue;
            if (sideEffectOnlyKeys.has(opt.settingsKey)) continue;
            if (!allKeys.has(opt.settingsKey)) {
                invalid.push(`${optName} → ${opt.settingsKey}`);
            }
        }

        expect(
            invalid,
            `KNOWN_SET_OPTIONS entries point to non-existent settings: ${invalid.join(', ')}`,
        ).toEqual([]);
    });
});

describe('new option entries', () => {
    const newOptions: {
        name: string;
        alias?: string;
        type: string;
        settingsKey: string;
        validValues?: string[];
    }[] = [
        {
            name: 'subword',
            type: 'boolean',
            settingsKey: 'enableSubwordMotions',
        },
        { name: 'picker', type: 'boolean', settingsKey: 'picker' },
        {
            name: 'pickerleadermappings',
            type: 'boolean',
            settingsKey: 'pickerLeaderMappings',
        },
        {
            name: 'pickermatcher',
            type: 'string',
            settingsKey: 'pickerMatcherEngine',
            validValues: ['ufuzzy', 'obsidian'],
        },
        {
            name: 'pickeromnisearch',
            type: 'boolean',
            settingsKey: 'pickerOmnisearch',
        },
        { name: 'pickertasks', type: 'boolean', settingsKey: 'pickerTasks' },
        {
            name: 'pickerdataview',
            type: 'boolean',
            settingsKey: 'pickerDataview',
        },
        { name: 'ripgrep', type: 'boolean', settingsKey: 'ripgrepEnabled' },
        {
            name: 'ripgreppath',
            type: 'string',
            settingsKey: 'ripgrepBinaryPath',
        },
        { name: 'ripgrepargs', type: 'string', settingsKey: 'ripgrepArgs' },
        {
            name: 'grepmode',
            type: 'string',
            settingsKey: 'grepMode',
            validValues: ['ripgrep', 'grep'],
        },
        { name: 'oil', type: 'boolean', settingsKey: 'oilExplorer' },
        {
            name: 'oilhiddenfiles',
            type: 'boolean',
            settingsKey: 'oilShowHiddenFiles',
        },
        {
            name: 'oilconfirmdeletethreshold',
            type: 'number',
            settingsKey: 'oilConfirmDeleteThreshold',
        },
        {
            name: 'oilsort',
            type: 'string',
            settingsKey: 'oilDefaultSort',
            validValues: ['name', 'mtime', 'size'],
        },
        { name: 'hinthotkey', type: 'string', settingsKey: 'hintModeHotkey' },
        {
            name: 'undotreeposition',
            type: 'string',
            settingsKey: 'undoTreePosition',
            validValues: ['left', 'right'],
        },
        {
            name: 'undotreeautoopen',
            type: 'boolean',
            settingsKey: 'undoTreeAutoOpen',
        },
        { name: 'imswitching', type: 'boolean', settingsKey: 'imEnabled' },
        {
            name: 'impreset',
            type: 'string',
            settingsKey: 'imPreset',
            validValues: [
                'custom',
                'macism',
                'im-select',
                'fcitx5-remote',
                'ibus',
            ],
        },
        { name: 'imbinarypath', type: 'string', settingsKey: 'imBinaryPath' },
        { name: 'imobtainargs', type: 'string', settingsKey: 'imObtainArgs' },
        { name: 'imswitchargs', type: 'string', settingsKey: 'imSwitchArgs' },
        {
            name: 'imdefaultnormal',
            type: 'string',
            settingsKey: 'imDefaultNormalIm',
        },
        {
            name: 'imrestorebehavior',
            type: 'string',
            settingsKey: 'imRestoreBehavior',
            validValues: ['restore', 'default'],
        },
        {
            name: 'imdefaultinsert',
            type: 'string',
            settingsKey: 'imDefaultInsertIm',
        },
        { name: 'pcre', type: 'boolean', settingsKey: 'pcre' },
    ];

    for (const opt of newOptions) {
        it(`${opt.name} is registered with correct type and settingsKey`, () => {
            expect(KNOWN_SET_OPTIONS).toHaveProperty(opt.name);
            const entry = KNOWN_SET_OPTIONS[opt.name];
            expect(entry).toMatchObject({
                type: opt.type,
                settingsKey: opt.settingsKey,
            });
            if (opt.validValues) {
                expect(
                    (entry as { validValues?: string[] }).validValues,
                ).toEqual(opt.validValues);
            }
        });
    }

    it('every new option settingsKey has a default value', () => {
        for (const opt of newOptions) {
            expect(
                DEFAULT_SETTINGS,
                `DEFAULT_SETTINGS missing key: ${opt.settingsKey}`,
            ).toHaveProperty(opt.settingsKey);
        }
    });
});
