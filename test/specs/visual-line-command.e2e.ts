import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
    vimHandleKeys,
} from '../helpers';

/**
 * Issue #137: Note Composer "Extract current selection" doesn't work in V-LINE
 *
 * Root cause: In visual-line mode, the codemirror-vim fork sets a cursor-only
 * CM6 selection (to avoid uncollapsing hidden markup). This means
 * editor.somethingSelected() returns false, so commands that check for a
 * selection (like Note Composer's "Extract current selection") silently fail.
 *
 * The existing visual-line-command-fix patches executeCommand, but the command
 * palette calls the command's checkCallback directly (bypassing executeCommand).
 */
describe('Visual-line mode command integration (#137)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('note-composer:split-file checkCallback should return true in visual-line mode', async function () {
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        const result = await browser.executeObsidian(({ app }) => {
            const cmd = (
                app as unknown as {
                    commands: {
                        findCommand: (id: string) => {
                            checkCallback?: (checking: boolean) => boolean;
                        };
                    };
                }
            ).commands.findCommand('note-composer:split-file');

            if (!cmd) return { error: 'Command not found' };
            if (!cmd.checkCallback) return { error: 'No checkCallback' };

            const canExecute = cmd.checkCallback(true);
            return { canExecute };
        });

        expect(result).not.toHaveProperty('error');
        expect(result).toHaveProperty('canExecute', true);
    });

    it('editor.somethingSelected() should return true in visual-line mode', async function () {
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            return {
                somethingSelected: view.editor.somethingSelected(),
                selection: view.editor.getSelection(),
            };
        });

        expect(result).not.toHaveProperty('error');
        expect(result).toHaveProperty('somethingSelected', true);
        expect((result as { selection: string }).selection).toContain(
            'line one',
        );
        expect((result as { selection: string }).selection).toContain(
            'line two',
        );
        expect((result as { selection: string }).selection).toContain(
            'line three',
        );
    });

    it('executeCommandById in visual-line mode should work for selection-dependent commands', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta', {
            line: 0,
            ch: 0,
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: {
                        executeCommandById: (id: string) => boolean;
                    };
                }
            ).commands.executeCommandById('editor:toggle-numbered-list');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const numberedLines = value
            .split('\n')
            .filter((l: string) => /^\d+\.\s/.test(l));

        expect(numberedLines.length).toBe(3);
    });

    it('replaceSelection should work after visual-line mode is exited (#157)', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta\nepsilon', {
            line: 1,
            ch: 0,
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            return new Promise<{
                selection: string;
                valueAfter: string;
            }>((resolve) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) {
                    resolve({ selection: '', valueAfter: '' });
                    return;
                }
                const editor = view.editor;

                const sel = editor.getSelection();

                const editorView = (
                    editor as unknown as {
                        cm: import('@codemirror/view').EditorView;
                    }
                ).cm;
                const cm = (editorView as unknown as { cm?: unknown }).cm;
                const vimApi = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (cm: unknown, key: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (vimApi && cm) {
                    vimApi.handleKey(cm, '<Esc>');
                }

                setTimeout(() => {
                    editor.replaceSelection('[[extracted]]');
                    setTimeout(() => {
                        resolve({
                            selection: sel,
                            valueAfter: editor.getValue(),
                        });
                    }, 100);
                }, 200);
            });
        });

        expect(result.selection).toContain('beta');
        expect(result.selection).toContain('gamma');
        expect(result.valueAfter).toContain('[[extracted]]');
        expect(result.valueAfter).not.toContain('beta');
        expect(result.valueAfter).not.toContain('gamma');
        expect(result.valueAfter).toContain('alpha');
        expect(result.valueAfter).toContain('delta');
    });

    it('real command palette: toggle numbered list in visual-line mode (#157)', async function () {
        await setupEditor('alpha\nbeta\ngamma\ndelta', {
            line: 0,
            ch: 0,
        });

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById('command-palette:open');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const paletteInput = await browser.$('.prompt-input');
        await paletteInput.waitForExist({ timeout: 3000 });
        await paletteInput.setValue('Toggle numbered list');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const value = await getEditorValue();
        const numberedLines = value
            .split('\n')
            .filter((l: string) => /^\d+\.\s/.test(l));

        expect(numberedLines.length).toBe(3);
    });

    it('real command palette: Note Composer extract in visual-line mode (#157)', async function () {
        await setupEditor(
            'first line\nsecond line\nthird line\nfourth line\nfifth line',
            { line: 1, ch: 0 },
        );

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById('command-palette:open');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const paletteInput = await browser.$('.prompt-input');
        await paletteInput.waitForExist({ timeout: 3000 });
        await paletteInput.setValue('Extract current selection');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const ncInput = await browser.$('.prompt-input');
        await ncInput.waitForExist({ timeout: 3000 });
        await ncInput.setValue('extracted-test-157');
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['Enter']);
        await browser.pause(1000);

        const value = await getEditorValue();

        expect(value).toContain('first line');
        expect(value).toContain('fourth line');
        expect(value).not.toContain('second line');
        expect(value).not.toContain('third line');
        expect(value).toContain('[[extracted-test-157]]');

        await browser.executeObsidian(async ({ app }) => {
            const file = app.vault.getAbstractFileByPath(
                'extracted-test-157.md',
            );
            if (file) await app.vault.delete(file);
        });
    });
});
