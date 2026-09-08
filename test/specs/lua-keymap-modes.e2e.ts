import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
    getVimMode,
    sendVimEscape,
} from '../helpers';

describe('Lua keymap mode semantics', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    // Neovim `:h map-modes`: "" means Normal + Visual + Select + Operator-pending.
    describe('empty mode string (#180)', function () {
        before(async function () {
            await loadLuaConfig('vim.keymap.set("", "j", "h")\n');
        });

        it('applies the mapping in normal mode', async function () {
            await setupEditor('hello world\nsecond line', {
                line: 0,
                ch: 5,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(4);
        });

        it('applies the mapping in visual mode', async function () {
            await setupEditor('hello world\nsecond line', {
                line: 0,
                ch: 5,
            });
            await vimKeys('v', 'j');
            expect(await getVimMode()).toBe('visual');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(4);
        });

        it('applies the mapping in operator-pending mode', async function () {
            await setupEditor('hello world\nsecond line', {
                line: 0,
                ch: 5,
            });
            await vimKeys('d', 'j');
            expect(await getEditorValue()).toBe('hell world\nsecond line');
        });
    });

    describe('explicit normal-only mode is unaffected (#180)', function () {
        before(async function () {
            await loadLuaConfig('vim.keymap.set("n", "j", "h")\n');
        });

        it('applies the mapping in normal mode', async function () {
            await setupEditor('hello world\nsecond line', {
                line: 0,
                ch: 5,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(4);
        });

        it('leaves visual mode j as the default down motion', async function () {
            await setupEditor('hello world\nsecond line', {
                line: 0,
                ch: 5,
            });
            await vimKeys('v', 'j');
            expect(await getVimMode()).toBe('visual');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });
});
