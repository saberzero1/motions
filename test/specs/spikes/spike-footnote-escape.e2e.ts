import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 1000, LONG: 2000 } as const;

async function ensureLivePreview(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = false;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.SETTLE * 2);
}

async function setupEditor(
    content: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, text: string, line: number, ch: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(text);
            view.editor.setCursor(line, ch);
            view.editor.focus();
        },
        content,
        cursor.line,
        cursor.ch,
    );
    await browser.pause(PAUSE.SETTLE);
}

async function sendVimEscape(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleKey(adapter, '<Esc>');
    });
}

async function hasPopover(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.popover');
    })) as boolean;
}

async function getPopoverCmEditorCount(): Promise<number> {
    return (await browser.executeObsidian(() => {
        const popover = document.querySelector('.popover');
        if (!popover) return 0;
        return popover.querySelectorAll('.cm-editor').length;
    })) as number;
}

interface PopoverCursorState {
    hasPopover: boolean;
    popoverHasCmEditor: boolean;
    popoverHasVimCursorLayer: boolean;
    popoverNativeLayerCount: number;
    popoverNativeLayersVisible: boolean;
    popoverVimLayerDisplay: string;
    popoverVimFatCursorCount: number;
    popoverCaretColor: string;
    popoverHasVimMode: boolean;
    popoverCursorSuppressed: boolean | null;
}

async function getPopoverCursorState(): Promise<PopoverCursorState> {
    return (await browser.executeObsidian(() => {
        const popover = document.querySelector('.popover');
        if (!popover)
            return {
                hasPopover: false,
                popoverHasCmEditor: false,
                popoverHasVimCursorLayer: false,
                popoverNativeLayerCount: 0,
                popoverNativeLayersVisible: false,
                popoverVimLayerDisplay: 'N/A',
                popoverVimFatCursorCount: 0,
                popoverCaretColor: 'N/A',
                popoverHasVimMode: false,
                popoverCursorSuppressed: null,
            };

        const cmEditor = popover.querySelector(
            '.cm-editor',
        ) as HTMLElement | null;
        const scrollDOM = cmEditor?.querySelector(
            '.cm-scroller',
        ) as HTMLElement | null;
        const contentDOM = cmEditor?.querySelector(
            '.cm-content',
        ) as HTMLElement | null;

        const vimLayer = scrollDOM?.querySelector(
            '.cm-vimCursorLayer',
        ) as HTMLElement | null;

        const nativeLayers = scrollDOM?.querySelectorAll(
            '.cm-cursorLayer:not(.cm-vimCursorLayer)',
        );
        const nativeLayersVisible = Array.from(nativeLayers ?? []).some(
            (el) => getComputedStyle(el as HTMLElement).display !== 'none',
        );

        const fatCursors = scrollDOM?.querySelectorAll('.cm-fat-cursor');
        const caretColor = contentDOM
            ? getComputedStyle(contentDOM).caretColor
            : 'N/A';

        const hasVimMode = scrollDOM?.classList.contains('cm-vimMode') ?? false;

        const editorView = (cmEditor as unknown as Record<string, unknown>)
            ?.cmView as { view?: unknown } | undefined;

        const cma = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    isCursorSuppressedForView?: (v: unknown) => boolean;
                };
            }
        ).CodeMirrorAdapter;

        let suppressed: boolean | null = null;
        if (editorView?.view && cma?.isCursorSuppressedForView) {
            suppressed = cma.isCursorSuppressedForView(editorView.view);
        }

        return {
            hasPopover: true,
            popoverHasCmEditor: !!cmEditor,
            popoverHasVimCursorLayer: !!vimLayer,
            popoverNativeLayerCount: nativeLayers?.length ?? 0,
            popoverNativeLayersVisible: nativeLayersVisible,
            popoverVimLayerDisplay: vimLayer
                ? getComputedStyle(vimLayer).display
                : 'not found',
            popoverVimFatCursorCount: fatCursors?.length ?? 0,
            popoverCaretColor: caretColor,
            popoverHasVimMode: hasVimMode,
            popoverCursorSuppressed: suppressed,
        };
    })) as PopoverCursorState;
}

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
};

async function setAnimatedCursor(enabled: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, value: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.animatedCursor = value;
        plugin.reloadFeatures();
    }, enabled);
    await browser.pause(PAUSE.RENDER);
}

async function dismissPopover(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const hp = (
            view as unknown as { hoverPopover?: { hide?: () => void } } | null
        )?.hoverPopover;
        if (hp?.hide) {
            hp.hide();
        } else {
            document.querySelectorAll('.popover').forEach((el) => el.remove());
        }
    });
    await browser.pause(PAUSE.SETTLE);
    // Focus back to main editor to ensure clean state
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        view?.editor?.focus();
    });
    await browser.pause(PAUSE.SETTLE);
}

describe('Spike: footnote popover Escape and cursor (#130)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    afterEach(async function () {
        await dismissPopover();
        await setAnimatedCursor(false);
    });

    it('footnote popover opens with a CM6 editor after insert-footnote', async function () {
        this.timeout(20000);

        await setupEditor('Some text for footnote testing.', {
            line: 0,
            ch: 30,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.SETTLE);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:insert-footnote');
        });
        await browser.pause(PAUSE.RENDER);

        const popoverPresent = await hasPopover();
        expect(popoverPresent).toBe(true);

        const cmCount = await getPopoverCmEditorCount();
        expect(cmCount).toBeGreaterThanOrEqual(1);

        console.log('[SPIKE] Popover has CM6 editor:', cmCount > 0);
    });

    it('Escape in footnote popover does NOT close it (reproduces #130)', async function () {
        this.timeout(20000);

        await setupEditor('Text before footnote.', { line: 0, ch: 20 });
        await sendVimEscape();
        await browser.pause(PAUSE.SETTLE);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:insert-footnote');
        });
        await browser.pause(PAUSE.RENDER);
        expect(await hasPopover()).toBe(true);

        await browser
            .saveScreenshot('/tmp/opencode/footnote-popover-open.png')
            .catch(() => {});

        // Popover should have focus in its CM6 editor
        // User types some footnote text
        await browser.keys(['t', 'e', 's', 't']);
        await browser.pause(PAUSE.SETTLE);

        // First Escape: should exit insert mode → normal mode in the popover
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterFirstEsc = await hasPopover();
        console.log(
            '[SPIKE] Popover still open after 1st Escape:',
            afterFirstEsc,
        );

        const popoverContext = (await browser.executeObsidian(() => {
            const popover = document.querySelector('.popover');
            if (!popover) return { error: 'no popover' };
            const cmEditor = popover.querySelector(
                '.cm-editor',
            ) as HTMLElement | null;
            return {
                inWorkspaceLeaf: !!cmEditor?.closest('.workspace-leaf-content'),
                inPopover: !!cmEditor?.closest('.popover'),
                popoverParentClasses:
                    (popover.parentElement as HTMLElement)?.className ?? '',
            };
        })) as Record<string, unknown>;
        console.log('[SPIKE] Popover context:', JSON.stringify(popoverContext));
        // Popover should still be open (just switched to normal mode)
        expect(afterFirstEsc).toBe(true);

        // Second Escape: user expects this to close the popover
        // BUG: vim consumes Escape, popover stays open
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        await browser
            .saveScreenshot('/tmp/opencode/footnote-popover-after-2-esc.png')
            .catch(() => {});

        const afterSecondEsc = await hasPopover();
        console.log(
            '[SPIKE] Popover still open after 2nd Escape:',
            afterSecondEsc,
        );

        const hoverPopoverDiag = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const hp = (view as unknown as { hoverPopover?: unknown })
                    .hoverPopover;
                return {
                    hasHoverPopover: hp !== null && hp !== undefined,
                    hoverPopoverType: hp
                        ? ((hp as Record<string, unknown>).constructor?.name ??
                          typeof hp)
                        : 'null',
                    hasHide: hp
                        ? typeof (hp as Record<string, unknown>).hide ===
                          'function'
                        : false,
                    popoverEl:
                        document.querySelector('.popover')?.className ??
                        'not found',
                };
            },
        )) as Record<string, unknown>;
        console.log(
            '[SPIKE] HoverPopover diagnostic:',
            JSON.stringify(hoverPopoverDiag),
        );

        const focusAfterEsc = (await browser.executeObsidian(() => {
            const popover = document.querySelector('.popover');
            const cmContent = popover?.querySelector('.cm-content');
            return {
                popoverContainsFocus:
                    popover?.contains(document.activeElement) ?? false,
                activeElement: document.activeElement?.className ?? 'null',
                popoverClasses:
                    (popover as HTMLElement)?.className ?? 'no popover',
            };
        })) as Record<string, unknown>;
        console.log(
            '[SPIKE] Focus after 2nd Escape:',
            JSON.stringify(focusAfterEsc),
        );

        // This assertion captures the bug:
        // Expected: false (popover should close on 2nd Escape)
        // Actual (bug): true (vim consumes Escape, popover stays open)
        expect(afterSecondEsc).toBe(false);
    });

    it('cursor state in footnote popover — animated cursor disabled', async function () {
        this.timeout(20000);

        await setAnimatedCursor(false);
        await setupEditor('Footnote cursor test.', { line: 0, ch: 20 });
        await sendVimEscape();
        await browser.pause(PAUSE.SETTLE);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:insert-footnote');
        });
        await browser.pause(PAUSE.RENDER);
        expect(await hasPopover()).toBe(true);

        // Check cursor while popover is open and focused (insert mode)
        await browser.keys(['h', 'i']);
        await browser.pause(PAUSE.SETTLE);

        const cursorState = await getPopoverCursorState();
        console.log(
            '[SPIKE] Popover cursor state in insert mode (animated=off):',
            JSON.stringify(cursorState, null, 2),
        );

        expect(cursorState.hasPopover).toBe(true);
        expect(cursorState.popoverHasCmEditor).toBe(true);
        expect(cursorState.popoverHasVimCursorLayer).toBe(true);
    });

    it('cursor state in footnote popover — animated cursor enabled', async function () {
        this.timeout(20000);

        await setAnimatedCursor(true);
        await setupEditor('Footnote animated cursor test.', {
            line: 0,
            ch: 28,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.SETTLE);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:insert-footnote');
        });
        await browser.pause(PAUSE.RENDER);
        expect(await hasPopover()).toBe(true);

        // Check cursor while popover is open (insert mode)
        await browser.keys(['h', 'i']);
        await browser.pause(PAUSE.SETTLE);

        const cursorState = await getPopoverCursorState();
        console.log(
            '[SPIKE] Popover cursor state in insert mode (animated=on):',
            JSON.stringify(cursorState, null, 2),
        );

        expect(cursorState.hasPopover).toBe(true);
        expect(cursorState.popoverHasCmEditor).toBe(true);

        const hasAnimatedCursorForPopover = (await browser.executeObsidian(
            () => {
                const popover = document.querySelector('.popover');
                if (!popover) return false;
                const cmEditor = popover.querySelector('.cm-editor');
                return (
                    cmEditor?.classList.contains(
                        'vim-motions-animated-cursor',
                    ) ?? false
                );
            },
        )) as boolean;

        console.log(
            '[SPIKE] Popover has animated cursor class:',
            hasAnimatedCursorForPopover,
        );

        const zIndexDiag = (await browser.executeObsidian(() => {
            const canvas = document.querySelector(
                '.vim-motions-animated-cursor-canvas',
            ) as HTMLElement | null;
            const popover = document.querySelector(
                '.popover',
            ) as HTMLElement | null;

            return {
                canvasExists: !!canvas,
                canvasZIndex: canvas ? getComputedStyle(canvas).zIndex : 'N/A',
                canvasPosition: canvas
                    ? getComputedStyle(canvas).position
                    : 'N/A',
                canvasWidth: canvas?.offsetWidth ?? 0,
                canvasHeight: canvas?.offsetHeight ?? 0,
                popoverZIndex: popover
                    ? getComputedStyle(popover).zIndex
                    : 'N/A',
                popoverPosition: popover
                    ? getComputedStyle(popover).position
                    : 'N/A',
            };
        })) as Record<string, unknown>;
        console.log('[SPIKE] Z-index diagnostic:', JSON.stringify(zIndexDiag));
    });
});
