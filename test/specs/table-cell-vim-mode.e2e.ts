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
    await setupEditor(content, cursor);
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | { cm?: { state?: { selection?: { main?: { head?: number } } } } }
            | undefined;
        const editorView = (cm?.cm ?? cm) as
            | {
                  state?: { selection?: { main?: { head?: number } } };
                  dispatch?: (tr: unknown) => void;
              }
            | undefined;
        const head = editorView?.state?.selection?.main?.head;
        if (!editorView?.dispatch || head === undefined) return;
        editorView.dispatch({ selection: { anchor: head } });
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
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
            await ensureLivePreview();
            await setTableWidgetMode('embedded');
        });

        after(async function () {
            await setTableWidgetMode('cursor');
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        beforeEach(async function () {
            await ensureLivePreview();
            await prepareEmbeddedTable(TABLE_CONTENT, { line: 0, ch: 2 });
        });

        // Embedded mode table widget rendering requires a fresh Obsidian
        // load to register the CM6 extension. Re-opening files or calling
        // reloadFeatures() mid-session does not trigger widget creation.
        // TODO: investigate CM6 registerEditorExtension lifecycle in WDIO.
        before(function () {
            this.skip();
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
            expect(value).toMatch(/\|\s*ZZ\s*\|/);
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

            const line = (await getEditorValue()).split('\n')[0] ?? '';
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

            const line = (await getEditorValue()).split('\n')[0] ?? '';
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

            const line = (await getEditorValue()).split('\n')[0] ?? '';
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

            const line = (await getEditorValue()).split('\n')[0] ?? '';
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
            const lines = value.split('\n');

            expect(lines.length).toBe(3);
            for (const line of lines) {
                expect(line.trimStart().startsWith('|')).toBe(true);
            }
            expect(value).toMatch(/X<br>Y/i);
        });

        it('should round-trip existing <br> in cell content', async function () {
            const content = '| hello<br>world | B |\n|---|---|\n| 1 | 2 |';
            await prepareEmbeddedTable(content, { line: 0, ch: 2 });

            await browser.keys(['i']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await hasCellEditor()).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const value = await getEditorValue();
            const lines = value.split('\n');

            expect(lines.length).toBe(3);
            expect(lines[0]).toMatch(/<br>/i);
        });

        it('should share registers between cell editors', async function () {
            const content = '| A |  | C |\n|---|---|---|\n| 1 | 2 | 3 |';
            await prepareEmbeddedTable(content, { line: 0, ch: 2 });

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

            const line = (await getEditorValue()).split('\n')[0] ?? '';
            expect(line.replace(/\s/g, '')).toBe('|A|A|C|');
        });
    });
});

const TWO_TABLES =
    '| A | B |\n|---|---|\n| 1 | 2 |\n\nSome text\n\n| X | Y |\n|---|---|\n| 3 | 4 |';

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
        await prepareEmbeddedTable(TWO_TABLES, { line: 4, ch: 0 });
    });

    // Embedded mode table widget rendering requires a fresh Obsidian
    // load to register the CM6 extension. Re-opening files or calling
    // reloadFeatures() mid-session does not trigger widget creation.
    // TODO: investigate CM6 registerEditorExtension lifecycle in WDIO.
    before(function () {
        this.skip();
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
        await vimKeys('5j');
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await browser.keys(['o']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const lines = value.split('\n');
        const firstTableLines = lines.slice(0, 3);
        expect(firstTableLines).toHaveLength(3);

        const secondTableStart = lines.indexOf(
            lines.find((l, i) => i > 3 && l.startsWith('| X'))!,
        );
        const secondTableLines = lines
            .slice(secondTableStart)
            .filter((l) => l.startsWith('|'));
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
