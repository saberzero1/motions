import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    sendVimEscape,
    getEditorValue,
    getCursorPos,
    PAUSE,
} from '../../helpers';

describe('Spike 27b: ci* single-char in source vs Live Preview', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(200);
    });

    it('ci* single-char in source mode', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = true;
            view.setState(state, { history: false });
        });
        await browser.pause(500);

        await setupEditor('Hello **x** world', { line: 0, ch: 8 });
        await vimKeys('c', 'i', '*');
        await browser.pause(200);
        await browser.keys('y'.split(''));
        await sendVimEscape();
        await browser.pause(200);
        const value = await getEditorValue();
        console.log('ci* single-char SOURCE MODE:', JSON.stringify(value));
        if (value === 'Hello **y** world') {
            console.log('WORKS in source mode — bug is Live Preview specific');
        } else {
            console.log(
                'FAILS in source mode too — bug is in vim engine/text object',
            );
        }
    });

    it('di* single-char verifies text object works', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
        });
        await browser.pause(500);

        await setupEditor('Hello **x** world', { line: 0, ch: 8 });
        await vimKeys('d', 'i', '*');
        const value = await getEditorValue();
        const cursor = await getCursorPos();
        console.log(
            'di* single-char result:',
            JSON.stringify(value),
            'cursor:',
            JSON.stringify(cursor),
        );
        if (value === 'Hello **** world') {
            console.log('di* WORKS for single-char — text object is correct');
        } else {
            console.log('di* FAILS for single-char — text object bug');
        }
    });

    it('ci* single-char via handleKey (bypass DOM routing)', async function () {
        await setupEditor('Hello **x** world', { line: 0, ch: 8 });

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

            Vim.handleKey(adapter, '<Esc>');
            const before = {
                value: view.editor.getValue(),
                cursor: view.editor.getCursor(),
            };

            Vim.handleKey(adapter, 'c');
            Vim.handleKey(adapter, 'i');
            Vim.handleKey(adapter, '*');

            const after = {
                value: view.editor.getValue(),
                cursor: view.editor.getCursor(),
            };
            const vimState = (
                adapter as { state?: { vim?: Record<string, unknown> } }
            ).state?.vim;

            return { before, after, insertMode: !!vimState?.insertMode };
        });

        console.log(
            'Programmatic ci* single-char:',
            JSON.stringify(result, null, 2),
        );
    });
});
