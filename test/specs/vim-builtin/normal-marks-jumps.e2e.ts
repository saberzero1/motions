import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — marks and jumps (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'normal-marks-jumps');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('normal-marks-jumps', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe("m / ' / `", function () {
        it("ma should set mark a, 'a should jump to marked line", async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 2,
                ch: 3,
            });
            await vimKeys('m', 'a');
            await vimKeys('g', 'g');
            expect((await getCursorPos()).line).toBe(0);
            await vimKeys("'", 'a');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('`a should jump to exact mark position', async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 3,
                ch: 2,
            });
            await vimKeys('m', 'b');
            await vimKeys('g', 'g');
            await vimKeys('`', 'b');
            const pos = await getCursorPos();
            expect(pos.line).toBe(3);
            expect(pos.ch).toBe(2);
        });
    });

    describe('mark persistence after edit', function () {
        it('mark should update after inserting lines above', async function () {
            await setupEditor('line1\nline2\nline3', { line: 2, ch: 0 });
            await vimKeys('m', 'a');
            await vimKeys('g', 'g');
            await vimKeys('O');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            await vimKeys("'", 'a');
            const pos = await getCursorPos();
            expect(pos.line).toBe(3);
        });
    });

    describe("'. (jump to last change)", function () {
        it("'. should jump to line of last edit", async function () {
            await setupEditor('line1\nline2\nline3', { line: 2, ch: 0 });
            await vimKeys('x');
            await vimKeys('g', 'g');
            expect((await getCursorPos()).line).toBe(0);
            await vimKeys("'", '.');
            expect((await getCursorPos()).line).toBe(2);
        });
    });

    describe("'' / `` (jump back)", function () {
        it("'' should jump to line before last jump", async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 0,
                ch: 0,
            });
            await vimKeys('G');
            expect((await getCursorPos()).line).toBe(4);
            await vimKeys("'", "'");
            expect((await getCursorPos()).line).toBe(0);
        });

        it('`` should jump to exact position before last jump', async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 1,
                ch: 3,
            });
            await vimKeys('G');
            await vimKeys('`', '`');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(3);
        });
    });

    describe('CTRL-O / CTRL-I (jump list)', function () {
        it('CTRL-O should jump to older position in jump list', async function () {
            await setupEditor('line1\nline2\nline3\nline4\nline5', {
                line: 0,
                ch: 0,
            });
            await vimKeys('G');
            expect((await getCursorPos()).line).toBe(4);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-o>');
            });
            await browser.pause(300);
            expect((await getCursorPos()).line).toBe(0);
        });
    });

    describe('{ / } (paragraph motion)', function () {
        it('} should move to next empty line', async function () {
            await setupEditor('line1\nline2\n\nline4\nline5', {
                line: 0,
                ch: 0,
            });
            await vimKeys('}');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('{ should move to previous empty line', async function () {
            await setupEditor('line1\nline2\n\nline4\nline5', {
                line: 4,
                ch: 0,
            });
            await vimKeys('{');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('2} should move 2 paragraphs forward', async function () {
            await setupEditor('a\n\nb\n\nc', { line: 0, ch: 0 });
            await vimKeys('2', '}');
            expect((await getCursorPos()).line).toBe(3);
        });

        it('} at end of document should not move', async function () {
            await setupEditor('a\n\nb', { line: 2, ch: 0 });
            await vimKeys('}');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('{ at start of document should not move', async function () {
            await setupEditor('a\n\nb', { line: 0, ch: 0 });
            await vimKeys('{');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('} with count exceeding paragraphs should stop at end', async function () {
            await setupEditor('a\n\nb', { line: 0, ch: 0 });
            await vimKeys('1', '0', '}');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('2{ should move 2 paragraphs backward', async function () {
            await setupEditor('a\n\nb\n\nc', { line: 4, ch: 0 });
            await vimKeys('2', '{');
            expect((await getCursorPos()).line).toBe(1);
        });
    });

    describe('( / ) (sentence motion)', function () {
        it(') should move to next sentence', async function () {
            await setupEditor('First sentence. Second sentence. Third.', {
                line: 0,
                ch: 0,
            });
            await vimKeys(')');
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('( should move to previous sentence', async function () {
            await setupEditor('First sentence. Second sentence. Third.', {
                line: 0,
                ch: 35,
            });
            await vimKeys('(');
            const pos = await getCursorPos();
            expect(pos.ch).toBeLessThan(35);
        });

        // BUG: ) at end of sentence places cursor at ch=13 (on the period) instead of ch=14 (after it)
        it.skip(') at end of text should not move', async function () {
            await setupEditor('Only sentence.', { line: 0, ch: 14 });
            await vimKeys(')');
            expect((await getCursorPos()).ch).toBe(14);
        });

        it('2) should skip two sentences forward', async function () {
            await setupEditor('One. Two. Three. Four.', { line: 0, ch: 0 });
            await vimKeys('2', ')');
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(5);
        });
    });

    describe('% (match bracket)', function () {
        it('% should jump to matching bracket', async function () {
            await setupEditor('(hello world)', { line: 0, ch: 0 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(12);
        });

        it('% should jump back from closing bracket', async function () {
            await setupEditor('(hello world)', { line: 0, ch: 12 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('% should work with curly braces', async function () {
            await setupEditor('{ code }', { line: 0, ch: 0 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(7);
        });

        it('% should work with square brackets', async function () {
            await setupEditor('[items]', { line: 0, ch: 0 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(6);
        });

        it('% should work across lines', async function () {
            await setupEditor('(\nhello\n)', { line: 0, ch: 0 });
            await vimKeys('%');
            const pos = await getCursorPos();
            expect(pos.line).toBe(2);
            expect(pos.ch).toBe(0);
        });

        it('% with nested brackets should find correct match', async function () {
            await setupEditor('(a(b)c)', { line: 0, ch: 0 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(6);
        });

        it('% on inner bracket should match inner pair', async function () {
            await setupEditor('(a(b)c)', { line: 0, ch: 2 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(4);
        });

        it('% should not match bracket inside string', async function () {
            await setupEditor('x = ")" + foo()', { line: 0, ch: 0 });
            await vimKeys('%');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });

        it('% should still work on bracket not in string', async function () {
            await setupEditor('foo(bar)', { line: 0, ch: 3 });
            await vimKeys('%');
            expect((await getCursorPos()).ch).toBe(7);
        });
    });

    describe('gg with count', function () {
        it('5gg should move to line 5', async function () {
            await setupEditor('a\nb\nc\nd\ne\nf\ng', { line: 0, ch: 0 });
            await vimKeys('5', 'g', 'g');
            expect((await getCursorPos()).line).toBe(4);
        });

        it('gg with count beyond document should go to last line', async function () {
            await setupEditor('a\nb\nc', { line: 0, ch: 0 });
            await vimKeys('1', '0', '0', 'g', 'g');
            expect((await getCursorPos()).line).toBe(2);
        });

        it('1gg should go to first line', async function () {
            await setupEditor('a\nb\nc', { line: 2, ch: 0 });
            await vimKeys('1', 'g', 'g');
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
