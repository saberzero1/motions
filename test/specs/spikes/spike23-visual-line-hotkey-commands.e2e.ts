import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

/**
 * Spike 23: Visual-line mode + Obsidian hotkey command interaction
 *
 * Issue #41 edge-case: selecting multiple list items via V (visual-line mode)
 * and then using an Obsidian hotkey to toggle numbered lists only affects the
 * cursor line instead of all selected lines.
 *
 * Hypothesis: Obsidian's Keymap registers keydown on `window` in the **capture
 * phase** (`addEventListener("keydown", handler, true)`). CM6's ViewPlugin
 * eventHandlers register on `contentDOM` in the **bubble phase**. The fork's
 * selection expansion in `handleKey` runs during bubble phase — AFTER Obsidian's
 * capture-phase handler already executed the command with cursor-only selection.
 *
 * This spike verifies:
 * 1. Whether executeCommandById in visual-line mode operates on all selected
 *    lines or just the cursor line (bypassing the hotkey path entirely).
 * 2. Whether Obsidian's keymap listener is capture-phase (confirming the
 *    event ordering hypothesis).
 * 3. Which Obsidian editor commands are affected: toggle-numbered-list,
 *    toggle-bullet-list, toggle-bold, indent-list, etc.
 * 4. Whether the fork's selection expansion actually fires when a keydown is
 *    intercepted by Obsidian's capture-phase handler.
 */
describe('Spike 23: Visual-line + Obsidian hotkey commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Baseline: executeCommandById in visual-line mode', function () {
        it('toggle-numbered-list via executeCommandById should affect all selected lines', async function () {
            // Setup: 3 plain-text lines, cursor on line 0
            await setupEditor('alpha\nbeta\ngamma\ndelta', {
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
            console.log('Vim mode after V+jj:', mode);
            expect(mode).toBe('visual');

            // Execute toggle-numbered-list via app.commands (NOT via hotkey)
            // This bypasses the Keymap capture-phase entirely.
            const result = await browser.executeObsidian(({ app }) => {
                const commands = (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands;
                return commands.executeCommandById(
                    'editor:toggle-numbered-list',
                );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            console.log('executeCommandById result:', result);
            const value = await getEditorValue();
            console.log('Editor value after toggle-numbered-list:', value);

            // Count how many lines got the numbered list prefix
            const lines = value.split('\n');
            const numberedLines = lines.filter((l: string) =>
                /^\d+\.\s/.test(l),
            );
            console.log(
                'Lines with numbered prefix:',
                numberedLines.length,
                'of',
                lines.length,
            );
            console.log('Numbered lines:', numberedLines);

            // The key question: did all 3 selected lines get numbered, or just 1?
            // If only 1: Obsidian reads cursor-only CM6 selection
            // If all 3: Obsidian reads from somewhere else (Editor abstraction?)
        });

        it('toggle-bullet-list via executeCommandById should affect all selected lines', async function () {
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
                ).commands.executeCommandById('editor:toggle-bullet-list');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            console.log('Editor value after toggle-bullet-list:', value);

            const lines = value.split('\n');
            const bulletLines = lines.filter((l: string) =>
                /^\s*[-*+]\s/.test(l),
            );
            console.log(
                'Lines with bullet prefix:',
                bulletLines.length,
                'of',
                lines.length,
            );
        });

        it('toggle-bold via executeCommandById should affect all selected lines', async function () {
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
                ).commands.executeCommandById('editor:toggle-bold');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            console.log('Editor value after toggle-bold:', value);

            const lines = value.split('\n');
            const boldLines = lines.filter((l: string) => /\*\*.*\*\*/.test(l));
            console.log(
                'Lines with bold markers:',
                boldLines.length,
                'of',
                lines.length,
            );
        });

        it('indent-list via executeCommandById on list items should affect all selected lines', async function () {
            await setupEditor('- alpha\n- beta\n- gamma\n- delta', {
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
                ).commands.executeCommandById('editor:indent-list');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const value = await getEditorValue();
            console.log('Editor value after indent-list:', value);

            const lines = value.split('\n');
            const indentedLines = lines.filter((l: string) => /^\t/.test(l));
            console.log(
                'Lines indented:',
                indentedLines.length,
                'of',
                lines.length,
            );
        });
    });

    describe('Event phase verification', function () {
        it('should verify Obsidian Keymap uses capture-phase keydown on window', async function () {
            const result = await browser.executeObsidian(() => {
                // Check if window has a capture-phase keydown listener from
                // Obsidian's Keymap by inspecting the Keymap singleton.
                const keymap = (
                    window as unknown as {
                        app?: {
                            keymap?: {
                                onKeyEvent?: unknown;
                                scope?: unknown;
                            };
                        };
                    }
                ).app?.keymap;

                if (!keymap) return { error: 'No keymap found' };

                return {
                    hasKeymap: true,
                    hasOnKeyEvent: typeof keymap.onKeyEvent === 'function',
                    hasScope: !!keymap.scope,
                    keymapKeys: Object.keys(keymap).sort(),
                };
            });

            console.log('Keymap inspection:', JSON.stringify(result, null, 2));
            expect(result).toHaveProperty('hasKeymap', true);
        });

        it('should verify CM6 ViewPlugin keydown is bubble-phase on contentDOM', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    // Access the CM6 EditorView
                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | { dom?: HTMLElement; contentDOM?: HTMLElement }
                        | undefined;

                    if (!editorView) return { error: 'No CM6 EditorView' };

                    return {
                        hasDom: !!editorView.dom,
                        hasContentDOM: !!editorView.contentDOM,
                        contentDOMTag: editorView.contentDOM?.tagName,
                        contentDOMRole:
                            editorView.contentDOM?.getAttribute('role'),
                        // We can't directly inspect listeners, but we can
                        // confirm the DOM structure matches our hypothesis.
                    };
                },
            );

            console.log('CM6 DOM structure:', JSON.stringify(result, null, 2));
        });

        it('should test whether capture-phase handler fires before CM6 by injecting a probe', async function () {
            await setupEditor('alpha\nbeta\ngamma', { line: 0, ch: 0 });

            // Enter visual-line mode, select 2 lines
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Install a temporary capture-phase keydown probe on window that
            // checks the CM6 selection state BEFORE the event reaches CM6.
            const probeResult = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: {
                                  selection: {
                                      main: { anchor: number; head: number };
                                      ranges: {
                                          anchor: number;
                                          head: number;
                                      }[];
                                  };
                                  doc: {
                                      lineAt: (pos: number) => {
                                          number: number;
                                          text: string;
                                      };
                                  };
                              };
                          }
                        | undefined;

                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const sel = editorView.state.selection.main;
                    const anchorLine = editorView.state.doc.lineAt(sel.anchor);
                    const headLine = editorView.state.doc.lineAt(sel.head);

                    return {
                        cm6SelectionDuringVisualLine: {
                            anchor: sel.anchor,
                            head: sel.head,
                            isCursorOnly: sel.anchor === sel.head,
                            anchorLine: anchorLine.number,
                            headLine: headLine.number,
                            spansMultipleLines:
                                anchorLine.number !== headLine.number,
                        },
                        editorSelection: {
                            obsidianGetSelection: view.editor.getSelection(),
                            obsidianSelectionLength:
                                view.editor.getSelection().length,
                        },
                    };
                },
            );

            console.log(
                'CM6 selection state during visual-line mode:',
                JSON.stringify(probeResult, null, 2),
            );

            // The key finding: is the CM6 selection cursor-only even though
            // we're in visual-line mode with 2 lines selected?
            // If cursor-only → confirms that Obsidian commands reading CM6
            // selection will only see one line.
        });
    });

    describe('Simulated hotkey path vs direct command path', function () {
        it('should compare toggle-numbered-list results: direct command vs keyboard shortcut', async function () {
            // Test 1: Direct command execution (bypasses Keymap)
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

            const directResult = await getEditorValue();
            const directNumbered = directResult
                .split('\n')
                .filter((l: string) => /^\d+\.\s/.test(l)).length;

            // Test 2: Assign a hotkey and trigger via keyboard
            // First, reset editor
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await setupEditor('alpha\nbeta\ngamma\ndelta', {
                line: 0,
                ch: 0,
            });

            // Assign Ctrl+Shift+8 to toggle-numbered-list
            await browser.executeObsidian(({ app }) => {
                const hotkeyManager = (
                    app as unknown as {
                        hotkeyManager: {
                            setHotkeys: (
                                id: string,
                                hotkeys: { modifiers: string[]; key: string }[],
                            ) => void;
                            save: () => Promise<void>;
                            baked: boolean;
                        };
                    }
                ).hotkeyManager;

                hotkeyManager.setHotkeys('editor:toggle-numbered-list', [
                    { modifiers: ['Ctrl', 'Shift'], key: '8' },
                ]);
                hotkeyManager.baked = false;
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Enter visual-line, select 3 lines
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Press the hotkey: Ctrl+Shift+8
            await browser.keys(['Control', 'Shift', '8']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hotkeyResult = await getEditorValue();
            const hotkeyNumbered = hotkeyResult
                .split('\n')
                .filter((l: string) => /^\d+\.\s/.test(l)).length;

            console.log('=== COMPARISON ===');
            console.log(
                'Direct executeCommandById: numbered',
                directNumbered,
                'lines →',
                directResult,
            );
            console.log(
                'Hotkey Ctrl+Shift+8: numbered',
                hotkeyNumbered,
                'lines →',
                hotkeyResult,
            );

            // Clean up: remove the test hotkey
            await browser.executeObsidian(({ app }) => {
                const hotkeyManager = (
                    app as unknown as {
                        hotkeyManager: {
                            setHotkeys: (
                                id: string,
                                hotkeys: { modifiers: string[]; key: string }[],
                            ) => void;
                            save: () => Promise<void>;
                            baked: boolean;
                        };
                    }
                ).hotkeyManager;
                hotkeyManager.setHotkeys('editor:toggle-numbered-list', []);
                hotkeyManager.baked = false;
            });

            // If directNumbered === 3 and hotkeyNumbered === 1,
            // that confirms the Keymap capture-phase hypothesis.
            console.log(
                '\n=== VERDICT ===',
                '\nDirect command affected',
                directNumbered,
                'lines.',
                '\nHotkey affected',
                hotkeyNumbered,
                'lines.',
            );
            if (directNumbered > hotkeyNumbered) {
                console.log(
                    'CONFIRMED: Hotkey path (capture phase) sees cursor-only selection.',
                    'Direct command path sees expanded/correct selection.',
                );
            } else if (directNumbered === hotkeyNumbered) {
                console.log(
                    'Both paths affected the same number of lines.',
                    'The issue may be elsewhere (e.g., both read cursor-only).',
                );
            }
        });

        it('should compare toggle-bold results: direct command vs keyboard shortcut (Ctrl+B)', async function () {
            // Ctrl+B is a DEFAULT Obsidian hotkey for toggle-bold.
            // If it also only affects 1 line, then ALL hotkey commands are broken.
            // If it affects all lines, something special about default vs custom hotkeys.

            // Test 1: Direct command
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
                ).commands.executeCommandById('editor:toggle-bold');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const directResult = await getEditorValue();
            const directBold = directResult
                .split('\n')
                .filter((l: string) => /\*\*.*\*\*/.test(l)).length;

            // Test 2: Ctrl+B via keyboard (default Obsidian hotkey)
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
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

            // NOTE: Ctrl+B in vim visual mode is "page up" — vim may handle
            // this key, preventing Obsidian from seeing it at all!
            // The fork's handleKey would call preventDefault+stopPropagation.
            await browser.keys(['Control', 'b']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hotkeyResult = await getEditorValue();
            const hotkeyBold = hotkeyResult
                .split('\n')
                .filter((l: string) => /\*\*.*\*\*/.test(l)).length;

            console.log('=== BOLD COMPARISON ===');
            console.log(
                'Direct executeCommandById: bold',
                directBold,
                'lines →',
                directResult,
            );
            console.log(
                'Hotkey Ctrl+B: bold',
                hotkeyBold,
                'lines →',
                hotkeyResult,
            );

            // Note: If Ctrl+B is consumed by vim (<C-b> = page up), hotkeyBold
            // will be 0 and the content won't change. This is expected and means
            // the user can't use Ctrl+B for bold in visual mode anyway.
        });
    });

    describe('Selection state inspection during visual-line', function () {
        it('should inspect CM6 selection, vim.sel, and Editor.listSelections during visual-line', async function () {
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

            const selState = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    // CM6 EditorView
                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: {
                                  selection: {
                                      main: { anchor: number; head: number };
                                  };
                                  doc: {
                                      lineAt: (pos: number) => {
                                          number: number;
                                          text: string;
                                      };
                                      length: number;
                                  };
                              };
                              cm?: {
                                  state?: {
                                      vim?: {
                                          visualMode: boolean;
                                          visualLine: boolean;
                                          sel: {
                                              anchor: {
                                                  line: number;
                                                  ch: number;
                                              };
                                              head: {
                                                  line: number;
                                                  ch: number;
                                              };
                                          } | null;
                                      };
                                  };
                              };
                          }
                        | undefined;

                    if (!editorView) return { error: 'No CM6 view' };

                    const cm6Sel = editorView.state.selection.main;
                    const vim = editorView.cm?.state?.vim;

                    // Obsidian Editor's view of the selection
                    const obsidianSel = view.editor.listSelections();
                    const obsidianGetSel = view.editor.getSelection();

                    return {
                        cm6Selection: {
                            anchor: cm6Sel.anchor,
                            head: cm6Sel.head,
                            isCursorOnly: cm6Sel.anchor === cm6Sel.head,
                        },
                        vimSel: vim?.sel
                            ? {
                                  anchor: vim.sel.anchor,
                                  head: vim.sel.head,
                                  visualMode: vim.visualMode,
                                  visualLine: vim.visualLine,
                              }
                            : null,
                        obsidianSelection: {
                            ranges: obsidianSel,
                            getSelection: obsidianGetSel,
                            getSelectionLength: obsidianGetSel.length,
                        },
                    };
                },
            );

            console.log(
                'Selection state during visual-line:',
                JSON.stringify(selState, null, 2),
            );

            // Key findings:
            // - cm6Selection.isCursorOnly: true → confirms cursor-only CM6 selection
            // - vimSel: should show the actual linewise selection range
            // - obsidianSelection: what does Obsidian's Editor.listSelections() return?
            //   If it also returns cursor-only, then ANY command reading selection is affected.
        });
    });
});
