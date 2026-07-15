import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, PAUSE } from '../../helpers';

describe('Spike 27c: cursor position diagnosis for **x**', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should check cursor position stability on **x** in Live Preview', async function () {
        await setupEditor('Hello **x** world', { line: 0, ch: 8 });
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            const setCh = 8;
            view.editor.setCursor(0, setCh);
            const readBack1 = view.editor.getCursor();

            const editorView = (
                view.editor as unknown as Record<string, unknown>
            ).cm as {
                state: {
                    selection: { main: { head: number; anchor: number } };
                    doc: { toString: () => string };
                };
                coordsAtPos?: (
                    pos: number,
                ) => { left: number; top: number } | null;
            } & Record<string, unknown>;

            const doc = editorView.state.doc.toString();
            const cm6Head = editorView.state.selection.main.head;
            const cm6Anchor = editorView.state.selection.main.anchor;

            const coords8 = editorView.coordsAtPos?.(8);
            const coords7 = editorView.coordsAtPos?.(7);
            const coords9 = editorView.coordsAtPos?.(9);

            view.editor.focus();
            const readBack2 = view.editor.getCursor();

            return {
                setCh,
                readBack1: { line: readBack1.line, ch: readBack1.ch },
                readBack2: { line: readBack2.line, ch: readBack2.ch },
                cm6Head,
                cm6Anchor,
                docText: doc.slice(0, 25),
                charAtCh8: doc[8],
                coords7,
                coords8,
                coords9,
                coordsMatch78:
                    coords7 && coords8
                        ? Math.abs(coords7.left - coords8.left) < 2
                        : 'n/a',
            };
        });
        console.log('Cursor diagnosis:', JSON.stringify(result, null, 2));
    });

    it('should check if cursor at ch:8 on **x** snaps to ch:6 in Live Preview', async function () {
        await setupEditor('Hello **x** world', { line: 0, ch: 8 });
        await browser.pause(100);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            view.editor.setCursor(0, 8);
            view.editor.focus();
            const afterFocus = view.editor.getCursor();

            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };

            Vim.handleKey(adapter, '<Esc>');
            const afterEsc = view.editor.getCursor();

            return {
                afterFocus: { line: afterFocus.line, ch: afterFocus.ch },
                afterEsc: { line: afterEsc.line, ch: afterEsc.ch },
            };
        });
        console.log('Cursor snap diagnosis:', JSON.stringify(result, null, 2));
    });
});
