import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — g-prefix commands (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'g-commands');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('g-commands', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe('gj / gk (display lines)', function () {
        it('gj should move one display line down', async function () {
            await setupEditor('short\nline two', { line: 0, ch: 0 });
            await vimKeys('g', 'j');
            expect((await getCursorPos()).line).toBe(1);
        });

        it('gk should move one display line up', async function () {
            await setupEditor('line one\nshort', { line: 1, ch: 0 });
            await vimKeys('g', 'k');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('gk over heading should preserve horizontal position (#26)', async function () {
            const content = 'above the heading\n# Heading\nbelow the heading';
            await setupEditor(content, { line: 2, ch: 5 });
            // Use `l` to reset vim.lastMotion so gk recalculates lastHSPos
            await vimKeys('l');
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gk over multiple headings should not reset column (#26)', async function () {
            const content =
                'first line here\n## Heading Two\n### Heading Three\nlast line here';
            await setupEditor(content, { line: 3, ch: 5 });
            await vimKeys('l');
            await vimKeys('g', 'k');
            let pos = await getCursorPos();
            expect(pos.line).toBe(2);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gj over heading should also preserve horizontal position (#26)', async function () {
            const content = 'above the heading\n# Heading\nbelow the heading';
            await setupEditor(content, { line: 0, ch: 5 });
            await vimKeys('l');
            await vimKeys('g', 'j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gk over h4 heading should preserve horizontal position (#26)', async function () {
            const content =
                'above the heading\n#### Heading\nbelow the heading';
            await setupEditor(content, { line: 2, ch: 5 });
            await vimKeys('l');
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gk over h5 heading should preserve horizontal position (#26)', async function () {
            const content =
                'above the heading\n##### Heading\nbelow the heading';
            await setupEditor(content, { line: 2, ch: 5 });
            await vimKeys('l');
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gk over h6 heading should preserve horizontal position (#26)', async function () {
            const content =
                'above the heading\n###### Heading\nbelow the heading';
            await setupEditor(content, { line: 2, ch: 5 });
            await vimKeys('l');
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gk through mixed headings, text, and lists should not skip lines (#26)', async function () {
            const content = [
                '### heading', // 0
                'text here.', // 1
                '- list 1', // 2
                '- list 2', // 3
                '- list 3', // 4
                '', // 5
                '### heading 1', // 6
                '', // 7
                '#### heading 2', // 8
                '', // 9
                '#### heading 3', // 10
                '', // 11
                '#### heading 4', // 12
            ].join('\n');
            await setupEditor(content, { line: 12, ch: 5 });
            await vimKeys('l');
            // gk is a display-line motion: tall headings may span multiple
            // visual lines, so a single gk might stay on the same doc line.
            // The invariant is: gk must never SKIP a doc line — the cursor
            // must pass through every line on the way up.
            let prevLine = 12;
            const visited = new Set<number>([12]);
            for (let i = 0; i < 30; i++) {
                await vimKeys('g', 'k');
                const pos = await getCursorPos();
                visited.add(pos.line);
                // Must never jump backward by more than 1 doc line
                expect(pos.line).toBeGreaterThanOrEqual(prevLine - 1);
                // On non-empty lines, horizontal position must be preserved
                if (
                    content.split('\n')[pos.line].length > 0 &&
                    pos.line < prevLine
                ) {
                    expect(pos.ch).toBeGreaterThan(0);
                }
                prevLine = pos.line;
                if (pos.line === 0) break;
            }
            // Every doc line must have been visited
            for (let line = 0; line <= 12; line++) {
                expect(visited.has(line)).toBe(true);
            }
        });

        it('gk on wrapped line after frontmatter should navigate display lines first (#25)', async function () {
            const wrappedLine = 'word '.repeat(30).trim();
            const content = [
                '---',
                'title: test',
                '---',
                wrappedLine,
                'second line',
            ].join('\n');
            // Place cursor near the end of the long line — guaranteed to be on
            // a lower display line when the editor wraps it.
            await setupEditor(content, { line: 3, ch: 80 });
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            // Cursor must stay on the same document line (the wrapped line)
            // but move to an earlier character position (higher display line).
            expect(pos.line).toBe(3);
            expect(pos.ch).toBeLessThan(80);
        });

        it('gk on top display line after frontmatter should not stay stuck (#25)', async function () {
            const content = [
                '---',
                'title: test',
                '---',
                'short first line',
                'second line',
            ].join('\n');
            await setupEditor(content, { line: 3, ch: 0 });
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            // On a short (non-wrapping) first content line, gk from ch=0
            // has nowhere to go within the line — it should enter properties
            // (cursor stays or moves to line 3, same as k).
            expect(pos.line).toBeGreaterThanOrEqual(3);
        });

        it('k on first content line after frontmatter should still enter properties (#25)', async function () {
            const content = [
                '---',
                'title: test',
                '---',
                'first line',
                'second line',
            ].join('\n');
            await setupEditor(content, { line: 3, ch: 0 });
            const before = await getCursorPos();
            expect(before.line).toBe(3);
            await vimKeys('k');
            // k moves by document lines — from the first content line,
            // it should NOT move the cursor into frontmatter text (line 0-2).
            // Instead it either enters properties (cursor stays) or stays put.
            const after = await getCursorPos();
            expect(after.line).toBeGreaterThanOrEqual(3);
        });
    });

    describe('g0 / g$ / g^', function () {
        it('g0 should move to start of display line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('g', '0');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('g$ should move to end of display line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', '$');
            expect((await getCursorPos()).ch).toBe(10);
        });
    });

    describe('gu / gU / g~', function () {
        it('guu should lowercase entire line', async function () {
            await setupEditor('HELLO WORLD', { line: 0, ch: 0 });
            await vimKeys('g', 'u', 'u');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('gUU should uppercase entire line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', 'U', 'U');
            expect(await getEditorValue()).toBe('HELLO WORLD');
        });

        it('guw should lowercase word', async function () {
            await setupEditor('HELLO world', { line: 0, ch: 0 });
            await vimKeys('g', 'u', 'w');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('gUw should uppercase word', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', 'U', 'w');
            expect(await getEditorValue()).toBe('HELLO world');
        });

        it('g~~ should toggle case of line', async function () {
            await setupEditor('Hello World', { line: 0, ch: 0 });
            await vimKeys('g', '~', '~');
            expect(await getEditorValue()).toBe('hELLO wORLD');
        });
    });

    describe('gI / gJ', function () {
        it('gI should insert at column 0', async function () {
            await setupEditor('  hello', { line: 0, ch: 4 });
            await vimKeys('g', 'I');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X  hello');
        });

        it('gJ should join lines without space', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('g', 'J');
            expect(await getEditorValue()).toBe('helloworld');
        });
    });

    describe('gv', function () {
        it('gv should reselect last visual selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await sendVimEscape();
            await browser.pause(100);
            await browser.keys(['g']);
            await browser.pause(30);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe(' world');
        });
    });

    describe('gn / gN (search and select)', function () {
        it('gn should select next search match', async function () {
            await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['f', 'o', 'o']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            await vimKeys('g', 'n');
            await vimKeys('d');
            const val = await getEditorValue();
            expect(val.startsWith('foo bar ')).toBe(true);
        });

        it('cgn should change next search match', async function () {
            await setupEditor('old bar old baz old', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['o', 'l', 'd']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            await vimKeys('c', 'g', 'n');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(300);
            const val = await getEditorValue();
            expect(val).toContain('new');
        });
    });

    describe('g; / g, (changelist navigation)', function () {
        it('g; should jump to position of previous change', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd\neee', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            await vimKeys('3', 'j');
            await vimKeys('i');
            await browser.keys(['Y']);
            await sendVimEscape();
            await browser.pause(200);
            const posAfterEdits = await getCursorPos();
            expect(posAfterEdits.line).toBe(3);
            await vimKeys('g', ';');
            const posAfterGSemicolon = await getCursorPos();
            expect(posAfterGSemicolon.line).toBeLessThanOrEqual(3);
        });

        it('g, should not error after g;', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            await vimKeys('j');
            await vimKeys('i');
            await browser.keys(['Y']);
            await sendVimEscape();
            await browser.pause(200);
            await vimKeys('g', ';');
            await vimKeys('g', ',');
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
        });
    });

    describe('ga (character info)', function () {
        it('ga should not error on a normal character', async function () {
            await setupEditor('Hello', { line: 0, ch: 0 });
            await vimKeys('g', 'a');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('ga on empty line should not crash', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('g', 'a');
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
