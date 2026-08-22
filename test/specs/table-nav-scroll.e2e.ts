import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureLivePreview,
    sendVimEscape,
    setPluginSettingAndReload,
    PAUSE,
} from '../helpers';

/**
 * Issue #136 (comment): Viewport doesn't follow cursor in long tables
 * when enableTableNav=true.
 *
 * When navigating down through a table that extends beyond the viewport,
 * the highlighted cell goes off-screen because navigate() only adds a
 * CSS highlight class without scrolling.
 *
 * Fix: scrollIntoView({ block: 'nearest' }) after highlightCell().
 */

const ENTRY_DEBOUNCE = 300;
const WIDGET_REBUILD_PAUSE = 200;

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

async function destroyTableCell(): Promise<void> {
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
}

async function getHighlightedCellRow(): Promise<number | null> {
    return (await browser.executeObsidian(() => {
        const active = document.querySelector(
            '.vim-motions-table-nav-active',
        ) as HTMLElement | null;
        if (!active) return null;
        const cellEl = (active.closest('td, th') ??
            active) as HTMLTableCellElement;
        const rowEl = cellEl.closest('tr') as HTMLTableRowElement | null;
        if (!rowEl) return null;
        const tableEl = rowEl.closest('table') as HTMLTableElement | null;
        if (!tableEl) return null;
        const allRows = Array.from(tableEl.rows);
        return allRows.indexOf(rowEl);
    })) as number | null;
}

async function isHighlightedCellVisible(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const active = document.querySelector(
            '.vim-motions-table-nav-active',
        ) as HTMLElement | null;
        if (!active) return false;
        const rect = active.getBoundingClientRect();
        const scroller = active.closest('.cm-scroller') as HTMLElement | null;
        if (!scroller) {
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        }
        const scrollerRect = scroller.getBoundingClientRect();
        return (
            rect.top >= scrollerRect.top && rect.bottom <= scrollerRect.bottom
        );
    })) as boolean;
}

async function constrainScrollerHeight(): Promise<void> {
    await browser.executeObsidian(() => {
        const style = document.createElement('style');
        style.id = 'test-scroll-constraint';
        style.textContent =
            '.cm-scroller { max-height: 200px !important; overflow-y: auto !important; }';
        document.head.appendChild(style);
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function removeScrollerConstraint(): Promise<void> {
    await browser.executeObsidian(() => {
        document.getElementById('test-scroll-constraint')?.remove();
    });
}

async function getScrollTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm = (
            (view as unknown as Record<string, unknown>).editMode as
                | Record<string, unknown>
                | undefined
        )?.cm as { scrollDOM?: HTMLElement } | undefined;
        return cm?.scrollDOM?.scrollTop ?? -1;
    })) as number;
}

describe('Table nav scrolling in long tables (#136)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await setPluginSettingAndReload('enableTableNav', true);
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await obsidianPage.openFile('fixtures/table-nav/LongTable.md');
        await ensureLivePreview();
    });

    after(async function () {
        await destroyTableCell();
        await removeScrollerConstraint();
    });

    it('entering table-nav should not snap viewport to top of table (#136)', async function () {
        this.timeout(20000);
        await destroyTableCell();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await waitForTableWidget();
        await browser.pause(WIDGET_REBUILD_PAUSE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const lastFiller = 31;
            view.editor.setCursor(lastFiller, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrollBefore = await getScrollTop();
        expect(scrollBefore).toBeGreaterThan(0);

        await browser.keys(['j']);
        await browser.pause(ENTRY_DEBOUNCE + PAUSE.EDITOR_SETTLE);

        const scrollAfter = await getScrollTop();
        const drift = Math.abs(scrollAfter - scrollBefore);

        expect(drift).toBeLessThan(100);
    });

    it('highlighted cell should remain visible after navigating to bottom of long table (#136)', async function () {
        this.timeout(60000);
        await destroyTableCell();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await waitForTableWidget();
        await browser.pause(WIDGET_REBUILD_PAUSE);
        await constrainScrollerHeight();

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const lastFiller = 31;
            view.editor.setCursor(lastFiller, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['j']);
        await browser.pause(ENTRY_DEBOUNCE + PAUSE.EDITOR_SETTLE);

        await browser.waitUntil(
            async () => (await getHighlightedCellRow()) !== null,
            { timeout: 5000, interval: 100 },
        );
        const initialRow = await getHighlightedCellRow();
        expect(initialRow).not.toBeNull();

        for (let i = 0; i < 90; i++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const finalRow = await getHighlightedCellRow();
        expect(finalRow).not.toBeNull();
        expect(finalRow!).toBeGreaterThan(80);

        await browser.waitUntil(async () => isHighlightedCellVisible(), {
            timeout: 2000,
            interval: 100,
        });
    });
});
