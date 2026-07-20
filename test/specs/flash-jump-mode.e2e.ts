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

describe('Flash jump mode (s) and clever-f', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setFlashSettings(
            {
                enableFlash: true,
                flashJumpEnabled: true,
                flashJumpKey: 's',
                flashCleverF: false,
            },
            true,
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
        await setFlashSettings({
            enableFlash: true,
            flashJumpEnabled: true,
            flashJumpKey: 's',
            flashCleverF: false,
        });
    });

    describe('jump mode setting', function () {
        it('s should trigger flash jump when enabled', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'z']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });
    });

    describe('jump mode basic', function () {
        it('s{char} should autojump to single match', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'z']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });

        it('s{char} with 2+ matches should show labels', async function () {
            await setupEditor('abcabcabc', { line: 0, ch: 4 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'a']);
            await browser.pause(300);
            const labels = await getFlashLabelCount();
            expect(labels).toBeGreaterThanOrEqual(2);
            await browser.keys(['Escape']);
        });

        it('s{char} with no matches should not move', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'z']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });

        it('Escape should cancel s without moving', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'Escape']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('jump key binding', function () {
        it('default s key should trigger jump mode', async function () {
            await setupEditor('hello xyz world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['s', 'z']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });
    });

    describe('two-character labels (issue #76)', function () {
        it('should narrow labels on first char of two-char label instead of exiting', async function () {
            await setFlashSettings({
                easyMotionLabels: 'abc',
                flashMinPatternLength: 1,
            });
            await setupEditor('x x x x x x x x', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['s', 'x']);
            await browser.pause(300);

            const labelsBefore = await getFlashLabelCount();
            expect(labelsBefore).toBeGreaterThanOrEqual(4);

            await browser.keys(['a']);
            await browser.pause(200);

            const labelsAfter = await getFlashLabelCount();
            expect(labelsAfter).toBeGreaterThanOrEqual(1);

            await browser.keys(['Escape']);
            await setFlashSettings({
                easyMotionLabels: 'asdghklqwertyuiopzxcvbnmfj',
            });
        });

        it('should still jump immediately on single-char label match', async function () {
            await setupEditor('abc abc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['s', 'b']);
            await browser.pause(300);

            const labels = await getFlashLabelCount();
            expect(labels).toBeGreaterThanOrEqual(2);

            const labelChar = (await browser.executeObsidian(() => {
                const el = document.querySelector(
                    '.vim-motions-easymotion-label',
                );
                return el?.textContent ?? null;
            })) as string | null;

            if (labelChar && labelChar.length === 1) {
                await browser.keys([labelChar]);
                await browser.pause(200);

                const labelsAfter = await getFlashLabelCount();
                expect(labelsAfter).toBe(0);
            } else {
                await browser.keys(['Escape']);
            }
        });
    });

    describe('shadow resolver: surround coexistence with flash s', function () {
        it('cs should change surround when flash s is enabled', async function () {
            await setupEditor('"hello" world', { line: 0, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['c', 's', '"', "'"]);
            await browser.pause(300);
            expect(await getEditorValue()).toBe("'hello' world");
        });

        it('ds should delete surround when flash s is enabled', async function () {
            await setupEditor('"hello" world', { line: 0, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['d', 's', '"']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('hello world');
        });

        it('ysiw should add surround when flash s is enabled', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['y', 's', 'i', 'w', '"']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('"hello" world');
        });
    });

    describe('clever-f', function () {
        it('should fall through to stock f on repeat when clever-f is enabled', async function () {
            await setFlashSettings({
                flashCleverF: true,
                flashMultiLine: false,
            });
            await setupEditor('xyzxcxyz', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['f', 'c']);
            await browser.pause(300);
            let pos = await getCursorPos();
            expect(pos.ch).toBe(4);

            await browser.keys(['f', 'c']);
            await browser.pause(300);
            pos = await getCursorPos();
            expect(pos.ch).toBe(4);
        });
    });
});
