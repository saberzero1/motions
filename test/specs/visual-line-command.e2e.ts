import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
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

        // Enter visual-line mode and select 2 lines: V, j
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const mode = await getVimMode();
        expect(mode).toBe('visual');

        // Call checkCallback(true) on note-composer:split-file — this is the
        // "checking" path that the command palette uses to determine whether
        // the command is available. If it returns false/undefined, the command
        // is greyed out or does nothing.
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

            // checkCallback(true) = "checking" mode, returns true if command
            // can execute, false/undefined if not
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

        // Enter visual-line mode and select 3 lines: V, j, j
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
        // The selection should contain all 3 lines
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

        // Enter visual-line mode and select 3 lines
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['V']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Use toggle-numbered-list as a proxy — it reads the selection and
        // should affect all 3 selected lines
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

        // All 3 selected lines should have been numbered
        expect(numberedLines.length).toBe(3);
    });
});
