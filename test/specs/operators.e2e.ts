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

    describe('gq in visual mode', function () {
        it('gq in visual line should wrap selected text', async function () {
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
            await vimKeys('V', 'g', 'q');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                expect(line.length).toBeLessThanOrEqual(80);
            }
        });

        it('gq in visual mode should not trigger macro recording', async function () {
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
            await vimKeys('V', 'g', 'q');
            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toUpperCase()).not.toContain('RECORDING');
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

    describe('gqq should not trigger macro recording', function () {
        it('gqq in normal mode should not leave macro recording state', async function () {
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
            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toUpperCase()).not.toContain('RECORDING');
        });
    });

    describe('standalone q macro recording', function () {
        it('q should start macro recording in normal mode', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('hello');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('q', 'a');
            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toUpperCase()).toContain('RECORDING');
            await vimKeys('q');
        });

        it('q should stop macro recording when already recording', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('hello');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('q', 'a');
            await browser.pause(100);
            await vimKeys('q');
            const modeText = (await browser.executeObsidian(() => {
                return (
                    document.querySelector('.vim-motions-mode')?.textContent ??
                    ''
                );
            })) as string;
            expect(modeText.toUpperCase()).not.toContain('RECORDING');
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

describe('Replace-with-register operator (gr)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('grr (linewise)', function () {
        it('grr should replace current line with yanked line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('hello\nworld');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank first line ('hello'), then move to second line and replace it
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r');
            const value = await getEditorValue();
            expect(value).toBe('hello\nhello');
        });

        it('grr should preserve the register after replacing', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('source\ntarget');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank first line, move to second line, replace it
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r');
            // Apply again: register should still contain 'source'
            await vimKeys('g', 'r', 'r');
            const value = await getEditorValue();
            // Both lines should now be 'source'
            expect(value).toBe('source\nsource');
        });
    });

    describe('griw (inner word)', function () {
        it('griw should replace inner word with register contents', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                // yank 'foo', then replace 'bar' with it
                view.editor.setValue('foo baz\nbar baz');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank 'foo' (inner word on line 1), move to line 2, replace 'bar'
            await vimKeys('y', 'i', 'w', 'j', '0', 'g', 'r', 'i', 'w');
            const value = await getEditorValue();
            expect(value).toBe('foo baz\nfoo baz');
        });

        it('griw should preserve the register after replacing', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('new old old');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank 'new', replace first 'old', then replace second 'old'
            await vimKeys('y', 'i', 'w', 'w', 'g', 'r', 'i', 'w', 'w', 'g', 'r', 'i', 'w');
            const value = await getEditorValue();
            expect(value).toBe('new new new');
        });
    });

    describe('gr with named register', function () {
        it('"agriw should replace inner word with register a contents', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('replacement target');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank 'replacement' into register a, move to 'target', replace it
            await vimKeys('"', 'a', 'y', 'i', 'w', 'w', '"', 'a', 'g', 'r', 'i', 'w');
            const value = await getEditorValue();
            expect(value).toBe('replacement replacement');
        });
    });

    describe('gr in visual mode', function () {
        it('visual gr should replace selection with register contents', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('hello world');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            // Yank 'hello', then visually select 'world' and replace
            await vimKeys('y', 'i', 'w', 'w', 'v', 'i', 'w', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('hello hello');
        });
    });
});
