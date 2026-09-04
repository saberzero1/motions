import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getCursorPos, loadLuaConfig } from '../helpers';

type PluginRef = {
    vimrcLoaded?: boolean;
    vimrcCommandCount?: number;
    luaLoaded?: boolean;
    luaCommandCount?: number;
    settings: Record<string, unknown>;
    loadLuaConfigForTest?: () => Promise<void>;
};

async function executeCommand(commandId: string): Promise<void> {
    await browser.executeObsidian(({ app }, id: string) => {
        (
            app as unknown as {
                commands: { executeCommandById(id: string): void };
            }
        ).commands.executeCommandById(`vim-motions:${id}`);
    }, commandId);
}

async function getVimrcCommandCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.vimrcCommandCount ?? -1;
    })) as number;
}

async function getLuaCommandCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.luaCommandCount ?? -1;
    })) as number;
}

async function checkMappingExists(
    lhs: string,
    context = 'normal',
): Promise<boolean> {
    return (await browser.executeObsidian(
        (_ctx, key: string, ctx: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getKeymap: (
                                context?: string,
                            ) => Array<{ keys: string }>;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;
            const keymap = Vim.getKeymap(ctx);
            return keymap.some((entry) => entry.keys === key);
        },
        lhs,
        context,
    )) as boolean;
}

async function commandExists(commandId: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, id: string) => {
        const cmds = (
            app as unknown as {
                commands: { commands: Record<string, unknown> };
            }
        ).commands.commands;
        return `vim-motions:${id}` in cmds;
    }, commandId)) as boolean;
}

describe('Config management commands (#168)', function () {
    describe('reload-configuration command', function () {
        before(async function () {
            this.timeout(30000);
            await obsidianPage.write('.obsidian.vimrc', 'nmap L $\n');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.waitUntil(
                async () =>
                    (await browser.executeObsidian(({ app }) => {
                        const plugin = (
                            app as unknown as {
                                plugins: {
                                    plugins: Record<string, PluginRef>;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        return plugin?.vimrcLoaded === true;
                    })) as boolean,
                { timeout: 10000, interval: 200 },
            );
            await browser.pause(2000);
        });

        after(async function () {
            await obsidianPage.resetVault();
        });

        it('should pick up new vimrc content via reload command', async function () {
            await obsidianPage.write('.obsidian.vimrc', 'nmap L $\nnmap H ^\n');
            await browser.pause(500);

            await executeCommand('reload-configuration');
            await browser.waitUntil(
                async () => (await getVimrcCommandCount()) === 2,
                { timeout: 5000, interval: 200 },
            );

            const hasH = await checkMappingExists('H');
            expect(hasH).toBe(true);
            const hasL = await checkMappingExists('L');
            expect(hasL).toBe(true);
        });

        it('should apply reloaded mapping functionally', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await browser.pause(300);

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (cm: unknown, key: string) => void;
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
                Vim.handleKey(adapter, 'L');
            });
            await browser.pause(200);

            const pos = await getCursorPos();
            expect(pos.ch).toBe(10);
        });
    });

    describe('Lua config reload via reload-configuration', function () {
        before(async function () {
            this.timeout(30000);
            await loadLuaConfig('vim.opt.scrolloff = 5\n');
        });

        after(async function () {
            await obsidianPage.resetVault();
        });

        it('should pick up new Lua config via reload command', async function () {
            const countBefore = await getLuaCommandCount();
            expect(countBefore).toBeGreaterThanOrEqual(1);

            await browser.executeObsidian(async ({ app }) => {
                const configDir = app.vault.configDir;
                await app.vault.adapter.write(
                    `${configDir}.init.lua`,
                    'vim.opt.scrolloff = 5\nvim.opt.hlsearch = true\n',
                );
            });
            await browser.pause(500);

            await executeCommand('reload-configuration');
            await browser.waitUntil(
                async () => (await getLuaCommandCount()) >= 2,
                {
                    timeout: 10000,
                    interval: 500,
                    timeoutMsg:
                        'Lua config did not reload with new command count',
                },
            );

            const countAfter = await getLuaCommandCount();
            expect(countAfter).toBeGreaterThanOrEqual(2);
        });
    });

    describe('open-configuration command', function () {
        before(async function () {
            this.timeout(30000);
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(2000);
        });

        it('should be registered as a command', async function () {
            const exists = await commandExists('open-configuration');
            expect(exists).toBe(true);
        });

        it('should be registered as reload-configuration command', async function () {
            const exists = await commandExists('reload-configuration');
            expect(exists).toBe(true);
        });

        it('should not throw when executed with a config file present', async function () {
            await obsidianPage.write('.obsidian.vimrc', 'nmap L $\n');
            await browser.pause(300);

            const error = (await browser.executeObsidian(({ app }) => {
                try {
                    (
                        app as unknown as {
                            commands: {
                                executeCommandById(id: string): void;
                            };
                        }
                    ).commands.executeCommandById(
                        'vim-motions:open-configuration',
                    );
                    return null;
                } catch (e) {
                    return String(e);
                }
            })) as string | null;
            expect(error).toBeNull();
        });
    });
});
