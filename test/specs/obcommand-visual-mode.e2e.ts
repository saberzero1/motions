import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getEditorValue, sendVimEscape, PAUSE } from '../helpers';

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
