import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

async function getEditorValue(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
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
});
