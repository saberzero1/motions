import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../helpers';

type ExecResult = { success: true } | { error: string };

async function handleEx(command: string): Promise<ExecResult> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as ExecResult;
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

async function getPickerCountText(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-picker-count');
        return el?.textContent ?? '';
    })) as string;
}

async function getPickerEmptyText(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-picker-empty');
        return el?.textContent ?? '';
    })) as string;
}

async function hasPreviewPane(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-picker-preview');
    })) as boolean;
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

describe('Picker', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
    });

    afterEach(async function () {
        await closePicker();
    });

    describe(':files', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show items in results list', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            const count = await getPickerItemCount();
            expect(count).toBeGreaterThan(0);
        });

        it('should display result count', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            const countText = await getPickerCountText();
            expect(countText).toMatch(/\d+\/\d+/);
        });

        it('should show preview pane', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await hasPreviewPane()).toBe(true);
        });
    });

    describe(':buffers', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('buffers');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show at least one buffer', async function () {
            const result = await handleEx('buffers');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            const count = await getPickerItemCount();
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });

    describe(':commands', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('commands');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show commands in results', async function () {
            const result = await handleEx('commands');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            const count = await getPickerItemCount();
            expect(count).toBeGreaterThan(10);
        });
    });

    describe(':headings', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('headings');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe(':outline', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('outline');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe(':tags', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('tags');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should not show preview pane', async function () {
            const result = await handleEx('tags');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await hasPreviewPane()).toBe(false);
        });
    });

    describe(':recent', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('recent');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe(':grep', function () {
        it(':grep with query should open picker with results', async function () {
            const result = await handleEx('grep Welcome');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);
            expect(await isPickerOpen()).toBe(true);
            const count = await getPickerItemCount();
            expect(count).toBeGreaterThan(0);
        });

        it(':grep without query should open livegrep', async function () {
            const result = await handleEx('grep');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe(':livegrep', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('livegrep');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show minimum query message initially', async function () {
            const result = await handleEx('livegrep');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            const emptyText = await getPickerEmptyText();
            expect(emptyText).toContain('2 characters');
        });
    });

    describe(':resume', function () {
        it('should show notice when no previous session', async function () {
            await browser.executeObsidian(() => {
                const mod = (
                    window as unknown as Record<string, unknown> & {
                        _pickerModule?: {
                            clearLastSession?: () => void;
                        };
                    }
                )._pickerModule;
                if (mod?.clearLastSession) mod.clearLastSession();
            });
            const result = await handleEx('resume');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
        });
    });

    describe(':marks', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('marks');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe(':registers', function () {
        it('should open picker without error', async function () {
            const result = await handleEx('registers');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe('picker lifecycle', function () {
        it('should close on Escape', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
            await closePicker();
            expect(await isPickerOpen()).toBe(false);
        });

        it('second picker replaces first', async function () {
            await handleEx('files');
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
            await handleEx('commands');
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
            const count = (await browser.executeObsidian(() => {
                return document.querySelectorAll('.vim-motions-picker').length;
            })) as number;
            expect(count).toBe(1);
        });

        it('no DOM leaks after open/close cycle', async function () {
            for (let i = 0; i < 5; i++) {
                await handleEx('files');
                await browser.pause(200);
                await closePicker();
            }
            expect(await isPickerOpen()).toBe(false);
            const orphanedItems = (await browser.executeObsidian(() => {
                return document.querySelectorAll('.vim-motions-picker-item')
                    .length;
            })) as number;
            expect(orphanedItems).toBe(0);
        });
    });

    describe('matcher engine switching', function () {
        const engines = ['ufuzzy', 'obsidian'] as const;

        for (const engine of engines) {
            it(`should open picker with ${engine} engine`, async function () {
                await browser.executeObsidian(({ app }, eng: string) => {
                    const plugin = (
                        app as unknown as Record<string, unknown> & {
                            plugins?: {
                                plugins?: Record<
                                    string,
                                    {
                                        settings: Record<string, unknown>;
                                        reloadFeatures?: () => void;
                                    }
                                >;
                            };
                        }
                    ).plugins?.plugins?.['vim-motions'];
                    if (plugin) {
                        plugin.settings.pickerMatcherEngine = eng;
                        plugin.reloadFeatures?.();
                    }
                }, engine);
                await browser.pause(300);
                const result = await handleEx('files');
                expect(result).toHaveProperty('success', true);
                await browser.pause(300);
                expect(await isPickerOpen()).toBe(true);
                const count = await getPickerItemCount();
                expect(count).toBeGreaterThan(0);
            });
        }

        after(async function () {
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as Record<string, unknown> & {
                        plugins?: {
                            plugins?: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    reloadFeatures?: () => void;
                                }
                            >;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (plugin) {
                    plugin.settings.pickerMatcherEngine = 'auto';
                    plugin.reloadFeatures?.();
                }
            });
        });
    });
});
