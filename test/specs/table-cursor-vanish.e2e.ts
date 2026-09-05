import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

const ENTRY_DEBOUNCE = 300;
const WIDGET_REBUILD = 200;

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                return (
                    (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl.querySelector('.cm-table-widget') !== null
                );
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
}

async function setupTableDoc(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        if (
            editMode?.tableCell &&
            typeof editMode.destroyTableCell === 'function'
        ) {
            (editMode.destroyTableCell as () => void)();
        }
    });
    await browser.pause(PAUSE.MODE_SWITCH);
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
    await browser.pause(WIDGET_REBUILD);
}

async function getDebugState(): Promise<Record<string, unknown>> {
    return (await browser.executeObsidian(({ app }) => {
        const cma = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    getTableDebugState?: () => unknown;
                };
            }
        ).CodeMirrorAdapter;
        return (cma?.getTableDebugState?.() ?? {
            error: 'no fn',
        }) as Record<string, unknown>;
    })) as Record<string, unknown>;
}

async function forceTableCleanup(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const cma = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    setKeyInterceptActive?: (a: boolean) => void;
                    clearCursorSuppressedForView?: (v: unknown) => void;
                };
            }
        ).CodeMirrorAdapter;
        if (cma?.setKeyInterceptActive) {
            cma.setKeyInterceptActive(false);
        }
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = view?.editor?.cm;
        if (cm && cma?.clearCursorSuppressedForView) {
            cma.clearCursorSuppressedForView(cm);
        }
        if (cm) {
            (cm as unknown as { scrollDOM: HTMLElement }).scrollDOM
                .querySelectorAll('.vim-motions-cursor-layer-hidden')
                .forEach((el: Element) =>
                    el.classList.remove('vim-motions-cursor-layer-hidden'),
                );
        }
    });
}

describe('Bug 2: Cursor visible after LP→source (#167)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('state is stuck after LP→source from table-nav', async function () {
        await setupTableDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(ENTRY_DEBOUNCE + 200);

        await ensureSourceMode();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getDebugState();
        const fork = state.fork as Record<string, boolean>;

        expect(fork.keyInterceptActive).toBe(true);
    });

    it('forceTableCleanup via bridge clears all stuck state', async function () {
        await forceTableCleanup();
        await browser.pause(PAUSE.MODE_SWITCH);

        const state = await getDebugState();
        const fork = state.fork as Record<string, boolean>;
        const dom = state.dom as Record<string, boolean>;
        const cursor = state.cursorSuppression as Record<string, unknown>;

        expect(fork.keyInterceptActive).toBe(false);
        expect(cursor.viewSuppressed).toBe(false);
        expect(dom.mainCursorLayerHidden).toBe(false);
    });

    it('automatic cleanup: keydown safety handler on document', async function () {
        await ensureLivePreview();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await setupTableDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(ENTRY_DEBOUNCE + 200);

        await ensureSourceMode();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        let state = await getDebugState();
        let fork = state.fork as Record<string, boolean>;
        expect(fork.keyInterceptActive).toBe(true);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['l']);
        await browser.pause(PAUSE.MODE_SWITCH);

        state = await getDebugState();
        console.log(
            '[bug2] auto cleanup state:',
            JSON.stringify({
                keyIntercept: (state.fork as Record<string, boolean>)
                    .keyInterceptActive,
                viewSuppressed: (
                    state.cursorSuppression as Record<string, unknown>
                ).viewSuppressed,
                mainCursorHidden: (state.dom as Record<string, boolean>)
                    .mainCursorLayerHidden,
                hasNavMode: (state.dom as Record<string, boolean>).hasNavMode,
            }),
        );
        fork = state.fork as Record<string, boolean>;
        const dom = state.dom as Record<string, boolean>;
        const cursor = state.cursorSuppression as Record<string, unknown>;

        expect(fork.keyInterceptActive).toBe(false);
        expect(cursor.viewSuppressed).toBe(false);
        expect(dom.mainCursorLayerHidden).toBe(false);
    });
});
