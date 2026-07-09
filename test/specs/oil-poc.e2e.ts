import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Oil explorer - temp markdown file approach', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
    });

    it('should open oil via :Oil as a markdown file', async function () {
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
        await browser.pause(2000);

        const activeFile = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;

        const oilFileExists = (await browser.executeObsidian(({ app }) => {
            return app.vault
                .getFiles()
                .filter((f) => f.name.startsWith('oil~'))
                .map((f) => f.path);
        })) as string[];

        expect(oilFileExists.length).toBeGreaterThan(0);
        expect(activeFile).toContain('oil~');
    });

    it('oil file should be a regular markdown view', async function () {
        const viewType = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            return leaf?.view?.getViewType() ?? 'unknown';
        })) as string;

        expect(viewType).toBe('markdown');
    });

    it('oil file should contain vault file names', async function () {
        const editorContent = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return '';
                return view.editor.getValue();
            },
        )) as string;

        expect(editorContent).toContain('Welcome.md');
        expect(editorContent).toContain('Target.md');
    });

    it('oil file content should have entry IDs in source', async function () {
        const editorContent = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return '';
                return view.editor.getValue();
            },
        )) as string;

        expect(editorContent).toMatch(/^\/\d+\s+[df]\s/m);
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf) leaf.detach();
            for (const file of app.vault.getFiles()) {
                if (file.name.startsWith('oil~')) {
                    await app.vault.adapter.remove(file.path);
                }
            }
        });
    });
});
