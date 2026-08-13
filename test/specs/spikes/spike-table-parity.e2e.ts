/**
 * Spike: exhaustive comparison of table cell behavior between
 * built-in vim mode (no plugin) and our fork (plugin enabled).
 *
 * Run with: npx wdio run ./wdio.conf.mts --spec test/specs/spikes/spike-table-parity.e2e.ts
 *
 * Each describe block logs JSON to stdout. Pipe through jq for analysis.
 */
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000, CROSSING: 600 } as const;

const TABLE_2x2 =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';
const TABLE_3x3 =
    'Above\n\n| H1 | H2 | H3 |\n|----|----|----|' +
    '\n| a1 | a2 | a3 |\n| b1 | b2 | b3 |\n\nBelow';
const TABLE_EMPTY_CELLS = 'Top\n\n|  |  |\n|--|--|\n|  |  |\n\nBottom';

async function ensureLivePreview(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = false;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.SETTLE * 2);
}

async function setupDoc(content: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, c: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        if (
            editMode?.tableCell &&
            typeof editMode.destroyTableCell === 'function'
        ) {
            (editMode.destroyTableCell as () => void)();
        }
        view.editor.setValue(c);
        view.editor.setCursor(0, 0);
        view.editor.focus();
    }, content);
    await browser.pause(PAUSE.RENDER);
}

interface CellState {
    mainLine: number;
    mainCh: number;
    inTableCell: boolean;
    hasTableCell: boolean;
    cellContent: string;
    cellRow: number;
    cellCol: number;
    cellVimMode: string;
    cellCursorLine: number;
    cellCursorCh: number;
    hasGutter: boolean;
    gutterChildCount: number;
    hasLineNumbers: boolean;
    editorValue: string;
}

async function getFullState(): Promise<CellState> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                mainLine: -1,
                mainCh: -1,
                inTableCell: false,
                hasTableCell: false,
                cellContent: 'no view',
                cellRow: -1,
                cellCol: -1,
                cellVimMode: 'none',
                cellCursorLine: -1,
                cellCursorCh: -1,
                hasGutter: false,
                gutterChildCount: 0,
                hasLineNumbers: false,
                editorValue: '',
            };

        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const cursor = view.editor.getCursor();
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;

        let cellContent = 'no cell';
        let cellRow = -1;
        let cellCol = -1;
        let cellVimMode = 'none';
        let cellCursorLine = -1;
        let cellCursorCh = -1;
        let hasGutter = false;
        let gutterChildCount = 0;
        let hasLineNumbers = false;

        if (cellEditor) {
            const cellCm = cellEditor.cm as Record<string, unknown>;
            const cellState = cellCm?.state as Record<string, unknown>;
            const doc = cellState?.doc as
                | { toString: () => string }
                | undefined;
            cellContent = doc?.toString() ?? 'no doc';
            cellRow = (cellEditor.row as number) ?? -1;
            cellCol = (cellEditor.col as number) ?? -1;

            const adapter = cellCm
                ? ((cellCm as Record<string, unknown>).cm as Record<
                      string,
                      unknown
                  >)
                : undefined;
            if (adapter) {
                const vs = (
                    adapter as { state?: { vim?: Record<string, unknown> } }
                ).state?.vim;
                if (vs) {
                    if (vs.insertMode) cellVimMode = 'insert';
                    else if (vs.visualMode) cellVimMode = 'visual';
                    else cellVimMode = 'normal';
                }
            }

            const cellView = cellCm as unknown as {
                dom?: HTMLElement;
                state?: { selection?: { main?: { head?: number } } };
            };
            if (cellView.dom) {
                const gutter = cellView.dom.querySelector('.cm-gutters');
                hasGutter = gutter !== null;
                gutterChildCount = gutter ? gutter.children.length : 0;
                hasLineNumbers =
                    cellView.dom.querySelector('.cm-lineNumbers') !== null;
            }
            const mainSel = cellView.state?.selection?.main;
            if (mainSel && typeof mainSel.head === 'number') {
                const d = cellState?.doc as
                    | {
                          lineAt?: (pos: number) => {
                              number: number;
                              from: number;
                          };
                      }
                    | undefined;
                if (d?.lineAt) {
                    const lineInfo = d.lineAt(mainSel.head);
                    cellCursorLine = lineInfo.number - 1;
                    cellCursorCh = mainSel.head - lineInfo.from;
                }
            }
        }

        return {
            mainLine: cursor.line,
            mainCh: cursor.ch,
            inTableCell: view.editor.inTableCell,
            hasTableCell: cellEditor !== null,
            cellContent,
            cellRow,
            cellCol,
            cellVimMode,
            cellCursorLine,
            cellCursorCh,
            hasGutter,
            gutterChildCount,
            hasLineNumbers,
            editorValue: view.editor.getValue(),
        };
    })) as CellState;
}

async function pressKeys(keys: string[]): Promise<void> {
    for (const k of keys) {
        await browser.keys([k]);
        await browser.pause(PAUSE.SETTLE);
    }
}

async function pressKeysAndCapture(
    keys: string[],
    label: string,
): Promise<CellState> {
    await pressKeys(keys);
    const state = await getFullState();
    console.log(`[${label}]`, JSON.stringify(state));
    return state;
}

// ---------------------------------------------------------------------------
// BUILT-IN VIM MODE (no plugin)
// ---------------------------------------------------------------------------

describe('Spike: BUILTIN vim table behavior (plugin DISABLED)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.disablePlugin('vim-motions');
        await browser.pause(PAUSE.SETTLE);
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig: (k: string, v: unknown) => void;
                }
            ).setConfig('vimMode', true);
        });
        await browser.pause(PAUSE.RENDER);
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    after(async function () {
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig: (k: string, v: unknown) => void;
                }
            ).setConfig('vimMode', false);
        });
        await obsidianPage.enablePlugin('vim-motions');
        await browser.pause(PAUSE.SETTLE);
    });

    describe('2x2 table: entering and cell state', function () {
        it('should enter table cell via j from above', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            const s0 = await pressKeysAndCapture([], 'BUILTIN: initial');
            const s1 = await pressKeysAndCapture(
                ['j'],
                'BUILTIN: j1 (empty line)',
            );
            const s2 = await pressKeysAndCapture(
                ['j'],
                'BUILTIN: j2 (enter table)',
            );
            const s3 = await pressKeysAndCapture(
                ['j'],
                'BUILTIN: j3 (next row or skip)',
            );
            const s4 = await pressKeysAndCapture(
                ['j'],
                'BUILTIN: j4 (exit or continue)',
            );
            const s5 = await pressKeysAndCapture(['j'], 'BUILTIN: j5');
        });
    });

    describe('2x2 table: h/l boundary crossing', function () {
        it('should track l at end of cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'BUILTIN l: in first cell');
            await pressKeysAndCapture(['$'], 'BUILTIN l: at end ($)');
            await pressKeysAndCapture(['l'], 'BUILTIN l: after l at end');
            await pressKeysAndCapture(['l'], 'BUILTIN l: second l');
        });

        it('should track h at start of cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeys(['$', 'l']);
            await browser.pause(PAUSE.SETTLE);
            await pressKeysAndCapture([], 'BUILTIN h: in second cell');
            await pressKeysAndCapture(['0'], 'BUILTIN h: at start (0)');
            await pressKeysAndCapture(['h'], 'BUILTIN h: after h at start');
        });
    });

    describe('2x2 table: j/k row crossing', function () {
        it('should track j progression through entire document', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_2x2);
            const steps: Array<{ step: number; state: CellState }> = [];
            steps.push({ step: 0, state: await getFullState() });
            for (let i = 1; i <= 8; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.SETTLE);
                const s = await getFullState();
                steps.push({ step: i, state: s });
                console.log(`[BUILTIN j-prog step ${i}]`, JSON.stringify(s));
            }
        });

        it('should track k progression back up', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_2x2);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setCursor(6, 0);
                view.editor.focus();
            });
            await browser.pause(PAUSE.SETTLE);

            for (let i = 1; i <= 8; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.SETTLE);
                const s = await getFullState();
                console.log(`[BUILTIN k-prog step ${i}]`, JSON.stringify(s));
            }
        });
    });

    describe('2x2 table: Escape behavior', function () {
        it('should check Escape in normal mode inside cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'BUILTIN esc: in cell');
            await pressKeysAndCapture(['Escape'], 'BUILTIN esc: after Escape');
            await pressKeysAndCapture(
                ['Escape'],
                'BUILTIN esc: after 2nd Escape',
            );
        });
    });

    describe('2x2 table: operator-pending guards', function () {
        it('should check dj behavior in cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'BUILTIN dj: before');
            await browser.keys(['d']);
            await browser.pause(100);
            await browser.keys(['j']);
            await browser.pause(PAUSE.SETTLE);
            await pressKeysAndCapture([], 'BUILTIN dj: after dj');
        });
    });

    describe('2x2 table: visual elements in cell', function () {
        it('should check for gutters and line numbers', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            const s = await pressKeysAndCapture(
                [],
                'BUILTIN visual: cell state',
            );
            console.log(
                `[BUILTIN VISUAL] hasGutter=${s.hasGutter} gutterChildren=${s.gutterChildCount} hasLineNumbers=${s.hasLineNumbers}`,
            );
        });
    });

    describe('3x3 table: multi-row navigation', function () {
        it('should track j through 3 data rows', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_3x3);
            await pressKeys(['j', 'j']);
            for (let i = 1; i <= 6; i++) {
                const s = await pressKeysAndCapture(
                    ['j'],
                    `BUILTIN 3x3 j step ${i}`,
                );
            }
        });
    });

    describe('Empty cell table', function () {
        it('should handle h/l in empty cells', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_EMPTY_CELLS);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'BUILTIN empty: in empty cell');
            await pressKeysAndCapture(['l'], 'BUILTIN empty: l in empty cell');
            await pressKeysAndCapture(['h'], 'BUILTIN empty: h after l');
        });
    });

    describe('2x2 table: document content integrity', function () {
        it('should verify h/l do NOT insert characters', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            const before = await getFullState();
            await pressKeys(['j', 'j']);
            await pressKeys(['h', 'h', 'l', 'l', 'l', 'h']);
            const after = await getFullState();
            console.log(
                `[BUILTIN integrity] before=${JSON.stringify(before.editorValue.length)} after=${JSON.stringify(after.editorValue.length)}`,
            );
            console.log(
                `[BUILTIN integrity] contentChanged=${before.editorValue !== after.editorValue}`,
            );
        });
    });
});

// ---------------------------------------------------------------------------
// FORK VIM MODE (plugin ENABLED)
// ---------------------------------------------------------------------------

describe('Spike: FORK vim table behavior (plugin ENABLED)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    describe('2x2 table: entering and cell state', function () {
        it('should enter table cell via j from above', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            const s0 = await pressKeysAndCapture([], 'FORK: initial');
            const s1 = await pressKeysAndCapture(
                ['j'],
                'FORK: j1 (empty line)',
            );
            const s2 = await pressKeysAndCapture(
                ['j'],
                'FORK: j2 (enter table)',
            );
            const s3 = await pressKeysAndCapture(
                ['j'],
                'FORK: j3 (next row or skip)',
            );
            const s4 = await pressKeysAndCapture(
                ['j'],
                'FORK: j4 (exit or continue)',
            );
            const s5 = await pressKeysAndCapture(['j'], 'FORK: j5');
        });
    });

    describe('2x2 table: h/l boundary crossing', function () {
        it('should track l at end of cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'FORK l: in first cell');
            await pressKeysAndCapture(['$'], 'FORK l: at end ($)');
            await pressKeysAndCapture(['l'], 'FORK l: after l at end');
            await pressKeysAndCapture(['l'], 'FORK l: second l');
        });

        it('should track h at start of cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeys(['$', 'l']);
            await browser.pause(PAUSE.SETTLE);
            await pressKeysAndCapture([], 'FORK h: in second cell');
            await pressKeysAndCapture(['0'], 'FORK h: at start (0)');
            await pressKeysAndCapture(['h'], 'FORK h: after h at start');
        });
    });

    describe('2x2 table: j/k row crossing', function () {
        it('should track j progression through entire document', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_2x2);
            const steps: Array<{ step: number; state: CellState }> = [];
            steps.push({ step: 0, state: await getFullState() });
            for (let i = 1; i <= 8; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.CROSSING);
                const s = await getFullState();
                steps.push({ step: i, state: s });
                console.log(`[FORK j-prog step ${i}]`, JSON.stringify(s));
            }
        });

        it('should track k progression back up', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_2x2);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setCursor(6, 0);
                view.editor.focus();
            });
            await browser.pause(PAUSE.SETTLE);

            for (let i = 1; i <= 8; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.CROSSING);
                const s = await getFullState();
                console.log(`[FORK k-prog step ${i}]`, JSON.stringify(s));
            }
        });
    });

    describe('2x2 table: Escape behavior', function () {
        it('should check Escape in normal mode inside cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'FORK esc: in cell');
            await pressKeysAndCapture(['Escape'], 'FORK esc: after Escape');
            await pressKeysAndCapture(['Escape'], 'FORK esc: after 2nd Escape');
        });
    });

    describe('2x2 table: operator-pending guards', function () {
        it('should check dj behavior in cell', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'FORK dj: before');
            await browser.keys(['d']);
            await browser.pause(100);
            await browser.keys(['j']);
            await browser.pause(PAUSE.SETTLE);
            await pressKeysAndCapture([], 'FORK dj: after dj');
        });
    });

    describe('2x2 table: visual elements in cell', function () {
        it('should check for gutters and line numbers', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            const s = await pressKeysAndCapture([], 'FORK visual: cell state');
            console.log(
                `[FORK VISUAL] hasGutter=${s.hasGutter} gutterChildren=${s.gutterChildCount} hasLineNumbers=${s.hasLineNumbers}`,
            );
        });
    });

    describe('3x3 table: multi-row navigation', function () {
        it('should track j through 3 data rows', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_3x3);
            await pressKeys(['j', 'j']);
            for (let i = 1; i <= 6; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.CROSSING);
                const s = await getFullState();
                console.log(`[FORK 3x3 j step ${i}]`, JSON.stringify(s));
            }
        });
    });

    describe('Empty cell table', function () {
        it('should handle h/l in empty cells', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_EMPTY_CELLS);
            await pressKeys(['j', 'j']);
            await pressKeysAndCapture([], 'FORK empty: in empty cell');
            await pressKeysAndCapture(['l'], 'FORK empty: l in empty cell');
            await pressKeysAndCapture(['h'], 'FORK empty: h after l');
        });
    });

    describe('2x2 table: document content integrity', function () {
        it('should verify h/l do NOT insert characters', async function () {
            this.timeout(20000);
            await setupDoc(TABLE_2x2);
            const before = await getFullState();
            await pressKeys(['j', 'j']);
            await pressKeys(['h', 'h', 'l', 'l', 'l', 'h']);
            const after = await getFullState();
            console.log(
                `[FORK integrity] before=${JSON.stringify(before.editorValue.length)} after=${JSON.stringify(after.editorValue.length)}`,
            );
            console.log(
                `[FORK integrity] contentChanged=${before.editorValue !== after.editorValue}`,
            );
            if (before.editorValue !== after.editorValue) {
                console.log(
                    `[FORK integrity] BEFORE: ${JSON.stringify(before.editorValue)}`,
                );
                console.log(
                    `[FORK integrity] AFTER:  ${JSON.stringify(after.editorValue)}`,
                );
            }
        });
    });

    describe('2x2 table: vim mode consistency', function () {
        it('should stay in normal mode during h/j/k/l navigation', async function () {
            this.timeout(30000);
            await setupDoc(TABLE_2x2);
            await pressKeys(['j', 'j']);
            const modes: string[] = [];
            for (const key of ['h', 'l', 'j', 'k', 'l', 'l', 'h', 'h']) {
                await browser.keys([key]);
                await browser.pause(PAUSE.CROSSING);
                const s = await getFullState();
                modes.push(`${key}→${s.cellVimMode}`);
            }
            console.log(`[FORK modes]`, modes.join(', '));
        });
    });

    describe('2x2 table: getMotion binding fix verification', function () {
        it('should verify defineMotion override does not break j/k outside tables', async function () {
            this.timeout(20000);
            await setupDoc('Line 1\nLine 2\nLine 3\nLine 4');
            const initial = await pressKeysAndCapture(
                [],
                'FORK nontable: initial',
            );
            const afterJ = await pressKeysAndCapture(
                ['j'],
                'FORK nontable: after j',
            );
            const afterJ2 = await pressKeysAndCapture(
                ['j'],
                'FORK nontable: after jj',
            );
            const afterK = await pressKeysAndCapture(
                ['k'],
                'FORK nontable: after k',
            );
            console.log(
                `[FORK nontable] j works: ${afterJ.mainLine === 1}, jj works: ${afterJ2.mainLine === 2}, k works: ${afterK.mainLine === 1}`,
            );
        });
    });
});
