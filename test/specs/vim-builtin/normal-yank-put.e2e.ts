import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    getRegisterContent,
    getCursorPos,
} from '../../helpers';

describe('Normal mode — yank and put (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('yy / Y / yw', function () {
        it('yy should yank current line into default register', async function () {
            await setupEditor('hello world\nsecond line', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello world');
            expect(reg!.linewise).toBe(true);
        });

        it('yw should yank word', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello');
        });
    });

    describe('p / P', function () {
        it('p should paste after cursor', async function () {
            await setupEditor('hello world', { line: 0, ch: 4 });
            await vimKeys('y', 'w');
            await vimKeys('$');
            await vimKeys('p');
            const val = await getEditorValue();
            expect(val).toContain('world');
        });

        it('P should paste before cursor', async function () {
            await setupEditor('world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimKeys('0');
            await vimKeys('P');
            const val = await getEditorValue();
            expect(val.startsWith('world')).toBe(true);
        });

        it('dd then p should paste deleted line below', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('p');
            expect(await getEditorValue()).toBe('second\nfirst\nthird');
        });
    });

    describe('named registers', function () {
        it('"ayy should yank into register a', async function () {
            await setupEditor('alpha line\nbeta line', { line: 0, ch: 0 });
            await vimKeys('"', 'a', 'y', 'y');
            const reg = await getRegisterContent('a');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('alpha');
        });

        it('"ap should paste from register a', async function () {
            await setupEditor('alpha line\nbeta line', { line: 0, ch: 0 });
            await vimKeys('"', 'a', 'y', 'y');
            await vimKeys('G');
            await vimKeys('"', 'a', 'p');
            const val = await getEditorValue();
            expect(val).toContain('alpha');
        });
    });

    describe('register 0', function () {
        it('yy should populate register 0', async function () {
            await setupEditor('yanked line\nother', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('0');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('yanked');
        });
    });

    describe('gp / gP (paste and move past)', function () {
        it('gp should paste and move cursor past pasted text', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimKeys('$');
            await vimKeys('g', 'p');
            const val = await getEditorValue();
            expect(val).toContain('hello');
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(10);
        });
    });

    describe('Y (Neovim: yank to end of line)', function () {
        it('Y should yank from cursor to end of line, not entire line', async function () {
            await setupEditor('hello world', { line: 0, ch: 6 });
            await vimKeys('Y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toBe('world');
            expect(reg!.linewise).toBe(false);
        });
    });
});
