import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    sendVimEscape,
    loadLuaConfig,
} from '../helpers';

describe('Lua text object registration', function () {
    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('single-char delimiters', function () {
        it('diA with angle brackets should delete inner content', async function () {
            await loadLuaConfig(`
vim.textobject.add("iA", vim.gen_spec.pair("<", ">"))
`);
            await browser.pause(500);
            await setupEditor('<hello>', { line: 0, ch: 3 });
            await vimKeys('d', 'i', 'A');
            const content = await getEditorValue();
            expect(content).toBe('<>');
        });

        it('daA with angle brackets should delete including delimiters', async function () {
            await loadLuaConfig(`
vim.textobject.add("aA", vim.gen_spec.pair("<", ">"))
`);
            await setupEditor('say <hello> end', { line: 0, ch: 7 });
            await vimKeys('d', 'a', 'A');
            const content = await getEditorValue();
            expect(content).toBe('say  end');
        });
    });

    describe('multi-char delimiters', function () {
        it('diP with << >> should delete inner content', async function () {
            await loadLuaConfig(`
vim.textobject.add("iP", vim.gen_spec.pair("<<", ">>"))
`);
            await setupEditor('x <<inner>> y', { line: 0, ch: 6 });
            await vimKeys('d', 'i', 'P');
            const content = await getEditorValue();
            expect(content).toBe('x <<>> y');
        });
    });

    describe('nested delimiters', function () {
        it('diA inside nested parens should target innermost', async function () {
            await loadLuaConfig(`
vim.textobject.add("iA", vim.gen_spec.pair("(", ")"))
`);
            await setupEditor('f(g(x))', { line: 0, ch: 4 });
            await vimKeys('d', 'i', 'A');
            const content = await getEditorValue();
            expect(content).toBe('f(g())');
        });
    });

    describe('error handling', function () {
        it('invalid key should not crash', async function () {
            await loadLuaConfig(`
vim.textobject.add("bad", vim.gen_spec.pair("[", "]"))
`);
            await setupEditor('test [content] here', { line: 0, ch: 0 });
            await vimKeys('d', 'i', 'b');
            const content = await getEditorValue();
            expect(content).toBe('test [content] here');
        });
    });
});
