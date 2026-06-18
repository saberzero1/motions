import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';

describe('Normal mode — cursor motions (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('h / j / k / l', function () {
        it('h should move cursor left', async function () {
            await setupEditor('abcdef', { line: 0, ch: 3 });
            await vimKeys('h');
            expect((await getCursorPos()).ch).toBe(2);
        });

        it('l should move cursor right', async function () {
            await setupEditor('abcdef', { line: 0, ch: 1 });
            await vimKeys('l');
            expect((await getCursorPos()).ch).toBe(2);
        });

        it('j should move cursor down', async function () {
            await setupEditor('line1\nline2\nline3', { line: 0, ch: 0 });
            await vimKeys('j');
            expect((await getCursorPos()).line).toBe(1);
        });

        it('k should move cursor up', async function () {
            await setupEditor('line1\nline2\nline3', { line: 2, ch: 0 });
            await vimKeys('k');
            expect((await getCursorPos()).line).toBe(1);
        });

        it('3j should move 3 lines down', async function () {
            await setupEditor('a\nb\nc\nd\ne', { line: 0, ch: 0 });
            await vimKeys('3', 'j');
            expect((await getCursorPos()).line).toBe(3);
        });
    });

    describe('w / b / e / W / B / E / ge / gE', function () {
        it('w should move to next word start', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 0 });
            await vimKeys('w');
            expect((await getCursorPos()).ch).toBe(6);
        });

        it('b should move to previous word start', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 8 });
            await vimKeys('b');
            expect((await getCursorPos()).ch).toBe(6);
        });

        it('e should move to end of word', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 0 });
            await vimKeys('e');
            expect((await getCursorPos()).ch).toBe(4);
        });

        it('W should move to next WORD start', async function () {
            await setupEditor('hello-world foo', { line: 0, ch: 0 });
            await vimKeys('W');
            expect((await getCursorPos()).ch).toBe(12);
        });

        it('B should move to previous WORD start', async function () {
            await setupEditor('foo hello-world bar', { line: 0, ch: 15 });
            await vimKeys('B');
            expect((await getCursorPos()).ch).toBe(4);
        });

        it('E should move to end of WORD', async function () {
            await setupEditor('hello-world foo', { line: 0, ch: 0 });
            await vimKeys('E');
            expect((await getCursorPos()).ch).toBe(10);
        });

        it('ge should move to end of previous word', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 6 });
            await vimKeys('g', 'e');
            expect((await getCursorPos()).ch).toBe(4);
        });

        it('2w should move 2 words forward', async function () {
            await setupEditor('one two three four', { line: 0, ch: 0 });
            await vimKeys('2', 'w');
            expect((await getCursorPos()).ch).toBe(8);
        });
    });

    describe('0 / $ / ^ / _', function () {
        it('0 should move to first column', async function () {
            await setupEditor('  hello world', { line: 0, ch: 5 });
            await vimKeys('0');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('$ should move to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('$');
            expect((await getCursorPos()).ch).toBe(10);
        });

        it('^ should move to first non-blank', async function () {
            await setupEditor('   hello world', { line: 0, ch: 0 });
            await vimKeys('^');
            expect((await getCursorPos()).ch).toBe(3);
        });

        it('_ should move to first non-blank of Nth line below', async function () {
            await setupEditor('  one\n  two\n  three', { line: 0, ch: 0 });
            await vimKeys('_');
            expect((await getCursorPos()).ch).toBe(2);
        });
    });

    describe('+ / -', function () {
        it('+ should move to first non-blank of next line', async function () {
            await setupEditor('  one\n  two\n  three', { line: 0, ch: 0 });
            await vimKeys('+');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(2);
        });

        it('- should move to first non-blank of previous line', async function () {
            await setupEditor('  one\n  two\n  three', { line: 2, ch: 4 });
            await vimKeys('-');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(2);
        });
    });

    describe('G / gg / H / M / L', function () {
        it('G should move to last line', async function () {
            await setupEditor('one\ntwo\nthree\nfour\nfive', {
                line: 0,
                ch: 0,
            });
            await vimKeys('G');
            expect((await getCursorPos()).line).toBe(4);
        });

        it('gg should move to first line', async function () {
            await setupEditor('one\ntwo\nthree\nfour\nfive', {
                line: 4,
                ch: 0,
            });
            await vimKeys('g', 'g');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('3G should move to line 3', async function () {
            await setupEditor('one\ntwo\nthree\nfour\nfive', {
                line: 0,
                ch: 0,
            });
            await vimKeys('3', 'G');
            expect((await getCursorPos()).line).toBe(2);
        });
    });

    describe('H / M / L (screen-relative)', function () {
        const longContent = Array.from(
            { length: 100 },
            (_, i) => `line ${i + 1}`,
        ).join('\n');

        it('H should move cursor near top of visible area', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThan(50);
        });

        it('L should move cursor near bottom of visible area', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await vimKeys('L');
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThan(0);
        });

        it('M should move cursor between H and L', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await vimKeys('H');
            const hLine = (await getCursorPos()).line;
            await vimKeys('L');
            const lLine = (await getCursorPos()).line;
            await vimKeys('M');
            const mLine = (await getCursorPos()).line;
            expect(mLine).toBeGreaterThanOrEqual(hLine);
            expect(mLine).toBeLessThanOrEqual(lLine);
        });

        it('H < M < L ordering should hold', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await vimKeys('z', 'z');
            await vimKeys('H');
            const hLine = (await getCursorPos()).line;
            await vimKeys('M');
            const mLine = (await getCursorPos()).line;
            await vimKeys('L');
            const lLine = (await getCursorPos()).line;
            expect(hLine).toBeLessThanOrEqual(mLine);
            expect(mLine).toBeLessThanOrEqual(lLine);
        });
    });

    describe('| (bar)', function () {
        it('| should move to column 1', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('|');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('5| should move to column 5', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('5', '|');
            expect((await getCursorPos()).ch).toBe(4);
        });
    });
});
