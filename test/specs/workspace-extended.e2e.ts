import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Workspace extended', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Split operations', function () {
        it('<C-w>v should split vertically', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>s should split horizontally', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 's');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Fold operations', function () {
        it('zc should fold heading at cursor without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue(
                            '# Heading\n\nContent under heading\n\nMore content',
                        );
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'c');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('zo should unfold without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue(
                            '# Heading\n\nContent under heading\n\nMore content',
                        );
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'c');
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'o');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('zM should fold all without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue('# H1\ntext\n## H2\ntext');
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'M');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('zR should unfold all without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue('# H1\ntext\n## H2\ntext');
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'M');
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'R');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Recursive fold operations', function () {
        it('zO should unfold recursively without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue(
                            '# Heading\n\nContent\n\n## Sub\n\nMore',
                        );
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'O');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('zC should fold recursively without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue(
                            '# Heading\n\nContent\n\n## Sub\n\nMore',
                        );
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'C');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('zA should toggle fold recursively without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue(
                            '# Heading\n\nContent\n\n## Sub\n\nMore',
                        );
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'z');
                        Vim.handleKey(adapter, 'A');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Tab navigation', function () {
        it('gT should switch to previous tab without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'g');
                        Vim.handleKey(adapter, 'T');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });

    describe('Workspace keybindings', function () {
        it('gf should open file switcher without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'g');
                        Vim.handleKey(adapter, 'f');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
        });

        it('grn should trigger rename without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'g');
                        Vim.handleKey(adapter, 'r');
                        Vim.handleKey(adapter, 'n');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
        });

        it('grr should show backlinks without error', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'g');
                        Vim.handleKey(adapter, 'r');
                        Vim.handleKey(adapter, 'r');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>h should focus left pane without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'h');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>l should focus right pane without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'l');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>j should focus pane below without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'j');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>k should focus pane above without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'k');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });

        it('g<C-g> should show document stats without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue('some text here with words');
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, 'g');
                        Vim.handleKey(adapter, '<C-g>');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );
            expect(result).toHaveProperty('success', true);
        });
    });
});
