import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, PAUSE } from '../helpers';

async function hasFlashingHighlight(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const editor = view.editor as unknown as {
            hasHighlight?: (style: string) => boolean;
        };
        if (typeof editor.hasHighlight === 'function') {
            return editor.hasHighlight('is-flashing');
        }
        const editorEl = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const dom = (editorEl as unknown as { dom: HTMLElement })?.dom;
        return dom ? dom.querySelectorAll('.is-flashing').length > 0 : false;
    })) as boolean;
}

async function addFlashingHighlight(
    fromLine: number,
    fromCh: number,
    toLine: number,
    toCh: number,
): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, fl: number, fc: number, tl: number, tc: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const editor = view.editor as unknown as {
                addHighlights?: (
                    ranges: Array<{
                        from: { line: number; ch: number };
                        to: { line: number; ch: number };
                    }>,
                    style: string,
                    removePrevious: boolean,
                ) => void;
            };
            if (typeof editor.addHighlights !== 'function') return false;
            editor.addHighlights(
                [{ from: { line: fl, ch: fc }, to: { line: tl, ch: tc } }],
                'is-flashing',
                true,
            );
            return true;
        },
        fromLine,
        fromCh,
        toLine,
        toCh,
    )) as boolean;
}

describe('Native highlight clearing on Escape — #122', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('Escape in normal mode should clear is-flashing highlight', async function () {
        await setupEditor(
            '# First heading\n\nSome text\n\n## Target heading\n\nContent',
            { line: 0, ch: 0 },
        );

        await addFlashingHighlight(4, 0, 4, 18);
        await browser.pause(PAUSE.KEY_GAP);
        expect(await hasFlashingHighlight()).toBe(true);

        // Use a real DOM Escape keypress (not sendVimEscape which calls
        // Vim.handleKey programmatically and bypasses the DOM observer
        // where vim-keypress is fired).
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);

        expect(await hasFlashingHighlight()).toBe(false);
    });

    it('editor without is-flashing should not error on Escape', async function () {
        await setupEditor('plain text without highlights', { line: 0, ch: 0 });

        expect(await hasFlashingHighlight()).toBe(false);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);

        expect(await hasFlashingHighlight()).toBe(false);
    });
});
