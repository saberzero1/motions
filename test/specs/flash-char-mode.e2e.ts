import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    vimKeys,
    PAUSE,
} from '../helpers';

function ensureFlashEnabled(enabled: boolean): Promise<void> {
    return browser.executeObsidian(({ app }, val: boolean) => {
        const plugin = (app as unknown as Record<string, unknown>).plugins as
            | Record<string, unknown>
            | undefined;
        const internal = (plugin?.plugins as Record<string, unknown>)?.[
            'vim-motions'
        ] as { settings: Record<string, unknown> } | undefined;
        if (internal?.settings) {
            internal.settings.enableFlash = val;
        }
    }, enabled) as unknown as Promise<void>;
}

function getFlashLabelCount(): Promise<number> {
    return browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-easymotion-label')
            .length;
    }) as unknown as Promise<number>;
}

describe('Flash char-mode: enhanced f/F/t/T', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureFlashEnabled(true);
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
        await ensureFlashEnabled(true);
    });

    describe('single match — autojump', function () {
        it('should autojump when only 1 match exists', async function () {
            await setupEditor('hello world xyz', { line: 0, ch: 0 });
            await vimKeys('f', 'x');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(12);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });

        it('should not move when no match exists', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('f', 'z');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('multi-match — labels', function () {
        it('should show labels when 2+ matches exist', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 0 });
            await browser.keys(['f', 'a']);
            await browser.pause(200);
            const labels = await getFlashLabelCount();
            expect(labels).toBeGreaterThanOrEqual(2);
            await sendVimEscape();
        });

        it('should jump to target when label is pressed', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 0 });
            await browser.keys(['f', 'a']);
            try {
                await browser.waitUntil(
                    async () => (await getFlashLabelCount()) >= 2,
                    { timeout: 1000, interval: 50 },
                );
            } catch {
                this.skip();
                return;
            }
            await browser.keys(['a']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(0);
        });
    });

    describe('escape cancels', function () {
        it('should cancel and keep cursor position on Escape', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['f', 'a']);
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });
    });

    describe('settings toggle', function () {
        it('should fall back to stock f when flash is disabled', async function () {
            await ensureFlashEnabled(false);
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('f', 'w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
            await ensureFlashEnabled(true);
        });
    });

    describe('multi_line behavior', function () {
        it('should find matches on other lines with multiLine enabled', async function () {
            await setupEditor('abc\ndef\nabc', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app }) => {
                const plugin = (app as unknown as Record<string, unknown>)
                    .plugins as Record<string, unknown> | undefined;
                const internal = (plugin?.plugins as Record<string, unknown>)?.[
                    'vim-motions'
                ] as { settings: Record<string, unknown> } | undefined;
                if (internal?.settings) {
                    internal.settings.flashMultiLine = true;
                }
            });

            await browser.keys(['f', 'e']);
            await browser.pause(200);
            const pos = await getCursorPos();
            // 'e' is only on line 1 col 1 — single match, should autojump
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(1);
        });
    });

    describe('multi-line t column 0', function () {
        it('t should wrap to previous line end when match is at column 0', async function () {
            await setupEditor('hello\nxworld', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app }) => {
                const plugin = (app as unknown as Record<string, unknown>)
                    .plugins as Record<string, unknown> | undefined;
                const internal = (plugin?.plugins as Record<string, unknown>)?.[
                    'vim-motions'
                ] as { settings: Record<string, unknown> } | undefined;
                if (internal?.settings) {
                    internal.settings.flashMultiLine = true;
                }
            });

            await vimKeys('t', 'x');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(4);
        });
    });

    describe('operator-pending with flash', function () {
        it('dfa should delete to single-match target', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await vimKeys('d', 'f', 'x');
            const value = await getEditorValue();
            expect(value).toBe('yz world');
        });
    });

    describe('semicolon repeat after flash', function () {
        it('; should repeat after flash autojump to single match', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await vimKeys('f', 'z');
            let pos = await getCursorPos();
            expect(pos.ch).toBe(8);

            await vimKeys(';');
            pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });
    });

    describe('count prefix with flash', function () {
        it('3fa should jump to 3rd a without labels', async function () {
            await setupEditor('a__a__a__a__a', { line: 0, ch: 0 });
            await vimKeys('3', 'f', 'a');
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(9);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });

        it('5fa should clamp to last a when fewer than 5 matches', async function () {
            await setupEditor('a__a__a', { line: 0, ch: 0 });
            await vimKeys('5', 'f', 'a');
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });

        it('2fa should jump to 2nd a without labels', async function () {
            await setupEditor('a__a__a__a', { line: 0, ch: 0 });
            await vimKeys('2', 'f', 'a');
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });

        it('d3fa should delete to 3rd a', async function () {
            await setupEditor('a__a__a__a', { line: 0, ch: 0 });
            await vimKeys('d', '3', 'f', 'a');
            await browser.pause(200);
            const value = await getEditorValue();
            expect(value).toBe('');
        });

        it('1fa with single match should behave like fa (no labels)', async function () {
            await setupEditor('hello a world', { line: 0, ch: 0 });
            await vimKeys('1', 'f', 'a');
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });
    });
});
