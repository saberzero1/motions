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
    });
});
