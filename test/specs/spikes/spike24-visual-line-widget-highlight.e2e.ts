import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getVimMode, sendVimEscape, PAUSE } from '../../helpers';

/**
 * Spike 24: Visual-line mode widget highlight investigation (#57)
 *
 * Problem: In visual-line mode (V), the linewiseVisualHighlight ViewPlugin
 * uses Decoration.line() to apply `.cm-vim-linewise-selection` to each
 * `.cm-line` element. When Obsidian replaces content with widgets
 * (MathJax $$, embeds, etc.), the `.cm-line` elements are removed from the
 * DOM and replaced by block-level widget elements. Decoration.line() has
 * no target for these lines, so the visual highlight disappears.
 *
 * Goal: Discover the DOM structure of all replaced widget types to find a
 * generic pattern for overlaying a visual-line highlight on widget blocks.
 *
 * Key questions:
 * 1. What DOM elements wrap replaced widgets? (cm-embed-block? cm-widget?)
 * 2. Do all replaced widgets share a common parent/class structure?
 * 3. Can we detect replaced ranges from the decorations facet?
 * 4. Does Decoration.widget({ block: true }) work as an overlay strategy?
 * 5. What is the CSS stacking context of widget blocks vs cm-line elements?
 */
describe('Spike 24: Visual-line widget highlight DOM investigation (#57)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('DOM structure of replaced widgets', function () {
        it('should discover DOM structure of block MathJax widget', async function () {
            // Content with MathJax block — cursor on line 0 (away from math)
            // so Obsidian renders the $$ block as a widget
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000); // let Live Preview render

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                                  facet: (facet: unknown) => unknown[];
                              };
                              contentDOM: HTMLElement;
                              domAtPos: (pos: number) => {
                                  node: Node;
                                  offset: number;
                              };
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    // Get the EditorView.decorations facet to find CM6's facet ref
                    const cmView = req('@codemirror/view') as {
                        EditorView: { decorations: unknown };
                        Decoration: unknown;
                    };

                    try {
                        // 1. Scan contentDOM for all direct children and their classes
                        const contentChildren: {
                            tag: string;
                            classes: string[];
                            childCount: number;
                            textContent: string;
                            height: number;
                            hasWidget: boolean;
                        }[] = [];

                        for (const child of Array.from(
                            editorView.contentDOM.children,
                        )) {
                            const el = child as HTMLElement;
                            contentChildren.push({
                                tag: el.tagName,
                                classes: Array.from(el.classList),
                                childCount: el.children.length,
                                textContent: el.textContent?.slice(0, 80) ?? '',
                                height: el.getBoundingClientRect().height,
                                hasWidget:
                                    el.classList.contains('cm-embed-block') ||
                                    el.querySelector('.cm-embed-block') !==
                                        null ||
                                    el.classList.contains('cm-widgetBuffer') ||
                                    el.hasAttribute('data-widget'),
                            });
                        }

                        // 2. Look specifically for elements that are NOT .cm-line
                        const nonLineElements = contentChildren.filter(
                            (c) => !c.classes.includes('cm-line'),
                        );

                        // 3. Find all .cm-embed-block elements
                        const embedBlocks = Array.from(
                            editorView.contentDOM.querySelectorAll(
                                '.cm-embed-block',
                            ),
                        ).map((el) => {
                            const htmlEl = el as HTMLElement;
                            return {
                                tag: htmlEl.tagName,
                                classes: Array.from(htmlEl.classList),
                                parentTag: htmlEl.parentElement?.tagName ?? '',
                                parentClasses: Array.from(
                                    htmlEl.parentElement?.classList ?? [],
                                ),
                                isDirectChildOfContent:
                                    htmlEl.parentElement ===
                                    editorView.contentDOM,
                                height: htmlEl.getBoundingClientRect().height,
                                children: Array.from(htmlEl.children).map(
                                    (c) => ({
                                        tag: (c as HTMLElement).tagName,
                                        classes: Array.from(
                                            (c as HTMLElement).classList,
                                        ),
                                    }),
                                ),
                            };
                        });

                        // 4. Check decorations facet for replace decorations
                        const facetValue = editorView.state.facet(
                            cmView.EditorView.decorations,
                        );
                        const replaceDecorations: {
                            from: number;
                            to: number;
                            fromLine: number;
                            toLine: number;
                            isBlock: boolean;
                            isPoint: boolean;
                            widgetClass: string;
                            specKeys: string[];
                        }[] = [];

                        for (const source of facetValue) {
                            const set =
                                typeof source === 'function'
                                    ? source(editorView)
                                    : source;
                            if (!set || !set.between) continue;
                            set.between(
                                0,
                                editorView.state.doc.length,
                                (
                                    from: number,
                                    to: number,
                                    dec: Record<string, unknown>,
                                ) => {
                                    // Check if this is a replace or widget decoration
                                    const spec = dec.spec as
                                        | Record<string, unknown>
                                        | undefined;
                                    const isReplace =
                                        from !== to && dec.point !== true;
                                    const isPoint =
                                        (dec as unknown as { point: boolean })
                                            .point === true;
                                    const isBlock =
                                        spec?.block === true ||
                                        (dec as unknown as { block: boolean })
                                            .block === true;

                                    if (isReplace || isPoint || isBlock) {
                                        const widget = spec?.widget as
                                            | {
                                                  constructor: {
                                                      name: string;
                                                  };
                                              }
                                            | undefined;
                                        replaceDecorations.push({
                                            from,
                                            to,
                                            fromLine:
                                                editorView.state.doc.lineAt?.(
                                                    from,
                                                )?.number ?? -1,
                                            toLine:
                                                editorView.state.doc.lineAt?.(
                                                    to,
                                                )?.number ?? -1,
                                            isBlock,
                                            isPoint,
                                            widgetClass:
                                                widget?.constructor?.name ??
                                                'none',
                                            specKeys: Object.keys(spec ?? {}),
                                        });
                                    }
                                },
                            );
                        }

                        // 5. Check what document lines the MathJax $$ covers
                        const mathLines: { num: number; text: string }[] = [];
                        for (let i = 1; i <= editorView.state.doc.lines; i++) {
                            const line = editorView.state.doc.line(i);
                            mathLines.push({ num: i, text: line.text });
                        }

                        return {
                            success: true,
                            contentChildren,
                            nonLineElements,
                            embedBlocks,
                            replaceDecorations,
                            mathLines,
                            contentDOMChildCount:
                                editorView.contentDOM.children.length,
                            docLines: editorView.state.doc.lines,
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;

            console.log('\n=== DOM structure of contentDOM children ===');
            console.log(JSON.stringify(data.contentChildren, null, 2));

            console.log('\n=== Non-.cm-line elements ===');
            console.log(JSON.stringify(data.nonLineElements, null, 2));

            console.log('\n=== .cm-embed-block elements ===');
            console.log(JSON.stringify(data.embedBlocks, null, 2));

            console.log('\n=== Replace/Widget decorations ===');
            console.log(JSON.stringify(data.replaceDecorations, null, 2));

            console.log('\n=== Document lines ===');
            console.log(JSON.stringify(data.mathLines, null, 2));
            console.log(
                'Content DOM children:',
                data.contentDOMChildCount,
                'Doc lines:',
                data.docLines,
            );
        });

        it('should discover DOM structure of embedded note/image widget', async function () {
            // Content with an embed — ![[note]] syntax
            await setupEditor(
                ['line above', '![[Welcome]]', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              contentDOM: HTMLElement;
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                                  facet: (facet: unknown) => unknown[];
                              };
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const cmView = req('@codemirror/view') as {
                        EditorView: { decorations: unknown };
                    };

                    try {
                        const contentChildren = Array.from(
                            editorView.contentDOM.children,
                        ).map((child) => {
                            const el = child as HTMLElement;
                            return {
                                tag: el.tagName,
                                classes: Array.from(el.classList),
                                textSnippet: el.textContent?.slice(0, 60) ?? '',
                                height: el.getBoundingClientRect().height,
                            };
                        });

                        const nonLineElements = contentChildren.filter(
                            (c) => !c.classes.includes('cm-line'),
                        );

                        const embedBlocks = Array.from(
                            editorView.contentDOM.querySelectorAll(
                                '.cm-embed-block',
                            ),
                        ).map((el) => {
                            const htmlEl = el as HTMLElement;
                            return {
                                classes: Array.from(htmlEl.classList),
                                isDirectChild:
                                    htmlEl.parentElement ===
                                    editorView.contentDOM,
                                height: htmlEl.getBoundingClientRect().height,
                            };
                        });

                        return {
                            success: true,
                            contentChildren,
                            nonLineElements,
                            embedBlocks,
                        };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log('\n=== Embed widget DOM structure ===');
            console.log(JSON.stringify(data.contentChildren, null, 2));
            console.log('\n=== Non-.cm-line elements ===');
            console.log(JSON.stringify(data.nonLineElements, null, 2));
            console.log('\n=== .cm-embed-block elements ===');
            console.log(JSON.stringify(data.embedBlocks, null, 2));
        });

        it('should discover DOM structure of code block widget', async function () {
            await setupEditor(
                [
                    'line above',
                    '```javascript',
                    'const x = 42;',
                    '```',
                    'line below',
                ].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { contentDOM: HTMLElement } | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const contentChildren = Array.from(
                        editorView.contentDOM.children,
                    ).map((child) => {
                        const el = child as HTMLElement;
                        return {
                            tag: el.tagName,
                            classes: Array.from(el.classList),
                            textSnippet: el.textContent?.slice(0, 60) ?? '',
                            height: el.getBoundingClientRect().height,
                        };
                    });

                    const nonLineElements = contentChildren.filter(
                        (c) => !c.classes.includes('cm-line'),
                    );

                    return {
                        success: true,
                        contentChildren,
                        nonLineElements,
                    };
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log('\n=== Code block DOM structure ===');
            console.log(JSON.stringify(data.contentChildren, null, 2));
            console.log('\n=== Non-.cm-line elements ===');
            console.log(JSON.stringify(data.nonLineElements, null, 2));
        });
    });

    describe('Visual-line mode highlight behavior with widgets', function () {
        it('should check which .cm-line elements get the linewise-selection class during V mode over MathJax', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            // Enter visual-line mode and select all lines: V, 4j
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.KEY_GAP);
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const mode = await getVimMode();
            console.log('Vim mode after V+4j:', mode);
            expect(mode).toBe('visual');

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { contentDOM: HTMLElement } | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    // Check which elements have the linewise selection class
                    const allChildren = Array.from(
                        editorView.contentDOM.children,
                    ).map((child) => {
                        const el = child as HTMLElement;
                        return {
                            tag: el.tagName,
                            classes: Array.from(el.classList),
                            hasLinewiseHighlight: el.classList.contains(
                                'cm-vim-linewise-selection',
                            ),
                            isCmLine: el.classList.contains('cm-line'),
                            isEmbedBlock:
                                el.classList.contains('cm-embed-block'),
                            isWidgetBuffer:
                                el.classList.contains('cm-widgetBuffer'),
                            textSnippet: el.textContent?.slice(0, 40) ?? '',
                            height: el.getBoundingClientRect().height,
                        };
                    });

                    const highlightedCount = allChildren.filter(
                        (c) => c.hasLinewiseHighlight,
                    ).length;
                    const nonHighlightedNonLine = allChildren.filter(
                        (c) => !c.hasLinewiseHighlight && !c.isCmLine,
                    );
                    const cmLineCount = allChildren.filter(
                        (c) => c.isCmLine,
                    ).length;
                    const highlightedLineCount = allChildren.filter(
                        (c) => c.isCmLine && c.hasLinewiseHighlight,
                    ).length;

                    return {
                        success: true,
                        allChildren,
                        highlightedCount,
                        nonHighlightedNonLine,
                        cmLineCount,
                        highlightedLineCount,
                        totalChildren: allChildren.length,
                    };
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;

            console.log('\n=== Visual-line highlight status during V mode ===');
            console.log(JSON.stringify(data.allChildren, null, 2));
            console.log(
                '\nHighlighted:',
                data.highlightedCount,
                '/ Total:',
                data.totalChildren,
            );
            console.log(
                'cm-line elements:',
                data.cmLineCount,
                '/ Highlighted lines:',
                data.highlightedLineCount,
            );
            console.log(
                '\nNon-highlighted, non-cm-line elements:',
                JSON.stringify(data.nonHighlightedNonLine, null, 2),
            );
        });

        it('should inspect replaced decoration ranges vs document lines during V mode', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            // Enter visual-line mode: V, 4j
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.KEY_GAP);
            for (let i = 0; i < 4; i++) {
                await browser.keys(['j']);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      lineAt: (pos: number) => {
                                          number: number;
                                          from: number;
                                          to: number;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                                  facet: (facet: unknown) => unknown[];
                              };
                              contentDOM: HTMLElement;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const cmView = req('@codemirror/view') as {
                        EditorView: { decorations: unknown };
                    };

                    try {
                        const facetValue = editorView.state.facet(
                            cmView.EditorView.decorations,
                        );

                        // Find ALL decorations that span multiple lines
                        // (potential replace decorations that eat .cm-line elements)
                        const multiLineDecorations: {
                            from: number;
                            to: number;
                            fromLine: number;
                            toLine: number;
                            linesSpanned: number;
                            isPoint: boolean;
                            specKeys: string[];
                            widgetClass: string;
                            hasInclusive: boolean;
                        }[] = [];

                        for (const source of facetValue) {
                            const set =
                                typeof source === 'function'
                                    ? source(editorView)
                                    : source;
                            if (!set || !set.between) continue;
                            set.between(
                                0,
                                editorView.state.doc.length,
                                (
                                    from: number,
                                    to: number,
                                    dec: Record<string, unknown>,
                                ) => {
                                    const fromLine =
                                        editorView.state.doc.lineAt(from);
                                    const toLine =
                                        editorView.state.doc.lineAt(to);
                                    const linesSpanned =
                                        toLine.number - fromLine.number + 1;

                                    if (linesSpanned > 1 || from === to) {
                                        const spec = dec.spec as
                                            | Record<string, unknown>
                                            | undefined;
                                        const widget = spec?.widget as
                                            | {
                                                  constructor: {
                                                      name: string;
                                                  };
                                              }
                                            | undefined;
                                        multiLineDecorations.push({
                                            from,
                                            to,
                                            fromLine: fromLine.number,
                                            toLine: toLine.number,
                                            linesSpanned,
                                            isPoint: !!(
                                                dec as unknown as {
                                                    point: boolean;
                                                }
                                            ).point,
                                            specKeys: Object.keys(spec ?? {}),
                                            widgetClass:
                                                widget?.constructor?.name ??
                                                'none',
                                            hasInclusive:
                                                spec?.inclusive === true,
                                        });
                                    }
                                },
                            );
                        }

                        // Map document lines to their visual representation
                        const lineMapping: {
                            docLine: number;
                            text: string;
                            from: number;
                            to: number;
                            coveredByReplace: boolean;
                            replaceInfo: string;
                        }[] = [];

                        for (let i = 1; i <= editorView.state.doc.lines; i++) {
                            const line = editorView.state.doc.line(i);
                            const coveredBy = multiLineDecorations.find(
                                (d) =>
                                    !d.isPoint &&
                                    d.from <= line.from &&
                                    d.to >= line.to,
                            );
                            lineMapping.push({
                                docLine: i,
                                text: line.text,
                                from: line.from,
                                to: line.to,
                                coveredByReplace: !!coveredBy,
                                replaceInfo: coveredBy
                                    ? `lines ${coveredBy.fromLine}-${coveredBy.toLine} (${coveredBy.widgetClass})`
                                    : 'none',
                            });
                        }

                        return {
                            success: true,
                            multiLineDecorations,
                            lineMapping,
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;

            console.log(
                '\n=== Multi-line / point decorations in the document ===',
            );
            console.log(JSON.stringify(data.multiLineDecorations, null, 2));

            console.log('\n=== Document line → replace decoration mapping ===');
            console.log(JSON.stringify(data.lineMapping, null, 2));
        });

        it('should check if cm-widgetBuffer elements exist alongside replaced widgets', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { contentDOM: HTMLElement } | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    // Get ALL direct children with detailed info
                    const children = Array.from(
                        editorView.contentDOM.children,
                    ).map((child, idx) => {
                        const el = child as HTMLElement;
                        const rect = el.getBoundingClientRect();
                        return {
                            index: idx,
                            tag: el.tagName,
                            classes: Array.from(el.classList),
                            isCmLine: el.classList.contains('cm-line'),
                            isWidgetBuffer:
                                el.classList.contains('cm-widgetBuffer'),
                            isEmbedBlock:
                                el.classList.contains('cm-embed-block'),
                            isCmWidget: el.classList.contains('cm-widget'),
                            height: Math.round(rect.height),
                            width: Math.round(rect.width),
                            position: getComputedStyle(el).position,
                            display: getComputedStyle(el).display,
                            textSnippet: el.textContent?.slice(0, 50) ?? '',
                            // Check for data attributes
                            dataAttrs: Object.keys(el.dataset),
                            // Check first-level children structure
                            childTags: Array.from(el.children).map((c) => ({
                                tag: (c as HTMLElement).tagName,
                                classes: Array.from(
                                    (c as HTMLElement).classList,
                                ),
                            })),
                        };
                    });

                    return {
                        success: true,
                        children,
                        summary: {
                            total: children.length,
                            cmLines: children.filter((c) => c.isCmLine).length,
                            widgetBuffers: children.filter(
                                (c) => c.isWidgetBuffer,
                            ).length,
                            embedBlocks: children.filter((c) => c.isEmbedBlock)
                                .length,
                            cmWidgets: children.filter((c) => c.isCmWidget)
                                .length,
                            other: children.filter(
                                (c) =>
                                    !c.isCmLine &&
                                    !c.isWidgetBuffer &&
                                    !c.isEmbedBlock &&
                                    !c.isCmWidget,
                            ).length,
                        },
                    };
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;

            console.log('\n=== All contentDOM children (detailed) ===');
            console.log(JSON.stringify(data.children, null, 2));
            console.log('\n=== Summary ===');
            console.log(JSON.stringify(data.summary, null, 2));
        });
    });

    describe('Generic replaced-range detection strategy', function () {
        it('should test if EditorView.decorations facet provides all third-party decorations', async function () {
            // Test with multiple widget types in same document
            await setupEditor(
                [
                    'normal line',
                    '$$',
                    'x^2 + y^2 = z^2',
                    '$$',
                    'between widgets',
                    '```python',
                    'print("hello")',
                    '```',
                    'after code',
                ].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      lineAt: (pos: number) => {
                                          number: number;
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                                  facet: (facet: unknown) => unknown[];
                              };
                              contentDOM: HTMLElement;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const cmView = req('@codemirror/view') as {
                        EditorView: { decorations: unknown };
                    };

                    try {
                        const facetValue = editorView.state.facet(
                            cmView.EditorView.decorations,
                        );

                        // Count decoration sources
                        const sourceCount = facetValue.length;
                        const sourceSummary: {
                            index: number;
                            isFunction: boolean;
                            decorationCount: number;
                            replaceCount: number;
                        }[] = [];

                        for (let si = 0; si < facetValue.length; si++) {
                            const source = facetValue[si];
                            const set =
                                typeof source === 'function'
                                    ? source(editorView)
                                    : source;
                            if (!set || !set.between) {
                                sourceSummary.push({
                                    index: si,
                                    isFunction: typeof source === 'function',
                                    decorationCount: 0,
                                    replaceCount: 0,
                                });
                                continue;
                            }

                            let total = 0;
                            let replaces = 0;
                            set.between(
                                0,
                                editorView.state.doc.length,
                                (
                                    from: number,
                                    to: number,
                                    dec: Record<string, unknown>,
                                ) => {
                                    total++;
                                    // Replace decorations: from !== to and replaces content
                                    if (from !== to) {
                                        const fromLine =
                                            editorView.state.doc.lineAt(from);
                                        const toLine =
                                            editorView.state.doc.lineAt(to);
                                        if (
                                            toLine.number - fromLine.number >=
                                            1
                                        ) {
                                            replaces++;
                                        }
                                    }
                                },
                            );
                            sourceSummary.push({
                                index: si,
                                isFunction: typeof source === 'function',
                                decorationCount: total,
                                replaceCount: replaces,
                            });
                        }

                        // Collect ALL multi-line replace decorations
                        const allReplaces: {
                            fromLine: number;
                            toLine: number;
                            linesSpanned: number;
                            sourceIndex: number;
                        }[] = [];

                        for (let si = 0; si < facetValue.length; si++) {
                            const source = facetValue[si];
                            const set =
                                typeof source === 'function'
                                    ? source(editorView)
                                    : source;
                            if (!set || !set.between) continue;
                            set.between(
                                0,
                                editorView.state.doc.length,
                                (from: number, to: number) => {
                                    if (from !== to) {
                                        const fromLine =
                                            editorView.state.doc.lineAt(from);
                                        const toLine =
                                            editorView.state.doc.lineAt(to);
                                        if (
                                            toLine.number - fromLine.number >=
                                            1
                                        ) {
                                            allReplaces.push({
                                                fromLine: fromLine.number,
                                                toLine: toLine.number,
                                                linesSpanned:
                                                    toLine.number -
                                                    fromLine.number +
                                                    1,
                                                sourceIndex: si,
                                            });
                                        }
                                    }
                                },
                            );
                        }

                        // DOM: count non-cm-line direct children
                        const domChildren = Array.from(
                            editorView.contentDOM.children,
                        ).map((child) => {
                            const el = child as HTMLElement;
                            return {
                                classes: Array.from(el.classList).join(' '),
                                isCmLine: el.classList.contains('cm-line'),
                            };
                        });

                        return {
                            success: true,
                            sourceCount,
                            sourceSummary,
                            allReplaces,
                            domChildren,
                            docLines: editorView.state.doc.lines,
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;

            console.log('\n=== Decoration facet sources ===');
            console.log(JSON.stringify(data.sourceSummary, null, 2));
            console.log('\n=== Multi-line replace decorations ===');
            console.log(JSON.stringify(data.allReplaces, null, 2));
            console.log('\n=== DOM children summary ===');
            console.log(JSON.stringify(data.domChildren, null, 2));
            console.log(
                'Decoration sources:',
                data.sourceCount,
                'Doc lines:',
                data.docLines,
            );
        });
    });

    describe('Spike A: Decoration.mark() on replace-decoration ranges', function () {
        it('should test if Decoration.mark() applies a class to replaced widget DOM', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                              };
                              contentDOM: HTMLElement;
                              dispatch: (spec: Record<string, unknown>) => void;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const cmState = req('@codemirror/state') as {
                        StateEffect: {
                            define: <T>() => {
                                of: (value: T) => unknown;
                            };
                        };
                        StateField: {
                            define: <T>(
                                config: Record<string, unknown>,
                            ) => unknown;
                        };
                    };
                    const cmView = req('@codemirror/view') as {
                        Decoration: {
                            mark: (spec: { class: string }) => unknown;
                            none: unknown;
                            set: (decorations: unknown[]) => unknown;
                        };
                        EditorView: {
                            decorations: unknown;
                        };
                    };

                    try {
                        // The MathJax block spans lines 2-4 (1-indexed)
                        // from = start of line 2, to = end of line 4
                        const from = editorView.state.doc.line(2).from;
                        const to = editorView.state.doc.line(4).to;

                        // Apply Decoration.mark() spanning the replace range
                        const mark = cmView.Decoration.mark({
                            class: 'spike-a-test-mark',
                        });
                        const decoSet = cmView.Decoration.set([
                            (
                                mark as {
                                    range: (
                                        from: number,
                                        to: number,
                                    ) => unknown;
                                }
                            ).range(from, to),
                        ]);

                        // Create a StateEffect to inject the decoration
                        const addEffect = cmState.StateEffect.define<unknown>();
                        const effect = addEffect.of(decoSet);

                        // Dispatch a transaction with the mark decoration
                        // using effects to add it
                        editorView.dispatch({
                            effects: [effect],
                        });

                        // Wait a tick for DOM to update
                        // Check if any element in contentDOM has the test class
                        const hasClass =
                            editorView.contentDOM.querySelector(
                                '.spike-a-test-mark',
                            );
                        const allWithClass = Array.from(
                            editorView.contentDOM.querySelectorAll(
                                '.spike-a-test-mark',
                            ),
                        ).map((el) => ({
                            tag: (el as HTMLElement).tagName,
                            classes: Array.from((el as HTMLElement).classList),
                            parentClasses: Array.from(
                                (el as HTMLElement).parentElement?.classList ??
                                    [],
                            ),
                        }));

                        // Also check the embed-block element itself
                        const embedBlock =
                            editorView.contentDOM.querySelector(
                                '.cm-embed-block',
                            );
                        const embedHasClass =
                            embedBlock?.classList.contains('spike-a-test-mark');

                        return {
                            success: true,
                            markApplied: !!hasClass,
                            elementsWithClass: allWithClass,
                            embedBlockHasClass: embedHasClass ?? false,
                            from,
                            to,
                            note: 'Decoration.mark() via StateEffect dispatch — checking if class appears on widget DOM',
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log(
                '\n=== Spike A: Decoration.mark() on replace range ===',
            );
            console.log('Mark class applied to any element:', data.markApplied);
            console.log(
                'Elements with class:',
                JSON.stringify(data.elementsWithClass, null, 2),
            );
            console.log('Embed block has class:', data.embedBlockHasClass);
            console.log('Range:', data.from, '-', data.to);
        });

        it('should test Decoration.mark() via a real ViewPlugin providing decorations', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                      };
                                      length: number;
                                  };
                              };
                              contentDOM: HTMLElement;
                              dispatch: (spec: Record<string, unknown>) => void;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    const cmView = req('@codemirror/view') as {
                        Decoration: {
                            mark: (spec: { class: string }) => unknown;
                            none: unknown;
                            set: (decorations: unknown[]) => unknown;
                        };
                    };
                    const cmState = req('@codemirror/state') as {
                        RangeSetBuilder: new () => {
                            add: (
                                from: number,
                                to: number,
                                value: unknown,
                            ) => void;
                            finish: () => unknown;
                        };
                    };

                    try {
                        const from = editorView.state.doc.line(2).from;
                        const to = editorView.state.doc.line(4).to;

                        // Build a mark decoration set using RangeSetBuilder
                        const builder = new cmState.RangeSetBuilder();
                        builder.add(
                            from,
                            to,
                            cmView.Decoration.mark({
                                class: 'spike-a-mark-v2',
                            }),
                        );
                        const decoSet = builder.finish();

                        // Force a DOM update by dispatching an empty transaction
                        editorView.dispatch({});

                        // Check DOM for the class
                        const hasClass =
                            !!editorView.contentDOM.querySelector(
                                '.spike-a-mark-v2',
                            );
                        const embedBlock =
                            editorView.contentDOM.querySelector(
                                '.cm-embed-block',
                            );

                        // Also try: directly check if any child of contentDOM has the mark
                        const allChildren = Array.from(
                            editorView.contentDOM.children,
                        ).map((child) => {
                            const el = child as HTMLElement;
                            return {
                                classes: Array.from(el.classList),
                                hasMarkClass:
                                    el.classList.contains('spike-a-mark-v2'),
                                // Deep search
                                deepHasMarkClass:
                                    !!el.querySelector('.spike-a-mark-v2'),
                            };
                        });

                        return {
                            success: true,
                            markApplied: hasClass,
                            embedBlockHasClass:
                                embedBlock?.classList.contains(
                                    'spike-a-mark-v2',
                                ) ?? false,
                            allChildren,
                            note: 'RangeSetBuilder mark — not yet provided to EditorView (marks only work when provided via facet/plugin)',
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log(
                '\n=== Spike A v2: RangeSetBuilder mark on replace range ===',
            );
            console.log('Mark class applied:', data.markApplied);
            console.log('Embed block has class:', data.embedBlockHasClass);
            console.log('Children:', JSON.stringify(data.allChildren, null, 2));
            console.log('Note:', data.note);
        });
    });

    describe('Spike C: view.posAtDOM() reliability on widget elements', function () {
        it('should test posAtDOM on MathJax widget container', async function () {
            await setupEditor(
                ['line above', '$$', 'E = mc^2', '$$', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      lineAt: (pos: number) => {
                                          number: number;
                                          from: number;
                                          to: number;
                                      };
                                      length: number;
                                      lines: number;
                                  };
                              };
                              contentDOM: HTMLElement;
                              posAtDOM: (node: Node, offset: number) => number;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    try {
                        // Expected: MathJax lines are doc lines 2-4 (1-indexed)
                        const expectedFrom = editorView.state.doc.line(2).from; // 11
                        const expectedTo = editorView.state.doc.line(4).to; // 25

                        const results: {
                            element: string;
                            classes: string[];
                            posAtDOM_0: number | null;
                            posAtDOM_childCount: number | null;
                            lineAt_start: number | null;
                            lineAt_end: number | null;
                            matchesExpected: boolean;
                            error?: string;
                        }[] = [];

                        for (const child of Array.from(
                            editorView.contentDOM.children,
                        )) {
                            const el = child as HTMLElement;
                            if (el.classList.contains('cm-line')) continue;
                            if (el.getBoundingClientRect().height === 0)
                                continue;

                            let posStart: number | null = null;
                            let posEnd: number | null = null;
                            let lineStart: number | null = null;
                            let lineEnd: number | null = null;
                            let error: string | undefined;

                            try {
                                posStart = editorView.posAtDOM(el, 0);
                                posEnd = editorView.posAtDOM(
                                    el,
                                    el.childNodes.length,
                                );
                                lineStart =
                                    editorView.state.doc.lineAt(
                                        posStart,
                                    ).number;
                                lineEnd =
                                    editorView.state.doc.lineAt(posEnd).number;
                            } catch (e) {
                                error = String(e);
                            }

                            results.push({
                                element: el.tagName,
                                classes: Array.from(el.classList),
                                posAtDOM_0: posStart,
                                posAtDOM_childCount: posEnd,
                                lineAt_start: lineStart,
                                lineAt_end: lineEnd,
                                matchesExpected:
                                    posStart === expectedFrom &&
                                    posEnd === expectedTo,
                                error,
                            });
                        }

                        return {
                            success: true,
                            expectedFrom,
                            expectedTo,
                            expectedLines: '2-4',
                            widgetResults: results,
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log('\n=== Spike C: posAtDOM on MathJax widget ===');
            console.log(
                'Expected range:',
                data.expectedFrom,
                '-',
                data.expectedTo,
                '(lines',
                data.expectedLines,
                ')',
            );
            console.log(
                'Widget results:',
                JSON.stringify(data.widgetResults, null, 2),
            );
        });

        it('should test posAtDOM on embed widget container', async function () {
            await setupEditor(
                ['line above', '![[Welcome]]', 'line below'].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(1000);

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown> & {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                          text: string;
                                      };
                                      lineAt: (pos: number) => {
                                          number: number;
                                      };
                                      lines: number;
                                  };
                              };
                              contentDOM: HTMLElement;
                              posAtDOM: (node: Node, offset: number) => number;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    try {
                        const expectedFrom = editorView.state.doc.line(2).from;
                        const expectedTo = editorView.state.doc.line(2).to;

                        const results: {
                            element: string;
                            classes: string[];
                            posAtDOM_0: number | null;
                            posAtDOM_childCount: number | null;
                            lineAt_start: number | null;
                            lineAt_end: number | null;
                            error?: string;
                        }[] = [];

                        for (const child of Array.from(
                            editorView.contentDOM.children,
                        )) {
                            const el = child as HTMLElement;
                            if (el.classList.contains('cm-line')) continue;
                            if (el.getBoundingClientRect().height === 0)
                                continue;

                            let posStart: number | null = null;
                            let posEnd: number | null = null;
                            let lineStart: number | null = null;
                            let lineEnd: number | null = null;
                            let error: string | undefined;

                            try {
                                posStart = editorView.posAtDOM(el, 0);
                                posEnd = editorView.posAtDOM(
                                    el,
                                    el.childNodes.length,
                                );
                                lineStart =
                                    editorView.state.doc.lineAt(
                                        posStart,
                                    ).number;
                                lineEnd =
                                    editorView.state.doc.lineAt(posEnd).number;
                            } catch (e) {
                                error = String(e);
                            }

                            results.push({
                                element: el.tagName,
                                classes: Array.from(el.classList),
                                posAtDOM_0: posStart,
                                posAtDOM_childCount: posEnd,
                                lineAt_start: lineStart,
                                lineAt_end: lineEnd,
                                error,
                            });
                        }

                        return {
                            success: true,
                            expectedFrom,
                            expectedTo,
                            widgetResults: results,
                        };
                    } catch (e) {
                        return { error: String(e), stack: (e as Error).stack };
                    }
                },
            );

            expect(result).toHaveProperty('success', true);
            const data = result as Record<string, unknown>;
            console.log('\n=== Spike C: posAtDOM on embed widget ===');
            console.log(
                'Expected range:',
                data.expectedFrom,
                '-',
                data.expectedTo,
            );
            console.log(
                'Widget results:',
                JSON.stringify(data.widgetResults, null, 2),
            );
        });
    });

    describe('Spike D: ViewPlugin update() trigger during visual-line j/k', function () {
        it('should verify update fires with selectionSet on each j/k in V mode', async function () {
            await setupEditor(
                [
                    'line one',
                    'line two',
                    'line three',
                    'line four',
                    'line five',
                ].join('\n'),
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            // Inject a tracking ViewPlugin to count update() calls
            const trackResult = await browser.executeObsidian(
                ({ app, obsidian, require: req }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: Record<string, unknown>;
                              dispatch: (spec: Record<string, unknown>) => void;
                          }
                        | undefined;
                    if (!editorView) return { error: 'No CM6 EditorView' };

                    // Store update counts on the window for later retrieval
                    const tracker = {
                        totalUpdates: 0,
                        selectionSetUpdates: 0,
                        docChangedUpdates: 0,
                        viewportChangedUpdates: 0,
                        updates: [] as {
                            selectionSet: boolean;
                            docChanged: boolean;
                            viewportChanged: boolean;
                        }[],
                    };
                    (
                        window as unknown as Record<string, unknown>
                    ).__spike_d_tracker = tracker;

                    const cmView = req('@codemirror/view') as {
                        ViewPlugin: {
                            fromClass: (
                                cls: new (view: unknown) => unknown,
                                spec?: Record<string, unknown>,
                            ) => unknown;
                        };
                        EditorView: {
                            updateListener: {
                                of: (
                                    fn: (update: {
                                        selectionSet: boolean;
                                        docChanged: boolean;
                                        viewportChanged: boolean;
                                    }) => void,
                                ) => unknown;
                            };
                        };
                    };

                    // Use updateListener — simpler than ViewPlugin for tracking
                    const listener = cmView.EditorView.updateListener.of(
                        (update) => {
                            tracker.totalUpdates++;
                            if (update.selectionSet)
                                tracker.selectionSetUpdates++;
                            if (update.docChanged) tracker.docChangedUpdates++;
                            if (update.viewportChanged)
                                tracker.viewportChangedUpdates++;
                            tracker.updates.push({
                                selectionSet: update.selectionSet,
                                docChanged: update.docChanged,
                                viewportChanged: update.viewportChanged,
                            });
                        },
                    );

                    // Dispatch the extension
                    editorView.dispatch({
                        effects: (
                            req('@codemirror/state') as {
                                StateEffect: {
                                    appendConfig: {
                                        of: (ext: unknown) => unknown;
                                    };
                                };
                            }
                        ).StateEffect.appendConfig.of(listener),
                    });

                    return { success: true };
                },
            );

            expect(trackResult).toHaveProperty('success', true);

            // Reset counter
            await browser.executeObsidian(() => {
                const tracker = (window as unknown as Record<string, unknown>)
                    .__spike_d_tracker as Record<string, unknown>;
                tracker.totalUpdates = 0;
                tracker.selectionSetUpdates = 0;
                tracker.docChangedUpdates = 0;
                tracker.viewportChangedUpdates = 0;
                (tracker.updates as unknown[]).length = 0;
            });

            // Enter visual-line mode: V
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['V']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Get counts after V
            const afterV = await browser.executeObsidian(() => {
                const t = (window as unknown as Record<string, unknown>)
                    .__spike_d_tracker as {
                    totalUpdates: number;
                    selectionSetUpdates: number;
                    updates: { selectionSet: boolean }[];
                };
                return {
                    total: t.totalUpdates,
                    selectionSet: t.selectionSetUpdates,
                    updates: t.updates.slice(),
                };
            });
            console.log('\n=== After V (enter visual-line) ===');
            console.log(
                'Total updates:',
                (afterV as Record<string, unknown>).total,
            );
            console.log(
                'selectionSet updates:',
                (afterV as Record<string, unknown>).selectionSet,
            );

            // Reset
            await browser.executeObsidian(() => {
                const t = (window as unknown as Record<string, unknown>)
                    .__spike_d_tracker as Record<string, unknown>;
                t.totalUpdates = 0;
                t.selectionSetUpdates = 0;
                (t.updates as unknown[]).length = 0;
            });

            // Press j three times
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const afterJJJ = await browser.executeObsidian(() => {
                const t = (window as unknown as Record<string, unknown>)
                    .__spike_d_tracker as {
                    totalUpdates: number;
                    selectionSetUpdates: number;
                    updates: { selectionSet: boolean }[];
                };
                return {
                    total: t.totalUpdates,
                    selectionSet: t.selectionSetUpdates,
                    updates: t.updates.slice(),
                };
            });
            console.log('\n=== After j j j (3 movements in V mode) ===');
            console.log(
                'Total updates:',
                (afterJJJ as Record<string, unknown>).total,
            );
            console.log(
                'selectionSet updates:',
                (afterJJJ as Record<string, unknown>).selectionSet,
            );
            console.log(
                'Updates:',
                JSON.stringify(
                    (afterJJJ as Record<string, unknown>).updates,
                    null,
                    2,
                ),
            );

            const selSetCount = (afterJJJ as { selectionSet: number })
                .selectionSet;
            console.log(
                '\nVerdict: selectionSet fires on j/k:',
                selSetCount >= 3
                    ? 'YES'
                    : 'NO (only ' + selSetCount + ' times for 3 j presses)',
            );

            // Expect at least 3 selectionSet updates for 3 j presses
            expect(selSetCount).toBeGreaterThanOrEqual(3);
        });
    });
});
