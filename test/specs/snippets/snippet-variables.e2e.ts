import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, PAUSE, setupEditor, vimKeys } from '../../helpers';

async function handleEx(
    command: string,
): Promise<{ success?: true; error?: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
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
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success?: true; error?: string };
}

async function isPickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-picker');
    })) as boolean;
}

async function closePicker(): Promise<void> {
    await browser.executeObsidian(() => {
        const input = document.querySelector(
            '.vim-motions-picker-input',
        ) as HTMLInputElement | null;
        if (input) {
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                }),
            );
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function waitForSnippets(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        getAll: () => unknown[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const all = plugin?.snippetRegistry?.getAll();
                return Array.isArray(all) && all.length > 0;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

describe('Snippet variables and ex commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForSnippets();
    });

    it('should resolve $CURRENT_YEAR in date snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('date');
        const value = await getEditorValue();
        const currentYear = new Date().getFullYear().toString();
        expect(value).toContain(currentYear);
    });

    it('should resolve $UUID to valid UUID v4', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('uuid');
        const value = (await getEditorValue()).trim();
        expect(value).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    it.skip(':snippet command should expand by name', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        const result = await handleEx('snippet Wikilink');
        expect(result).toHaveProperty('success', true);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const value = await getEditorValue();
        expect(value).toContain('[[');
    });

    it.skip(':snippets should open picker', async function () {
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        const result = await handleEx('snippets');
        expect(result).toHaveProperty('success', true);
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        expect(await isPickerOpen()).toBe(true);
        await closePicker();
    });
});
