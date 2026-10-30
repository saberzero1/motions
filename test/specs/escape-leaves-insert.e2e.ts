import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE, setupEditor } from '../helpers';

/**
 * One Escape closes Obsidian's link suggestions and leaves insert mode, as
 * one `<Esc>` closes Neovim's completion menu and leaves insert mode (#196).
 *
 * Measured before the change: the suggestion menu took the first Escape on
 * `window` in the capture phase and stopped it, the engine stayed in insert
 * mode, and a second Escape was needed. Neovim 0.12.5, `A` `<C-n>` `<Esc>`:
 * normal mode, selected word kept.
 */

interface State {
    insert: boolean;
    suggest: boolean;
    line: string;
}

async function state(): Promise<State> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as {
                cm?: { cm?: { state: { vim?: { insertMode?: boolean } } } };
            }
        )?.cm?.cm;
        return {
            insert: cm?.state.vim?.insertMode === true,
            suggest: !!document.querySelector('.suggestion-container'),
            line: view?.editor.getLine(1) ?? '',
        };
    })) as State;
}

async function setOption(value: boolean): Promise<void> {
    await browser.executeObsidian((_ctx, v: boolean) => {
        (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: { setOption(name: string, value: boolean): void };
                };
            }
        ).CodeMirrorAdapter.Vim.setOption('escapeleavesinsert', v);
    }, value);
}

/** Opens insert mode on line 1 and types `[[Wel`, showing link suggestions. */
async function openLinkSuggestions(): Promise<void> {
    await setupEditor('start\n', { line: 1, ch: 0 });
    await browser.keys(['Escape', 'i']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['[', '[', 'W', 'e', 'l']);
    await browser.waitUntil(async () => (await state()).suggest, {
        timeout: 3000,
        interval: 100,
        timeoutMsg: 'no link suggestions',
    });
}

describe('Escape with an Obsidian popup open (#196)', function () {
    this.timeout(120000);

    before(async function () {
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await setOption(true);
        await browser.keys(['Escape']);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('one Escape closes link suggestions and leaves insert mode', async function () {
        await openLinkSuggestions();
        const before = await state();

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const after = await state();

        expect(after.suggest).toBe(false);
        expect(after.insert).toBe(false);
        expect(after.line).toBe(before.line);
    });

    it('with escapeleavesinsert off, the first Escape only closes them', async function () {
        await setOption(false);
        await openLinkSuggestions();

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const after = await state();

        expect(after.suggest).toBe(false);
        expect(after.insert).toBe(true);
    });

    it('a user <Esc> mapping that stays in insert mode is left alone', async function () {
        await browser.executeObsidian(() => {
            (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: { noremap(l: string, r: string, c: string): void };
                    };
                }
            ).CodeMirrorAdapter.Vim.noremap('<Esc>', 'X', 'insert');
        });
        try {
            await setupEditor('start\n', { line: 1, ch: 0 });
            await browser.keys(['Escape', 'i', 'a', 'b']);
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const after = await state();

            expect(after.line).toBe('abX');
            expect(after.insert).toBe(true);
        } finally {
            await browser.executeObsidian(() => {
                (
                    window as unknown as {
                        CodeMirrorAdapter: {
                            Vim: { unmap(l: string, c: string): void };
                        };
                    }
                ).CodeMirrorAdapter.Vim.unmap('<Esc>', 'insert');
            });
        }
    });

    it('a plain Escape still leaves insert mode (control)', async function () {
        await setupEditor('start\n', { line: 1, ch: 0 });
        await browser.keys(['Escape', 'i', 'a', 'b']);
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const after = await state();

        expect(after.insert).toBe(false);
        expect(after.line).toBe('ab');
    });
});
