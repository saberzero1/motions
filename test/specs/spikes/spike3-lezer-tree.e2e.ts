import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 3: Lezer syntax tree access from Vim callback', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should access the CM6 EditorView and CM5 adapter', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            const editorObj = view.editor as unknown as Record<string, unknown>;
            const cm6View = editorObj.cm as Record<string, unknown> | undefined;
            if (!cm6View) return { error: 'No editor.cm' };

            const cm5Adapter = cm6View.cm as
                | Record<string, unknown>
                | undefined;
            if (!cm5Adapter) return { error: 'No editor.cm.cm' };

            return {
                hasCm6View: typeof cm6View.state === 'object',
                hasCm5Adapter: typeof cm5Adapter.state === 'object',
                adapterHasCm6Back: typeof cm5Adapter.cm6 === 'object',
            };
        });

        expect(result).toHaveProperty('hasCm6View', true);
        expect(result).toHaveProperty('hasCm5Adapter', true);
        expect(result).toHaveProperty('adapterHasCm6Back', true);
    });

    it('should access the Lezer syntax tree via @codemirror/language', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(
                '# Heading 1\n\nSome **bold** text\n\n- list item\n- another',
            );
        });
        await browser.pause(500);

        const treeInfo = await browser.executeObsidian(
            ({ app, obsidian, require: req }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No MarkdownView' };

                const editorView = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as { state: Record<string, unknown> } | undefined;
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
                    const nodeTypes: string[] = [];
                    tree.iterate({
                        enter: (node) => {
                            nodeTypes.push(node.type.name);
                        },
                    });
                    return {
                        success: true,
                        nodeTypes: [...new Set(nodeTypes)].sort(),
                    };
                } catch (e) {
                    return { error: String(e) };
                }
            },
        );

        expect(treeInfo).toHaveProperty('success', true);
        const types = (treeInfo as { nodeTypes: string[] }).nodeTypes;
        console.log('Lezer node types found:', types);
        expect(types.some((t: string) => t.includes('header'))).toBe(true);
    });

    it('should find heading positions from the syntax tree', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(
                '# First\n\nParagraph\n\n## Second\n\nMore text\n\n### Third',
            );
        });
        await browser.pause(500);

        const headings = await browser.executeObsidian(
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
                                  lineAt: (pos: number) => { number: number };
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
                    const found: { type: string; line: number }[] = [];
                    tree.iterate({
                        enter: (node) => {
                            if (
                                node.type.name.includes('header') &&
                                !node.type.name.includes('formatting')
                            ) {
                                const lineInfo = editorView.state.doc.lineAt(
                                    node.from,
                                );
                                found.push({
                                    type: node.type.name,
                                    line: lineInfo.number,
                                });
                            }
                        },
                    });
                    return { success: true, headings: found };
                } catch (e) {
                    return { error: String(e) };
                }
            },
        );

        expect(headings).toHaveProperty('success', true);
        const found = (
            headings as { headings: { type: string; line: number }[] }
        ).headings;
        console.log('Headings found:', found);
        expect(found.length).toBeGreaterThanOrEqual(3);
    });
});
