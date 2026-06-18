import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
} from '../../helpers';

describe('Insert mode commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('Escape / CTRL-[ (exit insert)', function () {
        it('Escape should return to normal mode', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['Escape']);
            await browser.pause(100);
            await browser.keys(['x']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('ello');
        });
    });

    describe('CTRL-W (delete word)', function () {
        it('CTRL-W should delete word before cursor in insert mode', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys([
                'h',
                'e',
                'l',
                'l',
                'o',
                ' ',
                'w',
                'o',
                'r',
                'l',
                'd',
            ]);
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
                Vim.handleKey(adapter, '<C-w>');
            });
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
            const val = await getEditorValue();
            expect(val).toBe('hello ');
        });
    });

    describe('CTRL-U (delete to start of line)', function () {
        it('CTRL-U should delete to start of line in insert mode', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['h', 'e', 'l', 'l', 'o']);
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
                Vim.handleKey(adapter, '<C-u>');
            });
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('');
        });
    });

    describe('CTRL-O (single normal command)', function () {
        it('CTRL-O should execute one normal command then return to insert', async function () {
            await setupEditor('hello\nworld', { line: 1, ch: 0 });
            await vimKeys('i');

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
                Vim.handleKey(adapter, '<C-o>');
                Vim.handleKey(adapter, 'k');
            });
            await browser.pause(300);
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
