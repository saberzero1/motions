import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getVimMode,
    getStatusBarMode,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

describe('Mode indicators', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Visual sub-mode indicators', function () {
        it('V shows V-LINE in status bar', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('V');
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('V-LINE');
            expect(status.dataAttr).toBe('v-line');
        });

        it('<C-v> shows V-BLOCK in status bar', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (window as unknown as Record<string, unknown>)
                    .CodeMirrorAdapter as Record<string, unknown> | undefined;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (
                    (view.editor as unknown as Record<string, unknown>)
                        .cm as Record<string, unknown>
                )?.cm;
                if (Vim?.Vim && cm)
                    (Vim.Vim as Record<string, Function>).handleKey(
                        cm,
                        '<C-v>',
                    );
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('V-BLOCK');
            expect(status.dataAttr).toBe('v-block');
        });

        it('v still shows VISUAL', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('v');
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('VISUAL');
            expect(status.dataAttr).toBe('visual');
        });
    });

    describe('Command and search mode indicators', function () {
        it(': shows COMMAND in status bar', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys(':');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const status = await getStatusBarMode();
            expect(status.text).toContain('COMMAND');
            expect(status.dataAttr).toBe('command');
        });

        it('Esc from : restores previous mode', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys(':');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('NORMAL');
            expect(status.dataAttr).toBe('normal');
        });

        it('/ shows SEARCH in status bar', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('/');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const status = await getStatusBarMode();
            expect(status.text).toContain('SEARCH');
            expect(status.dataAttr).toBe('search');
        });

        it('? shows SEARCH in status bar', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('?');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const status = await getStatusBarMode();
            expect(status.text).toContain('SEARCH');
            expect(status.dataAttr).toBe('search');
        });

        it('Esc from / restores previous mode', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('/');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('NORMAL');
        });
    });

    describe('Select mode indicator', function () {
        it('gh shows SELECT in status bar', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('g', 'h');
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('SELECT');
            expect(status.dataAttr).toBe('select');
        });

        it('gH shows SELECT in status bar', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('g', 'H');
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('SELECT');
        });

        it('Ctrl-G toggles visual/select indicator', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('v');
            await browser.pause(PAUSE.MODE_SWITCH);
            let status = await getStatusBarMode();
            expect(status.text).toContain('VISUAL');
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (window as unknown as Record<string, unknown>)
                    .CodeMirrorAdapter as Record<string, unknown> | undefined;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (
                    (view.editor as unknown as Record<string, unknown>)
                        .cm as Record<string, unknown>
                )?.cm;
                if (Vim?.Vim && cm)
                    (Vim.Vim as Record<string, Function>).handleKey(
                        cm,
                        '<C-g>',
                    );
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            status = await getStatusBarMode();
            expect(status.text).toContain('SELECT');
        });
    });

    describe('Virtual replace mode indicator', function () {
        it('gR shows V-REPLACE in status bar', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('g', 'R');
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('V-REPLACE');
            expect(status.dataAttr).toBe('vreplace');
        });

        it('Esc from gR shows NORMAL', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('g', 'R');
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('NORMAL');
            expect(status.dataAttr).toBe('normal');
        });
    });

    describe('Insert-normal mode indicator', function () {
        it('Ctrl-O in insert shows insert-normal indicator', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('i');
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (window as unknown as Record<string, unknown>)
                    .CodeMirrorAdapter as Record<string, unknown> | undefined;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (
                    (view.editor as unknown as Record<string, unknown>)
                        .cm as Record<string, unknown>
                )?.cm;
                if (Vim?.Vim && cm)
                    (Vim.Vim as Record<string, Function>).handleKey(
                        cm,
                        '<C-o>',
                    );
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.dataAttr).toBe('insert-normal');
        });

        it('motion after Ctrl-O returns to INSERT', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('i');
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (window as unknown as Record<string, unknown>)
                    .CodeMirrorAdapter as Record<string, unknown> | undefined;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (
                    (view.editor as unknown as Record<string, unknown>)
                        .cm as Record<string, unknown>
                )?.cm;
                if (Vim?.Vim && cm) {
                    (Vim.Vim as Record<string, Function>).handleKey(
                        cm,
                        '<C-o>',
                    );
                    (Vim.Vim as Record<string, Function>).handleKey(cm, 'l');
                }
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            const status = await getStatusBarMode();
            expect(status.text).toContain('INSERT');
            expect(status.dataAttr).toBe('insert');
        });
    });

    describe('Edge cases', function () {
        it('rapid : → Esc → / → Esc cycles correctly', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimKeys(':');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            let status = await getStatusBarMode();
            expect(status.dataAttr).toBe('command');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            status = await getStatusBarMode();
            expect(status.dataAttr).toBe('normal');

            await vimKeys('/');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            status = await getStatusBarMode();
            expect(status.dataAttr).toBe('search');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            status = await getStatusBarMode();
            expect(status.dataAttr).toBe('normal');
        });
    });

    describe('Mode indicator sync on tab switch (#140)', function () {
        async function loadTwoMarkdownTabs(): Promise<void> {
            await obsidianPage.write('Note-A.md', 'Content of note A');
            await obsidianPage.write('Note-B.md', 'Content of note B');
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'tabs-root-140',
                    type: 'split',
                    children: [
                        {
                            id: 'tab-group-140',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'tab-a',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Note-A.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                                {
                                    id: 'tab-b',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Note-B.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'tab-a',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        }

        async function switchToLeaf(file: string): Promise<void> {
            await browser.executeObsidian(({ app }, targetFile: string) => {
                const leaf = app.workspace
                    .getLeavesOfType('markdown')
                    .find((l) => l.view.getState()?.file === targetFile);
                if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
            }, file);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }

        it('switching from Insert to Normal tab syncs indicator', async function () {
            await loadTwoMarkdownTabs();

            // Tab A: enter insert mode
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('i');
            await browser.pause(PAUSE.MODE_SWITCH);
            let status = await getStatusBarMode();
            expect(status.dataAttr).toBe('insert');

            // Switch to Tab B (which is in Normal mode)
            await switchToLeaf('Note-B.md');
            await browser.pause(PAUSE.MODE_SWITCH);

            status = await getStatusBarMode();
            expect(status.dataAttr).toBe('normal');
        });

        it('switching from Normal to Insert tab syncs indicator', async function () {
            await loadTwoMarkdownTabs();

            // Tab A starts in normal mode, enter insert mode
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await vimKeys('i');
            await browser.pause(PAUSE.MODE_SWITCH);

            // Switch to Tab B (Normal mode)
            await switchToLeaf('Note-B.md');
            await browser.pause(PAUSE.MODE_SWITCH);

            // Now switch back to Tab A (should still be Insert)
            await switchToLeaf('Note-A.md');
            await browser.pause(PAUSE.MODE_SWITCH);

            const status = await getStatusBarMode();
            expect(status.dataAttr).toBe('insert');
        });
    });
});
