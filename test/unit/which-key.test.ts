import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import {
    normalizeVimKey,
    lookupObsidianCommandName,
    describeKeymapEntry,
    LeaderRegistry,
    isSpecialKey,
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

describe('LeaderRegistry', () => {
    function makeRegistry(leaderKey: string): LeaderRegistry {
        const reg = new LeaderRegistry();
        reg.setLeaderKey(leaderKey);
        return reg;
    }

    describe('addBinding normalization', () => {
        it('normalizes literal space leader when storing bindings', () => {
            const reg = makeRegistry(' ');
            reg.addBinding('  f', 'Find char', 'builtin');
            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('<Space>f');
        });

        it('normalizes already-normalized leader when storing bindings', () => {
            const reg = makeRegistry('<Space>');
            reg.addBinding('<Space><Space>f', 'Find char', 'builtin');
            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('<Space>f');
        });

        it('stores consistent keys regardless of leader format', () => {
            const regRaw = makeRegistry(' ');
            regRaw.addBinding('  f', 'Find char', 'builtin');

            const regNorm = makeRegistry('<Space>');
            regNorm.addBinding('<Space><Space>f', 'Find char', 'builtin');

            expect(regRaw.getBindings()[0]!.key).toBe(
                regNorm.getBindings()[0]!.key,
            );
        });

        it('rejects bindings that do not start with leader', () => {
            const reg = makeRegistry(' ');
            reg.addBinding('xf', 'something', 'builtin');
            expect(reg.getBindings()).toHaveLength(0);
        });

        it('rejects binding that is just the leader key', () => {
            const reg = makeRegistry(' ');
            reg.addBinding(' ', 'bare leader', 'builtin');
            expect(reg.getBindings()).toHaveLength(0);
        });

        it('updates existing binding with same normalized key', () => {
            const reg = makeRegistry(' ');
            reg.addBinding(' f', 'First', 'builtin');
            reg.addBinding(' f', 'Updated', 'user');
            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.command).toBe('Updated');
            expect(bindings[0]!.source).toBe('user');
        });

        it('handles backslash leader (default)', () => {
            const reg = new LeaderRegistry();
            reg.addBinding('\\f', 'Find', 'builtin');
            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('f');
        });

        it('handles comma leader', () => {
            const reg = makeRegistry(',');
            reg.addBinding(',w', 'Save', 'user');
            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('w');
        });
    });

    describe('addGroupLabel normalization', () => {
        it('normalizes literal space prefix in group labels', () => {
            const reg = makeRegistry(' ');
            reg.addGroupLabel(' ', 'EasyMotion', true, 'zap', 'yellow');
            const labels = reg.getGroupLabels();
            expect(labels.has('<Space>')).toBe(true);
            expect(labels.get('<Space>')!.label).toBe('EasyMotion');
        });

        it('normalizes already-normalized prefix in group labels', () => {
            const reg = makeRegistry('<Space>');
            reg.addGroupLabel('<Space>', 'EasyMotion', true, 'zap', 'yellow');
            const labels = reg.getGroupLabels();
            expect(labels.has('<Space>')).toBe(true);
        });

        it('stores same label regardless of prefix format', () => {
            const regRaw = makeRegistry(' ');
            regRaw.addGroupLabel(' ', 'EasyMotion', true);

            const regNorm = makeRegistry('<Space>');
            regNorm.addGroupLabel('<Space>', 'EasyMotion', true);

            const rawKeys = [...regRaw.getGroupLabels().keys()];
            const normKeys = [...regNorm.getGroupLabels().keys()];
            expect(rawKeys).toEqual(normKeys);
        });
    });

    describe('clearBuiltinBindings', () => {
        it('removes builtin bindings but keeps user bindings', () => {
            const reg = makeRegistry(' ');
            reg.addBinding(' f', 'Builtin find', 'builtin');
            reg.addBinding(' w', 'User save', 'user');
            reg.addGroupLabel(' ', 'EasyMotion', true);
            reg.addGroupLabel('g', 'Git', false);

            reg.clearBuiltinBindings();

            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('w');

            const labels = reg.getGroupLabels();
            expect(labels.has('<Space>')).toBe(false);
            expect(labels.has('g')).toBe(true);
        });
    });

    describe('double-leader drill-down (issue #94)', () => {
        it('EasyMotion bindings have normalized keys that match <Space> prefix', () => {
            const reg = makeRegistry(' ');

            // Simulate EasyMotion registration: leader + leader + keySuffix
            const leader = reg.getLeaderKey();
            const defs = ['f', 'F', 's', 'w', 'b', 'j', 'k'];
            for (const suffix of defs) {
                reg.addBinding(
                    leader + leader + suffix,
                    `EM ${suffix}`,
                    'builtin',
                );
            }
            reg.addGroupLabel(leader, 'EasyMotion', true, 'zap', 'yellow');

            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(defs.length);

            // All bindings should have keys starting with <Space> (normalized)
            for (const b of bindings) {
                expect(b.key.startsWith('<Space>')).toBe(true);
            }

            // Drill-down: filter by <Space> prefix (simulating second leader press)
            const drillDown = bindings.filter((b) =>
                b.key.startsWith('<Space>'),
            );
            expect(drillDown).toHaveLength(defs.length);

            // Group label should be findable at normalized key
            const labels = reg.getGroupLabels();
            expect(labels.has('<Space>')).toBe(true);
            expect(labels.get('<Space>')!.label).toBe('EasyMotion');
        });

        it('single-leader bindings do not start with <Space> prefix', () => {
            const reg = makeRegistry(' ');
            const leader = reg.getLeaderKey();

            // Single-leader binding: leader + "w"
            reg.addBinding(leader + 'w', 'Save', 'user');

            const bindings = reg.getBindings();
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.key).toBe('w');
            // Should NOT match <Space> drill-down filter
            expect(bindings[0]!.key.startsWith('<Space>')).toBe(false);
        });
    });
});

describe('isSpecialKey', () => {
    it('returns false for <Space>', () => {
        expect(isSpecialKey('<Space>')).toBe(false);
    });

    it('returns true for other angle-bracket keys', () => {
        expect(isSpecialKey('<CR>')).toBe(true);
        expect(isSpecialKey('<Left>')).toBe(true);
        expect(isSpecialKey('<C-n>')).toBe(true);
        expect(isSpecialKey('<Esc>')).toBe(true);
    });

    it('returns false for plain keys', () => {
        expect(isSpecialKey('f')).toBe(false);
        expect(isSpecialKey('\\')).toBe(false);
        expect(isSpecialKey(',')).toBe(false);
    });
});
