import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../../helpers';

type OilEditorView = {
    cm?: Record<string, unknown>;
    focus?: () => void;
};

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
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Spike: Oil global context isolation', function () {
    afterEach(async function () {
        await browser.executeObsidian(({ app }) => {
            const modal = activeDocument.querySelector('.modal-container');
            if (modal) (modal as HTMLElement).click();
        });
        await browser.pause(200);
        await cleanupOilViews();
    });

    describe('Oil opened from editor context (control group)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it('which-key works after :Oil from editor', async function () {
            await browser.executeObsidian(async ({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleEx(adapter, 'Oil');
            });
            await browser.pause(1500);
            await focusOilEditor();

            await browser.keys(['g']);
            await browser.pause(600);

            const result = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                const container =
                    leaf?.view?.getViewType() === 'oil-explorer'
                        ? leaf.view.containerEl
                        : null;
                return {
                    viewType: leaf?.view?.getViewType() ?? 'unknown',
                    whichKeyVisible: !!container?.querySelector(
                        '.vim-motions-which-key',
                    ),
                };
            })) as { viewType: string; whichKeyVisible: boolean };
            console.log('Editor context:', JSON.stringify(result));
            expect(result.viewType).toBe('oil-explorer');
            expect(result.whichKeyVisible).toBe(true);
        });

        it('g? works after :Oil from editor', async function () {
            await browser.executeObsidian(async ({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleEx(adapter, 'Oil');
            });
            await browser.pause(1500);
            await focusOilEditor();

            await browser.keys(['g']);
            await browser.pause(100);
            await browser.keys(['?']);
            await browser.pause(400);

            const result = (await browser.executeObsidian(() => {
                const modal = activeDocument.querySelector(
                    '.vim-motions-info-modal',
                );
                const modalContainer =
                    activeDocument.querySelector('.modal-container');
                return {
                    modalVisible: !!modal,
                    modalContainerVisible: !!modalContainer,
                    modalContainerContent:
                        modalContainer?.textContent?.slice(0, 100) ?? '',
                };
            })) as {
                modalVisible: boolean;
                modalContainerVisible: boolean;
                modalContainerContent: string;
            };
            console.log('g? from editor:', JSON.stringify(result));
            expect(result.modalVisible || result.modalContainerVisible).toBe(
                true,
            );
        });
    });

    describe('Oil opened from global context (the reported issue)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it('which-key works after Oil opened via oilManager.openOil (simulating global :Oil)', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                await (
                    plugin.oilManager as {
                        openOil?: (p: string) => Promise<void>;
                    }
                ).openOil?.('');
            });
            await browser.pause(1500);
            await focusOilEditor();

            await browser.keys(['g']);
            await browser.pause(600);

            const result = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                const container =
                    leaf?.view?.getViewType() === 'oil-explorer'
                        ? leaf.view.containerEl
                        : null;
                return {
                    viewType: leaf?.view?.getViewType() ?? 'unknown',
                    whichKeyVisible: !!container?.querySelector(
                        '.vim-motions-which-key',
                    ),
                };
            })) as { viewType: string; whichKeyVisible: boolean };
            console.log('Global context:', JSON.stringify(result));
            expect(result.viewType).toBe('oil-explorer');
            expect(result.whichKeyVisible).toBe(true);
        });

        it('g? works after Oil opened via oilManager.openOil (simulating global :Oil)', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                await (
                    plugin.oilManager as {
                        openOil?: (p: string) => Promise<void>;
                    }
                ).openOil?.('');
            });
            await browser.pause(1500);
            await focusOilEditor();

            await browser.keys(['g', '?']);
            await browser.pause(400);

            const result = (await browser.executeObsidian(() => {
                return {
                    modalVisible: !!activeDocument.querySelector(
                        '.vim-motions-info-modal',
                    ),
                };
            })) as { modalVisible: boolean };
            console.log('g? from global:', JSON.stringify(result));
            expect(result.modalVisible).toBe(true);
        });
    });

    describe('True global: no editor focused before Oil', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it('which-key works when Oil is opened with no prior editor focus', async function () {
            await browser.executeObsidian(async ({ app }) => {
                app.workspace.iterateAllLeaves((leaf) => {
                    if (
                        leaf.view?.getViewType() === 'markdown' ||
                        leaf.view?.getViewType() === 'empty'
                    ) {
                        leaf.detach();
                    }
                });
            });
            await browser.pause(500);

            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                await (
                    plugin.oilManager as {
                        openOil?: (p: string) => Promise<void>;
                    }
                ).openOil?.('');
            });
            await browser.pause(1500);
            await focusOilEditor();

            await browser.keys(['g']);
            await browser.pause(600);

            const result = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                const container =
                    leaf?.view?.getViewType() === 'oil-explorer'
                        ? leaf.view.containerEl
                        : null;
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, unknown>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'] as
                    | Record<string, unknown>
                    | undefined;
                const wko = plugin?.whichKeyOverlay as
                    | Record<string, unknown>
                    | undefined;

                return {
                    viewType: leaf?.view?.getViewType() ?? 'unknown',
                    whichKeyVisible: !!container?.querySelector(
                        '.vim-motions-which-key',
                    ),
                    adapterAttached: !!wko?.lastAdapter,
                };
            })) as {
                viewType: string;
                whichKeyVisible: boolean;
                adapterAttached: boolean;
            };
            console.log(
                'True global (no prior editor):',
                JSON.stringify(result),
            );
            expect(result.viewType).toBe('oil-explorer');
            expect(result.whichKeyVisible).toBe(true);
        });
    });
});
