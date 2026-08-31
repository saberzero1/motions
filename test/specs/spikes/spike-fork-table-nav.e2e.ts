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

async function getState(): Promise<Record<string, unknown>> {
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
        if (cellEditor) {
            const cellCm = cellEditor.cm as Record<string, unknown>;
            const cellState = cellCm?.state as Record<string, unknown>;
            const doc = cellState?.doc as
                { toString: () => string } | undefined;
            cellContent = doc?.toString() ?? 'no doc';
        }

        return {
            line: cursor.line,
            ch: cursor.ch,
            inTableCell: view.editor.inTableCell,
            hasTableCell: cellEditor !== null,
            cellContent,
        };
    })) as Record<string, unknown>;
}

describe('Spike: fork vim table navigation (plugin ENABLED)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('should check getMotion availability', async function () {
        this.timeout(15000);

        const result = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'no vim' };

            const hasGetMotion = typeof Vim.getMotion === 'function';
            let moveByLines: string | null = null;
            let moveByCharacters: string | null = null;
            let moveByDisplayLines: string | null = null;

            if (hasGetMotion) {
                const gm = Vim.getMotion as (name: string) => unknown;
                moveByLines = typeof gm('moveByLines');
                moveByCharacters = typeof gm('moveByCharacters');
                moveByDisplayLines = typeof gm('moveByDisplayLines');
            }

            const vimKeys = Object.keys(Vim).sort().slice(0, 30);

            return {
                hasGetMotion,
                moveByLines,
                moveByCharacters,
                moveByDisplayLines,
                vimKeys,
            };
        })) as Record<string, unknown>;

        console.log('getMotion check:', JSON.stringify(result, null, 2));
    });

    it('should verify vim is active and motion capture', async function () {
        this.timeout(15000);
        await setupDoc();

        const captureCheck = (await browser.executeObsidian(() => {
            return {
                origMoveByLinesType:
                    (window as unknown as Record<string, unknown>)
                        .__origMoveByLinesType ?? 'not set',
            };
        })) as Record<string, unknown>;

        console.log('Motion capture:', JSON.stringify(captureCheck, null, 2));

        const vimCheck = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const cm = editMode?.cm as Record<string, unknown>;
            const adapter = cm
                ? ((cm as Record<string, unknown>).cm as Record<
                      string,
                      unknown
                  >)
                : undefined;
            const vs = adapter
                ? (adapter as { state?: { vim?: Record<string, unknown> } })
                      .state?.vim
                : undefined;

            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: Record<string, unknown> };
                }
            ).CodeMirrorAdapter?.Vim;

            return {
                hasAdapter: !!adapter,
                hasVimState: !!vs,
                insertMode: vs?.insertMode,
                visualMode: vs?.visualMode,
                hasVimOnWindow: !!Vim,
                editorClasses:
                    (cm?.contentDOM as HTMLElement)
                        ?.closest('.cm-editor')
                        ?.className?.slice(0, 60) ?? 'none',
            };
        })) as Record<string, unknown>;

        console.log('Vim check:', JSON.stringify(vimCheck, null, 2));
    });

    it('should track j progression through table', async function () {
        this.timeout(30000);
        await setupDoc();

        const steps: Array<Record<string, unknown>> = [];
        const initial = await getState();
        steps.push({ step: 0, ...initial });

        for (let s = 1; s <= 8; s++) {
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
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
                if (adapter) Vim.handleKey(adapter, 'j');
            });
            await browser.pause(PAUSE.SETTLE);
            const state = await getState();
            steps.push({ step: s, ...state });
        }

        console.log('Fork j progression:', JSON.stringify(steps, null, 2));
    });

    it('should track k progression back up', async function () {
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

        for (let s = 1; s <= 8; s++) {
            await browser.keys(['k']);
            await browser.pause(PAUSE.SETTLE);
            const state = await getState();
            steps.push({ step: s, ...state });
        }

        console.log('Fork k progression:', JSON.stringify(steps, null, 2));
    });

    it('should track l at cell boundary', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const inCell = await getState();
        console.log('In first cell:', JSON.stringify(inCell, null, 2));

        await browser.keys(['$']);
        await browser.pause(PAUSE.SETTLE);

        await browser.keys(['l']);
        await browser.pause(PAUSE.SETTLE);

        const afterL = await getState();
        console.log('After l at end:', JSON.stringify(afterL, null, 2));
    });

    it('should track h at cell boundary', async function () {
        this.timeout(15000);
        await setupDoc();

        await browser.keys(['j', 'j', 'l', 'l']);
        await browser.pause(PAUSE.SETTLE);

        const inCell = await getState();
        console.log('In second cell:', JSON.stringify(inCell, null, 2));

        await browser.keys(['0']);
        await browser.pause(PAUSE.SETTLE);

        await browser.keys(['h']);
        await browser.pause(PAUSE.SETTLE);

        const afterH = await getState();
        console.log('After h at start:', JSON.stringify(afterH, null, 2));
    });
});
