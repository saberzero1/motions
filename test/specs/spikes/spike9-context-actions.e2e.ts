import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 9: Context-aware Obsidian commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should discover available Obsidian commands related to editing', async function () {
        const result = await browser.executeObsidian(({ app }) => {
            const commands = (
                app as unknown as {
                    commands: {
                        commands: Record<string, { id: string; name: string }>;
                    };
                }
            ).commands.commands;

            const editorCommands = Object.values(commands)
                .filter(
                    (cmd) =>
                        cmd.id.startsWith('editor:') ||
                        cmd.name.toLowerCase().includes('fold') ||
                        cmd.name.toLowerCase().includes('heading') ||
                        cmd.name.toLowerCase().includes('list') ||
                        cmd.name.toLowerCase().includes('table') ||
                        cmd.name.toLowerCase().includes('checkbox') ||
                        cmd.name.toLowerCase().includes('callout') ||
                        cmd.name.toLowerCase().includes('template') ||
                        cmd.name.toLowerCase().includes('format'),
                )
                .map((cmd) => ({ id: cmd.id, name: cmd.name }))
                .sort((a, b) => a.id.localeCompare(b.id));

            return {
                total: Object.keys(commands).length,
                editorCommands,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Context-aware commands:', JSON.stringify(result, null, 2));

        expect(result).toHaveProperty('total');
        expect(typeof result.total).toBe('number');
    });

    it('should detect cursor context (heading, list, table, code block)', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            const testCases = [
                { label: 'heading', text: '# My heading', line: 0 },
                {
                    label: 'list-item',
                    text: '- list item\n- second item',
                    line: 0,
                },
                {
                    label: 'checkbox',
                    text: '- [ ] unchecked task\n- [x] checked',
                    line: 0,
                },
                {
                    label: 'table',
                    text: '| A | B |\n|---|---|\n| 1 | 2 |',
                    line: 0,
                },
                {
                    label: 'code-block',
                    text: '```js\nconst x = 1;\n```',
                    line: 1,
                },
                {
                    label: 'callout',
                    text: '> [!note] Title\n> Content',
                    line: 0,
                },
                { label: 'plain', text: 'Just some plain text', line: 0 },
            ];

            const results: Record<string, unknown> = {};
            for (const tc of testCases) {
                view.editor.setValue(tc.text);
                view.editor.setCursor(tc.line, 0);
                const lineText = view.editor.getLine(tc.line);

                const cache = view.file
                    ? app.metadataCache.getFileCache(view.file)
                    : null;

                results[tc.label] = {
                    lineText: lineText.slice(0, 60),
                    startsWithHash: /^#{1,6}\s/.test(lineText),
                    startsWithListMarker: /^\s*[-*+]\s/.test(lineText),
                    startsWithCheckbox: /^\s*-\s\[[ x]\]/.test(lineText),
                    startsWithPipe: /^\s*\|/.test(lineText),
                    startsWithQuote: /^\s*>/.test(lineText),
                    cacheHeadings: cache?.headings?.length ?? 0,
                    cacheSections: cache?.sections?.length ?? 0,
                };
            }

            return results;
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Context detection:', JSON.stringify(result, null, 2));

        expect(result).toHaveProperty('heading');
    });
});
