import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, vimKeys } from '../helpers';

describe('Blockquote and callout text objects', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Blockquote (iB/aB)', function () {
        it('diB should delete inside single-line blockquote', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('> quoted text');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'B');
            expect(await getEditorValue()).toBe('> ');
        });

        it('daB should delete around blockquote', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'before\n> quoted text\n> more quoted\nafter',
                );
                view.editor.setCursor(1, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'B');
            expect(await getEditorValue()).toBe('before\n\nafter');
        });

        it('diB should not change content when cursor is outside blockquote', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('not a quote\n> quoted');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'B');
            expect(await getEditorValue()).toBe('not a quote\n> quoted');
        });
    });

    describe('Callout (io/ao)', function () {
        it('dio should delete inside callout', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> [!note] Title\n> Callout content\n> More content',
                );
                view.editor.setCursor(1, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'o');
            expect(await getEditorValue()).toBe('> [!note] Title\n> ');
        });

        it('dao should delete around callout', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'before\n> [!note] Title\n> Content\nafter',
                );
                view.editor.setCursor(1, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'o');
            expect(await getEditorValue()).toBe('before\n\nafter');
        });

        it('dio should not change content when cursor is outside callout', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('plain text\n> [!note] Title\n> Content');
                view.editor.setCursor(0, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'o');
            expect(await getEditorValue()).toBe(
                'plain text\n> [!note] Title\n> Content',
            );
        });
    });
});
