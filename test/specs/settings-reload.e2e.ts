import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getRegisterContent,
    PAUSE,
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
                    { cm?: { state?: Record<string, unknown> } } | undefined;
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
        const afterZero = await getScrollMargins();
        expect(afterZero).not.toBeNull();

        await setScrolloff(5);
        const afterFive = await getScrollMargins();
        expect(afterFive).not.toBeNull();
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

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!Vim || !view) return { error: 'no vim/view' };
            view.editor.setValue('hello world');
            view.editor.setCursor(0, 6);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'no adapter' };
            Vim.handleKey(adapter, '<Esc>');
            Vim.handleKey(adapter, 'Y');
            const controller = Vim.getRegisterController() as Record<
                string,
                (...args: unknown[]) => unknown
            >;
            const reg = controller.getRegister('"') as {
                toString: () => string;
                linewise: boolean;
            } | null;
            return {
                text: reg?.toString() ?? '',
                linewise: reg?.linewise ?? false,
            };
        });
        expect(result.error).toBeUndefined();
        expect(result.text).toBe('world');
        expect(result.linewise).toBe(false);

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

    it('snippet ex commands should survive reloadFeatures', async function () {
        // Ensure snippets are loaded before testing
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    {
                                        snippetRegistry?: {
                                            getAll: () => unknown[];
                                        };
                                    }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    const all = plugin?.snippetRegistry?.getAll();
                    return Array.isArray(all) && all.length > 0;
                })) as boolean,
            { timeout: 10000, interval: 200 },
        );

        // Trigger reloadFeatures (simulates vimrc/lua config reload)
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
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        // :snippet <name> should still work after reload
        await setupEditor('', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const result = (await browser.executeObsidian(
            ({ app, obsidian }, cmd: string) => {
                try {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleEx: (
                                        cm: unknown,
                                        input: string,
                                    ) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };
                    Vim.handleEx(adapter, cmd);
                    return { success: true };
                } catch (e) {
                    return { error: String(e) };
                }
            },
            'snippet Wikilink',
        )) as { success?: true; error?: string };

        expect(result).toHaveProperty('success', true);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const value = await getEditorValue();
        expect(value).toContain('[[');
    });

    it('disabling workspace nav should not break editor ex commands (#165)', async function () {
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
            plugin.settings.picker = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        await setupEditor('test content', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleEx(adapter, 'buffers');
        });
        await browser.pause(300);

        const hasModal = await browser.executeObsidian(() => {
            return !!activeDocument.querySelector('.modal-container');
        });
        expect(hasModal).toBe(true);

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
            plugin.settings.picker = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('disabling workspace nav should not break core vim actions (#165)', async function () {
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

        await setupEditor('# Heading\nbody text', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, '<Esc>');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'O');
        });
        await browser.pause(300);

        const hasModal = await browser.executeObsidian(() => {
            return !!activeDocument.querySelector('.modal-container');
        });
        expect(hasModal).toBe(true);

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

    it('disabling hard-wrap should not break fold commands', async function () {
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
            plugin.settings.enableHardWrap = false;
            plugin.reloadFeatures();
        });
        await browser.pause(500);

        await setupEditor('# H1\nbody\n\n## H2\nmore', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const cursorLine = await browser.executeObsidian(
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
                if (!Vim) return -1;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return -1;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return -1;
                Vim.handleKey(adapter, '<Esc>');
                Vim.handleKey(adapter, 'z');
                Vim.handleKey(adapter, 'j');
                return view.editor.getCursor().line;
            },
        );
        expect(cursorLine).toBeGreaterThan(0);

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
            plugin.settings.enableHardWrap = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('leader-leader keyToKey mapping should execute after timeout (#166)', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures: () => void;
                                leaderRegistry: {
                                    setLeaderKey: (k: string) => void;
                                    getLeaderKey: () => string;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.picker = false;
            plugin.leaderRegistry.setLeaderKey(' ');
            plugin.reloadFeatures();
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            setOption: (name: string, value: unknown) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.setOption('operatorshadowtimeout', 100);
        });
        await browser.pause(500);

        await setupEditor('test', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            noremap: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.noremap('<Space><Space>', ':buffers<CR>', 'normal');
            Vim.handleKey(adapter, '<Esc>');
            Vim.handleKey(adapter, '<Space>');
            Vim.handleKey(adapter, '<Space>');
        });

        await browser.pause(400);

        const hasModal = await browser.executeObsidian(() => {
            return !!activeDocument.querySelector('.modal-container');
        });
        expect(hasModal).toBe(true);

        await browser.executeObsidian(({ app }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            unmap: (lhs: string, ctx?: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.unmap('<Space><Space>', 'normal');
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures: () => void;
                                leaderRegistry: {
                                    setLeaderKey: (k: string) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.picker = true;
            plugin.leaderRegistry.setLeaderKey('\\');
            plugin.reloadFeatures();
            const Vim2 = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            setOption: (name: string, value: unknown) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim2?.setOption('operatorshadowtimeout', 1000);
        });
        await browser.pause(300);
    });

    it('timeoutlen=0 should execute deferred mapping immediately (#166)', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures: () => void;
                                leaderRegistry: {
                                    setLeaderKey: (k: string) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.picker = false;
            plugin.leaderRegistry.setLeaderKey(' ');
            plugin.reloadFeatures();
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            setOption: (name: string, value: unknown) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.setOption('operatorshadowtimeout', 0);
        });
        await browser.pause(500);

        await setupEditor('test', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasModal = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            noremap: (
                                lhs: string,
                                rhs: string,
                                ctx?: string,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return false;
            Vim.noremap('<Space><Space>', ':buffers<CR>', 'normal');
            Vim.handleKey(adapter, '<Esc>');
            Vim.handleKey(adapter, '<Space>');
            Vim.handleKey(adapter, '<Space>');
            return !!activeDocument.querySelector('.modal-container');
        });
        expect(hasModal).toBe(true);

        await browser.executeObsidian(({ app }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            unmap: (lhs: string, ctx?: string) => void;
                            setOption: (name: string, value: unknown) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            Vim?.unmap('<Space><Space>', 'normal');
            Vim?.setOption('operatorshadowtimeout', 1000);
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures: () => void;
                                leaderRegistry: {
                                    setLeaderKey: (k: string) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.picker = true;
            plugin.leaderRegistry.setLeaderKey('\\');
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('disabling workspace nav should not break ex command line (#164)', async function () {
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

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.leaf.getViewState();
            state.state = { ...state.state, mode: 'preview' };
            void view.leaf.setViewState(state);
        });
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                globalKeyHandler: unknown;
                                globalRegistry: unknown;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return {
                hasGlobalKeyHandler: !!plugin?.globalKeyHandler,
                hasGlobalRegistry: !!plugin?.globalRegistry,
            };
        });
        expect(result.hasGlobalKeyHandler).toBe(true);
        expect(result.hasGlobalRegistry).toBe(true);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.leaf.getViewState();
            state.state = { ...state.state, mode: 'source' };
            void view.leaf.setViewState(state);
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
            plugin.settings.enableWorkspaceNav = true;
            plugin.reloadFeatures();
        });
        await browser.pause(300);
    });

    it('disabling workspace nav should not break lua global keymaps (#164)', async function () {
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

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                globalRegistry: {
                                    addMapping: (
                                        keys: string,
                                        action: unknown,
                                        opts: unknown,
                                    ) => void;
                                    resolve: (seq: string) => { type: string };
                                } | null;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return { error: 'no plugin' };
            if (!plugin.globalRegistry) {
                return { registryExists: false };
            }
            plugin.globalRegistry.addMapping(
                'T',
                {
                    type: 'builtin',
                    fn: () => {},
                },
                { source: 'user', gate: 'standard' },
            );
            const resolved = plugin.globalRegistry.resolve('T');
            (
                plugin.globalRegistry as unknown as {
                    removeMapping: (k: string) => void;
                }
            ).removeMapping('T');
            return {
                registryExists: true,
                canResolve: resolved.type === 'exact',
            };
        });
        expect(result.registryExists).toBe(true);
        expect(result.canResolve).toBe(true);

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

    it('reloadFeatures should re-apply Lua keymap deletions (#162)', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'no Vim' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'no adapter' };

            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                reloadFeatures: () => void;
                                leaderRegistry: {
                                    getLeaderKey: () => string;
                                };
                                luaMapOperations: Array<{
                                    type: string;
                                    map: { lhs: string; mode: string };
                                }>;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return { error: 'no plugin' };

            const leader = plugin.leaderRegistry.getLeaderKey();
            const hintLhs = leader + leader + 'h';

            Vim.handleKey(adapter, '<Esc>');

            plugin.luaMapOperations.push({
                type: 'unmap',
                map: { lhs: hintLhs, mode: 'normal' },
            });

            plugin.reloadFeatures();
            Vim.handleKey(adapter, '<Esc>');

            let mappingStillExists = false;
            try {
                const removed = Vim.unmap(hintLhs, 'normal');
                mappingStillExists = !!removed;
            } catch {
                mappingStillExists = false;
            }

            plugin.luaMapOperations.pop();

            return { mappingStillExists };
        });

        expect(result.error).toBeUndefined();
        expect(result.mappingStillExists).toBe(false);
    });
});
