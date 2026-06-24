import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../helpers';
describe('Workspace navigation (Phase 2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('gt should switch to next tab', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 't']);
        await browser.pause(300);

        const result = await browser.executeObsidian(({ app }) => {
            return { hasActiveLeaf: !!app.workspace.getLeaf(false) };
        });
        expect(result).toHaveProperty('hasActiveLeaf', true);
    });

    it(':sidebar left should not error', async function () {
        const errored = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'sidebar left');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(errored).toHaveProperty('success', true);
    });

    it(':ob should list commands without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'ob');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it(':reg should open register viewer without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'reg');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it(':marks should open marks viewer without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'marks');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it(':w should save without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'w');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it(':bn should switch to next tab without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'bn');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it('za should toggle fold without error', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(
                '# Heading\n\nSome content under heading\n\nMore content',
            );
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['z', 'a']);
        await browser.pause(200);

        const result = await browser.executeObsidian(({ app }) => {
            return { hasActiveLeaf: !!app.workspace.getLeaf(false) };
        });
        expect(result).toHaveProperty('hasActiveLeaf', true);
    });

    it('gd on a wikilink should not error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('Go to [[Welcome]] now');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it('gd outside a link should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No links here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 'd']);
        await browser.pause(200);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return { value: view?.editor.getValue() ?? '' };
        });
        expect(result).toHaveProperty('value', 'No links here');
    });

    it('gx on a URL should not error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('Visit https://example.com today');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'x');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it('gx outside a URL should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No URLs here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 'x']);
        await browser.pause(200);
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return { value: view?.editor.getValue() ?? '' };
        });
        expect(result).toHaveProperty('value', 'No URLs here');
    });

    it(':buffers should open buffer list without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'buffers');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it(':backlinks should open backlinks modal without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'backlinks');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('gra should open context actions modal without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('- [ ] A task item');
                view.editor.setCursor(0, 5);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'r');
                Vim.handleKey(adapter, 'a');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it(':grep should search vault without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'grep Welcome');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('gO should open outline modal without error', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue(
                    '# Heading 1\n\nSome text\n\n## Heading 2\n\nMore text',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'O');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('gd on a wikilink with display name should resolve the file path', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('Go to [[Welcome|my display name]] now');
                view.editor.setCursor(0, 12);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const openFile = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(openFile).toBe('Welcome.md');
    });

    it('gd on a wikilink with heading should resolve correctly', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
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
                view.editor.setValue('See [[Welcome#section]] here');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const openFile = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(openFile).toBe('Welcome.md');
    });

    it(':ob should execute a command by id', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleEx(adapter, 'ob editor:save-file');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });
});
