import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    PAUSE,
    focusEditor,
    sendVimEscape,
    setWhichKeyMode,
    hasWhichKeyOverlay,
    getWhichKeyKeys,
    getWhichKeyTitle,
} from '../../helpers';

/**
 * Spike 25: Which-key + Oil interaction issues
 *
 * Reproduces two related problems:
 *
 * 1. Which-key "all" mode intercepts multi-key Oil bindings (g?, g., gs, gf).
 *    When which-key is set to "All partial keys" mode, pressing `g` in Oil
 *    triggers the which-key overlay. The second keystroke (?, ., s, f) may be
 *    consumed by the overlay's group navigation rather than completing the
 *    vim keybinding.
 *
 * 2. Which-key and g? don't work when Oil is opened from a non-editor context.
 *    WhichKeyOverlay.tryAttach() looks for MarkdownView first; when no editor
 *    exists, the adapter attachment may fail, leaving which-key non-functional
 *    even after Oil opens its embedded editor.
 */

type OilEditorView = {
    state: {
        doc: {
            length: number;
            lines: number;
            toString: () => string;
        };
    };
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

async function isOilViewActive(): Promise<boolean> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        return leaf?.view?.getViewType() === 'oil-explorer';
    })) as boolean;
}

async function getOilVimMode(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return 'not-oil';
        const editorView = (
            leaf.view as unknown as {
                getEditorView?: () => {
                    cm?: {
                        state?: { vim?: Record<string, unknown> };
                    };
                };
            }
        ).getEditorView?.();
        const vim = editorView?.cm?.state?.vim;
        if (!vim) return 'no-vim-state';
        if (vim.insertMode) return 'insert';
        if (vim.visualMode) return 'visual';
        return 'normal';
    })) as string;
}

describe('Spike 25: Which-key + Oil interaction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(200);
    });

    after(async function () {
        await cleanupOilViews();
        await setWhichKeyMode('off');
    });

    // =========================================================================
    // Issue 1: Which-key "all" mode intercepts Oil g-prefix bindings
    // =========================================================================
    describe('Issue 1: g-prefix interception in Oil with which-key "all" mode', function () {
        before(async function () {
            await setWhichKeyMode('all');
        });

        after(async function () {
            await cleanupOilViews();
        });

        it('should verify Oil opens and has vim state', async function () {
            await openOilAndWait('');
            await focusOilEditor();
            expect(await isOilViewActive()).toBe(true);
            const mode = await getOilVimMode();
            console.log('Oil vim mode:', mode);
            // Oil should have a vim state (normal mode)
            expect(mode).toBe('normal');
        });

        it('should detect whether g key triggers which-key overlay in Oil', async function () {
            await openOilAndWait('');
            await focusOilEditor();
            expect(await isOilViewActive()).toBe(true);

            // Press g — in "all" mode, which-key should show g-completions
            await browser.keys(['g']);
            // Wait longer than the default showDelay (500ms)
            await browser.pause(700);

            const overlayVisible = await hasWhichKeyOverlay();
            console.log(
                'Which-key overlay visible after g in Oil:',
                overlayVisible,
            );

            if (overlayVisible) {
                const keys = await getWhichKeyKeys();
                const title = await getWhichKeyTitle();
                console.log('Which-key title:', title);
                console.log('Which-key keys:', JSON.stringify(keys));
                console.log(
                    'BUG CONFIRMED: Which-key overlay appeared in Oil on g press.',
                    'This will intercept g?, g., gs, gf second keystrokes.',
                );
            } else {
                console.log(
                    'Which-key overlay did NOT appear — g-prefix may not be intercepted.',
                );
            }

            await sendVimEscape();
        });

        it('should test g? binding in Oil with which-key "all" mode', async function () {
            await openOilAndWait('');
            await focusOilEditor();
            expect(await isOilViewActive()).toBe(true);

            // Check if a help modal appears when typing g?
            // First, send g then ? with a gap
            await browser.keys(['g']);
            await browser.pause(100); // Short gap — user types fast
            await browser.keys(['?']);
            await browser.pause(500);

            // Check if the Oil help modal appeared
            const helpModalVisible = await browser.executeObsidian(() => {
                return !!document.querySelector('.modal-container .modal');
            });
            console.log('Oil help modal visible after g?:', helpModalVisible);

            // Check if which-key overlay is still visible (stale)
            const whichKeyStillVisible = await hasWhichKeyOverlay();
            console.log(
                'Which-key overlay still visible after g?:',
                whichKeyStillVisible,
            );

            if (!helpModalVisible) {
                console.log(
                    'BUG CONFIRMED: g? did not open Oil help modal.',
                    'The which-key overlay likely consumed the ? keystroke.',
                );
            }

            // Dismiss any modal
            await sendVimEscape();
            await browser.pause(200);
        });

        it('should test g? binding in Oil with which-key "all" mode and zero delay', async function () {
            // Set popup delay to 0 for immediate overlay
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    reloadFeatures: () => void;
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin) return;
                plugin.settings.whichKeyDelay = 0;
                plugin.reloadFeatures();
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await openOilAndWait('');
            await focusOilEditor();

            // With zero delay, the overlay should appear immediately on g
            await browser.keys(['g']);
            await browser.pause(100);

            const overlayAfterG = await hasWhichKeyOverlay();
            console.log(
                'Overlay visible immediately after g (delay=0):',
                overlayAfterG,
            );

            await browser.keys(['?']);
            await browser.pause(500);

            const helpModalVisible = await browser.executeObsidian(() => {
                return !!document.querySelector('.modal-container .modal');
            });
            console.log(
                'Oil help modal after g? with delay=0:',
                helpModalVisible,
            );

            if (overlayAfterG && !helpModalVisible) {
                console.log(
                    'BUG CONFIRMED: Zero-delay which-key intercepts g? in Oil.',
                );
            }

            // Restore default delay
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    reloadFeatures: () => void;
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin) return;
                plugin.settings.whichKeyDelay = 500;
                plugin.reloadFeatures();
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
            await sendVimEscape();
        });

        it('should verify g? works in Oil with which-key "leader" mode (control)', async function () {
            await setWhichKeyMode('leader');
            await openOilAndWait('');
            await focusOilEditor();
            expect(await isOilViewActive()).toBe(true);

            await browser.keys(['g']);
            await browser.pause(100);
            await browser.keys(['?']);
            await browser.pause(500);

            const helpModalVisible = await browser.executeObsidian(() => {
                return !!document.querySelector('.modal-container .modal');
            });
            console.log(
                'Oil help modal with which-key "leader" mode:',
                helpModalVisible,
            );

            // In "leader" mode, which-key only activates on leader key.
            // g? should work normally.
            // This is the control case — if it ALSO fails here, the problem
            // is not which-key but something else in Oil keybinding dispatch.

            await sendVimEscape();
            await setWhichKeyMode('all'); // Restore for other tests
        });
    });

    // =========================================================================
    // Issue 2: Which-key fails when Oil opened from non-editor context
    // =========================================================================
    describe('Issue 2: Which-key attachment when Oil opened without prior editor', function () {
        it('should test which-key adapter attachment with Oil as only view', async function () {
            // Close ALL leaves to create a non-editor context
            await browser.executeObsidian(({ app }) => {
                app.workspace.iterateAllLeaves((leaf) => {
                    leaf.detach();
                });
            });
            await browser.pause(500);

            // Now open Oil — there's no prior MarkdownView
            await openOilAndWait('');
            await focusOilEditor();

            const isOil = await isOilViewActive();
            console.log('Oil is active after opening from empty state:', isOil);

            // Check if which-key has a valid adapter
            const adapterStatus = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { whichKeyOverlay?: { lastAdapter?: unknown } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return {
                    hasOverlay: !!plugin?.whichKeyOverlay,
                    hasAdapter: !!(
                        plugin?.whichKeyOverlay as { lastAdapter?: unknown }
                    )?.lastAdapter,
                };
            });
            console.log(
                'Which-key adapter status:',
                JSON.stringify(adapterStatus),
            );

            if (!adapterStatus.hasAdapter) {
                console.log(
                    'BUG CONFIRMED: Which-key has no adapter when Oil is the only view.',
                    'tryAttach() failed because no MarkdownView exists.',
                );
            }

            // Try to trigger leader which-key
            await setWhichKeyMode('leader');
            await browser.keys(['\\']);
            await browser.pause(700);

            const overlayVisible = await hasWhichKeyOverlay();
            console.log(
                'Which-key overlay after leader key in Oil-only state:',
                overlayVisible,
            );

            await sendVimEscape();
        });

        it('should verify which-key works after opening a file alongside Oil', async function () {
            // Open a markdown file alongside the Oil view
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(500);

            // Switch back to Oil
            await browser.executeObsidian(({ app }) => {
                app.workspace.iterateAllLeaves((leaf) => {
                    if (leaf.view?.getViewType() === 'oil-explorer') {
                        app.workspace.setActiveLeaf(leaf, { focus: true });
                    }
                });
            });
            await browser.pause(500);
            await focusOilEditor();

            const adapterStatus = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { whichKeyOverlay?: { lastAdapter?: unknown } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return {
                    hasAdapter: !!(
                        plugin?.whichKeyOverlay as { lastAdapter?: unknown }
                    )?.lastAdapter,
                };
            });
            console.log(
                'Which-key adapter after opening file alongside Oil:',
                JSON.stringify(adapterStatus),
            );

            // This should work — MarkdownView was opened, giving tryAttach()
            // a valid adapter via getCmAdapter(mdView)
            await sendVimEscape();
        });
    });
});
