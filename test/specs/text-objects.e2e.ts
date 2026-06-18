import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, vimKeys } from '../helpers';

describe('Markdown text objects (Phase 1.1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Bold (i*/a*)', function () {
        it('di* should delete inside bold delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold text** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* should delete around bold including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold text** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('ci* should change inside bold', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold text** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('c', 'i', '*');
            await browser.keys('new'.split(''));
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('Hello **new** world');
        });

        it('should no-op when cursor is outside delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold text** world');
                view.editor.setCursor(0, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **bold text** world');
        });

        it('should handle multiple bold pairs on same line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('**first** and **second**');
                view.editor.setCursor(0, 17);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('**first** and ****');
        });
    });

    describe('Italic (i_/a_)', function () {
        it('di_ should delete inside italic delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello _italic text_ world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '_');
            expect(await getEditorValue()).toBe('Hello __ world');
        });

        it('da_ should delete around italic including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello _italic text_ world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '_');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });

    describe('Inline code (i`/a`)', function () {
        it('di` should delete inside code delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello `inline code` world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '`');
            expect(await getEditorValue()).toBe('Hello `` world');
        });

        it('da` should delete around code including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello `inline code` world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '`');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });

    describe('Math (i$/a$)', function () {
        it('di$ should delete inside math delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello $x + y$ world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '$');
            expect(await getEditorValue()).toBe('Hello $$ world');
        });

        it('da$ should delete around math including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello $x + y$ world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '$');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });
});
