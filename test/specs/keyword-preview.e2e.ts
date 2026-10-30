import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureLivePreview, PAUSE } from '../helpers';

/**
 * `K` previews footnotes (#209), a second `K` moves into the preview (#208),
 * and `q` closes a preview the cursor is in.
 *
 * Measured before the change: `K` on `[^1]` showed character info
 * (`<^> 94, Hex 5e`) instead of the footnote, and `q` in a preview started a
 * macro. Obsidian's own footnote hover sends `hover-link` with
 * `linktext: "#[^1]"`. Neovim's hover is opened and then focused by "KK", and
 * `q` dismisses it (`:help vim.lsp.buf.hover()`).
 *
 * A second `K` focuses the preview only with the cursor where the first one
 * left it: Neovim closes the hover window when the cursor moves, so `K`
 * after a motion starts over.
 */

const NOTE = 'KeywordPreview.md';
const TARGET = 'KeywordTarget.md';

async function placeCursor(line: number, needle: string): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, args: { line: number; needle: string }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const text = view.editor.getLine(args.line);
            view.editor.setCursor(args.line, text.indexOf(args.needle) + 1);
            view.editor.focus();
        },
        { line, needle },
    );
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

interface PreviewState {
    count: number;
    text: string;
    focusInside: boolean;
}

async function preview(): Promise<PreviewState> {
    return (await browser.executeObsidian(() => {
        const pops = Array.from(document.querySelectorAll('.hover-popover'));
        return {
            count: pops.length,
            text: pops.map((p) => p.textContent ?? '').join(' | '),
            focusInside: !!document.activeElement?.closest('.hover-popover'),
        };
    })) as PreviewState;
}

async function waitForPreview(): Promise<void> {
    await browser.waitUntil(async () => (await preview()).count > 0, {
        timeout: 5000,
        interval: 100,
        timeoutMsg: 'no preview opened',
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function closePreviews(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        (
            view as unknown as { hoverPopover?: { hide(): void } | null } | null
        )?.hoverPopover?.hide();
        document
            .querySelectorAll('.hover-popover')
            .forEach((el) => el.remove());
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('K previews', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(
            async ({ app }, files: { note: string; target: string }) => {
                await app.vault.adapter.write(
                    files.target,
                    'Target body text\n',
                );
                await app.vault.adapter.write(
                    files.note,
                    'Intro line\n\nSome text[^1] and [[KeywordTarget]] here.\n\n[^1]: The footnote body text\n',
                );
            },
            { note: NOTE, target: TARGET },
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await obsidianPage.openFile(NOTE);
        await ensureLivePreview();
        await closePreviews();
    });

    afterEach(async function () {
        await closePreviews();
    });

    after(async function () {
        await browser.executeObsidian(
            async ({ app }, files: string[]) => {
                for (const f of files) {
                    if (await app.vault.adapter.exists(f)) {
                        await app.vault.adapter.remove(f);
                    }
                }
            },
            [NOTE, TARGET],
        );
    });

    it('K on a footnote reference previews the footnote', async function () {
        await placeCursor(2, '[^1]');

        await browser.keys(['K']);
        await waitForPreview();

        expect((await preview()).text).toContain('The footnote body text');
    });

    it('K on a link still previews the note (control)', async function () {
        await placeCursor(2, 'KeywordTarget');

        await browser.keys(['K']);
        await waitForPreview();

        expect((await preview()).text).toContain('Target body text');
    });

    it('a second K moves into the preview, and q closes it', async function () {
        await placeCursor(2, 'KeywordTarget');
        await browser.keys(['K']);
        await waitForPreview();
        expect((await preview()).focusInside).toBe(false);

        await browser.keys(['K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const focused = await preview();

        await browser.keys(['q']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const afterQuit = await preview();

        expect(focused.count).toBe(1);
        expect(focused.focusInside).toBe(true);
        expect(afterQuit.count).toBe(0);
    });

    it('K after moving the cursor does not focus the open preview', async function () {
        await placeCursor(2, 'KeywordTarget');
        await browser.keys(['K']);
        await waitForPreview();

        await browser.keys(['0', 'K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect((await preview()).focusInside).toBe(false);
    });

    it('q in insert mode inside the preview types a q', async function () {
        await placeCursor(2, 'KeywordTarget');
        await browser.keys(['K']);
        await waitForPreview();
        await browser.keys(['K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['i', 'q']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const state = await preview();
        await browser.keys(['Escape']);

        expect(state.count).toBe(1);
        expect(state.text).toContain('qTarget body text');
    });

    it('q ends a macro recording instead of closing the preview', async function () {
        await placeCursor(2, 'KeywordTarget');
        await browser.keys(['q', 'a', 'K']);
        await waitForPreview();
        await browser.keys(['K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['q']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const state = await preview();
        const recording = (await browser.executeObsidian(
            () =>
                (
                    window as unknown as {
                        CodeMirrorAdapter: {
                            Vim: {
                                getVimGlobalState_(): {
                                    macroModeState: { isRecording: boolean };
                                };
                            };
                        };
                    }
                ).CodeMirrorAdapter.Vim.getVimGlobalState_().macroModeState
                    .isRecording,
        )) as boolean;

        expect(state.count).toBe(1);
        expect(recording).toBe(false);
    });

    it('q in the note still records a macro (control)', async function () {
        await placeCursor(0, 'Intro');

        await browser.keys(['q', 'a']);
        await browser.pause(PAUSE.MODE_SWITCH);
        const recording = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: {
                            getVimGlobalState_(): {
                                macroModeState: { isRecording: boolean };
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter.Vim;
            return Vim.getVimGlobalState_().macroModeState.isRecording;
        })) as boolean;
        await browser.keys(['q']);

        expect(recording).toBe(true);
    });
});
