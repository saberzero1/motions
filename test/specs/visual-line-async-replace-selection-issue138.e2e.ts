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
 * Issue #138 — Note Refactor "Extract selection" did not remove content in V-LINE.
 *
 * The fork gave the editor a cursor-only selection in visual-line mode, and a
 * wrapper expanded it only for the duration of a command's synchronous
 * callback. Note Refactor's callback is async: by the time it called
 * `editor.replaceSelection()` the selection had collapsed again, so nothing
 * was replaced. The editor now holds the real linewise selection (#231), so
 * an async caller finds it where it left it.
 *
 * @see https://github.com/saberzero1/motions/issues/138
 * @see https://github.com/lynchjames/note-refactor-obsidian (Note Refactor)
 */
describe('Visual-line async replaceSelection (#138)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.executeObsidian(({ app }) => {
            try {
                app.commands.removeCommand('issue138:async-replace');
            } catch {
                // The command is only registered by the first test.
            }
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Bug reproduction: async replaceSelection in V-LINE', function () {
        it('async command replaceSelection replaces the visual-line text', async function () {
            await setupEditor('line one\nline two\nline three\nline four', {
                line: 1,
                ch: 0,
            });

            // Enter visual-line mode and select lines 2-3: V, j
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const mode = await getVimMode();
            expect(mode).toBe('visual');

            // Simulate Note Refactor's async pattern:
            // 1. Read selection (getSelection — patched, works)
            // 2. Await some async work (file creation)
            // 3. Call replaceSelection() with a link
            //
            // This is executed inside a custom command to go through the
            // executeCommand wrapper path
            await browser.executeObsidian(({ app, obsidian }) => {
                const commands = app as unknown as {
                    commands: {
                        commands: Record<
                            string,
                            {
                                id: string;
                                name: string;
                                callback?: () => unknown;
                            }
                        >;
                        addCommand: (cmd: {
                            id: string;
                            name: string;
                            callback: () => unknown;
                        }) => unknown;
                        executeCommandById: (id: string) => boolean;
                        removeCommand: (id: string) => void;
                    };
                };

                // Register a fake "Note Refactor" command with async callback
                commands.commands.addCommand({
                    id: 'issue138:async-replace',
                    name: 'Issue 138: Async replace',
                    callback: async () => {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return;

                        // Step 1: Read selection (works due to patch)
                        const sel = view.editor.getSelection();
                        console.log(
                            '[spike138] Selection read:',
                            JSON.stringify(sel),
                        );

                        // Step 2: Simulate async work (file creation delay)
                        await new Promise((resolve) =>
                            setTimeout(resolve, 100),
                        );

                        // Step 3: Replace selection with link (the buggy part)
                        console.log('[spike138] Calling replaceSelection...');
                        view.editor.replaceSelection('[[extracted-note]]');
                        console.log('[spike138] replaceSelection done');
                    },
                });
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Now execute the fake command
            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('issue138:async-replace');
            });

            // Wait for the async operation to complete
            await browser.pause(500);

            const value = await getEditorValue();
            console.log('After async replaceSelection:', JSON.stringify(value));

            // EXPECTED (correct behavior): lines 2-3 should be replaced
            // with "[[extracted-note]]"
            // Result should be: "line one\n[[extracted-note]]\nline four"
            expect(value).toContain('[[extracted-note]]');
            expect(value).not.toContain('line two');
            expect(value).not.toContain('line three');
        });

        it('direct async replaceSelection replaces the visual-line text', async function () {
            await setupEditor('alpha\nbeta\ngamma\ndelta\nepsilon', {
                line: 1,
                ch: 0,
            });

            // Enter visual-line mode and select lines 2-4: V, j, j
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

            // Directly call async pattern without going through executeCommand
            // This simulates a plugin that fires async from a hotkey callback
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;

                // Do not await: reproduce Note Refactor's editModeGuard returning
                // before async replacement; awaiting would change the scenario.
                void (async () => {
                    const sel = view.editor.getSelection();
                    console.log(
                        '[spike138-direct] Selection:',
                        JSON.stringify(sel),
                    );

                    // Simulate async work
                    await new Promise((resolve) => setTimeout(resolve, 100));

                    // Try to replace
                    view.editor.replaceSelection('[[link]]');
                    console.log('[spike138-direct] replaceSelection called');
                })();
            });

            // Wait for async completion
            await browser.pause(500);

            const value = await getEditorValue();
            console.log(
                'After direct async replaceSelection:',
                JSON.stringify(value),
            );

            // EXPECTED: lines 2-4 replaced with [[link]]
            // "alpha\n[[link]]\nepsilon"
            expect(value).toContain('[[link]]');
            expect(value).not.toContain('beta');
            expect(value).not.toContain('gamma');
            expect(value).not.toContain('delta');
        });
    });

    describe('Exploring replaceSelection in V-LINE without async', function () {
        it('direct synchronous replaceSelection replaces the visual-line text', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 1, ch: 0 });

            // Enter visual-line mode and select line 2: V
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const mode = await getVimMode();
            expect(mode).toBe('visual');

            // Call replaceSelection directly (sync, no executeCommand wrapper)
            const diag = await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };

                const hasOwn = Object.prototype.hasOwnProperty.call(
                    view.editor,
                    'replaceSelection',
                );
                const hasOwnGetSel = Object.prototype.hasOwnProperty.call(
                    view.editor,
                    'getSelection',
                );
                const somethingSel = view.editor.somethingSelected();
                const getSel = view.editor.getSelection();

                console.log(
                    '[spike138-sync-direct] hasOwn replaceSelection:',
                    hasOwn,
                );
                console.log(
                    '[spike138-sync-direct] hasOwn getSelection:',
                    hasOwnGetSel,
                );
                console.log(
                    '[spike138-sync-direct] somethingSelected:',
                    somethingSel,
                );
                console.log(
                    '[spike138-sync-direct] getSelection:',
                    JSON.stringify(getSel),
                );

                view.editor.replaceSelection('REPLACED');

                return {
                    hasOwnReplaceSelection: hasOwn,
                    hasOwnGetSelection: hasOwnGetSel,
                    somethingSelected: somethingSel,
                    getSelection: getSel,
                };
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            console.log('Diagnostics:', JSON.stringify(diag));
            const value = await getEditorValue();
            console.log(
                'After sync direct replaceSelection:',
                JSON.stringify(value),
            );

            // Does synchronous direct replaceSelection work in V-LINE?
            // If not, replaceSelection itself needs patching regardless of async
            expect(value).toContain('REPLACED');
            expect(value).not.toContain('bbb');
        });
    });
});
