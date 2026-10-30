import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import {
    getRegisterContent,
    loadLuaConfig,
    PAUSE,
    sendVimEscape,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * While the plugin holds the keyboard for a modal input, Obsidian's hotkeys
 * do not run underneath it.
 *
 * Obsidian's Keymap handles its hotkeys on `window` in the capture phase,
 * ahead of the plugin's `document` listener, and stops the event. So with
 * Obsidian's default Ctrl+D (Delete paragraph) bound, pressing it while flash
 * or EasyMotion labels were up, or while a Lua `vim.fn.getcharstr()` was
 * waiting, deleted a paragraph and the input never saw the key. Hint mode had
 * the same fault (`hint-mode-ctrl-hotkeys.e2e.ts`).
 *
 * The test vault unbinds Delete paragraph; each scenario restores it.
 */

const DOC = 'alpha beta gamma\nabc abd abe abf\nthird line here';

async function restoreDeleteParagraph(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const hm = (
            app as unknown as {
                hotkeyManager: {
                    removeHotkeys(id: string): void;
                    bake(): void;
                };
            }
        ).hotkeyManager;
        hm.removeHotkeys('editor:delete-paragraph');
        hm.bake();
    });
}

async function noteText(): Promise<string> {
    return (await browser.executeObsidian(
        ({ app, obsidian }) =>
            app.workspace
                .getActiveViewOfType(obsidian.MarkdownView)
                ?.editor.getValue() ?? '',
    )) as string;
}

async function pressCtrlD(): Promise<void> {
    await browser.keys([Key.Ctrl, 'd']);
    await browser.keys([Key.Ctrl]);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Obsidian hotkeys during a modal key capture', function () {
    this.timeout(120000);

    before(async function () {
        await loadLuaConfig(
            [
                "vim.keymap.set('n', '<F7>', function()",
                '  vim.schedule(function()',
                '    local ok, key = pcall(vim.fn.getcharstr)',
                "    vim.fn.setreg('z', ok and (key or 'nil') or 'error')",
                '  end)',
                'end)',
            ].join('\n'),
        );
        await setPluginSettingAndReload('flashJumpEnabled', true);
        await restoreDeleteParagraph();
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('Ctrl+D during flash jump input leaves the note alone', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.keys(['s', 'a']);
        await browser.pause(300);

        await pressCtrlD();

        expect(await noteText()).toBe(DOC);
    });

    it('Ctrl+D while EasyMotion labels are up leaves the note alone', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: { handleKey(cm: unknown, k: string): void };
                    };
                }
            ).CodeMirrorAdapter.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const adapter = (view.editor as unknown as { cm: { cm: unknown } })
                .cm.cm;
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');
        });
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(
                    () =>
                        document.querySelectorAll(
                            '.vim-motions-easymotion-label',
                        ).length > 0,
                )) as boolean,
            {
                timeout: 3000,
                interval: 100,
                timeoutMsg: 'no EasyMotion labels',
            },
        );

        await pressCtrlD();

        expect(await noteText()).toBe(DOC);
    });

    it('Ctrl+D while getcharstr waits reaches getcharstr, not Obsidian', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.executeObsidian(() => {
            (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: {
                            getRegisterController(): {
                                getRegister(n: string): {
                                    setText(t: string): void;
                                };
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter.Vim.getRegisterController()
                .getRegister('z')
                .setText('');
        });
        await browser.keys([Key.F7]);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await pressCtrlD();

        expect(await noteText()).toBe(DOC);
        // The key arrived. Which value it arrives as is a separate deviation:
        // Neovim returns "\4" for Ctrl+D, this returns the letter.
        expect((await getRegisterContent('z'))?.text ?? '').not.toBe('');
    });

    it('Ctrl+D is Obsidian’s with no capture running (control)', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await sendVimEscape();

        await pressCtrlD();

        expect(await noteText()).not.toBe(DOC);
    });
});
