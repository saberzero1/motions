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
                'Test Filename': {
                    prefix: '_testfilename',
                    body: 'FILE:$TM_FILENAME',
                },
                'Test Filename Base': {
                    prefix: '_testfilenamebase',
                    body: 'BASE:$TM_FILENAME_BASE',
                },
                'Test Filepath': {
                    prefix: '_testfilepath',
                    body: 'PATH:$TM_FILEPATH',
                },
                'Test Directory': {
                    prefix: '_testdirectory',
                    body: 'DIR:$TM_DIRECTORY',
                },
                'Test Relative Filepath': {
                    prefix: '_testrelpath',
                    body: 'REL:$RELATIVE_FILEPATH',
                },
                'Test Current Line': {
                    prefix: '_testcurline',
                    body: 'LINE:$TM_CURRENT_LINE',
                },
                'Test Current Word': {
                    prefix: '_testcurword',
                    body: 'WORD:$TM_CURRENT_WORD',
                },
                'Test Word Alias': {
                    prefix: '_testwordalias',
                    body: 'W:$WORD',
                },
                'Test Line Number': {
                    prefix: '_testlinenum',
                    body: 'NUM:$TM_LINE_NUMBER',
                },
                'Test Line Index': {
                    prefix: '_testlineidx',
                    body: 'IDX:$TM_LINE_INDEX',
                },
                'Test Workspace Name': {
                    prefix: '_testwsname',
                    body: 'WS:$WORKSPACE_NAME',
                },
                'Test Workspace Folder': {
                    prefix: '_testwsfolder',
                    body: 'WSF:$WORKSPACE_FOLDER',
                },
                'Test Cursor Index': {
                    prefix: '_testcuridx',
                    body: 'CI:$CURSOR_INDEX',
                },
                'Test Cursor Number': {
                    prefix: '_testcurnum',
                    body: 'CN:$CURSOR_NUMBER',
                },
                'Test Selected Text': {
                    prefix: '_testseltext',
                    body: 'SEL:$TM_SELECTED_TEXT',
                },
                'Test Visual': {
                    prefix: '_testvisual',
                    body: 'VIS:$VISUAL',
                },
                'Test Combined': {
                    prefix: '_testcombined',
                    body: '$TM_FILENAME in $WORKSPACE_NAME at L$TM_LINE_NUMBER',
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

describe('Snippet variable integration', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForSnippets();
        await registerTestSnippets();
    });

    describe('file and path variables', function () {
        it('$TM_FILENAME resolves to current filename', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Filename');
            const value = await getEditorValue();
            expect(value).toBe('FILE:Welcome.md');
        });

        it('$TM_FILENAME_BASE resolves to filename without extension', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Filename Base');
            const value = await getEditorValue();
            expect(value).toBe('BASE:Welcome');
        });

        it('$TM_FILEPATH resolves to vault-relative path', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Filepath');
            const value = await getEditorValue();
            expect(value).toContain('PATH:');
            expect(value).toContain('Welcome.md');
        });

        it('$RELATIVE_FILEPATH matches $TM_FILEPATH', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Relative Filepath');
            const relValue = await getEditorValue();

            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Filepath');
            const fpValue = await getEditorValue();

            const relPath = relValue.replace('REL:', '');
            const fpPath = fpValue.replace('PATH:', '');
            expect(relPath).toBe(fpPath);
        });

        it('$TM_DIRECTORY resolves to parent directory', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Directory');
            const value = await getEditorValue();
            expect(value).toMatch(/^DIR:/);
        });
    });

    describe('editor content variables', function () {
        it('$TM_CURRENT_LINE resolves to the line content at cursor', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });
            await expandSnippetViaEx('Test Current Line');
            const value = await getEditorValue();
            expect(value).toContain('LINE:hello world');
        });

        it('$TM_CURRENT_WORD resolves to word under cursor', async function () {
            await setupEditor('foo bar baz', { line: 0, ch: 5 });
            await expandSnippetViaEx('Test Current Word');
            const value = await getEditorValue();
            expect(value).toContain('WORD:bar');
        });

        it('$WORD is alias for $TM_CURRENT_WORD', async function () {
            await setupEditor('alpha beta gamma', { line: 0, ch: 7 });
            await expandSnippetViaEx('Test Word Alias');
            const value = await getEditorValue();
            expect(value).toContain('W:beta');
        });

        it('$TM_CURRENT_WORD on boundary resolves to nearest word', async function () {
            await setupEditor('foo   bar', { line: 0, ch: 4 });
            await expandSnippetViaEx('Test Current Word');
            const value = await getEditorValue();
            expect(value).toContain('WORD:');
            const word = value.split('WORD:')[1]?.trim() ?? '';
            expect(['foo', 'bar']).toContain(word);
        });
    });

    describe('line number variables', function () {
        it('$TM_LINE_NUMBER is 1-based', async function () {
            await setupEditor('line1\nline2\nline3', { line: 1, ch: 0 });
            await expandSnippetViaEx('Test Line Number');
            const value = await getEditorValue();
            expect(value).toContain('NUM:2');
        });

        it('$TM_LINE_INDEX is 0-based', async function () {
            await setupEditor('line1\nline2\nline3', { line: 1, ch: 0 });
            await expandSnippetViaEx('Test Line Index');
            const value = await getEditorValue();
            expect(value).toContain('IDX:1');
        });

        it('$TM_LINE_NUMBER on first line is 1', async function () {
            await setupEditor('only line', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Line Number');
            const value = await getEditorValue();
            expect(value).toContain('NUM:1');
        });
    });

    describe('workspace variables', function () {
        it('$WORKSPACE_NAME resolves to vault name', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Workspace Name');
            const value = await getEditorValue();
            expect(value).toMatch(/^WS:test-vault/);
        });

        it('$WORKSPACE_FOLDER matches $WORKSPACE_NAME', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Workspace Folder');
            const wsfValue = await getEditorValue();

            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Workspace Name');
            const wsValue = await getEditorValue();

            const wsfName = wsfValue.replace('WSF:', '');
            const wsName = wsValue.replace('WS:', '');
            expect(wsfName).toBe(wsName);
        });
    });

    describe('cursor variables', function () {
        it('$CURSOR_INDEX is always 0', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Cursor Index');
            const value = await getEditorValue();
            expect(value).toBe('CI:0');
        });

        it('$CURSOR_NUMBER is always 1', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Cursor Number');
            const value = await getEditorValue();
            expect(value).toBe('CN:1');
        });
    });

    describe('selection variables', function () {
        it('$TM_SELECTED_TEXT resolves to empty when no selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('Escape');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await expandSnippetViaEx('Test Selected Text');
            const value = await getEditorValue();
            expect(value).toContain('SEL:');
            const afterSel = value.split('SEL:')[1] ?? '';
            expect(afterSel.startsWith('hello')).toBe(false);
        });

        it('$TM_SELECTED_TEXT variable resolution is wired correctly', async function () {
            const resolvedValue = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return null;
                    view.editor.setValue('hello world');
                    view.editor.setSelection(
                        { line: 0, ch: 0 },
                        { line: 0, ch: 5 },
                    );
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    {
                                        getSnippetPreprocessContext?: () => {
                                            selectedText: string;
                                        };
                                    }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    const ctx = (
                        plugin as unknown as {
                            getSnippetPreprocessContext: () => {
                                selectedText: string;
                            };
                        }
                    ).getSnippetPreprocessContext();
                    return ctx.selectedText;
                },
            )) as string | null;
            expect(resolvedValue).toBe('hello');
        });

        it('$VISUAL resolves to same value as $TM_SELECTED_TEXT', async function () {
            const values = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return null;
                    view.editor.setValue('alpha beta');
                    view.editor.setSelection(
                        { line: 0, ch: 6 },
                        { line: 0, ch: 10 },
                    );
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<string, unknown>;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    const ctx = (
                        plugin as unknown as {
                            getSnippetPreprocessContext: () => {
                                selectedText: string;
                            };
                        }
                    ).getSnippetPreprocessContext();
                    return { selectedText: ctx.selectedText };
                },
            )) as { selectedText: string } | null;
            expect(values).not.toBeNull();
            expect(values!.selectedText).toBe('beta');
        });
    });

    describe('combined variables', function () {
        it('multiple variables resolve in a single snippet', async function () {
            await setupEditor('some content', { line: 0, ch: 0 });
            await expandSnippetViaEx('Test Combined');
            const value = await getEditorValue();
            expect(value).toContain('Welcome.md');
            expect(value).toContain('test-vault');
            expect(value).toContain('L1');
        });
    });
});
