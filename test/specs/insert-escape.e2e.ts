import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../helpers';

async function setInsertEscape(sequence: string): Promise<void> {
    await browser.executeObsidian(({ app }, seq: string) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: { setOption: (key: string, value: unknown) => void };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (Vim) {
            Vim.setOption('insertmodeescape', seq);
        }
    }, sequence);
}

async function clearInsertEscape(): Promise<void> {
    await setInsertEscape('');
}

describe('Insert-mode escape sequences', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await clearInsertEscape();
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('jk should exit insert mode when configured', async function () {
        await setInsertEscape('jk');
        await setupEditor('hello', { line: 0, ch: 5 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        expect(await getVimMode()).toBe('insert');

        await browser.keys(['j']);
        await browser.pause(50);
        await browser.keys(['k']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getVimMode()).toBe('normal');
    });

    it('jk should delete the first character of the sequence from buffer', async function () {
        await setInsertEscape('jk');
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['h', 'e', 'l', 'l', 'o']);
        await browser.pause(50);
        await browser.keys(['j']);
        await browser.pause(50);
        await browser.keys(['k']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getVimMode()).toBe('normal');
        const value = await getEditorValue();
        expect(value).toBe('hello');
    });

    it('jj should exit insert mode when configured', async function () {
        await setInsertEscape('jj');
        await setupEditor('test', { line: 0, ch: 4 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['j']);
        await browser.pause(50);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getVimMode()).toBe('normal');
    });

    it('typing j alone should not exit insert mode', async function () {
        await setInsertEscape('jk');
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['j']);
        await browser.pause(1200);

        expect(await getVimMode()).toBe('insert');
    });

    it('should not trigger on non-matching sequences', async function () {
        await setInsertEscape('jk');
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['j']);
        await browser.pause(50);
        await browser.keys(['l']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getVimMode()).toBe('insert');
        const value = await getEditorValue();
        expect(value).toContain('jl');
    });

    it('should not trigger when escape sequence is empty', async function () {
        await clearInsertEscape();
        await setupEditor('', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['j', 'k']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getVimMode()).toBe('insert');
        expect(await getEditorValue()).toContain('jk');
    });
});
