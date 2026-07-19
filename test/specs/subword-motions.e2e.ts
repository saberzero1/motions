import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    setPluginSetting,
    vimRawKeys,
} from '../helpers';

describe('Subword motions', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setPluginSetting('enableSubwordMotions', true);
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { reloadFeatures?: () => void }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.reloadFeatures?.();
        });
        await browser.pause(500);
    });

    after(async function () {
        await setPluginSetting('enableSubwordMotions', false);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('camelCase navigation', function () {
        it('w on camelCaseWord should move to next subword boundary', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 0 });
            await vimKeys('w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(5);
        });

        it('b on camelCaseWord from ch:5 should move back to start', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 5 });
            await vimKeys('b');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });

        it('e on camelCaseWord should move to end of first subword', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 0 });
            await vimKeys('e');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(4);
        });

        it('ge on camelCaseWord from ch:9 should move to end of previous subword', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 9 });
            await vimKeys('g', 'e');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });
    });

    describe('operators with subword motions', function () {
        it('dw on camelCaseWord should delete first subword', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            const content = await getEditorValue();
            expect(content).toBe('CaseWord');
        });

        it('cw + type new + Esc should replace first subword', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys('new');
            await sendVimEscape();
            const content = await getEditorValue();
            expect(content).toBe('newCaseWord');
        });
    });

    describe('snake_case and kebab-case', function () {
        it('w on snake_case_word should move to next subword', async function () {
            await setupEditor('snake_case_word', { line: 0, ch: 0 });
            await vimKeys('w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });

        it('w on kebab-case-word should move to next subword', async function () {
            await setupEditor('kebab-case-word', { line: 0, ch: 0 });
            await vimKeys('w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(6);
        });
    });

    describe('count prefix', function () {
        it('2w on camelCaseWord should jump two subwords', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 0 });
            await vimKeys('2', 'w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(9);
        });
    });

    describe('setting disabled', function () {
        it('w uses normal word motion when setting is off', async function () {
            await setPluginSetting('enableSubwordMotions', false);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures?: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures?.();
            });
            await browser.pause(500);

            await setupEditor('camelCaseWord next', { line: 0, ch: 0 });
            await vimKeys('w');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(14);

            await setPluginSetting('enableSubwordMotions', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures?: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures?.();
            });
            await browser.pause(500);
        });
    });
});
