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

        it('daB on nested blockquote should not leave empty line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> h\n> h\n>> j\n>> j\n>>> k\n>>> k\n>> j\n>> j\n> h\n> h',
                );
                view.editor.setCursor(4, 4);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', 'B');
            const val = await getEditorValue();
            expect(val).toBe('> h\n> h\n>> j\n>> j\n>> j\n>> j\n> h\n> h');
        });

        it('diB with nested blockquote should delete inner content', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('> outer\n>> nested inner\n> more outer');
                view.editor.setCursor(1, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'B');
            const val = await getEditorValue();
            expect(val).toContain('outer');
        });

        it('diB with spaced nested blockquote should delete inner content', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('> outer\n> > nested inner\n> more outer');
                view.editor.setCursor(1, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'B');
            const val = await getEditorValue();
            expect(val).toContain('outer');
            expect(val).toContain('more outer');
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

        it('dio with multi-paragraph callout should delete body', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> [!warning] Careful\n> Line one\n> Line two\n> Line three',
                );
                view.editor.setCursor(2, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', 'o');
            const val = await getEditorValue();
            expect(val).toContain('[!warning]');
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
