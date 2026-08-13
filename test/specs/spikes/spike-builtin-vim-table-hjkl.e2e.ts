import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000 } as const;
const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

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

async function setupDoc(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, content: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        view.editor.setValue(content);
        view.editor.setCursor(0, 0);
        view.editor.focus();
    }, TABLE_DOC);
    await browser.pause(PAUSE.RENDER);
}

async function getFullState(): Promise<Record<string, unknown>> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'no view' };
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
        if (cellEditor) {
            const cellCm = cellEditor.cm as Record<string, unknown>;
            const cellState = cellCm?.state as Record<string, unknown>;
            const doc = cellState?.doc as
                | { toString: () => string }
                | undefined;
            cellContent = doc?.toString() ?? 'no doc';
            cellRow = (cellEditor.row as number) ?? -1;
            cellCol = (cellEditor.col as number) ?? -1;
        }

        let cellVimMode = 'none';
        if (cellEditor) {
            const cellCm = cellEditor.cm as Record<string, unknown>;
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
        }

        return {
            line: cursor.line,
            ch: cursor.ch,
            inTableCell: view.editor.inTableCell,
            hasTableCell: cellEditor !== null,
            cellContent,
            cellRow,
            cellCol,
            cellVimMode,
        };
    })) as Record<string, unknown>;
}

describe('Spike: built-in vim hjkl boundary behavior in tables', function () {
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

    it('should track l at end of cell → next cell', async function () {
        this.timeout(20000);
        await setupDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const inCell = await getFullState();
        console.log('Entered cell:', JSON.stringify(inCell, null, 2));

        await browser.keys(['$']);
        await browser.pause(PAUSE.SETTLE);
        const atEnd = await getFullState();
        console.log('At end of cell ($):', JSON.stringify(atEnd, null, 2));

        await browser.keys(['l']);
        await browser.pause(PAUSE.SETTLE);
        const afterL = await getFullState();
        console.log('After l at end:', JSON.stringify(afterL, null, 2));
    });

    it('should track h at start of cell → prev cell', async function () {
        this.timeout(20000);
        await setupDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        await browser.keys(['l', 'l']);
        await browser.pause(PAUSE.SETTLE);

        const inSecondCell = await getFullState();
        console.log('In cell after ll:', JSON.stringify(inSecondCell, null, 2));

        await browser.keys(['0']);
        await browser.pause(PAUSE.SETTLE);
        const atStart = await getFullState();
        console.log('At start (0):', JSON.stringify(atStart, null, 2));

        await browser.keys(['h']);
        await browser.pause(PAUSE.SETTLE);
        const afterH = await getFullState();
        console.log('After h at start:', JSON.stringify(afterH, null, 2));
    });

    it('should track j/k between rows', async function () {
        this.timeout(20000);
        await setupDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        const headerCell = await getFullState();
        console.log('Header cell:', JSON.stringify(headerCell, null, 2));

        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);
        const dataCell = await getFullState();
        console.log('After j (data row):', JSON.stringify(dataCell, null, 2));

        await browser.keys(['k']);
        await browser.pause(PAUSE.SETTLE);
        const backToHeader = await getFullState();
        console.log(
            'After k (back to header):',
            JSON.stringify(backToHeader, null, 2),
        );
    });

    it('should track j at last row → exits table', async function () {
        this.timeout(20000);
        await setupDoc();

        await browser.keys(['j', 'j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        const dataRow = await getFullState();
        console.log('Data row:', JSON.stringify(dataRow, null, 2));

        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);
        const afterJ = await getFullState();
        console.log('After j at last row:', JSON.stringify(afterJ, null, 2));
    });

    it('should track k at header → exits table', async function () {
        this.timeout(20000);
        await setupDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        const header = await getFullState();
        console.log('Header:', JSON.stringify(header, null, 2));

        await browser.keys(['k']);
        await browser.pause(PAUSE.SETTLE);
        const afterK = await getFullState();
        console.log('After k at header:', JSON.stringify(afterK, null, 2));
    });
});
