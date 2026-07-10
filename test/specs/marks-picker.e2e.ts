import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, PAUSE } from '../helpers';

async function handleEx(command: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleEx: (cm: unknown, input: string) => void;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleEx(adapter, cmd);
    }, command);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function vimHandleKey(key: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, k: string) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleKey(adapter, k);
    }, key);
    await browser.pause(PAUSE.KEY_GAP);
}

async function isPickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-picker');
    })) as boolean;
}

async function getPickerItemCount(): Promise<number> {
    return (await browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-picker-item').length;
    })) as number;
}

async function getPickerGroupHeaders(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll(
            '.vim-motions-picker-group-header',
        );
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

async function getPickerItemLabels(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll(
            '.vim-motions-picker-item .vim-motions-picker-item-label',
        );
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

async function getPickerItemDescriptions(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll(
            '.vim-motions-picker-item .vim-motions-picker-item-description',
        );
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

async function closePicker(): Promise<void> {
    await browser.executeObsidian(() => {
        const input = document.querySelector(
            '.vim-motions-picker-input',
        ) as HTMLInputElement | null;
        if (input) {
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                }),
            );
        }
    });
    await browser.pause(200);
}

describe('Marks picker', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        if (await isPickerOpen()) {
            await closePicker();
        }
    });

    describe('with buffer marks', function () {
        beforeEach(async function () {
            await setupEditor('first line\nsecond line\nthird line', {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimHandleKey('m');
            await vimHandleKey('a');
            await browser.pause(PAUSE.KEY_GAP);

            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
            await vimHandleKey('m');
            await vimHandleKey('b');
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('should open marks picker via :marks', async function () {
            await handleEx('marks');
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show buffer marks in picker', async function () {
            await handleEx('marks');
            await browser.pause(300);

            const labels = await getPickerItemLabels();
            expect(labels).toContain('a');
            expect(labels).toContain('b');
        });

        it('should show group header for buffer marks', async function () {
            await handleEx('marks');
            await browser.pause(300);

            const headers = await getPickerGroupHeaders();
            expect(headers).toContain('Buffer marks');
        });

        it('should show line number in description', async function () {
            await handleEx('marks');
            await browser.pause(300);

            const descriptions = await getPickerItemDescriptions();
            const descA = descriptions.find((d) => d.includes('L1:'));
            expect(descA).toBeDefined();
        });

        it('should navigate to mark on selection', async function () {
            await browser.keys(['j', 'j']);
            await browser.pause(PAUSE.KEY_GAP);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await handleEx('marks');
            await browser.pause(300);

            await browser.executeObsidian(() => {
                const input = document.querySelector(
                    '.vim-motions-picker-input',
                ) as HTMLInputElement | null;
                if (input) {
                    input.dispatchEvent(
                        new KeyboardEvent('keydown', {
                            key: 'Enter',
                            bubbles: true,
                        }),
                    );
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursor = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    return view?.editor.getCursor() ?? { line: -1, ch: -1 };
                },
            )) as { line: number; ch: number };

            expect(cursor.line).toBeLessThanOrEqual(1);
        });
    });

    describe('with no marks', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    markStore?: {
                                        load: (data: unknown[]) => void;
                                    };
                                    saveSettings: () => Promise<void>;
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (!plugin) return;
                plugin.settings.persistedMarks = [];
                plugin.markStore?.load([]);
                plugin.saveSettings();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        beforeEach(async function () {
            await setupEditor('empty buffer\n', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
        });

        it('should show empty picker when no marks exist', async function () {
            await handleEx('marks');
            await browser.pause(300);

            expect(await isPickerOpen()).toBe(true);
            expect(await getPickerItemCount()).toBe(0);
        });

        it('should show no group headers when no marks exist', async function () {
            await handleEx('marks');
            await browser.pause(300);

            const headers = await getPickerGroupHeaders();
            expect(headers.length).toBe(0);
        });
    });

    describe('group headers', function () {
        it('should not be selectable via keyboard', async function () {
            await setupEditor('test line\nsecond\n', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimHandleKey('m');
            await vimHandleKey('a');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await handleEx('marks');
            await browser.pause(300);

            const selectedBefore = (await browser.executeObsidian(() => {
                const el = document.querySelector(
                    '.vim-motions-picker-item.is-selected',
                );
                return (
                    el?.querySelector('.vim-motions-picker-item-label')
                        ?.textContent ?? ''
                );
            })) as string;

            expect(selectedBefore).not.toBe('');

            const headerSelected = (await browser.executeObsidian(() => {
                return !!document.querySelector(
                    '.vim-motions-picker-group-header.is-selected',
                );
            })) as boolean;
            expect(headerSelected).toBe(false);
        });
    });
});
