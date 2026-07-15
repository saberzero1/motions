import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    PAUSE,
    sendVimEscape,
    setWhichKeyMode,
    hasWhichKeyOverlay,
} from '../helpers';

type OilEditorView = {
    state: { doc: { length: number; toString: () => string } };
    focus?: () => void;
};

async function openOilAndWait(dirPath?: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, dir?: string) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<string, { oilManager?: unknown }>;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        const activeDir =
            dir ??
            (() => {
                const file = app.workspace.getActiveFile();
                if (!file) return '';
                const path = file.path;
                const idx = path.lastIndexOf('/');
                return idx === -1 ? '' : path.slice(0, idx);
            })();
        if (!plugin?.oilManager) return;
        await (
            plugin.oilManager as { openOil?: (path: string) => Promise<void> }
        ).openOil?.(activeDir);
    }, dirPath);
    await browser.pause(1500);
}

async function focusOilEditor(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return;
        const editorView = (
            leaf.view as unknown as { getEditorView?: () => OilEditorView }
        ).getEditorView?.();
        editorView?.focus?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function cleanupOilViews(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view?.getViewType() === 'oil-explorer') {
                leaf.detach();
            }
        });
    });
}

async function isOilHelpModalOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.modal-container .modal');
    })) as boolean;
}

async function sendOilVimKeys(keys: string): Promise<void> {
    await browser.executeObsidian(({ app }, keyStr: string) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return;
        const editorView = (
            leaf.view as unknown as {
                getEditorView?: () => { cm?: unknown };
            }
        ).getEditorView?.();
        const adapter = editorView?.cm;
        if (!adapter) return;
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        for (const ch of keyStr) {
            Vim.handleKey(adapter, ch);
        }
    }, keys);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Oil: which-key interaction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setWhichKeyMode('all');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(200);
    });

    after(async function () {
        await cleanupOilViews();
        await setWhichKeyMode('off');
    });

    it('g? via handleKey should open Oil help modal with which-key "all" mode', async function () {
        await openOilAndWait('');
        await focusOilEditor();

        await sendOilVimKeys('g?');
        await browser.pause(300);

        const helpOpen = await isOilHelpModalOpen();
        expect(helpOpen).toBe(true);

        await sendVimEscape();
    });

    it('g. via handleKey should not be intercepted by which-key', async function () {
        await openOilAndWait('');
        await focusOilEditor();

        const beforeOverlay = await hasWhichKeyOverlay();
        await sendOilVimKeys('g.');
        await browser.pause(300);

        const afterOverlay = await hasWhichKeyOverlay();
        expect(beforeOverlay).toBe(false);
        expect(afterOverlay).toBe(false);
    });

    it('g prefix should not leave stale which-key overlay after g? completes', async function () {
        await openOilAndWait('');
        await focusOilEditor();

        await sendOilVimKeys('g?');
        await browser.pause(300);

        const helpOpen = await isOilHelpModalOpen();
        expect(helpOpen).toBe(true);

        const overlayStale = await hasWhichKeyOverlay();
        expect(overlayStale).toBe(false);

        await sendVimEscape();
    });

    it('g? should work in Oil with which-key "leader" mode (control)', async function () {
        await setWhichKeyMode('leader');
        await openOilAndWait('');
        await focusOilEditor();

        await sendOilVimKeys('g?');
        await browser.pause(300);

        const helpOpen = await isOilHelpModalOpen();
        expect(helpOpen).toBe(true);

        await sendVimEscape();
        await setWhichKeyMode('all');
    });

    // Editor-context which-key overlay behavior is tested in which-key.e2e.ts
    // (line 150: "should show overlay when g is pressed (partial key)").
    // Not duplicated here — DOM event routing after reloadFeatures() in Oil
    // tests would cause false failures (KNOWN_LIMITATIONS.md: DOM keyboard
    // events not routed after settings reload).
});
