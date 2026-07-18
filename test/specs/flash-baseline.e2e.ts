import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    vimKeys,
    vimRawKeys,
} from '../helpers';

/**
 * Baseline regression tests for stock f/F/t/T and ;/, repeat.
 *
 * These tests verify the current behavior BEFORE flash implementation.
 * They serve as regression guards to ensure flash doesn't break
 * stock vim character motion semantics when disabled.
 */
describe('Flash baseline: stock f/F/t/T motions', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.executeObsidian(({ app }) => {
            const plugin = (app as unknown as Record<string, unknown>)
                .plugins as Record<string, unknown> | undefined;
            const internal = (plugin?.plugins as Record<string, unknown>)?.[
                'vim-motions'
            ] as { settings: Record<string, unknown> } | undefined;
            if (internal?.settings) {
                internal.settings.enableFlash = false;
            }
        });
        await browser.pause(300);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('f — find character forward', function () {
        it('should jump to first occurrence of character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('f', 'w');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(6);
        });

        it('should jump to second occurrence with 2f', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 0 });
            await vimKeys('2', 'f', 'a');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(6);
        });

        it('should not move if character not found', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('f', 'z');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });

        it('should stay on current line (not cross lines)', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('f', 'w');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });
    });

    describe('F — find character backward', function () {
        it('should jump backward to character', async function () {
            await setupEditor('hello world', { line: 0, ch: 10 });
            await vimKeys('F', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(7);
        });

        it('should not move if character not found backward', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('F', 'z');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });
    });

    describe('t — till character forward', function () {
        it('should jump to one before character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('t', 'w');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(5);
        });

        it('should not move if character not found', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('t', 'z');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });
    });

    describe('T — till character backward', function () {
        it('should jump to one after character backward', async function () {
            await setupEditor('hello world', { line: 0, ch: 10 });
            await vimKeys('T', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(8);
        });
    });

    describe('; and , — repeat character search', function () {
        it('; should repeat f forward', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 0 });
            await vimKeys('f', 'a');
            let pos = await getCursorPos();
            expect(pos.ch).toBe(3);

            await vimKeys(';');
            pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });

        it(', should repeat f backward', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 6 });
            await vimKeys('f', 'c');
            let pos = await getCursorPos();
            expect(pos.ch).toBe(8);

            await vimKeys(',');
            pos = await getCursorPos();
            expect(pos.ch).toBe(5);
        });

        it('; should repeat t forward', async function () {
            await setupEditor('xaxbxaxbx', { line: 0, ch: 0 });
            await vimKeys('t', 'b');
            let pos = await getCursorPos();
            expect(pos.ch).toBe(2);

            await vimKeys(';');
            pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });
    });

    describe('operator-pending with f/t', function () {
        it('df should delete to and including character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('d', 'f', 'o');
            const value = await getEditorValue();
            expect(value).toBe(' world');
        });

        it('dt should delete to but not including character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('d', 't', 'o');
            const value = await getEditorValue();
            expect(value).toBe('o world');
        });

        it('cf should change to and including character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('c', 'f', 'o');
            const value = await getEditorValue();
            expect(value).toBe(' world');
        });

        it('yf should yank to and including character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'f', 'o');
            await vimKeys('p');
            const value = await getEditorValue();
            expect(value).toBe('hhelloello world');
        });
    });

    describe('visual mode with f/t', function () {
        it('vf should extend selection to character', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimRawKeys('vfo');
            await browser.pause(100);
            await vimRawKeys('y');
            await browser.pause(100);
            await vimKeys('P');
            const value = await getEditorValue();
            // vfo: visual from 0, f finds 'o' at col 4.
            // CM6 vim's visual yank behavior may differ slightly from Neovim.
            // Accept the actual fork behavior as the baseline.
            expect(value).toBe('hellhelloo world');
        });
    });
});
