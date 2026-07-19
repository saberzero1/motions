import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, setPluginSetting } from '../helpers';

describe('Ripgrep integration', function () {
    let hasRg = false;

    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');

        hasRg = (await browser.executeObsidian(() => {
            try {
                const cp = (
                    window as unknown as {
                        require: (m: string) => {
                            execFileSync: (p: string, a: string[]) => unknown;
                        };
                    }
                ).require('child_process');
                cp.execFileSync('/usr/bin/rg', ['--version']);
                return true;
            } catch {
                return false;
            }
        })) as boolean;

        if (!hasRg) {
            this.skip();
            return;
        }

        await setPluginSetting('ripgrepEnabled', true);
        await setPluginSetting('ripgrepBinaryPath', '/usr/bin/rg');
        await setPluginSetting('grepMode', 'ripgrep');
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { reloadFeatures?: () => void }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.reloadFeatures?.();
        });
        await browser.pause(500);
    });

    after(async function () {
        if (hasRg) {
            await setPluginSetting('ripgrepEnabled', false);
            await setPluginSetting('grepMode', 'memory');
        }
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('should open grep picker without error', async function () {
        await setupEditor('test content', { line: 0, ch: 0 });
        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: {
                        executeCommandById: (id: string) => boolean;
                    };
                }
            ).commands.executeCommandById('vim-motions:grep-picker');
        });
        await browser.pause(1000);

        const pickerExists = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-picker');
        })) as boolean;
        expect(pickerExists).toBe(true);

        await sendVimEscape();
        await browser.pause(300);
    });

    it('should handle invalid binary path gracefully', async function () {
        await setPluginSetting('ripgrepBinaryPath', '/nonexistent/rg');
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { reloadFeatures?: () => void }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.reloadFeatures?.();
        });
        await browser.pause(500);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: {
                        executeCommandById: (id: string) => boolean;
                    };
                }
            ).commands.executeCommandById('vim-motions:grep-picker');
        });
        await browser.pause(1000);

        const pickerExists = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-picker');
        })) as boolean;
        expect(pickerExists).toBe(true);

        await sendVimEscape();
        await browser.pause(300);

        await setPluginSetting('ripgrepBinaryPath', '/usr/bin/rg');
    });

    it('should use in-memory grep when ripgrep is disabled', async function () {
        await setPluginSetting('ripgrepEnabled', false);
        await setPluginSetting('grepMode', 'memory');
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { reloadFeatures?: () => void }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.reloadFeatures?.();
        });
        await browser.pause(500);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: {
                        executeCommandById: (id: string) => boolean;
                    };
                }
            ).commands.executeCommandById('vim-motions:grep-picker');
        });
        await browser.pause(1000);

        const pickerExists = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-picker');
        })) as boolean;
        expect(pickerExists).toBe(true);

        await sendVimEscape();
        await browser.pause(300);

        await setPluginSetting('ripgrepEnabled', true);
        await setPluginSetting('grepMode', 'ripgrep');
    });
});
