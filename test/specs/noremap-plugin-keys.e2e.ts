import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getCursorPos,
    getEditorValue,
    handleEx,
    loadLuaConfig,
    sendVimEscape,
    setupEditor,
    PAUSE,
} from '../helpers';

/**
 * A noremap rhs reaches the plugin's own keys, as it reaches a Vim built-in
 * (#234). Measured before the fix with the plugin's `K`: `vim.keymap.set("n",
 * "X", "K")` and `nvim_feedkeys("K", "n", false)` from a function mapping on
 * `K` both did nothing, because a noremap expansion searched only the
 * engine's defaults and the plugin registers its keys as mappings. `]h` is
 * used here because it moves the cursor, which is observable without a
 * preview.
 *
 * A user's own function mapping is still a user mapping to a noremap rhs,
 * which skips it as Vim does.
 */

const DOC = '# One\ntext\n# Two\nmore';

const LUA = `
vim.keymap.set("n", "]h", function() end)
vim.keymap.set("n", "<F6>", "]h")
vim.keymap.set("n", "<F7>", function()
    vim.api.nvim_feedkeys("]h", "n", false)
end)
vim.keymap.set("n", "<F8>", function()
    vim.api.nvim_buf_set_lines(0, 0, 1, false, { "hit" })
end)
vim.keymap.set("n", "<F9>", "<F8>")
`;

async function press(key: string): Promise<void> {
    await setupEditor(DOC, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.keys([key]);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function loadVimrc(content: string): Promise<void> {
    await obsidianPage.write('.obsidian.vimrc', content);
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { reloadAllConfigs?: () => Promise<void> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        await plugin?.reloadAllConfigs?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('noremap reaches the plugin’s own keys (#234)', function () {
    describe('Lua', function () {
        before(async function () {
            await loadLuaConfig(LUA);
        });
        after(async function () {
            await loadLuaConfig('');
        });

        it('a user mapping on ]h wins when ]h is pressed (control)', async function () {
            await press(']');
            await browser.keys(['h']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect((await getCursorPos()).line).toBe(0);
        });

        it('vim.keymap.set("n", lhs, "]h") runs the plugin’s ]h, past the user’s', async function () {
            await press(Key.F6);
            expect((await getCursorPos()).line).toBe(2);
        });

        it('nvim_feedkeys("]h", "n") from a function mapping runs the plugin’s ]h', async function () {
            await press(Key.F7);
            expect((await getCursorPos()).line).toBe(2);
        });

        it(':normal! ]h runs the plugin’s ]h, past the user’s', async function () {
            await setupEditor(DOC, { line: 0, ch: 0 });
            await sendVimEscape();
            const result = await handleEx('normal! ]h');
            expect(result.unknownCommand).toBe(false);
            expect((await getCursorPos()).line).toBe(2);
        });

        it('a user function mapping runs when pressed (control)', async function () {
            await press(Key.F8);
            expect((await getEditorValue()).split('\n')[0]).toBe('hit');
        });

        it('a noremap rhs skips a user function mapping, as in Vim', async function () {
            await press(Key.F9);
            expect(await getEditorValue()).toBe(DOC);
        });
    });

    describe('vimrc', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await loadVimrc('nnoremap <F6> ]h\n');
        });
        after(async function () {
            await browser.executeObsidian(async ({ app }) => {
                if (await app.vault.adapter.exists('.obsidian.vimrc')) {
                    await app.vault.adapter.remove('.obsidian.vimrc');
                }
            });
            await browser.reloadObsidian({ vault: 'test-vault' });
        });

        it('nnoremap lhs ]h runs the plugin’s ]h', async function () {
            await press(Key.F6);
            expect((await getCursorPos()).line).toBe(2);
        });
    });
});
