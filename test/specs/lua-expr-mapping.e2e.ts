import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
    getRegisterContent,
    sendVimEscape,
    PAUSE,
} from '../helpers';

describe('Lua expr mappings', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('expr mapping returns keys that are executed', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "dd" end, { expr = true })\n',
        );
        await setupEditor('line one\nline two\nline three', {
            line: 0,
            ch: 0,
        });
        await vimKeys('K');
        const content = await getEditorValue();
        expect(content).toBe('line two\nline three');
    });

    it('expr mapping with count uses vim.v.count', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function()\n' +
                '    if vim.v.count == 0 then return "gj" else return "j" end\n' +
                'end, { expr = true })\n',
        );
        await setupEditor(
            'line one\nline two\nline three\nline four\nline five',
            { line: 0, ch: 0 },
        );
        await vimKeys('K');
        const pos1 = await getCursorPos();
        expect(pos1.line).toBe(1);
        await browser.keys(['2']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const pos2 = await getCursorPos();
        expect(pos2.line).toBe(3);
    });

    // Neovim leaves the register and count typed before an expr mapping
    // pending, so the keys the expression returns pick them up. Each expected
    // value below is Neovim 0.12.6's, measured with the same mappings on a
    // 60-line buffer of `l0`…`l59`.
    describe('the register and count stay pending, as in Neovim', function () {
        const doc = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n');

        before(async function () {
            await loadLuaConfig(
                'vim.keymap.set("n", "Q", function() return "j" end, { expr = true })\n' +
                    'vim.keymap.set("n", "R", function() return vim.v.count1 .. "j" end, { expr = true })\n' +
                    'vim.keymap.set("n", "Y", function() return "yy" end, { expr = true })\n' +
                    'vim.keymap.set("n", "X", function() vim.fn.setreg("c", vim.v.count .. "/" .. vim.v.register); return "" end, { expr = true })\n',
            );
        });

        async function press(...keys: string[]): Promise<void> {
            for (const key of keys) {
                await browser.keys([key]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }

        it('3Q, Q returning j, moves 3 lines', async function () {
            await setupEditor(doc, { line: 0, ch: 0 });
            await press('3', 'Q');
            expect((await getCursorPos()).line).toBe(3);
        });

        it('3R, R returning count1 .. "j", moves 33 lines', async function () {
            await setupEditor(doc, { line: 0, ch: 0 });
            await press('3', 'R');
            expect((await getCursorPos()).line).toBe(33);
        });

        it('"a2Y, Y returning yy, yanks 2 lines into a', async function () {
            await setupEditor(doc, { line: 0, ch: 0 });
            await press('"', 'a', '2', 'Y');
            expect(await getRegisterContent('a')).toEqual({
                text: 'l0\nl1\n',
                linewise: true,
            });
        });

        it('"b3X, X returning nothing, sees 3 and b and leaves the 3 for the next j', async function () {
            await setupEditor(doc, { line: 0, ch: 0 });
            await press('"', 'b', '3', 'X', 'j');
            expect({
                line: (await getCursorPos()).line,
                seen: (await getRegisterContent('c'))?.text,
            }).toEqual({ line: 3, seen: '3/b' });
        });
    });

    // #236: the docs recipe for display-line navigation with counted jumps,
    // with a space leader. Making Space the leader removes the default
    // `<Space>` motion. The fork's noremap search counted its defaults from the
    // end of the keymap, so one fewer default put the `j` mapping back in its
    // own rhs: `3j` re-entered the expression until the stack overflowed, and
    // every `j` and `k` after it was typed into the note.
    it('counted j through an expr mapping on j works with a space leader (#236)', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = " "\n' +
                'vim.keymap.set("n", "j", function()\n' +
                '    if vim.v.count == 0 then return "gj" else return "j" end\n' +
                'end, { expr = true, silent = true })\n' +
                'vim.keymap.set("n", "k", function()\n' +
                '    if vim.v.count == 0 then return "gk" else return "k" end\n' +
                'end, { expr = true, silent = true })\n',
        );
        const doc = 'l0\nl1\nl2\nl3\nl4\nl5\nl6\nl7';
        await setupEditor(doc, { line: 0, ch: 0 });
        const lines: number[] = [];
        for (const seq of [['j'], ['3', 'j'], ['k'], ['2', 'k']]) {
            for (const key of seq) {
                await browser.keys([key]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
            lines.push((await getCursorPos()).line);
        }
        expect({ lines, text: await getEditorValue() }).toEqual({
            lines: [1, 4, 3, 1],
            text: doc,
        });
    });

    it('expr mapping returning nil does nothing', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return nil end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
        const pos = await getCursorPos();
        expect(pos.line).toBe(0);
    });

    it('expr mapping returning empty string does nothing', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "" end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
    });

    it('expr mapping error does not crash', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() error("boom") end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
        await vimKeys('d', 'd');
        expect(await getEditorValue()).toBe('');
    });

    it('string expr mapping raises error', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", "v:count == 0 ? \'gk\' : \'k\'", { expr = true })\n',
        );
        await setupEditor('hello world\nsecond line', { line: 0, ch: 0 });
        const valueBefore = await getEditorValue();
        await vimKeys('K');
        const valueAfter = await getEditorValue();
        expect(valueAfter).toBe(valueBefore);
    });

    it('expr mapping with special keys works', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "ihi" end, { expr = true })\n',
        );
        await setupEditor('', { line: 0, ch: 0 });
        await vimKeys('K');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        const content = await getEditorValue();
        expect(content).toBe('hi');
    });
});
