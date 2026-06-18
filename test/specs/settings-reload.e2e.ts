import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getRegisterContent,
    setupEditor,
    vimKeys,
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
        await browser.keys(['Escape']);
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

        await browser.keys(['Escape']);
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

    it('changing scrolloff lines should update scroll padding', async function () {
        const getPadding = async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { top: '', bottom: '' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as { scrollDOM?: HTMLElement } | undefined;
                return {
                    top: cm?.scrollDOM?.style.scrollPaddingTop ?? '',
                    bottom: cm?.scrollDOM?.style.scrollPaddingBottom ?? '',
                };
            })) as { top: string; bottom: string };

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
            plugin.settings.scrolloffLines = 10;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        const after = await getPadding();
        expect(after.top).toBe('220px');
        expect(after.bottom).toBe('220px');

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
            plugin.settings.scrolloffLines = 0;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        const cleared = await getPadding();
        expect(cleared.top).toBe('0px');
        expect(cleared.bottom).toBe('0px');

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
            plugin.settings.scrolloffLines = 5;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
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
