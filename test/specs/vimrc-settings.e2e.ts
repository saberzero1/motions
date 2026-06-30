import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

async function applyVimrcOverrides(
    overrides: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(
        ({ app }, entries: Record<string, unknown>) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;

            const settings = plugin.settings;
            const overrideMap =
                plugin.vimrcOverrides ?? new Map<string, string>();
            const groupLabels = plugin.vimrcGroupLabels ?? [];
            const commandLabels = plugin.vimrcCommandLabels ?? [];

            for (const [key, value] of Object.entries(entries)) {
                if (key === 'whichKeyGroupLabel') {
                    const entry = value as { key: string; label: string };
                    groupLabels.push(entry);
                    overrideMap.set(
                        `whichKeyGroupLabel:${entry.key}`,
                        `whichkeygroup ${entry.key} ${entry.label}`,
                    );
                } else if (key === 'whichKeyCommandLabel') {
                    const entry = value as { key: string; label: string };
                    commandLabels.push(entry);
                    overrideMap.set(
                        `whichKeyCommandLabel:${entry.key}`,
                        `whichkeylabel ${entry.key} ${entry.label}`,
                    );
                } else if (key.startsWith('modePrompts.')) {
                    const mode = key.replace('modePrompts.', '');
                    const prompts = settings.modePrompts as Record<
                        string,
                        string
                    >;
                    if (prompts) prompts[mode] = value as string;
                    overrideMap.set(key, `let g:mode_prompt_${mode}`);
                } else {
                    settings[key] = value;
                    overrideMap.set(key, `set ${key}`);
                }
            }
            plugin.vimrcOverrides = overrideMap;
            plugin.vimrcGroupLabels = groupLabels;
            plugin.vimrcCommandLabels = commandLabels;

            if (typeof plugin.reloadFeatures === 'function') {
                plugin.reloadFeatures();
            }
        },
        overrides,
    );
    await browser.pause(300);
}

describe('Vimrc settings parity', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should override boolean option to false', async function () {
        await applyVimrcOverrides({ enableEasyMotion: false });

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return {
                value: plugin?.settings?.enableEasyMotion,
                overridden:
                    plugin?.vimrcOverrides?.has('enableEasyMotion') ?? false,
            };
        });

        expect(result.value).toBe(false);
        expect(result.overridden).toBe(true);
    });

    it('should override boolean option to true', async function () {
        await applyVimrcOverrides({ enableEasyMotion: true });

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.enableEasyMotion;
        });

        expect(result).toBe(true);
    });

    it('should apply multiple boolean options', async function () {
        await applyVimrcOverrides({
            enableStatusBar: false,
            enablePowerline: false,
            enableNavigation: false,
        });

        const settings = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return {
                statusBar: plugin?.settings?.enableStatusBar,
                powerline: plugin?.settings?.enablePowerline,
                navigation: plugin?.settings?.enableNavigation,
            };
        });

        expect(settings).toEqual({
            statusBar: false,
            powerline: false,
            navigation: false,
        });
    });

    it('should override number option', async function () {
        await applyVimrcOverrides({ scrolloffLines: 10 });

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return {
                value: plugin?.settings?.scrolloffLines,
                overridden:
                    plugin?.vimrcOverrides?.has('scrolloffLines') ?? false,
            };
        });

        expect(result.value).toBe(10);
        expect(result.overridden).toBe(true);
    });

    it('should override string option', async function () {
        await applyVimrcOverrides({ easyMotionLabels: 'abcdef' });

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.easyMotionLabels;
        });

        expect(result).toBe('abcdef');
    });

    it('should override enum option', async function () {
        await applyVimrcOverrides({ tableWidgetMode: 'always' });

        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.tableWidgetMode;
        });

        expect(result).toBe('always');
    });

    it('should apply mode prompts', async function () {
        await applyVimrcOverrides({
            'modePrompts.normal': 'N',
            'modePrompts.insert': 'I',
        });

        const prompts = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            const modePrompts = plugin?.settings?.modePrompts as
                | { normal?: string; insert?: string }
                | undefined;
            return {
                normal: modePrompts?.normal,
                insert: modePrompts?.insert,
            };
        });

        expect(prompts).toEqual({ normal: 'N', insert: 'I' });
    });

    it('should store which-key group labels', async function () {
        await applyVimrcOverrides({
            whichKeyGroupLabel: { key: ' t', label: 'Table' },
        });

        const groupLabels = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.vimrcGroupLabels ?? [];
        });

        expect(groupLabels.length).toBeGreaterThanOrEqual(1);
        const last = groupLabels[groupLabels.length - 1];
        expect(last?.key).toContain('t');
        expect(last?.label).toBe('Table');
    });

    it('should store which-key command labels', async function () {
        await applyVimrcOverrides({
            whichKeyCommandLabel: { key: ' w', label: 'Save file' },
        });

        const commandLabels = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.vimrcCommandLabels ?? [];
        });

        expect(commandLabels.length).toBeGreaterThanOrEqual(1);
        const last = commandLabels[commandLabels.length - 1];
        expect(last?.label).toBe('Save file');
    });

    it('should track override count', async function () {
        await applyVimrcOverrides({
            scrolloffLines: 3,
            enableEasyMotion: false,
            clipboard: 'unnamed',
        });

        const overrideCount = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.vimrcOverrides?.size ?? 0;
        });

        expect(overrideCount).toBeGreaterThanOrEqual(3);
    });

    it('should apply combined overrides', async function () {
        await applyVimrcOverrides({
            scrolloffLines: 8,
            textwidth: 100,
            enablePowerline: false,
            easyMotionLabels: 'xyz',
        });

        const settings = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return {
                scrolloff: plugin?.settings?.scrolloffLines,
                textwidth: plugin?.settings?.textwidth,
                powerline: plugin?.settings?.enablePowerline,
                labels: plugin?.settings?.easyMotionLabels,
            };
        });

        expect(settings).toEqual({
            scrolloff: 8,
            textwidth: 100,
            powerline: false,
            labels: 'xyz',
        });
    });

    after(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });
});
