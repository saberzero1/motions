/**
 * Spike: Fold Investigation — resolves critical unknowns blocking fold
 * improvements (Issue #54).
 *
 * Questions answered:
 * 1. Does `editor:toggle-fold-properties` use CM6 foldEffect/foldState?
 * 2. Does the cursor desync from Issue #54 reproduce programmatically?
 * 3. Do CM6 foldAll and Obsidian editor:fold-all produce identical state?
 * 4. What is the cursor behavior across different fold scenarios?
 *
 * @see https://github.com/saberzero1/motions/issues/54
 */

import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    getCursorPos,
    PAUSE,
    loadSingleFileWorkspace,
} from '../../helpers.js';

const FOLD_PROPERTIES_CMD = 'editor:toggle-fold-properties';

const ALL_OBSIDIAN_FOLD_CMDS = [
    'editor:toggle-fold-properties',
    'editor:toggle-fold',
    'editor:fold-all',
    'editor:unfold-all',
    'editor:fold-more',
    'editor:fold-less',
] as const;

const FRONTMATTER_CONTENT = [
    '---',
    'title: Test Note',
    'tags: [spike, fold]',
    'date: 2025-07-11',
    '---',
    '',
    '# Heading After Frontmatter',
    '',
    'Body text after heading.',
    '',
    '## Second Heading',
    '',
    'More body text.',
].join('\n');

const HEADING_CONTENT = [
    '# First Heading',
    '',
    'Content under first heading.',
    '',
    '## Second Heading',
    '',
    'Content under second heading.',
    '',
    '## Third Heading',
    '',
    'Content under third heading.',
].join('\n');

type CommandsApi = {
    commands: {
        executeCommandById: (id: string) => boolean;
    };
};

describe('Spike: Fold Investigation (Issue #54)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('1. Command discovery', function () {
        it('should confirm editor:toggle-fold-properties exists', async function () {
            const commands = (await browser.executeObsidian(({ app }) => {
                const allCommands = (
                    app as unknown as {
                        commands: {
                            commands: Record<
                                string,
                                { id: string; name: string }
                            >;
                        };
                    }
                ).commands.commands;
                return Object.values(allCommands)
                    .filter(
                        (cmd) =>
                            cmd.id.includes('fold') ||
                            cmd.id.includes('properties'),
                    )
                    .map((cmd) => ({ id: cmd.id, name: cmd.name }));
            })) as Array<{ id: string; name: string }>;

            console.log(
                'Fold/properties commands:',
                JSON.stringify(commands, null, 2),
            );

            const ids = commands.map((c) => c.id);
            expect(ids).toContain('editor:fold-all');
            expect(ids).toContain('editor:unfold-all');
            expect(ids).toContain(FOLD_PROPERTIES_CMD);
        });
    });

    describe('2. Properties fold mechanism (CRITICAL UNKNOWN #1)', function () {
        it('should detect whether properties fold mutates CM6 foldState', async function () {
            const result = (await browser.executeObsidian(
                async (
                    { app, obsidian, require: req },
                    content: string,
                    foldCmd: string,
                ) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    view.editor.setValue(content);
                    view.editor.setCursor(6, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const lang = req('@codemirror/language') as {
                        foldedRanges: (state: unknown) => {
                            iter: () => { from: number; to: number; done: boolean; next: () => void };
                        };
                    };
                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { state: unknown } | undefined;
                    if (!cm6View?.state) return { error: 'No CM6 state' };

                    const foldsBefore: Array<{ from: number; to: number }> = [];
                    const ib = lang.foldedRanges(cm6View.state).iter();
                    while (!ib.done) { foldsBefore.push({ from: ib.from, to: ib.to }); ib.next(); }

                    (
                        app as unknown as { commands: { executeCommandById: (id: string) => boolean } }
                    ).commands.executeCommandById(foldCmd);
                    await new Promise((r) => setTimeout(r, 500));

                    const foldsAfter: Array<{ from: number; to: number }> = [];
                    const ia = lang.foldedRanges(cm6View.state).iter();
                    while (!ia.done) { foldsAfter.push({ from: ia.from, to: ia.to }); ia.next(); }

                    const foldStateChanged =
                        JSON.stringify(foldsBefore) !== JSON.stringify(foldsAfter);

                    return {
                        executedCmd: foldCmd,
                        foldsBefore,
                        foldsAfter,
                        foldStateChanged,
                        usesCM6FoldState: foldStateChanged,
                        conclusion: foldStateChanged
                            ? 'Properties fold USES CM6 foldEffect/foldState'
                            : 'Properties fold does NOT use CM6 foldState — separate mechanism',
                    };
                },
                FRONTMATTER_CONTENT,
                FOLD_PROPERTIES_CMD,
            )) as Record<string, unknown>;

            console.log(
                'CRITICAL FINDING #1:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });

        it('should detect DOM-level properties widget collapse', async function () {
            const result = (await browser.executeObsidian(
                async (
                    { app, obsidian },
                    content: string,
                    foldCmd: string,
                ) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    view.editor.setValue(content);
                    view.editor.setCursor(6, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const editorEl = (
                        view.editor as unknown as Record<string, unknown>
                    ).containerEl as HTMLElement | undefined;
                    if (!editorEl) return { error: 'No containerEl' };

                    const widgetBefore =
                        editorEl.querySelector('.metadata-container');
                    const collapsedBefore = editorEl.querySelector(
                        '.metadata-container.is-collapsed',
                    );

                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                    await new Promise((r) => setTimeout(r, 500));

                    const collapsedAfter = editorEl.querySelector(
                        '.metadata-container.is-collapsed',
                    );

                    return {
                        hasPropertiesWidget: !!widgetBefore,
                        beforeCollapsed: !!collapsedBefore,
                        afterCollapsed: !!collapsedAfter,
                        collapsedStateChanged:
                            !!collapsedBefore !== !!collapsedAfter,
                        conclusion: !widgetBefore
                            ? 'No metadata-container — properties rendered differently in source mode'
                            : !!collapsedBefore !== !!collapsedAfter
                              ? 'Properties fold uses CSS class toggle (is-collapsed) on metadata-container'
                              : 'No DOM change detected',
                    };
                },
                FRONTMATTER_CONTENT,
                FOLD_PROPERTIES_CMD,
            )) as Record<string, unknown>;

            console.log(
                'DOM detection:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });
    });

    describe('3. Issue #54 reproduction (CRITICAL UNKNOWN #2)', function () {
        it('cursor below frontmatter — should track position after fold', async function () {
            await setupEditor(FRONTMATTER_CONTENT, { line: 6, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(
                ({ app }, foldCmd: string) => {
                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                },
                FOLD_PROPERTIES_CMD,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('Issue #54 — cursor below FM:', {
                cursorBefore,
                cursorAfter,
                lineDelta: cursorAfter.line - cursorBefore.line,
                bugReproduced: cursorBefore.line !== cursorAfter.line,
            });
        });

        it('cursor inside frontmatter — should track position after fold', async function () {
            await setupEditor(FRONTMATTER_CONTENT, { line: 2, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(
                ({ app }, foldCmd: string) => {
                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                },
                FOLD_PROPERTIES_CMD,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('Issue #54 — cursor inside FM:', {
                cursorBefore,
                cursorAfter,
                lineDelta: cursorAfter.line - cursorBefore.line,
                bugReproduced:
                    cursorBefore.line === cursorAfter.line &&
                    cursorAfter.line > 0,
            });
        });

        it('cursor on opening --- — should track position after fold', async function () {
            await setupEditor(FRONTMATTER_CONTENT, { line: 0, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(
                ({ app }, foldCmd: string) => {
                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                },
                FOLD_PROPERTIES_CMD,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('Issue #54 — cursor on ---:', {
                cursorBefore,
                cursorAfter,
                lineDelta: cursorAfter.line - cursorBefore.line,
            });
        });

        it('round-trip fold/unfold — cursor should return to original position', async function () {
            await setupEditor(FRONTMATTER_CONTENT, { line: 8, ch: 5 });
            const cursorOriginal = await getCursorPos();

            await browser.executeObsidian(
                ({ app }, foldCmd: string) => {
                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                },
                FOLD_PROPERTIES_CMD,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfterFold = await getCursorPos();

            await browser.executeObsidian(
                ({ app }, foldCmd: string) => {
                    (
                        app as unknown as CommandsApi
                    ).commands.executeCommandById(foldCmd);
                },
                FOLD_PROPERTIES_CMD,
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfterUnfold = await getCursorPos();
            console.log('Round-trip fold/unfold:', {
                cursorOriginal,
                cursorAfterFold,
                cursorAfterUnfold,
                restoredCorrectly:
                    cursorOriginal.line === cursorAfterUnfold.line &&
                    cursorOriginal.ch === cursorAfterUnfold.ch,
            });
        });
    });

    describe('4. Heading fold cursor baseline', function () {
        it('zc on heading line — cursor position', async function () {
            await setupEditor(HEADING_CONTENT, { line: 0, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (window as unknown as { CodeMirrorAdapter?: { Vim?: { handleKey: (cm: unknown, key: string) => boolean } } }).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>).cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, 'z');
                Vim.handleKey(adapter, 'c');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('zc on heading:', { cursorBefore, cursorAfter });
        });

        it('zc on heading with cursor below — cursor position', async function () {
            await setupEditor(HEADING_CONTENT, { line: 6, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return;
                view.editor.setCursor(0, 0);
                const Vim = (window as unknown as { CodeMirrorAdapter?: { Vim?: { handleKey: (cm: unknown, key: string) => boolean } } }).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>).cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, 'z');
                Vim.handleKey(adapter, 'c');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('zc heading, cursor was below:', {
                cursorBefore,
                cursorAfter,
            });
        });

        it('editor:fold-all with cursor in middle — cursor position', async function () {
            await setupEditor(HEADING_CONTENT, { line: 6, ch: 0 });
            const cursorBefore = await getCursorPos();

            await browser.executeObsidian(({ app }) => {
                (app as unknown as { commands: { executeCommandById: (id: string) => boolean } }).commands.executeCommandById('editor:fold-all');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorAfter = await getCursorPos();
            console.log('editor:fold-all cursor:', {
                cursorBefore,
                cursorAfter,
            });
        });
    });

    describe('5. Line count and content verification after fold', function () {
        it('cursor at last line — does fold change doc line count?', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian }, content: string, foldCmd: string) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(content);
                    const lastLine = view.editor.lineCount() - 1;
                    view.editor.setCursor(lastLine, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const before = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        cursorCh: view.editor.getCursor().ch,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                        docLength: view.editor.getValue().length,
                    };

                    (app as unknown as { commands: { executeCommandById: (id: string) => boolean } })
                        .commands.executeCommandById(foldCmd);
                    await new Promise((r) => setTimeout(r, 500));

                    const after = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        cursorCh: view.editor.getCursor().ch,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                        docLength: view.editor.getValue().length,
                    };

                    return {
                        before,
                        after,
                        lineCountChanged: before.lineCount !== after.lineCount,
                        lineCountDelta: after.lineCount - before.lineCount,
                        cursorLineDelta: after.cursorLine - before.cursorLine,
                        docLengthChanged: before.docLength !== after.docLength,
                        contentAtCursorChanged: before.lineContent !== after.lineContent,
                    };
                },
                FRONTMATTER_CONTENT,
                FOLD_PROPERTIES_CMD,
            )) as Record<string, unknown>;

            console.log('LAST LINE — properties fold:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });

        it('cursor at line 6 — verify content at cursor stays same', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian }, content: string, foldCmd: string) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(content);
                    view.editor.setCursor(6, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const before = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        lineContent: view.editor.getLine(6),
                        line5Content: view.editor.getLine(5),
                        line7Content: view.editor.getLine(7),
                    };

                    (app as unknown as { commands: { executeCommandById: (id: string) => boolean } })
                        .commands.executeCommandById(foldCmd);
                    await new Promise((r) => setTimeout(r, 500));

                    const afterCursor = view.editor.getCursor();
                    const after = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: afterCursor.line,
                        lineContent: view.editor.getLine(afterCursor.line),
                        line5Content: view.editor.getLine(5),
                        line7Content: view.editor.getLine(7),
                    };

                    return {
                        before,
                        after,
                        lineCountDelta: after.lineCount - before.lineCount,
                        cursorPointsToSameContent: before.lineContent === after.lineContent,
                    };
                },
                FRONTMATTER_CONTENT,
                FOLD_PROPERTIES_CMD,
            )) as Record<string, unknown>;

            console.log('LINE 6 content check:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });

        it('editor:fold-all — line count and content at cursor', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian }, content: string) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(content);
                    const lastLine = view.editor.lineCount() - 1;
                    view.editor.setCursor(lastLine, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const before = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                    };

                    (app as unknown as { commands: { executeCommandById: (id: string) => boolean } })
                        .commands.executeCommandById('editor:fold-all');
                    await new Promise((r) => setTimeout(r, 500));

                    const after = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                    };

                    return {
                        before,
                        after,
                        lineCountDelta: after.lineCount - before.lineCount,
                        cursorPointsToSameContent: before.lineContent === after.lineContent,
                    };
                },
                HEADING_CONTENT,
            )) as Record<string, unknown>;

            console.log('editor:fold-all last line:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });

        it('editor:toggle-fold on heading — line count change', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian }, content: string) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(content);
                    const lastLine = view.editor.lineCount() - 1;
                    view.editor.setCursor(lastLine, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const before = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                    };

                    view.editor.setCursor(0, 0);
                    (app as unknown as { commands: { executeCommandById: (id: string) => boolean } })
                        .commands.executeCommandById('editor:toggle-fold');
                    await new Promise((r) => setTimeout(r, 500));

                    view.editor.setCursor(lastLine, 0);
                    const after = {
                        lineCount: view.editor.lineCount(),
                        cursorLine: view.editor.getCursor().line,
                        lineContent: view.editor.getLine(view.editor.getCursor().line),
                    };

                    return {
                        before,
                        after,
                        lineCountDelta: after.lineCount - before.lineCount,
                        cursorPointsToSameContent: before.lineContent === after.lineContent,
                    };
                },
                HEADING_CONTENT,
            )) as Record<string, unknown>;

            console.log('editor:toggle-fold last line:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });
    });

    describe('7. All Obsidian fold commands — CM6 state and cursor impact', function () {
        for (const cmd of ALL_OBSIDIAN_FOLD_CMDS) {
            it(`${cmd} — CM6 foldState mutation`, async function () {
                const content =
                    cmd === FOLD_PROPERTIES_CMD
                        ? FRONTMATTER_CONTENT
                        : HEADING_CONTENT;
                const cursorLine = cmd === FOLD_PROPERTIES_CMD ? 6 : 0;

                const result = (await browser.executeObsidian(
                    async (
                        { app, obsidian, require: req },
                        docContent: string,
                        cmdId: string,
                        startLine: number,
                    ) => {
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No MarkdownView' };

                        view.editor.setValue(docContent);
                        view.editor.setCursor(startLine, 0);
                        view.editor.focus();
                        await new Promise((r) => setTimeout(r, 500));

                        const lang = req('@codemirror/language') as {
                            foldedRanges: (state: unknown) => {
                                iter: () => { from: number; to: number; done: boolean; next: () => void };
                            };
                        };
                        const cm6View = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as { state: unknown } | undefined;
                        if (!cm6View?.state) return { error: 'No CM6 state' };

                        const foldsBefore: Array<{ from: number; to: number }> = [];
                        const ib = lang.foldedRanges(cm6View.state).iter();
                        while (!ib.done) { foldsBefore.push({ from: ib.from, to: ib.to }); ib.next(); }

                        (
                            app as unknown as CommandsApi
                        ).commands.executeCommandById(cmdId);
                        await new Promise((r) => setTimeout(r, 500));

                        const foldsAfter: Array<{ from: number; to: number }> = [];
                        const ia = lang.foldedRanges(cm6View.state).iter();
                        while (!ia.done) { foldsAfter.push({ from: ia.from, to: ia.to }); ia.next(); }

                        return {
                            command: cmdId,
                            foldsBefore,
                            foldsAfter,
                            foldCountDelta:
                                foldsAfter.length - foldsBefore.length,
                            mutatesCM6State:
                                JSON.stringify(foldsBefore) !==
                                JSON.stringify(foldsAfter),
                        };
                    },
                    content,
                    cmd,
                    cursorLine,
                )) as Record<string, unknown>;

                console.log(
                    `${cmd} CM6 state:`,
                    JSON.stringify(result, null, 2),
                );
                expect(result).not.toHaveProperty('error');
            });

            it(`${cmd} — cursor position impact (cursor on line 6)`, async function () {
                const content =
                    cmd === FOLD_PROPERTIES_CMD
                        ? FRONTMATTER_CONTENT
                        : HEADING_CONTENT;

                await setupEditor(content, { line: 6, ch: 0 });
                const cursorBefore = await getCursorPos();

                await browser.executeObsidian(
                    ({ app }, cmdId: string) => {
                        (
                            app as unknown as CommandsApi
                        ).commands.executeCommandById(cmdId);
                    },
                    cmd,
                );
                await browser.pause(PAUSE.EDITOR_SETTLE);

                const cursorAfter = await getCursorPos();
                console.log(`${cmd} cursor impact:`, {
                    cursorBefore,
                    cursorAfter,
                    lineDelta: cursorAfter.line - cursorBefore.line,
                    chDelta: cursorAfter.ch - cursorBefore.ch,
                    moved:
                        cursorBefore.line !== cursorAfter.line ||
                        cursorBefore.ch !== cursorAfter.ch,
                });
            });
        }
    });

    describe('8. CM6 fold state deep inspection', function () {
        it('foldedRanges before/after CM6 foldCode', async function () {
            const result = (await browser.executeObsidian(
                async (
                    { app, obsidian, require: req },
                    content: string,
                ) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(content);
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const lang = req('@codemirror/language') as {
                        foldedRanges: (state: unknown) => { iter: () => { from: number; to: number; done: boolean; next: () => void } };
                        foldCode: (view: unknown) => boolean;
                        unfoldCode: (view: unknown) => boolean;
                    };
                    const cm6View = (view.editor as unknown as Record<string, unknown>).cm as { state: unknown } | undefined;
                    if (!cm6View) return { error: 'No CM6 view' };

                    const foldsBefore: Array<{ from: number; to: number }> = [];
                    const ib = lang.foldedRanges(cm6View.state).iter();
                    while (!ib.done) { foldsBefore.push({ from: ib.from, to: ib.to }); ib.next(); }

                    lang.foldCode(cm6View);
                    await new Promise((r) => setTimeout(r, 300));

                    const foldsAfter: Array<{ from: number; to: number }> = [];
                    const ia = lang.foldedRanges(cm6View.state).iter();
                    while (!ia.done) { foldsAfter.push({ from: ia.from, to: ia.to }); ia.next(); }

                    lang.unfoldCode(cm6View);

                    return { foldsBefore, foldsAfter, foldCreated: foldsAfter.length > foldsBefore.length };
                },
                HEADING_CONTENT,
            )) as Record<string, unknown>;

            console.log('CM6 foldCode state:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });

        it('CM6 foldAll vs Obsidian editor:fold-all — state comparison', async function () {
            const result = (await browser.executeObsidian(
                async (
                    { app, obsidian, require: req },
                    content: string,
                ) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view) return { error: 'No view' };

                    const lang = req('@codemirror/language') as {
                        foldedRanges: (state: unknown) => { iter: () => { from: number; to: number; done: boolean; next: () => void } };
                        foldAll: (view: unknown) => boolean;
                        unfoldAll: (view: unknown) => boolean;
                    };
                    const cm6View = (view.editor as unknown as Record<string, unknown>).cm as { state: unknown } | undefined;
                    if (!cm6View) return { error: 'No CM6 view' };

                    view.editor.setValue(content);
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    lang.foldAll(cm6View);
                    await new Promise((r) => setTimeout(r, 300));
                    const cm6Folds: Array<{ from: number; to: number }> = [];
                    const i1 = lang.foldedRanges(cm6View.state).iter();
                    while (!i1.done) { cm6Folds.push({ from: i1.from, to: i1.to }); i1.next(); }
                    lang.unfoldAll(cm6View);
                    await new Promise((r) => setTimeout(r, 300));

                    view.editor.setValue(content);
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    (app as unknown as { commands: { executeCommandById: (id: string) => boolean } }).commands.executeCommandById('editor:fold-all');
                    await new Promise((r) => setTimeout(r, 300));
                    const obsidianFolds: Array<{ from: number; to: number }> = [];
                    const i2 = lang.foldedRanges(cm6View.state).iter();
                    while (!i2.done) { obsidianFolds.push({ from: i2.from, to: i2.to }); i2.next(); }
                    lang.unfoldAll(cm6View);

                    return {
                        cm6FoldAllRanges: cm6Folds,
                        obsidianFoldAllRanges: obsidianFolds,
                        identical: JSON.stringify(cm6Folds) === JSON.stringify(obsidianFolds),
                        conclusion: JSON.stringify(cm6Folds) === JSON.stringify(obsidianFolds)
                            ? 'IDENTICAL — safe to migrate zM/zR to CM6'
                            : 'DIFFERENT — keep separate implementations',
                    };
                },
                HEADING_CONTENT,
            )) as Record<string, unknown>;

            console.log('CM6 vs Obsidian fold-all:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });
    });

    describe('9. Vim mode detection', function () {
        it('should report built-in vs bundled vim mode', async function () {
            const result = (await browser.executeObsidian(({ app }) => {
                const builtinVimEnabled = (
                    app as unknown as {
                        vault: { getConfig: (key: string) => unknown };
                    }
                ).vault.getConfig('vimMode');

                const hasCodeMirrorAdapter = !!(
                    window as unknown as { CodeMirrorAdapter?: unknown }
                ).CodeMirrorAdapter;

                return {
                    builtinVimEnabled,
                    hasCodeMirrorAdapter,
                    mode:
                        builtinVimEnabled === true
                            ? 'BUILT-IN vim'
                            : 'BUNDLED fork (built-in disabled)',
                };
            })) as Record<string, unknown>;

            console.log('Vim mode:', JSON.stringify(result, null, 2));
            expect(result).not.toHaveProperty('error');
        });
    });
});
