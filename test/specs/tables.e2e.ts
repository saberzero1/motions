import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getSelection,
    getRegisterContent,
    vimKeys,
    sendVimEscape,
} from '../helpers';

describe('Table navigation (]|/[| and ]c/[c)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe(']| / [| (pipe keybinding)', function () {
        it(']| should move to next cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(3);
        });

        it(']| at last cell should wrap to next row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
        });

        it('[| should move to previous cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThan(5);
        });

        it(']| outside a table should no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', '|');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });

    describe(']c / [c (alternative keybinding)', function () {
        it(']c should move to next cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(3);
        });

        it(']c at last cell should wrap to next row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
        });

        it('[c should move to previous cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThan(5);
        });

        it('[c outside a table should no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'c');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });

    describe(']r / [r (vertical cell navigation)', function () {
        it(']r should move to the same column in the next row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'r');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
            expect(pos.ch).toBeGreaterThanOrEqual(4);
        });

        it('[r should move to the same column in the previous row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(2, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, 'r');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThanOrEqual(4);
        });

        it(']r should skip separator rows', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'r');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
        });

        it(']r at last data row should be no-op', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(2, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'r');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
            expect(pos.ch).toBe(2);
        });

        it('[r at first data row should be no-op', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, 'r');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(2);
        });

        it(']r outside a table should be no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'r');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });
});

describe('Table cell text objects (i|/a|)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('i| (inner cell)', function () {
        it('di| should delete cell content between pipes', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    view.editor.setValue(
                        '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                    );
                    view.editor.setCursor(0, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, '|');
                    return view.editor.getValue();
                },
            )) as string;
            expect(value).toMatch(/\| A \|\| C \|/);
        });

        it('ci| should change cell content', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    view.editor.setValue(
                        '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                    );
                    view.editor.setCursor(0, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'c');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, '|');
                    return view.editor.getValue();
                },
            )) as string;
            expect(value).toMatch(/\| A \|\| C \|/);
        });

        it('yi| should yank cell content', async function () {
            const reg = (await browser.executeObsidian(({ app, obsidian }) => {
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
                                        {
                                            toString: () => string;
                                            linewise: boolean;
                                        }
                                    >;
                                };
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return null;
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 5);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return null;
                Vim.handleKey(adapter, 'y');
                Vim.handleKey(adapter, 'i');
                Vim.handleKey(adapter, '|');
                const rc = Vim.getRegisterController();
                const r = rc.registers['"'];
                if (!r) return null;
                return { text: r.toString(), linewise: r.linewise };
            })) as { text: string; linewise: boolean } | null;
            expect(reg).not.toBeNull();
            expect(reg?.text.trim()).toBe('B');
        });

        it.skip('vi| should select cell content (visual + | conflicts with go-to-column)', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('v', 'i', '|');
            const sel = await getSelection();
            expect(sel.trim()).toBe('B');
        });

        it('di| outside a table should no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '|');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });

    describe('a| (around cell)', function () {
        it('da| should delete cell content plus trailing pipe', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    view.editor.setValue(
                        '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                    );
                    view.editor.setCursor(0, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'a');
                    Vim.handleKey(adapter, '|');
                    return view.editor.getValue();
                },
            )) as string;
            expect(value).toMatch(/\| A \| C \|/);
        });

        it('ca| should change cell including trailing pipe', async function () {
            const value = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    view.editor.setValue(
                        '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                    );
                    view.editor.setCursor(0, 5);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return '';
                    Vim.handleKey(adapter, 'c');
                    Vim.handleKey(adapter, 'a');
                    Vim.handleKey(adapter, '|');
                    return view.editor.getValue();
                },
            )) as string;
            expect(value).toMatch(/\| A \| C \|/);
        });
    });
});

describe('Table realignment (:tablerealign)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should realign misaligned table columns', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            view.editor.setValue(
                '| A | Longer text | C |\n|---|---|---|\n| 1 | 2 | 3 |',
            );
            view.editor.setCursor(0, 2);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleEx(adapter, 'tablerealign');
        });
        await browser.pause(300);
        const value = await getEditorValue();
        expect(value).toContain('| Longer text |');
        const lines = value.split('\n');
        const headerPipes = lines[0]?.split('|').length ?? 0;
        const dataPipes = lines[2]?.split('|').length ?? 0;
        expect(headerPipes).toBe(dataPipes);
    });

    it('should preserve alignment markers', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view || !Vim) return;
            view.editor.setValue(
                '| L | C | R |\n|:---|:---:|---:|\n| 1 | 2 | 3 |',
            );
            view.editor.setCursor(0, 2);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleEx(adapter, 'tablerealign');
        });
        await browser.pause(300);
        const value = await getEditorValue();
        const sepLine = value.split('\n')[1] ?? '';
        expect(sepLine).toMatch(/:\s*-+\s/);
        expect(sepLine).toMatch(/:\s*-+\s*:/);
        expect(sepLine).toMatch(/-+\s*:/);
    });

    it('should be no-op outside a table', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Not a table');
            view.editor.setCursor(0, 2);
            view.editor.focus();
        });
        await browser.pause(300);
        const valueBefore = await getEditorValue();
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
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
            Vim.handleEx(adapter, 'tablerealign');
        });
        await browser.pause(300);
        expect(await getEditorValue()).toBe(valueBefore);
    });
});
