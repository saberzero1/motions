import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.4b: the three interactions the triage marks required.
 *
 * Measured before implementing, and two of the three already worked: a
 * right-click opens a menu, and a block `y` fills the register blockwise with
 * the right text. The one defect was click-to-place-cursor — the click moved
 * the **child's** caret and left the parent's where it was, so the caret the
 * user saw and the position the next command acted on were different cells.
 *
 * Positions are reported as a derived cell index rather than a hand-counted
 * offset: an expectation counted by hand got the arithmetic wrong twice
 * earlier in this plan sequence and read as a product failure both times.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | bb   |',
    '| cc   | dd   |',
    '',
    'Line below',
].join('\n');

interface Where {
    error?: string;
    mounted: number;
    focused: boolean;
    /** Text of the parent's cursor line. */
    lineText: string;
    /** Which cell of that line the parent's head is in, or -1. */
    cellIndex: number;
    /** True when the head sits exactly on an unescaped delimiter. */
    onDelimiter: boolean;
    childHead: number;
    parentHead: number;
    tableFrom: number;
    menus: number;
}

async function where(): Promise<Where> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Where = {
            mounted: -1,
            focused: false,
            lineText: '',
            cellIndex: -1,
            onDelimiter: false,
            childHead: -1,
            parentHead: -1,
            tableFrom: -1,
            menus: -1,
        };
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            getNestedTableStats: () => {
                                mounted: number;
                                focused: boolean;
                                childHead: number;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  state: {
                      selection: { main: { head: number } };
                      doc: {
                          toString: () => string;
                          lineAt: (p: number) => {
                              text: string;
                              from: number;
                          };
                      };
                  };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        const head = cm.state.selection.main.head;
        const line = cm.state.doc.lineAt(head);
        const col = head - line.from;

        // Unescaped pipes only, same rule the layout model uses.
        const pipes: number[] = [];
        for (let i = 0; i < line.text.length; i++) {
            if (line.text[i] !== '|') continue;
            let back = 0;
            let j = i - 1;
            while (j >= 0 && line.text[j] === '\\') {
                back++;
                j--;
            }
            if (back % 2 === 0) pipes.push(i);
        }

        let cellIndex = -1;
        for (let i = 0; i < pipes.length - 1; i++) {
            const open = pipes[i]!;
            const close = pipes[i + 1]!;
            if (col > open && col <= close) {
                cellIndex = i;
                break;
            }
        }

        const stats = plugin.getNestedTableStats();
        return {
            mounted: stats.mounted,
            focused: stats.focused,
            lineText: line.text,
            cellIndex,
            onDelimiter: pipes.includes(col),
            childHead: stats.childHead,
            parentHead: head,
            tableFrom: cm.state.doc.toString().indexOf('| h1'),
            menus: document.querySelectorAll('.menu').length,
        };
    })) as Where;
}

async function pointOf(
    selector: string,
    contains: string,
): Promise<{ x: number; y: number }> {
    const p = (await browser.executeObsidian(
        ({ app, obsidian }, sel: string, want: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            // Scoped to the nested editor on purpose. The passive rows carry
            // the same classes and are `display: none` while it is mounted,
            // where getBoundingClientRect returns all zeros — a click at
            // (0, 0) lands outside the editor and reads as the product
            // ignoring the click.
            const host = view?.containerEl.querySelector<HTMLElement>(
                '.vim-motions-table-nested',
            );
            const nodes = Array.from(
                host?.querySelectorAll<HTMLElement>(sel) ?? [],
            );
            const el = want
                ? nodes.find((n) => (n.textContent ?? '').includes(want))
                : nodes[0];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                x: Math.round(r.left + r.width / 2),
                y: Math.round(r.top + r.height / 2),
            };
        },
        selector,
        contains,
    )) as { x: number; y: number } | null;
    expect(p).not.toBeNull();
    return p as { x: number; y: number };
}

async function clickAt(
    p: { x: number; y: number },
    button: 'left' | 'right' = 'left',
): Promise<void> {
    await browser
        .action('pointer')
        .move({ x: p.x, y: p.y })
        .down(button)
        .up(button)
        .perform();
    await browser.pause(800);
}

async function enterCell(line = 5, ch = 2): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, target: number, col: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (s: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(target).from + col },
            });
        },
        line,
        ch,
    );
    await browser.pause(900);
}

describe('Owned table clicks and clipboard (Plan E1.4b)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);
        await enterCell();
    });

    it('moves the parent cursor to the cell that was clicked', async () => {
        const before = await where();
        expect(before.error).toBeUndefined();
        expect(before.mounted).toBe(1);
        // Starts on the `aa` row, first cell.
        expect(before.lineText).toContain('aa');

        await clickAt(await pointOf('.vim-motions-table-cell', 'dd'));

        const after = await where();
        // The parent's own head moved to the clicked cell — this is what was
        // broken: measured childHead 34 → 52 with parentHead stuck at 46.
        expect(after.lineText).toContain('dd');
        expect(after.cellIndex).toBe(1);
        // And the child's caret agrees, so the visible caret and the
        // authoritative position are the same place.
        expect(after.childHead).toBe(after.parentHead - after.tableFrom);
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });

    it('a click on a delimiter lands in a cell, not on the delimiter', async () => {
        await clickAt(await pointOf('.vim-motions-table-delim', ''));

        const after = await where();
        // `cellAt` returns null on a delimiter rather than guessing; the snap
        // is what turns that into a usable position.
        expect(after.onDelimiter).toBe(false);
        expect(after.cellIndex).toBeGreaterThanOrEqual(0);
        expect(after.childHead).toBe(after.parentHead - after.tableFrom);
    });

    it('a right-click opens a context menu', async () => {
        expect((await where()).menus).toBe(0);
        await clickAt(await pointOf('.vim-motions-table-cell', 'bb'), 'right');
        expect((await where()).menus).toBeGreaterThan(0);
        await browser.keys(['Escape']);
        await browser.pause(400);
    });

    it('a block yank fills the register blockwise with the cell text', async () => {
        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(400);
        await browser.keys(['j', 'l']);
        await browser.pause(500);
        await browser.keys(['y']);
        await browser.pause(800);

        const reg = (await browser.executeObsidian(() => {
            const w = window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        getRegisterController?: () => {
                            getRegister: (n: string) => {
                                toString: () => string;
                                blockwise?: boolean;
                            };
                        };
                    };
                };
            };
            const r =
                w.CodeMirrorAdapter?.Vim?.getRegisterController?.().getRegister(
                    '"',
                );
            return { text: r?.toString(), blockwise: r?.blockwise === true };
        })) as { text?: string; blockwise: boolean };

        // Column 0 of both data rows, and marked blockwise so `p` reinserts it
        // as a block rather than as two lines.
        expect(reg.text).toBe('aa\ncc');
        expect(reg.blockwise).toBe(true);
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });
});
