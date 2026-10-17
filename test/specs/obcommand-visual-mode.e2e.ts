import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    sendVimEscape,
    loadLuaConfig,
    PAUSE,
} from '../helpers';

/**
 * Discussion #161: obcommand via vim mapping in visual mode loses selection
 *
 * The fork's ex command dispatcher exits visual mode BEFORE executing the
 * command.  Obsidian commands that depend on the editor selection (toggle
 * bullet list, toggle numbered list, etc.) receive an empty selection and
 * do nothing.  The command palette bypasses the fork entirely, so it works.
 */

describe('obcommand in visual mode (#161)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('obcommand toggle-bullet-list should apply to visual-line selection', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta', {
            line: 0,
            ch: 0,
        });

        // Given: visual-line mode selecting lines 0-2
        // When: :obcommand editor:toggle-bullet-list via handleEx
        // Then: all 3 selected lines get bullet markers
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;

            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, 'V');
            Vim.handleKey(cm, 'j');
            Vim.handleKey(cm, 'j');
            Vim.handleEx(cm, 'obcommand editor:toggle-bullet-list');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const lines = value.split('\n');
        const bulletLines = lines.filter((l: string) => /^- /.test(l));
        expect(bulletLines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toMatch(/^- alpha/);
        expect(lines[1]).toMatch(/^- beta/);
        expect(lines[2]).toMatch(/^- gamma/);
        expect(lines[3]).toBe('delta');
    });

    it('obcommand via exmap indirection should apply to visual-line selection', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta', {
            line: 0,
            ch: 0,
        });

        // Given: visual-line mode selecting lines 0-2
        // When: a defineEx wrapper calls handleEx('obcommand ...') (exmap pattern)
        // Then: all 3 selected lines get bullet markers via '</'> marks fallback
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            handleEx: (cm: unknown, input: string) => void;
                            defineEx: (
                                name: string,
                                short: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;

            Vim.defineEx('testbullets161', '', (cm2) => {
                Vim.handleEx(cm2, 'obcommand editor:toggle-bullet-list');
            });

            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, 'V');
            Vim.handleKey(cm, 'j');
            Vim.handleKey(cm, 'j');
            Vim.handleEx(cm, 'testbullets161');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const lines = value.split('\n');
        const bulletLines = lines.filter((l: string) => /^- /.test(l));
        expect(bulletLines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toMatch(/^- alpha/);
        expect(lines[1]).toMatch(/^- beta/);
        expect(lines[2]).toMatch(/^- gamma/);
        expect(lines[3]).toBe('delta');
    });

    it('obcommand toggle-numbered-list should apply to visual-line selection', async function () {
        await setupEditor('first\nsecond\nthird\nfourth', {
            line: 0,
            ch: 0,
        });

        // Given: visual-line mode selecting lines 0-1
        // When: :obcommand editor:toggle-numbered-list via handleEx
        // Then: both selected lines get numbered list markers
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;

            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, 'V');
            Vim.handleKey(cm, 'j');
            Vim.handleEx(cm, 'obcommand editor:toggle-numbered-list');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const lines = value.split('\n');
        const numberedLines = lines.filter((l: string) => /^\d+\.\s/.test(l));
        expect(numberedLines.length).toBeGreaterThanOrEqual(2);
        expect(lines[0]).toMatch(/^1\.\s+first/);
        expect(lines[1]).toMatch(/^2\.\s+second/);
        expect(lines[2]).toBe('third');
        expect(lines[3]).toBe('fourth');
    });
});

/**
 * Issue #192: a charwise visual selection is lost when a vim mapping runs
 * `:obcommand`.
 *
 * The reporter mapped `<C-n>` to `:obcommand
 * templater-obsidian:create-new-note-from-template` in `init.lua`, selected
 * text, and the template saw nothing.  The same command run from Obsidian's
 * command palette, which never goes through the fork, saw the selection.
 *
 * Measured through that exact path: the fork prefills `'<,'>` in visual mode,
 * so the ex dispatcher receives `'<,'>obcommand …` with `selectionLine` ===
 * `selectionLineEnd` === 0 for a selection inside one line, then exits visual
 * mode before running the command.  The #161 repair restores only a whole-line
 * range, and only when the two lines differ, so a charwise selection is either
 * dropped outright (single line) or widened to whole lines (multi-line).
 */
describe('obcommand with a charwise visual selection (#192)', function () {
    const CAPTURE_COMMAND_ID = 'vim-motions-e2e-192-capture-selection';

    before(async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.executeObsidian(({ app }, commandId: string) => {
            app.commands.addCommand({
                id: commandId,
                name: 'Capture selection (#192 e2e)',
                editorCallback: (editor) => {
                    (
                        window as unknown as {
                            __vimMotions192?: string | null;
                        }
                    ).__vimMotions192 = editor.getSelection();
                },
            });
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            map: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.map('<C-n>', `:obcommand ${commandId}<CR>`, 'visual');
        }, CAPTURE_COMMAND_ID);
    });

    after(async function () {
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: { unmap: (lhs: string, ctx?: string) => void };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            try {
                Vim?.unmap('<C-n>', 'visual');
            } catch {
                /* mapping already gone */
            }
        });
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    async function capturedSelection(): Promise<string | null> {
        return (await browser.executeObsidian(
            () =>
                (
                    window as unknown as {
                        __vimMotions192?: string | null;
                    }
                ).__vimMotions192 ?? null,
        )) as string | null;
    }

    async function clearCapturedSelection(): Promise<void> {
        await browser.executeObsidian(() => {
            (
                window as unknown as { __vimMotions192?: string | null }
            ).__vimMotions192 = null;
        });
    }

    it('passes a selection inside one line to the dispatched command', async function () {
        await clearCapturedSelection();
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });

        // Given: `beta` selected charwise, entirely inside line 0
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['v', 'l', 'l', 'l']);
        await browser.pause(PAUSE.KEY_GAP);
        // When: the mapped <C-n> fires `:obcommand <capture>`
        await browser.keys([Key.Control, 'n']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Then: the command sees exactly the selected word
        expect(await capturedSelection()).toBe('beta');
        expect(await getEditorValue()).toBe(
            'alpha beta gamma\nsecond line here',
        );
    });

    it('does not widen a charwise selection spanning two lines to whole lines', async function () {
        await clearCapturedSelection();
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });

        // Given: charwise selection from line 0 ch 6 to line 1 ch 6
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['v', 'j']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys([Key.Control, 'n']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Then: the command sees the charwise range, not both full lines
        expect(await capturedSelection()).toBe('beta gamma\nsecond ');
    });

    it('lets a core Obsidian command act on the charwise selection only', async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 4,
        });

        // Given: `a bet` selected charwise — deliberately straddling two words,
        // because editor:toggle-bold falls back to the word under the cursor
        // when it sees no selection, which a whole-word selection cannot tell
        // apart from a restored one
        // When: the ex input the mapping produces runs editor:toggle-bold
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;

            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, 'v');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, 'l');
            Vim.handleEx(cm, "'<,'>obcommand editor:toggle-bold");
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Then: exactly the selected characters are emboldened
        expect(await getEditorValue()).toBe(
            'alph**a bet**a gamma\nsecond line here',
        );
    });

    it('still passes whole lines for an explicit line range', async function () {
        await setupEditor('alpha beta gamma\nsecond line\nthird line', {
            line: 0,
            ch: 6,
        });

        // Given: a charwise selection left behind in the vim marks, and
        // When: `:1,2obcommand` asks for lines 1 to 2 instead
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;

            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, 'v');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, 'l');
            Vim.handleKey(cm, '<Esc>');
            Vim.handleEx(cm, '1,2obcommand editor:toggle-bullet-list');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Then: both requested lines are bulleted, and the stale charwise
        // selection did not narrow the range to line 1
        expect(await getEditorValue()).toBe(
            '- alpha beta gamma\n- second line\nthird line',
        );
    });
});

describe('obcommand after a previous visual selection (#200)', function () {
    const CAPTURE_COMMAND_ID = 'vim-motions-e2e-200-capture-selection';

    before(async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.executeObsidian(({ app }, commandId: string) => {
            app.commands.addCommand({
                id: commandId,
                name: 'Capture selection (#200 e2e)',
                editorCallback: (editor) => {
                    (
                        window as unknown as {
                            __vimMotions200?: string | null;
                        }
                    ).__vimMotions200 = editor.getSelection();
                },
            });
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            map: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                            defineEx: (
                                name: string,
                                short: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.map('<C-b>', `:obcommand ${commandId}<CR>`, 'normal');
            Vim?.defineEx('capture200', '', (cm) => {
                Vim.handleEx(cm, `obcommand ${commandId}`);
            });
        }, CAPTURE_COMMAND_ID);
    });

    after(async function () {
        await browser.executeObsidian(({ app }, commandId: string) => {
            app.commands.removeCommand(commandId);
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: { unmap: (lhs: string, ctx?: string) => void };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.unmap('<C-b>', 'normal');
        }, CAPTURE_COMMAND_ID);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    async function capturedSelection(): Promise<string | null> {
        return (await browser.executeObsidian(
            () =>
                (
                    window as unknown as {
                        __vimMotions200?: string | null;
                    }
                ).__vimMotions200 ?? null,
        )) as string | null;
    }

    async function runInEditor(keys: string[], exInput: string): Promise<void> {
        const run = (
            keySeq: string[],
            input: string | null,
        ): Promise<unknown> =>
            browser.executeObsidian(
                ({ app, obsidian }, seq: string[], ex: string | null) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                    handleEx: (
                                        cm: unknown,
                                        input: string,
                                    ) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return;
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return;
                    const cm = (
                        (view.editor as unknown as Record<string, unknown>)
                            .cm as Record<string, unknown>
                    )?.cm;
                    if (!cm) return;
                    for (const key of seq) Vim.handleKey(cm, key);
                    if (ex !== null) Vim.handleEx(cm, ex);
                },
                keySeq,
                input,
            );
        await browser.executeObsidian(() => {
            (
                window as unknown as { __vimMotions200?: string | null }
            ).__vimMotions200 = null;
        });
        await run(['<Esc>', ...keys], null);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await run([], exInput);
        await browser.pause(PAUSE.EDITOR_SETTLE);
    }

    it('a normal-mode mapping does not revive the previous visual selection', async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });
        await browser.executeObsidian(() => {
            (
                window as unknown as { __vimMotions200?: string | null }
            ).__vimMotions200 = null;
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['v', 'l', 'l', 'l']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);

        await browser.keys([Key.Control, 'b']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await capturedSelection()).toBe('');
    });

    it('editor:toggle-bold from normal mode leaves the previous selection alone', async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 4,
        });

        await runInEditor(
            ['v', 'l', 'l', 'l', 'l', '<Esc>', 'j'],
            'obcommand editor:toggle-bold',
        );

        expect((await getEditorValue()).split('\n')[0]).toBe(
            'alpha beta gamma',
        );
    });

    it('an ex alias run from normal mode does not revive it either', async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });

        await runInEditor(['v', 'l', 'l', 'l', '<Esc>', 'j'], 'capture200');

        expect(await capturedSelection()).toBe('');
    });

    it('a single-line range does not pick up the previous selection', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta', { line: 0, ch: 0 });

        await runInEditor(
            ['V', 'j', '<Esc>'],
            `3obcommand ${CAPTURE_COMMAND_ID}`,
        );

        expect(await capturedSelection()).toBe('');
    });

    it("an explicit '<,'> range from normal mode still uses the marks", async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });

        await runInEditor(
            ['v', 'l', 'l', 'l', '<Esc>', 'j'],
            `'<,'>obcommand ${CAPTURE_COMMAND_ID}`,
        );

        expect(await capturedSelection()).toBe('beta');
    });
});

describe('obcommand from a Lua function mapping after a previous visual selection (#200)', function () {
    before(async function () {
        await loadLuaConfig(
            'vim.g.mapleader = " "\n' +
                'vim.keymap.set("n", "<leader>b", function()\n' +
                '    vim.cmd(":obcommand editor:toggle-bold")\n' +
                'end, { desc = "toggle bold" })\n',
        );
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('bolds the word under the cursor, not the previous selection', async function () {
        await setupEditor('alpha beta gamma\ndelta epsilon', {
            line: 0,
            ch: 0,
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['v', 'e']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys([Key.Escape]);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['j']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys([' ', 'b']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getEditorValue()).toBe(
            'alpha beta gamma\n**delta** epsilon',
        );
    });
});
