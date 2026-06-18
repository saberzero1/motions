import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 16: CM Vim Ex command conflicts and getLeaf behavior', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should check if CM Vim handles :e natively', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
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
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };

                view.editor.setValue('test content');
                view.editor.focus();
                Vim.handleEx(adapter, 'e nonexistent.md');
                return { success: true, handled: true };
            } catch (e) {
                return { error: String(e), handled: false };
            }
        });
        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(':e conflict check:', JSON.stringify(result));
        expect(result).toHaveProperty('handled');
    });

    it('should check if CM Vim handles :sp natively', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
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
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                view.editor.focus();
                Vim.handleEx(adapter, 'sp');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(':sp conflict check:', JSON.stringify(result));
        expect(typeof result).toBe('object');
    });

    it('should check getLeaf(true) behavior', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const beforeCount = { markdown: 0, total: 0 };
            app.workspace.iterateAllLeaves(() => {
                beforeCount.total++;
            });
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown')
                    beforeCount.markdown++;
            });

            const newLeaf = app.workspace.getLeaf(true);

            const afterCount = { markdown: 0, total: 0 };
            app.workspace.iterateAllLeaves(() => {
                afterCount.total++;
            });
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown')
                    afterCount.markdown++;
            });

            return {
                beforeTotal: beforeCount.total,
                afterTotal: afterCount.total,
                newLeafCreated: afterCount.total > beforeCount.total,
                newLeafType: newLeaf?.view?.getViewType() ?? 'unknown',
            };
        });
        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('getLeaf(true) behavior:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('newLeafCreated');
    });
});
