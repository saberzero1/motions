import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE } from '../helpers';

const ROOT = 'File Explorer Navigation';
const ALPHA = `${ROOT}/Alpha.md`;
const BETA = `${ROOT}/Beta.md`;
const GAMMA = `${ROOT}/Gamma.md`;
const DELTA = `${ROOT}/Delta.md`;

async function focusExplorerLeafAndReadSelection(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) return '';

        app.workspace.setActiveLeaf(leaf, { focus: true });
        const focusedItem = leaf.view.containerEl.querySelector<HTMLElement>(
            '.tree-item-self.has-focus[data-path]',
        );
        return focusedItem?.dataset.path ?? '';
    })) as string;
}

async function getFocusedExplorerPath(): Promise<string> {
    return (await browser.executeObsidian(() => {
        return (
            document.querySelector<HTMLElement>(
                '.tree-item-self.has-focus[data-path]',
            )?.dataset.path ?? ''
        );
    })) as string;
}

async function isFolderCollapsed(path: string): Promise<boolean | null> {
    return (await browser.executeObsidian((_ctx, targetPath: string) => {
        const title = Array.from(
            document.querySelectorAll<HTMLElement>(
                '.nav-folder-title[data-path]',
            ),
        ).find((candidate) => candidate.dataset.path === targetPath);
        const folder = title?.closest('.nav-folder');
        return folder ? folder.classList.contains('is-collapsed') : null;
    }, path)) as boolean | null;
}

async function revealExplorerFile(path: string): Promise<void> {
    await obsidianPage.openFile(path);
    await browser.executeObsidian(({ app }) => {
        app.commands.executeCommandById('file-explorer:reveal-active-file');
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await browser.waitUntil(
        async () => (await focusExplorerLeafAndReadSelection()) === path,
        { timeout: 5000, interval: 100 },
    );
    await browser.$('.tree-item-self.has-focus[data-path]').click();
}

describe('File explorer vim navigation', function () {
    beforeEach(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.write(ALPHA, 'alpha');
        await obsidianPage.write(BETA, 'beta');
        await obsidianPage.write(GAMMA, 'gamma');
        await obsidianPage.write(DELTA, 'delta');
        await browser.executeObsidian(async ({ app }) => {
            await app.workspace.ensureSideLeaf('file-explorer', 'left', {
                active: true,
                reveal: true,
            });
        });
        await revealExplorerFile(ALPHA);
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }, rootPath: string) => {
            const root = app.vault.getAbstractFileByPath(rootPath);
            if (root) await app.vault.delete(root, true);
        }, ROOT);
    });

    it('uses j to move to the next visible file row', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys(['j']);
        await browser.waitUntil(
            async () => (await getFocusedExplorerPath()) === BETA,
        );
        await expect(await getFocusedExplorerPath()).toBe(BETA);
    });

    it('uses k to move to the previous visible file row', async function () {
        await revealExplorerFile(BETA);
        await browser.keys(['k']);
        await browser.waitUntil(
            async () => (await getFocusedExplorerPath()) === ALPHA,
        );
        await expect(await getFocusedExplorerPath()).toBe(ALPHA);
    });

    it('uses h to select the parent and collapse it', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys(['h']);
        await browser.keys(['h']);
        await browser.waitUntil(async () => isFolderCollapsed(ROOT));
        await expect(await isFolderCollapsed(ROOT)).toBe(true);
    });

    it('uses l to expand the selected folder', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys(['ArrowLeft']);
        await browser.keys(['ArrowLeft']);
        await browser.waitUntil(async () => isFolderCollapsed(ROOT), {
            timeout: 2000,
            interval: 50,
        });
        await browser.keys(['l']);
        await browser.waitUntil(async () => !(await isFolderCollapsed(ROOT)));
        await expect(await isFolderCollapsed(ROOT)).toBe(false);
    });

    it('keeps typed navigation letters in the rename control', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys(['F2']);
        await browser.waitUntil(async () =>
            browser.execute(() =>
                Boolean(
                    document.activeElement?.closest<HTMLElement>(
                        '.nav-file-title-content',
                    )?.isContentEditable,
                ),
            ),
        );

        await browser.keys(['j', 'k', 'h', 'l']);
        const renameText = await browser.execute(
            () => document.activeElement?.textContent ?? '',
        );
        await expect(renameText).toContain('jkhl');
        await browser.keys(['Escape']);
    });

    it('keeps the explorer row unchanged for the <C-w>h pane chord', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys([Key.Control, 'w']);
        await browser.keys(['h']);

        await expect(await getFocusedExplorerPath()).toBe(ALPHA);
        await expect(await isFolderCollapsed(ROOT)).toBe(false);
    });

    it('moves three rows for 3j', async function () {
        await revealExplorerFile(ALPHA);
        await browser.keys(['3']);
        await browser.keys(['j']);

        await browser.waitUntil(
            async () => (await getFocusedExplorerPath()) !== ALPHA,
        );
        await expect(await getFocusedExplorerPath()).toBe(GAMMA);
    });
});
