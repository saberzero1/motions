import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

/**
 * Regression tests for cursor visibility in tables without native widgets.
 *
 * Issue #132: cursor disappears when entering a table in source mode or with
 * tableWidgetMode='raw'. Root cause: mainEditorTableCursorGuard suppresses
 * the vim cursor whenever the cursor is in a table text range, but does not
 * check whether a native table widget actually exists. In source mode and
 * raw mode there is no widget, so the cursor is hidden with no alternative
 * cursor shown.
 *
 * Tests use differential comparison: cursor layer state on a table line must
 * match cursor layer state on a non-table line. This is independent of
 * animated cursor / global suppression state.
 */

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

interface CursorLayerState {
    display: string;
    childCount: number;
    cursorOnTableLine: boolean;
}

async function getCursorLayerState(): Promise<CursorLayerState> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                display: 'no-view',
                childCount: -1,
                cursorOnTableLine: false,
            };

        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const editorView = editMode?.cm as
            { scrollDOM?: HTMLElement } | undefined;
        if (!editorView?.scrollDOM)
            return {
                display: 'no-scrolldom',
                childCount: -1,
                cursorOnTableLine: false,
            };

        const vimLayer = editorView.scrollDOM.querySelector(
            '.cm-vimCursorLayer',
        ) as HTMLElement | null;

        const cursor = view.editor.getCursor();
        const line = view.editor.getLine(cursor.line);

        return {
            display: vimLayer?.style.display ?? 'unset',
            childCount: vimLayer?.children.length ?? -1,
            cursorOnTableLine: line.trimStart().startsWith('|'),
        };
    })) as CursorLayerState;
}

async function setPluginSettings(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
        const plugin = (
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
        if (!plugin) return;
        for (const [k, v] of Object.entries(s)) {
            plugin.settings[k] = v;
        }
        plugin.saveSettings();
        plugin.reloadFeatures();
    }, settings);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Cursor visibility in source mode tables (#132)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureSourceMode();
        await setPluginSettings({
            enableTableNav: false,
            tableWidgetMode: 'native',
        });
    });

    after(async function () {
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
        await ensureLivePreview();
    });

    beforeEach(async function () {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('table guard should not change cursor layer state in source mode', async function () {
        const baseline = await getCursorLayerState();
        expect(baseline.cursorOnTableLine).toBe(false);

        for (let i = 0; i < 2; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const onTable = await getCursorLayerState();
        expect(onTable.cursorOnTableLine).toBe(true);
        expect(onTable.display).toBe(baseline.display);
    });

    it('cursor layer state should recover after moving through table in source mode', async function () {
        const baseline = await getCursorLayerState();

        for (let i = 0; i < 6; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const afterTable = await getCursorLayerState();
        expect(afterTable.cursorOnTableLine).toBe(false);
        expect(afterTable.display).toBe(baseline.display);
    });

    it('table guard should not change cursor layer state on data row', async function () {
        const baseline = await getCursorLayerState();

        for (let i = 0; i < 4; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const onDataRow = await getCursorLayerState();
        expect(onDataRow.cursorOnTableLine).toBe(true);
        expect(onDataRow.display).toBe(baseline.display);
    });
});

describe('Cursor visibility in raw table mode (#132)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: false,
            tableWidgetMode: 'raw',
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    });

    after(async function () {
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    beforeEach(async function () {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('table widget should be hidden in raw mode', async function () {
        const widgetHidden = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return null;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const widgets = container.querySelectorAll('.cm-table-widget');
                if (widgets.length === 0) return true;
                for (const w of Array.from(widgets)) {
                    const style = window.getComputedStyle(w);
                    if (style.display !== 'none') return false;
                }
                return true;
            },
        )) as boolean | null;
        expect(widgetHidden).toBe(true);
    });

    it('cursor layer display should not flicker during repeated table traversal in raw mode', async function () {
        for (let i = 0; i < 6; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const displays: string[] = [];
        for (let cycle = 0; cycle < 3; cycle++) {
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
            displays.push((await getCursorLayerState()).display);

            await browser.keys(['g', 'g']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            displays.push((await getCursorLayerState()).display);
        }

        const unique = [...new Set(displays)];
        expect(unique.length).toBe(1);
    });
});
