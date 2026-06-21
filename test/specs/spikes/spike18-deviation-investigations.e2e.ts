import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getEditorValue, getCursorPos } from '../../helpers';

describe('Spike 18: Deviation closure investigations (Phase 0)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('Investigation A: mapCommand operator-pending interception', function () {
        it('should test whether mapCommand("dG") intercepts d + G in operator-pending mode', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (cm: unknown) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let actionFired = false;
                    Vim.defineAction('testDG', () => {
                        actionFired = true;
                    });
                    Vim.mapCommand('dG', 'action', 'testDG', {});

                    view.editor.setValue('one\ntwo\nthree\nfour');
                    view.editor.setCursor(1, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'G');

                    const content = view.editor.getValue();
                    return {
                        actionFired,
                        content,
                        intercepted: actionFired,
                        builtinRan: content !== 'one\ntwo\nthree\nfour',
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation A (mapCommand dG):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });

        it('should test whether mapCommand("d0") intercepts d + 0 in operator-pending mode', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (cm: unknown) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let actionFired = false;
                    Vim.defineAction('testD0', () => {
                        actionFired = true;
                    });
                    Vim.mapCommand('d0', 'action', 'testD0', {});

                    view.editor.setValue('hello world');
                    view.editor.setCursor(0, 5);
                    view.editor.focus();

                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, '0');

                    return {
                        actionFired,
                        content: view.editor.getValue(),
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation A (mapCommand d0):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });
    });

    describe('Investigation B: handleKey re-entrancy and origin parameter', function () {
        it('should test whether handleKey(cm, "P") from mapCommand("P") causes recursion', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (cm: unknown) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                        origin?: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    view.editor.setValue('hello world');
                    view.editor.setCursor(0, 5);
                    view.editor.focus();

                    // Yank a word first
                    Vim.handleKey(adapter, 'y');
                    Vim.handleKey(adapter, 'w');

                    // Test 1: direct handleKey without origin — expect recursion
                    let directRecursed = false;
                    let directCallCount = 0;
                    Vim.defineAction('testPDirect', (cm2: unknown) => {
                        directCallCount++;
                        if (directCallCount > 3) {
                            directRecursed = true;
                            return;
                        }
                        try {
                            Vim.handleKey(cm2, 'P');
                        } catch {
                            directRecursed = true;
                        }
                    });
                    Vim.mapCommand('P', 'action', 'testPDirect', {});

                    try {
                        Vim.handleKey(adapter, 'P');
                    } catch {
                        directRecursed = true;
                    }

                    // Test 2: handleKey with 'mapping' origin
                    let originRecursed = false;
                    let originCallCount = 0;
                    Vim.defineAction('testPOrigin', (cm2: unknown) => {
                        originCallCount++;
                        if (originCallCount > 3) {
                            originRecursed = true;
                            return;
                        }
                        try {
                            Vim.handleKey(cm2, 'P', 'mapping');
                        } catch {
                            originRecursed = true;
                        }
                    });
                    Vim.mapCommand('P', 'action', 'testPOrigin', {});

                    try {
                        Vim.handleKey(adapter, 'P');
                    } catch {
                        originRecursed = true;
                    }

                    return {
                        directRecursed,
                        directCallCount,
                        originRecursed,
                        originCallCount,
                        originBypasses:
                            !originRecursed && originCallCount === 1,
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation B (re-entrancy):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });
    });

    describe('Investigation D: defineMotion override priority', function () {
        it('should test whether defineMotion overrides CM Vim built-in ) motion', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineMotion: (
                                        name: string,
                                        fn: (
                                            cm: unknown,
                                            head: unknown,
                                        ) => unknown,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let motionFired = false;
                    Vim.defineMotion(
                        'testSentenceForward',
                        (_cm: unknown, head: unknown) => {
                            motionFired = true;
                            return head;
                        },
                    );
                    Vim.mapCommand(')', 'motion', 'testSentenceForward', {});

                    view.editor.setValue('First sentence. Second sentence.');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, ')');

                    return {
                        motionFired,
                        overrideWorks: motionFired,
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation D (defineMotion override):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });
    });

    describe('Investigation E: Undo integration with cm.replaceRange()', function () {
        it('should test whether u undoes a replaceRange inside defineAction', async function () {
            await setupEditor('original text here', { line: 0, ch: 0 });

            const insertResult = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (cm: unknown) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as {
                        replaceRange: (
                            text: string,
                            from: { line: number; ch: number },
                            to: { line: number; ch: number },
                        ) => void;
                    } | null;
                    if (!adapter) return { error: 'No adapter' };

                    Vim.defineAction('testReplaceRange', () => {
                        adapter.replaceRange(
                            '',
                            { line: 0, ch: 0 },
                            { line: 0, ch: 9 },
                        );
                    });
                    Vim.mapCommand('\\\\r', 'action', 'testReplaceRange', {});

                    view.editor.focus();
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, 'r');

                    return {
                        contentAfterAction: view.editor.getValue(),
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation E (after action):',
                JSON.stringify(insertResult, null, 2),
            );

            expect(insertResult).not.toHaveProperty('error');

            // Now test undo
            await browser.keys(['Escape']);
            await browser.pause(50);

            const undoResult = await browser.executeObsidian(
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
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    view.editor.focus();
                    Vim.handleKey(adapter, 'u');

                    return {
                        contentAfterUndo: view.editor.getValue(),
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation E (after undo):',
                JSON.stringify(undoResult, null, 2),
            );

            const undoRestored =
                undoResult &&
                'contentAfterUndo' in undoResult &&
                undoResult.contentAfterUndo === 'original text here';

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation E: undo restores content =',
                undoRestored,
            );

            expect(undoResult).not.toHaveProperty('error');
        });
    });

    describe('Investigation C: << shiftwidth behavior', function () {
        it('should test whether shiftwidth option affects << indent amount', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    getOption: (name: string) => unknown;
                                    setOption: (
                                        name: string,
                                        value: unknown,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    const currentSw = Vim.getOption('shiftwidth');

                    // Set shiftwidth to 4 and test >>
                    Vim.setOption('shiftwidth', 4);
                    view.editor.setValue('hello');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, '>');
                    Vim.handleKey(adapter, '>');

                    const afterIndent4 = view.editor.getValue();
                    const cursorAfterIndent = view.editor.getCursor();

                    // Now test << to unindent
                    Vim.handleKey(adapter, '<');
                    Vim.handleKey(adapter, '<');

                    const afterUnindent4 = view.editor.getValue();

                    // Test with shiftwidth=8
                    Vim.setOption('shiftwidth', 8);
                    view.editor.setValue('        hello');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, '<');
                    Vim.handleKey(adapter, '<');

                    const afterUnindent8 = view.editor.getValue();

                    // Restore
                    Vim.setOption('shiftwidth', currentSw);

                    return {
                        defaultShiftwidth: currentSw,
                        afterIndent4,
                        cursorAfterIndent: {
                            line: cursorAfterIndent.line,
                            ch: cursorAfterIndent.ch,
                        },
                        afterUnindent4,
                        afterUnindent8,
                        shiftwidthRespected:
                            afterIndent4 === '    hello' &&
                            afterUnindent4 === 'hello',
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Investigation C (shiftwidth):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });
    });

    describe('Follow-up: mapCommand for single keys and doubled operators', function () {
        it('should test whether mapCommand("P") works for single-key action', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (
                                            cm: unknown,
                                            actionArgs: Record<string, unknown>,
                                        ) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let actionFired = false;
                    let receivedArgs: Record<string, unknown> | null = null;
                    Vim.defineAction(
                        'testPAction',
                        (_cm: unknown, actionArgs: Record<string, unknown>) => {
                            actionFired = true;
                            receivedArgs = actionArgs;
                        },
                    );
                    Vim.mapCommand('P', 'action', 'testPAction', {});

                    view.editor.setValue('hello world');
                    view.editor.setCursor(0, 5);
                    view.editor.focus();

                    Vim.handleKey(adapter, 'y');
                    Vim.handleKey(adapter, 'w');
                    Vim.handleKey(adapter, 'P');

                    return {
                        actionFired,
                        receivedArgsKeys: receivedArgs
                            ? Object.keys(receivedArgs)
                            : null,
                        repeat: receivedArgs
                            ? (receivedArgs as Record<string, unknown>).repeat
                            : null,
                        register: receivedArgs
                            ? (receivedArgs as Record<string, unknown>).register
                            : null,
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Follow-up (mapCommand P):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });

        it('should test whether mapCommand(">>") works for doubled operator', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (
                                            cm: unknown,
                                            actionArgs: Record<string, unknown>,
                                        ) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let actionFired = false;
                    let receivedArgs: Record<string, unknown> | null = null;
                    Vim.defineAction(
                        'testIndentAction',
                        (_cm: unknown, actionArgs: Record<string, unknown>) => {
                            actionFired = true;
                            receivedArgs = actionArgs;
                        },
                    );
                    Vim.mapCommand('>>', 'action', 'testIndentAction', {});

                    view.editor.setValue('hello');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, '>');
                    Vim.handleKey(adapter, '>');

                    return {
                        actionFired,
                        content: view.editor.getValue(),
                        receivedArgsKeys: receivedArgs
                            ? Object.keys(receivedArgs)
                            : null,
                        repeat: receivedArgs
                            ? (receivedArgs as Record<string, unknown>).repeat
                            : null,
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Follow-up (mapCommand >>):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });

        it('should test whether vim.map("dG", ...) works as key-to-key mapping', async function () {
            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    defineAction: (
                                        name: string,
                                        fn: (cm: unknown) => void,
                                    ) => void;
                                    mapCommand: (
                                        keys: string,
                                        type: string,
                                        name: string,
                                        args: Record<string, unknown>,
                                    ) => void;
                                    map: (
                                        lhs: string,
                                        rhs: string,
                                        context?: string,
                                    ) => void;
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                    handleEx: (
                                        cm: unknown,
                                        input: string,
                                    ) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim API' };

                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    let actionFired = false;
                    Vim.defineAction('testDGAction', () => {
                        actionFired = true;
                    });
                    Vim.mapCommand('<leader>dg', 'action', 'testDGAction', {});

                    // Map dG to the leader-prefixed action key
                    Vim.map('dG', '<leader>dg', 'normal');

                    view.editor.setValue('one\ntwo\nthree\nfour');
                    view.editor.setCursor(1, 0);
                    view.editor.focus();

                    Vim.handleKey(adapter, 'd');
                    Vim.handleKey(adapter, 'G');

                    return {
                        actionFired,
                        content: view.editor.getValue(),
                        mapIntercepted: actionFired,
                    };
                },
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- investigation output
            console.log(
                'Follow-up (vim.map dG):',
                JSON.stringify(result, null, 2),
            );

            expect(result).not.toHaveProperty('error');
        });
    });
});
