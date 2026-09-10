import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getEditorValue, sendVimEscape } from '../../helpers';

async function vimHandleKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keyList: string[]) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm as Record<string, unknown> | undefined;
        if (!adapter) return;
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const vim = (
            (adapter as Record<string, unknown>).state as Record<
                string,
                unknown
            >
        )?.vim as Record<string, unknown> | undefined;
        for (const key of keyList) {
            if (
                vim?.insertMode &&
                key.length === 1 &&
                key >= ' ' &&
                key <= '~'
            ) {
                (
                    adapter as {
                        replaceSelection: (s: string) => void;
                    }
                ).replaceSelection(key);
            } else {
                Vim.handleKey(adapter, key);
            }
        }
    }, keys);
}

describe('Visual block insert runtime behavior', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('real-time block insert', function () {
        it('typing after block I should show text on all lines before Esc', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'H', 'i');
            await browser.pause(300);

            const midState = await getEditorValue();
            expect(midState).toBe('Hiabc\nHidef\nHighi');

            await vimHandleKeys('<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('Hiabc\nHidef\nHighi');
        });
    });

    describe('block insert dot-repeat', function () {
        it('. should repeat block insert on same number of lines', async function () {
            await setupEditor('abc\ndef\nghi\njkl\nmno\npqr', {
                line: 0,
                ch: 0,
            });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'X', '<Esc>');
            await browser.pause(300);

            await vimHandleKeys('j', 'j', 'j', '.');
            await browser.pause(300);

            expect(await getEditorValue()).toBe(
                'Xabc\nXdef\nXghi\nXjkl\nXmno\nXpqr',
            );
        });
    });
});
