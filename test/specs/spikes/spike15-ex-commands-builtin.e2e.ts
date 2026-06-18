import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 15: Probe CM Vim built-in Ex commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    const commands = [
        { cmd: 'yank', input: 'one\ntwo\nthree', line: 1, desc: ':yank' },
        { cmd: 'put', input: 'hello', line: 0, desc: ':put (after yank)' },
        { cmd: '1,2copy3', input: 'a\nb\nc\nd', line: 0, desc: ':copy / :t' },
        { cmd: '1move3', input: 'a\nb\nc\nd', line: 0, desc: ':move' },
        { cmd: '1,2join', input: 'a\nb\nc', line: 0, desc: ':join' },
        { cmd: 'nohlsearch', input: 'test', line: 0, desc: ':nohlsearch' },
        { cmd: 'undo', input: 'test', line: 0, desc: ':undo' },
        { cmd: 'redo', input: 'test', line: 0, desc: ':redo' },
    ];

    for (const { cmd, input, line, desc } of commands) {
        it(`${desc} should not error`, async function () {
            const result = await browser.executeObsidian(
                (
                    { app, obsidian },
                    cmdStr: string,
                    content: string,
                    cursorLine: number,
                ) => {
                    try {
                        const Vim = (
                            window as unknown as Record<string, unknown> & {
                                CodeMirrorAdapter?: {
                                    Vim?: {
                                        handleEx: (
                                            cm: unknown,
                                            input: string,
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

                        view.editor.setValue(content);
                        view.editor.setCursor(cursorLine, 0);
                        view.editor.focus();

                        if (cmdStr === 'put') {
                            Vim.handleKey(adapter, 'y');
                            Vim.handleKey(adapter, 'y');
                        }

                        Vim.handleEx(adapter, cmdStr);
                        return { success: true, value: view.editor.getValue() };
                    } catch (e) {
                        return { error: String(e), cmd: cmdStr };
                    }
                },
                cmd,
                input,
                line,
            );

            // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
            console.log(`${desc}:`, JSON.stringify(result));

            if ((result as Record<string, unknown>).error) {
                // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
                console.log(
                    `  FAILED: ${(result as Record<string, unknown>).error}`,
                );
            }
            expect(result).toHaveProperty('success', true);
        });
    }
});
