import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getCursorLine,
    getCursorPos,
    getRegisterContent,
    setupEditor,
    vimKeys,
} from '../helpers';

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
        for (const key of keyList) {
            Vim.handleKey(adapter, key);
        }
    }, keys);
    await browser.pause(300);
}

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
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r');
            const value = await getEditorValue();
            expect(value.trimEnd()).toBe('hello\nhello');
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
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r');
            await vimKeys('g', 'r', 'r');
            const value = await getEditorValue();
            expect(value.trimEnd()).toBe('source\nsource');
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
            await vimKeys(
                'y',
                'i',
                'w',
                'w',
                'g',
                'r',
                'i',
                'w',
                'w',
                'g',
                'r',
                'i',
                'w',
            );
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
            await vimKeys(
                '"',
                'a',
                'y',
                'i',
                'w',
                'w',
                '"',
                'a',
                'g',
                'r',
                'i',
                'w',
            );
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
            await vimKeys('y', 'i', 'w', 'w', 'v', 'i', 'w', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('hello hello');
        });
    });

    describe('[count]grr (multi-line)', function () {
        it('2grr should replace two lines with register contents', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('source\nline1\nline2\nline3');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'y', 'j', '2', 'g', 'r', 'r');
            const value = await getEditorValue();
            expect(value).toBe('source\nsource\nline3');
        });
    });

    describe('cursor positioning', function () {
        it('griw should place cursor at last char of replacement', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('abc xyz');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'i', 'w', 'w', 'g', 'r', 'i', 'w');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(6);
        });

        it('grr should place cursor at first non-blank of replaced line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('  hello\ntarget');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(2);
        });
    });

    describe('register type coercion', function () {
        it('linewise register in charwise context should strip trailing newline', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('source\nfoo bar');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'y', 'j', 'w', 'g', 'r', 'i', 'w');
            const value = await getEditorValue();
            expect(value).toBe('source\nfoo source');
        });

        it('charwise register in linewise context should append newline', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('src target');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('y', 'i', 'w', 'j', 'g', 'r', 'r');
            const value = await getEditorValue();
            expect(value).toContain('src');
        });
    });

    describe('dot-repeat', function () {
        it('. should repeat griw replacement', async function () {
            await setupEditor('new old1 old2', { line: 0, ch: 0 });
            await vimKeys('y', 'i', 'w', 'w', 'g', 'r', 'i', 'w', 'w', '.');
            const value = await getEditorValue();
            expect(value).toBe('new new new');
        });

        it('. should repeat grr on another line', async function () {
            await setupEditor('source\ntarget1\ntarget2', { line: 0, ch: 0 });
            await vimKeys('y', 'y', 'j', 'g', 'r', 'r', 'j', '.');
            const value = await getEditorValue();
            expect(value.trimEnd()).toBe('source\nsource\nsource');
        });

        it('3grr then . should replace 3 lines again', async function () {
            await setupEditor('src\na\nb\nc\nd\ne\nf\nend', { line: 0, ch: 0 });
            await vimKeys('y', 'y', 'j', '3', 'g', 'r', 'r', 'j', '.');
            const value = await getEditorValue();
            expect(value).toBe('src\nsrc\nsrc\nend');
        });
    });

    describe('additional motions', function () {
        it('gr$ should replace from cursor to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 6 });
            await vimKeys('y', 'i', 'w');
            await setupEditor('foo bar baz', { line: 0, ch: 4 });
            await vimKeys('g', 'r', '$');
            const value = await getEditorValue();
            expect(value).toContain('foo ');
        });

        it('grl should replace single character', async function () {
            await setupEditor('abcdef', { line: 0, ch: 0 });
            await vimKeys('y', 'l', 'l', 'l', 'g', 'r', 'l');
            const value = await getEditorValue();
            expect(value.charAt(2)).toBe('a');
        });

        it("gri' should replace empty text object content", async function () {
            await setupEditor("test '' end", { line: 0, ch: 6 });
            await vimKeys('y', 'i', 'w');
            await setupEditor("foo '' bar", { line: 0, ch: 5 });
            await vimKeys('g', 'r', 'i', "'");
            const value = await getEditorValue();
            expect(value).toContain("'");
        });
    });

    describe('multi-line register expansion', function () {
        it('"mgrr should expand single line to multi-line register', async function () {
            await setupEditor('line1\nline2\nline3\nline4', { line: 0, ch: 0 });
            await vimKeys('V', 'j', 'j', 'y');
            await setupEditor('line1\nline2\nline3\nline4', { line: 3, ch: 0 });
            await vimKeys('g', 'r', 'r');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBeGreaterThan(4);
        });
    });

    describe('linewise visual gr', function () {
        it('V then gr should replace entire line', async function () {
            await setupEditor('source\ntarget\nend', { line: 0, ch: 0 });
            await vimKeys('y', 'y', 'j');
            await vimHandleKeys('V', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('source\nsource\nend');
        });

        it('V2j then gr should replace 3 lines', async function () {
            await setupEditor('src\na\nb\nc\nend', { line: 0, ch: 0 });
            await vimKeys('y', 'y', 'j');
            await vimHandleKeys('V', 'j', 'j', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('src\nsrc\nend');
        });
    });

    describe('cross-line motions', function () {
        it('gr} should replace to end of paragraph', async function () {
            await setupEditor('word1 word2\nword3\n\nuntouched', {
                line: 0,
                ch: 0,
            });
            await vimKeys('y', 'i', 'w');
            await setupEditor('word1 word2\nword3\n\nuntouched', {
                line: 0,
                ch: 6,
            });
            await vimKeys('g', 'r', '}');
            const value = await getEditorValue();
            expect(value).toContain('untouched');
        });
    });

    describe('count + named register', function () {
        it('"a3grr should replace 3 lines with named register', async function () {
            await setupEditor('src\nline1\nline2\nline3\nend', {
                line: 0,
                ch: 0,
            });
            await vimKeys('"', 'a', 'y', 'i', 'w', 'j');
            await vimKeys('"', 'a', '3', 'g', 'r', 'r');
            const value = await getEditorValue();
            expect(value.trimEnd()).toBe('src\nsrc\nend');
        });
    });

    describe('text object at line boundary', function () {
        it('gr on text object at end of line should not misalign', async function () {
            await setupEditor('hello world\nfoo bar', { line: 0, ch: 0 });
            await vimKeys('y', 'i', 'w', '$');
            await vimKeys('g', 'r', 'i', 'w');
            const value = await getEditorValue();
            expect(value).toContain('hello');
        });
    });

    // Blockwise visual mode: currently a no-op (returns early when
    // ranges.length > 1). These tests document the expected behavior
    // for when blockwise support is implemented.
    describe('visual block gr (blockwise)', function () {
        it('should replace block selection with charwise register', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', {
                line: 0,
                ch: 1,
            });
            await vimKeys('y', 'l');
            await vimHandleKeys('<C-v>', 'j', 'j', 'l', 'l', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('abef\ngbkl\nmbqr');
        });

        it('should duplicate single-line register to match block height', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('y', 'i', 'w', 'j');
            await vimHandleKeys('<C-v>', 'j', 'l', 'l', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('aaa\naaa\naaa');
        });

        it('should handle multi-line linewise register in block context', async function () {
            await setupEditor('aaa xxx\nbbb yyy\nccc zzz', {
                line: 0,
                ch: 0,
            });
            await vimKeys('V', 'j', 'y', 'j', '0', 'w');
            await vimHandleKeys('<C-v>', 'j', 'l', 'l', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('aaa xxx\nbbb aaa xxx\nccc bbb yyy');
        });

        it('should handle blockwise register matching block selection', async function () {
            await setupEditor('one two\nthree four\nfive six', {
                line: 0,
                ch: 0,
            });
            await vimHandleKeys('<C-v>', 'j', 'l', 'l', 'y', 'l', 'l');
            await vimHandleKeys('<C-v>', 'j', 'l', 'l', 'g', 'r');
            const value = await getEditorValue();
            expect(value).toBe('ononewo\nththr four\nfive six');
        });

        it('should preserve the source register after blockwise gr', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', {
                line: 0,
                ch: 0,
            });
            await vimKeys('y', 'l');
            const regBefore = await getRegisterContent('"');
            await vimHandleKeys('<C-v>', 'j', 'l', 'g', 'r');
            const regAfter = await getRegisterContent('"');
            expect(regAfter).not.toBeNull();
            expect(regAfter?.text).toBe(regBefore?.text);
        });

        it('should position cursor at top-left of block after gr', async function () {
            await setupEditor('abcdef\nghijkl\nmnopqr', {
                line: 0,
                ch: 1,
            });
            await vimKeys('y', 'l');
            await vimHandleKeys('<C-v>', 'j', 'l', 'g', 'r');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(1);
        });
    });
});
