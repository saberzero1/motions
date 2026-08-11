import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureSourceMode,
    getCursorPos,
    getEditorValue,
    PAUSE,
    sendVimEscape,
    setupEditor,
    vimKeys,
} from '../../helpers';

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function handleEx(
    command: string,
): Promise<{ success?: true; error?: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success?: true; error?: string };
}

async function waitForSnippets(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        getAll: () => unknown[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const all = plugin?.snippetRegistry?.getAll();
                return Array.isArray(all) && all.length > 0;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

describe('Snippet override and table trailing newline (issue #118)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForSnippets();
    });

    describe('table snippet trailing newline', function () {
        before(async function () {
            await ensureSourceMode();
        });

        beforeEach(async function () {
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await setupEditor('', { line: 0, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('table snippet body produces a trailing empty line via Tab', async function () {
            await typePrefixAndTab('table');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const value = await getEditorValue();
            const lines = value.split('\n');

            expect(lines.length).toBeGreaterThanOrEqual(4);
            expect(lines[0]).toContain('|');
            expect(lines[1]).toContain('| --- | --- |');
            expect(lines[2]).toContain('|');
            expect(lines[lines.length - 1]!.trim()).toBe('');
        });

        it('table3 snippet body produces a trailing empty line via :snippet', async function () {
            const result = await handleEx('snippet Table 3x3');
            expect(result).toHaveProperty('success', true);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const value = await getEditorValue();
            const lines = value.split('\n');

            expect(lines.length).toBeGreaterThanOrEqual(4);
            expect(lines[1]).toContain('| --- | --- | --- |');
            expect(lines[lines.length - 1]!.trim()).toBe('');
        });

        it('table at end of document produces content after the last row', async function () {
            const result = await handleEx('snippet Table 2x2');
            expect(result).toHaveProperty('success', true);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const value = await getEditorValue();
            const lines = value.split('\n');
            const separatorIndex = lines.findIndex((l) =>
                l.includes('| --- |'),
            );

            expect(separatorIndex).toBeGreaterThan(-1);
            expect(lines.length).toBeGreaterThan(separatorIndex + 2);
        });
    });

    describe('user snippet overrides bundled', function () {
        before(async function () {
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        loadFile: (
                                            file: Record<
                                                string,
                                                {
                                                    prefix: string;
                                                    body: string | string[];
                                                    description?: string;
                                                }
                                            >,
                                            source: string,
                                        ) => void;
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin?.snippetRegistry) return;
                plugin.snippetRegistry.loadFile(
                    {
                        'Custom Bold': {
                            prefix: 'bold',
                            body: '**CUSTOM:${1:text}**$0',
                            description: 'Custom bold override',
                        },
                    },
                    'user',
                );
            });
        });

        it('expanding overridden prefix uses user snippet body', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await typePrefixAndTab('bold');

            const value = await getEditorValue();
            expect(value).toContain('**CUSTOM:');
        });

        it('registry lookup returns only user entry for overridden prefix', async function () {
            const result = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        lookupByPrefix: (p: string) => Array<{
                                            source: string;
                                            name: string;
                                        }>;
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const matches = plugin?.snippetRegistry?.lookupByPrefix('bold');
                if (!matches) return null;
                return matches.map((m) => ({
                    source: m.source,
                    name: m.name,
                }));
            })) as Array<{ source: string; name: string }> | null;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);
            expect(result![0]!.source).toBe('user');
            expect(result![0]!.name).toBe('Custom Bold');
        });

        it('getAll does not contain shadowed bundled entry', async function () {
            const result = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        getAll: () => Array<{
                                            source: string;
                                            name: string;
                                            prefixes: string[];
                                        }>;
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const all = plugin?.snippetRegistry?.getAll();
                if (!all) return null;
                return all
                    .filter((e) => e.prefixes.includes('bold'))
                    .map((e) => ({ source: e.source, name: e.name }));
            })) as Array<{ source: string; name: string }> | null;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);
            expect(result![0]!.source).toBe('user');
        });

        it('non-overridden bundled snippet still works', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await typePrefixAndTab('wl');

            const value = await getEditorValue();
            expect(value).toContain('[[');
            expect(value).toContain(']]');
        });
    });
});
