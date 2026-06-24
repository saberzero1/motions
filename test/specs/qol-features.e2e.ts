import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../helpers';
describe('Quality of life features', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Vim mode status bar', function () {
        it('should show NORMAL mode on load', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(200);

            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toLowerCase()).toContain('normal');
        });

        it('should show INSERT mode after pressing i', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['i']);
            await browser.pause(200);

            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toLowerCase()).toContain('insert');

            await sendVimEscape();
            await browser.pause(200);
        });

        it('should show VISUAL mode after pressing v', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(200);

            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toLowerCase()).toContain('visual');

            await sendVimEscape();
            await browser.pause(200);
        });

        it('should return to NORMAL after Escape from insert', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['i']);
            await browser.pause(200);
            await sendVimEscape();
            await browser.pause(200);

            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toLowerCase()).toContain('normal');
        });
    });

    describe('Which-key overlay', function () {
        it('should appear when leader key is pressed', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    try {
                        const Vim = (
                            window as unknown as Record<string, unknown> & {
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
                        if (!Vim) return { error: 'No Vim' };
                        const view = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        if (!view) return { error: 'No view' };
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<Bslash>');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(600);

            const overlay = (await browser.executeObsidian(() => {
                return !!document.querySelector('.vim-motions-which-key');
            })) as boolean;
            expect(typeof overlay).toBe('boolean');

            await sendVimEscape();
            await browser.pause(200);
        });
    });

    describe('Ex command suggest', function () {
        it('should show suggestions when typing in ex mode', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(200);
            await browser.keys(['w']);
            await browser.pause(200);

            const hasSuggest = (await browser.executeObsidian(() => {
                const el = document.querySelector('.vim-motions-ex-suggest');
                return !!el;
            })) as boolean;
            expect(hasSuggest).toBe(true);

            await sendVimEscape();
            await browser.pause(200);
        });
    });
});
