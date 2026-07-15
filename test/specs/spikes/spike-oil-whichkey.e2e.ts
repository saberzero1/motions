import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../../helpers';

type VimHandle = {
    handleKey: (cm: unknown, key: string) => boolean;
    handleEx: (cm: unknown, input: string) => void;
};

type OilEditorView = {
    cm?: Record<string, unknown>;
    focus?: () => void;
};

async function openOilFromEditor(): Promise<void> {
    await browser.executeObsidian(async ({ app, obsidian }) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: { Vim?: VimHandle };
            }
        ).CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleEx(adapter, 'Oil');
    });
    await browser.pause(1500);
}

async function openOilFromGlobal(): Promise<void> {
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
            plugin.oilManager as { openOil?: (p: string) => Promise<void> }
        ).openOil?.('');
    });
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
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function getWhichKeyState(): Promise<{
    adapterAttached: boolean;
    overlayVisible: boolean;
    overlayText: string;
}> {
    return (await browser.executeObsidian(({ app }) => {
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

        const leaf = app.workspace.getMostRecentLeaf();
        const container =
            leaf?.view?.getViewType() === 'oil-explorer'
                ? leaf.view.containerEl
                : null;
        const overlayEl = container?.querySelector('.vim-motions-which-key');

        return {
            adapterAttached: !!wko?.lastAdapter,
            overlayVisible: !!overlayEl,
            overlayText: overlayEl?.textContent ?? '',
        };
    })) as {
        adapterAttached: boolean;
        overlayVisible: boolean;
        overlayText: string;
    };
}

async function getOilHelpState(): Promise<{
    modalVisible: boolean;
    modalText: string;
}> {
    return (await browser.executeObsidian(({ app }) => {
        const modalEl = activeDocument.querySelector('.vim-motions-info-modal');
        return {
            modalVisible: !!modalEl,
            modalText: modalEl?.textContent ?? '',
        };
    })) as {
        modalVisible: boolean;
        modalText: string;
    };
}

async function sendVimKeysToOil(...keys: string[]): Promise<void> {
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Spike: Oil which-key behavior', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await cleanupOilViews();
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    describe('Issue 1: which-key in Oil opened from editor', function () {
        it('should attach which-key adapter when Oil opened via :Oil from editor', async function () {
            await openOilFromEditor();
            await focusOilEditor();
            const state = await getWhichKeyState();
            console.log(
                'Oil from editor — adapter attached:',
                state.adapterAttached,
            );
            expect(state.adapterAttached).toBe(true);
        });

        it('should show which-key popup when pressing g in Oil (from editor)', async function () {
            await openOilFromEditor();
            await focusOilEditor();

            const preDiag = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: { plugins?: Record<string, unknown> };
                    }
                ).plugins?.plugins?.['vim-motions'] as
                    | Record<string, unknown>
                    | undefined;
                const wko = plugin?.whichKeyOverlay as
                    | Record<string, unknown>
                    | undefined;
                const settings = plugin?.settings as
                    | Record<string, unknown>
                    | undefined;
                return {
                    whichKeyMode: settings?.whichKeyMode ?? 'unknown',
                    generalMode: wko?.generalMode ?? 'unknown',
                    lastAdapterExists: !!wko?.lastAdapter,
                    keyHandlerExists: !!wko?.keyHandler,
                    commandDoneHandlerExists: !!wko?.commandDoneHandler,
                };
            })) as Record<string, unknown>;
            console.log('Pre-g diag:', JSON.stringify(preDiag));

            await sendVimKeysToOil('g');
            await browser.pause(600);

            const postDiag = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: { plugins?: Record<string, unknown> };
                    }
                ).plugins?.plugins?.['vim-motions'] as
                    | Record<string, unknown>
                    | undefined;
                const wko = plugin?.whichKeyOverlay as
                    | Record<string, unknown>
                    | undefined;
                const leaf = app.workspace.getMostRecentLeaf();
                const container =
                    leaf?.view?.getViewType() === 'oil-explorer'
                        ? leaf.view.containerEl
                        : null;

                const adapter = wko?.lastAdapter as
                    | Record<string, unknown>
                    | undefined;
                let vimStatus = '';
                let keyBuffer = '';
                if (adapter) {
                    const vim = (adapter.state as Record<string, unknown>)
                        ?.vim as Record<string, unknown> | undefined;
                    vimStatus =
                        ((adapter as Record<string, unknown>)
                            .status as string) ?? '';
                    const ks = vim?.inputState as
                        | Record<string, unknown>
                        | undefined;
                    const kb = ks?.keyBuffer as string[] | undefined;
                    keyBuffer = kb?.join('') ?? '';
                }

                return {
                    overlayVisible: !!container?.querySelector(
                        '.vim-motions-which-key',
                    ),
                    overlayInDocument: !!document.querySelector(
                        '.vim-motions-which-key',
                    ),
                    vimStatus,
                    keyBuffer,
                    lastStatus: wko?.lastStatus ?? '',
                    pendingLeader: wko?.pendingLeader ?? false,
                };
            })) as Record<string, unknown>;
            console.log('Post-g diag:', JSON.stringify(postDiag));

            const state = await getWhichKeyState();
            console.log('Oil from editor — g pressed:', JSON.stringify(state));
            expect(state.overlayVisible).toBe(true);
        });
    });

    describe('Issue 2: which-key in Oil opened from global', function () {
        it('should attach which-key adapter when Oil opened via openOil (global)', async function () {
            await openOilFromGlobal();
            await focusOilEditor();
            const state = await getWhichKeyState();
            console.log(
                'Oil from global — adapter attached:',
                state.adapterAttached,
            );
            expect(state.adapterAttached).toBe(true);
        });

        it('should show which-key popup when pressing g in Oil (from global)', async function () {
            await openOilFromGlobal();
            await focusOilEditor();
            await sendVimKeysToOil('g');
            await browser.pause(600);
            const state = await getWhichKeyState();
            console.log('Oil from global — g pressed:', JSON.stringify(state));
            expect(state.overlayVisible).toBe(true);
        });
    });

    describe('Diagnostics: vim-keypress event', function () {
        it('check if vim-keypress fires on oil adapter', async function () {
            await openOilFromEditor();
            await focusOilEditor();

            const result = (await browser.executeObsidian(({ app }) => {
                const log: string[] = [];
                const plugin = (
                    app as unknown as {
                        plugins?: { plugins?: Record<string, unknown> };
                    }
                ).plugins?.plugins?.['vim-motions'] as
                    | Record<string, unknown>
                    | undefined;
                const wko = plugin?.whichKeyOverlay as
                    | Record<string, unknown>
                    | undefined;
                const adapter = wko?.lastAdapter as
                    | Record<string, unknown>
                    | undefined;

                if (!adapter) {
                    log.push('no adapter');
                    return log;
                }

                log.push(`adapter type: ${typeof adapter}`);
                log.push(`adapter.on type: ${typeof adapter.on}`);
                log.push(`adapter.state type: ${typeof adapter.state}`);

                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') {
                    log.push('not oil view');
                    return log;
                }

                const oilEditorView = (
                    leaf.view as unknown as {
                        getEditorView?: () => { cm?: unknown };
                    }
                ).getEditorView?.();
                const oilAdapter = oilEditorView?.cm;
                log.push(
                    `oilAdapter from getEditorView().cm: ${typeof oilAdapter}`,
                );
                log.push(`same adapter: ${adapter === oilAdapter}`);

                let keypressFired = false;
                const testHandler = () => {
                    keypressFired = true;
                };
                (adapter as { on: (event: string, fn: () => void) => void }).on(
                    'vim-keypress',
                    testHandler,
                );

                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (Vim && oilAdapter) {
                    Vim.handleKey(oilAdapter, 'j');
                    log.push(
                        `keypress fired after handleKey on oilAdapter: ${keypressFired}`,
                    );

                    keypressFired = false;
                    Vim.handleKey(adapter, 'k');
                    log.push(
                        `keypress fired after handleKey on wko adapter: ${keypressFired}`,
                    );
                }

                (
                    adapter as { off: (event: string, fn: () => void) => void }
                ).off('vim-keypress', testHandler);

                return log;
            })) as string[];

            console.log('vim-keypress diag:', JSON.stringify(result, null, 2));
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('Issue 3: g? oil help', function () {
        it('should show oil help modal when pressing g? in Oil', async function () {
            await openOilFromEditor();
            await focusOilEditor();
            await sendVimKeysToOil('g', '?');
            const state = await getOilHelpState();
            console.log('g? result:', JSON.stringify(state));
            expect(state.modalVisible).toBe(true);
        });

        it('g? help modal should contain oil keybinding descriptions', async function () {
            await openOilFromEditor();
            await focusOilEditor();
            await sendVimKeysToOil('g', '?');
            const state = await getOilHelpState();
            console.log('g? content:', JSON.stringify(state));
            expect(state.modalText).toContain('parent');
        });
    });
});
