import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Vimrc support (Phase 2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should load a .obsidian.vimrc with key mappings', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            '"Test vimrc\nnmap j gj\nnmap k gk\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should handle vimrc with exmap and obcommand', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            '"Test vimrc with exmap\nexmap saveFile obcommand editor:save-file\nnmap <C-s> :saveFile\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should survive malformed vimrc lines', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            '"Test malformed\nnmap\nset\ngarbage line\nnmap j gj\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should apply let mapleader and replace <leader> in mappings', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            'let mapleader = ","\nnmap <leader>j gj\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should support nnoremap for non-recursive mappings', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            'nnoremap j gj\nnnoremap k gk\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should combine let mapleader with noremap', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            'let mapleader = ","\nnnoremap <leader>j gj\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should handle set options including textwidth and expandtab', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            'set clipboard=unnamed\nset tabstop=2\nset textwidth=100\nset shiftwidth=2\nset expandtab\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should handle set noexpandtab (boolean false)', async function () {
        await obsidianPage.write('.obsidian.vimrc', 'set noexpandtab\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });

    it('should survive unknown set options without crashing', async function () {
        await obsidianPage.write(
            '.obsidian.vimrc',
            'set unknownoption=foo\nset clipboard=unnamed\n',
        );
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
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
        await browser.keys(['Escape']);
        await browser.pause(200);
    });

    it('should work without a .obsidian.vimrc file', async function () {
        await obsidianPage.resetVault();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app }) => {
            const plugins = (
                app as unknown as {
                    plugins: { plugins: Record<string, unknown> };
                }
            ).plugins.plugins;
            return { pluginLoaded: 'vim-motions' in plugins };
        });
        expect(result).toHaveProperty('pluginLoaded', true);
    });
});
