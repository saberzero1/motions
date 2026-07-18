import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    PAUSE,
} from '../helpers';

function setFlashSettings(
    overrides: Record<string, unknown>,
    reload = false,
): Promise<void> {
    return browser.executeObsidian(
        ({ app }, vals: Record<string, unknown>, doReload: boolean) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            Object.assign(plugin.settings, vals);
            if (doReload) plugin.reloadFeatures();
        },
        overrides,
        reload,
    ) as unknown as Promise<void>;
}

function getFlashLabelCount(): Promise<number> {
    return browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-easymotion-label')
            .length;
    }) as unknown as Promise<number>;
}

function getMatchHighlightCount(): Promise<number> {
    return browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-flash-match').length;
    }) as unknown as Promise<number>;
}

describe('Flash incremental jump mode', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setFlashSettings(
            {
                enableFlash: true,
                flashJumpEnabled: true,
                flashJumpKey: 's',
                flashMinPatternLength: 1,
            },
            true,
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('incremental narrowing', function () {
        it('should narrow matches as more chars are typed', async function () {
            await setupEditor('abc abd abe abf', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a']);
            await browser.pause(300);
            const labelsAfterA = await getFlashLabelCount();
            expect(labelsAfterA).toBeGreaterThanOrEqual(2);

            await browser.keys(['b']);
            await browser.pause(300);
            const labelsAfterAb = await getFlashLabelCount();
            expect(labelsAfterAb).toBeGreaterThanOrEqual(2);

            await browser.keys(['f']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(12);
        });

        it('should autojump when single match remains', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'x', 'y', 'z']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });
    });

    describe('backspace', function () {
        it('should remove last char and widen matches', async function () {
            await setupEditor('abc abd xyz', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a', 'b', 'c']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('zero matches', function () {
        it('should exit when no matches found', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'z', 'z']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);
        });
    });

    describe('escape', function () {
        it('should cancel without moving', async function () {
            await setupEditor('abc abc abc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a']);
            await browser.pause(300);
            await browser.keys(['Escape']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('enter jumps to nearest', function () {
        it('should jump to nearest match on Enter', async function () {
            await setupEditor('abc def abc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a', 'b']);
            await browser.pause(300);
            await browser.keys(['Enter']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('min_pattern_length', function () {
        it('should show highlights but no labels below threshold', async function () {
            await setFlashSettings({ flashMinPatternLength: 2 });
            await setupEditor('abc abc abc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a']);
            await browser.pause(300);

            const labels = await getFlashLabelCount();
            expect(labels).toBe(0);

            const highlights = await getMatchHighlightCount();
            expect(highlights).toBeGreaterThanOrEqual(1);

            await browser.keys(['b']);
            await browser.pause(300);
            const labelsAfterTwo = await getFlashLabelCount();
            expect(labelsAfterTwo).toBeGreaterThanOrEqual(2);

            await browser.keys(['Escape']);
            await setFlashSettings({ flashMinPatternLength: 1 });
        });
    });

    describe('operator-pending', function () {
        it('ds with incremental jump should delete to target', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['d', 's', 'x', 'y', 'z']);
            await browser.pause(500);
            const value = await getEditorValue();
            expect(value).toBe('xyz world');
        });
    });
});
