import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getEditorValue, sendVimEscape } from '../../helpers';

async function vimHandleKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keyList: string[]) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm as Record<string, unknown> | undefined;
        if (!adapter) return;
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
        const vim = (
            (adapter as Record<string, unknown>).state as Record<
                string,
                unknown
            >
        )?.vim as Record<string, unknown> | undefined;
        for (const key of keyList) {
            if (
                vim?.insertMode &&
                key.length === 1 &&
                key >= ' ' &&
                key <= '~'
            ) {
                (
                    adapter as {
                        replaceSelection: (s: string) => void;
                    }
                ).replaceSelection(key);
            } else {
                Vim.handleKey(adapter, key);
            }
        }
    }, keys);
}

describe('Spike: Block visual insert (CTRL-V)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('Spike 1: Block insert feasibility', function () {
        it('diagnostic: check state after block I and after typing X', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            const diagnostics = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as
                        | Record<string, unknown>
                        | undefined;
                    if (!adapter) return { error: 'no adapter' };
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
                    if (!Vim) return { error: 'no Vim' };

                    const a = adapter as {
                        listSelections: () => unknown[];
                        isInMultiSelectMode?: () => boolean;
                        state: { vim: Record<string, unknown> };
                    };

                    Vim.handleKey(adapter, '<C-v>');
                    Vim.handleKey(adapter, 'j');
                    Vim.handleKey(adapter, 'j');
                    Vim.handleKey(adapter, 'I');

                    const afterI = {
                        selections: a.listSelections().length,
                        insertMode: a.state.vim.insertMode,
                        wasInVisualBlock: a.state.vim.wasInVisualBlock,
                        visualBlock: a.state.vim.visualBlock,
                        isMultiSelect: a.isInMultiSelectMode?.() ?? 'N/A',
                    };

                    Vim.handleKey(adapter, 'X');

                    const afterX = {
                        selections: a.listSelections().length,
                        wasInVisualBlock: a.state.vim.wasInVisualBlock,
                        isMultiSelect: a.isInMultiSelectMode?.() ?? 'N/A',
                        content:
                            (
                                adapter as { getValue?: () => string }
                            ).getValue?.() ?? 'N/A',
                    };

                    return { afterI, afterX };
                },
            )) as Record<string, unknown>;
            console.log(
                'Block insert diagnostics:',
                JSON.stringify(diagnostics, null, 2),
            );
            const afterI = diagnostics.afterI as Record<string, unknown>;
            expect(afterI.insertMode).toBe(true);
            expect(afterI.selections).toBe(3);
            expect(afterI.wasInVisualBlock).toBe(true);
        });

        it('CTRL-V jj I X Esc should insert X at column 0 on all 3 lines', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'X', '<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('Xabc\nXdef\nXghi');
        });

        it('CTRL-V jj A X Esc should append X after column 0 on all 3 lines', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'A', 'X', '<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('aXbc\ndXef\ngXhi');
        });
    });

    describe('Spike 2: Short lines in block insert', function () {
        it('CTRL-V block insert should skip lines shorter than block column', async function () {
            await setupEditor('abcdefgh\nab\nabcde', { line: 0, ch: 5 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'X', '<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('abcdeXfgh\nab\nabcdeX');
        });
    });

    describe('Spike 3: Block change operator', function () {
        it('CTRL-V jj l c XY Esc should change block on 3 lines', async function () {
            await setupEditor('abcd\nefgh\nijkl', { line: 0, ch: 1 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'l', 'c', 'X', 'Y', '<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('aXYd\neXYh\niXYl');
        });
    });

    describe('Spike 4: Real-time block insert UX', function () {
        it('typing after block I should show text on all lines before Esc', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'H', 'i');
            await browser.pause(300);

            const midState = await getEditorValue();
            expect(midState).toBe('Hiabc\nHidef\nHighi');

            await vimHandleKeys('<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('Hiabc\nHidef\nHighi');
        });
    });

    describe('Spike 5: Block insert dot-repeat', function () {
        it('. should repeat block insert on same number of lines', async function () {
            await setupEditor('abc\ndef\nghi\njkl\nmno\npqr', {
                line: 0,
                ch: 0,
            });
            await vimHandleKeys('<C-v>', 'j', 'j', 'I', 'X', '<Esc>');
            await browser.pause(300);

            await vimHandleKeys('j', 'j', 'j', '.');
            await browser.pause(300);

            expect(await getEditorValue()).toBe(
                'Xabc\nXdef\nXghi\nXjkl\nXmno\nXpqr',
            );
        });
    });

    describe('Phase 2: C in block visual', function () {
        it('CTRL-V jj C XY Esc should change to EOL on all lines (zero-width block)', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', { line: 0, ch: 2 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'C', 'X', 'Y', '<Esc>');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('abXY\nghXY\nmnXY');
        });
    });

    describe('Phase 2: ~ in block visual', function () {
        it('CTRL-V block case toggle should toggle case in block', async function () {
            await setupEditor('abcdef\nghijkl\nMNOPQR', { line: 0, ch: 1 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'l', 'l', '~');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('aBCDef\ngHIJkl\nMnopQR');
        });
    });

    describe('Phase 2: r in block visual', function () {
        it('CTRL-V block replace should replace chars in block', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', { line: 0, ch: 1 });
            await vimHandleKeys('<C-v>', 'j', 'j', 'l', 'l', 'r', 'X');
            await browser.pause(300);
            expect(await getEditorValue()).toBe('aXXXef\ngXXXkl\nmXXXqr');
        });
    });
});
