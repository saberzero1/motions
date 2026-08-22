import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getSelection,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

/**
 * Spike: Issue #138 — Note Refactor "Extract selection" doesn't remove content in V-LINE
 *
 * Root cause hypothesis: The `withExpandedSelection` wrapper in
 * `visual-line-command-fix.ts` expands the CM6 selection synchronously,
 * calls the command callback, then immediately restores cursor-only in the
 * `finally` block. But community plugins like Note Refactor have ASYNC
 * callbacks — by the time they call `editor.replaceSelection()`, the CM6
 * selection has already been restored to cursor-only.
 *
 * Flow (Note Refactor):
 *   1. executeCommand → withExpandedSelection expands CM6 selection
 *   2. callback fires (async): editModeGuard → extractSelectionFirstLine
 *   3. withExpandedSelection's `finally` block restores cursor-only IMMEDIATELY
 *   4. ...awaits: createFile, writeContent, generateLink...
 *   5. doc.replaceSelection(link) — CM6 selection is now cursor-only → NOOP
 *
 * This spike verifies:
 *   1. getSelection() works in V-LINE (already patched) ✓
 *   2. Synchronous replaceSelection() works in V-LINE (via executeCommand) ✓
 *   3. ASYNC replaceSelection() FAILS in V-LINE (the bug) ✗
 *   4. Direct replaceSelection() without executeCommand also fails ✗
 *
 * @see https://github.com/saberzero1/motions/issues/138
 * @see https://github.com/lynchjames/note-refactor-obsidian (Note Refactor)
 */
describe('Spike: Issue #138 — V-LINE async replaceSelection', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Baseline: getSelection in V-LINE mode', function () {
        it('editor.getSelection() should return V-LINE text (patched)', async function () {
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

            const selection = await getSelection();
            console.log('V-LINE getSelection():', JSON.stringify(selection));
            expect(selection).toContain('line one');
            expect(selection).toContain('line two');
            expect(selection).not.toContain('line three');
        });
    });

    describe('Sync replaceSelection via executeCommandById', function () {
        it('synchronous replaceSelection should work in V-LINE via executeCommand', async function () {
            await setupEditor('line one\nline two\nline three\nline four', {
                line: 1,
                ch: 0,
            });

            // Enter visual-line mode on line 2: V (selects "line two")
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const mode = await getVimMode();
            expect(mode).toBe('visual');

            // Simulate a SYNCHRONOUS command that calls replaceSelection
            // This mimics what a synchronous plugin command would do
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };

                    // Manually execute via app.commands to go through the wrapper
                    // We use toggle-numbered-list as a proxy (synchronous command)
                    (
                        app as unknown as {
                            commands: {
                                executeCommandById: (id: string) => boolean;
                            };
                        }
                    ).commands.executeCommandById(
                        'editor:toggle-numbered-list',
                    );
                    return { ok: true };
                },
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            console.log('Sync executeCommand result:', result);
            const value = await getEditorValue();
            console.log('After sync command:', JSON.stringify(value));

            // The numbered list should affect the selected line
            expect(value).toContain('1.');
        });
    });

    describe('Bug reproduction: async replaceSelection in V-LINE', function () {
        it('ASYNC replaceSelection should replace the V-LINE text (currently FAILS)', async function () {
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
                    id: 'spike138:async-replace',
                    name: 'Spike 138: Async Replace',
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
                ).commands.executeCommandById('spike138:async-replace');
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

            // Cleanup: remove fake command
            await browser.executeObsidian(({ app }) => {
                const commands = app as unknown as {
                    commands: {
                        removeCommand: (id: string) => void;
                    };
                };
                try {
                    commands.commands.removeCommand('spike138:async-replace');
                } catch {
                    // ignore if not available
                }
            });
        });

        it('direct async replaceSelection without executeCommand also fails', async function () {
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

                // Fire-and-forget async (like Note Refactor's editModeGuard)
                (async () => {
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
        it('synchronous replaceSelection called directly (no executeCommand)', async function () {
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
