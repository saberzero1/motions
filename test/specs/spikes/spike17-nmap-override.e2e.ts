import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
} from '../../helpers';

// ===========================================================================
// Original spike17 tests (preserved)
// ===========================================================================
describe('Spike 17: nmap override of built-in motions (L, H)', function () {
    before(async function () {
        await obsidianPage.write('.obsidian.vimrc', 'nmap H ^\nnmap L $\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(1000);
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('should check if L mapping exists in the keymap', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getVimGlobalState_: () => Record<string, unknown>;
                            map: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            const vimState = (adapter.state as Record<string, unknown>)?.vim as
                | Record<string, unknown>
                | undefined;

            const props = Object.keys(Vim);
            const hasDefaultKeymap =
                'defaultKeymap' in (Vim as Record<string, unknown>);
            const globalState = Vim.getVimGlobalState_();
            const globalStateKeys = Object.keys(globalState);

            return {
                vimApiProps: props.slice(0, 30),
                hasDefaultKeymap,
                globalStateKeys,
                vimStateKeys: vimState ? Object.keys(vimState) : [],
            };
        })) as Record<string, unknown>;

        console.log('Vim API introspection:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });

    it('should check if handleEx was called (vimrcLoaded flag)', async function () {
        const result = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, { vimrcLoaded?: boolean }>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return { error: 'no plugin' };
            return { vimrcLoaded: plugin.vimrcLoaded };
        })) as Record<string, unknown>;

        console.log('Plugin state:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });

    it('should apply nmap L $ directly at runtime and test', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            map: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                            handleEx: (cm: unknown, input: string) => void;
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, '<Esc>');

            Vim.map('L', '$', 'normal');
            const afterMapCh0 = view.editor.getCursor().ch;
            Vim.handleKey(adapter, 'L');
            const afterMapL = view.editor.getCursor().ch;

            view.editor.setCursor(0, 0);
            Vim.handleEx(adapter, 'nmap L $');
            Vim.handleKey(adapter, 'L');
            const afterHandleExL = view.editor.getCursor().ch;

            return {
                afterMapCh0,
                afterVimMapL: afterMapL,
                afterHandleExL,
            };
        })) as Record<string, unknown>;

        console.log('Direct mapping test:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });

    it('should test L behavior with handleKey directly', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            Vim.handleKey(adapter, '<Esc>');
            const beforeCh = view.editor.getCursor().ch;
            Vim.handleKey(adapter, 'L');
            const afterCh = view.editor.getCursor().ch;

            return { beforeCh, afterCh, lineLength: 'hello world test'.length };
        })) as Record<string, unknown>;

        console.log('L handleKey result:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });

    it('should test $ behavior directly for comparison', async function () {
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await vimKeys('$');
        const pos = await getCursorPos();
        console.log('$ result: ch =', pos.ch);
        expect(pos.ch).toBe(15);
    });

    it('should test L behavior via vimKeys for comparison', async function () {
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await vimKeys('L');
        const pos = await getCursorPos();
        console.log('L via vimKeys result: ch =', pos.ch);
    });
});

// ===========================================================================
// Phase 1 Diagnostics — Investigation 1: Why `nmap L $` fails via vimrc
// ===========================================================================

describe('Spike 17 — Diag 1: Mapping persistence after vimrc load', function () {
    // Tests Hypothesis C: Is the L→$ mapping present immediately after vimrcLoaded?
    // Also tests the vimKeys vs handleKey difference (Momus insight).

    before(async function () {
        await obsidianPage.write('.obsidian.vimrc', 'nmap H ^\nnmap L $\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return plugin?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('handleKey(L) should move to end-of-line immediately after vimrc load', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');

            const beforeCh = view.editor.getCursor().ch;
            Vim.handleKey(adapter, 'L');
            const afterHandleKeyCh = view.editor.getCursor().ch;

            return {
                beforeCh,
                afterHandleKeyCh,
                expected: 15,
                mappingWorksViaHandleKey: afterHandleKeyCh === 15,
            };
        })) as Record<string, unknown>;

        console.log(
            'Diag 1a — handleKey(L) after vimrc:',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('vimKeys(L) should move to end-of-line (WebDriver path)', async function () {
        // Tests if the issue is handleKey vs WebDriver keystroke delivery
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await vimKeys('L');
        const pos = await getCursorPos();

        console.log(
            'Diag 1b — vimKeys(L) after vimrc: ch =',
            pos.ch,
            '(expected 15, got',
            pos.ch,
            '→',
            pos.ch === 15 ? 'WORKS' : 'FAILS',
            ')',
        );
    });

    it('H mapping should work for comparison (control test)', async function () {
        await setupEditor('   hello world test', { line: 0, ch: 10 });
        await vimKeys('H');
        const pos = await getCursorPos();

        console.log(
            'Diag 1c — vimKeys(H) after vimrc: ch =',
            pos.ch,
            '(expected 3, got',
            pos.ch,
            '→',
            pos.ch === 3 ? 'WORKS' : 'FAILS',
            ')',
        );
        expect(pos.ch).toBe(3); // H→^ should work per existing test evidence
    });
});

describe('Spike 17 — Diag 1x: L→0 and L→$ isolation', function () {
    after(async function () {
        await obsidianPage.resetVault();
    });

    it('L→0 via vimrc should work', async function () {
        await obsidianPage.write('.obsidian.vimrc', 'nmap L 0\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const p = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return p?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
        await setupEditor('hello world test', { line: 0, ch: 8 });
        await vimKeys('L');
        const pos = await getCursorPos();
        console.log(
            'Diag 1x-a — L→0:',
            pos.ch === 0 ? 'WORKS' : 'FAILS',
            'ch=' + pos.ch,
        );
        expect(pos.ch).toBe(0);
    });

    it('L→$ via vimrc should move to end-of-line', async function () {
        await obsidianPage.write('.obsidian.vimrc', 'nmap L $\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const p = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return p?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );

        await setupEditor('hello world test', { line: 0, ch: 0 });
        await vimKeys('L');
        const pos = await getCursorPos();
        console.log(
            'Diag 1x-b — L→$:',
            pos.ch === 15 ? 'WORKS' : 'FAILS',
            'ch=' + pos.ch,
        );
    });

    it('L→$ via Vim.map at runtime (after vimrc load)', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            map: (l: string, r: string, c?: string) => void;
                            handleKey: (cm: unknown, k: string) => boolean;
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

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');
            Vim.map('L', '$', 'normal');
            Vim.handleKey(adapter, 'L');
            return { ch: view.editor.getCursor().ch };
        })) as Record<string, unknown>;
        console.log('Diag 1x-c — L→$ runtime:', JSON.stringify(result));
    });
});

describe('Spike 17 — Diag 2: handleEx vs Vim.map comparison', function () {
    // Tests Hypothesis E: Does handleEx('nmap L $') produce the same result
    // as Vim.map('L', '$', 'normal')? Also tests 'map L $' (without n prefix).

    before(async function () {
        // Clean state: no vimrc, no pre-existing mappings
        await obsidianPage.resetVault();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(1000);
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('Vim.map("L", "$", "normal") → handleKey("L") should reach end-of-line', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            map: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                            unmap: (lhs: string, ctx?: string) => void;
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');

            Vim.map('L', '$', 'normal');
            Vim.handleKey(adapter, 'L');
            const chAfterVimMap = view.editor.getCursor().ch;

            try {
                Vim.unmap('L', 'normal');
            } catch {
                /* may not exist */
            }

            return { chAfterVimMap, expected: 15 };
        })) as Record<string, unknown>;

        console.log('Diag 2a — Vim.map:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
        expect(result).toHaveProperty('chAfterVimMap', 15);
    });

    it('handleEx("nmap L $") → handleKey("L") should reach end-of-line', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            unmap: (lhs: string, ctx?: string) => void;
                            handleEx: (cm: unknown, input: string) => void;
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');

            Vim.handleEx(adapter, 'nmap L $');
            Vim.handleKey(adapter, 'L');
            const chAfterHandleEx = view.editor.getCursor().ch;

            try {
                Vim.unmap('L', 'normal');
            } catch {
                /* may not exist */
            }

            return { chAfterHandleEx, expected: 15 };
        })) as Record<string, unknown>;

        console.log(
            'Diag 2b — handleEx nmap:',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('handleEx("map L $") → handleKey("L") should reach end-of-line', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            unmap: (lhs: string, ctx?: string) => void;
                            handleEx: (cm: unknown, input: string) => void;
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');

            Vim.handleEx(adapter, 'map L $');
            Vim.handleKey(adapter, 'L');
            const chAfterMap = view.editor.getCursor().ch;

            try {
                Vim.unmap('L');
            } catch {
                /* may not exist */
            }

            return { chAfterMap, expected: 15 };
        })) as Record<string, unknown>;

        console.log(
            'Diag 2c — handleEx map (no n):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });
});

describe('Spike 17 — Diag 3: findKey availability and L resolution', function () {
    // Tests Hypothesis D: What does CM Vim resolve L to?

    before(async function () {
        await obsidianPage.write('.obsidian.vimrc', 'nmap H ^\nnmap L $\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return plugin?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('should check if findKey exists and what L resolves to', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getVimGlobalState_: () => Record<string, unknown>;
                            findKey?: (
                                cm: unknown,
                                key: string,
                                mode: string,
                            ) => unknown;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            const hasFindKey =
                'findKey' in (Vim as unknown as Record<string, unknown>);

            let findKeyResult: unknown = null;
            if (hasFindKey && typeof Vim.findKey === 'function') {
                try {
                    findKeyResult = Vim.findKey(adapter, 'L', 'normal');
                } catch (e) {
                    findKeyResult = { findKeyError: String(e) };
                }
            }

            const globalState = Vim.getVimGlobalState_();
            const keymapEntries: unknown[] = [];
            if (globalState && typeof globalState === 'object') {
                for (const key of Object.keys(globalState)) {
                    if (
                        key.toLowerCase().includes('keymap') ||
                        key.toLowerCase().includes('map')
                    ) {
                        const val = (globalState as Record<string, unknown>)[
                            key
                        ];
                        if (Array.isArray(val)) {
                            for (const entry of val) {
                                const e = entry as Record<string, unknown>;
                                if (e.keys === 'L' || e.lhs === 'L') {
                                    keymapEntries.push({
                                        source: key,
                                        ...e,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            let findKeyStr: string | null = null;
            if (findKeyResult !== null && findKeyResult !== undefined) {
                try {
                    findKeyStr = JSON.stringify(findKeyResult);
                } catch {
                    findKeyStr = String(findKeyResult);
                }
            }

            return {
                hasFindKey,
                findKeyResult: findKeyStr,
                keymapEntries,
                globalStateKeys: Object.keys(globalState),
            };
        })) as Record<string, unknown>;

        console.log(
            'Diag 3 — findKey & keymap:',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });
});

// ===========================================================================
// Phase 1 Diagnostics — Investigation 2: Why `set textwidth=20` doesn't affect gq
// ===========================================================================

describe('Spike 17 — Diag 4: textwidth callback gate (Vim.setOption)', function () {
    // Tests Investigation 2, Hypothesis A: Does our defineOption callback
    // for textwidth actually receive setOption calls? We test indirectly
    // by running gq on a known string after setOption('textwidth', 20).

    before(async function () {
        // Clean state — no vimrc
        await obsidianPage.resetVault();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(1000);
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('Vim.setOption("textwidth", 20) → gqq should wrap at 20 columns', async function () {
        const setResult = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                setOption: (
                                    name: string,
                                    value: unknown,
                                ) => void;
                                getOption: (name: string) => unknown;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim API' };

                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };

                const twBefore = Vim.getOption('textwidth');
                Vim.setOption('textwidth', 20);
                const twAfter = Vim.getOption('textwidth');

                return { twBefore, twAfter };
            },
        )) as Record<string, unknown>;

        console.log(
            'Diag 4a — setOption result:',
            JSON.stringify(setResult, null, 2),
        );
        expect(setResult).not.toHaveProperty('error');

        // Now test gqq wrapping behavior
        const longLine =
            'This is a line that exceeds twenty characters by a lot and keeps going';
        await setupEditor(longLine, { line: 0, ch: 0 });
        await vimKeys('g', 'q', 'q');
        const val = await getEditorValue();
        const lines = val.split('\n');

        console.log(
            'Diag 4b — gqq after setOption(tw=20):',
            JSON.stringify({
                lineCount: lines.length,
                lines,
                wrappedAt20: lines.length > 1 && lines[0]!.length <= 21,
            }),
        );

        // Reset textwidth back to 80
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: { setOption: (n: string, v: unknown) => void };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.setOption('textwidth', 80);
        });
    });
});

describe('Spike 17 — Diag 5: textwidth via handleEx pipeline', function () {
    // Tests Investigation 2: Does `handleEx(cm, 'set textwidth=20')` update
    // the plugin's textwidthValue? This is the full vimrc pipeline path.

    before(async function () {
        // Load vimrc with textwidth=20
        await obsidianPage.write('.obsidian.vimrc', 'set textwidth=20\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return plugin?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('gqq should wrap at 20 columns after vimrc set textwidth=20', async function () {
        const longLine =
            'This is a line that exceeds twenty characters by a lot and keeps going';
        await setupEditor(longLine, { line: 0, ch: 0 });
        await vimKeys('g', 'q', 'q');
        const val = await getEditorValue();
        const lines = val.split('\n');

        console.log(
            'Diag 5a — gqq after vimrc textwidth=20:',
            JSON.stringify({
                lineCount: lines.length,
                lines,
                wrappedAt20: lines.length > 1 && lines[0]!.length <= 21,
                wrappedAt80: lines.length === 1 || lines[0]!.length > 21,
            }),
        );
    });

    it('handleEx("set textwidth=20") at runtime → gqq should wrap at 20', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;

            Vim.handleEx(adapter, 'set textwidth=20');
        });

        const longLine =
            'This is a line that exceeds twenty characters by a lot and keeps going';
        await setupEditor(longLine, { line: 0, ch: 0 });
        await vimKeys('g', 'q', 'q');
        const val = await getEditorValue();
        const lines = val.split('\n');

        console.log(
            'Diag 5b — gqq after runtime handleEx textwidth=20:',
            JSON.stringify({
                lineCount: lines.length,
                lines,
                wrappedAt20: lines.length > 1 && lines[0]!.length <= 21,
            }),
        );
    });

    it('should compare getOption("textwidth") after vimrc load', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getOption: (name: string) => unknown;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            const twValue = Vim.getOption('textwidth');

            return { textwidthFromGetOption: twValue };
        })) as Record<string, unknown>;

        console.log(
            'Diag 5c — getOption textwidth:',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });
});
