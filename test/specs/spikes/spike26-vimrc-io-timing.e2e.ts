import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    PAUSE,
    getCursorPos,
    getEditorValue,
    setupEditor,
} from '../../helpers';

/**
 * Spike 26: Vimrc file I/O timing
 *
 * Reproduces the issue where vimrc mappings (e.g., `nmap L $`) may not apply
 * because `app.vault.adapter.read()` returns empty content during the
 * `active-leaf-change` lifecycle event. The current mitigation uses stat() +
 * retry with backoff (50/100/200/400ms = 750ms total), but the issue persists.
 *
 * This spike:
 * 1. Writes a vimrc, reloads, and checks if mappings applied
 * 2. Inspects the vimrcLoaded flag and command count
 * 3. Tests whether vault.read() (TFile API) is more reliable than adapter.read()
 * 4. Tests the timing of onLayoutReady vs active-leaf-change
 */

type PluginRef = {
    vimrcLoaded?: boolean;
    vimrcLoading?: boolean;
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
};

async function getPluginState(): Promise<Record<string, unknown>> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { error: 'no plugin' };
        return {
            vimrcLoaded: plugin.vimrcLoaded,
            vimrcLoading: plugin.vimrcLoading,
        };
    })) as Record<string, unknown>;
}

async function getVimrcCommandCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, { vimrcCommandCount?: number }>;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.vimrcCommandCount ?? -1;
    })) as number;
}

async function checkMappingExists(
    lhs: string,
    context = 'normal',
): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, key: string, ctx: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getKeymap: (
                                context?: string,
                            ) => Array<{ keys: string }>;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;
            const keymap = Vim.getKeymap(ctx);
            return keymap.some((entry) => entry.keys === key);
        },
        lhs,
        context,
    )) as boolean;
}

async function testMappingWorks(
    key: string,
    expectedCh: number,
    lineContent: string,
): Promise<{ before: number; after: number; expected: number }> {
    return (await browser.executeObsidian(
        (
            { app, obsidian },
            k: string,
            expectedResult: number,
            content: string,
        ) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim)
                return { before: -1, after: -1, expected: expectedResult };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view)
                return { before: -1, after: -1, expected: expectedResult };

            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();

            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter)
                return { before: -1, after: -1, expected: expectedResult };

            Vim.handleKey(adapter, '<Esc>');
            const before = view.editor.getCursor().ch;
            Vim.handleKey(adapter, k);
            const after = view.editor.getCursor().ch;

            return { before, after, expected: expectedResult };
        },
        key,
        expectedCh,
        lineContent,
    )) as { before: number; after: number; expected: number };
}

describe('Spike 26: Vimrc file I/O timing', function () {
    describe('Baseline: vimrc with nmap L $ loads correctly', function () {
        before(async function () {
            await obsidianPage.write('.obsidian.vimrc', 'nmap L $\nnmap H ^\n');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(2000);
        });

        after(async function () {
            await obsidianPage.resetVault();
        });

        it('should check vimrcLoaded flag after reload', async function () {
            const state = await getPluginState();
            console.log('Plugin state after reload:', JSON.stringify(state));
            expect(state.vimrcLoaded).toBe(true);
        });

        it('should check vimrc command count', async function () {
            const count = await getVimrcCommandCount();
            console.log('Vimrc command count:', count);

            if (count === 0) {
                console.log(
                    'BUG REPRODUCED: vimrcCommandCount is 0 — file read returned empty.',
                );
            } else if (count === -1) {
                console.log(
                    'Property vimrcCommandCount not found on plugin — field may be named differently.',
                );
            } else {
                console.log(
                    `Vimrc loaded ${count} command(s) — file read succeeded.`,
                );
            }
        });

        it('should check if L mapping exists in keymap', async function () {
            const exists = await checkMappingExists('L');
            console.log('L mapping exists in keymap:', exists);

            if (!exists) {
                console.log(
                    'BUG REPRODUCED: L mapping not in keymap despite vimrc containing nmap L $.',
                );
            }
        });

        it('should test L mapping behavior', async function () {
            const result = await testMappingWorks('L', 14, 'hello world test');
            console.log('L mapping test:', JSON.stringify(result));

            if (result.after === result.before) {
                console.log(
                    'BUG REPRODUCED: L did not move cursor — mapping not applied.',
                );
            } else if (result.after === result.expected) {
                console.log(
                    'L mapping works correctly — cursor moved to end of line.',
                );
            }
        });
    });

    describe('Timing diagnostics: adapter.read vs vault.read', function () {
        before(async function () {
            await obsidianPage.write('.obsidian.vimrc', 'nmap L $\nnmap H ^\n');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(1000);
        });

        after(async function () {
            await obsidianPage.resetVault();
        });

        it('should compare adapter.read vs vault.read reliability', async function () {
            const result = await browser.executeObsidian(async ({ app }) => {
                const path = '.obsidian.vimrc';
                const results: Record<string, unknown> = {};

                // Test 1: adapter.stat()
                try {
                    const stat = await app.vault.adapter.stat(path);
                    results.statResult = stat
                        ? { size: stat.size, exists: true }
                        : { exists: false };
                } catch (e) {
                    results.statResult = { error: String(e) };
                }

                // Test 2: adapter.read()
                try {
                    const content = await app.vault.adapter.read(path);
                    results.adapterRead = {
                        length: content?.length ?? 0,
                        empty: !content || content.trim().length === 0,
                        content: content?.slice(0, 100),
                    };
                } catch (e) {
                    results.adapterRead = { error: String(e) };
                }

                // Test 3: vault.getFileByPath + vault.read (TFile API)
                try {
                    const file = app.vault.getFileByPath(path);
                    if (file) {
                        const content = await app.vault.read(file);
                        results.vaultRead = {
                            length: content.length,
                            empty: content.trim().length === 0,
                            content: content.slice(0, 100),
                        };
                    } else {
                        results.vaultRead = {
                            fileFound: false,
                            note: 'getFileByPath returned null — hidden file not in vault index',
                        };
                    }
                } catch (e) {
                    results.vaultRead = { error: String(e) };
                }

                // Test 4: vault.cachedRead (cache path)
                try {
                    const file = app.vault.getFileByPath(path);
                    if (file) {
                        const content = await app.vault.cachedRead(file);
                        results.cachedRead = {
                            length: content.length,
                            empty: content.trim().length === 0,
                        };
                    } else {
                        results.cachedRead = { fileFound: false };
                    }
                } catch (e) {
                    results.cachedRead = { error: String(e) };
                }

                // Test 5: non-dot vimrc (vault-visible)
                const nonDotPath = 'vimrc';
                try {
                    await app.vault.adapter.write(
                        nonDotPath,
                        'nmap L $\nnmap H ^\n',
                    );
                    const file = app.vault.getFileByPath(nonDotPath);
                    results.nonDotVimrc = {
                        fileInVaultIndex: !!file,
                        canUseVaultRead: !!file,
                    };
                    if (file) {
                        const content = await app.vault.read(file);
                        results.nonDotVimrcContent = {
                            length: content.length,
                            empty: content.trim().length === 0,
                        };
                    }
                    await app.vault.adapter.remove(nonDotPath);
                } catch (e) {
                    results.nonDotVimrc = { error: String(e) };
                }

                // Test 6: layoutReady state
                results.layoutReady = app.workspace.layoutReady;

                return results;
            });
            console.log(
                'Read method comparison:',
                JSON.stringify(result, null, 2),
            );
        });

        it('should test read reliability during rapid reloads', async function () {
            const results: Array<Record<string, unknown>> = [];

            for (let i = 0; i < 3; i++) {
                await browser.reloadObsidian({ vault: 'test-vault' });
                await obsidianPage.openFile('Welcome.md');
                await browser.pause(500);

                const state = await getPluginState();
                const count = await getVimrcCommandCount();
                const mappingExists = await checkMappingExists('L');

                results.push({
                    attempt: i + 1,
                    vimrcLoaded: state.vimrcLoaded,
                    commandCount: count,
                    lMappingExists: mappingExists,
                });
            }

            console.log(
                'Rapid reload results:',
                JSON.stringify(results, null, 2),
            );

            const failures = results.filter((r) => !r.lMappingExists);
            if (failures.length > 0) {
                console.log(
                    `BUG REPRODUCED: L mapping failed to load in ${failures.length}/3 rapid reloads.`,
                );
            } else {
                console.log(
                    'All 3 rapid reloads loaded L mapping successfully.',
                );
            }
        });
    });
});
