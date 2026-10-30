import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { getRegisterContent, loadLuaConfig, setupEditor } from '../helpers';

/**
 * A Lua function mapping keeps working after reloadFeatures().
 *
 * reloadFeatures() runs on many settings changes. It tears the vim
 * registration down, and unregisterAll() redefines every action it held as
 * a no-op; applyLuaMaps then remapped the keys but defined only actions whose
 * names it had not seen, so every Lua function mapping stayed mapped to a
 * no-op until the next restart. Measured before the fix: the mapping was
 * still listed, and pressing it did nothing.
 *
 * Alt chords, because Obsidian binds none of them by default.
 */

const LUA = [
    "vim.keymap.set('n', '<A-y>', function() vim.fn.setreg('z', 'fired') end)",
].join('\n');

async function reloadFeatures(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, { reloadFeatures: () => void }>;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin?.reloadFeatures();
    });
    await browser.pause(300);
}

async function pressMapping(): Promise<string | null> {
    await setupEditor('some text', { line: 0, ch: 0 });
    await browser.executeObsidian(() => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: { getRegisterController(): unknown };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        const controller = Vim?.getRegisterController() as
            | { getRegister(name: string): { setText(t: string): void } }
            | undefined;
        controller?.getRegister('z').setText('');
    });
    await browser.keys(['Escape']);
    await browser.pause(200);
    await browser.keys([Key.Alt, 'y']);
    await browser.keys([Key.Alt]);
    await browser.pause(400);
    return (await getRegisterContent('z'))?.text ?? null;
}

describe('Lua function mappings across reloadFeatures()', function () {
    this.timeout(120000);

    before(async function () {
        await loadLuaConfig(LUA);
    });

    it('fires before any reload', async function () {
        expect(await pressMapping()).toBe('fired');
    });

    it('still fires after a reload, and after a second one', async function () {
        await reloadFeatures();
        const afterOne = await pressMapping();
        await reloadFeatures();
        const afterTwo = await pressMapping();

        expect(afterOne).toBe('fired');
        expect(afterTwo).toBe('fired');
    });
});
