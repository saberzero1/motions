import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    vimRawKeys,
    getEditorValue,
    loadLuaConfig,
    sendVimEscape,
    setPluginSetting,
    PAUSE,
} from '../helpers';

async function removeVaultFile(path: string): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, p: string) =>
            app.vault.adapter
                .exists(p)
                .then((exists: boolean) =>
                    exists ? app.vault.adapter.remove(p) : undefined,
                ),
        path,
    );
}

async function vaultFileExists(path: string): Promise<boolean> {
    return browser.executeObsidian(
        async ({ app }, p: string) => app.vault.adapter.exists(p),
        path,
    );
}

async function loadMiniComment(luaConfig: string): Promise<void> {
    const pluginAdd = `vim.plugins.add({ "echasnovski/mini.comment" })`;
    await loadLuaConfig(`${pluginAdd}\n${luaConfig}`);
    await browser.pause(200);
}

describe('mini.comment plugin integration', function () {
    after(async function () {
        await setPluginSetting('pluginAutoFetch', false);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('plugin fetch', function () {
        it('vim.plugins.add fetches mini.comment from GitHub', async function () {
            await removeVaultFile('lua/mini/comment.lua');
            await removeVaultFile('lua/.plugin-lock.json');
            const beforeExists = await vaultFileExists('lua/mini/comment.lua');
            expect(beforeExists).toBe(false);
            await loadMiniComment(`require('mini.comment').setup({})`);
            const afterExists = await vaultFileExists('lua/mini/comment.lua');
            expect(afterExists).toBe(true);
        });
    });

    describe('setup() loads without errors', function () {
        it('pcall(require, "mini.comment").setup succeeds', async function () {
            await loadMiniComment(
                [
                    `local ok, mod = pcall(require, 'mini.comment')`,
                    `if ok then`,
                    `    local setup_ok = pcall(mod.setup, mod, {})`,
                    `    vim.opt.scrolloff = setup_ok and 1 or 2`,
                    `else`,
                    `    vim.opt.scrolloff = 3`,
                    `end`,
                ].join('\n'),
            );
            const scrolloff = await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings?: { scrolloffLines?: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.settings?.scrolloffLines;
            });
            expect(scrolloff).toBe(1);
        });
    });

    describe('default commentstring (%% %s %%)', function () {
        it('gc mapping is registered after setup', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);

            const result = await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                getKeymap: (ctx?: string) => Array<{
                                    keys: string;
                                    type?: string;
                                    action?: string;
                                }>;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return false;
                const maps = Vim.getKeymap('normal');
                return maps.some(
                    (m: { keys: string; action?: string }) =>
                        m.keys === 'gc' &&
                        m.action?.startsWith('lua-action-eager'),
                );
            });
            expect(result).toBe(true);
        });

        it('g@ operator with manual operatorfunc works', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);
            await setupEditor('Hello world', { line: 0, ch: 0 });

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleKey: (
                                        a: unknown,
                                        k: string,
                                    ) => boolean;
                                    setOperatorfunc?: (
                                        fn:
                                            | ((a: unknown, t: string) => void)
                                            | null,
                                    ) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim)
                        return { opfuncCalled: false, opfuncType: 'no-vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view)
                        return { opfuncCalled: false, opfuncType: 'no-view' };
                    const cm = (
                        (view.editor as unknown as Record<string, unknown>)
                            .cm as Record<string, unknown>
                    )?.cm;
                    if (!cm)
                        return { opfuncCalled: false, opfuncType: 'no-cm' };

                    let called = false;
                    let receivedType = '';
                    Vim.setOperatorfunc?.((_, type) => {
                        called = true;
                        receivedType = type as string;
                        view.editor.setValue('%% Hello world %%');
                    });
                    Vim.handleKey(cm, 'g');
                    Vim.handleKey(cm, '@');
                    Vim.handleKey(cm, '_');
                    return { opfuncCalled: called, opfuncType: receivedType };
                },
            );
            expect(result.opfuncCalled).toBe(true);
        });

        it('vim.cmd lua executes inline Lua code', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({})`,
                    `vim.cmd('lua vim.opt.scrolloff = 88')`,
                ].join('\n'),
            );
            const scrolloff = await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings?: { scrolloffLines?: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.settings?.scrolloffLines;
            });
            expect(scrolloff).toBe(88);
        });

        it('feedKeys g@_ from action callback triggers operatorfunc', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    mappings = {`,
                    `        comment = '',`,
                    `        comment_visual = '',`,
                    `        textobject = '',`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (a: unknown, k: string) => boolean;
                                setOperatorfunc?: (
                                    fn:
                                        | ((a: unknown, t: string) => void)
                                        | null,
                                ) => void;
                                feedKeys?: (
                                    a: unknown,
                                    k: string,
                                    o?: { noremap?: boolean },
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
                const cm = (
                    (view.editor as unknown as Record<string, unknown>)
                        .cm as Record<string, unknown>
                )?.cm;
                if (!cm) return;

                Vim.setOperatorfunc?.((opCm, type) => {
                    const editor = view.editor;
                    const line = editor.getLine(0);
                    editor.replaceRange(
                        `%% ${line} %%`,
                        { line: 0, ch: 0 },
                        { line: 0, ch: line.length },
                    );
                });
                (Vim as Record<string, unknown>).defineAction?.(
                    '__test_action',
                    () => {
                        Vim.feedKeys?.(cm, 'g@_', { noremap: true });
                    },
                );
                (Vim as Record<string, unknown>).mapCommand?.(
                    'Q',
                    'action',
                    '__test_action',
                );
                Vim.handleKey(cm, 'Q');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('%% Hello world %%');
        });

        it('MiniComment.operator via operatorfunc reports errors', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    mappings = {`,
                    `        comment = '',`,
                    `        comment_line = '',`,
                    `        comment_visual = '',`,
                    `        textobject = '',`,
                    `    },`,
                    `})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `    vim.o.operatorfunc = 'v:lua._wrap_opfunc'`,
                    `    return 'g@_'`,
                    `end, { expr = true })`,
                    `function _G._wrap_opfunc(mode)`,
                    `    local ok, err = pcall(MiniComment.operator, mode)`,
                    `    if not ok then`,
                    `        vim.notify('OPFUNC-ERROR: ' .. tostring(err))`,
                    `    end`,
                    `end`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            expect(value.trim()).toBe('%% Hello world %%');
        });

        it('nvim_buf_set_lines via operatorfunc callback', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    mappings = {`,
                    `        comment = '',`,
                    `        comment_line = '',`,
                    `        comment_visual = '',`,
                    `        textobject = '',`,
                    `    },`,
                    `})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `    vim.o.operatorfunc = 'v:lua._test_opfunc'`,
                    `    return 'g@_'`,
                    `end, { expr = true })`,
                    `function _G._test_opfunc(mode)`,
                    `    vim.api.nvim_buf_set_lines(0, 0, 1, false, {'OPFUNC'})`,
                    `end`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('OPFUNC');
        });

        it('MiniComment.toggle_lines works from keymap', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `    local ok, err = pcall(MiniComment.toggle_lines, 1, 1)`,
                    `    if not ok then`,
                    `        vim.opt.scrolloff = 11`,
                    `        vim.notify('toggle_lines error: ' .. tostring(err))`,
                    `    else`,
                    `        vim.opt.scrolloff = 22`,
                    `    end`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const scrolloff = await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings?: { scrolloffLines?: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.settings?.scrolloffLines;
            });
            const value = await getEditorValue();
            expect(scrolloff).toBe(22);
            expect(value.trim()).toBe('%% Hello world %%');
        });

        it('fn keymap callback modifies buffer via nvim_buf_set_lines', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `    vim.api.nvim_buf_set_lines(0, 0, 1, false, {'REPLACED'})`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('REPLACED');
        });

        it('fn keymap callback modifies buffer via scrolloff side effect', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `    vim.opt.scrolloff = 99`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const scrolloff = await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings?: { scrolloffLines?: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.settings?.scrolloffLines;
            });
            expect(scrolloff).toBe(99);
        });

        it('gcc toggles comment on a single line', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    mappings = {`,
                    `        comment = '',`,
                    `        comment_line = 'gcc',`,
                    `        comment_visual = '',`,
                    `        textobject = '',`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('%% Hello world %%');
        });

        it('gcc uncomments a commented line', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);
            await setupEditor('%% Hello world %%', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('Hello world');
        });

        it('gcj comments two lines (current + next)', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);
            await setupEditor('first line\nsecond line', { line: 0, ch: 0 });
            await vimRawKeys('gcj');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[0].trim()).toBe('%% first line %%');
            expect(lines[1].trim()).toBe('%% second line %%');
        });

        it.skip('gcc on empty line adds comment markers', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);
            await setupEditor('', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('%% %%');
        });

        it.skip('gc in visual mode comments selected lines', async function () {
            await loadMiniComment(`require('mini.comment').setup({})`);
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimRawKeys('Vjgc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[0].trim()).toBe('%% line one %%');
            expect(lines[1].trim()).toBe('%% line two %%');
            expect(lines[2].trim()).toBe('line three');
        });
    });

    describe('custom commentstring (HTML)', function () {
        it('gcc toggles HTML comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '<!-- %s -->'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('<!-- Hello world -->');
        });

        it('gcc uncomments HTML comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '<!-- %s -->'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('<!-- Hello world -->', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('Hello world');
        });
    });

    describe('custom commentstring (C-style)', function () {
        it('gcc toggles C-style comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '// %s'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('// Hello world');
        });

        it('gcc uncomments C-style comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '// %s'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('// Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('Hello world');
        });

        it('gcj comments two lines with C-style', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '// %s'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('first\nsecond', { line: 0, ch: 0 });
            await vimRawKeys('gcj');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[0].trim()).toBe('// first');
            expect(lines[1].trim()).toBe('// second');
        });
    });

    describe('custom commentstring (hash)', function () {
        it('gcc toggles hash comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '# %s'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('# Hello world');
        });

        it('gcc uncomments hash comment', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({`,
                    `    options = {`,
                    `        custom_commentstring = function()`,
                    `            return '# %s'`,
                    `        end,`,
                    `    },`,
                    `})`,
                ].join('\n'),
            );
            await setupEditor('# Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('Hello world');
        });
    });

    describe('disabled via vim.b', function () {
        it('gcc does nothing when minicomment_disable is set', async function () {
            await loadMiniComment(
                [
                    `require('mini.comment').setup({})`,
                    `vim.b.minicomment_disable = true`,
                ].join('\n'),
            );
            await setupEditor('Hello world', { line: 0, ch: 0 });
            await vimRawKeys('gcc');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value.trim()).toBe('Hello world');
        });
    });
});
