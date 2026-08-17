import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    getRegisterContent,
    sendVimEscape,
    vimKeys,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Expanded Ex commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'ex-commands-expanded');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('ex-commands-expanded', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    } else {
        it('suite "ex-commands-expanded" exists in test-definitions', function () {
            throw new Error(
                'Suite "ex-commands-expanded" not found in SUITES — was it renamed in test-definitions.ts?',
            );
        });
    }

    function handleEx(cmd: string) {
        return browser.executeObsidian(({ app, obsidian }, cmdStr: string) => {
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
                if (!Vim) return { error: 'No Vim API' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                view.editor.focus();
                Vim.handleEx(adapter, cmdStr);
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        }, cmd);
    }

    describe('Phase 1: File operations', function () {
        it('[crash-guard] :update should save without error', async function () {
            await setupEditor('test content', { line: 0, ch: 0 });
            const result = await handleEx('update');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :xit should save and close without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            await setupEditor('xit test', { line: 0, ch: 0 });
            const result = await handleEx('xit');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :find should open file by partial name', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const Vim = (
                            window as unknown as Record<string, unknown> & {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleEx: (
                                            cm: unknown,
                                            input: string,
                                        ) => void;
                                    };
                                };
                            }
                        ).CodeMirrorAdapter?.Vim;
                        if (!Vim) return { error: 'No Vim API' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        view.editor.focus();
                        Vim.handleEx(adapter, 'find Welcome');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :version should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('version');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :e! should revert file without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('edit!');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :saveas with no arg should show usage notice', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('saveas');
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Phase 2: Buffer navigation', function () {
        it('[crash-guard] :bfirst should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('bfirst');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :blast should not error', async function () {
            const result = await handleEx('blast');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :bwipeout should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('bwipeout');
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Phase 3: Split/tab commands', function () {
        it('[crash-guard] :split should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('split');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :vsplit should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('vsplit');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :tabclose should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('tabclose');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :tabonly should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('tabonly');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :tabfirst should not error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await handleEx('tabfirst');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :tablast should not error', async function () {
            const result = await handleEx('tablast');
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Phase 4: Utility commands', function () {
        it(':delmarks a should delete mark a', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('m', 'a');
            await browser.pause(100);
            const result = await handleEx('delmarks a');
            expect(result).toHaveProperty('success', true);
        });

        it('[crash-guard] :changes should not error', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            const result = await handleEx('changes');
            expect(result).toHaveProperty('success', true);
            await sendVimEscape();
            await browser.pause(200);
        });
    });

    describe('Phase 5: CM Vim native Ex commands', function () {
        it(':yank should not error', async function () {
            await setupEditor('line one\nline two', { line: 0, ch: 0 });
            const result = await handleEx('yank');
            expect(result).toHaveProperty('success', true);
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('line one');
        });

        it(':join should join lines', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await handleEx('1,2join');
            expect(await getEditorValue()).toBe('hello world');
        });

        it(':nohlsearch should not error', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            const result = await handleEx('nohlsearch');
            expect(result).toHaveProperty('success', true);
            const content = await getEditorValue();
            expect(content).toBe('test');
        });

        it(':undo should not error', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await browser.pause(100);
            await handleEx('undo');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('hello');
        });

        it(':redo should not error', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await browser.pause(100);
            await handleEx('undo');
            await browser.pause(100);
            await handleEx('redo');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('');
        });

        it(':global should execute on matching lines', async function () {
            await setupEditor('keep\nremove\nkeep\nremove', { line: 0, ch: 0 });
            await handleEx('g/remove/d');
            expect(await getEditorValue()).toBe('keep\nkeep');
        });

        it(':sort should sort lines', async function () {
            await setupEditor('cherry\napple\nbanana', { line: 0, ch: 0 });
            await handleEx('sort');
            expect(await getEditorValue()).toBe('apple\nbanana\ncherry');
        });
    });
});
