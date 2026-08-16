import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 1000, LONG: 2000 } as const;

async function ensureLivePreview(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = false;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.SETTLE * 2);
}

async function setupEditor(
    content: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, text: string, line: number, ch: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(text);
            view.editor.setCursor(line, ch);
            view.editor.focus();
        },
        content,
        cursor.line,
        cursor.ch,
    );
    await browser.pause(PAUSE.SETTLE);
}

/**
 * Spike: Footnote editor DOM discovery
 *
 * Goal: Understand Obsidian's footnote editor DOM structure so we can
 * write targeted e2e tests for issue #130 (Escape not closing footnote,
 * cursor issues in footnote editor).
 *
 * This spike:
 * 1. Inserts a footnote via Obsidian's core command
 * 2. Dumps the DOM tree to discover selectors
 * 3. Tests whether Escape propagates to close the footnote editor
 * 4. Checks cursor layer state inside the footnote editor
 */
describe('Spike: footnote editor discovery (#130)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('should discover footnote command availability', async function () {
        this.timeout(15000);

        const commands = (await browser.executeObsidian(({ app }) => {
            const allCommands = Object.keys(
                (
                    app as unknown as {
                        commands: { commands: Record<string, unknown> };
                    }
                ).commands.commands,
            );
            return allCommands
                .filter(
                    (cmd) =>
                        cmd.includes('footnote') ||
                        cmd.includes('foot') ||
                        cmd.includes('note:insert'),
                )
                .sort();
        })) as string[];

        console.log(
            '[SPIKE] Footnote-related commands:',
            JSON.stringify(commands),
        );

        // Also check if the footnote core plugin is enabled
        const corePluginState = (await browser.executeObsidian(({ app }) => {
            const internal = (
                app as unknown as {
                    internalPlugins?: {
                        plugins?: Record<
                            string,
                            { enabled?: boolean; instance?: unknown }
                        >;
                    };
                }
            ).internalPlugins;
            if (!internal?.plugins) return { found: false };
            const keys = Object.keys(internal.plugins).filter(
                (k) => k.includes('footnote') || k.includes('foot'),
            );
            return {
                found: keys.length > 0,
                keys,
                enabled: keys.map((k) => ({
                    key: k,
                    enabled: internal.plugins![k]?.enabled,
                })),
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] Footnote core plugin state:',
            JSON.stringify(corePluginState),
        );
    });

    it('should insert a footnote and dump the DOM', async function () {
        this.timeout(30000);

        await setupEditor(
            'Some text to test footnotes with.\nSecond line here.',
            { line: 0, ch: 10 },
        );
        await browser.pause(PAUSE.SETTLE);

        // Ensure we're in normal mode first
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, '<Esc>');
        });
        await browser.pause(PAUSE.SETTLE);

        // Try to insert footnote via command
        const insertResult = (await browser.executeObsidian(({ app }) => {
            const cmds = (
                app as unknown as {
                    commands: {
                        commands: Record<string, unknown>;
                        executeCommandById: (id: string) => boolean;
                    };
                }
            ).commands;

            // Try common command IDs
            const candidates = [
                'editor:insert-footnote',
                'editor:toggle-footnote',
                'obsidian:insert-footnote',
            ];

            for (const id of candidates) {
                if (cmds.commands[id]) {
                    const result = cmds.executeCommandById(id);
                    return { commandId: id, executed: result };
                }
            }

            // If none found, list all editor: commands for discovery
            const editorCmds = Object.keys(cmds.commands)
                .filter((k) => k.startsWith('editor:'))
                .sort();
            return {
                commandId: null,
                executed: false,
                editorCommands: editorCmds,
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] Insert footnote result:',
            JSON.stringify(insertResult),
        );

        await browser.pause(PAUSE.RENDER);

        // Dump the DOM tree to find footnote editor elements
        const domDump = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };

            const contentEl = (view as unknown as { contentEl: HTMLElement })
                .contentEl;

            // Look for potential footnote-related elements
            const selectors = [
                '.cm-embed-block',
                '.cm-footnote',
                '.footnote-editor',
                '.cm-hmd-footnote',
                '.cm-line[class*="footnote"]',
                '.metadata-input-longtext',
                '.popover',
                '.cm-tooltip',
                '.cm-panel',
                '.cm-editor:not(:first-child)',
                '[class*="footnote"]',
                '[data-footnote]',
                '[class*="foot"]',
                '.cm-widgetBuffer',
                '.cm-widget',
            ];

            const found: Record<string, number> = {};
            for (const sel of selectors) {
                try {
                    const els = contentEl.querySelectorAll(sel);
                    if (els.length > 0) found[sel] = els.length;
                } catch {
                    /* invalid selector */
                }
            }

            // Also check document-wide (footnote editor might be in a popover)
            const documentWide: Record<string, number> = {};
            const globalSelectors = [
                '.popover',
                '.popover-content',
                '.hover-popup',
                '.cm-editor',
                '.modal-container',
                '.footnote',
                '[class*="footnote"]',
                '[class*="foot"]',
                '.hover-editor',
            ];
            for (const sel of globalSelectors) {
                try {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) documentWide[sel] = els.length;
                } catch {
                    /* invalid selector */
                }
            }

            // Get the current editor content to see what the footnote insertion did
            const editorContent = view.editor.getValue();

            // Dump the active element info
            const activeEl = document.activeElement;
            const activeInfo = {
                tagName: activeEl?.tagName,
                className: activeEl?.className,
                id: (activeEl as HTMLElement)?.id,
                isContentEditable: (activeEl as HTMLElement)?.isContentEditable,
            };

            return {
                foundInContent: found,
                foundInDocument: documentWide,
                editorContent,
                activeElement: activeInfo,
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] DOM dump after footnote insert:',
            JSON.stringify(domDump, null, 2),
        );

        // Take a screenshot for visual inspection
        await browser
            .saveScreenshot('/tmp/opencode/spike-footnote-after-insert.png')
            .catch(() => {});
    });

    it('should check if footnote creates a nested CM6 editor', async function () {
        this.timeout(30000);

        // The previous test may have inserted a footnote already.
        // Set up fresh content with an existing footnote reference.
        await setupEditor(
            'Text with a footnote[^1] reference.\n\n[^1]: This is the footnote content.',
            { line: 0, ch: 20 },
        );
        await browser.pause(PAUSE.RENDER);

        // In Live Preview, Obsidian might render the footnote as an
        // interactive widget. Let's check.
        const footnoteState = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };

                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const editorView = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                    state?: { doc?: { toString: () => string } };
                };

                // Count all CM6 editors in the view
                const contentEl = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const allCmEditors = contentEl.querySelectorAll('.cm-editor');

                // Check for widgets that might contain editors
                const widgets = contentEl.querySelectorAll(
                    '.cm-embed-block, .cm-widget, .cm-widgetBuffer',
                );

                // Get all class names from the main editor's DOM for footnote hints
                const classesInEditor: string[] = [];
                editorView?.dom?.querySelectorAll('*').forEach((el) => {
                    const cls = (el as HTMLElement).className;
                    if (
                        typeof cls === 'string' &&
                        (cls.includes('foot') ||
                            cls.includes('fn') ||
                            cls.includes('ref'))
                    ) {
                        classesInEditor.push(cls);
                    }
                });

                // Check for any popovers or hover editors
                const popovers = document.querySelectorAll(
                    '.popover, .hover-popup, .hover-editor',
                );

                return {
                    cmEditorCount: allCmEditors.length,
                    widgetCount: widgets.length,
                    footnoteClasses: [...new Set(classesInEditor)],
                    popoverCount: popovers.length,
                    editorContent: view.editor.getValue(),
                };
            },
        )) as Record<string, unknown>;

        console.log(
            '[SPIKE] Footnote state with existing footnote:',
            JSON.stringify(footnoteState, null, 2),
        );

        // Now click on the footnote reference to see if it opens an editor
        // In Live Preview, clicking [^1] should open the footnote editor popover
        const clickResult = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };

                const contentEl = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;

                // Find footnote reference elements
                const fnRefs = contentEl.querySelectorAll(
                    '[class*="footnote"], .cm-hmd-footnote, .cm-footref, sup, [data-footnote-id]',
                );
                const refInfo = Array.from(fnRefs).map((el) => ({
                    tag: el.tagName,
                    class: (el as HTMLElement).className,
                    text: el.textContent,
                    dataset: Object.keys((el as HTMLElement).dataset || {}),
                }));

                // Try to click the first footnote reference
                if (fnRefs.length > 0) {
                    (fnRefs[0] as HTMLElement).click();
                }

                return {
                    footnoteRefCount: fnRefs.length,
                    refs: refInfo,
                };
            },
        )) as Record<string, unknown>;

        console.log(
            '[SPIKE] Click on footnote ref:',
            JSON.stringify(clickResult, null, 2),
        );

        await browser.pause(PAUSE.RENDER);

        // Check what appeared after clicking
        const afterClick = (await browser.executeObsidian(() => {
            const allCmEditors = document.querySelectorAll('.cm-editor');
            const popovers = document.querySelectorAll(
                '.popover, .hover-popup, .hover-editor',
            );
            const modals = document.querySelectorAll('.modal-container');

            // Deep DOM dump of any new popovers
            const popoverDump = Array.from(popovers).map((p) => ({
                class: (p as HTMLElement).className,
                childClasses: Array.from(p.children).map(
                    (c) => (c as HTMLElement).className,
                ),
                hasCmEditor: !!p.querySelector('.cm-editor'),
                html: (p as HTMLElement).innerHTML.slice(0, 500),
            }));

            // Find any new elements that appeared
            const activeEl = document.activeElement;

            return {
                cmEditorCount: allCmEditors.length,
                popoverCount: popovers.length,
                modalCount: modals.length,
                popoverDump,
                activeElement: {
                    tag: activeEl?.tagName,
                    class: activeEl?.className,
                    isContentEditable: (activeEl as HTMLElement)
                        ?.isContentEditable,
                },
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] After clicking footnote ref:',
            JSON.stringify(afterClick, null, 2),
        );

        await browser
            .saveScreenshot('/tmp/opencode/spike-footnote-after-click.png')
            .catch(() => {});
    });

    it('should test Escape behavior in footnote context', async function () {
        this.timeout(30000);

        // Set up content with footnote
        await setupEditor(
            'Text with footnote[^1] here.\n\n[^1]: Footnote content goes here.',
            { line: 0, ch: 0 },
        );
        await browser.pause(PAUSE.RENDER);

        // Move cursor to the footnote definition line
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(2, 6);
            view.editor.focus();
        });
        await browser.pause(PAUSE.SETTLE);

        // Check vim mode and cursor state at footnote definition
        const vimState = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };

            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const editorView = editMode?.cm as {
                dom?: HTMLElement;
                scrollDOM?: HTMLElement;
                cm?: Record<string, unknown>;
            };

            const vim = (
                editorView?.cm?.state as Record<string, unknown> | undefined
            )?.vim as Record<string, unknown> | undefined;

            // Check cursor layers
            const nativeLayers: Array<{
                display: string;
                children: number;
            }> = [];
            editorView?.scrollDOM
                ?.querySelectorAll('.cm-cursorLayer:not(.cm-vimCursorLayer)')
                .forEach((el) => {
                    const h = el as HTMLElement;
                    nativeLayers.push({
                        display: getComputedStyle(h).display,
                        children: h.children.length,
                    });
                });

            const vimLayer = editorView?.scrollDOM?.querySelector(
                '.cm-vimCursorLayer',
            ) as HTMLElement | null;

            // Check cursor suppression
            const cma = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        isCursorSuppressedForView?: (v: unknown) => boolean;
                    };
                }
            ).CodeMirrorAdapter;
            const suppressed = cma?.isCursorSuppressedForView
                ? cma.isCursorSuppressedForView(editorView)
                : null;

            return {
                mode: vim?.mode ?? 'unknown',
                insertMode: vim?.insertMode ?? false,
                cursor: view.editor.getCursor(),
                nativeLayers,
                vimLayerDisplay: vimLayer
                    ? getComputedStyle(vimLayer).display
                    : 'not found',
                vimLayerChildren: vimLayer?.children.length ?? 0,
                suppressed,
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] Vim state at footnote definition:',
            JSON.stringify(vimState, null, 2),
        );

        // Now press Escape and observe what happens
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);

        const afterEscape = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };

                return {
                    cursor: view.editor.getCursor(),
                    content: view.editor.getValue(),
                    hasFocus:
                        (
                            (
                                view as unknown as { contentEl: HTMLElement }
                            ).contentEl.querySelector(
                                '.cm-content',
                            ) as HTMLElement | null
                        )?.matches(':focus-within') ?? false,
                    activeElement: {
                        tag: document.activeElement?.tagName,
                        class: document.activeElement?.className,
                    },
                };
            },
        )) as Record<string, unknown>;

        console.log(
            '[SPIKE] After Escape at footnote:',
            JSON.stringify(afterEscape, null, 2),
        );

        await browser
            .saveScreenshot('/tmp/opencode/spike-footnote-after-escape.png')
            .catch(() => {});
    });

    it('should discover footnote popover structure via cursor navigation', async function () {
        this.timeout(30000);

        // In Live Preview, navigating the cursor onto a footnote reference
        // may trigger the footnote popover/editor. Let's try.
        await setupEditor(
            'First line\nText with footnote[^1] here.\n\n[^1]: This is the footnote.',
            { line: 1, ch: 0 },
        );
        await browser.pause(PAUSE.RENDER);

        // Ensure normal mode
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            Vim.handleKey(cm?.cm, '<Esc>');
        });
        await browser.pause(PAUSE.SETTLE);

        // Navigate cursor onto the footnote reference [^1]
        // Move right to reach the footnote ref
        for (let i = 0; i < 19; i++) {
            await browser.keys(['l']);
            await browser.pause(30);
        }
        await browser.pause(PAUSE.RENDER);

        // Check what's at the cursor position now
        const atFootnoteRef = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };

                const cursor = view.editor.getCursor();
                const lineText = view.editor.getLine(cursor.line);

                // Check for popovers
                const popovers = document.querySelectorAll(
                    '.popover, .hover-popup, .hover-editor',
                );

                // Check for any new CM6 editors
                const contentEl = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const cmEditors = contentEl.querySelectorAll('.cm-editor');

                return {
                    cursor,
                    lineText,
                    charAtCursor: lineText[cursor.ch] ?? 'EOL',
                    popoverCount: popovers.length,
                    cmEditorCount: cmEditors.length,
                };
            },
        )) as Record<string, unknown>;

        console.log(
            '[SPIKE] At footnote reference position:',
            JSON.stringify(atFootnoteRef, null, 2),
        );

        // Try pressing Enter or clicking to activate the footnote editor
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.RENDER);

        const afterEnter = (await browser.executeObsidian(() => {
            const popovers = document.querySelectorAll(
                '.popover, .hover-popup, .hover-editor',
            );
            const cmEditors = document.querySelectorAll('.cm-editor');
            const modals = document.querySelectorAll('.modal-container');

            // Dump all classes that contain 'foot' or 'fn' or 'ref' or 'popover'
            const allElements = document.querySelectorAll('*');
            const interestingClasses: string[] = [];
            allElements.forEach((el) => {
                const cls = (el as HTMLElement).className;
                if (
                    typeof cls === 'string' &&
                    (cls.includes('foot') ||
                        cls.includes('popover') ||
                        cls.includes('hover-editor'))
                ) {
                    interestingClasses.push(cls);
                }
            });

            return {
                popoverCount: popovers.length,
                cmEditorCount: cmEditors.length,
                modalCount: modals.length,
                interestingClasses: [...new Set(interestingClasses)],
                activeElement: {
                    tag: document.activeElement?.tagName,
                    class: document.activeElement?.className,
                },
            };
        })) as Record<string, unknown>;

        console.log(
            '[SPIKE] After Enter at footnote ref:',
            JSON.stringify(afterEnter, null, 2),
        );

        await browser
            .saveScreenshot('/tmp/opencode/spike-footnote-after-enter.png')
            .catch(() => {});
    });
});
