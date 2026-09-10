import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

/**
 * Neovim gates the cursor line's number highlight on BOTH options:
 *
 *   CursorLineNr  Like LineNr when 'cursorline' is set and 'cursorlineopt'
 *                 contains "number" or is "both", for the cursor line.
 *   -- runtime/doc/syntax.txt
 *
 * and drawline.c requires `wp->w_p_cul && (culopt_flags & kOptCuloptFlagNumber)`.
 * `CursorLineNr` is never used while 'cursorline' is off.
 *
 * The plugin applied `vim-motions-line-num-current` to the cursor line's number
 * unconditionally, so `cursorlineopt` had no observable effect at all and the
 * highlight survived `cursorline=false`. Both gutters are covered: the standalone
 * line-number gutter and the unified statuscolumn render the class separately.
 */

const DOC = ['first line', 'second line', 'third line'].join('\n');

const NUMBER_HL = '.vim-motions-line-num-current';
const LINE_HL = '.vim-motions-cursorline';

interface PluginHandle {
    settings: Record<string, unknown>;
    saveSettings: () => Promise<void>;
    reconfigureLineNumberGutter: () => void;
    reconfigureCursorlineHighlight: () => void;
    reconfigureStatusColumnGutter: () => void;
}

async function configure(patch: Record<string, unknown>): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, p: Record<string, unknown>) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, PluginHandle> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('configure: plugin not found');
            Object.assign(plugin.settings, p);
            await plugin.saveSettings();
            plugin.reconfigureLineNumberGutter();
            plugin.reconfigureCursorlineHighlight();
            plugin.reconfigureStatusColumnGutter();
        },
        patch,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function hasSelector(selector: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }, sel: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const dom = (view?.editor as unknown as { cm?: { dom?: HTMLElement } })
            ?.cm?.dom;
        if (!dom) throw new Error('hasSelector: no CodeMirror dom');
        return dom.querySelector(sel) !== null;
    }, selector)) as boolean;
}

function suite(label: string, extra: Record<string, unknown>): void {
    describe(label, function () {
        beforeEach(async function () {
            await configure({
                number: true,
                cursorline: true,
                cursorlineopt: 'number',
                ...extra,
            });
        });

        it('highlights the number when cursorlineopt is number', async function () {
            await configure({ cursorline: true, cursorlineopt: 'number' });
            expect(await hasSelector(NUMBER_HL)).toBe(true);
            expect(await hasSelector(LINE_HL)).toBe(false);
        });

        it('highlights the number when cursorlineopt is both', async function () {
            await configure({ cursorline: true, cursorlineopt: 'both' });
            expect(await hasSelector(NUMBER_HL)).toBe(true);
            expect(await hasSelector(LINE_HL)).toBe(true);
        });

        it('does not highlight the number when cursorlineopt is line', async function () {
            await configure({ cursorline: true, cursorlineopt: 'line' });
            expect(await hasSelector(NUMBER_HL)).toBe(false);
            expect(await hasSelector(LINE_HL)).toBe(true);
        });

        it('does not highlight the number when cursorline is off', async function () {
            await configure({ cursorline: false, cursorlineopt: 'both' });
            expect(await hasSelector(NUMBER_HL)).toBe(false);
            expect(await hasSelector(LINE_HL)).toBe(false);
        });
    });
}

describe('CursorLineNr gating', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
        await setupEditor(DOC, { line: 1, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    after(async function () {
        await configure({
            number: false,
            statuscolumn: '',
            cursorline: true,
            cursorlineopt: 'number',
        });
    });

    suite('standalone line-number gutter', { statuscolumn: '' });
    suite('unified statuscolumn gutter', { statuscolumn: '%s %l ' });
});
