import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, PAUSE } from '../helpers';

describe('Context actions smoke', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.executeObsidian(() => {
            document
                .querySelectorAll('.modal-container')
                .forEach((el) => el.remove());
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it(':contextactions should open a modal', async function () {
        await setupEditor('hello world', { line: 0, ch: 0 });

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'contextactions');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        })) as { success?: true; error?: string };

        expect(result).toHaveProperty('success', true);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasModal = (await browser.executeObsidian(() => {
            return !!document.querySelector('.modal-container');
        })) as boolean;
        expect(hasModal).toBe(true);
    });
});
