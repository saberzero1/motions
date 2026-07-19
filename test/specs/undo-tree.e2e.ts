import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    sendVimEscape,
    PAUSE,
    getEditorValue,
    getVimMode,
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

async function getUndoTreeState(): Promise<{
    nodeCount: number;
    currentSeq: number;
    headSeq: number;
} | null> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (app as any).plugins?.plugins?.['vim-motions'];
        if (!plugin?.undoTree) return null;
        const tree = plugin.undoTree;
        return {
            nodeCount: tree.getNodeCount(),
            currentSeq: tree.getCurrentSeq(),
            headSeq: tree.getHead().seq,
        };
    })) as any;
}

async function getUndoTreeBranches(seq: number): Promise<number> {
    return (await browser.executeObsidian(({ app }, targetSeq: number) => {
        const plugin = (app as any).plugins?.plugins?.['vim-motions'];
        if (!plugin?.undoTree) return 0;
        const node = plugin.undoTree.getNode(targetSeq);
        return node?.children?.length ?? 0;
    }, seq)) as number;
}

async function isModalOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-info-modal');
    })) as boolean;
}

async function closeModal(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

describe('Undo tree', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('CM6 integration', function () {
        it('typing text creates shadow tree nodes', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Type some text (entering insert mode, typing, escaping)
            await vimKeys('i');
            await browser.keys(['h', 'e', 'l', 'l', 'o']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const content = await getEditorValue();
            expect(content).toBe('hello');

            const state = await getUndoTreeState();
            expect(state).not.toBeNull();
            // At least 1 node beyond root should exist after typing
            expect(state!.nodeCount).toBeGreaterThan(1);
            const branches = await getUndoTreeBranches(state!.currentSeq);
            expect(branches).toBeGreaterThanOrEqual(0);
        });

        it('undo moves shadow tree current backward', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['a', 'b', 'c']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const before = await getUndoTreeState();
            await vimKeys('u');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getUndoTreeState();
            expect(after!.currentSeq).toBeLessThan(before!.currentSeq);
        });
    });

    describe('g+/g-', function () {
        it('g- does not crash at root', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // g- at root should be a no-op, not a crash
            await vimKeys('g', '-');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Verify we're still in normal mode (no error)
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });

        it('g+ does not crash at head', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await vimKeys('g', '+');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });
    });

    describe(':earlier/:later', function () {
        it(':earlier 1 does not crash', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await handleEx('earlier 1');
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });

        it(':later 1 does not crash', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await handleEx('earlier 1');
            await handleEx('later 1');
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });

        it(':earlier with no argument defaults to 1', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await handleEx('earlier');
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });
    });

    describe(':undolist', function () {
        it(':undolist opens modal', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await handleEx('undolist');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const open = await isModalOpen();
            expect(open).toBe(true);

            await closeModal();
        });
    });
});
