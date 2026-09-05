// Regression test for #176: scrolloff centering misaligns when alternating up/down
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    vimRawKeys,
    setPluginSetting,
    setPluginSettingAndReload,
    PAUSE,
} from '../helpers';

function getCursorViewportOffset(): Promise<{
    cursorTop: number;
    viewportHeight: number;
    lineHeight: number;
}> {
    return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { cursorTop: -1, viewportHeight: -1, lineHeight: -1 };
        const cm = (
            (view as unknown as Record<string, unknown>).editMode as
                Record<string, unknown> | undefined
        )?.cm as import('@codemirror/view').EditorView | undefined;
        if (!cm) return { cursorTop: -1, viewportHeight: -1, lineHeight: -1 };

        const head = cm.state.selection.main.head;
        const coords = cm.coordsAtPos(head);
        if (!coords)
            return { cursorTop: -1, viewportHeight: -1, lineHeight: -1 };

        const scrollRect = cm.scrollDOM.getBoundingClientRect();
        return {
            cursorTop: coords.top - scrollRect.top,
            viewportHeight: scrollRect.height,
            lineHeight: cm.defaultLineHeight || 22,
        };
    }) as Promise<{
        cursorTop: number;
        viewportHeight: number;
        lineHeight: number;
    }>;
}

describe('Scrolloff centering stability (#176)', function () {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join(
        '\n',
    );

    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setPluginSettingAndReload('scrolloffLines', 100);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    after(async function () {
        await setPluginSetting('scrolloffLines', 0);
    });

    it('cursor should stay centered when alternating up/down movement (#176)', async function () {
        this.timeout(30000);

        await setupEditor(lines, { line: 100, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Move down continuously
        for (let i = 0; i < 15; i++) {
            await vimRawKeys('j');
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(500);

        const afterDown = await getCursorViewportOffset();

        // Stop, then move up
        for (let i = 0; i < 8; i++) {
            await vimRawKeys('k');
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(500);

        const afterUp = await getCursorViewportOffset();

        // Stop, then move down again — bug manifests here
        for (let i = 0; i < 8; i++) {
            await vimRawKeys('j');
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(500);

        const afterDownAgain = await getCursorViewportOffset();

        // With scrolloff=100 (centering), the cursor's pixel offset from the
        // viewport top should be stable across direction changes. Any drift
        // beyond half a line height indicates asymmetric margin enforcement.
        const halfLine = afterDown.lineHeight / 2;
        const driftUpVsDown = Math.abs(afterDown.cursorTop - afterUp.cursorTop);
        const driftFirstVsSecondDown = Math.abs(
            afterDown.cursorTop - afterDownAgain.cursorTop,
        );

        expect(driftUpVsDown).toBeLessThan(halfLine);
        expect(driftFirstVsSecondDown).toBeLessThan(halfLine);
    });
});
