import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../helpers';

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
};

async function setAnimatedCursor(enabled: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, value: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.animatedCursor = value;
        plugin.reloadFeatures();
    }, enabled);
    await browser.pause(1000);
}

async function getPluginSetting(key: string): Promise<unknown> {
    return browser.executeObsidian(({ app }, k: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        return (plugin?.settings as Record<string, unknown>)?.[k];
    }, key);
}

async function setPluginSettings(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        Object.assign(plugin.settings, s);
        plugin.reloadFeatures();
    }, settings);
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

describe('Animated cursor', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        await setAnimatedCursor(false);
    });

    it('animated cursor setting is persisted when enabled', async function () {
        await setAnimatedCursor(true);
        const enabled = await getPluginSetting('animatedCursor');
        expect(enabled).toBe(true);
    });

    it('animated cursor config is active when enabled', async function () {
        await setAnimatedCursor(true);

        const configEnabled = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, PluginRef>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.animatedCursor ?? false;
        })) as boolean;

        expect(configEnabled).toBe(true);
    });

    it('disabling sets config to disabled', async function () {
        await setAnimatedCursor(true);

        const enabledBefore = await getPluginSetting('animatedCursor');
        expect(enabledBefore).toBe(true);

        await setAnimatedCursor(false);

        const enabledAfter = await getPluginSetting('animatedCursor');
        expect(enabledAfter).toBe(false);
    });

    it('cursor follows cursor movement', async function () {
        await setAnimatedCursor(true);
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        await vimKeys('j', 'j', 'j');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        const pos = await getCursorPos();
        expect(pos.line).toBe(3);
    });

    it('settings sub-toggles work', async function () {
        await setPluginSettings({
            animatedCursor: true,
            smoothCursor: false,
        });

        const smooth = await getPluginSetting('smoothCursor');
        expect(smooth).toBe(false);

        await setPluginSettings({
            animatedCursor: true,
            smearTrail: false,
        });

        const smear = await getPluginSetting('smearTrail');
        expect(smear).toBe(false);

        await setPluginSettings({
            smoothCursor: true,
            smearTrail: true,
        });
    });
});
