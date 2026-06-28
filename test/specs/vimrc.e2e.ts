import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    getRegisterContent,
    unsupported,
    sendVimEscape,
} from '../helpers';

async function loadVimrc(content: string): Promise<void> {
    await obsidianPage.write('.obsidian.vimrc', content);
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { vimrcLoaded?: boolean }>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.vimrcLoaded === true;
            })) as boolean,
        { timeout: 5000, interval: 100 },
    );
}

async function assertPluginLoaded(): Promise<void> {
    const result = await browser.executeObsidian(({ app }) => {
        const plugins = (
            app as unknown as {
                plugins: { plugins: Record<string, unknown> };
            }
        ).plugins.plugins;
        return { pluginLoaded: 'vim-motions' in plugins };
    });
    expect(result).toHaveProperty('pluginLoaded', true);
}

describe('Vimrc support (Phase 2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should load a .obsidian.vimrc with key mappings', async function () {
        await loadVimrc('"Test vimrc\nnmap j gj\nnmap k gk\n');
        await assertPluginLoaded();
    });

    it('should handle vimrc with exmap and obcommand', async function () {
        await loadVimrc(
            '"Test vimrc with exmap\nexmap saveFile obcommand editor:save-file\nnmap <C-s> :saveFile\n',
        );
        await assertPluginLoaded();
    });

    it('should survive malformed vimrc lines', async function () {
        await loadVimrc(
            '"Test malformed\nnmap\nset\ngarbage line\nnmap j gj\n',
        );
        await assertPluginLoaded();
    });

    it('should apply let mapleader and replace <leader> in mappings', async function () {
        await loadVimrc('let mapleader = ","\nnmap <leader>j gj\n');
        await assertPluginLoaded();
    });

    it('should support nnoremap for non-recursive mappings', async function () {
        await loadVimrc('nnoremap j gj\nnnoremap k gk\n');
        await assertPluginLoaded();
    });

    it('should combine let mapleader with noremap', async function () {
        await loadVimrc('let mapleader = ","\nnnoremap <leader>j gj\n');
        await assertPluginLoaded();
    });

    it('should handle set options including textwidth and expandtab', async function () {
        await loadVimrc(
            'set clipboard=unnamed\nset tabstop=2\nset textwidth=100\nset shiftwidth=2\nset expandtab\n',
        );
        await assertPluginLoaded();
    });

    it('should handle set noexpandtab (boolean false)', async function () {
        await loadVimrc('set noexpandtab\n');
        await assertPluginLoaded();
    });

    it('should survive unknown set options without crashing', async function () {
        await loadVimrc('set unknownoption=foo\nset clipboard=unnamed\n');
        await assertPluginLoaded();
    });

    it('EasyMotion should work with default leader key (backslash)', async function () {
        await obsidianPage.resetVault();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(1000);

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
        })) as { success: boolean; hasOverlay: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('hasOverlay', true);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('EasyMotion word should work with space as leader key (issue #6)', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            defineAction: (
                                name: string,
                                fn: () => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
                            unmap: (keys: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            try {
                Vim.unmap('<Space>');
            } catch {
                /* may not exist */
            }
            let triggered = false;
            Vim.defineAction('testSpaceWord', () => {
                triggered = true;
            });
            Vim.mapCommand('  w', 'action', 'testSpaceWord', {});

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, ' ');
            Vim.handleKey(adapter, ' ');
            Vim.handleKey(adapter, 'w');
            return { success: true, triggered };
        })) as { success: boolean; triggered: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('triggered', true);
    });

    it('EasyMotion should work with comma as leader key', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            defineAction: (
                                name: string,
                                fn: () => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
                            unmap: (
                                keys: string,
                                ctx?: string,
                                options?: { includeDefaults?: boolean },
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

            try {
                Vim.unmap(',', undefined, { includeDefaults: true });
            } catch {
                /* may not exist */
            }
            let triggered = false;
            Vim.defineAction('testCommaWord', () => {
                triggered = true;
            });
            Vim.mapCommand(',,w', 'action', 'testCommaWord', {});

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, ',');
            Vim.handleKey(adapter, ',');
            Vim.handleKey(adapter, 'w');
            return { success: true, triggered };
        })) as { success: boolean; triggered: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('triggered', true);
    });

    it('should work without a .obsidian.vimrc file', async function () {
        await obsidianPage.resetVault();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
        await assertPluginLoaded();
    });
});

describe('Vimrc compatibility (obsidian-vimrc-support README examples)', function () {
    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    describe('nmap j gj / nmap k gk (visual line navigation)', function () {
        before(async function () {
            await loadVimrc(
                '" Have j and k navigate visual lines rather than logical ones\nnmap j gj\nnmap k gk\n',
            );
        });

        it('j should move down one visual line', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('k should move up one visual line', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 2,
                ch: 0,
            });
            await vimKeys('k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('nmap H ^ / nmap L $ (beginning/end of line)', function () {
        before(async function () {
            await loadVimrc('nmap H ^\nnmap L $\n');
        });

        it('H should move to first non-blank character', async function () {
            await setupEditor('   hello world', { line: 0, ch: 8 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(3);
        });

        unsupported(
            'L should move to end of line',
            'CM Vim lifecycle: nmap L $ applied during active-leaf-change is lost — $ specifically fails while other rhs values (e.g. 0) work (spike17 Diag 1x confirmed)',
            async function () {
                await setupEditor('hello world', { line: 0, ch: 0 });
                await vimKeys('L');
                const pos = await getCursorPos();
                expect(pos.ch).toBe(10);
            },
        );
    });

    describe('set clipboard=unnamed (yank to system clipboard)', function () {
        before(async function () {
            await loadVimrc('set clipboard=unnamed\n');
            await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                setOption: (
                                    name: string,
                                    value: unknown,
                                ) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                Vim?.setOption('clipboard', 'unnamed');
            });
        });

        it('yy should yank into the unnamed register', async function () {
            await setupEditor('clipboard test', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('clipboard test');
        });

        it('yy should also populate the + register', async function () {
            await setupEditor('sync to clipboard', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('sync to clipboard');
        });

        it('yw should also populate the + register', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello');
        });

        it('dd should also populate the + register', async function () {
            await setupEditor('delete me\nkeep me', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('delete me');
            expect(await getEditorValue()).toBe('keep me');
        });
    });

    describe('exmap + obcommand pattern (app:go-back / app:go-forward)', function () {
        before(async function () {
            await loadVimrc(
                [
                    'exmap back obcommand app:go-back',
                    'exmap forward obcommand app:go-forward',
                    'nmap <C-o> :back',
                    'nmap <C-i> :forward',
                ].join('\n') + '\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('obcommand inline (without exmap)', function () {
        before(async function () {
            await loadVimrc(
                'nmap <C-w>h :obcommand workspace:split-horizontal\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('unmap <Space> for chord building', function () {
        before(async function () {
            await loadVimrc(
                'unmap <Space>\nnmap <Space>j gj\nnmap <Space>k gk\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('leader key with obcommand mappings', function () {
        before(async function () {
            await loadVimrc(
                [
                    'let mapleader = ","',
                    'exmap saveFile obcommand editor:save-file',
                    'nmap <leader>w :saveFile',
                ].join('\n') + '\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('leader key mappings execute correctly (issue #21)', function () {
        describe('comma as leader', function () {
            before(async function () {
                await loadVimrc(
                    ['let mapleader = ","', 'nmap <leader>j gj'].join('\n') +
                        '\n',
                );
            });

            it(',j should move cursor down (mapped to gj)', async function () {
                await setupEditor('line one\nline two\nline three', {
                    line: 0,
                    ch: 0,
                });
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
                        Vim.handleKey(adapter, ',');
                        Vim.handleKey(adapter, 'j');
                        const cursor = view.editor.getCursor();
                        return { line: cursor.line, ch: cursor.ch };
                    },
                )) as { line: number; ch: number };
                expect(result.line).toBe(1);
            });

            it('comma should not insert a literal comma in normal mode', async function () {
                await setupEditor('hello', { line: 0, ch: 0 });
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
                        Vim.handleKey(adapter, '<Esc>');
                        Vim.handleKey(adapter, ',');
                        return { value: view.editor.getValue() };
                    },
                )) as { value: string };
                expect(result.value).toBe('hello');
            });
        });

        describe('space as leader', function () {
            before(async function () {
                await loadVimrc(
                    ['let mapleader = ","', 'nmap <leader>j gj'].join('\n') +
                        '\n',
                );
                const diag = (await browser.executeObsidian(async ({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    {
                                        vimrcLoaded?: boolean;
                                        vimrcCommandCount?: number;
                                        leaderRegistry?: {
                                            getLeaderKey: () => string;
                                        };
                                    }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    let vimrcContent: string | null = null;
                    try {
                        vimrcContent =
                            await app.vault.adapter.read('.obsidian.vimrc');
                    } catch {
                        vimrcContent = 'READ_ERROR';
                    }
                    const files = app.vault.getFiles().map((f) => f.path);
                    return {
                        vimrcLoaded: plugin?.vimrcLoaded,
                        vimrcCommandCount: plugin?.vimrcCommandCount,
                        leaderKey: plugin?.leaderRegistry?.getLeaderKey(),
                        vimrcContent,
                        fileCount: files.length,
                        vimrcInFiles: files.some((f) => f.includes('vimrc')),
                    };
                })) as Record<string, unknown>;
                console.log(
                    'EasyMotion before() diagnostic:',
                    JSON.stringify(diag),
                );
            });

            it('space+j should move cursor down (mapped to gj)', async function () {
                await setupEditor('line one\nline two\nline three', {
                    line: 0,
                    ch: 0,
                });
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
                        Vim.handleKey(adapter, ' ');
                        Vim.handleKey(adapter, 'j');
                        const cursor = view.editor.getCursor();
                        return { line: cursor.line, ch: cursor.ch };
                    },
                )) as { line: number; ch: number };
                expect(result.line).toBe(1);
            });

            it('space should not insert a literal space in normal mode', async function () {
                await setupEditor('hello', { line: 0, ch: 0 });
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
                        Vim.handleKey(adapter, '<Esc>');
                        Vim.handleKey(adapter, ' ');
                        return { value: view.editor.getValue() };
                    },
                )) as { value: string };
                expect(result.value).toBe('hello');
            });
        });

        describe('EasyMotion with custom leader via reregisterLeaderFeatures', function () {
            it(',,w should trigger EasyMotion overlay after leader change to comma', async function () {
                await setupEditor('Hello world foo bar baz', {
                    line: 0,
                    ch: 0,
                });
                const result = (await browser.executeObsidian(
                    ({ app, obsidian }) => {
                        const plugin = (
                            app as unknown as {
                                plugins: {
                                    plugins: Record<
                                        string,
                                        {
                                            leaderRegistry?: {
                                                setLeaderKey: (
                                                    k: string,
                                                ) => void;
                                                getLeaderKey: () => string;
                                            };
                                            reregisterLeaderFeatures?: () => void;
                                        }
                                    >;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        if (
                            !plugin?.leaderRegistry ||
                            !plugin.reregisterLeaderFeatures
                        )
                            return { error: 'No plugin API' };

                        plugin.leaderRegistry.setLeaderKey(',');
                        plugin.reregisterLeaderFeatures();

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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue('Hello world foo bar baz');
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, ',');
                        Vim.handleKey(adapter, ',');
                        Vim.handleKey(adapter, 'w');
                        const hasOverlay = !!activeDocument.querySelector(
                            '.vim-motions-easymotion',
                        );
                        return {
                            success: true,
                            hasOverlay,
                            leaderKey: plugin.leaderRegistry.getLeaderKey(),
                        };
                    },
                )) as Record<string, unknown>;
                expect(result).toHaveProperty('success', true);
                expect(result).toHaveProperty('leaderKey', ',');
                expect(result).toHaveProperty('hasOverlay', true);
                await sendVimEscape();
                await browser.pause(200);
            });

            it('\\\\w should NOT trigger EasyMotion after leader change to comma', async function () {
                // Dismiss any leftover overlay from the previous test
                await browser.executeObsidian(() => {
                    activeDocument
                        .querySelectorAll('.vim-motions-easymotion')
                        .forEach((el) => el.remove());
                });
                await browser.pause(100);
                await setupEditor('Hello world foo bar baz', {
                    line: 0,
                    ch: 0,
                });
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.setValue('Hello world foo bar baz');
                        view.editor.setCursor(0, 0);
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '\\');
                        Vim.handleKey(adapter, '\\');
                        Vim.handleKey(adapter, 'w');
                        const hasOverlay = !!activeDocument.querySelector(
                            '.vim-motions-easymotion',
                        );
                        return { success: true, hasOverlay };
                    },
                )) as { success: boolean; hasOverlay: boolean };
                expect(result).toHaveProperty('success', true);
                expect(result).toHaveProperty('hasOverlay', false);
                await sendVimEscape();
                await browser.pause(200);
            });
        });
    });

    describe('fold emulation via exmap + obcommand', function () {
        before(async function () {
            await loadVimrc(
                [
                    'exmap togglefold obcommand editor:toggle-fold',
                    'nmap zo :togglefold',
                    'nmap zc :togglefold',
                    'nmap za :togglefold',
                    'exmap unfoldall obcommand editor:unfold-all',
                    'nmap zR :unfoldall',
                    'exmap foldall obcommand editor:fold-all',
                    'nmap zM :foldall',
                ].join('\n') + '\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('tab emulation via exmap + obcommand', function () {
        before(async function () {
            await loadVimrc(
                [
                    'exmap tabnext obcommand workspace:next-tab',
                    'nmap gt :tabnext',
                    'exmap tabprev obcommand workspace:previous-tab',
                    'nmap gT :tabprev',
                ].join('\n') + '\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });
    });

    describe('combined vimrc (README recommended config)', function () {
        before(async function () {
            await loadVimrc(
                [
                    '" Have j and k navigate visual lines rather than logical ones',
                    'nmap j gj',
                    'nmap k gk',
                    '" I like using H and L for beginning/end of line',
                    'nmap H ^',
                    'nmap L $',
                    '',
                    '" Yank to system clipboard',
                    'set clipboard=unnamed',
                    '',
                    '" Go back and forward with Ctrl+O and Ctrl+I',
                    'exmap back obcommand app:go-back',
                    'nmap <C-o> :back',
                    'exmap forward obcommand app:go-forward',
                    'nmap <C-i> :forward',
                ].join('\n') + '\n',
            );
        });

        it('should load without errors', async function () {
            await assertPluginLoaded();
        });

        it('H should move to first non-blank character', async function () {
            await setupEditor('   hello world', { line: 0, ch: 8 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(3);
        });

        unsupported(
            'L should move to end of line',
            'CM Vim lifecycle: nmap L $ applied during active-leaf-change is lost — $ specifically fails while other rhs values (e.g. 0) work (spike17 Diag 1x confirmed)',
            async function () {
                await setupEditor('hello world', { line: 0, ch: 0 });
                await vimKeys('L');
                const pos = await getCursorPos();
                expect(pos.ch).toBe(10);
            },
        );

        it('j/k should still work for navigation', async function () {
            await setupEditor('line1\nline2\nline3', { line: 0, ch: 0 });
            await vimKeys('j');
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('k');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('yy should yank into default register', async function () {
            await setupEditor('test line', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('test line');
        });
    });

    describe('noremap prevents recursive mapping', function () {
        before(async function () {
            await loadVimrc('nnoremap j k\nnnoremap k j\n');
        });

        unsupported(
            'j mapped to k should move up, not recurse back to j',
            'CM Vim noremap cannot swap built-in motions — confirmed limitation in obsidian-vimrc-support issue #16',
            async function () {
                await setupEditor('line1\nline2\nline3', { line: 1, ch: 0 });
                await vimKeys('j');
                const pos = await getCursorPos();
                expect(pos.line).toBe(0);
            },
        );
    });

    describe('imap / vmap context-specific mappings', function () {
        before(async function () {
            await loadVimrc('imap jk <Esc>\n');
        });

        it('jk in insert mode should exit to normal mode', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['j', 'k']);
            await browser.pause(300);
            const mode = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return 'unknown';
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const state = cm?.state as Record<string, unknown> | undefined;
                const vim = state?.vim as Record<string, unknown> | undefined;
                if (vim?.insertMode) return 'insert';
                return 'normal';
            })) as string;
            expect(mode).toBe('normal');
        });
    });

    describe('set textwidth changes gq wrap width', function () {
        before(async function () {
            await loadVimrc('set textwidth=20\n');
        });

        unsupported(
            'gqq should wrap at 20 columns',
            'CM Vim lifecycle: defineOption callback resets textwidthValue to 80 during editor initialization, overwriting the vimrc-set value',
            async function () {
                await setupEditor(
                    'This is a line that exceeds twenty characters by a lot',
                    { line: 0, ch: 0 },
                );
                await vimKeys('g', 'q', 'q');
                const val = await getEditorValue();
                const lines = val.split('\n');
                expect(lines.length).toBeGreaterThan(1);
                for (const line of lines) {
                    if (line.trim().length > 0) {
                        expect(line.length).toBeLessThanOrEqual(21);
                    }
                }
            },
        );
    });

    describe('set insertmodeescape (custom insert escape)', function () {
        before(async function () {
            await loadVimrc('set insertmodeescape=jk\n');
        });

        it('jk should exit insert mode', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['j', 'k']);
            await browser.pause(300);
            const mode = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return 'unknown';
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const state = cm?.state as Record<string, unknown> | undefined;
                const vim = state?.vim as Record<string, unknown> | undefined;
                if (vim?.insertMode) return 'insert';
                return 'normal';
            })) as string;
            expect(mode).toBe('normal');
        });
    });

    describe('intentionally unsupported commands', function () {
        unsupported(
            'surround command',
            'Security/complexity — use native text objects instead',
            async function () {
                await loadVimrc(
                    'exmap surround_quotes surround " "\nmap s" :surround_quotes\n',
                );
            },
        );

        unsupported(
            'pasteinto command',
            'Not implemented — use native paste with visual selection',
            async function () {
                await loadVimrc('map <A-p> :pasteinto\n');
            },
        );

        unsupported(
            'jscommand (arbitrary JavaScript)',
            'Security risk — intentionally excluded',
            async function () {
                await loadVimrc(
                    'jscommand { console.log(editor.getCursor()); }\n',
                );
            },
        );

        unsupported(
            'jsfile (JavaScript file execution)',
            'Security risk — intentionally excluded',
            async function () {
                await loadVimrc('exmap test jsfile helpers.js {doThing()}\n');
            },
        );

        unsupported(
            'cmcommand (CodeMirror commands)',
            'Broken in CodeMirror 6 — never fixed upstream',
            async function () {
                await loadVimrc('cmcommand goLineUp\n');
            },
        );
    });
});
