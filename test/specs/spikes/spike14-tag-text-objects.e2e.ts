import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 14: Tag text objects (it/at) in Markdown', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should test dit via handleKey on simple HTML', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('<div>hello world</div>');
            view.editor.setCursor(0, 7);
            view.editor.focus();

            const before = view.editor.getValue();
            Vim.handleKey(adapter, 'd');
            Vim.handleKey(adapter, 'i');
            Vim.handleKey(adapter, 't');
            const after = view.editor.getValue();

            return { before, after, changed: before !== after };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('dit via handleKey:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('after');
    });

    it('should test dit via browser.keys on simple HTML', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('<div>hello world</div>');
            view.editor.setCursor(0, 7);
            view.editor.focus();
        });
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(50);
        await browser.keys(['d']);
        await browser.pause(30);
        await browser.keys(['i']);
        await browser.pause(30);
        await browser.keys(['t']);
        await browser.pause(300);

        const after = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue() ?? '';
        })) as string;

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('dit via browser.keys:', JSON.stringify({ after }));
        expect(typeof after).toBe('string');
    });

    it('should test dit on multiline HTML', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue(
                '<details>\n<summary>Title</summary>\nBody text\n</details>',
            );
            view.editor.setCursor(2, 0);
            view.editor.focus();

            const before = view.editor.getValue();
            Vim.handleKey(adapter, 'd');
            Vim.handleKey(adapter, 'i');
            Vim.handleKey(adapter, 't');
            const after = view.editor.getValue();

            return { before, after, changed: before !== after };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('dit multiline:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('after');
    });

    it('should check if XML tag matching is available in CM Vim', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getVimGlobalState_: () => Record<string, unknown>;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const globalState = Vim.getVimGlobalState_();
            const keymap = (globalState as Record<string, unknown>)
                .defaultKeymap as Array<Record<string, unknown>> | undefined;

            const tagMotions = keymap?.filter((entry) => {
                const motion = entry.motion as string | undefined;
                const keys = entry.keys as string | undefined;
                return (
                    motion?.toLowerCase().includes('tag') ||
                    keys === 'it' ||
                    keys === 'at'
                );
            });

            return {
                hasKeymap: !!keymap,
                keymapLength: keymap?.length ?? 0,
                tagMotions: tagMotions ?? [],
                tagMotionCount: tagMotions?.length ?? 0,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Tag motion search:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('hasKeymap');
    });
});
