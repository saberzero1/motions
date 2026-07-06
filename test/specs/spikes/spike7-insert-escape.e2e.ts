import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../../helpers';

async function getEditorValue(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
}

async function getVimMode(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 'unknown';
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm as Record<string, unknown> | undefined;
        const vimState = adapter?.state as Record<string, unknown> | undefined;
        const vim = vimState?.vim as Record<string, unknown> | undefined;
        return (vim?.mode as string) ?? 'unknown';
    })) as string;
}

async function getInsertMappings(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const w = window as unknown as Record<string, unknown>;
        const cma = w.CodeMirrorAdapter as
            | {
                  Vim?: {
                      getKeymap?: () => {
                          context?: string;
                          keys?: string;
                          toKeys?: string;
                      }[];
                  };
              }
            | undefined;
        if (!cma?.Vim?.getKeymap) return 'no Vim.getKeymap';
        const keymap = cma.Vim.getKeymap();
        const insertMaps = keymap
            .filter((m) => m.context === 'insert')
            .map((m) => `${m.keys} -> ${m.toKeys}`);
        return JSON.stringify(insertMaps);
    })) as string;
}

async function typeJkEscapeTest(): Promise<{
    value: string;
    mode: string;
}> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        view.editor.setValue('');
        view.editor.setCursor(0, 0);
        view.editor.focus();
    });
    await browser.pause(300);

    await sendVimEscape();
    await browser.pause(50);
    await browser.keys(['i']);
    await browser.pause(50);
    await browser.keys('hello'.split(''));
    await browser.pause(50);
    await browser.keys(['j']);
    await browser.pause(30);
    await browser.keys(['k']);
    await browser.pause(300);

    await browser.keys(['A']);
    await browser.pause(50);
    await browser.keys('world'.split(''));
    await sendVimEscape();
    await browser.pause(200);

    const value = await getEditorValue();
    const mode = await getVimMode();
    return { value, mode };
}

describe('Spike 7: Insert mode escape via jk', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
    });

    describe('A: direct vim.map() call (codemirror-vim engine)', function () {
        before(async function () {
            await browser.executeObsidian(() => {
                const w = window as unknown as Record<string, unknown>;
                const cma = w.CodeMirrorAdapter as
                    | {
                          Vim?: {
                              map?: (
                                  lhs: string,
                                  rhs: string,
                                  ctx: string,
                              ) => void;
                          };
                      }
                    | undefined;
                cma?.Vim?.map?.('jk', '<Esc>', 'insert');
            });
            await browser.pause(100);
        });

        after(async function () {
            await browser.executeObsidian(() => {
                const w = window as unknown as Record<string, unknown>;
                const cma = w.CodeMirrorAdapter as
                    | {
                          Vim?: {
                              unmap?: (lhs: string, ctx: string) => void;
                          };
                      }
                    | undefined;
                cma?.Vim?.unmap?.('jk', 'insert');
            });
        });

        it('jk via vim.map should exit insert mode cleanly', async function () {
            const mappings = await getInsertMappings();
            console.log('A: insert mappings:', mappings);

            const { value, mode } = await typeJkEscapeTest();
            console.log('A: result:', JSON.stringify({ value, mode }));

            expect(mode).toBe('normal');
            expect(value).toBe('helloworld');
        });
    });

    describe('B: insertmodeescape option (better-escape style)', function () {
        before(async function () {
            await browser.executeObsidian(() => {
                const w = window as unknown as Record<string, unknown>;
                const cma = w.CodeMirrorAdapter as
                    | {
                          Vim?: {
                              setOption?: (k: string, v: unknown) => void;
                          };
                      }
                    | undefined;
                cma?.Vim?.setOption?.('insertmodeescape', 'jk');
            });
            await browser.pause(100);
        });

        after(async function () {
            await browser.executeObsidian(() => {
                const w = window as unknown as Record<string, unknown>;
                const cma = w.CodeMirrorAdapter as
                    | {
                          Vim?: {
                              setOption?: (k: string, v: unknown) => void;
                          };
                      }
                    | undefined;
                cma?.Vim?.setOption?.('insertmodeescape', '');
            });
        });

        it('jk via insertmodeescape should exit insert mode cleanly', async function () {
            const { value, mode } = await typeJkEscapeTest();
            console.log('B: result:', JSON.stringify({ value, mode }));

            expect(mode).toBe('normal');
            expect(value).toBe('helloworld');
        });
    });

    describe('C: vimrc imap jk <Esc>', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.write('.obsidian.vimrc', 'imap jk <Esc>\n');
            await obsidianPage.openFile('Welcome.md');
            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    vimrcLoaded?: boolean;
                                    vimrcLoading?: boolean;
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin) {
                    plugin.vimrcLoaded = false;
                    plugin.vimrcLoading = false;
                }
            });
            await browser.executeObsidian(({ app }) => {
                app.workspace.trigger('active-leaf-change');
            });
            await browser.waitUntil(
                async () =>
                    (await browser.executeObsidian(({ app }) => {
                        const plugin = (
                            app as unknown as {
                                plugins: {
                                    plugins: Record<
                                        string,
                                        {
                                            vimrcLoaded?: boolean;
                                            vimrcCommandCount?: number;
                                        }
                                    >;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        return (
                            plugin?.vimrcLoaded === true &&
                            (plugin?.vimrcCommandCount ?? 0) > 0
                        );
                    })) as boolean,
                { timeout: 5000, interval: 100 },
            );
        });

        it('jk via vimrc imap should exit insert mode cleanly', async function () {
            const mappings = await getInsertMappings();
            console.log('C: insert mappings:', mappings);

            const { value, mode } = await typeJkEscapeTest();
            console.log('C: result:', JSON.stringify({ value, mode }));

            expect(mode).toBe('normal');
            expect(value).toBe('helloworld');
        });
    });
});
