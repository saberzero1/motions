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

async function getHead(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = view?.editor?.cm;
        if (!cm) return -1;
        return cm.state.selection.main.head;
    })) as number;
}

/**
 * Whether a real keystroke still drives the editor.
 *
 * The leaked state this file covers does not merely hide a cursor: focus ends
 * on `<body>` and keys reach nothing, so the editor is dead until the user
 * clicks. A suppression flag reading `false` while `j` moves nothing would
 * still be a broken editor, which is why every scenario below ends here.
 */
async function keyStillMovesCursor(): Promise<boolean> {
    const before = await getHead();
    await browser.keys(['j']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
    return (await getHead()) !== before;
}

describe('Bug 2: Cursor visible after LP→source (#167)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('releases key intercept and cursor suppression on LP→source', async function () {
        await setupTableDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(ENTRY_DEBOUNCE + 200);

        await ensureSourceMode();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const state = await getDebugState();
        const fork = state.fork as Record<string, boolean>;
        const cursor = state.cursorSuppression as Record<string, unknown>;

        expect(fork.keyInterceptActive).toBe(false);
        expect(cursor.viewOverrideCount).toBe(0);
        expect(cursor.viewSuppressed).toBe(false);
        expect(await keyStillMovesCursor()).toBe(true);
    });

    it('releases without needing a keystroke to trigger the safety handler', async function () {
        await ensureLivePreview();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await setupTableDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(ENTRY_DEBOUNCE + 200);

        await ensureSourceMode();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // No focus round-trip and no keystroke before this read. The
        // `keyInterceptSafetyHandler` in main.ts clears the flag on the next
        // keydown, so a scenario that pressed a key first could not tell a
        // transition that releases correctly from one that leaks and is then
        // papered over. The release must already have happened here.
        const atRest = await getDebugState();
        const restFork = atRest.fork as Record<string, boolean>;
        const restCursor = atRest.cursorSuppression as Record<string, unknown>;
        expect(restFork.keyInterceptActive).toBe(false);
        expect(restCursor.viewOverrideCount).toBe(0);

        expect(await keyStillMovesCursor()).toBe(true);
    });
});
