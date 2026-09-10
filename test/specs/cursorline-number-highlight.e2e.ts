import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    ensureSourceMode,
    vimKeys,
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

const WRAPPING_LINE = 'lorem ipsum dolor sit amet consectetur '
    .repeat(12)
    .trim();

interface Geometry {
    error?: string;
    layerHeight: number | null;
    blockHeight: number;
    unwrappedHeight: number;
    lineDecoration: boolean;
}

async function measureCursorLine(): Promise<Geometry> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const dom = (view?.editor as unknown as { cm?: { dom?: HTMLElement } })
            ?.cm?.dom;
        if (!dom) return { error: 'no dom' };
        const lines = Array.from(
            dom.querySelectorAll('.cm-content > .cm-line'),
        );
        const cursorLine = lines[1];
        const unwrapped = lines[0];
        if (!cursorLine || !unwrapped) return { error: 'no cursor line' };
        const marker = dom.querySelector(
            '.vim-motions-cursorline-layer .vim-motions-cursorline',
        );
        return {
            layerHeight: marker ? marker.getBoundingClientRect().height : null,
            blockHeight: cursorLine.getBoundingClientRect().height,
            unwrappedHeight: unwrapped.getBoundingClientRect().height,
            lineDecoration: cursorLine.classList.contains(
                'vim-motions-cursorline',
            ),
        };
    })) as Geometry;
}

describe('cursorlineopt=screenline on a wrapped line', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
        await setupEditor(['first', WRAPPING_LINE, 'last'].join('\n'), {
            line: 1,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await configure({ number: true, statuscolumn: '' });
    });

    after(async function () {
        await configure({
            number: false,
            cursorline: true,
            cursorlineopt: 'number',
        });
    });

    it('covers one display row, not the whole wrapped block', async function () {
        await configure({ cursorline: true, cursorlineopt: 'screenline' });
        const g = await measureCursorLine();
        expect(g.error).toBeUndefined();

        // The fixture is only meaningful if the line actually wrapped. Measured
        // against a real single-row line rather than a pixel constant, so the
        // guard holds on platforms with a different default line height.
        expect(g.blockHeight).toBeGreaterThan(g.unwrappedHeight * 1.8);
        expect(g.layerHeight).not.toBeNull();
        // One row, not the block: this is the assertion that distinguishes
        // `screenline` from `line`. A Decoration.line cannot satisfy it.
        expect(g.layerHeight as number).toBeLessThan(g.blockHeight / 2);
        expect(g.lineDecoration).toBe(false);
        expect(await hasSelector(NUMBER_HL)).toBe(false);
    });

    it('highlights the number too with screenline,number', async function () {
        await configure({
            cursorline: true,
            cursorlineopt: 'screenline,number',
        });
        const g = await measureCursorLine();
        expect(g.layerHeight).not.toBeNull();
        expect(await hasSelector(NUMBER_HL)).toBe(true);
    });

    it('covers the whole block with line, and draws no layer', async function () {
        await configure({ cursorline: true, cursorlineopt: 'line' });
        const g = await measureCursorLine();
        expect(g.layerHeight).toBeNull();
        expect(g.lineDecoration).toBe(true);
    });

    it('draws no layer when cursorline is off', async function () {
        await configure({ cursorline: false, cursorlineopt: 'screenline' });
        const g = await measureCursorLine();
        expect(g.layerHeight).toBeNull();
        expect(g.lineDecoration).toBe(false);
    });
});

describe('cursorlineopt=screenline edge cases', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
    });

    after(async function () {
        await configure({ cursorline: true, cursorlineopt: 'number' });
    });

    beforeEach(async function () {
        await configure({ cursorline: true, cursorlineopt: 'screenline' });
    });

    async function layerRowCount(): Promise<number> {
        return (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const dom = (
                view?.editor as unknown as { cm?: { dom?: HTMLElement } }
            )?.cm?.dom;
            if (!dom) throw new Error('layerRowCount: no dom');
            return dom.querySelectorAll(
                '.vim-motions-cursorline-layer .vim-motions-cursorline',
            ).length;
        })) as number;
    }

    async function countSelector(selector: string): Promise<number> {
        return (await browser.executeObsidian(
            ({ app, obsidian }, sel: string) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const dom = (
                    view?.editor as unknown as { cm?: { dom?: HTMLElement } }
                )?.cm?.dom;
                if (!dom) throw new Error('countSelector: no dom');
                return dom.querySelectorAll(sel).length;
            },
            selector,
        )) as number;
    }

    it('draws exactly one row on an empty line', async function () {
        await setupEditor('alpha\n\nbravo', { line: 1, ch: 0 });
        await sendVimEscape();
        await configure({ cursorline: true, cursorlineopt: 'screenline' });
        expect(await layerRowCount()).toBe(1);
    });

    it('draws exactly one row while a fold is closed', async function () {
        await setupEditor(
            ['# Head', 'body one', 'body two', '', 'tail'].join('\n'),
            { line: 0, ch: 0 },
        );
        await sendVimEscape();
        await vimKeys('z', 'c');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await configure({ cursorline: true, cursorlineopt: 'screenline' });
        // Without this the case is vacuous: a `zc` that folded nothing leaves
        // an ordinary line, which trivially yields one row.
        expect(await countSelector('.cm-foldPlaceholder')).toBeGreaterThan(0);
        // A closed fold replaces lines with a placeholder widget; the cursor
        // sits on the fold's first line and must still get one row, not zero
        // (coordsAtPos returning null) and not one per folded line.
        expect(await layerRowCount()).toBe(1);
        await vimKeys('z', 'o');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await layerRowCount()).toBe(1);
    });

    it('draws exactly one row in a right-to-left editor', async function () {
        await setupEditor('alpha bravo charlie\nsecond\nthird', {
            line: 1,
            ch: 0,
        });
        await sendVimEscape();
        await browser.executeObsidian(({ app }) => {
            const vault = app.vault as unknown as {
                setConfig?: (k: string, v: unknown) => void;
            };
            vault.setConfig?.('rightToLeft', true);
        });
        // The vault config does not reach an already-constructed EditorView;
        // a mode round-trip rebuilds it so the direction actually applies.
        await ensureSourceMode();
        await ensureLivePreview();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const rtl = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                view?.editor as unknown as { cm?: { textDirection?: number } }
            )?.cm;
            return cm?.textDirection ?? null;
        })) as number | null;

        await configure({ cursorline: true, cursorlineopt: 'screenline' });
        expect(await layerRowCount()).toBe(1);

        await browser.executeObsidian(({ app }) => {
            const vault = app.vault as unknown as {
                setConfig?: (k: string, v: unknown) => void;
            };
            vault.setConfig?.('rightToLeft', false);
        });
        await ensureSourceMode();
        await ensureLivePreview();
        // CodeMirror's Direction.RTL is 1. `not.toBeNull()` would also accept
        // 0 (LTR), i.e. a run that never entered RTL at all and proved nothing.
        expect(rtl).toBe(1);
    });
});
