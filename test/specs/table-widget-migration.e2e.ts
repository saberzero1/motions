import { browser, expect } from '@wdio/globals';

// `auto` became the default `tableWidgetMode`. Settings are saved whole,
// defaults included, so a stored `native` from before cannot be told apart
// from the old default, and it moves to `auto` once. A `native` chosen after
// that move is saved with the marker and stays.

const DATA = '.obsidian/plugins/vim-motions/data.json';

interface Loaded {
    mode: string;
    marker: unknown;
    saved: Record<string, unknown>;
}

/** Stores `patch` over the current settings, then loads the plugin cold. */
async function loadWith(patch: Record<string, unknown>): Promise<Loaded> {
    return (await browser.executeObsidian(
        async ({ app }, path: string, changes: Record<string, unknown>) => {
            const plugins = (
                app as unknown as {
                    plugins: {
                        disablePlugin(id: string): Promise<void>;
                        enablePlugin(id: string): Promise<void>;
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings(): Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins;
            const stored = JSON.parse(
                await app.vault.adapter.read(path),
            ) as Record<string, unknown>;
            for (const [key, value] of Object.entries(changes)) {
                // `null` deletes: JSON drops an `undefined` on the way here.
                if (value === null) delete stored[key];
                else stored[key] = value;
            }
            await app.vault.adapter.write(path, JSON.stringify(stored));
            await plugins.disablePlugin('vim-motions');
            await plugins.enablePlugin('vim-motions');
            const plugin = plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions did not load');
            await plugin.saveSettings();
            return {
                mode: plugin.settings.tableWidgetMode as string,
                marker: plugin.settings.tableWidgetAutoMigrated,
                saved: JSON.parse(await app.vault.adapter.read(path)) as Record<
                    string,
                    unknown
                >,
            };
        },
        DATA,
        patch,
    )) as Loaded;
}

describe('The table widget moves to auto once', function () {
    this.timeout(120000);
    let original = '';

    before(async function () {
        original = (await browser.executeObsidian(
            async ({ app }, path: string) => app.vault.adapter.read(path),
            DATA,
        )) as string;
    });

    after(async function () {
        await browser.executeObsidian(
            async ({ app }, path: string, text: string) => {
                await app.vault.adapter.write(path, text);
                const plugins = (
                    app as unknown as {
                        plugins: {
                            disablePlugin(id: string): Promise<void>;
                            enablePlugin(id: string): Promise<void>;
                        };
                    }
                ).plugins;
                await plugins.disablePlugin('vim-motions');
                await plugins.enablePlugin('vim-motions');
            },
            DATA,
            original,
        );
    });

    it('moves a native saved before auto, and records the move', async function () {
        const loaded = await loadWith({
            tableWidgetMode: 'native',
            tableWidgetAutoMigrated: null,
        });
        expect({
            mode: loaded.mode,
            savedMode: loaded.saved.tableWidgetMode,
            savedMarker: loaded.saved.tableWidgetAutoMigrated,
        }).toEqual({ mode: 'auto', savedMode: 'auto', savedMarker: true });
    });

    it('keeps a native chosen after the move', async function () {
        const loaded = await loadWith({
            tableWidgetMode: 'native',
            tableWidgetAutoMigrated: true,
        });
        expect({ mode: loaded.mode, marker: loaded.marker }).toEqual({
            mode: 'native',
            marker: true,
        });
    });

    // Fresh settings have nothing to move, and must not mistake a `native`
    // picked later for the old default.
    it('keeps a native picked on fresh settings', async function () {
        const fresh = await browser.executeObsidian(
            async ({ app }, path: string) => {
                const plugins = (
                    app as unknown as {
                        plugins: {
                            disablePlugin(id: string): Promise<void>;
                            enablePlugin(id: string): Promise<void>;
                            plugins: Record<
                                string,
                                {
                                    settings: Record<string, unknown>;
                                    saveSettings(): Promise<void>;
                                }
                            >;
                        };
                    }
                ).plugins;
                await app.vault.adapter.write(path, '{}');
                await plugins.disablePlugin('vim-motions');
                await plugins.enablePlugin('vim-motions');
                const plugin = plugins.plugins['vim-motions'];
                if (!plugin) throw new Error('Vim Motions did not load');
                const mode = plugin.settings.tableWidgetMode;
                plugin.settings.tableWidgetMode = 'native';
                await plugin.saveSettings();
                return mode;
            },
            DATA,
        );
        const reloaded = await loadWith({});
        expect({ fresh, reloaded: reloaded.mode }).toEqual({
            fresh: 'auto',
            reloaded: 'native',
        });
    });

    it('leaves reveal alone', async function () {
        const loaded = await loadWith({
            tableWidgetMode: 'reveal',
            tableWidgetAutoMigrated: null,
        });
        expect(loaded.mode).toBe('reveal');
    });
});
