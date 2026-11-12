import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureLivePreview,
    ensureSourceMode,
    loadLuaConfig,
    setPluginSetting,
    PAUSE,
} from '../helpers';

/**
 * `set hoverfocus` (#234): `K` moves into the preview it opens, as a second
 * `K` does, once Obsidian shows it. Obsidian shows a preview about 300 ms
 * after `K`, which is why `nmap K KK` and a quickly typed `KK` could not do
 * this: the second `K` arrived before there was a preview to move into.
 *
 * Only a `K` that opens a preview waits for one, so `K` on plain text still
 * shows character info once and `K` on an external link opens it once — what
 * a Lua mapping pressing `K` twice could not avoid.
 */

const NOTE = 'HoverFocus.md';
const TARGET = 'HoverFocusTarget.md';
const LINE =
    'plain [[HoverFocusTarget]] and [x](https://example.com) here[^1].';

async function placeCursor(needle: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, n: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const text = view.editor.getLine(2);
        view.editor.setCursor(2, text.indexOf(n) + 1);
        view.editor.focus();
    }, needle);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

interface State {
    count: number;
    text: string;
    focusInside: boolean;
    notices: string[];
    opened: number;
}

async function state(): Promise<State> {
    return (await browser.executeObsidian(() => {
        const pops = Array.from(document.querySelectorAll('.hover-popover'));
        return {
            count: pops.length,
            text: pops.map((p) => p.textContent ?? '').join(' | '),
            focusInside: !!document.activeElement?.closest('.hover-popover'),
            notices: Array.from(document.querySelectorAll('.notice')).map(
                (n) => n.textContent ?? '',
            ),
            opened:
                (window as unknown as { __hoverFocusOpened?: number })
                    .__hoverFocusOpened ?? 0,
        };
    })) as State;
}

/** Close previews and notices, and count `window.open` instead of opening. */
async function reset(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        (
            view as unknown as { hoverPopover?: { hide(): void } | null } | null
        )?.hoverPopover?.hide();
        document
            .querySelectorAll('.hover-popover, .notice')
            .forEach((el) => el.remove());
        const w = window as unknown as { __hoverFocusOpened: number };
        w.__hoverFocusOpened = 0;
        window.open = (() => {
            w.__hoverFocusOpened++;
            return null;
        }) as typeof window.open;
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function openNote(): Promise<void> {
    await browser.executeObsidian(
        async (
            { app },
            files: { note: string; target: string; line: string },
        ) => {
            await app.vault.adapter.write(files.target, 'Target body text\n');
            await app.vault.adapter.write(
                files.note,
                `Intro line\n\n${files.line}\n\n[^1]: The footnote body text\n`,
            );
        },
        { note: NOTE, target: TARGET, line: LINE },
    );
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
    await obsidianPage.openFile(NOTE);
    await ensureLivePreview();
}

/** `K` at `needle`, then long enough for Obsidian to show a preview. */
async function pressK(needle: string): Promise<State> {
    await reset();
    await placeCursor(needle);
    await browser.keys(['K']);
    await browser.pause(1500);
    return state();
}

describe('K with hoverfocus (#234)', function () {
    this.timeout(180000);

    before(async function () {
        await openNote();
    });

    afterEach(async function () {
        await reset();
    });

    after(async function () {
        await setPluginSetting('hoverFocus', false);
        await browser.executeObsidian(
            async ({ app }, files: string[]) => {
                for (const f of files) {
                    if (await app.vault.adapter.exists(f)) {
                        await app.vault.adapter.remove(f);
                    }
                }
            },
            [NOTE, TARGET],
        );
    });

    describe('off (the default)', function () {
        before(async function () {
            await setPluginSetting('hoverFocus', false);
        });

        it('K previews a link and leaves the cursor in the note', async function () {
            const s = await pressK('HoverFocusTarget');
            expect({ count: s.count, focusInside: s.focusInside }).toEqual({
                count: 1,
                focusInside: false,
            });
            expect(s.text).toContain('Target body text');
        });
    });

    describe('on', function () {
        before(async function () {
            await setPluginSetting('hoverFocus', true);
        });

        it('K previews a link and moves into the preview', async function () {
            const s = await pressK('HoverFocusTarget');
            expect({ count: s.count, focusInside: s.focusInside }).toEqual({
                count: 1,
                focusInside: true,
            });
            expect(s.text).toContain('Target body text');
        });

        it('K previews a footnote and moves into the preview', async function () {
            const s = await pressK('^1');
            expect({ count: s.count, focusInside: s.focusInside }).toEqual({
                count: 1,
                focusInside: true,
            });
            expect(s.text).toContain('The footnote body text');
        });

        it('q closes the preview K moved into', async function () {
            await pressK('HoverFocusTarget');
            await browser.keys(['q']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect((await state()).count).toBe(0);
        });

        it('K on plain text shows character info once', async function () {
            const s = await pressK('plain');
            expect({ count: s.count, notices: s.notices }).toEqual({
                count: 0,
                notices: ['<l>  108,  Hex 6c,  Oct 154'],
            });
        });

        it('K on an external link opens it once', async function () {
            // Live Preview renders the link and moves a cursor placed in it
            // past it, so this one is in source mode.
            await ensureSourceMode();
            const s = await pressK('example');
            await ensureLivePreview();
            expect({ count: s.count, opened: s.opened }).toEqual({
                count: 0,
                opened: 1,
            });
        });

        // Neovim closes the hover window when the cursor moves, and a second
        // K after a motion starts over; moving before the preview shows is
        // the same, so the preview opens but keeps the cursor in the note.
        it('moving the cursor before the preview shows keeps it in the note', async function () {
            await reset();
            await placeCursor('HoverFocusTarget');
            await browser.keys(['K', 'l']);
            await browser.pause(1500);
            const s = await state();
            expect({ count: s.count, focusInside: s.focusInside }).toEqual({
                count: 1,
                focusInside: false,
            });
        });
    });

    describe('set through Lua', function () {
        it('vim.opt.hoverfocus = true moves K into the preview', async function () {
            await setPluginSetting('hoverFocus', false);
            await loadLuaConfig('vim.opt.hoverfocus = true\n');
            await openNote();
            const s = await pressK('HoverFocusTarget');
            await loadLuaConfig('');
            expect({ count: s.count, focusInside: s.focusInside }).toEqual({
                count: 1,
                focusInside: true,
            });
        });
    });
});
