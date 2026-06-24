import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../helpers';
describe('EasyMotion interaction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('leader-leader-w should show overlay with labels', async function () {
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

    it('Escape should dismiss EasyMotion overlay', async function () {
        const trigger = (await browser.executeObsidian(({ app, obsidian }) => {
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
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');
            const hasOverlay = !!activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return { success: true, hasOverlay };
        })) as { success: boolean; hasOverlay: boolean };
        expect(trigger).toHaveProperty('success', true);
        expect(trigger).toHaveProperty('hasOverlay', true);
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(200);
        const afterEscape = (await browser.executeObsidian(() => {
            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return {
                overlayGone: !overlay || overlay.children.length === 0,
            };
        })) as { overlayGone: boolean };
        expect(afterEscape).toHaveProperty('overlayGone', true);
    });

    it('leader-leader-j should show line labels', async function () {
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
            view.editor.setValue('line one\n\nline three\n\nline five');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'j');
            const hasOverlay = !!activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return { success: true, hasOverlay };
        })) as { success: boolean; hasOverlay: boolean };
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('hasOverlay', true);
        await sendVimEscape();
        await browser.pause(200);
    });

    it('leader-leader-f should prompt for char and show labels', async function () {
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
            view.editor.setValue('foo boo moo zoo');
            view.editor.setCursor(0, 0);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'f');
            Vim.handleKey(adapter, 'o');
            const hasOverlay = !!activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            return { success: true, hasOverlay };
        })) as { success: boolean; hasOverlay: boolean };
        expect(result).toHaveProperty('success', true);
        await sendVimEscape();
        await browser.pause(200);
    });
});
