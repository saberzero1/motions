import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { focusEditor, PAUSE } from '../../helpers';

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
};

async function enableTextareaVim(enable: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, val: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.enableVimTextareas = val;
        plugin.reloadFeatures();
    }, enable);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

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
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function injectTextarea(id: string, value: string): Promise<void> {
    await browser.executeObsidian(
        (_ctx, elId: string, val: string) => {
            const existing = document.getElementById(elId);
            if (existing) existing.remove();
            const existingModal = document.getElementById(`${elId}-modal`);
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = `${elId}-modal`;

            const textarea = document.createElement('textarea');
            textarea.id = elId;
            textarea.value = val;
            textarea.style.width = '300px';
            textarea.style.height = '100px';

            modal.appendChild(textarea);
            document.body.appendChild(modal);
        },
        id,
        value,
    );
}

async function focusElement(id: string): Promise<void> {
    await browser.executeObsidian((_ctx, elId: string) => {
        const el = document.getElementById(elId) as HTMLTextAreaElement | null;
        el?.focus();
    }, id);
}

async function cleanup(id: string): Promise<void> {
    await browser.executeObsidian((_ctx, elId: string) => {
        document.getElementById(`${elId}-modal`)?.remove();
        document.getElementById(elId)?.remove();
        document
            .querySelectorAll('.vim-motions-textarea-overlay')
            .forEach((el) => el.remove());
    }, id);
}

async function hasOverlay(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-textarea-overlay');
    })) as boolean;
}

interface OverlayCursorState {
    hasOverlay: boolean;
    hasVimMode: boolean;
    hasVimCursorLayer: boolean;
    nativeLayerCount: number;
    nativeLayersVisible: boolean;
    nativeLayerDisplayValues: string[];
    vimLayerDisplay: string;
    vimFatCursorCount: number;
    caretColor: string;
    cursorSuppressed: boolean | null;
    hasAnimatedCursorClass: boolean;
}

async function getOverlayCursorState(): Promise<OverlayCursorState> {
    return (await browser.executeObsidian(() => {
        const overlay = document.querySelector('.vim-motions-textarea-overlay');
        if (!overlay)
            return {
                hasOverlay: false,
                hasVimMode: false,
                hasVimCursorLayer: false,
                nativeLayerCount: 0,
                nativeLayersVisible: false,
                nativeLayerDisplayValues: [],
                vimLayerDisplay: 'N/A',
                vimFatCursorCount: 0,
                caretColor: 'N/A',
                cursorSuppressed: null,
                hasAnimatedCursorClass: false,
            };

        const cmEditor = overlay.querySelector(
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
        const nativeLayerDisplays = Array.from(nativeLayers ?? []).map(
            (el) => getComputedStyle(el as HTMLElement).display,
        );
        const nativeVisible = nativeLayerDisplays.some((d) => d !== 'none');

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
            hasOverlay: true,
            hasVimMode,
            hasVimCursorLayer: !!vimLayer,
            nativeLayerCount: nativeLayers?.length ?? 0,
            nativeLayersVisible: nativeVisible,
            nativeLayerDisplayValues: nativeLayerDisplays,
            vimLayerDisplay: vimLayer
                ? getComputedStyle(vimLayer).display
                : 'not found',
            vimFatCursorCount: fatCursors?.length ?? 0,
            caretColor,
            cursorSuppressed: suppressed,
            hasAnimatedCursorClass:
                cmEditor?.classList.contains('vim-motions-animated-cursor') ??
                false,
        };
    })) as OverlayCursorState;
}

describe('Spike: textarea vim cursor state (#130)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await enableTextareaVim(true);
    });

    after(async function () {
        await enableTextareaVim(false);
        await setAnimatedCursor(false);
    });

    afterEach(async function () {
        await cleanup('cursor-ta');
        await focusEditor();
    });

    it('animated cursor OFF: no doubled cursors in textarea vim overlay after insert→normal', async function () {
        this.timeout(30000);

        await setAnimatedCursor(false);

        await injectTextarea('cursor-ta', 'hello world');
        await focusElement('cursor-ta');
        await browser.waitUntil(async () => (await hasOverlay()) === true, {
            timeout: 5000,
            interval: 200,
        });

        // Overlay starts in insert mode (bar cursor, native caret visible)
        const insertState = await getOverlayCursorState();
        console.log(
            '[SPIKE] Insert mode cursor state:',
            JSON.stringify(insertState, null, 2),
        );

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        const normalState = await getOverlayCursorState();

        const inlineStyleDiag = (await browser.executeObsidian(() => {
            const overlay = document.querySelector(
                '.vim-motions-textarea-overlay',
            );
            const cmContent = overlay?.querySelector(
                '.cm-content',
            ) as HTMLElement | null;
            if (!cmContent) return { error: 'no .cm-content' };
            return {
                inlineStyle: cmContent.style.cssText,
                inlineCaretColor:
                    cmContent.style.getPropertyValue('caret-color'),
                inlineCaretPriority:
                    cmContent.style.getPropertyPriority('caret-color'),
                computedCaretColor: getComputedStyle(cmContent).caretColor,
                cmLineCaretColor: (() => {
                    const line = cmContent.querySelector('.cm-line');
                    return line
                        ? getComputedStyle(line).caretColor
                        : 'no .cm-line';
                })(),
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] Inline style diagnostic:',
            JSON.stringify(inlineStyleDiag, null, 2),
        );

        console.log(
            '[SPIKE] Normal mode cursor state:',
            JSON.stringify(normalState, null, 2),
        );

        await browser
            .saveScreenshot('/tmp/opencode/textarea-cursor-normal-no-anim.png')
            .catch(() => {});

        expect(normalState.nativeLayersVisible).toBe(false);

        if (normalState.hasVimCursorLayer) {
            expect(normalState.vimLayerDisplay).not.toBe('none');
        }

        expect(normalState.vimFatCursorCount).toBeGreaterThan(0);

        // In normal mode (.cm-vimMode), caretColor must be transparent
        // to prevent the native text caret from showing alongside the
        // fork's block cursor (the doubled cursor reported in #129/#130).
        expect(normalState.caretColor).toBe('rgba(0, 0, 0, 0)');
    });

    it('animated cursor OFF: cursor visible after insert→normal→insert→normal cycle', async function () {
        this.timeout(30000);

        await setAnimatedCursor(false);

        await injectTextarea('cursor-ta', 'test content');
        await focusElement('cursor-ta');
        await browser.waitUntil(async () => (await hasOverlay()) === true, {
            timeout: 5000,
            interval: 200,
        });

        // insert → normal → insert → normal (the cycle that triggers #129)
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['i']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getOverlayCursorState();
        console.log(
            '[SPIKE] After mode cycle:',
            JSON.stringify(state, null, 2),
        );

        await browser
            .saveScreenshot(
                '/tmp/opencode/textarea-cursor-after-cycle-no-anim.png',
            )
            .catch(() => {});

        expect(state.nativeLayersVisible).toBe(false);
        if (state.hasVimCursorLayer) {
            expect(state.vimLayerDisplay).not.toBe('none');
            expect(state.vimFatCursorCount).toBeGreaterThan(0);
        }
        expect(state.caretColor).toBe('rgba(0, 0, 0, 0)');
    });

    it('animated cursor ON: native layers hidden in textarea overlay', async function () {
        this.timeout(30000);

        await setAnimatedCursor(true);

        await injectTextarea('cursor-ta', 'animated test');
        await focusElement('cursor-ta');
        await browser.waitUntil(async () => (await hasOverlay()) === true, {
            timeout: 5000,
            interval: 200,
        });

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        const state = await getOverlayCursorState();
        console.log(
            '[SPIKE] Animated ON normal mode:',
            JSON.stringify(state, null, 2),
        );

        // Native CM6 cursor layers are always hidden by the fork,
        // regardless of animated cursor state
        expect(state.nativeLayersVisible).toBe(false);
    });
});
