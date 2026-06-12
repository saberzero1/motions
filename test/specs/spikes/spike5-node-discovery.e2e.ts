import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 5: Discover all HyperMD node types for Markdown elements', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should discover node types for all Markdown elements', async function () {
        const content = [
            '# Heading 1',
            '## Heading 2',
            '### Heading 3',
            '',
            'Normal paragraph text.',
            '',
            '**bold text** and *italic text* and _underscore italic_.',
            '',
            '***bold italic*** and ~~strikethrough~~.',
            '',
            '`inline code` and ==highlight==.',
            '',
            '$inline math$ and $$block math$$.',
            '',
            '[markdown link](https://example.com) and [[wikilink]].',
            '',
            '![[embed]] and ![image](https://example.com/img.png).',
            '',
            '- bullet item 1',
            '- bullet item 2',
            '  - nested item',
            '',
            '1. ordered item 1',
            '2. ordered item 2',
            '',
            '> blockquote text',
            '> more blockquote',
            '',
            '> [!note] Callout title',
            '> Callout content',
            '',
            '```javascript',
            'const x = 1;',
            '```',
            '',
            '---',
            '',
            '| col1 | col2 |',
            '| ---- | ---- |',
            '| a    | b    |',
            '',
            '- [ ] task unchecked',
            '- [x] task checked',
            '',
            '#tag and #another-tag',
        ].join('\n');

        await obsidianPage.write('Welcome.md', content);
        await obsidianPage.openFile('Welcome.md');
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
                              doc: { length: number };
                          };
                      }
                    | undefined;
                if (!editorView) return { error: 'No CM6 EditorView' };

                const lang = req('@codemirror/language') as {
                    ensureSyntaxTree: (
                        state: unknown,
                        upto: number,
                        timeout: number,
                    ) => {
                        iterate: (spec: {
                            enter: (node: {
                                type: { name: string };
                                from: number;
                                to: number;
                            }) => void;
                        }) => void;
                    } | null;
                };

                const tree = lang.ensureSyntaxTree(
                    editorView.state,
                    editorView.state.doc.length,
                    5000,
                );
                if (!tree) return { error: 'Tree not ready' };

                const nodes: {
                    name: string;
                    from: number;
                    to: number;
                    text: string;
                }[] = [];
                const doc = editorView.state.doc as unknown as {
                    sliceString: (from: number, to: number) => string;
                };

                tree.iterate({
                    enter: (node) => {
                        const text = doc.sliceString(
                            node.from,
                            Math.min(node.to, node.from + 60),
                        );
                        nodes.push({
                            name: node.type.name,
                            from: node.from,
                            to: node.to,
                            text: text.replace(/\n/g, '\\n'),
                        });
                    },
                });

                const uniqueNames = [
                    ...new Set(nodes.map((n) => n.name)),
                ].sort();
                return { uniqueNames, nodes: nodes.slice(0, 100) };
            },
        );

        console.log(
            'Unique node types:',
            JSON.stringify(
                (result as Record<string, unknown>).uniqueNames,
                null,
                2,
            ),
        );
        console.log(
            'Sample nodes:',
            JSON.stringify((result as Record<string, unknown>).nodes, null, 2),
        );
        expect(result).toHaveProperty('uniqueNames');
    });
});
