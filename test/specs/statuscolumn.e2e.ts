import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, PAUSE } from '../helpers';

describe('Statuscolumn unified gutter', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    it('should not show statuscolumn gutter by default', async function () {
        await setupEditor('first line\nsecond line\nthird line', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        const hasStc = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const container = (
                view.editor as unknown as Record<string, unknown>
            ).cm as Record<string, unknown>;
            const dom = (container as unknown as { dom: HTMLElement }).dom;
            return dom?.querySelector('.vim-motions-statuscolumn') !== null;
        })) as boolean;

        expect(hasStc).toBe(false);
    });

    it('should have statuscolumn option registered in vim engine', async function () {
        const hasOption = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getOption: (name: string) => unknown;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;
            const val = Vim.getOption('statuscolumn');
            return val !== undefined;
        })) as boolean;

        expect(hasOption).toBe(true);
    });

    it('should have individual sign column gutter present by default', async function () {
        await setupEditor('first line\nsecond line\nthird line', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        const hasSignCol = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                return dom?.querySelector('.vim-motions-sign-column') !== null;
            },
        )) as boolean;

        expect(hasSignCol).toBe(true);
    });

    it('should preserve existing mark gutter functionality', async function () {
        await setupEditor('first line\nsecond line\nthird line', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.executeObsidian(({ app, obsidian }) => {
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
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, 'm');
            Vim.handleKey(adapter, 'a');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasMarks = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const container = (
                view.editor as unknown as Record<string, unknown>
            ).cm as Record<string, unknown>;
            const dom = (container as unknown as { dom: HTMLElement }).dom;
            return dom?.querySelector('.vim-motions-sign-marker') !== null;
        })) as boolean;

        expect(hasMarks).toBe(true);
    });
});
