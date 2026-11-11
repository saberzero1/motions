import { browser, expect } from '@wdio/globals';
import {
    getCursorPos,
    getRegisterContent,
    loadLuaConfig,
    loadTwoFileWorkspace,
    PAUSE,
    setupEditor,
} from '../helpers';

// A Lua function mapping is one keymap entry, however often the plugin
// re-registers its bindings. Two things stacked copies:
//
// - The loader maps a function as soon as `vim.keymap.set` runs, and
//   applyLuaMaps mapped it again under a second action name, so `j` here had
//   two entries until the next settings reload.
// - On every reload the plugin removed its own `Q` -> `@@` by keys alone,
//   which takes the newest user entry: the Lua mapping on `Q`. The Lua mapping
//   came back, and another `@@` was stacked under it each time.
//
// Read from the engine's keymap, then press the keys, so the entries being
// single is not mistaken for the mappings being gone.

const CONFIG =
    'vim.keymap.set("n", "j", function() return vim.v.count == 0 and "gj" or "j" end, { expr = true })\n' +
    'vim.keymap.set("n", "Q", function() vim.fn.setreg("q", "ran") end)\n';

async function entries(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: {
                        getKeymap(): {
                            keys: string;
                            type: string;
                            action?: string;
                            toKeys?: string;
                            motion?: string;
                            context?: string;
                        }[];
                    };
                };
            }
        ).CodeMirrorAdapter.Vim;
        return Vim.getKeymap()
            .filter((e) => e.keys === 'j' || e.keys === 'Q')
            .map((e) =>
                [
                    e.keys,
                    e.type,
                    // The Lua action's name carries a counter; its kind is
                    // what matters.
                    e.action?.startsWith('lua-action-')
                        ? 'lua'
                        : (e.action ?? e.toKeys ?? e.motion),
                    e.context ?? '-',
                ].join(':'),
            );
    })) as string[];
}

const SINGLE = [
    'Q:action:lua:normal',
    'j:action:lua:normal',
    'Q:keyToKey:@@:normal',
    'j:motion:moveByLines:-',
];

describe('A Lua function mapping stays one keymap entry', function () {
    this.timeout(180000);

    before(async function () {
        await loadLuaConfig(CONFIG);
    });

    it('after the config loads', async function () {
        expect(await entries()).toEqual(SINGLE);
    });

    it('after three settings reloads', async function () {
        for (let i = 0; i < 3; i++) {
            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { reloadFeatures(): void }>;
                        };
                    }
                ).plugins.plugins['vim-motions']?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }
        expect(await entries()).toEqual(SINGLE);
    });

    it('after four switches between notes', async function () {
        await loadTwoFileWorkspace();
        for (let i = 0; i < 4; i++) {
            await browser.executeObsidian(({ app }) => {
                const leaves = app.workspace.getLeavesOfType('markdown');
                const active = app.workspace.getMostRecentLeaf();
                const other = leaves.find((l) => l !== active) ?? leaves[0];
                if (other) app.workspace.setActiveLeaf(other, { focus: true });
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }
        expect(await entries()).toEqual(SINGLE);
    });

    it('and both mappings still work', async function () {
        await setupEditor('l0\nl1\nl2\nl3\nl4', { line: 0, ch: 0 });
        for (const key of ['j', 'j', 'Q']) {
            await browser.keys([key]);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect({
            line: (await getCursorPos()).line,
            q: (await getRegisterContent('q'))?.text,
        }).toEqual({ line: 2, q: 'ran' });
    });
});
