import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    sendVimEscape,
    getEditorValue,
    getVimMode,
    PAUSE,
} from '../helpers';

async function handleEx(command: string): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
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
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (adapter) Vim.handleEx(adapter, cmd);
    }, command);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function getUndoTreeCurrentSeq(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (app as any).plugins?.plugins?.['vim-motions'];
        return plugin?.undoTree?.getCurrentSeq() ?? -1;
    })) as number;
}

describe('Undo tree navigation', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it(':earlier 1 executes without error', async function () {
        await setupEditor('original', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimKeys('A');
        await browser.keys([' ', 'e', 'd', 'i', 't']);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        await handleEx('earlier 1');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const mode = await getVimMode();
        expect(mode).toBe('normal');
    });

    it(':later 1 after :earlier 1 restores content', async function () {
        await setupEditor('base', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimKeys('A');
        await browser.keys([' ', 'a', 'd', 'd']);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        const afterEdit = await getEditorValue();

        await handleEx('earlier 1');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await handleEx('later 1');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const afterLater = await getEditorValue();
        expect(afterLater).toBe(afterEdit);
    });

    it('g- does not crash and stays in normal mode', async function () {
        await setupEditor('test content', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimKeys('g', '-');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('normal');
    });

    it('g+ does not crash and stays in normal mode', async function () {
        await setupEditor('test content', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimKeys('g', '+');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('normal');
    });

    it('shadow tree tracks edits', async function () {
        await setupEditor('start', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimKeys('A');
        await browser.keys(['x']);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        const seq = await getUndoTreeCurrentSeq();
        expect(seq).toBeGreaterThan(0);
    });
});
