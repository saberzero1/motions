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

const FIRST_TABSTOP_CH = 0;
const EMPHASIS_TABSTOP_CH = 3;

async function registerSnippets(): Promise<void> {
    await browser.executeObsidian(
        (
            { app },
            middlePrefix: string,
            middleBody: string,
            finalPrefix: string,
            finalBody: string,
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
                },
                'user',
            );
        },
        MIDDLE_PREFIX,
        MIDDLE_BODY,
        FINAL_PREFIX,
        FINAL_BODY,
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
    });
});
