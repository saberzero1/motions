import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../../helpers';
describe('Spike 1: Text object API feasibility', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    it('should register a custom text object via defineMotion + mapCommand', async function () {
        const registered = await browser.executeObsidian(({ app }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => void>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No CodeMirrorAdapter.Vim' };

            Vim.defineMotion(
                'spikeTestBoldInner',
                (
                    cm: unknown,
                    head: { line: number; ch: number },
                    motionArgs: { textObjectInner?: boolean },
                ) => {
                    const adapter = cm as { getLine: (n: number) => string };
                    const line = adapter.getLine(head.line);
                    const beforeCursor = line.substring(0, head.ch);
                    const afterCursor = line.substring(head.ch);

                    const startMatch = beforeCursor.lastIndexOf('**');
                    const endMatch = afterCursor.indexOf('**');

                    if (startMatch === -1 || endMatch === -1) return head;

                    const innerStart = startMatch + 2;
                    const innerEnd = head.ch + endMatch;

                    if (motionArgs.textObjectInner) {
                        return [
                            { line: head.line, ch: innerStart },
                            { line: head.line, ch: innerEnd },
                        ];
                    }
                    return [
                        { line: head.line, ch: startMatch },
                        { line: head.line, ch: innerEnd + 2 },
                    ];
                },
            );

            Vim.mapCommand(
                'i*',
                'motion',
                'spikeTestBoldInner',
                { textObjectInner: true },
                {},
            );
            Vim.mapCommand(
                'a*',
                'motion',
                'spikeTestBoldInner',
                { textObjectInner: false },
                {},
            );

            return { success: true };
        });

        expect(registered).toHaveProperty('success', true);
    });

    it('should delete inside bold with di*', async function () {
        await obsidianPage.openFile('Welcome.md');

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **bold text** world');
            view.editor.setCursor(0, 10);
        });

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.focus();
        });
        await browser.pause(300);

        await sendVimEscape();
        await browser.pause(100);

        await browser.keys(['d', 'i', '*']);
        await browser.pause(300);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Hello **** world');
    });

    it('should select inside bold with vi*', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **bold text** world');
            view.editor.setCursor(0, 10);
            view.editor.focus();
        });
        await browser.pause(300);

        await sendVimEscape();
        await browser.pause(100);

        await browser.keys(['v', 'i', '*']);
        await browser.pause(300);

        const selection = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getSelection();
        });

        expect(selection).toContain('bold text');
    });

    it('should delete around bold with da*', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Hello **bold text** world');
            view.editor.setCursor(0, 10);
            view.editor.focus();
        });
        await browser.pause(300);

        await sendVimEscape();
        await browser.pause(100);

        await browser.keys(['d', 'a', '*']);
        await browser.pause(300);

        const content = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue();
        });

        expect(content).toBe('Hello  world');
    });

    after(async function () {
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => void>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            Vim.unmap('i*');
            Vim.unmap('a*');
        });
    });
});
