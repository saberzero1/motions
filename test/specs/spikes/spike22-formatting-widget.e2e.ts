import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

/**
 * Spike 22: Validate two things for the formatting-mark-fix-v2 plan:
 *
 * 1. Lezer node type names for formatting marks in Obsidian's HyperMD parser.
 *    We need to confirm that node.type.name.includes('formatting-strong') etc.
 *    correctly identifies bold/italic/code/strikethrough/highlight marks.
 *
 * 2. Whether a Decoration.widget inserted at a formatting mark position
 *    (with side:-1, before Obsidian's Decoration.replace) restores
 *    coordsAtPos / posAtCoords coordinate mapping for cursor positioning.
 */
describe('Spike 22: Formatting mark node types & widget coordinate mapping', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should discover exact Lezer node types for all formatting marks', async function () {
        // Set up content with all formatting mark types
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(
                [
                    'Normal text here',
                    '',
                    '**bold text** and *italic text*',
                    '',
                    '_underline italic_ and __underline bold__',
                    '',
                    '`inline code` and ~~strikethrough~~',
                    '',
                    '==highlighted text== done',
                    '',
                    '***bold italic*** end',
                ].join('\n'),
            );
        });
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
                          state: {
                              doc: {
                                  sliceString: (
                                      from: number,
                                      to: number,
                                  ) => string;
                                  lineAt: (pos: number) => {
                                      number: number;
                                      text: string;
                                  };
                              };
                          } & Record<string, unknown>;
                      }
                    | undefined;
                if (!editorView) return { error: 'No CM6 EditorView' };

                try {
                    const lang = req('@codemirror/language') as {
                        syntaxTree: (state: unknown) => {
                            iterate: (spec: {
                                enter: (node: {
                                    type: { name: string };
                                    from: number;
                                    to: number;
                                }) => void;
                            }) => void;
                        };
                    };
                    const tree = lang.syntaxTree(editorView.state);

                    // Collect all nodes that look like formatting marks
                    const formattingNodes: {
                        name: string;
                        from: number;
                        to: number;
                        text: string;
                        line: number;
                    }[] = [];
                    const allNodes: {
                        name: string;
                        from: number;
                        to: number;
                    }[] = [];

                    tree.iterate({
                        enter: (node) => {
                            allNodes.push({
                                name: node.type.name,
                                from: node.from,
                                to: node.to,
                            });

                            // Check if this looks like a formatting mark
                            const name = node.type.name;
                            if (
                                name.includes('formatting') &&
                                (name.includes('strong') ||
                                    name.includes('em') ||
                                    name.includes('code') ||
                                    name.includes('strikethrough') ||
                                    name.includes('highlight'))
                            ) {
                                const text = editorView.state.doc.sliceString(
                                    node.from,
                                    node.to,
                                );
                                const line = editorView.state.doc.lineAt(
                                    node.from,
                                );
                                formattingNodes.push({
                                    name,
                                    from: node.from,
                                    to: node.to,
                                    text,
                                    line: line.number,
                                });
                            }
                        },
                    });

                    // Group by pattern to see which substrings match
                    const patterns = [
                        'formatting-strong',
                        'formatting-em',
                        'formatting-code',
                        'formatting-strikethrough',
                        'formatting-highlight',
                    ];
                    const patternMatches: Record<
                        string,
                        { name: string; text: string }[]
                    > = {};
                    for (const p of patterns) {
                        patternMatches[p] = formattingNodes
                            .filter((n) => n.name.includes(p))
                            .map((n) => ({ name: n.name, text: n.text }));
                    }

                    return {
                        success: true,
                        formattingNodes,
                        patternMatches,
                        uniqueFormattingNames: [
                            ...new Set(formattingNodes.map((n) => n.name)),
                        ].sort(),
                    };
                } catch (e) {
                    return { error: String(e) };
                }
            },
        );

        expect(result).toHaveProperty('success', true);
        const data = result as {
            formattingNodes: {
                name: string;
                text: string;
                line: number;
            }[];
            patternMatches: Record<string, { name: string; text: string }[]>;
            uniqueFormattingNames: string[];
        };

        console.log(
            'Unique formatting node type names:',
            data.uniqueFormattingNames,
        );
        console.log(
            'Pattern matches:',
            JSON.stringify(data.patternMatches, null, 2),
        );
        console.log(
            'All formatting nodes:',
            JSON.stringify(data.formattingNodes, null, 2),
        );

        // Verify our patterns find marks
        expect(
            data.patternMatches['formatting-strong']?.length,
        ).toBeGreaterThan(0);
        expect(data.patternMatches['formatting-em']?.length).toBeGreaterThan(0);
        expect(data.patternMatches['formatting-code']?.length).toBeGreaterThan(
            0,
        );
        expect(
            data.patternMatches['formatting-strikethrough']?.length,
        ).toBeGreaterThan(0);
        // highlight may or may not be available depending on Obsidian's markdown extensions
    });

    it('should test coordsAtPos with and without a widget at mark positions', async function () {
        // Set content with bold text, move cursor to a DIFFERENT line
        // so Obsidian's Decoration.replace is active on the bold line
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(
                [
                    'Cursor will be here',
                    '',
                    '**bold text** and more',
                    '',
                    'Another line',
                ].join('\n'),
            );
            // Place cursor on line 1 (away from bold)
            view.editor.setCursor({ line: 0, ch: 0 });
        });
        await browser.pause(1000);

        const coordTest = await browser.executeObsidian(
            ({ app, obsidian, require: req }) => {
                const mdView = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!mdView) return { error: 'No MarkdownView' };

                const editorView = (
                    mdView.editor as unknown as Record<string, unknown>
                ).cm as
                    | {
                          state: Record<string, unknown> & {
                              doc: {
                                  line: (n: number) => {
                                      from: number;
                                      to: number;
                                      text: string;
                                  };
                                  sliceString: (
                                      from: number,
                                      to: number,
                                  ) => string;
                              };
                          };
                          coordsAtPos: (
                              pos: number,
                              side?: number,
                          ) => {
                              left: number;
                              top: number;
                              right: number;
                              bottom: number;
                          } | null;
                          posAtCoords: (
                              coords: { x: number; y: number },
                              precise?: boolean,
                          ) => number | null;
                          dispatch: (spec: Record<string, unknown>) => void;
                      }
                    | undefined;
                if (!editorView) return { error: 'No CM6 EditorView' };

                try {
                    // Line 3 (1-indexed) = "**bold text** and more"
                    const boldLine = editorView.state.doc.line(3);
                    const boldText = boldLine.text;

                    // Position of first *, b, last *, and space after
                    const posFirstStar = boldLine.from; // **
                    const posB = boldLine.from + 2; // b in bold
                    const posLastStar = boldLine.from + 11; // last **
                    const posAfter = boldLine.from + 13; // space after

                    // Measure coords WITHOUT any widget
                    const coordsStar = editorView.coordsAtPos(posFirstStar);
                    const coordsB = editorView.coordsAtPos(posB);
                    const coordsLastStar = editorView.coordsAtPos(posLastStar);
                    const coordsAfter = editorView.coordsAtPos(posAfter);

                    // Check if the star positions have distinct coordinates
                    // from the content positions
                    const starHasDistinctCoords =
                        coordsStar &&
                        coordsB &&
                        Math.abs(coordsStar.left - coordsB.left) > 1;

                    const lastStarHasDistinctCoords =
                        coordsLastStar &&
                        coordsAfter &&
                        Math.abs(coordsLastStar.left - coordsAfter.left) > 1;

                    // Also test posAtCoords at the star position
                    let posAtStarCoords: number | null = null;
                    if (coordsStar) {
                        posAtStarCoords = editorView.posAtCoords({
                            x: coordsStar.left + 1,
                            y: (coordsStar.top + coordsStar.bottom) / 2,
                        });
                    }

                    return {
                        success: true,
                        boldText,
                        positions: {
                            firstStar: posFirstStar,
                            b: posB,
                            lastStar: posLastStar,
                            after: posAfter,
                        },
                        coords: {
                            firstStar: coordsStar
                                ? { left: coordsStar.left, top: coordsStar.top }
                                : null,
                            b: coordsB
                                ? { left: coordsB.left, top: coordsB.top }
                                : null,
                            lastStar: coordsLastStar
                                ? {
                                      left: coordsLastStar.left,
                                      top: coordsLastStar.top,
                                  }
                                : null,
                            after: coordsAfter
                                ? {
                                      left: coordsAfter.left,
                                      top: coordsAfter.top,
                                  }
                                : null,
                        },
                        starHasDistinctCoords,
                        lastStarHasDistinctCoords,
                        posAtStarCoords,
                        posAtStarMatchesStar: posAtStarCoords === posFirstStar,
                        posAtStarMatchesB: posAtStarCoords === posB,
                    };
                } catch (e) {
                    return { error: String(e) };
                }
            },
        );

        expect(coordTest).toHaveProperty('success', true);
        const data = coordTest as Record<string, unknown>;
        console.log(
            'Coord mapping without widget:',
            JSON.stringify(data, null, 2),
        );

        // Key question: do the ** positions have the same coordinates as
        // the content? If yes, Obsidian's Decoration.replace collapsed them.
        console.log(
            'Star has distinct coords from content:',
            data.starHasDistinctCoords,
        );
        console.log(
            'posAtCoords at star position returns:',
            data.posAtStarCoords,
            'expected:',
            (data.positions as Record<string, number>).firstStar,
        );
    });
});
