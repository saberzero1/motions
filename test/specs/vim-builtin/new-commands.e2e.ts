import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
} from '../../helpers';

describe('New vim commands — @:, &, ZZ, ZQ, insert Ctrl-A/E/Y', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('@: (repeat last ex command)', function () {
        it('@: with no prior ex command should be a no-op', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm as
                            | Record<string, unknown>
                            | undefined;
                        if (!adapter) return { error: 'No adapter' };
                        const Vim = (
                            window as unknown as {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleKey: (
                                            cm: unknown,
                                            key: string,
                                        ) => boolean;
                                    };
                                };
                            }
                        ).CodeMirrorAdapter?.Vim;
                        if (!Vim) return { error: 'No Vim' };
                        Vim.handleKey(adapter, '@');
                        Vim.handleKey(adapter, ':');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
            expect(await getEditorValue()).toBe('hello world');
        });

        it('after :s/foo/bar/ on line 0, @: on line 1 should substitute again', async function () {
            await setupEditor('foo baz\nfoo qux', { line: 0, ch: 0 });

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleEx(adapter, 's/foo/bar/');
                Vim.handleKey(adapter, 'j');
                Vim.handleKey(adapter, '@');
                Vim.handleKey(adapter, ':');
            });
            await browser.pause(300);

            const val = await getEditorValue();
            expect(val).toBe('bar baz\nbar qux');
        });
    });

    describe('& (repeat last substitute)', function () {
        it('after :s/hello/world/ on line 0, & on line 1 should substitute', async function () {
            await setupEditor('hello there\nhello again', {
                line: 0,
                ch: 0,
            });

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleEx(adapter, 's/hello/world/');
                Vim.handleKey(adapter, 'j');
                Vim.handleKey(adapter, '&');
            });
            await browser.pause(300);

            expect(await getEditorValue()).toBe('world there\nworld again');
        });

        it('& with no prior substitute should be a no-op', async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await setupEditor('keep this text', { line: 0, ch: 0 });

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm as
                            | Record<string, unknown>
                            | undefined;
                        if (!adapter) return { error: 'No adapter' };
                        const Vim = (
                            window as unknown as {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleKey: (
                                            cm: unknown,
                                            key: string,
                                        ) => boolean;
                                    };
                                };
                            }
                        ).CodeMirrorAdapter?.Vim;
                        if (!Vim) return { error: 'No Vim' };
                        Vim.handleKey(adapter, '&');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
            expect(await getEditorValue()).toBe('keep this text');
        });
    });

    describe('Insert Ctrl-A (re-insert previously inserted text)', function () {
        it('should re-insert text from the previous insert session', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['h', 'e', 'l', 'l', 'o']);
            await browser.pause(100);
            await sendVimEscape();
            await browser.pause(100);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleKey(adapter, 'o');
                Vim.handleKey(adapter, '<C-a>');
                Vim.handleKey(adapter, '<Esc>');
            });
            await browser.pause(300);

            const val = await getEditorValue();
            expect(val).toContain('hello');
        });
    });

    describe('Insert Ctrl-E (copy char from line below)', function () {
        it('should insert the character from the line below at same column', async function () {
            await setupEditor('abc\nxyz', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.pause(100);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-e>');
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(100);

            expect(await getEditorValue()).toBe('xabc\nxyz');
        });

        it('should be a no-op at last line (no line below)', async function () {
            await setupEditor('only line', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.pause(100);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-e>');
            });
            await browser.pause(200);
            await sendVimEscape();
            await browser.pause(100);

            expect(await getEditorValue()).toBe('only line');
        });
    });

    describe('Insert Ctrl-Y (copy char from line above)', function () {
        it('should insert the character from the line above at same column', async function () {
            await setupEditor('abc\nxyz', { line: 1, ch: 0 });
            await vimKeys('i');
            await browser.pause(100);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-y>');
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(100);

            expect(await getEditorValue()).toBe('abc\naxyz');
        });

        it('should be a no-op at first line (no line above)', async function () {
            await setupEditor('only line', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.pause(100);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-y>');
            });
            await browser.pause(200);
            await sendVimEscape();
            await browser.pause(100);

            expect(await getEditorValue()).toBe('only line');
        });
    });

    describe('ZZ (write + quit)', function () {
        before(async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });

        it('[crash-guard] ZZ should close the current tab without error', async function () {
            await setupEditor('test content', { line: 0, ch: 0 });

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm as
                            | Record<string, unknown>
                            | undefined;
                        if (!adapter) return { error: 'No adapter' };
                        const Vim = (
                            window as unknown as {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleKey: (
                                            cm: unknown,
                                            key: string,
                                        ) => boolean;
                                    };
                                };
                            }
                        ).CodeMirrorAdapter?.Vim;
                        if (!Vim) return { error: 'No Vim' };
                        Vim.handleKey(adapter, 'Z');
                        Vim.handleKey(adapter, 'Z');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('ZQ (quit without saving)', function () {
        before(async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });

        it('[crash-guard] ZQ should close the current tab without error', async function () {
            await setupEditor('unsaved content', { line: 0, ch: 0 });

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm as
                            | Record<string, unknown>
                            | undefined;
                        if (!adapter) return { error: 'No adapter' };
                        const Vim = (
                            window as unknown as {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleKey: (
                                            cm: unknown,
                                            key: string,
                                        ) => boolean;
                                    };
                                };
                            }
                        ).CodeMirrorAdapter?.Vim;
                        if (!Vim) return { error: 'No Vim' };
                        Vim.handleKey(adapter, 'Z');
                        Vim.handleKey(adapter, 'Q');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('gM (go to middle of text line)', function () {
        it('gM should move to middle character of line', async function () {
            await setupEditor('abcdefghij', { line: 0, ch: 0 });
            await vimKeys('g', 'M');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(5);
        });

        it('gM on 3-char line should move to ch 1', async function () {
            await setupEditor('abc', { line: 0, ch: 0 });
            await vimKeys('g', 'M');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(1);
        });
    });

    describe('g& (repeat last :s on all lines)', function () {
        it('g& should repeat last substitute on all lines', async function () {
            await setupEditor('old\nold\nold', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(100);
            await browser.keys([
                's',
                '/',
                'o',
                'l',
                'd',
                '/',
                'n',
                'e',
                'w',
                '/',
            ]);
            await browser.keys(['Enter']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('new\nold\nold');
            await vimKeys('g', '&');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('new\nnew\nnew');
        });
    });

    describe(']<Space> / [<Space> (add blank lines)', function () {
        it(']<Space> should add a blank line below', async function () {
            await setupEditor('one\ntwo\nthree', { line: 1, ch: 0 });
            await vimKeys(']', ' ');
            expect(await getEditorValue()).toBe('one\ntwo\n\nthree');
        });

        it('[<Space> should add a blank line above', async function () {
            await setupEditor('one\ntwo\nthree', { line: 1, ch: 0 });
            await vimKeys('[', ' ');
            expect(await getEditorValue()).toBe('one\n\ntwo\nthree');
        });

        it('3]<Space> should add 3 blank lines below', async function () {
            await setupEditor('one\ntwo', { line: 0, ch: 0 });
            await vimKeys('3', ']', ' ');
            expect(await getEditorValue()).toBe('one\n\n\n\ntwo');
        });
    });
});
