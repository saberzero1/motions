import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor } from '../helpers';

describe('Exmap tracking and undefineEx API', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('vimrcExmapNames field should exist on the plugin', async function () {
        await setupEditor('hello', { line: 0, ch: 0 });

        const hasField = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        plugins: Record<string, any>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return (
                plugin != null &&
                'vimrcExmapNames' in plugin &&
                plugin.vimrcExmapNames instanceof Set
            );
        })) as boolean;
        expect(hasField).toBe(true);
    });

    it('undefineEx should be available on the Vim API', async function () {
        const hasApi = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            undefineEx?: (name: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            return typeof Vim?.undefineEx === 'function';
        })) as boolean;
        expect(hasApi).toBe(true);
    });

    it('undefineEx should return false for nonexistent command', async function () {
        const result = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            undefineEx: (name: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return null;
            return Vim.undefineEx('nosuchcommand_xyz_test');
        })) as boolean | null;
        expect(result).toBe(false);
    });

    it('defineEx then undefineEx should clean up the command', async function () {
        const result = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineEx: (
                                name: string,
                                prefix: string,
                                fn: (cm: unknown) => void,
                            ) => void;
                            undefineEx: (name: string) => boolean;
                            getRegisterController: () => unknown;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim)
                return {
                    defineWorks: false,
                    undefineWorks: false,
                    builtinSurvives: false,
                };

            Vim.defineEx('_test_ephemeral', '', () => {});
            const removed = Vim.undefineEx('_test_ephemeral');

            let builtinSurvives = false;
            try {
                Vim.getRegisterController();
                builtinSurvives = true;
            } catch {
                builtinSurvives = false;
            }

            return {
                defineWorks: true,
                undefineWorks: removed,
                builtinSurvives,
            };
        })) as {
            defineWorks: boolean;
            undefineWorks: boolean;
            builtinSurvives: boolean;
        };
        expect(result.defineWorks).toBe(true);
        expect(result.undefineWorks).toBe(true);
        expect(result.builtinSurvives).toBe(true);
    });
});
