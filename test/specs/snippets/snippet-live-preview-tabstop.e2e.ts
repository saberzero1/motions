import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureLivePreview,
    ensureSourceMode,
    getCursorPos,
    getEditorValue,
    PAUSE,
    sendVimEscape,
    setupEditor,
    vimKeys,
} from '../../helpers';

/**
 * Issue #198 — a tabstop that sits immediately inside a Markdown emphasis
 * delimiter is pushed past the delimiter in Live Preview.
 *
 * Obsidian's Live Preview hides the `*` markers with replace decorations while
 * the cursor is elsewhere, and a view plugin re-snaps any selection that lands
 * inside a hidden marker to that marker's outer edge. It reads the decoration
 * set built for the *previous* selection, so the snap fires on the very
 * transaction that moves the cursor into the markup — which is exactly what a
 * snippet tabstop jump does. The snap is dispatched from a `setTimeout`, so the
 * cursor visibly lands on the tabstop and then hops out a tick later.
 *
 * `MIDDLE_BODY` (`$1 *a$2* abc$3`) expands to ` *a* abc`:
 *
 *   offset: 0 = ' ', 1 = '*', 2 = 'a', 3 = '*', 4 = ' ', 5..7 = 'abc'
 *   $1 -> 0, $2 -> 3 (between `a` and the closing `*`), $3 -> 8
 *
 * `FINAL_BODY` (`$1 *a$2*`) puts the same in-emphasis tabstop last, which the
 * autocomplete fork reaches by clearing the snippet rather than advancing it —
 * a separate dispatch path with the same exposure.
 */
const MIDDLE_PREFIX = 'lptsmid';
const MIDDLE_BODY = '$1 *a$2* abc$3';
const MIDDLE_EXPANDED = ' *a* abc';

const FINAL_PREFIX = 'lptsend';
const FINAL_BODY = '$1 *a$2*';
const FINAL_EXPANDED = ' *a*';

/**
 * A repeated tabstop number, which the LSP grammar links ("typing in one will
 * update others too") and CodeMirror realises as a multi-range selection.
 *
 * `DUP_BODY` (`$1 *a$2* *b$2* $0`) expands to ` *a* *b* `:
 *
 *   offset: 0 = ' ', 1 = '*', 2 = 'a', 3 = '*', 4 = ' ',
 *           5 = '*', 6 = 'b', 7 = '*', 8 = ' '
 *   $1 -> 0, $2 -> 3 and 7, $0 -> 9
 *
 * The exposure here is the first *edit* at the tabstop rather than the jump.
 * On a multi-range selection Obsidian's snap does not merely push each range
 * past its marker — it collapses the selection and rebuilds it wrongly.
 *
 * `DUP_PLAIN_BODY` is the same shape with no markup, so nothing is hidden and
 * no snap is scheduled. It is the control: were repeated tabstops simply
 * unsupported, it would fail too.
 */
const DUP_PREFIX = 'lptsdup';
const DUP_BODY = '$1 *a$2* *b$2* $0';
const DUP_EXPANDED = ' *a* *b* ';

const DUP_PLAIN_PREFIX = 'lptsdupplain';
const DUP_PLAIN_BODY = '$1 a$2 b$2 $0';
const DUP_PLAIN_EXPANDED = ' a b ';

const FIRST_TABSTOP_CH = 0;
const EMPHASIS_TABSTOP_CH = 3;

async function getSelectionRanges(): Promise<{ from: number; to: number }[]> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('getSelectionRanges: no MarkdownView');
        const cm = (view.editor as unknown as { cm: unknown }).cm as {
            state: {
                selection: { ranges: readonly { from: number; to: number }[] };
            };
        };
        return cm.state.selection.ranges.map((r) => ({
            from: r.from,
            to: r.to,
        }));
    })) as { from: number; to: number }[];
}

async function registerSnippets(): Promise<void> {
    await browser.executeObsidian(
        (
            { app },
            middlePrefix: string,
            middleBody: string,
            finalPrefix: string,
            finalBody: string,
            dupPrefix: string,
            dupBody: string,
            dupPlainPrefix: string,
            dupPlainBody: string,
        ) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                snippetRegistry?: {
                                    loadFile: (
                                        file: Record<
                                            string,
                                            {
                                                prefix: string;
                                                body: string | string[];
                                                description?: string;
                                            }
                                        >,
                                        source: string,
                                    ) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin?.snippetRegistry)
                throw new Error('registerSnippets: no snippetRegistry');
            plugin.snippetRegistry.loadFile(
                {
                    'Live Preview Tabstop': {
                        prefix: middlePrefix,
                        body: middleBody,
                        description: 'Issue 198 reproduction',
                    },
                    'Live Preview Final Tabstop': {
                        prefix: finalPrefix,
                        body: finalBody,
                        description: 'Issue 198 reproduction, last tabstop',
                    },
                    'Live Preview Repeated Tabstop': {
                        prefix: dupPrefix,
                        body: dupBody,
                        description: 'Issue 198 follow-up, repeated tabstop',
                    },
                    'Repeated Tabstop Without Markup': {
                        prefix: dupPlainPrefix,
                        body: dupPlainBody,
                        description: 'Issue 198 follow-up, markup-free control',
                    },
                },
                'user',
            );
        },
        MIDDLE_PREFIX,
        MIDDLE_BODY,
        FINAL_PREFIX,
        FINAL_BODY,
        DUP_PREFIX,
        DUP_BODY,
        DUP_PLAIN_PREFIX,
        DUP_PLAIN_BODY,
    );
}

async function waitForSnippets(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        getAll: () => unknown[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const all = plugin?.snippetRegistry?.getAll();
                return Array.isArray(all) && all.length > 0;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

async function expandSnippet(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function jumpToNextTabstop(): Promise<void> {
    await browser.keys(['Tab']);
    // Obsidian schedules its corrective selection dispatch from a zero-delay
    // timer, so the wrong position only appears one macrotask later. Settling
    // here is what makes the assertions below observe the final cursor.
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Snippet tabstops inside Markdown emphasis (issue #198)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForSnippets();
        await registerSnippets();
    });

    beforeEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Live Preview', function () {
        beforeEach(async function () {
            await ensureLivePreview();
            await setupEditor('', { line: 0, ch: 0 });
        });

        it('expands with the first tabstop before the emphasis', async function () {
            await expandSnippet(MIDDLE_PREFIX);

            expect(await getEditorValue()).toBe(MIDDLE_EXPANDED);
            expect(await getCursorPos()).toEqual({
                line: 0,
                ch: FIRST_TABSTOP_CH,
            });
        });

        it('leaves the cursor on the tabstop inside the emphasis after Tab', async function () {
            await expandSnippet(MIDDLE_PREFIX);
            await jumpToNextTabstop();

            expect(await getEditorValue()).toBe(MIDDLE_EXPANDED);
            expect(await getCursorPos()).toEqual({
                line: 0,
                ch: EMPHASIS_TABSTOP_CH,
            });
        });

        it('inserts typed text inside the emphasis after Tab', async function () {
            await expandSnippet(MIDDLE_PREFIX);
            await jumpToNextTabstop();

            await browser.keys(['z']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe(' *az* abc');
        });

        it('leaves the cursor on a final tabstop inside the emphasis', async function () {
            await expandSnippet(FINAL_PREFIX);
            await jumpToNextTabstop();

            expect(await getEditorValue()).toBe(FINAL_EXPANDED);
            expect(await getCursorPos()).toEqual({
                line: 0,
                ch: EMPHASIS_TABSTOP_CH,
            });
        });

        it('puts a cursor in every occurrence of a repeated tabstop', async function () {
            await expandSnippet(DUP_PREFIX);
            await jumpToNextTabstop();

            expect(await getEditorValue()).toBe(DUP_EXPANDED);
            expect(await getSelectionRanges()).toEqual([
                { from: 3, to: 3 },
                { from: 7, to: 7 },
            ]);
        });

        it('keeps both cursors inside their emphasis after typing', async function () {
            await expandSnippet(DUP_PREFIX);
            await jumpToNextTabstop();

            await browser.keys(['z']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe(' *az* *bz* ');
            expect(await getSelectionRanges()).toEqual([
                { from: 4, to: 4 },
                { from: 9, to: 9 },
            ]);
        });

        it('keeps the repeated tabstop live for a second keystroke', async function () {
            await expandSnippet(DUP_PREFIX);
            await jumpToNextTabstop();

            await browser.keys(['z']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys(['y']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe(' *azy* *bzy* ');
            expect(await getSelectionRanges()).toEqual([
                { from: 5, to: 5 },
                { from: 11, to: 11 },
            ]);
        });

        it('types into a repeated tabstop that sits outside any markup', async function () {
            await expandSnippet(DUP_PLAIN_PREFIX);
            await jumpToNextTabstop();

            expect(await getEditorValue()).toBe(DUP_PLAIN_EXPANDED);
            expect(await getSelectionRanges()).toEqual([
                { from: 2, to: 2 },
                { from: 4, to: 4 },
            ]);

            await browser.keys(['z']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys(['y']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe(' azy bzy ');
            expect(await getSelectionRanges()).toEqual([
                { from: 4, to: 4 },
                { from: 8, to: 8 },
            ]);
        });
    });

    describe('Source mode', function () {
        beforeEach(async function () {
            await ensureSourceMode();
            await setupEditor('', { line: 0, ch: 0 });
        });

        after(async function () {
            await ensureLivePreview();
        });

        it('leaves the cursor on the tabstop inside the emphasis after Tab', async function () {
            await expandSnippet(MIDDLE_PREFIX);
            await jumpToNextTabstop();

            expect(await getEditorValue()).toBe(MIDDLE_EXPANDED);
            expect(await getCursorPos()).toEqual({
                line: 0,
                ch: EMPHASIS_TABSTOP_CH,
            });
        });

        it('types into every occurrence of a repeated tabstop', async function () {
            await expandSnippet(DUP_PREFIX);
            await jumpToNextTabstop();

            await browser.keys(['z']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys(['y']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getEditorValue()).toBe(' *azy* *bzy* ');
            expect(await getSelectionRanges()).toEqual([
                { from: 5, to: 5 },
                { from: 11, to: 11 },
            ]);
        });
    });
});
