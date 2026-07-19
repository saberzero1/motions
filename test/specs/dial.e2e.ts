import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    sendVimEscape,
    setPluginSetting,
    vimRawKeys,
} from '../helpers';

describe('Dial (enhanced increment/decrement)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setPluginSetting('enableDial', true);
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
        await setPluginSetting('enableDial', false);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('numeric increment/decrement', function () {
        it('Ctrl+a should increment number', async function () {
            await setupEditor('count = 5', { line: 0, ch: 8 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('count = 6');
        });

        it('Ctrl+x should decrement number', async function () {
            await setupEditor('count = 5', { line: 0, ch: 8 });
            await vimRawKeys('\x18');
            const content = await getEditorValue();
            expect(content).toBe('count = 4');
        });

        it('5 Ctrl+a should add 5 to number', async function () {
            await setupEditor('count = 5', { line: 0, ch: 8 });
            await vimRawKeys('5\x01');
            const content = await getEditorValue();
            expect(content).toBe('count = 10');
        });
    });

    describe('checkbox toggling', function () {
        it('Ctrl+a should check unchecked checkbox', async function () {
            await setupEditor('- [ ] task', { line: 0, ch: 3 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('- [x] task');
        });
    });

    describe('boolean toggling', function () {
        it('Ctrl+a should toggle true to false', async function () {
            await setupEditor('enabled: true', { line: 0, ch: 10 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('enabled: false');
        });
    });

    describe('date increment', function () {
        it('Ctrl+a on date day should increment day', async function () {
            await setupEditor('date: 2024-01-15', { line: 0, ch: 15 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('date: 2024-01-16');
        });
    });

    describe('CSS unit increment', function () {
        it('Ctrl+a on CSS value should increment number preserving unit', async function () {
            await setupEditor('margin: 10px', { line: 0, ch: 9 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('margin: 11px');
        });
    });

    describe('no match fallthrough', function () {
        it('Ctrl+a on non-matching text should leave content unchanged', async function () {
            await setupEditor('plain text here', { line: 0, ch: 6 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('plain text here');
        });
    });

    describe('setting disabled', function () {
        it('Ctrl+a falls through to default when dial is off', async function () {
            await setPluginSetting('enableDial', false);
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

            await setupEditor('count = 5', { line: 0, ch: 8 });
            await vimRawKeys('\x01');
            const content = await getEditorValue();
            expect(content).toBe('count = 6');

            await setPluginSetting('enableDial', true);
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
