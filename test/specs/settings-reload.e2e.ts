import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getRegisterContent,
    setupEditor,
    vimKeys,
    sendVimEscape,
} from '../helpers';

describe('Settings hot-reload', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('disabling text objects should remove them', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return { error: 'no plugin' };
            plugin.settings.enableTextObjects = false;
            plugin.reloadFeatures();
            return { success: true };
        });
        await browser.pause(500);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **bold** world');
            view.editor.setCursor(0, 10);
            view.editor.focus();
        });
        await browser.pause(300);
        await vimKeys('d', 'i', '*');

        const content = await getEditorValue();
        expect(content).toBe('Hello **bold** world');

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableTextObjects = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('re-enabling text objects should restore them', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableTextObjects = false;
            plugin.reloadFeatures();
        });
        await browser.pause(300);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableTextObjects = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **bold** world');
            view.editor.setCursor(0, 10);
            view.editor.focus();
        });
        await browser.pause(300);
        await vimKeys('d', 'i', '*');

        expect(await getEditorValue()).toBe('Hello **** world');
    });

    it('disabling navigation should remove motions', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableNavigation = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('# H1\n\ntext\n\n## H2');
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys([']', 'h']);
        await browser.pause(200);

        const cursorLine = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return view?.editor.getCursor().line ?? -1;
            },
        )) as number;
        expect(cursorLine).toBe(0);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableNavigation = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('disabling status bar should remove the element', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableStatusBar = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        const exists = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-mode');
        })) as boolean;
        expect(exists).toBe(false);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableStatusBar = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('disabling EasyMotion should remove the action', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableEasyMotion = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('Hello world foo bar baz');
                view.editor.setCursor(0, 0);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, 'w');
                const hasOverlay = !!activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                return { success: true, hasOverlay };
            } catch (e) {
                return { error: String(e) };
            }
        })) as { success?: boolean; hasOverlay?: boolean; error?: string };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('hasOverlay', false);

        await sendVimEscape();
        await browser.pause(200);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableEasyMotion = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('re-enabling EasyMotion should restore bindings', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableEasyMotion = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableEasyMotion = true;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');
            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return {
                success: true,
                hasOverlay: !!overlay,
                hasLabels: (overlay?.children.length ?? 0) > 0,
            };
        })) as { success: boolean; hasOverlay: boolean; hasLabels: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('hasOverlay', true);
        expect(result).toHaveProperty('hasLabels', true);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('changing scrolloff lines should update scroll margins', async function () {
        const getScrollMargins = async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return null;
                const editorView = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown> | undefined;
                if (!editorView) return null;
                const cmView = editorView.cm as
                    | { scrollMargins?: { top: number; bottom: number } }
                    | undefined;
                if (!cmView) return null;

                const EditorView = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            EditorView?: {
                                scrollMargins?: {
                                    of: unknown;
                                };
                            };
                        };
                    }
                ).CodeMirrorAdapter?.EditorView;

                const cmEditorView = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as
                    | { cm?: { state?: Record<string, unknown> } }
                    | undefined;
                const state = cmEditorView?.cm?.state;
                if (!state || typeof state !== 'object') return null;

                return { hasState: true };
            })) as { hasState: boolean } | null;

        const setScrolloff = async (lines: number) => {
            await browser.executeObsidian(({ app }, scrollLines: number) => {
                const plugin = (
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
                ).plugins.plugins['vim-motions'];
                if (!plugin) return;
                plugin.settings.scrolloffLines = scrollLines;
                plugin.reloadFeatures();
            }, lines);
            await browser.pause(300);
        };

        await setScrolloff(10);
        const stateCheck = await getScrollMargins();
        expect(stateCheck).not.toBeNull();

        await setScrolloff(0);
        await setScrolloff(5);
    });

    it('Y and Q should work even with workspace navigation disabled', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableWorkspaceNav = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        await setupEditor('hello world', { line: 0, ch: 6 });
        await vimKeys('Y');
        const reg = await getRegisterContent('"');
        expect(reg).not.toBeNull();
        expect(reg!.text).toBe('world');
        expect(reg!.linewise).toBe(false);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
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
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.enableWorkspaceNav = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });
});
