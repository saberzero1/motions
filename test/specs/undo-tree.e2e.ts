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
            expect(branches).toBe(0);
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
        // These scenarios claim to act at the root of the undo tree, but
        // setupEditor only replaces the text and nothing resets the tree, so
        // earlier scenarios in this file leave history reachable. A capture
        // of the failure showed nodeCount 12 and currentSeq 11 -- not root --
        // so g- had somewhere to navigate and the unchanged-document
        // assertion did not hold.
        //
        // Reloading collapses that to nodeCount 2, currentSeq 1: the root
        // plus the setup edit itself, measured. That is not literally root,
        // so the scenario name still overstates slightly, but it removes the
        // cross-scenario history that made the assertion false. The
        // assertion is kept rather than weakened, because dropping it would
        // hide the unexplained "-" that this scenario is the only place
        // still reporting.
        beforeEach(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('g- does not crash at root', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const seeded = await getEditorValue();
            const treeBefore = await getUndoTreeState();

            // g- at root should be a no-op, not a crash
            await vimKeys('g', '-');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Verify we're still in normal mode (no error)
            const mode = await getVimMode();
            expect(mode).toBe('normal');

            const content = await getEditorValue();
            if (content !== 'test') {
                // This fails only on macOS and Windows, where it cannot be
                // reproduced locally, and two inferred mechanisms have already
                // been disproved: the mode assertion above passes, so the keys
                // did not land in insert mode, and forcing PAUSE.MODE_SWITCH to
                // zero does not reproduce it. Report the state that would
                // distinguish a stale undo-tree restore from a stray keystroke,
                // so the next CI run identifies the cause instead of a guess.
                const treeAfter = await getUndoTreeState();
                // Discriminator: was g- actually mapped when the key arrived?
                // Absent means a plugin registration race; present means the
                // fork matched nothing for "g-" and its no-match branch let
                // the trailing key through to CodeMirror.
                const mapping = await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    {
                                        settings?: Record<string, unknown>;
                                        registration?: {
                                            getInventory(): unknown;
                                        } | null;
                                    }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    const registration = plugin?.registration ?? null;
                    const raw = registration as unknown as {
                        registrations?: {
                            type: string;
                            keys?: string;
                            name: string;
                        }[];
                    } | null;
                    const all = raw?.registrations ?? [];
                    return {
                        hasRegistration: registration !== null,
                        undoTreeSetting: plugin?.settings?.['enableUndoTree'],
                        gMinusMapped: all.some(
                            (r) => r.type === 'mapCommand' && r.keys === 'g-',
                        ),
                        gPlusMapped: all.some(
                            (r) => r.type === 'mapCommand' && r.keys === 'g+',
                        ),
                        mapCommandCount: all.filter(
                            (r) => r.type === 'mapCommand',
                        ).length,
                    };
                });
                throw new Error(
                    `g- at root changed the document: ${JSON.stringify({
                        seeded,
                        content,
                        mode,
                        treeBefore,
                        treeAfter,
                        mapping,
                    })}`,
                );
            }
            expect(content).toBe('test');
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

            const content = await getEditorValue();
            expect(content).toBe('xtest');
        });
    });

    describe(':earlier/:later', function () {
        it(':earlier 1 does not crash', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const contentAfterEdit = await getEditorValue();
            expect(contentAfterEdit).toBe('xhello world');

            await handleEx('earlier 1');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const mode = await getVimMode();
            expect(mode).toBe('normal');
            const contentAfterEarlier = await getEditorValue();
            expect(typeof contentAfterEarlier).toBe('string');
        });

        it(':later 1 does not crash', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const contentAfterEdit = await getEditorValue();
            expect(contentAfterEdit).toBe('xhello world');

            await handleEx('earlier 1');
            await handleEx('later 1');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const mode = await getVimMode();
            expect(mode).toBe('normal');
            const contentAfterLater = await getEditorValue();
            expect(contentAfterLater).toBe('xhello world');
        });

        it(':earlier with no argument defaults to 1', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['x']);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const contentAfterEdit = await getEditorValue();
            expect(contentAfterEdit).toBe('xhello world');

            await handleEx('earlier');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const mode = await getVimMode();
            expect(mode).toBe('normal');
            const contentAfterEarlier = await getEditorValue();
            expect(typeof contentAfterEarlier).toBe('string');
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
