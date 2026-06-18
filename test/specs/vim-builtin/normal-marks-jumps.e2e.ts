import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';

describe('Normal mode — marks and jumps (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

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
    });
});
