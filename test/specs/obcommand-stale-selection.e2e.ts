import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import {
    getEditorValue,
    loadLuaConfig,
    PAUSE,
    sendVimEscape,
    setupEditor,
} from '../helpers';

/**
 * `:obcommand` from a normal-mode mapping does not act on an old visual
 * selection (#200).
 *
 * The fork exits visual mode before it runs an ex command, so `:obcommand`
 * restores the selection that exit discarded (#161, #192). It restored it
 * whenever one existed, though, and `'<`/`'>` outlive the selection by any
 * number of keystrokes: a normal-mode `vim.cmd('obcommand …')` bolded text
 * selected long before. Measured before the fix, both normal-mode scenarios
 * below captured `beta`.
 *
 * The mappings are the issue's, on Alt chords because Obsidian binds none of
 * them by default. The capture command records the selection Obsidian hands
 * to an editor command; an empty string is a collapsed cursor.
 */

const CAPTURE = 'vim-motions-e2e-200-capture-selection';

const LUA = [
    `vim.keymap.set('n', '<A-b>', function() vim.cmd('obcommand ${CAPTURE}') end)`,
    `vim.keymap.set('v', '<A-b>', function() vim.cmd('obcommand ${CAPTURE}') end)`,
    // Leaves insert mode and runs the command in one task, so an insert exit
    // that marked the old selection as just ended would be caught here.
    `vim.keymap.set('i', '<A-n>', function() vim.cmd('stopinsert'); vim.cmd('obcommand ${CAPTURE}') end)`,
].join('\n');

async function registerCapture(): Promise<void> {
    await browser.executeObsidian(({ app }, id: string) => {
        app.commands.addCommand({
            id,
            name: 'Capture selection (#200 e2e)',
            editorCallback: (editor) => {
                (
                    window as unknown as { __vimMotions200?: string | null }
                ).__vimMotions200 = editor.getSelection();
            },
        });
    }, CAPTURE);
}

async function clearCapture(): Promise<void> {
    await browser.executeObsidian(() => {
        (
            window as unknown as { __vimMotions200?: string | null }
        ).__vimMotions200 = null;
    });
}

async function captured(): Promise<string | null> {
    return (await browser.executeObsidian(
        () =>
            (window as unknown as { __vimMotions200?: string | null })
                .__vimMotions200 ?? null,
    )) as string | null;
}

async function pressMapping(): Promise<void> {
    await browser.keys([Key.Alt, 'b']);
    await browser.keys([Key.Alt]);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

/** Selects `beta` charwise and leaves visual mode with Escape. */
async function selectBetaThenEscape(): Promise<void> {
    await setupEditor('alpha beta gamma\nsecond line here', {
        line: 0,
        ch: 6,
    });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['v', 'l', 'l', 'l']);
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

describe('obcommand and an earlier visual selection (#200)', function () {
    this.timeout(120000);

    before(async function () {
        await loadLuaConfig(LUA);
        await registerCapture();
    });

    beforeEach(async function () {
        await clearCapture();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('a normal-mode mapping right after Escape sees no selection', async function () {
        await selectBetaThenEscape();

        await pressMapping();

        expect(await captured()).toBe('');
    });

    it('a normal-mode mapping on another line sees no selection', async function () {
        await selectBetaThenEscape();
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);

        await pressMapping();

        expect(await captured()).toBe('');
        expect(await getEditorValue()).toBe(
            'alpha beta gamma\nsecond line here',
        );
    });

    it('leaving insert mode in the same task does not revive the selection', async function () {
        await selectBetaThenEscape();
        await browser.keys(['A']);
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys([Key.Alt, 'n']);
        await browser.keys([Key.Alt]);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await captured()).toBe('');
    });

    it('a visual-mode mapping still sees its selection', async function () {
        await setupEditor('alpha beta gamma\nsecond line here', {
            line: 0,
            ch: 6,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['v', 'l', 'l', 'l']);
        await browser.pause(PAUSE.KEY_GAP);

        await pressMapping();

        expect(await captured()).toBe('beta');
    });

    it("an explicit '<,'> range still names the last selection", async function () {
        await selectBetaThenEscape();

        await browser.executeObsidian(({ app, obsidian }, id: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                (view?.editor as unknown as Record<string, unknown> | undefined)
                    ?.cm as Record<string, unknown> | undefined
            )?.cm;
            if (!Vim || !cm) return;
            Vim.handleEx(cm, `'<,'>obcommand ${id}`);
        }, CAPTURE);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await captured()).toBe('beta');
    });
});
