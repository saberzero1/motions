import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    loadSingleFileWorkspace,
} from '../../helpers';

type VimAdapter = {
    CodeMirrorAdapter?: {
        Vim?: {
            handleKey: (cm: unknown, key: string) => boolean;
            handleEx: (cm: unknown, input: string) => void;
        };
    };
};

type VimResult = { success: true } | { error: string };

async function handleVimKey(key: string): Promise<VimResult> {
    return (await browser.executeObsidian(({ app, obsidian }, k: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & VimAdapter
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, k);
            return { success: true as const };
        } catch (e) {
            return { error: String(e) };
        }
    }, key)) as VimResult;
}

async function handleVimKeys(...keys: string[]): Promise<VimResult> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, keyList: string[]) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & VimAdapter
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                for (const k of keyList) {
                    Vim.handleKey(adapter, k);
                }
                return { success: true as const };
            } catch (e) {
                return { error: String(e) };
            }
        },
        keys,
    )) as VimResult;
}

async function getActiveFilePath(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        return app.workspace.getActiveFile()?.path ?? '';
    })) as string;
}

async function countRootLeaves(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        let count = 0;
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.getRoot() === app.workspace.rootSplit) count++;
        });
        return count;
    })) as number;
}

async function getActiveLeafId(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        return (
            ((leaf as unknown as Record<string, unknown>)?.id as string) ?? ''
        );
    })) as string;
}

async function splitVertical(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (window as unknown as Record<string, unknown> & VimAdapter)
            .CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleEx(adapter, 'vsplit');
    });
    await browser.pause(500);
}

async function closeOtherPanes(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (window as unknown as Record<string, unknown> & VimAdapter)
            .CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleEx(adapter, 'only');
    });
    await browser.pause(300);
}

async function focusActiveEditor(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (view) view.editor.focus();
    });
    await browser.pause(300);
}

describe('Link navigation and window cycling', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(100);
    });

    describe('Ctrl-^ / Ctrl-6 (alternate file)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('should switch to alternate file after opening two files', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            await obsidianPage.openFile('Target.md');
            await browser.pause(300);
            await focusActiveEditor();

            const beforePath = await getActiveFilePath();
            expect(beforePath).toBe('Target.md');

            const result = await handleVimKey('<C-6>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const afterPath = await getActiveFilePath();
            expect(afterPath).toBe('Welcome.md');
        });

        it('should toggle back to previous file on second Ctrl-6', async function () {
            await focusActiveEditor();

            const beforePath = await getActiveFilePath();
            expect(beforePath).toBe('Welcome.md');

            const result = await handleVimKey('<C-6>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const afterPath = await getActiveFilePath();
            expect(afterPath).toBe('Target.md');
        });

        it('should not error with only one file ever opened', async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await loadSingleFileWorkspace('Welcome.md');
            await focusActiveEditor();

            const result = await handleVimKey('<C-6>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            const path = await getActiveFilePath();
            expect(path).toBe('Welcome.md');
        });
    });

    describe('Ctrl-] (follow link)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('should follow a wikilink under the cursor', async function () {
            await setupEditor('Go to [[Target]] for more info.', {
                line: 0,
                ch: 8,
            });

            const result = await handleVimKey('<C-]>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const path = await getActiveFilePath();
            expect(path).toBe('Target.md');
        });

        it('should not error when cursor is on plain text', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            await setupEditor('No links here at all.', { line: 0, ch: 0 });

            const result = await handleVimKey('<C-]>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
        });
    });

    describe('Ctrl-T (jump back)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('should return to original file after Ctrl-] navigation', async function () {
            await setupEditor('Go to [[Target]] for info.', { line: 0, ch: 8 });

            const beforePath = await getActiveFilePath();
            expect(beforePath).toBe('Welcome.md');

            const followResult = await handleVimKey('<C-]>');
            expect(followResult).toHaveProperty('success', true);
            await browser.pause(500);

            const linkedPath = await getActiveFilePath();
            expect(linkedPath).toBe('Target.md');

            await focusActiveEditor();

            const backResult = await handleVimKey('<C-t>');
            expect(backResult).toHaveProperty('success', true);
            await browser.pause(500);

            const afterPath = await getActiveFilePath();
            expect(afterPath).toBe('Welcome.md');
        });

        it('should not error with no prior navigation', async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await loadSingleFileWorkspace('Welcome.md');
            await focusActiveEditor();

            const result = await handleVimKey('<C-t>');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            const path = await getActiveFilePath();
            expect(path).toBe('Welcome.md');
        });
    });

    describe('Ctrl-W w (cycle next pane)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('should cycle focus to the next pane', async function () {
            await closeOtherPanes();
            await splitVertical();

            const leafCount = await countRootLeaves();
            expect(leafCount).toBeGreaterThanOrEqual(2);

            const beforeLeafId = await getActiveLeafId();

            const result = await handleVimKeys('<C-w>', 'w');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            const afterLeafId = await getActiveLeafId();
            expect(afterLeafId).not.toBe(beforeLeafId);
        });

        it('should not error with single pane', async function () {
            await closeOtherPanes();
            await browser.pause(300);

            const leafCount = await countRootLeaves();
            expect(leafCount).toBe(1);

            const result = await handleVimKeys('<C-w>', 'w');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
        });
    });

    describe('Ctrl-W W (cycle previous pane)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('should cycle focus backward through panes', async function () {
            await closeOtherPanes();
            await splitVertical();

            const leafCount = await countRootLeaves();
            expect(leafCount).toBeGreaterThanOrEqual(2);

            const beforeLeafId = await getActiveLeafId();

            const result = await handleVimKeys('<C-w>', 'W');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            const afterLeafId = await getActiveLeafId();
            expect(afterLeafId).not.toBe(beforeLeafId);
        });

        it('should not error with single pane', async function () {
            await closeOtherPanes();
            await browser.pause(300);

            const result = await handleVimKeys('<C-w>', 'W');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
        });
    });

    describe('Ctrl-W p (previous pane)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
        });

        it('[crash-guard] should not error when switching to previous pane', async function () {
            await closeOtherPanes();
            await splitVertical();

            const leafCount = await countRootLeaves();
            expect(leafCount).toBeGreaterThanOrEqual(2);

            const cycleResult = await handleVimKeys('<C-w>', 'w');
            expect(cycleResult).toHaveProperty('success', true);
            await browser.pause(500);

            const result = await handleVimKeys('<C-w>', 'p');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            const afterLeafId = await getActiveLeafId();
            expect(afterLeafId.length).toBeGreaterThan(0);
        });

        it('should not error with single pane', async function () {
            await closeOtherPanes();
            await browser.pause(300);

            const result = await handleVimKeys('<C-w>', 'p');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
        });
    });
});
