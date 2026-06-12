import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

async function getEditorValue(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
}

async function getCursorLine(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getCursor().line ?? -1;
    })) as number;
}

async function vimKeys(...keys: string[]) {
    await browser.keys(['Escape']);
    await browser.pause(50);
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(30);
    }
    await browser.pause(200);
}

describe('Hard-wrap operators (gq/gw)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('gq operator', function () {
        it('gqq should wrap a long line at textwidth', async function () {
            const longLine = 'word '.repeat(20).trim();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                expect(line.length).toBeLessThanOrEqual(80);
            }
        });

        it('gqq should not change a short line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Short line here');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            expect(await getEditorValue()).toBe('Short line here');
        });

        it('gq should preserve blockquote prefix on wrapped lines', async function () {
            const longQuote = '> ' + 'word '.repeat(20).trim();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                expect(line.startsWith('> ')).toBe(true);
            }
        });
    });

    describe('gw operator', function () {
        it('gw in visual line should wrap and keep cursor at original line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('V', 'g', 'w');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            const cursorLine = await getCursorLine();
            expect(cursorLine).toBe(0);
        });
    });
});
