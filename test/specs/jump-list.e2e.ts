import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
    getVimMode,
    loadSingleFileWorkspace,
    PAUSE,
} from '../helpers';

type VimAdapter = {
    Vim?: {
        handleKey: (cm: unknown, key: string) => boolean;
        getAction?: (
            name: string,
        ) => ((...args: unknown[]) => void) | undefined;
    };
};

async function sendCtrlJump(key: '<C-o>' | '<C-i>'): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, jumpKey: string) => {
        const Vim = (window as unknown as { CodeMirrorAdapter?: VimAdapter })
            .CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (adapter) Vim.handleKey(adapter, jumpKey);
    }, key);
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function sendGotoDefinition(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (window as unknown as { CodeMirrorAdapter?: VimAdapter })
            .CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view || !Vim) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (adapter) {
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'd');
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function runExCommand(command: string): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys([':']);
    for (const ch of command) {
        await browser.keys([ch]);
    }
    await browser.keys(['Enter']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

function getPluginJumpList(): string {
    return `
        const plugin = (app.plugins?.plugins?.['vim-motions']);
        const jl = plugin?.jumpList;
    `;
}

describe('Jump list', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('Within-buffer (fork-handled)', function () {
        it('G should record jump, <C-o> should return to start', async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 0,
                ch: 0,
            });
            await vimKeys('G');
            expect((await getCursorPos()).line).toBe(4);
            await sendCtrlJump('<C-o>');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('gg should record jump, <C-o> should return', async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 3,
                ch: 0,
            });
            await vimKeys('g', 'g');
            expect((await getCursorPos()).line).toBe(0);
            await sendCtrlJump('<C-o>');
            expect((await getCursorPos()).line).toBe(3);
        });

        it('count support: 3G then G then <C-o> chain', async function () {
            await setupEditor('l1\nl2\nl3\nl4\nl5\nl6', {
                line: 0,
                ch: 0,
            });
            await vimKeys('3', 'G');
            expect((await getCursorPos()).line).toBe(2);
            await vimKeys('G');
            expect((await getCursorPos()).line).toBe(5);
            await sendCtrlJump('<C-o>');
            expect((await getCursorPos()).line).toBe(2);
            await sendCtrlJump('<C-o>');
            expect((await getCursorPos()).line).toBe(0);
        });
    });

    describe('Jump list data structure', function () {
        it('plugin should have jump list instance', async function () {
            const result = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<
                                string,
                                { jumpList?: { getEntries: () => unknown[] } }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                return {
                    hasPlugin: !!plugin,
                    hasJumpList: !!plugin?.jumpList,
                };
            })) as { hasPlugin: boolean; hasJumpList: boolean };
            expect(result.hasPlugin).toBe(true);
            expect(result.hasJumpList).toBe(true);
        });

        it('gd should record cross-note entry in plugin jump list', async function () {
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<
                                string,
                                { jumpList?: { clear: () => void } }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                plugin?.jumpList?.clear?.();
            });

            await obsidianPage.write('JLDataA.md', 'Hi\n[[JLDataB]]\nEnd');
            await obsidianPage.write('JLDataB.md', 'Target');
            await obsidianPage.openFile('JLDataA.md');
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await sendGotoDefinition();

            const result = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<
                                string,
                                {
                                    jumpList?: {
                                        getEntries: () => {
                                            filePath: string;
                                            line: number;
                                            ch: number;
                                        }[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                const entries = plugin?.jumpList?.getEntries?.() ?? [];
                return {
                    activeFile: app.workspace.getActiveFile()?.path ?? '',
                    entryCount: entries.length,
                    hasSourceEntry: entries.some(
                        (e) => e.filePath === 'JLDataA.md',
                    ),
                    hasDestEntry: entries.some(
                        (e) => e.filePath === 'JLDataB.md',
                    ),
                };
            })) as {
                activeFile: string;
                entryCount: number;
                hasSourceEntry: boolean;
                hasDestEntry: boolean;
            };
            expect(result.activeFile).toBe('JLDataB.md');
            expect(result.entryCount).toBe(2);
            expect(result.hasSourceEntry).toBe(true);
            expect(result.hasDestEntry).toBe(true);
        });
    });

    describe('Cross-note <C-o>/<C-i>', function () {
        // These tests verify the jumpListWalk action override.
        // The override intercepts <C-o>/<C-i> to navigate cross-note
        // when the plugin jump list has entries pointing to a different file.
        // Currently the override needs runtime debugging — defineActionOverride
        // may not be applying to the correct vim instance in the test environment.

        it('gd then <C-o> should return to source note', async function () {
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<
                                string,
                                { jumpList?: { clear: () => void } }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                plugin?.jumpList?.clear?.();
            });

            await obsidianPage.write(
                'JumpA.md',
                'Line 1\nLine 2\n[[JumpB]]\nLine 4',
            );
            await obsidianPage.write('JumpB.md', 'Target note');
            await obsidianPage.openFile('JumpA.md');
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setCursor(2, 2);
                view.editor.focus();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await sendGotoDefinition();
            const afterGd = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            expect(afterGd).toBe('JumpB.md');

            await sendCtrlJump('<C-o>');
            const afterBack = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            expect(afterBack).toBe('JumpA.md');
        });

        it('after cross-note <C-o>, <C-i> should go forward', async function () {
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<
                                string,
                                { jumpList?: { clear: () => void } }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                plugin?.jumpList?.clear?.();
            });

            await obsidianPage.write('JumpFwdA.md', 'Start\n[[JumpFwdB]]\nEnd');
            await obsidianPage.write('JumpFwdB.md', 'Dest');
            await obsidianPage.openFile('JumpFwdA.md');
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await sendGotoDefinition();
            await sendCtrlJump('<C-o>');
            const backPath = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            expect(backPath).toBe('JumpFwdA.md');

            await sendCtrlJump('<C-i>');
            const fwdPath = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            expect(fwdPath).toBe('JumpFwdB.md');
        });
    });

    describe(':jumps ex command', function () {
        it(':jumps should open a modal', async function () {
            await setupEditor('line1\nline2\nline3', { line: 0, ch: 0 });
            await runExCommand('jumps');
            const modalOpen = (await browser.executeObsidian(() => {
                return !!document.querySelector('.modal-container');
            })) as boolean;
            expect(modalOpen).toBe(true);
            expect(await getVimMode()).toBe('normal');
            await browser.executeObsidian(() => {
                document
                    .querySelectorAll('.modal-container')
                    .forEach((el) => el.remove());
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });
    });

    describe('Jump list settings', function () {
        it('default jumplist=true should use vim jump list', async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await loadSingleFileWorkspace('Welcome.md');
            await setupEditor('line1\nline2\nline3\nline4', {
                line: 1,
                ch: 0,
            });
            await runExCommand('set jumplist');
            await vimKeys('G');
            await sendCtrlJump('<C-o>');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('File lifecycle', function () {
        it('jump list should handle deleted files gracefully', async function () {
            await obsidianPage.write('JumpDelA.md', 'Alpha');
            await obsidianPage.write('JumpDelB.md', 'Beta');
            await obsidianPage.openFile('JumpDelA.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await obsidianPage.openFile('JumpDelB.md');
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            await browser.executeObsidian(async ({ app }) => {
                const file = app.vault.getAbstractFileByPath('JumpDelA.md');
                if (file && 'path' in file) {
                    await app.vault.delete(file);
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const before = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            await sendCtrlJump('<C-o>');
            const after = (await browser.executeObsidian(
                ({ app }) => app.workspace.getActiveFile()?.path ?? '',
            )) as string;
            expect(after).toBe(before);
        });
    });
});
