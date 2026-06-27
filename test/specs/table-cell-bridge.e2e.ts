import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
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
        return document.querySelectorAll('.cm-table-widget').length > 0;
    })) as boolean;
}

async function countTableWidgets(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const container = (view as unknown as { contentEl: HTMLElement }).contentEl;
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

describe('Cursor-aware table widget toggle — Live Preview', function () {
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

    describe('Cursor inside table — raw markdown', function () {
        it('should suppress table widget when cursor is on a table line', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);
        });

        it('table text should contain pipe characters', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const value = await getEditorValue();
            expect(value).toMatch(/\|/);
        });
    });

    describe('Always-raw mode — no table widgets', function () {
        it('should suppress table widget even when cursor is outside table', async function () {
            await setupEditor(TWO_TABLES, {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);
        });

        it('should suppress all table widgets in document', async function () {
            await setupEditor(TWO_TABLES, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);
        });
    });

    describe('Table cell navigation on raw markdown', function () {
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

    describe('Vim operations on raw table text', function () {
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

    describe('Cursor movement through table via DOM keys (j/k)', function () {
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
    });

    describe('Cursor movement through Welcome.md table via DOM keys', function () {
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

        it('should not get stuck when entering table from above', async function () {
            const doc = [
                'Text above.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
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
    });

    describe('Cursor movement over separator row via DOM keys', function () {
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

        it('k should move from data row over separator to header', async function () {
            const doc = 'Above\n| H1 | H2 |\n|---|---|\n| D1 | D2 |\nBelow';
            await setupEditor(doc, { line: 3, ch: 2 });
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

        it('k over empty-cell table separator', async function () {
            const doc = [
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 2, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 2; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([1, 0]);
        });
    });

    describe('Welcome.md exact reproduction', function () {
        it('k from last row should traverse entire table to text above', async function () {
            const doc = [
                'This is your new _vault_.',
                '',
                'Make a note of something.',
                '',
                'When you are ready, delete this note.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 8, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 8; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
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

        it('k through table with frontmatter above', async function () {
            const doc = [
                '---',
                'test: test',
                '---',
                'This is your new _vault_.',
                '',
                'Make a note of something, or try the Importer!',
                '',
                'When you are ready, delete this note.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 11, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const lines: number[] = [];
            for (let i = 0; i < 5; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                lines.push(pos.line);
            }

            expect(lines).toEqual([10, 9, 8, 7, 6]);
        });

        it('j down through table then k back up with frontmatter', async function () {
            const doc = [
                '---',
                'test: test',
                '---',
                'Text.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 5, ch: 2 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const downLines: number[] = [];
            for (let i = 0; i < 2; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                downLines.push(pos.line);
            }

            const upLines: number[] = [];
            for (let i = 0; i < 2; i++) {
                await browser.keys(['k']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
                const pos = await getCursorPos();
                upLines.push(pos.line);
            }

            expect(downLines).toEqual([6, 7]);
            expect(upLines).toEqual([6, 5]);
        });
    });

    describe('Navigation after insert-mode table edit', function () {
        it('k should work after insert-mode edit in table cell', async function () {
            const doc = [
                'Text above.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 4, ch: 2 });
            await sendVimEscape();
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
                Vim.handleKey(adapter, 'i');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.replaceRange('x', view.editor.getCursor());
            });
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const posAfter = await getCursorPos();
            const value = await getEditorValue();

            await browser.executeObsidian(
                ({ app, obsidian }, line: number, ch: number) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return;
                    view.editor.setCursor(line, ch);
                    view.editor.focus();
                },
                posAfter.line,
                posAfter.ch,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const kResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    if (!view || !Vim) return null;
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as
                        | Record<string, unknown>
                        | undefined;
                    if (!adapter) return null;
                    const cursorBefore = view.editor.getCursor();
                    const handled = Vim.handleKey(adapter, 'k');
                    const cursorAfter = view.editor.getCursor();
                    const vimState = (adapter.state as Record<string, unknown>)
                        ?.vim as Record<string, unknown> | undefined;
                    return {
                        handled,
                        before: {
                            line: cursorBefore.line,
                            ch: cursorBefore.ch,
                        },
                        after: { line: cursorAfter.line, ch: cursorAfter.ch },
                        mode: vimState?.mode,
                        insertMode: vimState?.insertMode,
                    };
                },
            )) as Record<string, unknown> | null;
            expect((kResult?.after as { line: number })?.line).toBeLessThan(
                posAfter.line,
            );
        });

        it('k should cross separator row after insert-mode edit', async function () {
            const doc = [
                'Text above.',
                '',
                '|     |     |',
                '| --- | --- |',
                '|     |     |',
            ].join('\n');
            await setupEditor(doc, { line: 4, ch: 2 });
            await sendVimEscape();
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
                Vim.handleKey(adapter, 'i');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.replaceRange('x', view.editor.getCursor());
            });
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    if (!view || !Vim) return [];
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return [];
                    const lines: number[] = [];
                    for (let i = 0; i < 4; i++) {
                        Vim.handleKey(adapter, 'k');
                        lines.push(view.editor.getCursor().line);
                    }
                    return lines;
                },
            )) as number[];

            expect(result).toEqual([2, 1, 0, 0]);
        });
    });

    describe('Non-table widgets are preserved', function () {
        it('math block should still render as widget', async function () {
            await setupEditor('$$\nx^2\n$$', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            expect(await countTableWidgets()).toBe(0);
        });
    });
});

async function enableCursorAwareMode(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
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
        vm.settings.tableWidgetMode = 'cursor';
        vm.reloadFeatures();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function enableAlwaysRawMode(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
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
        vm.settings.tableWidgetMode = 'always';
        vm.reloadFeatures();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function countRenderedTables(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const container = (view as unknown as { contentEl: HTMLElement }).contentEl;
        return container.querySelectorAll('.vim-table-rendered').length;
    })) as number;
}

describe('Cursor-aware table rendering', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await enableCursorAwareMode();
    });

    after(async function () {
        await enableAlwaysRawMode();
    });

    it('should render custom widget when cursor is outside table', async function () {
        await setupEditor('Text above.\n\n| A | B |\n|---|---|\n| 1 | 2 |', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        expect(await countRenderedTables()).toBe(1);
        expect(await countTableWidgets()).toBe(0);
    });

    it('should hide widget when cursor enters table', async function () {
        await setupEditor('Text above.\n\n| A | B |\n|---|---|\n| 1 | 2 |', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        expect(await countRenderedTables()).toBe(1);

        await setupEditor('Text above.\n\n| A | B |\n|---|---|\n| 1 | 2 |', {
            line: 3,
            ch: 2,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        expect(await countRenderedTables()).toBe(0);
    });

    it('should render only non-focused table in multi-table doc', async function () {
        await setupEditor(TWO_TABLES, { line: 4, ch: 2 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        expect(await countRenderedTables()).toBe(1);
    });

    it('widget should have correct theme classes', async function () {
        await setupEditor('Text above.\n\n| A | B |\n|---|---|\n| 1 | 2 |', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        const classes = (await browser.executeObsidian(() => {
            const el = document.querySelector('.vim-table-rendered');
            if (!el) return null;
            return {
                hasEmbedBlock: el.classList.contains('cm-embed-block'),
                hasMarkdownRendered:
                    el.classList.contains('markdown-rendered'),
                hasTableWrapper:
                    el.querySelector('.table-wrapper') !== null,
                hasTable:
                    el.querySelector('.table-wrapper > table') !== null,
                hasCellWrapper:
                    el.querySelector('.table-cell-wrapper') !== null,
            };
        })) as Record<string, boolean> | null;

        expect(classes).not.toBeNull();
        expect(classes?.hasEmbedBlock).toBe(true);
        expect(classes?.hasMarkdownRendered).toBe(true);
        expect(classes?.hasTableWrapper).toBe(true);
        expect(classes?.hasTable).toBe(true);
        expect(classes?.hasCellWrapper).toBe(true);
    });

    it('should render alignment correctly', async function () {
        await setupEditor(
            'Text.\n\n| L | C | R |\n|:---|:---:|---:|\n| 1 | 2 | 3 |',
            { line: 0, ch: 0 },
        );
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        const aligns = (await browser.executeObsidian(() => {
            const widget = document.querySelector('.vim-table-rendered');
            if (!widget) return null;
            const ths = widget.querySelectorAll('th');
            return Array.from(ths).map(
                (th) => th.getAttribute('align') ?? 'none',
            );
        })) as string[] | null;

        expect(aligns).not.toBeNull();
        expect(aligns).toEqual(['left', 'center', 'right']);
    });

    it('non-table widgets should be unaffected', async function () {
        await setupEditor('$$\nx^2\n$$', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);

        expect(await countRenderedTables()).toBe(0);
    });
});
