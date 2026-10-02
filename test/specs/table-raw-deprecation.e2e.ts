import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getNotices,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSetting,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E3, step E3.1.
 *
 * `tableWidgetMode: 'raw'` is a documented vimrc and Lua option, so it keeps
 * working — this release deprecates it rather than removing it. The notice is
 * therefore the only signal a user gets, and it must fire **once per session**
 * rather than once per table render.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '',
    'Line below',
].join('\n');

const DEPRECATION = 'deprecated';

async function rawNotices(): Promise<string[]> {
    const all = await getNotices();
    return all.filter(
        (n) =>
            n.toLowerCase().includes(DEPRECATION) &&
            n.toLowerCase().includes('raw'),
    );
}

async function dismissNotices(): Promise<void> {
    await browser.executeObsidian(() => {
        document
            .querySelectorAll('.notice')
            .forEach((n) => (n as HTMLElement).remove());
    });
}

describe('tableWidgetMode raw deprecation (Plan E3)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('still works, and says so once', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await dismissNotices();

        await setPluginSettingAndReload('tableWidgetMode', 'raw');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);

        // Deprecated, not removed: the setting must still resolve to `raw`.
        const resolved = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { tableWidgetMode: string } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings.tableWidgetMode ?? null;
        });
        expect(resolved).toBe('raw');

        expect((await rawNotices()).length).toBe(1);
    });

    it('does not re-notify when an unrelated setting is reloaded', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await dismissNotices();
        await setPluginSettingAndReload('tableWidgetMode', 'raw');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(700);
        expect((await rawNotices()).length).toBe(1);

        await dismissNotices();

        // The stimulus has to be a **settings reload**, because that is what
        // runs the notice path (`populateRuntimeSlots`). Document edits and
        // cursor movement never reach it, so a render-based stimulus leaves the
        // once-per-session flag unexercised and the scenario vacuous — measured:
        // deleting the flag entirely passed a render-based version of this test.
        for (const value of [4, 6, 4]) {
            await setPluginSettingAndReload('scrolloffLines', value);
            await browser.pause(400);
        }

        // Zero, because the one notice already fired and was dismissed, and
        // three unrelated reloads must not produce another.
        expect((await rawNotices()).length).toBe(0);
    });

    it('re-notifies after the user leaves raw and returns to it', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'raw');
        await browser.pause(500);
        await dismissNotices();

        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await browser.pause(500);
        // Leaving raw must produce no deprecation notice of its own.
        expect((await rawNotices()).length).toBe(0);

        await setPluginSettingAndReload('tableWidgetMode', 'raw');
        await browser.pause(600);
        // Returning is a fresh choice, so the warning is due again.
        expect((await rawNotices()).length).toBe(1);
    });

    it('set tablewidget=always resolves to native, not raw', async () => {
        // The vimrc/Lua option path has its own legacy mapping in
        // `src/vim/options.ts`, separate from the stored-settings migration.
        // `always` historically meant raw; raw renders the table as nothing,
        // so it retargets to native like every other legacy value.
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await dismissNotices();

        const ex = await handleEx('set tablewidget=always');
        expect(ex.unknownCommand).toBe(false);
        await browser.pause(600);

        const resolved = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { tableWidgetMode: string } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings.tableWidgetMode ?? null;
        });

        expect(resolved).toBe('native');
        // And therefore no raw deprecation notice, because the user never
        // arrived at raw.
        expect((await rawNotices()).length).toBe(0);
    });

    it('set tablewidget=raw is accepted and warns', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await dismissNotices();

        const ex = await handleEx('set tablewidget=raw');
        expect(ex.unknownCommand).toBe(false);
        await browser.pause(600);

        const resolved = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { tableWidgetMode: string } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings.tableWidgetMode ?? null;
        });

        // Deprecated, not removed: a documented option must keep working.
        expect(resolved).toBe('raw');
        expect((await rawNotices()).length).toBe(1);
    });

    it('never notifies for native or owned', async () => {
        for (const mode of ['native', 'owned'] as const) {
            await setPluginSettingAndReload('tableWidgetMode', 'native');
            await dismissNotices();
            await setPluginSetting('tableWidgetMode', mode);
            await setPluginSettingAndReload('tableWidgetMode', mode);
            await ensureLivePreview();
            await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
            await browser.pause(700);
            expect((await rawNotices()).length).toBe(0);
        }
    });
});
