import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

const TABLE_CONTENT = '| A | B |\n|---|---|\n| 1 | 2 |';

const TWO_TABLES = [
    'Paragraph above.',
    '',
    '| T1A | T1B |',
    '|-----|-----|',
    '| t1  | t1  |',
    '',
    'Middle text.',
    '',
    '| T2A | T2B |',
    '|-----|-----|',
    '| t2  | t2  |',
].join('\n');

async function hasAnyTableWidget(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const widgets = document.querySelectorAll('.cm-table-widget');
        for (const w of widgets) {
            if ((w as HTMLElement).offsetParent !== null) return true;
        }
        return false;
    })) as boolean;
}

async function countTableWidgets(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const container = (view as unknown as { contentEl: HTMLElement })
            .contentEl;
        return container.querySelectorAll('.cm-table-widget').length;
    })) as number;
}

async function isLivePreview(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source !== true;
    })) as boolean;
}

async function ensureLivePreview(): Promise<void> {
    const isLP = await isLivePreview();
    if (!isLP) {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    }
}

async function setTableWidgetMode(mode: 'native' | 'raw'): Promise<void> {
    await browser.executeObsidian(({ app }, tableWidgetMode: string) => {
        const plugins = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins;
        const vm = plugins.plugins['vim-motions'];
        if (!vm) return;
        vm.settings.tableWidgetMode = tableWidgetMode;
        vm.reloadFeatures();
    }, mode);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Native table widget in Live Preview', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    describe('Preconditions', function () {
        it('should be in Live Preview mode', async function () {
            expect(await isLivePreview()).toBe(true);
        });
    });

    describe('Widget presence', function () {
        it('should render .cm-table-widget when content has a table', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await hasAnyTableWidget()).toBe(true);
        });

        it('should not render .cm-table-widget in source mode', async function () {
            await ensureSourceMode();
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);

            await ensureLivePreview();
        });

        it('should render two widgets for two tables in one document', async function () {
            await setupEditor(TWO_TABLES, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(2);
        });

        it('math block should not produce a table widget', async function () {
            await setupEditor('$$\nx^2\n$$', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);
        });
    });

    describe('Native/raw mode toggle', function () {
        after(async function () {
            await setTableWidgetMode('native');
        });

        it('raw mode should hide table widgets', async function () {
            await setTableWidgetMode('raw');
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await hasAnyTableWidget()).toBe(false);
        });

        it('native mode should allow table nav', async function () {
            await setTableWidgetMode('native');
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await hasAnyTableWidget()).toBe(true);
        });
    });

    describe('Cell navigation on raw markdown', function () {
        before(async function () {
            await ensureSourceMode();
        });

        after(async function () {
            await ensureLivePreview();
        });

        it(']c should navigate to next cell', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

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
                if (!adapter) return;
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'c');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(3);
        });
    });

    describe('Vim operations on table text', function () {
        before(async function () {
            await ensureSourceMode();
        });

        after(async function () {
            await ensureLivePreview();
        });

        it('dd should delete a table row', async function () {
            await setupEditor(TABLE_CONTENT, { line: 2, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

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
                if (!adapter) return;
                Vim.handleKey(adapter, 'd');
                Vim.handleKey(adapter, 'd');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            expect(value).toMatch(/\|\s*A/);
            expect(value).toMatch(/---/);
            expect(value).not.toMatch(/\|\s*1/);
        });
    });

    describe.skip('Cursor movement through table (covered by tables.e2e.ts — j/k DOM dispatch unreliable after mode switch)', function () {
        before(async function () {
            await ensureSourceMode();
        });

        after(async function () {
            await ensureLivePreview();
        });

        it('j should move through each row of the table', async function () {
            await setupEditor('Text above\n' + TABLE_CONTENT + '\nText below', {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([1, 2, 3, 4]);
        });

        it('k should move back up through the table', async function () {
            await setupEditor('Text above\n' + TABLE_CONTENT + '\nText below', {
                line: 4,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 4; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([3, 2, 1, 0]);
        });

        it('j through entire document with table should visit every line', async function () {
            const doc = 'Line 0\n| A | B |\n|---|---|\n| 1 | 2 |\nLine 4';
            await setupEditor(doc, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [0];
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([0, 1, 2, 3, 4]);
        });

        it('j should move through empty-cell table without getting stuck', async function () {
            const doc = [
                'This is your new _vault_.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
                '',
                'Done.',
            ].join('\n');
            await setupEditor(doc, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [0];
            for (let i = 0; i < 6; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([0, 1, 2, 3, 4, 5, 6]);
        });

        it('k should move up through separator row', async function () {
            await setupEditor('x\n' + TABLE_CONTENT, { line: 3, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 3; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([2, 1, 0]);
        });

        it('j then k should return to same line', async function () {
            const doc = [
                'Text above.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 2, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const afterJ = await getCursorPos();

            await browser.keys(['k']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const afterK = await getCursorPos();

            expect(afterJ.line).toBe(3);
            expect(afterK.line).toBe(2);
        });
    });
});
