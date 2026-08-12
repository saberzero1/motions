import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, getEditorValue, PAUSE } from '../helpers';

/**
 * Regression test for GitHub issue #123:
 * Vim chord display inconsistencies during surround commands.
 *
 * The chord display in the status bar should accumulate all pending
 * keystrokes during multi-key commands like `ysiwb`. Currently, the
 * chord breaks after the surround sub-state is entered (`ys`): the
 * intermediate motion keys (`i`, `w`) and the delimiter (`b`) are
 * not reflected in the display.
 */

async function getChordDisplay(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-chord');
        return (el as HTMLElement)?.textContent ?? '';
    })) as string;
}

describe('Surround chord display — #123', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('ys{motion}{char} chord accumulation', function () {
        it('ysiwb should show correct chord at each keystroke', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });

            // Ensure we start in normal mode with empty chord
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            expect(await getChordDisplay()).toBe('');

            // y — operator pending
            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('y');

            // s — surround action
            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ys');

            // i — text object prefix (BUG: chord disappears here)
            await browser.keys(['i']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ysi');

            // w — text object (inner word)
            await browser.keys(['w']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ysiw');

            // b — delimiter (parentheses), command executes
            await browser.keys(['b']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // After command completes, chord should clear
            expect(await getChordDisplay()).toBe('');

            // Verify the surround was applied correctly
            expect(await getEditorValue()).toBe('(hello) world');
        });

        it('ysiw" should show correct chord at each keystroke', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('y');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ys');

            await browser.keys(['i']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ysi');

            await browser.keys(['w']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ysiw');

            await browser.keys(['"']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('"hello" world');
        });

        it('yse) should show correct chord at each keystroke', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('y');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ys');

            await browser.keys(['e']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('yse');

            await browser.keys([')']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('(hello) world');
        });
    });

    describe('yss{char} chord accumulation', function () {
        it('yss" should show correct chord at each keystroke', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('y');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ys');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('yss');

            await browser.keys(['"']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('"hello world"');
        });
    });

    describe('ds/cs chord accumulation', function () {
        it('ds" should show correct chord', async function () {
            await setupEditor('"hello" world', { line: 0, ch: 3 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['d']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('d');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('ds');

            await browser.keys(['"']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('cs"( should show correct chord', async function () {
            await setupEditor('"hello" world', { line: 0, ch: 3 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['c']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('c');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('cs');

            await browser.keys(['"']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('cs"');

            await browser.keys(['(']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('( hello ) world');
        });
    });

    describe('count-prefixed surround chord accumulation', function () {
        it('2ysiw* should show correct chord at each keystroke', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['2']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('2');

            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('2y');

            await browser.keys(['s']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('2ys');

            await browser.keys(['i']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('2ysi');

            await browser.keys(['w']);
            await browser.pause(PAUSE.KEY_GAP);
            expect(await getChordDisplay()).toBe('2ysiw');

            await browser.keys(['*']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getChordDisplay()).toBe('');
            expect(await getEditorValue()).toBe('**hello** world');
        });
    });
});
