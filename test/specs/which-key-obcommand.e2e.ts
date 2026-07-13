import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    focusEditor,
    sendVimEscape,
    waitForWhichKey,
    getWhichKeyDescriptions,
    PAUSE,
} from '../helpers';

async function getObsidianCommandName(commandId: string): Promise<string> {
    return (await browser.executeObsidian(({ app }, id: string) => {
        const commands = (
            app as unknown as {
                commands: {
                    commands: Record<string, { id: string; name: string }>;
                };
            }
        ).commands.commands;
        return commands[id]?.name ?? '';
    }, commandId)) as string;
}

async function applyGlobalMapOverride(
    key: string,
    commandId: string,
): Promise<void> {
    await browser.executeObsidian(
        ({ app }, k: string, cmd: string) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                globalRegistry?: {
                                    addMapping: (
                                        keys: string,
                                        action: {
                                            type: string;
                                            commandId: string;
                                        },
                                        opts: { source: string; gate: string },
                                    ) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.globalRegistry?.addMapping(
                k,
                { type: 'obcommand', commandId: cmd },
                { source: 'user', gate: 'standard' },
            );
        },
        key,
        commandId,
    );
}

async function removeGlobalMap(key: string): Promise<void> {
    await browser.executeObsidian(({ app }, k: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            globalRegistry?: {
                                removeMapping: (keys: string) => boolean;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin?.globalRegistry?.removeMapping(k);
    }, key);
}

async function enableGlobalWhichKey(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: { whichKeyMode: string };
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (plugin) {
            plugin.settings.whichKeyMode = 'all';
            plugin.reloadFeatures();
        }
    });
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function disableGlobalWhichKey(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: { whichKeyMode: string };
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (plugin) {
            plugin.settings.whichKeyMode = 'off';
            plugin.reloadFeatures();
        }
    });
}

describe('Which-key obcommand auto-resolution', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
    });

    describe('Editor which-key (vim.keymap.set)', function () {
        it('shows resolved Obsidian command name when no desc provided', async function () {
            const expectedName = await getObsidianCommandName('app:go-back');

            await loadLuaConfig(
                [
                    'vim.g.mapleader = ","',
                    'vim.opt.whichkey = "leader"',
                    'vim.keymap.set("n", "<leader>r", ":ob app:go-back<CR>")',
                ].join('\n'),
            );
            await focusEditor();
            await browser.keys([',']);
            await waitForWhichKey();
            const descriptions = await getWhichKeyDescriptions();

            expect(expectedName.length).toBeGreaterThan(0);
            expect(descriptions).toContain(expectedName);
            await sendVimEscape();
        });

        it('shows resolved name for :obcommand (long form)', async function () {
            const expectedName = await getObsidianCommandName('app:go-back');

            await loadLuaConfig(
                [
                    'vim.g.mapleader = ","',
                    'vim.opt.whichkey = "leader"',
                    'vim.keymap.set("n", "<leader>b", ":obcommand app:go-back<CR>")',
                ].join('\n'),
            );
            await focusEditor();
            await browser.keys([',']);
            await waitForWhichKey();
            const descriptions = await getWhichKeyDescriptions();

            expect(descriptions).toContain(expectedName);
            await sendVimEscape();
        });

        it('explicit desc takes priority over auto-resolved name', async function () {
            await loadLuaConfig(
                [
                    'vim.g.mapleader = ","',
                    'vim.opt.whichkey = "leader"',
                    'vim.keymap.set("n", "<leader>p", ":ob app:go-back<CR>", { desc = "Go back" })',
                ].join('\n'),
            );
            await focusEditor();
            await browser.keys([',']);
            await waitForWhichKey();
            const descriptions = await getWhichKeyDescriptions();

            expect(descriptions).toContain('Go back');
            await sendVimEscape();
        });

        it('falls back to raw RHS for unknown command', async function () {
            await loadLuaConfig(
                [
                    'vim.g.mapleader = ","',
                    'vim.opt.whichkey = "leader"',
                    'vim.keymap.set("n", "<leader>u", ":ob nonexistent-plugin:fake-cmd<CR>")',
                ].join('\n'),
            );
            await focusEditor();
            await browser.keys([',']);
            await waitForWhichKey();
            const descriptions = await getWhichKeyDescriptions();

            const fallback = descriptions.find((d) =>
                d.includes('nonexistent-plugin:fake-cmd'),
            );
            expect(fallback).toBeDefined();
            await sendVimEscape();
        });
    });

    describe('Global which-key (gmap registry)', function () {
        before(async function () {
            await loadLuaConfig('');
            await enableGlobalWhichKey();
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'tabs-root',
                    type: 'split',
                    children: [
                        {
                            id: 'tab-group',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'tab-1',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                                {
                                    id: 'tab-2',
                                    type: 'leaf',
                                    state: { type: 'graph', state: {} },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'tab-2',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        afterEach(async function () {
            await removeGlobalMap('Qr');
            await removeGlobalMap('Qs');
            await removeGlobalMap('Qu');
            await removeGlobalMap('Qv');
        });

        after(async function () {
            await disableGlobalWhichKey();
        });

        it('shows resolved Obsidian command name for global obcommand mapping', async function () {
            const expectedName = await getObsidianCommandName('app:go-back');

            await applyGlobalMapOverride('Qr', 'app:go-back');
            await applyGlobalMapOverride('Qs', 'app:go-forward');
            await browser.keys(['Q']);
            await browser.pause(800);
            const descriptions = await getWhichKeyDescriptions();

            expect(expectedName.length).toBeGreaterThan(0);
            expect(descriptions).toContain(expectedName);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('falls back for unknown command in global mapping', async function () {
            await applyGlobalMapOverride('Qu', 'nonexistent:command');
            await applyGlobalMapOverride('Qv', 'app:go-back');
            await browser.keys(['Q']);
            await browser.pause(800);
            const descriptions = await getWhichKeyDescriptions();

            const fallback = descriptions.find((d) =>
                d.includes('nonexistent:command'),
            );
            expect(fallback).toBeDefined();

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });
    });
});
