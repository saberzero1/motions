import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureLivePreview,
    getVimMode,
    sendVimEscape,
    setupEditor,
} from '../helpers';

/**
 * Issue #190 — a callout stays highlighted forever after a linewise yank.
 *
 * Live Preview renders a callout the cursor is outside of as a block widget,
 * which no CodeMirror mark decoration can reach, so linewise visual selection
 * paints those widgets by toggling a class on their DOM element instead. The
 * moment the selection head enters the callout, Obsidian swaps that widget
 * for source lines and *caches the detached element*. Clearing the class only
 * while `isConnected` therefore skipped exactly the element that Obsidian was
 * about to re-attach, and the stale highlight came back with it — permanently,
 * because nothing afterwards is tracking that element any more.
 */

const CALLOUT_DOC = [
    '# Heading',
    '',
    '> [!note] Title',
    '> Body line one',
    '> Body line two',
    '',
    'Trailing paragraph',
].join('\n');

const TABLE_DOC = [
    '# Heading',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    'Trailing paragraph',
].join('\n');

const STALE = '.cm-vim-linewise-widget-selection';
const TABLE_WIDGET = '.cm-content .cm-embed-block.cm-table-widget';
const CALLOUT_WIDGET = '.cm-content > .cm-embed-block.cm-callout';

interface CalloutState {
    /** Callout is rendered as a block widget (cursor is outside it). */
    rendered: boolean;
    /** Elements still carrying the linewise selection class. */
    highlighted: number;
}

async function calloutState(): Promise<CalloutState> {
    return (await browser.executeObsidian(
        (_ctx, widgetSel: string, staleSel: string) => ({
            rendered: document.querySelector(widgetSel) !== null,
            highlighted: document.querySelectorAll(staleSel).length,
        }),
        CALLOUT_WIDGET,
        STALE,
    )) as CalloutState;
}

async function tableState(): Promise<CalloutState> {
    return (await browser.executeObsidian(
        (_ctx, widgetSel: string, staleSel: string) => ({
            rendered: document.querySelector(widgetSel) !== null,
            highlighted: document.querySelectorAll(staleSel).length,
        }),
        TABLE_WIDGET,
        STALE,
    )) as CalloutState;
}

async function waitForCallout(rendered: boolean): Promise<void> {
    await browser.waitUntil(
        async () => (await calloutState()).rendered === rendered,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: `callout widget rendered=${rendered} never happened`,
        },
    );
}

async function press(key: string): Promise<void> {
    await browser.keys([key]);
    await browser.pause(150);
}

describe('Linewise widget selection over callouts (#190)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    beforeEach(async function () {
        await setupEditor(CALLOUT_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(150);
        // Obsidian caches the callout's widget element, so a stale class
        // outlives `editor.setValue()` and would fail the *next* test in this
        // file rather than the one that produced it. Strip it here so each
        // scenario is judged on the highlight it leaves behind itself.
        await browser.executeObsidian((_ctx, staleSel: string) => {
            document
                .querySelectorAll(staleSel)
                .forEach((el) => el.classList.remove(staleSel.slice(1)));
        }, STALE);
        // Precondition: the cursor is on the heading, so Live Preview renders
        // the callout as a block widget. Without this the scenario below could
        // pass on an editor that never rendered a widget at all.
        await waitForCallout(true);
    });

    it('yanking a visual-line selection through a callout leaves no highlight behind', async function () {
        await press('V');
        expect(await getVimMode()).toBe('visual');
        await press('j');
        await press('j');

        // The selection head is now inside the callout, so Obsidian replaces
        // the widget with source lines. This is the transition the bug needs:
        // the element holding the highlight class is detached here.
        await waitForCallout(false);

        await press('j');
        await press('j');
        await press('y');

        expect(await getVimMode()).toBe('normal');
        // The yank puts the cursor back at the top of the range, so the cached
        // callout widget is re-attached.
        await waitForCallout(true);
        await browser.pause(500);

        const after = await calloutState();
        expect(after.rendered).toBe(true);
        expect(after.highlighted).toBe(0);
    });

    // A selection that covers a callout now reaches the editor (#231), so Live
    // Preview shows the callout as source, as it does under `v`. A table stays
    // a widget under a selection, so it is what proves the feature still
    // paints: "nothing is highlighted" would otherwise also pass for a build
    // that highlights nothing at all.
    it('still highlights a table the selection covers, and clears it on yank', async function () {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(150);
        await press('V');
        await press('G');

        const during = await tableState();
        expect(during).toEqual({ rendered: true, highlighted: 1 });

        await press('y');
        await browser.pause(500);

        expect(await tableState()).toEqual({ rendered: true, highlighted: 0 });
    });

    it('leaving visual-line mode inside a callout leaves no highlight behind', async function () {
        await press('V');
        await press('j');
        await press('j');

        await waitForCallout(false);

        await sendVimEscape();
        await browser.pause(150);
        expect(await getVimMode()).toBe('normal');

        // Escape keeps the cursor inside the callout; move out so Obsidian
        // re-attaches the cached widget.
        await press('g');
        await press('g');
        await waitForCallout(true);
        await browser.pause(500);

        const after = await calloutState();
        expect(after.rendered).toBe(true);
        expect(after.highlighted).toBe(0);
    });
});
