import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, getCursorLine, vimKeys } from '../helpers';

describe('Hard-wrap operators (gq/gw)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('gq operator', function () {
        it('gqq should wrap a long line at textwidth', async function () {
            const longLine = 'word '.repeat(20).trim();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                expect(line.length).toBeLessThanOrEqual(80);
            }
        });

        it('gqq should not change a short line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Short line here');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            expect(await getEditorValue()).toBe('Short line here');
        });

        it('gq should preserve blockquote prefix on wrapped lines', async function () {
            const longQuote = '> ' + 'word '.repeat(20).trim();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                expect(line.startsWith('> ')).toBe(true);
            }
        });
    });

    describe('gw operator', function () {
        it('gw in visual line should wrap and keep cursor at original line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    'word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('V', 'g', 'w');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            const cursorLine = await getCursorLine();
            expect(cursorLine).toBe(0);
        });
    });

    describe('gq with list prefixes', function () {
        it('gqq should preserve bullet list prefix on wrapped lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '- word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines.slice(1)) {
                if (line.length > 0) {
                    expect(line.startsWith('  ')).toBe(true);
                }
            }
        });

        it('gqq should preserve numbered list prefix on wrapped lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '1. word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines.slice(1)) {
                if (line.length > 0) {
                    expect(line[0]).toBe(' ');
                }
            }
        });

        it('gqq should preserve nested blockquote+list prefix', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '> - word word word word word word word word word word word word word word word word word word word word',
                );
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                if (line.length > 0) {
                    expect(line.startsWith('> ')).toBe(true);
                }
            }
        });
    });

    describe('gq motion variants', function () {
        it('gqj should wrap current and next line together', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('short line one\nshort line two');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'j');
            const value = await getEditorValue();
            const lines = value.split('\n').filter((line) => line.length > 0);
            expect(lines.length).toBe(1);
        });

        it('gqip should reformat an entire paragraph', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('short.\nshort.\nshort.');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('g', 'q', 'i', 'p');
            const value = await getEditorValue();
            const lines = value.split('\n').filter((line) => line.length > 0);
            expect(lines.length).toBe(1);
        });
    });
});
