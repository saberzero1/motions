import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { loadLuaConfig, PAUSE, setupEditor } from '../helpers';

/**
 * EasyMotion's motions are reachable through vim-easymotion's `<Plug>` names
 * (#205), including the bidirectional ones that have no default key.
 *
 * Measured before the change: no `<Plug>(easymotion-...)` name existed, so a
 * mapping to one ran its characters as keys. A plain `vim.keymap.set` is
 * noremap, and the engine did not remap a `<Plug>` name from a noremap rhs
 * the way Vim and Neovim do; that half is the codemirror-vim fork's fix.
 *
 * F-keys, because Obsidian binds none of F7–F9 and WebDriver delivers them
 * alike on every platform.
 */

const LUA = [
    "vim.keymap.set({ 'n', 'x', 'o' }, '<F7>', '<Plug>(easymotion-bd-w)')",
    "vim.keymap.set({ 'n', 'x', 'o' }, '<F8>', '<Plug>(easymotion-bd-w)', { remap = true })",
    "vim.cmd('nmap <F9> <Plug>(easymotion-j)')",
].join('\n');

const LINE = 'one two three four five';

interface Label {
    text: string;
    left: number;
    top: number;
}

async function labels(): Promise<Label[]> {
    return (await browser.executeObsidian(() =>
        Array.from(
            document.querySelectorAll<HTMLElement>(
                '.vim-motions-easymotion-label',
            ),
        )
            .map((el) => ({
                text: el.textContent ?? '',
                left: el.getBoundingClientRect().left,
                top: el.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.left - b.left),
    )) as Label[];
}

async function waitForLabels(): Promise<Label[]> {
    await browser.waitUntil(async () => (await labels()).length > 0, {
        timeout: 3000,
        interval: 100,
        timeoutMsg: 'no EasyMotion labels',
    });
    return labels();
}

async function editor(): Promise<{ text: string; ch: number; line: number }> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cursor = view?.editor.getCursor();
        return {
            text: view?.editor.getValue() ?? '',
            ch: cursor?.ch ?? -1,
            line: cursor?.line ?? -1,
        };
    })) as { text: string; ch: number; line: number };
}

/** The cursor on `three`, in a note of one line so every label is on it. */
async function onThree(): Promise<number> {
    await setupEditor(LINE, { line: 0, ch: LINE.indexOf('three') });
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as {
                cm?: { coordsAtPos(pos: number): { left: number } | null };
            }
        )?.cm;
        const offset = view?.editor.posToOffset(view.editor.getCursor()) ?? 0;
        return cm?.coordsAtPos(offset)?.left ?? 0;
    })) as number;
}

describe('EasyMotion <Plug> names (#205)', function () {
    this.timeout(120000);

    before(async function () {
        await loadLuaConfig(LUA);
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('<Plug>(easymotion-bd-w) labels words on both sides and jumps back', async function () {
        const cursorLeft = await onThree();

        await browser.keys([Key.F8]);
        const shown = await waitForLabels();
        await browser.keys(shown[0]!.text.split(''));
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // `one` and `two` behind the cursor; `four` and `five` ahead, beside
        // the label on the cursor's own word.
        expect(shown.filter((l) => l.left < cursorLeft - 1)).toHaveLength(2);
        expect(
            shown.filter((l) => l.left > cursorLeft + 1).length,
        ).toBeGreaterThanOrEqual(2);
        expect((await editor()).ch).toBe(0);
    });

    it('keeps its motion behaviour after an operator', async function () {
        await onThree();

        await browser.keys(['d', Key.F8]);
        const shown = await waitForLabels();
        await browser.keys(shown[shown.length - 1]!.text.split(''));
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect((await editor()).text).toBe('one two five');
    });

    it('is reached from a plain vim.keymap.set, which is noremap', async function () {
        await onThree();

        await browser.keys([Key.F7]);
        const shown = await waitForLabels();
        const state = await editor();

        expect(shown.length).toBeGreaterThan(0);
        expect(state.text).toBe(LINE);
    });

    it('is reached from nmap, as in a vimrc', async function () {
        await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys([Key.F9]);
        const shown = (await waitForLabels()).sort((a, b) => a.top - b.top);
        await browser.keys(shown[shown.length - 1]!.text.split(''));
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect((await editor()).line).toBe(2);
    });
});
