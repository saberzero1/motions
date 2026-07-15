import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    sendVimEscape,
    getEditorValue,
    getCursorPos,
    getVimMode,
    PAUSE,
} from '../../helpers';

/**
 * Spike 27: ci* cursor displacement in Live Preview
 *
 * Investigates whether the `c` operator lands the insert cursor at the wrong
 * position when the deletion point falls inside a collapsed Decoration.replace
 * region. `di*` works correctly; `ci*` is documented as a permanent CM6
 * platform limitation (KNOWN_LIMITATIONS.md line 642).
 *
 * Key question: after the transaction filter removal (commit 4424df5), does
 * Obsidian actually use Decoration.replace or Decoration.mark on the active
 * line? If marks are visible text nodes, ci* might work now.
 */

describe('Spike 27: ci* cursor displacement in Live Preview', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(200);
    });

    describe('di* baseline (known working)', function () {
        it('di* should delete inside bold delimiters', async function () {
            await setupEditor('Hello **bold text** world', {
                line: 0,
                ch: 10,
            });
            await vimKeys('d', 'i', '*');
            const value = await getEditorValue();
            console.log('di* result:', JSON.stringify(value));
            expect(value).toBe('Hello **** world');
        });

        it('di* should delete inside italic delimiters', async function () {
            await setupEditor('Hello *italic text* world', {
                line: 0,
                ch: 10,
            });
            await vimKeys('d', 'i', '*');
            const value = await getEditorValue();
            console.log('di* italic result:', JSON.stringify(value));
            expect(value).toBe('Hello ** world');
        });
    });

    describe('ci* in Live Preview (the bug)', function () {
        it('should test ci* on bold text and check cursor position', async function () {
            await setupEditor('Hello **bold text** world', {
                line: 0,
                ch: 12,
            });

            const preMode = await getVimMode();
            console.log('Mode before ci*:', preMode);

            await vimKeys('c', 'i', '*');
            await browser.pause(200);

            const postMode = await getVimMode();
            const cursor = await getCursorPos();
            const value = await getEditorValue();
            console.log('Mode after ci*:', postMode);
            console.log('Cursor after ci*:', JSON.stringify(cursor));
            console.log('Editor value after ci*:', JSON.stringify(value));

            // After ci*, we should be in insert mode between the ** **
            // Expected: value = "Hello **** world", cursor at {line:0, ch:8}
            // (between the two **)
            if (postMode !== 'insert') {
                console.log(
                    'UNEXPECTED: Not in insert mode after ci*. Mode:',
                    postMode,
                );
            }

            // Type replacement text
            await browser.keys('new'.split(''));
            await sendVimEscape();
            await browser.pause(200);

            const finalValue = await getEditorValue();
            const finalCursor = await getCursorPos();
            console.log(
                'Final value after typing "new":',
                JSON.stringify(finalValue),
            );
            console.log('Final cursor:', JSON.stringify(finalCursor));

            if (finalValue === 'Hello **new** world') {
                console.log(
                    'ci* WORKS CORRECTLY — the limitation may be resolved.',
                );
            } else {
                console.log(
                    'BUG CONFIRMED: ci* produced incorrect result.',
                    'Expected: "Hello **new** world"',
                    'Got:',
                    JSON.stringify(finalValue),
                );
            }
        });

        it('should test ci* with single-character bold content', async function () {
            await setupEditor('Hello **x** world', { line: 0, ch: 8 });

            await vimKeys('c', 'i', '*');
            await browser.pause(200);

            const cursor = await getCursorPos();
            const value = await getEditorValue();
            console.log(
                'ci* on single char — value:',
                JSON.stringify(value),
                'cursor:',
                JSON.stringify(cursor),
            );

            await browser.keys(['y']);
            await sendVimEscape();
            await browser.pause(200);

            const finalValue = await getEditorValue();
            console.log('After typing "y":', JSON.stringify(finalValue));

            if (finalValue === 'Hello **y** world') {
                console.log('ci* on single char WORKS.');
            } else {
                console.log(
                    'BUG: ci* on single char failed. Got:',
                    JSON.stringify(finalValue),
                );
            }
        });

        it('should test ci* with italic (single *)', async function () {
            await setupEditor('Hello *italic* world', { line: 0, ch: 9 });

            await vimKeys('c', 'i', '*');
            await browser.pause(200);

            await browser.keys('new'.split(''));
            await sendVimEscape();
            await browser.pause(200);

            const finalValue = await getEditorValue();
            console.log('ci* italic result:', JSON.stringify(finalValue));

            if (finalValue === 'Hello *new* world') {
                console.log('ci* on italic WORKS.');
            } else {
                console.log(
                    'BUG: ci* on italic failed. Got:',
                    JSON.stringify(finalValue),
                );
            }
        });
    });

    describe('Decoration type diagnosis', function () {
        it('should inspect decoration types on the active line', async function () {
            await setupEditor('Hello **bold text** world', {
                line: 0,
                ch: 10,
            });
            await browser.pause(500);

            const decorationInfo = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as {
                        state: Record<string, unknown>;
                        coordsAtPos?: (
                            pos: number,
                        ) => { left: number; top: number } | null;
                        posAtCoords?: (coords: {
                            x: number;
                            y: number;
                        }) => number | null;
                    } & Record<string, unknown>;
                    if (!editorView) return { error: 'No EditorView' };

                    const doc = editorView.state.doc as {
                        toString: () => string;
                    };
                    const text = doc.toString();

                    // Find the ** positions
                    const firstStarPair = text.indexOf('**');
                    const secondStarPair = text.indexOf(
                        '**',
                        firstStarPair + 2,
                    );

                    // Test coordsAtPos at various positions around the bold markers
                    const coords: Record<
                        string,
                        { left: number; top: number } | null | string
                    > = {};
                    const positions = [
                        firstStarPair - 1,
                        firstStarPair,
                        firstStarPair + 1,
                        firstStarPair + 2,
                        firstStarPair + 3,
                        secondStarPair - 1,
                        secondStarPair,
                        secondStarPair + 1,
                        secondStarPair + 2,
                    ];

                    for (const pos of positions) {
                        if (pos >= 0 && pos <= text.length) {
                            try {
                                const c = editorView.coordsAtPos?.(pos);
                                coords[`pos${pos}`] = c;
                            } catch (e) {
                                coords[`pos${pos}`] = `error: ${e}`;
                            }
                        }
                    }

                    // Check if positions inside ** have distinct coordinates
                    // (if they're collapsed, multiple positions map to the same coords)
                    const star1Coords = coords[`pos${firstStarPair}`];
                    const star1Plus1 = coords[`pos${firstStarPair + 1}`];
                    const star1Plus2 = coords[`pos${firstStarPair + 2}`];

                    let collapsed = false;
                    if (
                        star1Coords &&
                        star1Plus1 &&
                        typeof star1Coords !== 'string' &&
                        typeof star1Plus1 !== 'string'
                    ) {
                        collapsed =
                            Math.abs(star1Coords.left - star1Plus1.left) < 2;
                    }

                    return {
                        text: text.slice(0, 30),
                        firstStarPair,
                        secondStarPair,
                        coords,
                        starsCollapsed: collapsed,
                        note: collapsed
                            ? 'Stars have same coordinates — Decoration.replace is active'
                            : 'Stars have distinct coordinates — Decoration.mark (visible text nodes)',
                    };
                },
            );

            console.log(
                'Decoration diagnosis:',
                JSON.stringify(decorationInfo, null, 2),
            );
        });

        it('should check cursor position after replaceRange at bold boundary', async function () {
            await setupEditor('Hello **bold text** world', {
                line: 0,
                ch: 10,
            });
            await browser.pause(300);

            // Simulate what the c operator does: delete inner text, then check cursor
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    Vim.handleKey(adapter, '<Esc>');
                    const cursorBefore = view.editor.getCursor();

                    // Execute ci* via handleKey
                    Vim.handleKey(adapter, 'c');
                    Vim.handleKey(adapter, 'i');
                    Vim.handleKey(adapter, '*');

                    const cursorAfterCI = view.editor.getCursor();
                    const valueAfterCI = view.editor.getValue();
                    const vimState = (
                        adapter as { state?: { vim?: Record<string, unknown> } }
                    ).state?.vim;

                    return {
                        cursorBefore: {
                            line: cursorBefore.line,
                            ch: cursorBefore.ch,
                        },
                        cursorAfterCI: {
                            line: cursorAfterCI.line,
                            ch: cursorAfterCI.ch,
                        },
                        valueAfterCI,
                        inInsertMode: !!vimState?.insertMode,
                        expectedCursorCh: 8, // between the ** **
                    };
                },
            );

            console.log(
                'Programmatic ci* result:',
                JSON.stringify(result, null, 2),
            );

            if (
                result &&
                typeof result === 'object' &&
                'cursorAfterCI' in result
            ) {
                const cursor = result.cursorAfterCI as { ch: number };
                if (cursor.ch === 8) {
                    console.log(
                        'Cursor positioned correctly at ch:8 (between ** **).',
                    );
                } else {
                    console.log(
                        `Cursor displaced: expected ch:8, got ch:${cursor.ch}.`,
                    );
                }
            }
        });
    });

    describe('Source mode control test', function () {
        it('should test ci* in source mode (no Live Preview decorations)', async function () {
            // Force source mode
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const state = view.getState();
                state.mode = 'source';
                state.source = true;
                view.setState(state, { history: false });
            });
            await browser.pause(500);

            await setupEditor('Hello **bold text** world', {
                line: 0,
                ch: 12,
            });
            await vimKeys('c', 'i', '*');
            await browser.pause(200);

            await browser.keys('new'.split(''));
            await sendVimEscape();
            await browser.pause(200);

            const value = await getEditorValue();
            console.log('ci* in source mode result:', JSON.stringify(value));

            if (value === 'Hello **new** world') {
                console.log(
                    'ci* works in source mode — confirms the issue is Live Preview decoration-specific.',
                );
            } else {
                console.log(
                    'ci* also fails in source mode — issue is NOT decoration-related.',
                    'Got:',
                    JSON.stringify(value),
                );
            }

            // Restore Live Preview
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const state = view.getState();
                state.mode = 'source';
                state.source = false;
                view.setState(state, { history: false });
            });
            await browser.pause(500);
        });
    });
});
