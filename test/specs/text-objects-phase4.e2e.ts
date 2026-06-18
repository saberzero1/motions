import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, vimKeys } from '../helpers';

describe('Phase 4 text objects', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Strikethrough (i~/a~)', function () {
        it('di~ should delete inside strikethrough delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe('Hello ~~~~ world');
        });

        it('da~ should delete around strikethrough including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '~');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('should no-op when cursor is outside ~~ delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe(
                'Hello ~~strikethrough~~ world',
            );
        });
    });

    describe('Highlight (i=/a=)', function () {
        it('di= should delete inside highlight delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '=');
            expect(await getEditorValue()).toBe('Hello ==== world');
        });

        it('da= should delete around highlight including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '=');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('should no-op when cursor is outside == delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '=');
            expect(await getEditorValue()).toBe('Hello ==highlight== world');
        });
    });

    describe('Smart asterisk (i* with single vs double)', function () {
        it('di* should delete inside single *italic*', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello *italic* world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello ** world');
        });

        it('da* should delete around single *italic*', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello *italic* world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di* should still work inside **bold**', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });
    });

    describe('Multi-line delimiter text objects', function () {
        it('di* should delete inside bold spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold\ntext** world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* should delete around bold spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold\ntext** world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di_ should delete inside italic spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello _italic\ntext_ world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '_');
            expect(await getEditorValue()).toBe('Hello __ world');
        });
    });

    describe('Empty delimiter edge cases', function () {
        it('di* on empty bold should not change content', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **** world');
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* on empty bold should delete delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **** world');
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di~ on empty strikethrough should not change', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~~~ world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe('Hello ~~~~ world');
        });

        it('da= on empty highlight should delete delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==== world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '=');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });

    describe('Visual and yank with text objects', function () {
        it('vi* should select inside bold in visual mode', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('v', 'i', '*');
            const selection = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    return view?.editor.getSelection() ?? '';
                },
            )) as string;
            expect(selection.startsWith('bold')).toBe(true);
            await browser.keys(['Escape']);
            await browser.pause(200);
        });

        it('yi* should yank inside bold', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'i', '*');
            await vimKeys('$', 'p');
            expect(await getEditorValue()).toBe('Hello **bold** worldbold');
        });
    });
});
