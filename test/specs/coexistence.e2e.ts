import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Plugin coexistence', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should not interfere with built-in Vim text objects', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setValue('hello (world) end');
            view.editor.setCursor(0, 8);
            view.editor.focus();
            return { ready: true };
        });
        expect(result).toHaveProperty('ready', true);

        await browser.pause(300);
        await browser.keys(['Escape']);
        await browser.pause(50);
        await browser.keys(['d', 'i', '(']);
        await browser.pause(200);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue() ?? '';
        });
        expect(content).toBe('hello () end');
    });

    it('should not interfere with built-in Vim motions (w, b, e)', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('one two three');
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(300);
        await browser.keys(['Escape']);
        await browser.pause(50);
        await browser.keys(['w']);
        await browser.pause(200);

        const cursor = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getCursor();
        });
        expect(cursor).toHaveProperty('ch', 4);
    });

    it('should detect vimrc-support presence without error', async function () {
        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as Record<string, unknown> & {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return {
                hasVimMotions: 'vim-motions' in plugins,
                hasVimrcSupport: 'obsidian-vimrc-support' in plugins,
            };
        });
        expect(result).toHaveProperty('hasVimMotions', true);
        expect(result).toHaveProperty('hasVimrcSupport', false);
    });
});
