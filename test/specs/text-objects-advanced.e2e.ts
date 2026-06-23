import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, vimKeys } from '../helpers';

describe('Advanced text objects (Phase 1.2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Wikilink (il/al)', function () {
        it('dil should delete link text inside [[wikilink]]', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Go to [[my page]] now');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'l');
            expect(await getEditorValue()).toBe('Go to [[]] now');
        });

        it('dal should delete entire [[wikilink]]', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Go to [[my page]] now');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'l');
            expect(await getEditorValue()).toBe('Go to  now');
        });
    });

    describe('Wikilink edge cases (il/al)', function () {
        it('dil on wikilink with alias should delete inner content', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('See [[note|alias]] here');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'l');
            expect(await getEditorValue()).toBe('See [[]] here');
        });
    });

    describe('Markdown link (il/al)', function () {
        it('dil should delete link text inside [text](url)', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'Click [here](https://example.com) please',
                );
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'l');
            expect(await getEditorValue()).toBe(
                'Click [](https://example.com) please',
            );
        });

        it('dal should delete entire [text](url)', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'Click [here](https://example.com) please',
                );
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'l');
            expect(await getEditorValue()).toBe('Click  please');
        });
    });

    describe('Code block (iC/aC)', function () {
        it('diC should delete inside fenced code block', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'before\n```js\nconst x = 1;\nconst y = 2;\n```\nafter',
                );
                view.editor.setCursor(2, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'C');
            expect(await getEditorValue()).toBe('before\n```js\n\n```\nafter');
        });

        it('daC should delete entire fenced code block', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('before\n```js\nconst x = 1;\n```\nafter');
                view.editor.setCursor(2, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'C');
            expect(await getEditorValue()).toBe('before\n\nafter');
        });

        it('diC with empty code block should leave fences', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('before\n```\n```\nafter');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'C');
            expect(await getEditorValue()).toBe('before\n```\n```\nafter');
        });

        it('should no-op when cursor is outside code block', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('before\n```js\ncode\n```\nafter');
                view.editor.setCursor(0, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'C');
            expect(await getEditorValue()).toBe(
                'before\n```js\ncode\n```\nafter',
            );
        });

        it('di* should not match delimiters inside fenced code block', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '**bold\n```\n**not a match**\n```\nbold**',
                );
                view.editor.setCursor(0, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('****');
        });
    });
});
