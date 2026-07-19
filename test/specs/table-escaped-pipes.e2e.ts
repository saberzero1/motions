import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getCursorPos,
    sendVimEscape,
    setupEditor,
    PAUSE,
} from '../helpers';

type VimHandle = {
    handleKey: (cm: unknown, key: string) => boolean;
};

async function handleKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keyList: string[]) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: { Vim?: VimHandle };
            }
        ).CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        for (const key of keyList) {
            Vim.handleKey(adapter, key);
        }
    }, keys);
}

describe('Table escaped pipes (\\|)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('di| with escaped pipes', function () {
        it('should treat \\| as cell content, not a boundary', async function () {
            await setupEditor('| foo \\| bar | baz |\n|---|---|\n| 1 | 2 |', {
                line: 0,
                ch: 3,
            });
            await handleKeys('d', 'i', '|');
            const value = await getEditorValue();
            const firstLine = value.split('\n')[0]!;
            // The escaped pipe is content — "foo \| bar" is one cell.
            // di| deletes cell content, leaving | | baz |
            expect(firstLine).toMatch(/^\|\s*\| baz \|$/);
        });

        it('should treat \\\\| as a real pipe boundary', async function () {
            // \\| in source = \| at runtime = escaped backslash + real pipe
            await setupEditor(
                '| foo \\\\| bar | baz |\n|---|---|---|\n| 1 | 2 | 3 |',
                { line: 0, ch: 3 },
            );
            await handleKeys('d', 'i', '|');
            const value = await getEditorValue();
            const firstLine = value.split('\n')[0]!;
            // \\| is escaped backslash + real pipe — "foo \\" is first cell.
            // di| on first cell deletes "foo \\"
            expect(firstLine).toMatch(/^\|\s*\| bar \| baz \|$/);
        });
    });

    describe(']| navigation with escaped pipes', function () {
        it('should skip \\| and move to next real cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| foo \\| bar | baz |\n|---|---|\n| 1 | 2 |',
                );
                view.editor.setCursor(0, 3);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            // Cursor should land in "baz" cell (after the real pipe at position 13),
            // not after the escaped pipe at position 7
            expect(pos.ch).toBeGreaterThanOrEqual(14);
        });
    });

    describe('yi| with escaped pipes', function () {
        it('should yank cell content including \\|', async function () {
            const reg = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return '';
                view.editor.setValue(
                    '| foo \\| bar | baz |\n|---|---|\n| 1 | 2 |',
                );
                view.editor.setCursor(0, 3);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return '';
                Vim.handleKey(adapter, 'y');
                Vim.handleKey(adapter, 'i');
                Vim.handleKey(adapter, '|');
                const rc = Vim as unknown as {
                    getRegisterController?: () => {
                        registers: Record<string, { toString: () => string }>;
                    };
                };
                const regs = rc.getRegisterController?.();
                return regs?.registers?.['"']?.toString() ?? '';
            })) as string;
            // Yanked content should be the full cell including the escaped pipe
            expect(reg).toContain('foo');
            expect(reg).toContain('bar');
        });
    });

    describe(':tablerealign with escaped pipes', function () {
        it('should preserve column count with \\| in cells', async function () {
            await setupEditor('| foo \\| bar | baz |\n|---|---|\n| 1 | 2 |', {
                line: 0,
                ch: 3,
            });
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleEx(adapter, 'tablerealign');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            const lines = value.split('\n');
            // Table should still have 2 columns (3 real pipes per row)
            // The \\| in cell content should be preserved
            const headerPipes = lines[0]!.match(/(?<!\\)\|/g);
            expect(headerPipes?.length).toBe(3);
            expect(lines[0]).toContain('\\|');
        });
    });
});

/**
 * Regression tests for GitHub issues #66 and #67.
 *
 * Issue #66: Typing | in normal text moves cursor to the left of |
 *   https://github.com/saberzero1/motions/issues/66
 *
 * Issue #67: Tables do not handle escaped | characters correctly
 *   https://github.com/saberzero1/motions/issues/67
 */
describe('Regression: typing | cursor position (#66)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('typing | in an empty document should leave cursor to the right of |', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Enter insert mode and type |
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, 'i');
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        // Type the pipe character
        await browser.keys(['|']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const pos = await getCursorPos();
        const value = await getEditorValue();

        // The document should contain the pipe
        expect(value).toContain('|');

        // Cursor should be at or after the pipe (ch >= 1), not before it (ch 0)
        expect(pos.ch).toBeGreaterThanOrEqual(1);
    });

    it('typing | in the middle of text should leave cursor to the right of |', async function () {
        await setupEditor('hello world', { line: 0, ch: 5 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Enter insert mode at position 5 (between "hello" and " world")
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, 'i');
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['|']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const value = await getEditorValue();
        const pos = await getCursorPos();

        // Pipe should be inserted into the text
        expect(value).toContain('|');

        // Cursor should be after the pipe, not before it or at the same position
        const pipeIdx = value.indexOf('|');
        expect(pos.ch).toBeGreaterThan(pipeIdx);
    });

    it('typing | on a line that is not a table should not trigger table interception', async function () {
        await setupEditor('This is plain text.', { line: 0, ch: 19 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Append at end of line
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, 'A');
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['|']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const pos = await getCursorPos();
        const value = await getEditorValue();

        expect(value).toBe('This is plain text.|');
        // Cursor at end, after the pipe
        expect(pos.ch).toBe(20);
    });

    it('typing multiple | characters should place cursor after the last one', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, 'i');
        });
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['|']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['|']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['|']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const pos = await getCursorPos();
        const value = await getEditorValue();

        expect(value).toContain('|||');
        expect(pos.ch).toBeGreaterThanOrEqual(3);
    });
});

describe('Regression: escaped | in table cells (#67)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    beforeEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    describe(']| navigation with escaped pipes in cell', function () {
        it('\\| inside a cell should not affect ]| navigation cell count', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: { Vim?: VimHandle };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view || !Vim) return { line: -1, ch: -1, value: '' };
                    view.editor.setValue(
                        '| foo \\| bar | baz |\n|---|---|\n| 1 | 2 |',
                    );
                    view.editor.setCursor(0, 3);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { line: -1, ch: -1, value: '' };
                    Vim.handleKey(adapter, ']');
                    Vim.handleKey(adapter, '|');
                    const cursor = view.editor.getCursor();
                    return {
                        line: cursor.line,
                        ch: cursor.ch,
                        value: view.editor.getValue(),
                    };
                },
            )) as { line: number; ch: number; value: string };

            expect(result.line).toBe(0);
            expect(result.ch).toBeGreaterThanOrEqual(14);
        });

        it('wikilink containing | in table cell should not split the cell', async function () {
            const table =
                '| link | note |\n|---|---|\n| [[page\\|alias]] | info |';

            const result = (await browser.executeObsidian(
                ({ app, obsidian }, content: string) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: { Vim?: VimHandle };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view || !Vim) return { line: -1, ch: -1, value: '' };
                    view.editor.setValue(content);
                    view.editor.setCursor(2, 3);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { line: -1, ch: -1, value: '' };
                    Vim.handleKey(adapter, ']');
                    Vim.handleKey(adapter, '|');
                    const cursor = view.editor.getCursor();
                    return {
                        line: cursor.line,
                        ch: cursor.ch,
                        value: view.editor.getValue(),
                    };
                },
                table,
            )) as { line: number; ch: number; value: string };

            expect(result.line).toBe(2);
            const dataRow = result.value.split('\n')[2] ?? '';
            const infoIdx = dataRow.indexOf('info');
            expect(infoIdx).toBeGreaterThan(-1);
            expect(result.ch).toBeGreaterThanOrEqual(infoIdx);
        });
    });

    describe('typing | inside table cells', function () {
        it('typing | inside a table cell should be auto-escaped and not create extra cell', async function () {
            await setupEditor('| A | B |\n|---|---|\n| 1 | 2 |', {
                line: 2,
                ch: 2,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, 'i');
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['|']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            const dataRow = value.split('\n')[2] ?? '';

            const realPipes = dataRow.match(/(?<!\\)\|/g);
            expect(realPipes?.length).toBe(3);
        });

        it.skip('cursor should remain to the right of escaped pipe after typing | in a cell (Obsidian swallows | at DOM level — see KNOWN_LIMITATIONS.md #67)', async function () {
            await setupEditor('| A | B |\n|---|---|\n| 1 | 2 |', {
                line: 2,
                ch: 2,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, 'i');
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            const posBefore = await getCursorPos();
            await browser.keys(['|']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const posAfter = await getCursorPos();
            const value = await getEditorValue();
            const dataRow = value.split('\n')[2] ?? '';

            expect(dataRow).toContain('\\|');
            expect(posAfter.ch).toBeGreaterThan(posBefore.ch);
        });
    });
});
