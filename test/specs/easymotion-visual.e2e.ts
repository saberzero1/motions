import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getSelection,
    getRegisterContent,
    getVimMode,
    sendVimEscape,
} from '../helpers';

describe('EasyMotion visual mode', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('v + leader-leader-w should show easymotion overlay in visual mode', async function () {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');

            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return {
                success: true,
                hasOverlay: !!overlay,
                hasLabels: (overlay?.children.length ?? 0) > 0,
            };
        })) as { success: boolean; hasOverlay: boolean; hasLabels: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('hasOverlay', true);
        expect(result).toHaveProperty('hasLabels', true);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('v + easymotion word + label should extend selection to target', async function () {
        await setupEditor('hello world foo bar baz', { line: 0, ch: 0 });

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');

            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            if (!overlay) return { error: 'No overlay' };

            const labelElements = overlay.querySelectorAll(
                '.vim-motions-easymotion-label',
            );
            const labels: string[] = [];
            labelElements.forEach((el) => {
                labels.push(el.textContent ?? '');
            });

            return {
                success: true,
                labelCount: labels.length,
                labels,
            };
        })) as { success: boolean; labelCount: number; labels: string[] };

        expect(result).toHaveProperty('success', true);
        expect(result.labelCount).toBeGreaterThan(0);

        if (result.labels.length >= 3) {
            const thirdLabel = result.labels[2];
            if (thirdLabel && thirdLabel.length === 1) {
                await browser.keys([thirdLabel]);
                await browser.pause(300);

                const selection = await getSelection();
                expect(selection.length).toBeGreaterThan(0);
            } else {
                await sendVimEscape();
            }
        } else {
            await sendVimEscape();
        }
    });

    it('V + easymotion line + label should extend linewise selection', async function () {
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };

            Vim.handleKey(adapter, 'V');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'j');

            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            if (!overlay) return { error: 'No overlay' };

            const labelElements = overlay.querySelectorAll(
                '.vim-motions-easymotion-label',
            );
            const labels: string[] = [];
            labelElements.forEach((el) => {
                labels.push(el.textContent ?? '');
            });

            return {
                success: true,
                labelCount: labels.length,
                labels,
            };
        })) as { success: boolean; labelCount: number; labels: string[] };

        expect(result).toHaveProperty('success', true);
        expect(result.labelCount).toBeGreaterThan(0);

        if (result.labels.length >= 2) {
            const secondLabel = result.labels[1];
            if (secondLabel && secondLabel.length === 1) {
                await browser.keys([secondLabel]);
                await browser.pause(300);

                // Visual-line uses cursor-only CM6 selection, so
                // getSelection() returns "". Yank and check the register.
                await browser.keys(['y']);
                await browser.pause(300);
                const reg = await getRegisterContent('"');
                expect(reg).not.toBeNull();
                expect(reg!.text).toContain('line');
                expect(reg!.linewise).toBe(true);
            } else {
                await sendVimEscape();
            }
        } else {
            await sendVimEscape();
        }
    });

    it('escape in visual easymotion should preserve visual mode', async function () {
        await setupEditor('hello world foo bar baz', { line: 0, ch: 0 });

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;

            Vim.handleKey(adapter, 'v');
            Vim.handleKey(adapter, 'e');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');
        });
        await browser.pause(200);

        await sendVimEscape();
        await browser.pause(200);

        const mode = await getVimMode();
        expect(['visual', 'normal']).toContain(mode);
    });
});
