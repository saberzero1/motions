/**
 * Spike: Edge cases for snippet visual selection recovery
 *
 * Tests edge cases identified during the fix for :snippet visual selection
 * support (Discussion #108). Each test corresponds to a specific risk from
 * the implementation plan.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getVimMode,
    PAUSE,
    sendVimEscape,
    setupEditor,
    vimKeys,
} from '../../helpers';

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
    expect(result).toHaveProperty('success', true);
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

describe('Spike: Snippet visual selection edge cases', function () {
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

        it('charwise v across lines selects partial lines', async function () {
            await setupEditor('first line\nsecond line', {
                line: 0,
                ch: 6,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('v', 'j', 'e');
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<');
            expect(value).toContain('>>');
            expect(value).not.toBe('<<>>');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 3: Visual block mode (<C-v>)
    // -----------------------------------------------------------------------

    describe('visual block mode (<C-v>)', function () {
        it('block selection produces some text (not empty)', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('<C-v>', 'j', 'j', 'l', 'l');
            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<');
            expect(value).toContain('>>');
            expect(value).not.toBe('<<>>');
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

    // -----------------------------------------------------------------------
    // Edge case 5: Bookmark invalidation — visual, delete all, then :snippet
    // -----------------------------------------------------------------------

    describe('bookmark invalidation after content deletion', function () {
        it('falls back to empty when marks are invalidated', async function () {
            await setupEditor('delete me', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimHandleKeys('v', 'i', 'w');
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) {
                    view.editor.setValue('completely new content');
                    view.editor.setCursor(0, 0);
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await expandSnippetViaEx('Edge Wrap');
            const value = await getEditorValue();
            expect(value).toContain('<<');
            expect(value).toContain('>>');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 6: Picker-based expansion (latent bug — no cm access)
    // -----------------------------------------------------------------------

    describe('picker-based snippet expansion', function () {
        it('picker expansion from normal mode works (baseline)', async function () {
            await setupEditor('picker test', { line: 0, ch: 5 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = await handleEx('snippet Edge Wrap');
            expect(result).toHaveProperty('success', true);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value).toContain('<<>>');
        });
    });

    // -----------------------------------------------------------------------
    // Edge case 7: Tabstop mode after visual :snippet
    // -----------------------------------------------------------------------

    describe('mode state after visual :snippet expansion', function () {
        it('vim is in normal mode after visual :snippet (pre-existing behavior)', async function () {
            await visualSelectAndExpand('word', 'viw', 'Edge Link');
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });

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
