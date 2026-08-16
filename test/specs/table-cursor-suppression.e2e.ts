import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

/**
 * Regression tests for cursor suppression state after table interaction.
 *
 * Issue #127: cursor flashes between block and bar in Normal mode after
 * interacting with a table. Root cause: table cursor guard uses
 * setCursorSuppressedForView(view, false) instead of
 * clearCursorSuppressedForView(view), leaving an explicit per-view override
 * that conflicts with the animated cursor controller's suppression.
 *
 * The bug only manifests when animated cursor is enabled (global suppression
 * is true). With animated cursor disabled, the explicit false override and
 * the global false state produce the same result, masking the bug.
 */

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

interface SuppressionState {
    suppressed: boolean | null;
    cursorOnTableLine: boolean;
}

async function getSuppressionState(): Promise<SuppressionState> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { suppressed: null, cursorOnTableLine: false };

        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const editorView = editMode?.cm as Record<string, unknown> | undefined;
        if (!editorView) return { suppressed: null, cursorOnTableLine: false };

        const cma = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    isCursorSuppressedForView?: (v: unknown) => boolean;
                };
            }
        ).CodeMirrorAdapter;

        const suppressed = cma?.isCursorSuppressedForView
            ? cma.isCursorSuppressedForView(editorView)
            : null;

        const cursor = view.editor.getCursor();
        const line = view.editor.getLine(cursor.line);
        const cursorOnTableLine = line.trimStart().startsWith('|');

        return { suppressed, cursorOnTableLine };
    })) as SuppressionState;
}

async function enableAnimatedCursor(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<
                        string,
                        {
                            settings?: Record<string, unknown>;
                            reloadFeatures?: () => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        if (plugin?.settings) {
            plugin.settings.animatedCursor = true;
        }
        plugin?.reloadFeatures?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function disableAnimatedCursor(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<
                        string,
                        {
                            settings?: Record<string, unknown>;
                            reloadFeatures?: () => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        if (plugin?.settings) {
            plugin.settings.animatedCursor = false;
        }
        plugin?.reloadFeatures?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return container.querySelector('.cm-table-widget') !== null;
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
}

describe('Cursor suppression after table interaction (#127)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await browser.executeObsidian(({ app }) => {
            const p = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (p) {
                p.settings.enableTableNav = false;
                p.saveSettings();
                p.reloadFeatures();
            }
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await enableAnimatedCursor();
    });

    after(async function () {
        await disableAnimatedCursor();
        await browser.executeObsidian(({ app }) => {
            const p = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (p) {
                p.settings.enableTableNav = true;
                p.saveSettings();
                p.reloadFeatures();
            }
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    beforeEach(async function () {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await waitForTableWidget();
    });

    it('cursor is suppressed on non-table line before any table interaction', async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getSuppressionState();
        expect(state.suppressed).not.toBeNull();
        expect(state.cursorOnTableLine).toBe(false);
        // Animated cursor enabled → global suppression is true.
        // No table interaction yet → no per-view override → falls back to global.
        expect(state.suppressed).toBe(true);
    });

    it('cursor stays suppressed after navigating through table and out', async function () {
        await sendVimEscape();

        for (let i = 0; i < 4; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        for (let i = 0; i < 4; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getSuppressionState();
        expect(state.cursorOnTableLine).toBe(false);
        // BUG (unfixed): table guard leaves explicit false override →
        // suppressed=false instead of falling back to global true.
        expect(state.suppressed).toBe(true);
    });

    it('cursor stays suppressed after moving above table from table', async function () {
        await sendVimEscape();

        for (let i = 0; i < 4; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await sendVimEscape();
        for (let i = 0; i < 6; i++) {
            await browser.keys(['k']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getSuppressionState();
        expect(state.cursorOnTableLine).toBe(false);
        expect(state.suppressed).toBe(true);
    });

    it('cursor suppression state is stable after repeated table entry/exit', async function () {
        await sendVimEscape();

        for (let cycle = 0; cycle < 3; cycle++) {
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['g', 'g']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }

        const state = await getSuppressionState();
        expect(state.cursorOnTableLine).toBe(false);
        expect(state.suppressed).toBe(true);
    });

    it('cursor stays suppressed after entering insert mode with block cursor near table', async function () {
        await sendVimEscape();

        // Move into table then back out
        for (let i = 0; i < 4; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await sendVimEscape();
        for (let i = 0; i < 6; i++) {
            await browser.keys(['k']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Enter insert mode
        await browser.keys(['i']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const insertState = await getSuppressionState();
        expect(insertState.suppressed).toBe(true);

        // Back to normal mode
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const normalState = await getSuppressionState();
        expect(normalState.suppressed).toBe(true);
    });

    it('textarea vim overlay cursor is not suppressed (#127 comment)', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins?: {
                        plugins?: Record<
                            string,
                            {
                                settings?: Record<string, unknown>;
                                reloadFeatures?: () => Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins?.plugins?.['vim-motions'];
            if (plugin?.settings) {
                plugin.settings.enableVimTextareas = true;
            }
            plugin?.reloadFeatures?.();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Inject a textarea and focus it to trigger the overlay
        await browser.executeObsidian(() => {
            const existing = document.getElementById('suppression-ta');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = 'suppression-ta-modal';
            const ta = document.createElement('textarea');
            ta.id = 'suppression-ta';
            ta.value = 'test content';
            ta.style.width = '300px';
            ta.style.height = '100px';
            modal.appendChild(ta);
            document.body.appendChild(modal);
        });
        await browser.executeObsidian(() => {
            (
                document.getElementById('suppression-ta') as HTMLTextAreaElement
            )?.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const hasOverlay = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-textarea-overlay');
        })) as boolean;

        if (hasOverlay) {
            const overlaySuppressed = (await browser.executeObsidian(() => {
                const overlay = document.querySelector(
                    '.vim-motions-textarea-overlay',
                );
                const cmEditor = overlay?.querySelector('.cm-editor');
                if (!cmEditor) return null;

                const editorView = (
                    cmEditor as unknown as Record<string, unknown>
                ).cmView as { view?: unknown } | undefined;
                const view = editorView?.view;
                if (!view) return null;

                const cma = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            isCursorSuppressedForView?: (v: unknown) => boolean;
                        };
                    }
                ).CodeMirrorAdapter;

                return cma?.isCursorSuppressedForView
                    ? cma.isCursorSuppressedForView(view)
                    : null;
            })) as boolean | null;

            // Overlay cursor must NOT be suppressed — user must see the cursor
            if (overlaySuppressed !== null) {
                expect(overlaySuppressed).toBe(false);
            }
        }

        // Cleanup
        await browser.executeObsidian(() => {
            document.getElementById('suppression-ta-modal')?.remove();
            document.getElementById('suppression-ta')?.remove();
            document
                .querySelectorAll('.vim-motions-textarea-overlay')
                .forEach((el) => el.remove());
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins?: {
                        plugins?: Record<
                            string,
                            {
                                settings?: Record<string, unknown>;
                                reloadFeatures?: () => Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins?.plugins?.['vim-motions'];
            if (plugin?.settings) {
                plugin.settings.enableVimTextareas = false;
            }
            plugin?.reloadFeatures?.();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });
});
