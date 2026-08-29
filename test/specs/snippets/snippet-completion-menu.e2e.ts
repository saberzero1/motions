import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureLivePreview, PAUSE, setupEditor, vimKeys } from '../../helpers';

async function isCompletionMenuVisible(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const tooltip = document.querySelector(
            '.cm-tooltip-autocomplete',
        ) as HTMLElement | null;
        if (!tooltip) return false;
        const rect = tooltip.getBoundingClientRect();
        return rect.top > -1000 && rect.height > 0;
    })) as boolean;
}

async function typeSnippetPrefix(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function dismissCompletionMenu(): Promise<void> {
    await vimKeys('Escape');
    await browser.pause(PAUSE.MODE_SWITCH);
}

async function deleteIfExists(name: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, path: string) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.delete(existing);
    }, name);
}

async function createAndOpenNewFile(name: string): Promise<void> {
    await deleteIfExists(name);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.executeObsidian(async ({ app }, path: string) => {
        await app.vault.create(path, '');
    }, name);
    await obsidianPage.openFile(name);
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await ensureLivePreview();
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (view) view.editor.focus();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Snippet completion menu visibility (#151)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    afterEach(async function () {
        await dismissCompletionMenu();
    });

    it('should show completion menu on line 1 of a newly created file (#151)', async function () {
        const filename = 'snippet-test-151.md';
        try {
            await createAndOpenNewFile(filename);
            await typeSnippetPrefix('h1');

            const visible = await isCompletionMenuVisible();
            expect(visible).toBe(true);
        } finally {
            await deleteIfExists(filename);
        }
    });

    it('should show completion menu on line 4 (control test)', async function () {
        await setupEditor('\n\n\n', { line: 3, ch: 0 });
        await typeSnippetPrefix('h1');

        const visible = await isCompletionMenuVisible();
        expect(visible).toBe(true);
    });
});
