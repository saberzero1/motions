import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Oil explorer - Phase 1', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
    });

    it('should open oil view via :Oil and show vault files', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim API' };

                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No markdown view' };

                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };

                Vim.handleEx(adapter, 'Oil');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });

        expect(result).toHaveProperty('success', true);
        await browser.pause(800);

        const viewType = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            return leaf?.view?.getViewType() ?? 'unknown';
        })) as string;

        expect(viewType).toBe('vim-motions-oil');
    });

    it('oil view should show real vault files with concealment', async function () {
        const visibleText = (await browser.executeObsidian(({ app }) => {
            const leaves = app.workspace.getLeavesOfType('vim-motions-oil');
            if (leaves.length === 0) return '';
            const container = leaves[0].view.contentEl;
            const cmContent = container.querySelector('.cm-content');
            return cmContent?.textContent ?? '';
        })) as string;

        expect(visibleText).toContain('Welcome.md');
        expect(visibleText).not.toContain('/001');
    });

    it('oil view should have CM editor', async function () {
        const hasCmEditor = (await browser.executeObsidian(({ app }) => {
            const leaves = app.workspace.getLeavesOfType('vim-motions-oil');
            if (leaves.length === 0) return false;
            const container = leaves[0].view.contentEl;
            return container.querySelector('.cm-editor') !== null;
        })) as boolean;

        expect(hasCmEditor).toBe(true);
    });

    it('oil view should list correct vault files', async function () {
        const vaultFiles = (await browser.executeObsidian(({ app }) => {
            return app.vault
                .getFiles()
                .map((f) => f.name)
                .sort();
        })) as string[];

        const oilContent = (await browser.executeObsidian(({ app }) => {
            const leaves = app.workspace.getLeavesOfType('vim-motions-oil');
            if (leaves.length === 0) return '';
            const container = leaves[0].view.contentEl;
            const cmContent = container.querySelector('.cm-content');
            return cmContent?.textContent ?? '';
        })) as string;

        for (const name of vaultFiles) {
            if (!name.startsWith('.')) {
                expect(oilContent).toContain(name);
            }
        }
    });

    after(async function () {
        await browser.executeObsidian(({ app }) => {
            const leaves = app.workspace.getLeavesOfType('vim-motions-oil');
            for (const leaf of leaves) {
                leaf.detach();
            }
        });
    });
});
