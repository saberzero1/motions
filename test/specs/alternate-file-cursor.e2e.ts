import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getCursorPos, handleEx, loadSingleFileWorkspace } from '../helpers';

/**
 * `<C-^>` returns to the alternate note at the cursor it was left with, as
 * Neovim's returns to a buffer's `"` mark. Measured in Neovim 0.12.6 with
 * `tabstop=4`: leave `a.txt` at line 2 column 10, `:edit b.txt`, `<C-^>`, and
 * the cursor is back on line 2 column 10 with 'startofline' off, or on the
 * line's first non-blank, column 2, with it on. Obsidian opens a note at its
 * start, so `<C-^>` used to land on line 1, column 1.
 */

const A = 'AltCursorA.md';
const B = 'AltCursorB.md';
const A_TEXT = '  alpha beta gamma\n\tdelta epsilon zeta\nthird line here\n';

async function pressInEditor(key: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, k: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as { cm?: { cm?: unknown } } | undefined
        )?.cm?.cm;
        const vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: { handleKey(cm: unknown, key: string): void };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (cm && vim) vim.handleKey(cm, k);
    }, key);
}

async function activeFile(): Promise<string | undefined> {
    return (await browser.executeObsidian(
        ({ app }) => app.workspace.getActiveFile()?.path,
    )) as string | undefined;
}

async function leaveAAt(line: number, ch: number): Promise<void> {
    await obsidianPage.openFile(A);
    await browser.pause(400);
    await browser.executeObsidian(
        ({ app, obsidian }, l: number, c: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            view?.editor.setCursor(l, c);
            view?.editor.focus();
        },
        line,
        ch,
    );
    await browser.pause(200);
    await obsidianPage.openFile(B);
    await browser.pause(400);
}

describe('<C-^> returns to the alternate note at its last cursor', function () {
    before(async function () {
        await obsidianPage.write(A, A_TEXT);
        await obsidianPage.write(B, 'other file\nsecond\n');
        await loadSingleFileWorkspace();
    });

    after(async function () {
        await handleEx('set nosol');
        await obsidianPage.delete(A);
        await obsidianPage.delete(B);
    });

    it("keeps the column without 'startofline'", async function () {
        await handleEx('set nosol');
        await leaveAAt(1, 9);
        await pressInEditor('<C-^>');
        await browser.waitUntil(async () => (await activeFile()) === A, {
            timeout: 3000,
        });
        await browser.pause(300);
        expect(await getCursorPos()).toEqual({ line: 1, ch: 9 });
    });

    it("goes to the first non-blank with 'startofline'", async function () {
        await handleEx('set sol');
        await leaveAAt(1, 9);
        await pressInEditor('<C-^>');
        await browser.waitUntil(async () => (await activeFile()) === A, {
            timeout: 3000,
        });
        await browser.pause(300);
        expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
    });

    it('also for <C-w><C-^>, which opens it in a split', async function () {
        await handleEx('set nosol');
        await leaveAAt(2, 6);
        await pressInEditor('<C-w>');
        await pressInEditor('<C-^>');
        await browser.waitUntil(async () => (await activeFile()) === A, {
            timeout: 3000,
        });
        await browser.pause(300);
        expect(await getCursorPos()).toEqual({ line: 2, ch: 6 });
    });
});
