import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000 } as const;

const TABLE_DOC = 'Line above\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nLine below';

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

async function getState(): Promise<Record<string, unknown>> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'no view' };
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const cursor = view.editor.getCursor();
        const focusedEl = document.activeElement;
        const cellCmEl = document.querySelector('.cm-table-widget .cm-editor');

        let vimMode = 'unknown';
        const cm = editMode?.cm as Record<string, unknown> | undefined;
        const adapter = cm
            ? ((cm as Record<string, unknown>).cm as Record<string, unknown>)
            : undefined;
        if (adapter) {
            const vs = (
                adapter as { state?: { vim?: Record<string, unknown> } }
            ).state?.vim;
            if (vs) {
                if (vs.insertMode) vimMode = 'insert';
                else if (vs.visualMode) vimMode = 'visual';
                else vimMode = 'normal';
            }
        }

        let cellVimMode = 'none';
        if (editMode?.tableCell) {
            const cellCm = (editMode.tableCell as Record<string, unknown>)
                .cm as Record<string, unknown> | undefined;
            const cellAdapter = cellCm
                ? ((cellCm as Record<string, unknown>).cm as Record<
                      string,
                      unknown
                  >)
                : undefined;
            if (cellAdapter) {
                const vs = (
                    cellAdapter as {
                        state?: { vim?: Record<string, unknown> };
                    }
                ).state?.vim;
                if (vs) {
                    if (vs.insertMode) cellVimMode = 'insert';
                    else if (vs.visualMode) cellVimMode = 'visual';
                    else cellVimMode = 'normal';
                } else {
                    cellVimMode = 'no vim state';
                }
            } else {
                cellVimMode = 'no adapter';
            }
        }

        return {
            line: cursor.line,
            ch: cursor.ch,
            inTableCell: view.editor.inTableCell,
            hasTableCell:
                editMode?.tableCell !== null &&
                editMode?.tableCell !== undefined,
            vimMode,
            cellVimMode,
            focusInCell: cellCmEl?.contains(focusedEl) ?? false,
            focusedClass: focusedEl?.className?.slice(0, 60) ?? 'null',
        };
    })) as Record<string, unknown>;
}

describe('Spike: built-in vim table behavior (plugin DISABLED)', function () {
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
        await setupDoc();
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

    it('should track j-key progression through document with table', async function () {
        this.timeout(30000);
        await setupDoc();

        const steps: Array<Record<string, unknown>> = [];
        const initial = await getState();
        steps.push({ step: 0, ...initial });

        for (let s = 1; s <= 10; s++) {
            await browser.keys(['j']);
            await browser.pause(PAUSE.SETTLE);
            const state = await getState();
            steps.push({ step: s, ...state });
        }

        console.log(
            'Built-in vim j progression:',
            JSON.stringify(steps, null, 2),
        );
    });

    it('should track k-key progression back up', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(6, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.SETTLE);

        const steps: Array<Record<string, unknown>> = [];
        const initial = await getState();
        steps.push({ step: 0, ...initial });

        for (let s = 1; s <= 10; s++) {
            await browser.keys(['k']);
            await browser.pause(PAUSE.SETTLE);
            const state = await getState();
            steps.push({ step: s, ...state });
        }

        console.log(
            'Built-in vim k progression:',
            JSON.stringify(steps, null, 2),
        );
    });

    it('should track Escape behavior in cell', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j']);
        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);

        const inCell = await getState();
        console.log('In cell:', JSON.stringify(inCell, null, 2));

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterEsc1 = await getState();
        console.log('After 1st Escape:', JSON.stringify(afterEsc1, null, 2));

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterEsc2 = await getState();
        console.log('After 2nd Escape:', JSON.stringify(afterEsc2, null, 2));
    });

    it('should track i/Escape/Escape flow in cell', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j']);
        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);

        const inCell = await getState();
        console.log('Entered cell:', JSON.stringify(inCell, null, 2));

        await browser.keys(['i']);
        await browser.pause(PAUSE.SETTLE);

        const afterI = await getState();
        console.log('After i:', JSON.stringify(afterI, null, 2));

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterEsc1 = await getState();
        console.log(
            'After Escape from insert:',
            JSON.stringify(afterEsc1, null, 2),
        );

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterEsc2 = await getState();
        console.log('After 2nd Escape:', JSON.stringify(afterEsc2, null, 2));
    });

    it('should track Tab navigation between cells', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j']);
        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);

        const cell1 = await getState();
        console.log('Cell 1:', JSON.stringify(cell1, null, 2));

        await browser.keys(['Tab']);
        await browser.pause(PAUSE.SETTLE);

        const cell2 = await getState();
        console.log('After Tab:', JSON.stringify(cell2, null, 2));

        await browser.keys(['Tab']);
        await browser.pause(PAUSE.SETTLE);

        const cell3 = await getState();
        console.log('After 2nd Tab:', JSON.stringify(cell3, null, 2));
    });

    it('should check scope stack when in cell', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j']);
        await browser.keys(['j']);
        await browser.pause(PAUSE.SETTLE);

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };

            const keymap = (
                app as unknown as {
                    keymap: {
                        scope: { keys: unknown[] };
                        pushScope: (s: unknown) => void;
                        popScope: (s: unknown) => void;
                    };
                }
            ).keymap;

            const scopeKeys = keymap.scope?.keys
                ? Object.keys(keymap.scope.keys).length
                : -1;

            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;

            let cellScopeInfo = 'no cell';
            if (editMode?.tableCell) {
                const cell = editMode.tableCell as Record<string, unknown>;
                const cellScope = (cell as Record<string, unknown>).scope;
                cellScopeInfo = cellScope
                    ? `scope with ${Object.keys(cellScope).length} keys`
                    : 'no scope property';

                const cellOwner = cell.owner as
                    Record<string, unknown> | undefined;
                const ownerScope = cellOwner?.scope;
                if (ownerScope) {
                    cellScopeInfo += ` | owner scope: ${Object.keys(ownerScope as Record<string, unknown>).length} keys`;
                }
            }

            const activeEditor = (
                app.workspace as unknown as Record<string, unknown>
            ).activeEditor;
            const activeEditorType = activeEditor
                ? (activeEditor as Record<string, unknown>).constructor?.name
                : 'null';

            return {
                inTableCell: view.editor.inTableCell,
                scopeKeys,
                cellScopeInfo,
                activeEditorType,
            };
        })) as Record<string, unknown>;

        console.log('Scope info:', JSON.stringify(result, null, 2));
    });
});
