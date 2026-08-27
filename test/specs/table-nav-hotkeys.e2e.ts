/**
 * Issue #146: Cannot use Obsidian's hotkeys inside a table
 *
 * Root cause: The table-nav Scope was created without a parent,
 * disconnecting Obsidian's global hotkey bindings from the keymap
 * resolution chain. The catch-all register(null, null, ...) handler
 * and `default: return true` in the keymap handler compounded it
 * by consuming all unhandled keys.
 *
 * Fix: Parent both scopes to app.scope, return false for unhandled
 * keys, and remove stopImmediatePropagation from the scope handler.
 */
import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

const ENTRY_DEBOUNCE = 300;

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return container.querySelector('.cm-table-widget') !== null;
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
}

async function setupTableDoc(content = TABLE_DOC): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        if (
            editMode?.tableCell &&
            typeof editMode.destroyTableCell === 'function'
        ) {
            (editMode.destroyTableCell as () => void)();
        }
    });
    await browser.pause(PAUSE.MODE_SWITCH);
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await setupEditor(content, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
    await browser.pause(200);
}

async function hasTableNavHighlight(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return document.querySelector('.vim-motions-table-nav-active') !== null;
    })) as boolean;
}

async function enterTableNav(): Promise<void> {
    await browser.keys(['j', 'j']);
    await browser.pause(ENTRY_DEBOUNCE);
}

async function setPluginSettings(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            saveSettings: () => Promise<void>;
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        for (const [k, v] of Object.entries(s)) {
            plugin.settings[k] = v;
        }
        plugin.saveSettings();
        plugin.reloadFeatures();
    }, settings);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function hasModalOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return document.querySelector('.modal-container') !== null;
    })) as boolean;
}

async function closeModal(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

describe('Table-nav hotkey passthrough (#146)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        if (await hasModalOpen()) {
            await closeModal();
        }
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('Ctrl+P should open command palette while in table-nav mode (#146)', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableNav();

        expect(await hasTableNavHighlight()).toBe(true);

        const { isMacOS } = await obsidianPage.getPlatform();
        const mod = isMacOS ? Key.Command : Key.Control;
        await browser.keys([mod, 'p']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await hasModalOpen()).toBe(true);
    });
});
