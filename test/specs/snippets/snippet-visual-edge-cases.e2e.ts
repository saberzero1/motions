/**
 * Edge cases for snippet visual selection recovery.
 *
 * Tests edge cases identified during the fix for :snippet visual selection
 * support (Discussion #108). Each test corresponds to a specific risk from
 * the implementation plan.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    handleEx,
    PAUSE,
    sendVimEscape,
    setupEditor,
} from '../../helpers';

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
        for (const key of keyList) {
            Vim.handleKey(adapter, key);
        }
    }, keys);
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

async function registerTestSnippets(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            snippetRegistry?: {
                                loadFile: (
                                    file: Record<
                                        string,
                                        {
                                            prefix: string;
                                            body: string | string[];
                                            description?: string;
                                        }
                                    >,
                                    source: string,
                                ) => void;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin?.snippetRegistry) return;
        plugin.snippetRegistry.loadFile(
            {
                'Edge Wrap': {
                    prefix: '_edgewrap',
                    body: '<<$TM_SELECTED_TEXT>>',
                },
                'Edge Link': {
                    prefix: '_edgelink',
                    body: '[${1:$TM_SELECTED_TEXT}](${2:url})$0',
                },
            },
            'user',
        );
    });
}

async function expandSnippetViaEx(name: string): Promise<void> {
    const result = await handleEx(`snippet ${name}`);
    expect(result.unknownCommand).toBe(false);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function visualSelectAndExpand(
    content: string,
    selectKeys: string,
    snippetName: string,
): Promise<void> {
    await setupEditor(content, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const key of selectKeys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.MODE_SWITCH);
    await expandSnippetViaEx(snippetName);
}

describe('Snippet visual selection edge cases', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForSnippets();
        await registerTestSnippets();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.KEY_GAP);
    });

    // -----------------------------------------------------------------------
    // Edge case 1: Visual line mode (V)
    // -----------------------------------------------------------------------

    describe('visual line mode (V)', function () {
        it('V selects entire line and wraps it', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('V');
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<hello world>>');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 2: Multi-line visual selection
    // -----------------------------------------------------------------------

    describe('multi-line visual selection', function () {
        it('Vjj selects three lines and wraps them', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('V', 'j', 'j');
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<line one');
            expect(value).toContain('line three>>');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 4: Stale lastSelection — exit visual, edit, then :snippet
    // -----------------------------------------------------------------------

    describe('stale lastSelection after normal-mode edits', function () {
        it('normal-mode :snippet after prior visual exits uses stale marks', async function () {
            await setupEditor('select this text', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('v', 'i', 'w');
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<select>>');
        });
    });

    describe('mode state after visual :snippet expansion', function () {
        it('snippet text is correct despite normal mode', async function () {
            await visualSelectAndExpand('word', 'viw', 'Edge Link');
            const value = await getEditorValue();
            expect(value).toContain('[word](url)');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 8: Off-by-one at end-of-line
    // -----------------------------------------------------------------------

    describe('end-of-line mark position', function () {
        it('v$ selects to end of line and wraps correctly', async function () {
            await visualSelectAndExpand('select to end', 'v$', 'Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<select to end');
            expect(value).toContain('>>');
        });

        it('single character at end of line wraps correctly', async function () {
            await setupEditor('x', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['v']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<x>>');
        });

        it('v$ on multi-word line captures everything', async function () {
            await setupEditor('hello world foo bar', { line: 0, ch: 6 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('v', '$');
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<world foo bar');
            expect(value).toContain('>>');
        });
    });
});
