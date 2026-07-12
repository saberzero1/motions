import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

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

async function handleEx(
    command: string,
): Promise<{ success?: true; error?: string }> {
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
    }, command)) as { success?: true; error?: string };
}

async function hasPickerSource(name: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, n: string) => {
        const plugin = (
            app as unknown as Record<string, Record<string, unknown>>
        ).plugins?.plugins?.['vim-motions'] as
            | { pickerAPI?: { hasSource: (n: string) => boolean } }
            | undefined;
        return plugin?.pickerAPI?.hasSource(n) ?? false;
    }, name)) as boolean;
}

async function getPickerSourceNames(): Promise<string[]> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as Record<string, Record<string, unknown>>
        ).plugins?.plugins?.['vim-motions'] as
            | { pickerAPI?: { getSources: () => Array<{ name: string }> } }
            | undefined;
        return (plugin?.pickerAPI?.getSources() ?? []).map((s) => s.name);
    })) as string[];
}

describe('Picker integrations', function () {
    before(async function () {
        this.timeout(120000);
        await browser.reloadObsidian({
            vault: 'test-vault',
            plugins: [
                'vim-motions',
                'omnisearch',
                'obsidian-tasks-plugin',
                'dataview',
            ],
        });
        await browser.pause(5000);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(1000);
    });

    afterEach(async function () {
        if (await isPickerOpen()) {
            await closePicker();
        }
    });

    describe('Omnisearch integration', function () {
        it('should register omnisearch source when plugin is available', async function () {
            await browser.waitUntil(async () => hasPickerSource('omnisearch'), {
                timeout: 15000,
                timeoutMsg: 'omnisearch source not registered',
            });
        });

        it('should open omnisearch picker via :Picker omnisearch', async function () {
            const result = await handleEx('Picker omnisearch');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show results when searching', async function () {
            const result = await handleEx('Picker omnisearch');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);

            await browser.executeObsidian(() => {
                const input = document.querySelector(
                    '.vim-motions-picker-input',
                ) as HTMLInputElement | null;
                if (input) {
                    input.value = 'Welcome';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            await browser.pause(1000);

            const count = await getPickerItemCount();
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('Tasks integration', function () {
        it('should register tasks source when plugin is available', async function () {
            await browser.waitUntil(async () => hasPickerSource('tasks'), {
                timeout: 15000,
                timeoutMsg: 'tasks source not registered',
            });
        });

        it('should open tasks picker via :Picker tasks', async function () {
            const result = await handleEx('Picker tasks');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });
    });

    describe('Dataview integration', function () {
        it('should register dataview source when plugin is available', async function () {
            await browser.waitUntil(async () => hasPickerSource('dataview'), {
                timeout: 15000,
                timeoutMsg: 'dataview source not registered',
            });
        });

        it('should open dataview picker via :Picker dataview', async function () {
            const result = await handleEx('Picker dataview');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);
        });

        it('should show pages in results', async function () {
            const result = await handleEx('Picker dataview');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);
            const count = await getPickerItemCount();
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('Meta-picker with integrations', function () {
        it('should list integration sources in meta-picker', async function () {
            const sources = await getPickerSourceNames();
            expect(sources).toContain('omnisearch');
            expect(sources).toContain('tasks');
            expect(sources).toContain('dataview');
        });

        it(':Picker should show integration sources', async function () {
            const result = await handleEx('Picker');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);

            const count = await getPickerItemCount();
            expect(count).toBeGreaterThanOrEqual(15);
        });
    });

    describe('Plugin disable/enable', function () {
        it('should unregister source when plugin is disabled', async function () {
            expect(await hasPickerSource('omnisearch')).toBe(true);
            await obsidianPage.disablePlugin('omnisearch');
            await browser.pause(500);

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as Record<string, Record<string, unknown>>
                ).plugins?.plugins?.['vim-motions'] as
                    | { registerBundledIntegrations?: () => void }
                    | undefined;
                plugin?.registerBundledIntegrations?.();
            });
            await browser.pause(300);

            expect(await hasPickerSource('omnisearch')).toBe(false);
        });

        it('should re-register source when plugin is re-enabled', async function () {
            expect(await hasPickerSource('omnisearch')).toBe(false);
            await obsidianPage.enablePlugin('omnisearch');
            await browser.pause(2000);

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as Record<string, Record<string, unknown>>
                ).plugins?.plugins?.['vim-motions'] as
                    | { registerBundledIntegrations?: () => void }
                    | undefined;
                plugin?.registerBundledIntegrations?.();
            });
            await browser.pause(300);

            expect(await hasPickerSource('omnisearch')).toBe(true);
        });
    });
});
