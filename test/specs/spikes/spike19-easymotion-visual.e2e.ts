import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getSelection,
    getVimMode,
    sendVimEscape,
} from '../../helpers';

describe('Spike 19: EasyMotion visual + operator-pending feasibility', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('Q1: does an action receive visualMode=true when triggered in visual mode?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (
                                    cm: unknown,
                                    actionArgs: unknown,
                                    vim: unknown,
                                ) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let captured: Record<string, unknown> | null = null;
            Vim.defineAction(
                'spike19VisualTest',
                (_cm: unknown, _args: unknown, vim: unknown) => {
                    captured = vim as Record<string, unknown>;
                },
            );
            Vim.mapCommand('gQ', 'action', 'spike19VisualTest', {});

            view.editor.setValue('hello world foo bar');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'Q');

            return {
                actionFired: captured !== null,
                visualMode: captured?.visualMode ?? null,
                visualLine: captured?.visualLine ?? null,
                visualBlock: captured?.visualBlock ?? null,
                capturedKeys: captured ? Object.keys(captured) : [],
            };
        });

        console.log(
            'Q1 (action in visual mode):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('Q2: does setCursor() inside an action extend visual selection or reset it?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            Vim.defineAction('spike19SetCursor', (cmArg: unknown) => {
                const c = cmArg as {
                    setCursor: (l: number, ch: number) => void;
                };
                c.setCursor(0, 10);
            });
            Vim.mapCommand('gZ', 'action', 'spike19SetCursor', {});

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'Z');

            const selection = view.editor.getSelection();
            const cursorAfter = view.editor.getCursor();
            const vimState = (adapter as Record<string, unknown>).state as
                | Record<string, unknown>
                | undefined;
            const vim = vimState?.vim as Record<string, unknown> | undefined;

            return {
                selection,
                selectionLength: selection.length,
                cursorLine: cursorAfter.line,
                cursorCh: cursorAfter.ch,
                stillInVisual: vim?.visualMode ?? null,
            };
        });

        console.log(
            'Q2 (setCursor in visual):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('Q3: can we access getCursor("anchor") and getCursor("head") in visual mode?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            type CursorFn = (start?: string) => { line: number; ch: number };
            let anchorResult: { line: number; ch: number } | null = null;
            let headResult: { line: number; ch: number } | null = null;
            let defaultResult: { line: number; ch: number } | null = null;

            Vim.defineAction('spike19Anchor', (cmArg: unknown) => {
                const c = cmArg as { getCursor: CursorFn };
                try {
                    anchorResult = c.getCursor('anchor');
                } catch {
                    anchorResult = null;
                }
                try {
                    headResult = c.getCursor('head');
                } catch {
                    headResult = null;
                }
                defaultResult = c.getCursor();
            });
            Vim.mapCommand('gX', 'action', 'spike19Anchor', {});

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, 'l');
            Vim.handleKey(adapter, 'l');
            Vim.handleKey(adapter, 'l');
            Vim.handleKey(adapter, 'l');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'X');

            return {
                anchor: anchorResult,
                head: headResult,
                default: defaultResult,
            };
        });

        console.log(
            'Q3 (getCursor anchor/head):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('Q4: can we manipulate CM6 EditorView selection directly in visual mode?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let cm6SelectionBefore: unknown = null;
            let cm6SelectionAfter: unknown = null;

            Vim.defineAction('spike19CM6', (cmArg: unknown) => {
                const c = cmArg as {
                    cm6: {
                        state: {
                            selection: {
                                main: { anchor: number; head: number };
                            };
                        };
                        dispatch: (spec: unknown) => void;
                    };
                    indexFromPos: (pos: { line: number; ch: number }) => number;
                };
                cm6SelectionBefore = {
                    anchor: c.cm6.state.selection.main.anchor,
                    head: c.cm6.state.selection.main.head,
                };

                const targetOffset = c.indexFromPos({ line: 0, ch: 10 });
                const anchorOffset = c.cm6.state.selection.main.anchor;

                const EditorSelection = (
                    window as unknown as Record<string, unknown>
                ).CM as
                    | {
                          EditorSelection?: {
                              cursor: (pos: number) => unknown;
                              range: (anchor: number, head: number) => unknown;
                              create: (ranges: unknown[]) => unknown;
                          };
                      }
                    | undefined;

                if (EditorSelection?.EditorSelection) {
                    const sel = EditorSelection.EditorSelection;
                    c.cm6.dispatch({
                        selection: sel.create([
                            sel.range(anchorOffset, targetOffset),
                        ]),
                    });
                } else {
                    c.cm6.dispatch({
                        selection: { anchor: anchorOffset, head: targetOffset },
                    });
                }

                cm6SelectionAfter = {
                    anchor: c.cm6.state.selection.main.anchor,
                    head: c.cm6.state.selection.main.head,
                };
            });
            Vim.mapCommand('gY', 'action', 'spike19CM6', {});

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'Y');

            const selection = view.editor.getSelection();
            const vimState = (adapter as Record<string, unknown>).state as
                | Record<string, unknown>
                | undefined;
            const vim = vimState?.vim as Record<string, unknown> | undefined;

            return {
                cm6SelectionBefore,
                cm6SelectionAfter,
                editorSelection: selection,
                stillInVisual: vim?.visualMode ?? null,
            };
        });

        console.log(
            'Q4 (CM6 dispatch selection):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('Q5: does action fire after d (operator-pending) with multi-key sequence?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (
                                    cm: unknown,
                                    args: unknown,
                                    vim: unknown,
                                ) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let actionFired = false;
            let capturedVim: Record<string, unknown> | null = null;

            Vim.defineAction(
                'spike19OpPend',
                (_cm: unknown, _args: unknown, vim: unknown) => {
                    actionFired = true;
                    capturedVim = vim as Record<string, unknown>;
                },
            );
            Vim.mapCommand('gV', 'action', 'spike19OpPend', {});

            view.editor.setValue('hello world foo bar');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'd');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'V');

            const contentAfter = view.editor.getValue();

            return {
                actionFired,
                contentChanged: contentAfter !== 'hello world foo bar',
                contentAfter,
                vimStateKeys: capturedVim ? Object.keys(capturedVim) : [],
            };
        });

        console.log(
            'Q5 (action after d operator):',
            JSON.stringify(result, null, 2),
        );
        expect(result).not.toHaveProperty('error');
    });

    it('Q6: does action fire in V (linewise visual) and expose visualLine?', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (
                                    cm: unknown,
                                    args: unknown,
                                    vim: unknown,
                                ) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let captured: Record<string, unknown> | null = null;

            Vim.defineAction(
                'spike19VLine',
                (_cm: unknown, _args: unknown, vim: unknown) => {
                    captured = vim as Record<string, unknown>;
                },
            );
            Vim.mapCommand('gW', 'action', 'spike19VLine', {});

            view.editor.setValue('line one\nline two\nline three');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'V');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'W');

            return {
                actionFired: captured !== null,
                visualMode: captured?.visualMode ?? null,
                visualLine: captured?.visualLine ?? null,
            };
        });

        console.log('Q6 (V linewise visual):', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });
});
