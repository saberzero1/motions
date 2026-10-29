import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getCursorPos,
    getEditorValue,
    getVimMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * `tableWidgetMode: reveal` with Obsidian's own Vim key bindings.
 *
 * With Obsidian's vim on, the plugin stands its own vim layer down entirely —
 * `setupVimSubsystems` never runs and nothing in `vimExtensionSlot` is
 * installed. The reveal surface is registered outside that slot because it
 * needs nothing from the bundled fork: the active table becomes ordinary
 * lines, and whichever vim is running edits them.
 *
 * Each scenario first establishes which vim is running, because every other
 * reading here would also pass under the bundled engine: Obsidian's `vimMode`
 * config, the plugin's own `vimEnabled` dropped to false, and a vim state on
 * the editor's adapter. Keys are sent raw, so no helper reaches the fork.
 */

const DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Below the table here',
].join('\n');

interface Probe {
    builtinVim: boolean;
    pluginVimEnabled: boolean;
    adapterHasVim: boolean;
    widgets: number;
    pipeLines: number;
    tableCell: boolean;
    parentFocused: boolean;
    channel: boolean;
}

interface RevealPlugin {
    settings: { vimEnabled: boolean };
    getTableRevealReport(): { channel: boolean };
}

async function probe(): Promise<Probe> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RevealPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  dom: HTMLElement;
                  contentDOM: HTMLElement;
                  hasFocus: boolean;
                  cm?: { state?: { vim?: unknown } };
              }
            | undefined;
        const lines = cm
            ? (Array.from(
                  cm.contentDOM.querySelectorAll('.cm-line'),
              ) as HTMLElement[])
            : [];
        return {
            builtinVim:
                (
                    app.vault as unknown as { getConfig(k: string): unknown }
                ).getConfig('vimMode') === true,
            pluginVimEnabled: plugin?.settings.vimEnabled ?? true,
            adapterHasVim: !!cm?.cm?.state?.vim,
            widgets: cm
                ? cm.dom.querySelectorAll('.cm-table-widget').length
                : -1,
            pipeLines: lines.filter((l) => (l.textContent ?? '').includes('|'))
                .length,
            tableCell: !!(
                view as unknown as { editMode?: { tableCell?: unknown } }
            )?.editMode?.tableCell,
            parentFocused: cm?.hasFocus ?? false,
            channel: plugin?.getTableRevealReport().channel ?? false,
        };
    })) as Probe;
}

async function keys(...k: string[]): Promise<void> {
    for (const key of k) {
        await browser.keys([key]);
        await browser.pause(80);
    }
    await browser.pause(350);
}

async function setBuiltinVim(on: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, value: boolean) => {
        (
            app.vault as unknown as { setConfig(k: string, v: unknown): void }
        ).setConfig('vimMode', value);
    }, on);
    // `setConfig` writes `app.json` on a debounce; the reboot below must
    // find the value on disk.
    await browser.pause(2500);
}

describe('Table reveal surface with Obsidian’s own Vim key bindings', function () {
    this.timeout(240000);

    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
        await setBuiltinVim(true);
        // Rebooted with Obsidian's vim already on, which is how a user of it
        // starts the plugin: every gate is evaluated at load with the
        // setting in place. Turning it on only at runtime left a restored
        // `builtin-vim` blocker unnoticed, because the slot had already been
        // built before the setting changed.
        await browser.reloadObsidian();
        await loadSingleFileWorkspace();
        await ensureLivePreview();
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await keys('Escape');
    });

    after(async function () {
        await setBuiltinVim(false);
        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('vim-motions:enable-vim-mode');
        });
        await browser.pause(800);
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('runs under Obsidian’s vim, with the plugin’s own layer down', async function () {
        const p = await probe();
        expect(p.builtinVim).toBe(true);
        expect(p.pluginVimEnabled).toBe(false);
        expect(p.adapterHasVim).toBe(true);
        expect(p.channel).toBe(true);
        expect(p.widgets).toBe(1);
        expect(p.pipeLines).toBe(0);
    });

    it('reveals the table on the keystroke that enters it', async function () {
        await keys('j', 'j');
        const header = await probe();
        const headerPos = await getCursorPos();
        await keys('j');
        const separatorPos = await getCursorPos();
        const separator = await probe();

        expect(header.pluginVimEnabled).toBe(false);
        expect(headerPos).toEqual({ line: 2, ch: 0 });
        expect(header.widgets).toBe(0);
        expect(header.pipeLines).toBe(4);
        expect(header.tableCell).toBe(false);
        expect(header.parentFocused).toBe(true);
        expect(separatorPos).toEqual({ line: 3, ch: 0 });
        expect(separator.tableCell).toBe(false);
    });

    it('edits the revealed table with Obsidian’s vim', async function () {
        await keys('j', 'j', 'j', 'j');
        expect(await getCursorPos()).toEqual({ line: 4, ch: 0 });
        await keys('x');
        const afterX = await getEditorValue();
        await keys('u');
        const afterU = await getEditorValue();
        await keys('d', 'd');
        const afterDD = await getEditorValue();
        await keys('u');
        await keys('w', 'i', 'Q', 'Escape');
        const afterInsert = await getEditorValue();
        const mode = await getVimMode();

        expect(afterX.split('\n')[4]).toBe(' aa   | 11    |');
        expect(afterU).toBe(DOC);
        expect(afterDD.split('\n')[4]).toBe('| bb   | 22    |');
        expect(afterInsert.split('\n')[4]).toBe('| Qaa   | 11    |');
        expect(mode).toBe('normal');
        expect((await probe()).widgets).toBe(0);
    });

    it('applies visual block across rows', async function () {
        await keys('j', 'j', 'j', 'j', 'l', 'l');
        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(150);
        await keys('j', 'l', 'd');
        const lines = (await getEditorValue()).split('\n');
        expect(lines[4]).toBe('|    | 11    |');
        expect(lines[5]).toBe('|    | 22    |');
    });

    it('moves between cells with Tab in insert mode', async function () {
        await keys('j', 'j', 'j', 'j', 'l', 'l', 'i');
        await keys('Tab');
        const pos = await getCursorPos();
        await keys('Escape');

        // Obsidian's own Tab handling sits below the bundled keymap here too,
        // with Obsidian's vim rather than the fork deciding insert mode.
        expect(pos).toEqual({ line: 4, ch: 9 });
        expect(await getEditorValue()).toBe(DOC);
    });

    it('realigns an edited table on leaving insert mode when tableAutoRealign is on', async function () {
        await setPluginSettingAndReload('tableAutoRealign', true);
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await keys('Escape');
        await keys('j', 'j', 'j', 'j', 'l', 'l', 'l', 'a');
        await keys('x', 'x', 'x', 'x', 'Escape');
        const lines = (await getEditorValue()).split('\n');
        await setPluginSettingAndReload('tableAutoRealign', false);

        expect(lines.slice(2, 6)).toEqual([
            '| Name   | Value |',
            '| ------ | ----- |',
            '| aaxxxx | 11    |',
            '| bb     | 22    |',
        ]);
    });

    it('hands the table back on leaving, and places the caret on a click', async function () {
        await keys('j', 'j', 'j', 'j', 'j', 'j', 'j');
        const left = await probe();
        expect((await getCursorPos()).line).toBe(7);
        expect(left.widgets).toBe(1);

        await browser.$('.cm-table-widget tbody tr:nth-child(1) td').click();
        await browser.pause(400);
        const clicked = await probe();
        expect((await getCursorPos()).line).toBe(4);
        expect(clicked.widgets).toBe(0);
        expect(clicked.tableCell).toBe(false);
        expect(clicked.parentFocused).toBe(true);
    });
});
