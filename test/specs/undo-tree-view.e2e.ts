import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, sendVimEscape, PAUSE } from '../helpers';

async function openSidebar(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        if (app.workspace.getLeavesOfType('undo-tree').length > 0) return;
        const leaf = app.workspace.getRightLeaf(false);
        if (leaf) {
            leaf.setViewState({ type: 'undo-tree', active: true });
            app.workspace.revealLeaf(leaf);
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function closeSidebar(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        for (const leaf of app.workspace.getLeavesOfType('undo-tree')) {
            leaf.detach();
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function isSidebarOpen(): Promise<boolean> {
    return (await browser.executeObsidian(({ app }) => {
        return app.workspace.getLeavesOfType('undo-tree').length > 0;
    })) as boolean;
}

async function getSidebarNodeCount(): Promise<number> {
    return (await browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-undo-node').length;
    })) as number;
}

async function hasCurrentMarker(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-undo-node--current');
    })) as boolean;
}

describe('Undo tree sidebar', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await closeSidebar();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('opens sidebar via workspace API', async function () {
        await openSidebar();
        expect(await isSidebarOpen()).toBe(true);
    });

    it('closes sidebar via workspace API', async function () {
        await openSidebar();
        expect(await isSidebarOpen()).toBe(true);

        await closeSidebar();
        expect(await isSidebarOpen()).toBe(false);
    });

    it('sidebar renders node rows after edits', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await vimKeys('i');
        await browser.keys(['h', 'e', 'l', 'l', 'o']);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await openSidebar();

        const count = await getSidebarNodeCount();
        expect(count).toBeGreaterThan(0);
    });

    it('sidebar marks current node', async function () {
        await setupEditor('test', { line: 0, ch: 0 });
        await vimKeys('i');
        await browser.keys(['x']);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await openSidebar();

        expect(await hasCurrentMarker()).toBe(true);
    });
});
