import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, sendVimEscape } from '../helpers';

type PluginRef = {
    isAnyViewComposingForTest?: () => boolean;
};

function getPlugin(): string {
    return `(app as unknown as {
        plugins: { plugins: Record<string, unknown> };
    }).plugins.plugins['vim-motions']`;
}

async function loadSplitWorkspace(): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'split-root',
            type: 'split',
            direction: 'vertical',
            children: [
                {
                    id: 'left-tabs',
                    type: 'tabs',
                    children: [
                        {
                            id: 'left-leaf',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: {
                                    file: 'Welcome.md',
                                    mode: 'source',
                                },
                            },
                        },
                    ],
                },
                {
                    id: 'right-tabs',
                    type: 'tabs',
                    children: [
                        {
                            id: 'right-leaf',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: {
                                    file: 'Welcome.md',
                                    mode: 'source',
                                },
                            },
                        },
                    ],
                },
            ],
        },
        active: 'left-leaf',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function isAnyViewComposing(): Promise<boolean> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.isAnyViewComposingForTest?.() ?? false;
    })) as boolean;
}

async function dispatchCompositionEvent(
    leafId: string,
    eventType: 'compositionstart' | 'compositionend',
): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app }, id: string, type: string) => {
            let targetLeaf: unknown = null;
            app.workspace.iterateAllLeaves((leaf: unknown) => {
                const l = leaf as { id?: string };
                if (l.id === id) targetLeaf = leaf;
            });
            if (!targetLeaf) return false;

            const view = (targetLeaf as { view?: unknown }).view;
            if (!view) return false;
            const editor = (view as { editor?: unknown }).editor;
            if (!editor) return false;
            const cm = (editor as { cm?: { scrollDOM?: HTMLElement } }).cm;
            if (!cm?.scrollDOM) return false;

            cm.scrollDOM.dispatchEvent(
                new CompositionEvent(type, { bubbles: true }),
            );
            return true;
        },
        leafId,
        eventType,
    )) as boolean;
}

describe('IME composition tracking across views', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    beforeEach(async function () {
        await loadSplitWorkspace();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('should detect composition on the active editor', async function () {
        expect(await isAnyViewComposing()).toBe(false);

        const dispatched = await dispatchCompositionEvent(
            'left-leaf',
            'compositionstart',
        );
        expect(dispatched).toBe(true);
        expect(await isAnyViewComposing()).toBe(true);

        await dispatchCompositionEvent('left-leaf', 'compositionend');
        expect(await isAnyViewComposing()).toBe(false);
    });

    it('should detect composition on a non-active editor', async function () {
        expect(await isAnyViewComposing()).toBe(false);

        const dispatched = await dispatchCompositionEvent(
            'right-leaf',
            'compositionstart',
        );
        expect(dispatched).toBe(true);
        expect(await isAnyViewComposing()).toBe(true);

        await dispatchCompositionEvent('right-leaf', 'compositionend');
        expect(await isAnyViewComposing()).toBe(false);
    });

    it('should track composition independently per view', async function () {
        await dispatchCompositionEvent('left-leaf', 'compositionstart');
        await dispatchCompositionEvent('right-leaf', 'compositionstart');
        expect(await isAnyViewComposing()).toBe(true);

        await dispatchCompositionEvent('left-leaf', 'compositionend');
        expect(await isAnyViewComposing()).toBe(true);

        await dispatchCompositionEvent('right-leaf', 'compositionend');
        expect(await isAnyViewComposing()).toBe(false);
    });
});

async function getVimModeForLeaf(leafId: string): Promise<string> {
    return (await browser.executeObsidian(({ app }, id: string) => {
        let targetLeaf: unknown = null;
        app.workspace.iterateAllLeaves((leaf: unknown) => {
            const l = leaf as { id?: string };
            if (l.id === id) targetLeaf = leaf;
        });
        if (!targetLeaf) return 'not-found';

        const view = (targetLeaf as { view?: unknown }).view;
        if (!view) return 'no-view';
        const editor = (view as { editor?: unknown }).editor;
        if (!editor) return 'no-editor';
        const editorView = (editor as { cm?: unknown }).cm as
            | Record<string, unknown>
            | undefined;
        if (!editorView) return 'no-cm';

        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: { handleKey: (cm: unknown, key: string) => boolean };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return 'no-vim';

        const adapter = editorView.cm as Record<string, unknown> | undefined;
        if (!adapter) return 'no-adapter';
        const vim = (adapter.state as Record<string, unknown> | undefined)
            ?.vim as Record<string, unknown> | undefined;
        if (!vim) return 'no-vim-state';

        if (vim.insertMode) return 'insert';
        if (vim.visualMode) return 'visual';
        return 'normal';
    }, leafId)) as string;
}

async function handleKeyOnLeaf(leafId: string, key: string): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app }, id: string, k: string) => {
            let targetLeaf: unknown = null;
            app.workspace.iterateAllLeaves((leaf: unknown) => {
                const l = leaf as { id?: string };
                if (l.id === id) targetLeaf = leaf;
            });
            if (!targetLeaf) return false;

            const view = (targetLeaf as { view?: unknown }).view;
            if (!view) return false;
            const editor = (view as { editor?: unknown }).editor;
            if (!editor) return false;
            const editorView = (editor as { cm?: unknown }).cm as
                | Record<string, unknown>
                | undefined;
            if (!editorView) return false;

            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;

            const adapter = editorView.cm;
            if (!adapter) return false;
            return Vim.handleKey(adapter, k);
        },
        leafId,
        key,
    )) as boolean;
}

describe('IME mode watcher across views', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    beforeEach(async function () {
        await loadSplitWorkspace();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('should detect insert mode on the non-active editor', async function () {
        const beforeMode = await getVimModeForLeaf('right-leaf');
        expect(beforeMode).toBe('normal');

        const handled = await handleKeyOnLeaf('right-leaf', 'i');
        expect(handled).toBe(true);
        await browser.pause(PAUSE.MODE_SWITCH);

        const afterMode = await getVimModeForLeaf('right-leaf');
        expect(afterMode).toBe('insert');

        await handleKeyOnLeaf('right-leaf', '<Esc>');
        await browser.pause(PAUSE.MODE_SWITCH);

        const finalMode = await getVimModeForLeaf('right-leaf');
        expect(finalMode).toBe('normal');
    });
});
