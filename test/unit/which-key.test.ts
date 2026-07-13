import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import {
    normalizeVimKey,
    lookupObsidianCommandName,
    describeKeymapEntry,
} from '../../src/ui/which-key';

describe('normalizeVimKey', () => {
    it('converts literal space to <Space>', () => {
        expect(normalizeVimKey(' ')).toBe('<Space>');
    });

    it('converts space in key sequence', () => {
        expect(normalizeVimKey(' ff')).toBe('<Space>ff');
    });

    it('converts multiple spaces', () => {
        expect(normalizeVimKey(' f ')).toBe('<Space>f<Space>');
    });

    it('preserves existing <Space> notation', () => {
        expect(normalizeVimKey('<Space>ff')).toBe('<Space>ff');
    });

    it('preserves other angle-bracket sequences', () => {
        expect(normalizeVimKey('<C-w>v')).toBe('<C-w>v');
        expect(normalizeVimKey('<CR>')).toBe('<CR>');
        expect(normalizeVimKey('<leader>f')).toBe('<leader>f');
    });

    it('handles mixed notation and literal spaces', () => {
        expect(normalizeVimKey('<C-w> ')).toBe('<C-w><Space>');
    });

    it('returns single-char keys unchanged', () => {
        expect(normalizeVimKey('f')).toBe('f');
        expect(normalizeVimKey('\\')).toBe('\\');
        expect(normalizeVimKey(',')).toBe(',');
    });

    it('returns empty string unchanged', () => {
        expect(normalizeVimKey('')).toBe('');
    });

    it('does not double-encode <Space>', () => {
        const once = normalizeVimKey(' ');
        const twice = normalizeVimKey(once);
        expect(twice).toBe('<Space>');
    });
});

function mockApp(commands: Record<string, { id: string; name: string }>): App {
    return { commands: { commands } } as unknown as App;
}

describe('lookupObsidianCommandName', () => {
    const app = mockApp({
        'app:reload': { id: 'app:reload', name: 'Reload app without saving' },
        'switcher:open': {
            id: 'switcher:open',
            name: 'Quick switcher: Open quick switcher',
        },
    });

    it('returns name for known command', () => {
        expect(lookupObsidianCommandName(app, 'app:reload')).toBe(
            'Reload app without saving',
        );
    });

    it('returns name for namespaced command', () => {
        expect(lookupObsidianCommandName(app, 'switcher:open')).toBe(
            'Quick switcher: Open quick switcher',
        );
    });

    it('returns null for unknown command', () => {
        expect(lookupObsidianCommandName(app, 'does-not-exist')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(lookupObsidianCommandName(app, '')).toBeNull();
    });
});

describe('describeKeymapEntry', () => {
    const app = mockApp({
        'app:reload': { id: 'app:reload', name: 'Reload app without saving' },
        'switcher:open': {
            id: 'switcher:open',
            name: 'Quick switcher: Open quick switcher',
        },
        'workspace:close': { id: 'workspace:close', name: 'Close current tab' },
    });

    describe('without app (no resolution)', () => {
        it('returns label when present', () => {
            expect(
                describeKeymapEntry({
                    type: 'keyToKey',
                    label: 'My label',
                    toKeys: ':obcommand app:reload<CR>',
                }),
            ).toBe('My label');
        });

        it('returns raw toKeys when no label', () => {
            expect(
                describeKeymapEntry({
                    type: 'keyToKey',
                    toKeys: ':obcommand app:reload<CR>',
                }),
            ).toBe(':obcommand app:reload<CR>');
        });

        it('returns operator', () => {
            expect(
                describeKeymapEntry({ type: 'operator', operator: 'd' }),
            ).toBe('d');
        });

        it('returns motion', () => {
            expect(describeKeymapEntry({ type: 'motion', motion: 'w' })).toBe(
                'w',
            );
        });

        it('returns action', () => {
            expect(
                describeKeymapEntry({
                    type: 'action',
                    action: 'enterInsertMode',
                }),
            ).toBe('enterInsertMode');
        });

        it('falls back to type', () => {
            expect(describeKeymapEntry({ type: 'idle' })).toBe('idle');
        });
    });

    describe('with app (obcommand auto-resolution)', () => {
        it('resolves :obcommand <id><CR>', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':obcommand app:reload<CR>' },
                    app,
                ),
            ).toBe('Reload app without saving');
        });

        it('resolves :ob <id><CR> (short form)', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':ob switcher:open<CR>' },
                    app,
                ),
            ).toBe('Quick switcher: Open quick switcher');
        });

        it('resolves without trailing <CR>', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':obcommand workspace:close' },
                    app,
                ),
            ).toBe('Close current tab');
        });

        it('resolves with lowercase <cr>', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':ob app:reload<cr>' },
                    app,
                ),
            ).toBe('Reload app without saving');
        });

        it('resolves with mixed case <Cr>', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':ob app:reload<Cr>' },
                    app,
                ),
            ).toBe('Reload app without saving');
        });

        it('falls back to raw toKeys for unknown command', () => {
            expect(
                describeKeymapEntry(
                    {
                        type: 'keyToKey',
                        toKeys: ':obcommand no-such-plugin:nope<CR>',
                    },
                    app,
                ),
            ).toBe(':obcommand no-such-plugin:nope<CR>');
        });

        it('falls back to raw toKeys for non-obcommand RHS', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':set scrolloff=5<CR>' },
                    app,
                ),
            ).toBe(':set scrolloff=5<CR>');
        });

        it('label takes priority over auto-resolved name', () => {
            expect(
                describeKeymapEntry(
                    {
                        type: 'keyToKey',
                        label: 'Custom label',
                        toKeys: ':obcommand app:reload<CR>',
                    },
                    app,
                ),
            ).toBe('Custom label');
        });

        it('handles extra whitespace in command ID', () => {
            expect(
                describeKeymapEntry(
                    {
                        type: 'keyToKey',
                        toKeys: ':obcommand   app:reload  <CR>',
                    },
                    app,
                ),
            ).toBe('Reload app without saving');
        });

        it('resolves with <Space> separator (codemirror-vim normalized form)', () => {
            expect(
                describeKeymapEntry(
                    { type: 'keyToKey', toKeys: ':ob<Space>app:reload<CR>' },
                    app,
                ),
            ).toBe('Reload app without saving');
        });

        it('resolves :obcommand with <Space> separator', () => {
            expect(
                describeKeymapEntry(
                    {
                        type: 'keyToKey',
                        toKeys: ':obcommand<Space>workspace:close<CR>',
                    },
                    app,
                ),
            ).toBe('Close current tab');
        });

        it('does not match bare :ob without a command ID', () => {
            expect(
                describeKeymapEntry({ type: 'keyToKey', toKeys: ':ob' }, app),
            ).toBe(':ob');
        });
    });
});
