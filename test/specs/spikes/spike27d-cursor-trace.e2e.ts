import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../../helpers';

describe('Spike 27d: ci* single-char root cause', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should trace cursor through setupEditor + sendVimEscape sequence', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
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

            view.editor.setValue('Hello **x** world');
            view.editor.setCursor(0, 8);
            view.editor.focus();
            const afterSetCursor = view.editor.getCursor().ch;

            Vim.handleKey(adapter, '<Esc>');
            const afterEsc = view.editor.getCursor().ch;

            view.editor.setCursor(0, 8);
            const afterResetCursor = view.editor.getCursor().ch;

            Vim.handleKey(adapter, 'c');
            const afterC = view.editor.getCursor().ch;

            Vim.handleKey(adapter, 'i');
            const afterI = view.editor.getCursor().ch;

            Vim.handleKey(adapter, '*');
            const afterStar = view.editor.getCursor().ch;

            const finalValue = view.editor.getValue();
            const vimState = (
                adapter as { state?: { vim?: Record<string, unknown> } }
            ).state?.vim;

            return {
                afterSetCursor,
                afterEsc,
                afterResetCursor,
                afterC,
                afterI,
                afterStar,
                finalValue,
                insertMode: !!vimState?.insertMode,
            };
        });
        console.log('Cursor trace:', JSON.stringify(result, null, 2));
    });

    it('should test di* with cursor explicitly set right before', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
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

            view.editor.setValue('Hello **x** world');
            view.editor.setCursor(0, 8);
            view.editor.focus();
            Vim.handleKey(adapter, '<Esc>');

            view.editor.setCursor(0, 8);
            const cursorBeforeDi = view.editor.getCursor().ch;

            Vim.handleKey(adapter, 'd');
            Vim.handleKey(adapter, 'i');
            Vim.handleKey(adapter, '*');

            return {
                cursorBeforeDi,
                finalValue: view.editor.getValue(),
                finalCursor: view.editor.getCursor().ch,
            };
        });
        console.log('di* with cursor reset:', JSON.stringify(result, null, 2));
    });

    it('should test what getLine returns for **x** in Live Preview', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **x** world');
            view.editor.setCursor(0, 8);
            view.editor.focus();
        });
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as
                | { getLine?: (n: number) => string }
                | undefined;
            if (!adapter) return { error: 'No adapter' };

            const line0 = adapter.getLine?.(0);
            return {
                getLine0: line0,
                editorGetLine0: view.editor.getLine(0),
                length: line0?.length,
            };
        });
        console.log(
            'getLine in Live Preview:',
            JSON.stringify(result, null, 2),
        );
    });
});
