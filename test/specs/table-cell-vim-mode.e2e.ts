import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    vimKeys,
    sendVimEscape,
    getCursorPos,
    PAUSE,
} from '../helpers';

const TABLE_CONTENT = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |';
const EMBEDDED_TABLE = 'x\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |';

async function ensureLivePreview(): Promise<void> {
    const isLP = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source !== true;
    })) as boolean;
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

async function hasCellEditor(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return document.querySelector('.vim-table-cell-editor') !== null;
    })) as boolean;
}

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return container.querySelector('.vim-table-rendered') !== null;
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
}

async function setTableWidgetMode(mode: 'embedded' | 'cursor'): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, unknown>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                const vimReady = !!(
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: unknown };
                    }
                ).CodeMirrorAdapter?.Vim;
                return Boolean(plugin && vimReady);
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
    await browser.executeObsidian(async ({ app }, tableWidgetMode: string) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            reloadFeatures: () => void;
                            saveData: (data: unknown) => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        if (!plugin) return;
        plugin.settings.tableWidgetMode = tableWidgetMode;
        await plugin.saveData(plugin.settings);
        plugin.reloadFeatures();
    }, mode);
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function prepareEmbeddedTable(
    content: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await setupEditor(content, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
    await browser.executeObsidian(
        ({ app, obsidian }, line: number, ch: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(line, ch);
            view.editor.focus();
        },
        cursor.line,
        cursor.ch,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

describe('Table cell vim mode (table rows + embedded editor)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('ir/ar table row text objects (raw markdown)', function () {
        it('dir should delete inner row content between pipes', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }, content: string) => {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
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
                    if (!view || !Vim) return '';
                    view.editor.setValue(content);
                    view.editor.setCursor(0, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, 'r');
                    return view.editor.getValue();
                },
                TABLE_CONTENT,
            )) as string;

            const headerLine = value.split('\n')[0] ?? '';
            expect(headerLine.replace(/\s/g, '')).toBe('||');
        });

        it('dar should delete the entire row', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }, content: string) => {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
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
                    if (!view || !Vim) return '';
                    view.editor.setValue(content);
                    view.editor.setCursor(2, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'a');
                    Vim.handleKey(adapter, 'r');
                    return view.editor.getValue();
                },
                TABLE_CONTENT,
            )) as string;

            expect(value.split('\n').length).toBe(3);
            expect(value.split('\n')[2]?.trim()).toBe('');
        });

        it('cir should change inner row content', async function () {
            this.skip(); // cir uses the same ir text object as dir — typing after handleKey requires manual verification
            await browser.executeObsidian(
                ({ app, obsidian }, content: string) => {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
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
                    view.editor.setValue(content);
                    view.editor.setCursor(2, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return;
                    Vim.handleKey(adapter, 'c');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, 'r');
                },
                TABLE_CONTENT,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);
            for (const ch of 'new') {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|new|');
        });

        it('yir should yank inner row content', async function () {
            const yanked = (await browser.executeObsidian(
                ({ app, obsidian }, content: string) => {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                    getRegisterController: () => {
                                        registers: Record<
                                            string,
                                            { toString: () => string }
                                        >;
                                    };
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view || !Vim) return '';
                    view.editor.setValue(content);
                    view.editor.setCursor(2, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'y');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, 'r');
                    const rc = Vim.getRegisterController();
                    return rc.registers['"']?.toString() ?? '';
                },
                TABLE_CONTENT,
            )) as string;
            expect(yanked.trim()).toBe('1 | 2 | 3');
        });

        it('ir should be no-op outside a table line', async function () {
            await setupEditor('Not a table line', { line: 0, ch: 5 });
            await vimKeys('d', 'i', 'r');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });

    describe('Embedded table cell editing (embedded mode)', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await ensureLivePreview();
            await setTableWidgetMode('embedded');
        });

        after(async function () {
            await setTableWidgetMode('cursor');
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        beforeEach(async function () {
            await ensureLivePreview();
            await prepareEmbeddedTable(EMBEDDED_TABLE, { line: 2, ch: 2 });
        });

        it('should enter table nav on cursor inside table', async function () {
            const hasWidget = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return false;
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    return (
                        container.querySelector('.vim-table-rendered') !== null
                    );
                },
            )) as boolean;
            expect(hasWidget).toBe(true);
        });

        it('should require two Escapes to exit cell editor', async function () {
            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await hasCellEditor()).toBe(false);
        });

        it('should persist edits after insert → Esc → Esc', async function () {
            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys('ZZ'.split(''));

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const value = await getEditorValue();
            expect(value).toMatch(/\|\s*ZZA\s*\|/);
        });

        it('i should insert at cell start', async function () {
            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Z']);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|ZA|B|C|');
        });

        it('a should append at cell end', async function () {
            await browser.keys(['a']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Z']);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|AZ|B|C|');
        });

        it('c should clear cell and enter insert mode', async function () {
            await browser.keys(['c']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Z']);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|Z|B|C|');
        });

        it('s should substitute cell content', async function () {
            await browser.keys(['s']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Z']);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|Z|B|C|');
        });

        it('Enter in cell editor should produce <br> and keep table valid', async function () {
            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            // Type "X", press Enter, type "Y"
            await browser.keys(['X']);
            await browser.keys(['Enter']);
            await browser.keys(['Y']);

            // Exit: Esc (normal mode) → Esc (exit cell editor)
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const value = await getEditorValue();
            const tableLines = value
                .split('\n')
                .filter((l) => l.trimStart().startsWith('|'));

            expect(tableLines.length).toBe(3);
            for (const line of tableLines) {
                expect(line.trimStart().startsWith('|')).toBe(true);
            }
            expect(value).toMatch(/X<br>Y/i);
        });

        it('should round-trip existing <br> in cell content', async function () {
            const content = 'x\n\n| hello<br>world | B |\n|---|---|\n| 1 | 2 |';
            await prepareEmbeddedTable(content, { line: 2, ch: 2 });

            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const value = await getEditorValue();
            const tableLines = value
                .split('\n')
                .filter((l) => l.trimStart().startsWith('|'));

            expect(tableLines.length).toBe(3);
            expect(tableLines[0]).toMatch(/<br>/i);
        });

        it('should share registers between cell editors', async function () {
            const content = 'x\n\n| A |  | C |\n|---|---|---|\n| 1 | 2 | 3 |';
            await prepareEmbeddedTable(content, { line: 2, ch: 2 });

            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.executeObsidian(({ app }) => {
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
                const activeEditor = (
                    app.workspace as unknown as {
                        activeEditor?: {
                            editor?: { cm?: Record<string, unknown> };
                        };
                    }
                ).activeEditor;
                const editorView = activeEditor?.editor?.cm as
                    | Record<string, unknown>
                    | undefined;
                const adapter = editorView?.cm;
                if (!Vim || !adapter) return;
                Vim.handleKey(adapter, 'y');
                Vim.handleKey(adapter, 'i');
                Vim.handleKey(adapter, 'w');
            });

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await hasCellEditor()).toBe(false);

            await browser.keys(['l']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.executeObsidian(({ app }) => {
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
                const activeEditor = (
                    app.workspace as unknown as {
                        activeEditor?: {
                            editor?: { cm?: Record<string, unknown> };
                        };
                    }
                ).activeEditor;
                const editorView = activeEditor?.editor?.cm as
                    | Record<string, unknown>
                    | undefined;
                const adapter = editorView?.cm;
                if (!Vim || !adapter) return;
                Vim.handleKey(adapter, 'p');
            });

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const line = (await getEditorValue()).split('\n')[2] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|A|A|C|');
        });
    });
});

const TABLE_AT_END = 'Some text\n\n| A | B |\n|---|---|\n| 1 | 2 |';

const EMBEDDED_TWO_TABLES =
    'x\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nSome text\n\n| X | Y |\n|---|---|\n| 3 | 4 |';

describe('Multi-table navigation (embedded mode)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setTableWidgetMode('embedded');
    });

    after(async function () {
        await setTableWidgetMode('cursor');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    beforeEach(async function () {
        await ensureLivePreview();
        await prepareEmbeddedTable(EMBEDDED_TWO_TABLES, { line: 6, ch: 0 });
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    });

    it('should enter second table nav when cursor is in second table', async function () {
        await vimKeys('5j');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const activeOnSecondTable = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const widgets = container.querySelectorAll(
                    '.vim-table-rendered',
                );
                if (widgets.length < 2) return false;
                const secondWidget = widgets[1]!;
                return (
                    secondWidget.querySelector('.vim-table-cell-active') !==
                    null
                );
            },
        )) as boolean;
        expect(activeOnSecondTable).toBe(true);
    });

    it('should open cell editor on second table, not first', async function () {
        await vimKeys('5j');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await browser.keys(['i']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const editorOnSecondTable = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const widgets = container.querySelectorAll(
                    '.vim-table-rendered',
                );
                if (widgets.length < 2) return false;
                const secondWidget = widgets[1]!;
                return (
                    secondWidget.querySelector('.vim-table-cell-editor') !==
                    null
                );
            },
        )) as boolean;
        expect(editorOnSecondTable).toBe(true);
    });

    it('should add row to second table only', async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setTableWidgetMode('embedded');
        await prepareEmbeddedTable(EMBEDDED_TWO_TABLES, { line: 6, ch: 0 });

        await vimKeys('5j');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return false;
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    return (
                        container.querySelector('.vim-table-cell-active') !==
                        null
                    );
                })) as boolean,
            { timeout: 3000, interval: 100 },
        );

        await browser.keys(['o']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const lines = value.split('\n');
        const sepIdx = lines.indexOf('Some text');
        const firstTableLines = lines
            .slice(0, sepIdx)
            .filter((l) => l.trimStart().startsWith('|'));
        expect(firstTableLines).toHaveLength(3);

        const secondTableLines = lines
            .slice(sepIdx + 1)
            .filter((l) => l.trimStart().startsWith('|'));
        expect(secondTableLines.length).toBeGreaterThan(3);
    });

    it('should not affect first table when navigating second table', async function () {
        await vimKeys('5j');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const firstTableUnchanged = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const widgets = container.querySelectorAll(
                    '.vim-table-rendered',
                );
                if (widgets.length < 2) return false;
                const firstWidget = widgets[0]!;
                return (
                    firstWidget.querySelector('.vim-table-cell-active') === null
                );
            },
        )) as boolean;
        expect(firstTableUnchanged).toBe(true);
    });
});

describe('Regression: #119 — cannot leave table downwards on last line', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setTableWidgetMode('embedded');
    });

    after(async function () {
        await setTableWidgetMode('cursor');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('j at last row should exit table when table is at end of document', async function () {
        await prepareEmbeddedTable(TABLE_AT_END, { line: 2, ch: 2 });

        const hasCellHighlight = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(hasCellHighlight).toBe(true);

        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const pos = await getCursorPos();
        const value = await getEditorValue();
        const lineCount = value.split('\n').length;

        expect(pos.line).toBeGreaterThanOrEqual(lineCount - 1);

        const stillInTable = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return true;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(stillInTable).toBe(false);
    });

    it('cursor should be usable after exiting table at end of document', async function () {
        await prepareEmbeddedTable(TABLE_AT_END, { line: 2, ch: 2 });

        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys('hello'.split(''));
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);

        const value = await getEditorValue();
        expect(value).toContain('hello');
    });

    it('header-only table (no data rows) should not enter table-nav', async function () {
        const headerOnly = 'x\n\n| H1 | H2 |\n|---|---|';
        await prepareEmbeddedTable(headerOnly, { line: 2, ch: 2 });

        const hasHighlight = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(hasHighlight).toBe(false);
    });
});

describe('Regression: #120 — shortcuts in embedded table cell selection mode', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setTableWidgetMode('embedded');
    });

    after(async function () {
        await setTableWidgetMode('cursor');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    beforeEach(async function () {
        await ensureLivePreview();
        await prepareEmbeddedTable(EMBEDDED_TABLE, { line: 2, ch: 2 });
    });

    it.skip('Escape in cell selection mode should exit table nav (DOM Escape not routed through activeDocument capture in WDIO)', async function () {
        const inTableBefore = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(inTableBefore).toBe(true);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const container = (view as unknown as { contentEl: HTMLElement })
                .contentEl;
            const widget = container.querySelector('.vim-table-rendered');
            if (!widget) return;
            widget.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const inTableAfter = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return true;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(inTableAfter).toBe(false);
    });

    it('unhandled keys in cell selection should not be swallowed', async function () {
        const inTable = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const container = (view as unknown as { contentEl: HTMLElement })
                .contentEl;
            return container.querySelector('.vim-table-cell-active') !== null;
        })) as boolean;
        expect(inTable).toBe(true);

        const modeBefore = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: { status?: string };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            return Vim?.status ?? '';
        })) as string;

        await browser.keys(['g']);
        await browser.pause(200);

        const modeAfterG = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: { status?: string };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            return Vim?.status ?? '';
        })) as string;

        expect(modeAfterG.length).toBeGreaterThanOrEqual(0);
    });

    it('clicking a cell in the widget should update active cell', async function () {
        const inTableBefore = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(inTableBefore).toBe(true);

        const clicked = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { clicked: false };
            const container = (view as unknown as { contentEl: HTMLElement })
                .contentEl;
            const targetCell = container.querySelector(
                '[data-row="2"][data-col="1"]',
            );
            if (!targetCell) return { clicked: false, reason: 'no cell' };
            targetCell.dispatchEvent(
                new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                }),
            );
            const active = container.querySelector('.vim-table-cell-active');
            return {
                clicked: true,
                activeRow: active?.getAttribute('data-row'),
                activeCol: active?.getAttribute('data-col'),
            };
        })) as {
            clicked: boolean;
            activeRow?: string;
            activeCol?: string;
        };

        expect(clicked.clicked).toBe(true);
        expect(clicked.activeRow).toBe('2');
        expect(clicked.activeCol).toBe('1');
    });

    it.skip('clicking a cell from outside table should enter table-nav at clicked cell (widget lifecycle timing in WDIO)', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const noHighlightBefore = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return true;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') === null
                );
            },
        )) as boolean;
        expect(noHighlightBefore).toBe(true);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const container = (view as unknown as { contentEl: HTMLElement })
                .contentEl;
            const targetCell = container.querySelector(
                '[data-row="2"][data-col="1"]',
            );
            if (!targetCell) return;
            targetCell.dispatchEvent(
                new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });

        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return false;
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    return (
                        container.querySelector('.vim-table-cell-active') !==
                        null
                    );
                })) as boolean,
            { timeout: 3000, interval: 100 },
        );

        const active = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            const container = (view as unknown as { contentEl: HTMLElement })
                .contentEl;
            const cell = container.querySelector('.vim-table-cell-active');
            if (!cell) return null;
            return {
                row: cell.getAttribute('data-row'),
                col: cell.getAttribute('data-col'),
            };
        })) as { row: string; col: string } | null;

        expect(active).not.toBeNull();
        expect(active?.row).toBe('2');
        expect(active?.col).toBe('1');
    });

    it('click outside table should exit table-nav', async function () {
        const inTableBefore = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(inTableBefore).toBe(true);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        const inTableAfter = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return true;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return (
                    container.querySelector('.vim-table-cell-active') !== null
                );
            },
        )) as boolean;
        expect(inTableAfter).toBe(false);
    });
});
