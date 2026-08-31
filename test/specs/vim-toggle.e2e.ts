import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    getVimMode,
    vimKeys,
    sendVimEscape,
    PAUSE,
} from '../helpers';

const TOGGLE_SETTLE = 800;

async function executeToggleCommand(
    commandId: 'toggle-vim-mode' | 'enable-vim-mode' | 'disable-vim-mode',
): Promise<void> {
    await browser.executeObsidian(({ app }, id: string) => {
        (
            app as unknown as {
                commands: { executeCommandById(id: string): void };
            }
        ).commands.executeCommandById(`vim-motions:${id}`);
    }, commandId);
    await browser.pause(TOGGLE_SETTLE);
}

async function isVimActive(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.cm-vimMode');
    })) as boolean;
}

async function hasVimBridge(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!(window as unknown as Record<string, unknown>)
            .CodeMirrorAdapter;
    })) as boolean;
}

async function getVimEnabledSetting(): Promise<boolean> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { settings: Record<string, unknown> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.settings?.vimEnabled as boolean;
    })) as boolean;
}

describe('Vim toggle command', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    describe('full toggle lifecycle', function () {
        it('starts with vim enabled', async function () {
            this.timeout(15000);
            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);

            const bridge = await hasVimBridge();
            expect(bridge).toBe(true);

            const setting = await getVimEnabledSetting();
            expect(setting).toBe(true);
        });

        it('j moves cursor down when vim is enabled', async function () {
            this.timeout(15000);
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('disables vim via toggle command', async function () {
            this.timeout(15000);
            await executeToggleCommand('toggle-vim-mode');

            const vimActive = await isVimActive();
            expect(vimActive).toBe(false);

            const setting = await getVimEnabledSetting();
            expect(setting).toBe(false);
        });

        it('j inserts character when vim is disabled', async function () {
            this.timeout(15000);
            await setupEditor('hello', { line: 0, ch: 5 });
            const el = await browser.$('.cm-editor .cm-content');
            await el.click();
            await browser.keys('j');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value).toContain('j');
        });

        it('no .cm-vimMode class on editors when disabled', async function () {
            const vimActive = await isVimActive();
            expect(vimActive).toBe(false);
        });

        it('re-enables vim via toggle command', async function () {
            this.timeout(15000);
            await executeToggleCommand('toggle-vim-mode');

            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);

            const bridge = await hasVimBridge();
            expect(bridge).toBe(true);

            const setting = await getVimEnabledSetting();
            expect(setting).toBe(true);
        });

        it('j moves cursor down again after re-enable', async function () {
            this.timeout(15000);
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('vim is functional after on-off-on cycle', async function () {
            this.timeout(15000);
            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);

            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('idempotent enable/disable commands', function () {
        it('enable-vim-mode is no-op when already enabled', async function () {
            this.timeout(10000);
            const before = await getVimEnabledSetting();
            expect(before).toBe(true);
            await executeToggleCommand('enable-vim-mode');
            const after = await getVimEnabledSetting();
            expect(after).toBe(true);
            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);
        });

        it('disable-vim-mode disables', async function () {
            this.timeout(10000);
            await executeToggleCommand('disable-vim-mode');
            const setting = await getVimEnabledSetting();
            expect(setting).toBe(false);
            const vimActive = await isVimActive();
            expect(vimActive).toBe(false);
        });

        it('disable-vim-mode is no-op when already disabled', async function () {
            this.timeout(10000);
            await executeToggleCommand('disable-vim-mode');
            const setting = await getVimEnabledSetting();
            expect(setting).toBe(false);
        });

        it('enable-vim-mode re-enables', async function () {
            this.timeout(10000);
            await executeToggleCommand('enable-vim-mode');
            const setting = await getVimEnabledSetting();
            expect(setting).toBe(true);
            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);
        });
    });

    describe('edge cases', function () {
        it('toggle while in insert mode exits cleanly', async function () {
            this.timeout(15000);
            await setupEditor('hello world', { line: 0, ch: 0 });
            const el = await browser.$('.cm-editor .cm-content');
            await el.click();
            await browser.keys('i');
            await browser.pause(PAUSE.MODE_SWITCH);

            const mode = await getVimMode();
            expect(mode).toBe('insert');

            await executeToggleCommand('disable-vim-mode');
            const vimActive = await isVimActive();
            expect(vimActive).toBe(false);

            await executeToggleCommand('enable-vim-mode');
            const modeAfter = await getVimMode();
            expect(modeAfter).toBe('normal');
        });

        it('toggle while in visual mode exits cleanly', async function () {
            this.timeout(15000);
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (cm: unknown, key: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (Vim) Vim.handleKey(adapter, 'v');
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            const mode = await getVimMode();
            expect(mode).toBe('visual');

            await executeToggleCommand('disable-vim-mode');
            const vimActive = await isVimActive();
            expect(vimActive).toBe(false);

            await executeToggleCommand('enable-vim-mode');
        });

        it('rapid toggle is debounced', async function () {
            this.timeout(15000);
            await browser.executeObsidian(({ app }) => {
                const cmds = app as unknown as {
                    commands: { executeCommandById(id: string): void };
                };
                cmds.commands.executeCommandById(
                    'vim-motions:disable-vim-mode',
                );
                cmds.commands.executeCommandById('vim-motions:enable-vim-mode');
            });
            await browser.pause(TOGGLE_SETTLE);
            const setting = await getVimEnabledSetting();
            expect(setting).toBe(false);

            await browser.pause(500);
            await executeToggleCommand('enable-vim-mode');
        });
    });

    describe('persistence across reload', function () {
        it('disabled state is saved to plugin data', async function () {
            this.timeout(15000);
            await executeToggleCommand('disable-vim-mode');

            await browser.waitUntil(
                async () => (await getVimEnabledSetting()) === false,
                { timeout: 3000, interval: 200 },
            );

            const saved = await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    saveData: (data: unknown) => Promise<void>;
                                    loadData: () => Promise<
                                        Record<string, unknown>
                                    >;
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin) return { error: 'no plugin' };
                await plugin.saveData(plugin.settings);
                const data = await plugin.loadData();
                return { vimEnabled: data?.vimEnabled };
            });
            expect((saved as Record<string, unknown>).vimEnabled).toBe(false);
        });

        it('re-enabled state persists after reload', async function () {
            this.timeout(30000);
            await executeToggleCommand('enable-vim-mode');
            await browser.pause(500);
            const beforeReload = await getVimEnabledSetting();
            expect(beforeReload).toBe(true);

            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterReload = await getVimEnabledSetting();
            expect(afterReload).toBe(true);

            const vimActive = await isVimActive();
            expect(vimActive).toBe(true);
        });
    });

    after(async function () {
        this.timeout(15000);
        const enabled = await getVimEnabledSetting();
        if (!enabled) {
            await executeToggleCommand('enable-vim-mode');
        }
    });
});
