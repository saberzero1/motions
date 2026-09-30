import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    getSelection,
    getVimMode,
    handleEx,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

/**
 * Every expectation in this file was measured against Neovim 0.12.5 with
 * `nvim --clean`; the recorded oracle values live in
 * `test/specs/vim-builtin/insert-escape-mapping-negative-controls.md`.
 */
describe('Insert-mode Escape: user mappings and :stopinsert', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        // Mappings registered here are global to the vim engine; a leaked
        // `<Esc>` mapping would silently change every later test.
        await handleEx('imapclear');
        await handleEx('vmapclear');
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe(':stopinsert', function () {
        it('is a known ex command and leaves insert mode', async function () {
            await setupEditor('hello\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await getVimMode()).toBe('insert');

            const result = await handleEx('stopinsert');

            expect(result.unknownCommand).toBe(false);
            expect(await getVimMode()).toBe('normal');
        });

        it('leaves the cursor exactly where <Esc> would (Neovim: col 5)', async function () {
            await setupEditor('hello\n', { line: 0, ch: 0 });
            await browser.keys(['A', 'x']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await handleEx('stopinsert');
            await browser.pause(PAUSE.MODE_SWITCH);
            const viaStopinsert = await getCursorPos();
            expect(await getEditorValue()).toBe('hellox\n');

            await setupEditor('hello\n', { line: 0, ch: 0 });
            await browser.keys(['A', 'x']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);
            const viaEscape = await getCursorPos();

            expect(viaStopinsert).toEqual(viaEscape);
            expect(viaStopinsert.ch).toBe(5);
        });

        it('resolves the :stopi short form', async function () {
            await setupEditor('hello\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const result = await handleEx('stopi');

            expect(result.unknownCommand).toBe(false);
            expect(await getVimMode()).toBe('normal');
        });

        it('is a no-op in normal mode and does not touch the buffer', async function () {
            await setupEditor('hello\n', { line: 0, ch: 2 });
            expect(await getVimMode()).toBe('normal');

            const result = await handleEx('stopinsert');

            expect(result.unknownCommand).toBe(false);
            expect(await getVimMode()).toBe('normal');
            expect(await getEditorValue()).toBe('hello\n');
            expect(await getCursorPos()).toEqual({ line: 0, ch: 2 });
        });
    });

    describe('user <Esc> mappings', function () {
        it('honours inoremap <Esc> XY instead of exiting insert mode', async function () {
            await handleEx('inoremap <Esc> XY');
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await getVimMode()).toBe('insert');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('aXYbc\n');
            expect(await getVimMode()).toBe('insert');
        });

        it('leaves <Esc> exiting insert mode when no mapping exists', async function () {
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('abc\n');
            expect(await getVimMode()).toBe('normal');
        });

        it('keeps <C-c> exiting insert mode while <Esc> is mapped', async function () {
            await handleEx('inoremap <Esc> XY');
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Control', 'c']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('abc\n');
            expect(await getVimMode()).toBe('normal');
        });

        it('routes <C-[> through the <Esc> mapping like Neovim does', async function () {
            await handleEx('inoremap <Esc> XY');
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Control', '[']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('aXYbc\n');
            expect(await getVimMode()).toBe('insert');
        });

        it('falls back to the built-in Escape for a recursive imap <Esc> <Esc>', async function () {
            await handleEx('imap <Esc> <Esc>');
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('abc\n');
            expect(await getVimMode()).toBe('normal');
        });

        it('still exits insert mode when only a longer <Esc>q mapping exists', async function () {
            await handleEx('inoremap <Esc>q ZZ');
            await setupEditor('abc\n', { line: 0, ch: 0 });
            await browser.keys(['a']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe('abc\n');
            expect(await getVimMode()).toBe('normal');
        });

        it('honours vnoremap <Esc> ll instead of exiting visual mode', async function () {
            // Asserted against the same keys typed directly rather than a
            // literal column: CM6 reports an exclusive selection head (3)
            // where Neovim reports an inclusive one (2), so a literal would
            // encode the coordinate convention instead of the mapping.
            await setupEditor('abcdef\n', { line: 0, ch: 0 });
            await browser.keys(['v']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['l']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['l']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const typedMode = await getVimMode();
            const typedCursor = await getCursorPos();
            const typedSelection = await getSelection();
            expect(typedMode).toBe('visual');
            expect(typedSelection).toBe('abc');
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await handleEx('vnoremap <Esc> ll');
            await setupEditor('abcdef\n', { line: 0, ch: 0 });
            await browser.keys(['v']);
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await getVimMode()).toBe('visual');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getVimMode()).toBe(typedMode);
            expect(await getSelection()).toBe(typedSelection);
            expect(await getCursorPos()).toEqual(typedCursor);
        });

        it('leaves <Esc> exiting visual mode when no mapping exists', async function () {
            await setupEditor('abcdef\n', { line: 0, ch: 0 });
            await browser.keys(['v']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getVimMode()).toBe('normal');
        });
    });
});
