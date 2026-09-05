import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
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
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
    await browser.pause(WIDGET_REBUILD);
}

describe('Table debug state instrumentation', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('getTableDebugState returns state outside table', async function () {
        await setupTableDoc();

        const state = (await browser.executeObsidian(({ app }) => {
            const cma = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        getTableDebugState?: (app: unknown) => unknown;
                    };
                }
            ).CodeMirrorAdapter;
            if (!cma?.getTableDebugState) return null;
            return cma.getTableDebugState(app);
        })) as Record<string, unknown> | null;

        expect(state).not.toBeNull();
        expect(state).toHaveProperty('nav');
        expect(state).toHaveProperty('stateField');
        expect(state).toHaveProperty('cursorSuppression');
        expect(state).toHaveProperty('fork');
        expect(state).toHaveProperty('crossing');
        expect(state).toHaveProperty('dom');
        expect(state).toHaveProperty('cellEditor');
        expect(state).toHaveProperty('modeTracker');

        const dom = state!.dom as Record<string, boolean>;
        expect(dom.hasTableWidget).toBe(true);
        expect(dom.hasNavHighlight).toBe(false);
    });

    it('getTableDebugState shows nav state inside table', async function () {
        await setupTableDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(ENTRY_DEBOUNCE + 200);

        const result = (await browser.executeObsidian(({ app }) => {
            const cma = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        getTableDebugState?: (app: unknown) => unknown;
                    };
                }
            ).CodeMirrorAdapter;
            if (!cma?.getTableDebugState) return { error: 'no bridge fn' };
            try {
                const s = cma.getTableDebugState(app);
                if (!s) return { error: 'returned null' };
                return s;
            } catch (e) {
                return {
                    error: `threw: ${(e as Error).message ?? String(e)}`,
                };
            }
        })) as Record<string, unknown>;

        console.log(
            'Table debug state in table:',
            JSON.stringify(result, null, 2),
        );
        const state = result.error ? null : result;
        expect(state).not.toBeNull();

        expect(state).toHaveProperty('nav');
        expect(state).toHaveProperty('stateField');
        expect(state).toHaveProperty('cursorSuppression');
        expect(state).toHaveProperty('fork');
        expect(state).toHaveProperty('crossing');
        expect(state).toHaveProperty('dom');
        expect(state).toHaveProperty('cellEditor');

        const cellEditor = state!.cellEditor as Record<string, boolean>;
        expect(cellEditor.hasActiveTableCell).toBe(true);
    });
});
