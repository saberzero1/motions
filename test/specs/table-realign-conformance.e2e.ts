import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.1: our table formatter against Obsidian's own, byte-for-byte.
 *
 * `TableEditor.rebuildTable()` is a **pure** formatter — it returns the
 * formatted table and leaves the document alone — and it exists only while
 * Obsidian's widget does, so this runs in `tableWidgetMode: 'native'`.
 *
 * E1.1 asked for a `displayWidth()` helper on the premise that padding by
 * `String.length` "is wrong for CJK, emoji, combining marks, variation
 * selectors, flags and ZWJ sequences". Measured, Obsidian pads by **UTF-16
 * length** too, so that would have broken the byte-for-byte match the same
 * step mandates. The column width Obsidian chose for each specimen:
 *
 * | specimen  | `.length` | display width | Obsidian |
 * |-----------|-----------|---------------|----------|
 * | `日本語`  | 3         | 6             | **3**    |
 * | ZWJ emoji | 8         | 2             | **8**    |
 * | flag      | 4         | 2             | **4**    |
 * | `日a😀`   | 4         | 5             | **4**    |
 *
 * So this is a **regression guard**, not a fix: it passes today and exists to
 * catch drift in either direction. Visual alignment of the owned grid is not
 * this function's job — A2 puts it in the decoration layer, and source
 * padding is explicitly "NOT the live layout engine".
 */

const SPECIMENS: [string, string][] = [
    ['ascii', 'ab'],
    ['cjk', '\u65e5\u672c\u8a9e'],
    ['combining mark', 'e\u0301'],
    ['emoji', '\ud83d\ude00'],
    ['zwj emoji', '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67'],
    ['regional-indicator flag', '\ud83c\uddef\ud83c\uddf5'],
    ['escaped pipe', 'a\\|b'],
    ['wikilink containing a pipe', '[[p\\|al]]'],
    ['mixed scripts', '\u65e5a\ud83d\ude00'],
];

/** Obsidian's own formatted text for the table under the cursor. */
async function oracle(): Promise<string | null> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const el = view?.containerEl.querySelector('.cm-table-widget');
        if (!el) return null;
        const cmTile = (el as unknown as Record<string, unknown>).cmTile as
            Record<string, unknown> | undefined;
        const widget = cmTile?.widget as
            { rebuildTable?: () => { toString(): string } } | undefined;
        if (!widget || typeof widget.rebuildTable !== 'function') return null;
        return widget.rebuildTable().toString();
    })) as string | null;
}

/** Our own formatter, called directly. */
async function ours(lines: string[]): Promise<string[] | null> {
    return (await browser.executeObsidian(({ app }, input: string[]) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { formatTableLines?: (l: string[]) => string[] }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin?.formatTableLines) return null;
        return plugin.formatTableLines(input);
    }, lines)) as string[] | null;
}

describe('Table realign conformance (Plan E1.1)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await ensureLivePreview();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    for (const [name, specimen] of SPECIMENS) {
        it(`matches Obsidian's formatter for ${name}`, async () => {
            // Deliberately misaligned, so a formatter that returned its input
            // unchanged could not pass.
            const lines = ['|h|x|', '|---|---|', `|${specimen}|y|`];
            await setupEditor(lines.join('\n') + '\n', { line: 0, ch: 0 });
            await browser.pause(700);

            const expected = await oracle();
            expect(expected).not.toBeNull();
            expect(expected).not.toBe(lines.join('\n'));

            // Our formatter is called DIRECTLY. Driving `:tablerealign`
            // against the document is vacuous here: Obsidian's widget
            // reformats the table straight afterwards, so the document
            // converges on the oracle whatever we produced — measured, a
            // deliberately wrong width model still passed that way.
            const actual = await ours(lines);
            expect(actual).not.toBeNull();
            expect((actual as string[]).join('\n')).toBe(
                (expected as string).trimEnd(),
            );
        });
    }
});
