import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    sendVimEscape,
    focusEditor,
    setWhichKeyMode,
    hasWhichKeyOverlay,
    getWhichKeyTitle,
    getWhichKeyEntryCount,
    getWhichKeyKeys,
} from '../helpers';

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
    vimrcLoaded?: boolean;
    leaderRegistry?: {
        getBindings: () => Array<{
            key: string;
            command: string;
            source: string;
        }>;
        getLeaderKey: () => string;
    };
    whichKeyOverlay?: unknown;
};

type VimRef = {
    handleKey: (cm: unknown, key: string) => boolean;
    getCompletions: (
        prefix: string,
        context?: string,
    ) => Array<{ keys: string; suffix: string; type: string }>;
    getKeymap: (context?: string) => Array<{ keys: string; type: string }>;
};

async function sendRealKey(key: string): Promise<void> {
    await browser.keys([key]);
    await browser.pause(30);
}

describe('Which-key overlay', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(200);
    });

    describe('Mode: off', function () {
        before(async function () {
            await setWhichKeyMode('off');
        });

        after(async function () {
            await setWhichKeyMode('off');
        });

        it('should not show overlay when pressing d', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('should not show overlay when pressing leader key', async function () {
            await focusEditor();
            await sendRealKey('\\');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('should not show overlay when pressing g', async function () {
            await focusEditor();
            await sendRealKey('g');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });
    });

    describe('Mode: leader', function () {
        before(async function () {
            await setWhichKeyMode('leader');
        });

        after(async function () {
            await setWhichKeyMode('off');
        });

        it('should show overlay when leader key is pressed', async function () {
            await focusEditor();
            await browser.keys(['\\']);
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendVimEscape();
        });

        it('should not show overlay when pressing d', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('should not show overlay when pressing g', async function () {
            await focusEditor();
            await sendRealKey('g');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('should dismiss overlay on next key after leader', async function () {
            await focusEditor();
            await browser.keys(['\\']);
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendRealKey('j');
            await browser.pause(100);
            expect(await hasWhichKeyOverlay()).toBe(false);
        });
    });

    describe('Mode: all', function () {
        before(async function () {
            await setWhichKeyMode('all');
        });

        after(async function () {
            await setWhichKeyMode('off');
        });

        it('should show overlay when d is pressed (operator-pending)', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('d');
        });

        it('should show overlay when g is pressed (partial key)', async function () {
            await focusEditor();
            await sendRealKey('g');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('g');
        });

        it('should show overlay when c is pressed (operator-pending)', async function () {
            await focusEditor();
            await sendRealKey('c');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('c');
        });

        it('should show overlay when y is pressed (operator-pending)', async function () {
            await focusEditor();
            await sendRealKey('y');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('y');
        });

        it('should show overlay when z is pressed (partial key)', async function () {
            await focusEditor();
            await sendRealKey('z');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('z');
        });

        it('should show overlay when [ is pressed (partial key)', async function () {
            await focusEditor();
            await sendRealKey('[');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('[');
        });

        it('should show overlay when ] is pressed (partial key)', async function () {
            await focusEditor();
            await sendRealKey(']');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain(']');
        });

        it('should not show overlay for single-key commands like j', async function () {
            await focusEditor();
            await sendRealKey('j');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
        });

        it('should not show overlay in insert mode', async function () {
            await focusEditor();
            await sendRealKey('i');
            await browser.pause(100);
            await browser.keys(['d']);
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('should dismiss overlay when command completes', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendRealKey('w');
            await browser.pause(100);
            expect(await hasWhichKeyOverlay()).toBe(false);
        });

        it('should dismiss overlay on Escape', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendVimEscape();
            await browser.pause(100);
            expect(await hasWhichKeyOverlay()).toBe(false);
        });

        it('should show text-object entries after di (operator + partial)', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(50);
            await sendRealKey('i');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const title = await getWhichKeyTitle();
            expect(title).toContain('di');

            const keys = await getWhichKeyKeys();
            expect(keys.length).toBeGreaterThan(0);
        });

        it('should show completions for g prefix', async function () {
            await focusEditor();
            await sendRealKey('g');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const keys = await getWhichKeyKeys();
            expect(keys.length).toBeGreaterThan(0);
        });

        it('should filter operator-pending to motions only', async function () {
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const count = await getWhichKeyEntryCount();
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(100);
        });
    });

    describe('Settings hot-reload', function () {
        it('switching from off to all should enable overlay', async function () {
            await setWhichKeyMode('off');
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
            await browser.pause(100);

            await setWhichKeyMode('all');
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendVimEscape();
        });

        it('switching from all to off should disable overlay', async function () {
            await setWhichKeyMode('all');
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendVimEscape();
            await browser.pause(100);

            await setWhichKeyMode('off');
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
        });

        it('switching from all to leader should only show on leader', async function () {
            await setWhichKeyMode('leader');
            await focusEditor();
            await sendRealKey('d');
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(false);
            await sendVimEscape();
            await browser.pause(100);

            await browser.keys(['\\']);
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);
            await sendVimEscape();

            await setWhichKeyMode('off');
        });
    });

    describe('Leader registry integration', function () {
        after(async function () {
            await setWhichKeyMode('off');
        });

        it('should include builtin bindings from features', async function () {
            const bindings = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, PluginRef>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin?.leaderRegistry) return [];
                return plugin.leaderRegistry.getBindings();
            })) as Array<{
                key: string;
                command: string;
                source: string;
            }>;

            const builtins = bindings.filter((b) => b.source === 'builtin');
            expect(builtins.length).toBeGreaterThan(0);
        });

        it('should show builtin leader bindings in leader overlay', async function () {
            await setWhichKeyMode('leader');
            await focusEditor();

            await browser.keys(['\\']);
            await browser.pause(600);
            expect(await hasWhichKeyOverlay()).toBe(true);

            const count = await getWhichKeyEntryCount();
            expect(count).toBeGreaterThan(0);

            await sendVimEscape();
        });

        it('leader registry should have leader key set', async function () {
            const leaderKey = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, PluginRef>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.leaderRegistry?.getLeaderKey() ?? '';
            })) as string;

            expect(leaderKey.length).toBeGreaterThan(0);
        });
    });

    describe('Fork API integration', function () {
        before(async function () {
            await setWhichKeyMode('all');
        });

        after(async function () {
            await setWhichKeyMode('off');
        });

        it('getCompletions should return entries for g prefix', async function () {
            const result = (await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimRef };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const completions = Vim.getCompletions('g', 'normal');
                return {
                    count: completions.length,
                    hasGg: completions.some((c) => c.keys === 'gg'),
                    hasGj: completions.some((c) => c.keys === 'gj'),
                };
            })) as {
                count: number;
                hasGg: boolean;
                hasGj: boolean;
                error?: string;
            };
            expect(result.error).toBeUndefined();
            expect(result.count).toBeGreaterThan(0);
            expect(result.hasGg).toBe(true);
            expect(result.hasGj).toBe(true);
        });

        it('getKeymap should return entries filtered by context', async function () {
            const result = (await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimRef };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const normalMap = Vim.getKeymap('normal');
                const insertMap = Vim.getKeymap('insert');
                return {
                    normalCount: normalMap.length,
                    insertCount: insertMap.length,
                    normalHasD: normalMap.some(
                        (e) => e.keys === 'd' && e.type === 'operator',
                    ),
                };
            })) as {
                normalCount: number;
                insertCount: number;
                normalHasD: boolean;
                error?: string;
            };
            expect(result.error).toBeUndefined();
            expect(result.normalCount).toBeGreaterThan(0);
            expect(result.insertCount).toBeGreaterThan(0);
            expect(result.normalCount).not.toBe(result.insertCount);
            expect(result.normalHasD).toBe(true);
        });

        it('getCompletions should return empty for non-existent prefix', async function () {
            const result = (await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimRef };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const completions = Vim.getCompletions('ZZZNOPREFIX', 'normal');
                return { count: completions.length };
            })) as { count: number; error?: string };
            expect(result.error).toBeUndefined();
            expect(result.count).toBe(0);
        });

        it('user mappings should appear in getKeymap', async function () {
            await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: VimRef & {
                                map: (
                                    lhs: string,
                                    rhs: string,
                                    ctx?: string,
                                ) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.map('gW', ':w', 'normal');
            });

            const result = (await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimRef };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const keymap = Vim.getKeymap('normal');
                return {
                    hasGW: keymap.some((e) => e.keys === 'gW'),
                };
            })) as { hasGW: boolean; error?: string };
            expect(result.error).toBeUndefined();
            expect(result.hasGW).toBe(true);

            await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: VimRef & {
                                unmap: (lhs: string, ctx?: string) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.unmap('gW', 'normal');
            });
        });
    });
});
