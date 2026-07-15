import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, setupEditor, PAUSE } from '../helpers';

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
