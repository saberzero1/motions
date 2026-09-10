import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

/**
 * `iterateEditorViews()` resolved `editor.cm.cm` — the CM5 vim adapter, which
 * has no `dispatch` — so its guard rejected every leaf and all five gutter
 * reconfigure methods dispatched into nothing. Gutter settings appeared to
 * require an Obsidian restart for 108 releases (0.52.0–0.149.0).
 *
 * It survived that long because only the line-number path had a DOM-level
 * test. Every other path asserted the stored setting or the body class, both of
 * which are written before any editor is touched. This spec covers the four
 * uncovered reconfigure methods at the DOM, in BOTH directions — asserting only
 * that a gutter appears would still pass if the teardown branch were dead.
 */

const DOC = ['# Heading one', 'second line', 'third line'].join('\n');

interface PluginHandle {
    settings: Record<string, unknown>;
    saveSettings: () => Promise<void>;
    reconfigureStatusColumnGutter: () => void;
    reconfigureFoldColumnGutter: () => void;
    reconfigureCursorlineHighlight: () => void;
    reconfigureSignColumnGutter: () => void;
}

type ReconfigureMethod =
    | 'reconfigureStatusColumnGutter'
    | 'reconfigureFoldColumnGutter'
    | 'reconfigureCursorlineHighlight'
    | 'reconfigureSignColumnGutter';

async function applySetting(
    key: string,
    value: unknown,
    method: ReconfigureMethod,
): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, k: string, v: unknown, m: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, PluginHandle> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('applySetting: plugin not found');
            plugin.settings[k] = v;
            await plugin.saveSettings();
            (plugin as unknown as Record<string, () => void>)[m]();
        },
        key,
        value,
        method,
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

describe('Gutter reconfiguration reaches open editors at runtime', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
        await setupEditor(DOC, { line: 1, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('installs and removes the fold column without a restart', async function () {
        await applySetting('foldcolumn', true, 'reconfigureFoldColumnGutter');
        expect(await hasSelector('.vim-motions-fold-column')).toBe(true);

        await applySetting('foldcolumn', false, 'reconfigureFoldColumnGutter');
        expect(await hasSelector('.vim-motions-fold-column')).toBe(false);
    });

    it('installs and removes the cursor line highlight without a restart', async function () {
        // `cursorlineopt` defaults to `number`, for which the extension is
        // deliberately empty — the current line's number is bolded by the
        // gutter regardless. Only `line`/`both` produce a line decoration.
        await applySetting(
            'cursorlineopt',
            'line',
            'reconfigureCursorlineHighlight',
        );
        await applySetting(
            'cursorline',
            true,
            'reconfigureCursorlineHighlight',
        );
        expect(await hasSelector('.vim-motions-cursorline')).toBe(true);

        await applySetting(
            'cursorline',
            false,
            'reconfigureCursorlineHighlight',
        );
        expect(await hasSelector('.vim-motions-cursorline')).toBe(false);
    });

    it('adds no line decoration when cursorlineopt is number', async function () {
        await applySetting(
            'cursorlineopt',
            'number',
            'reconfigureCursorlineHighlight',
        );
        await applySetting(
            'cursorline',
            true,
            'reconfigureCursorlineHighlight',
        );
        expect(await hasSelector('.vim-motions-cursorline')).toBe(false);
    });

    it('installs and removes the sign column without a restart', async function () {
        await applySetting('signcolumn', 'no', 'reconfigureSignColumnGutter');
        expect(await hasSelector('.vim-motions-sign-column')).toBe(false);

        await applySetting('signcolumn', 'yes', 'reconfigureSignColumnGutter');
        expect(await hasSelector('.vim-motions-sign-column')).toBe(true);
    });

    it('swaps the individual gutters for the statuscolumn and back', async function () {
        await applySetting('number', true, 'reconfigureStatusColumnGutter');
        await applySetting('signcolumn', 'yes', 'reconfigureSignColumnGutter');

        await applySetting(
            'statuscolumn',
            '%s %l ',
            'reconfigureStatusColumnGutter',
        );
        expect(await hasSelector('.vim-motions-statuscolumn')).toBe(true);
        // The unified gutter replaces the individual columns; if this teardown
        // branch were dead the editor would show both, which is the bug the
        // "appears" assertion alone cannot see.
        expect(await hasSelector('.vim-motions-line-numbers')).toBe(false);
        expect(await hasSelector('.vim-motions-sign-column')).toBe(false);

        await applySetting('statuscolumn', '', 'reconfigureStatusColumnGutter');
        expect(await hasSelector('.vim-motions-statuscolumn')).toBe(false);
        expect(await hasSelector('.vim-motions-line-numbers')).toBe(true);
        expect(await hasSelector('.vim-motions-sign-column')).toBe(true);

        await applySetting('number', false, 'reconfigureStatusColumnGutter');
        await applySetting('signcolumn', 'auto', 'reconfigureSignColumnGutter');
    });
});
