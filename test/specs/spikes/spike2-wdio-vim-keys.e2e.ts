import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 2: wdio Vim keystroke reliability', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should enter insert mode with i, type text, and exit with Escape', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('');
            view.editor.setCursor(0, 0);
        });

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(100);
        await browser.keys(['i']);
        await browser.pause(100);
        await browser.keys('Hello Vim'.split(''));
        await browser.pause(100);
        await browser.keys(['Escape']);
        await browser.pause(200);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Hello Vim');
    });

    it('should delete a line with dd', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Line 1\nLine 2\nLine 3');
            view.editor.setCursor(1, 0);
            view.editor.focus();
        });
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(100);
        await browser.keys(['d', 'd']);
        await browser.pause(300);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Line 1\nLine 3');
    });

    it('should yank and paste with yy and p', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Original line');
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(100);
        await browser.keys(['y', 'y']);
        await browser.pause(100);
        await browser.keys(['p']);
        await browser.pause(300);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Original line\nOriginal line');
    });

    it('should handle multi-key Vim sequences (daw)', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Delete this word here');
            view.editor.setCursor(0, 7);
            view.editor.focus();
        });
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(100);
        await browser.keys(['d', 'a', 'w']);
        await browser.pause(300);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Delete word here');
    });
});
