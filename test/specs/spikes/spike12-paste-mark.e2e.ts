import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 12: Paste mark and cursor position after paste', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should check if ] mark is set after paste', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                    }
                                >;
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('aaa bbb ccc');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'y');
            Vim.handleKey(adapter, 'w');

            Vim.handleKey(adapter, '$');
            const beforePaste = view.editor.getCursor();

            Vim.handleKey(adapter, 'p');
            const afterPaste = view.editor.getCursor();

            let markBracketPos = null;
            try {
                Vim.handleKey(adapter, "'");
                Vim.handleKey(adapter, ']');
                markBracketPos = {
                    line: view.editor.getCursor().line,
                    ch: view.editor.getCursor().ch,
                };
            } catch {
                markBracketPos = null;
            }

            const reg = Vim.getRegisterController().registers['"'];

            return {
                beforePaste: { line: beforePaste.line, ch: beforePaste.ch },
                afterPaste: { line: afterPaste.line, ch: afterPaste.ch },
                markBracketPos,
                registerText: reg?.toString() ?? null,
                editorValue: view.editor.getValue(),
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Paste mark result:', JSON.stringify(result, null, 2));

        expect(result).toHaveProperty('afterPaste');
    });

    it('should check cursor position after p for charwise yank', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                    }
                                >;
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('hello world');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'y');
            Vim.handleKey(adapter, 'w');

            const regText =
                Vim.getRegisterController().registers['"']?.toString() ?? '';
            const regLen = regText.length;

            Vim.handleKey(adapter, '$');
            Vim.handleKey(adapter, 'p');

            const afterPaste = view.editor.getCursor();

            return {
                regText,
                regLen,
                afterPaste: { line: afterPaste.line, ch: afterPaste.ch },
                editorValue: view.editor.getValue(),
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Charwise paste position:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('afterPaste');
    });
});
