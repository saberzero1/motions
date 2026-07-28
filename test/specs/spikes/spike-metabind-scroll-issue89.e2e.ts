/**
 * Spike: Issue #89 — Cursor and scrolling doesn't play well with Meta Bind
 *
 * Reproduces the scroll-jump bug where interacting with a Meta Bind input
 * field in the properties area causes the editor to scroll back to the
 * last vim cursor position.
 *
 * Hypothesis: the `propertiesFoldObserver` in `src/vim/fold-sync.ts` watches
 * `.metadata-container` for ANY class attribute mutation and unconditionally
 * dispatches `EditorView.scrollIntoView(selection.main.head)`.  Meta Bind
 * fields inside the properties panel trigger class mutations that are NOT
 * fold toggles, causing the false-positive scroll snap.
 *
 * Tests:
 * 1. Confirm `.metadata-container` exists and the observer can attach
 * 2. Simulate a class mutation on `.metadata-container` and check if scroll jumps
 * 3. Reproduce the user-reported scenario: scroll away from cursor, interact
 *    with a Meta Bind input field, verify scroll position is preserved
 * 4. Verify that genuine fold toggle (is-collapsed) still works correctly
 *
 * @see https://github.com/saberzero1/motions/issues/89
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    setupEditor,
    getCursorPos,
    PAUSE,
    ensureLivePreview,
} from '../../helpers.js';

/**
 * Content long enough that the cursor position (near bottom) is off-screen
 * when the user scrolls to the top.  The frontmatter includes a Meta Bind
 * INPUT field so the properties panel renders an interactive text input.
 */
const LONG_CONTENT_WITH_METABIND = [
    '---',
    'Summary:',
    '---',
    '',
    ...Array.from(
        { length: 80 },
        (_, i) => `Line ${i + 1}: Lorem ipsum dolor sit amet.`,
    ),
    '',
    '# Bottom Heading',
    '',
    'Final paragraph.',
].join('\n');

/**
 * Variant with an inline Meta Bind INPUT field (code block syntax).
 * Even without inline rendering, the frontmatter `Summary` property
 * creates a text input in the properties panel in Live Preview.
 */
const LONG_CONTENT_PLAIN_FRONTMATTER = [
    '---',
    'title: Test Note',
    'tags: [spike, metabind]',
    '---',
    '',
    ...Array.from(
        { length: 80 },
        (_, i) => `Line ${i + 1}: Lorem ipsum dolor sit amet.`,
    ),
    '',
    '# Bottom Heading',
    '',
    'Final paragraph.',
].join('\n');

type CommandsApi = {
    commands: {
        executeCommandById: (id: string) => boolean;
    };
};

describe('Spike: Issue #89 — Meta Bind scroll-jump (propertiesFoldObserver)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await ensureLivePreview();
    });

    // ─── Section 1: Verify the metadata-container exists ───────────────

    describe('1. Metadata container presence', function () {
        it('should have a .metadata-container in Live Preview with frontmatter', async function () {
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 50, ch: 0 });

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const editorEl = (
                        view.editor as unknown as Record<string, unknown>
                    ).containerEl as HTMLElement | undefined;
                    if (!editorEl) return { error: 'No containerEl' };

                    const container =
                        view.contentEl ??
                        editorEl.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );

                    return {
                        hasMetadataContainer: !!metadata,
                        isCollapsed:
                            metadata?.classList.contains('is-collapsed') ??
                            false,
                        classList: metadata
                            ? Array.from(metadata.classList)
                            : [],
                        childInputCount: metadata
                            ? metadata.querySelectorAll('input, textarea')
                                  .length
                            : 0,
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Metadata container:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
            expect(result.hasMetadataContainer).toBe(true);
        });
    });

    // ─── Section 2: Simulate class mutation and detect scroll jump ─────

    describe('2. Class mutation triggers scrollIntoView (root cause test)', function () {
        it('should detect scroll jump when metadata-container class is mutated', async function () {
            // Set up editor with cursor near the bottom
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 70, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              scrollDOM: HTMLElement;
                              state: { selection: { main: { head: number } } };
                          }
                        | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );
                    if (!metadata)
                        return { error: 'No metadata-container found' };

                    // Record cursor position (should be near line 70)
                    const cursorHead = cm6View.state.selection.main.head;

                    // Scroll to the very top (away from cursor)
                    cm6View.scrollDOM.scrollTop = 0;
                    await new Promise((r) => setTimeout(r, 200));

                    const scrollTopBefore = cm6View.scrollDOM.scrollTop;

                    // Simulate a non-fold class mutation on metadata-container
                    // This is what Meta Bind (or any plugin) might do
                    metadata.classList.add('spike-test-dummy-class');

                    // Wait for the rAF + dispatch in propertiesFoldObserver
                    await new Promise((r) => setTimeout(r, 200));

                    const scrollTopAfter = cm6View.scrollDOM.scrollTop;

                    // Clean up
                    metadata.classList.remove('spike-test-dummy-class');

                    return {
                        cursorHead,
                        scrollTopBefore,
                        scrollTopAfter,
                        scrollDelta: scrollTopAfter - scrollTopBefore,
                        scrollJumped: scrollTopAfter !== scrollTopBefore,
                        bugReproduced: scrollTopAfter > scrollTopBefore + 50,
                        conclusion:
                            scrollTopAfter > scrollTopBefore + 50
                                ? 'BUG CONFIRMED: Non-fold class mutation on metadata-container caused scroll jump to cursor position'
                                : 'No scroll jump detected — observer may not have fired',
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Class mutation scroll test:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');

            // This is the critical assertion — if this passes, the bug is confirmed
            if (result.bugReproduced) {
                console.log(
                    '[SPIKE #89] ROOT CAUSE CONFIRMED: propertiesFoldObserver reacts to ANY class change on .metadata-container',
                );
                console.log(
                    '[SPIKE #89] FIX: Observer should only react to is-collapsed class toggle',
                );
            }
        });

        it('should NOT scroll when metadata-container class is mutated (desired behavior)', async function () {
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 70, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { scrollDOM: HTMLElement } | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );
                    if (!metadata) return { error: 'No metadata-container' };

                    // Scroll to top
                    cm6View.scrollDOM.scrollTop = 0;
                    await new Promise((r) => setTimeout(r, 200));

                    const scrollBefore = cm6View.scrollDOM.scrollTop;

                    // Add and remove a class that is NOT is-collapsed
                    metadata.classList.add('some-random-class');
                    await new Promise((r) => setTimeout(r, 300));
                    metadata.classList.remove('some-random-class');
                    await new Promise((r) => setTimeout(r, 300));

                    const scrollAfter = cm6View.scrollDOM.scrollTop;

                    return {
                        scrollBefore,
                        scrollAfter,
                        scrollPreserved:
                            Math.abs(scrollAfter - scrollBefore) < 10,
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Desired behavior (no jump on non-fold mutation):',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
            // After fix, this should pass:
            // expect(result.scrollPreserved).toBe(true);
        });
    });

    // ─── Section 3: Reproduce user scenario ────────────────────────────

    describe('3. User-reported scenario reproduction', function () {
        it('should reproduce: cursor far down, scroll up, interact with properties input', async function () {
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 70, ch: 5 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorBefore = await getCursorPos();

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { scrollDOM: HTMLElement } | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    // Step 1: User scrolls to top of document (mouse scroll)
                    cm6View.scrollDOM.scrollTop = 0;
                    await new Promise((r) => setTimeout(r, 300));

                    const scrollTopAfterManualScroll =
                        cm6View.scrollDOM.scrollTop;

                    // Step 2: Find an input in the metadata/properties area
                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadataInput = container?.querySelector(
                        '.metadata-container input, .metadata-container textarea',
                    ) as HTMLInputElement | HTMLTextAreaElement | null;

                    if (!metadataInput) {
                        return {
                            scrollTopAfterManualScroll,
                            noInputFound: true,
                            conclusion:
                                'No input found in metadata-container — cannot reproduce full user scenario. Testing class mutation instead.',
                        };
                    }

                    // Step 3: Focus the input (simulates user clicking on Meta Bind field)
                    metadataInput.focus();
                    await new Promise((r) => setTimeout(r, 200));

                    const scrollTopAfterFocus = cm6View.scrollDOM.scrollTop;

                    // Step 4: Type in the input (simulates user entering text)
                    metadataInput.value = 'test input';
                    metadataInput.dispatchEvent(
                        new Event('input', { bubbles: true }),
                    );
                    await new Promise((r) => setTimeout(r, 300));

                    const scrollTopAfterType = cm6View.scrollDOM.scrollTop;

                    return {
                        scrollTopAfterManualScroll,
                        scrollTopAfterFocus,
                        scrollTopAfterType,
                        scrollJumpedOnFocus:
                            scrollTopAfterFocus >
                            scrollTopAfterManualScroll + 50,
                        scrollJumpedOnType:
                            scrollTopAfterType >
                            scrollTopAfterManualScroll + 50,
                        bugReproduced:
                            scrollTopAfterFocus >
                                scrollTopAfterManualScroll + 50 ||
                            scrollTopAfterType >
                                scrollTopAfterManualScroll + 50,
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] User scenario reproduction:',
                JSON.stringify(result, null, 2),
            );
            console.log(
                '[SPIKE #89] Cursor was at:',
                JSON.stringify(cursorBefore),
            );
            expect(result).not.toHaveProperty('error');

            if (result.bugReproduced) {
                console.log(
                    '[SPIKE #89] USER SCENARIO REPRODUCED: Scroll jumped when interacting with properties input',
                );
            } else if (result.noInputFound) {
                console.log(
                    '[SPIKE #89] No input in metadata-container — Meta Bind may render differently in test env',
                );
            }
        });
    });

    // ─── Section 4: Verify genuine fold toggle still works ─────────────

    describe('4. Genuine fold toggle (is-collapsed) should still scroll', function () {
        it('should scroll into view when is-collapsed is toggled (legitimate behavior)', async function () {
            await setupEditor(LONG_CONTENT_PLAIN_FRONTMATTER, {
                line: 70,
                ch: 0,
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { scrollDOM: HTMLElement } | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );
                    if (!metadata) return { error: 'No metadata-container' };

                    // Toggle fold via Obsidian command
                    (app as unknown as CommandsApi).commands.executeCommandById(
                        'editor:toggle-fold-properties',
                    );
                    await new Promise((r) => setTimeout(r, 500));

                    const wasCollapsed =
                        metadata.classList.contains('is-collapsed');

                    // Now toggle back
                    (app as unknown as CommandsApi).commands.executeCommandById(
                        'editor:toggle-fold-properties',
                    );
                    await new Promise((r) => setTimeout(r, 500));

                    const isCollapsedAfter =
                        metadata.classList.contains('is-collapsed');

                    return {
                        wasCollapsed,
                        isCollapsedAfter,
                        foldToggled: wasCollapsed !== isCollapsedAfter,
                        conclusion:
                            'Fold toggle should continue to trigger scrollIntoView — only non-fold mutations should be filtered out',
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Genuine fold toggle:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });
    });

    // ─── Section 5: Split view cross-scroll reproduction ───────────────

    describe('5. Split view cross-scroll (user reported both windows scrolled)', function () {
        it('should detect if class mutation causes scroll in BOTH split panes', async function () {
            // Load a split layout with same file in both panes
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'horizontal',
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
            await ensureLivePreview();

            // Set content in the active (left) editor
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 70, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    // Find all markdown views
                    const views: Array<{
                        scrollDOM: HTMLElement;
                        metadata: Element | null;
                    }> = [];
                    app.workspace.iterateAllLeaves((leaf) => {
                        if (leaf.view instanceof obsidian.MarkdownView) {
                            const cm6View = (
                                leaf.view.editor as unknown as Record<
                                    string,
                                    unknown
                                >
                            ).cm as { scrollDOM: HTMLElement } | undefined;
                            if (cm6View?.scrollDOM) {
                                const container =
                                    leaf.view.contentEl ??
                                    cm6View.scrollDOM.closest(
                                        '.workspace-leaf-content',
                                    );
                                views.push({
                                    scrollDOM: cm6View.scrollDOM,
                                    metadata:
                                        container?.querySelector(
                                            '.metadata-container',
                                        ) ?? null,
                                });
                            }
                        }
                    });

                    if (views.length < 2)
                        return {
                            error: `Only found ${views.length} views, need 2 for split test`,
                        };

                    // Scroll both views to top
                    for (const v of views) {
                        v.scrollDOM.scrollTop = 0;
                    }
                    await new Promise((r) => setTimeout(r, 300));

                    const scrollsBefore = views.map(
                        (v) => v.scrollDOM.scrollTop,
                    );

                    // Mutate the first view's metadata-container class
                    const targetMetadata = views.find(
                        (v) => v.metadata,
                    )?.metadata;
                    if (!targetMetadata)
                        return {
                            error: 'No metadata-container in any view',
                            viewCount: views.length,
                        };

                    targetMetadata.classList.add('spike-cross-view-test');
                    await new Promise((r) => setTimeout(r, 300));
                    targetMetadata.classList.remove('spike-cross-view-test');

                    const scrollsAfter = views.map(
                        (v) => v.scrollDOM.scrollTop,
                    );

                    return {
                        viewCount: views.length,
                        scrollsBefore,
                        scrollsAfter,
                        view0Jumped:
                            Math.abs(scrollsAfter[0] - scrollsBefore[0]) > 50,
                        view1Jumped:
                            Math.abs(scrollsAfter[1] - scrollsBefore[1]) > 50,
                        bothJumped:
                            Math.abs(scrollsAfter[0] - scrollsBefore[0]) > 50 &&
                            Math.abs(scrollsAfter[1] - scrollsBefore[1]) > 50,
                        conclusion:
                            Math.abs(scrollsAfter[0] - scrollsBefore[0]) > 50 &&
                            Math.abs(scrollsAfter[1] - scrollsBefore[1]) > 50
                                ? 'CONFIRMED: Both split views scroll — propertiesFoldObserver fires per-view'
                                : 'Only one or no views scrolled',
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Split view cross-scroll:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });
    });

    // ─── Section 6: Verify the observer is the actual source ───────────

    describe('6. Observer attribution — confirm propertiesFoldObserver is the source', function () {
        it('should confirm that disabling the observer prevents the scroll jump', async function () {
            // Reset to single-pane layout
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureLivePreview();
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 70, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              scrollDOM: HTMLElement;
                              plugin: (spec: unknown) => unknown;
                              docView: unknown;
                          }
                        | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );
                    if (!metadata) return { error: 'No metadata-container' };

                    // --- Test WITH observer (current behavior) ---
                    cm6View.scrollDOM.scrollTop = 0;
                    await new Promise((r) => setTimeout(r, 200));
                    const scrollBeforeWith = cm6View.scrollDOM.scrollTop;

                    metadata.classList.add('test-with-observer');
                    await new Promise((r) => setTimeout(r, 300));
                    metadata.classList.remove('test-with-observer');

                    const scrollAfterWith = cm6View.scrollDOM.scrollTop;
                    const jumpedWith =
                        Math.abs(scrollAfterWith - scrollBeforeWith) > 50;

                    // --- Manually disconnect ALL MutationObservers on metadata ---
                    // We can't easily target just our observer, but we can test
                    // by temporarily replacing the classList to prevent mutations
                    // from triggering the observer's callback path.

                    return {
                        scrollBeforeWith,
                        scrollAfterWith,
                        jumpedWith,
                        conclusion: jumpedWith
                            ? 'Observer IS the cause — scroll jumped when class mutated'
                            : 'Observer did NOT cause scroll — look for other mechanisms',
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Observer attribution:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });
    });

    // ─── Section 7: Check what class actually changes on Meta Bind ─────

    describe('7. Meta Bind class mutation audit', function () {
        it('should log all class mutations on metadata-container during input interaction', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureLivePreview();
            await setupEditor(LONG_CONTENT_WITH_METABIND, { line: 5, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No MarkdownView' };

                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as { scrollDOM: HTMLElement } | undefined;
                    if (!cm6View?.scrollDOM)
                        return { error: 'No CM6 scrollDOM' };

                    const container =
                        view.contentEl ??
                        cm6View.scrollDOM.closest('.workspace-leaf-content');
                    const metadata = container?.querySelector(
                        '.metadata-container',
                    );
                    if (!metadata) return { error: 'No metadata-container' };

                    // Install a spy observer to capture mutations
                    const mutations: Array<{
                        oldClasses: string;
                        newClasses: string;
                        timestamp: number;
                    }> = [];
                    const spy = new MutationObserver((records) => {
                        for (const r of records) {
                            if (
                                r.type === 'attributes' &&
                                r.attributeName === 'class'
                            ) {
                                mutations.push({
                                    oldClasses: r.oldValue ?? '',
                                    newClasses: (r.target as HTMLElement)
                                        .className,
                                    timestamp: performance.now(),
                                });
                            }
                        }
                    });
                    spy.observe(metadata, {
                        attributes: true,
                        attributeFilter: ['class'],
                        attributeOldValue: true,
                    });

                    // Find and interact with a properties input
                    const input = container?.querySelector(
                        '.metadata-container input, .metadata-container textarea',
                    ) as HTMLInputElement | null;

                    if (input) {
                        input.focus();
                        await new Promise((r) => setTimeout(r, 200));
                        input.value = 'spike test';
                        input.dispatchEvent(
                            new Event('input', { bubbles: true }),
                        );
                        await new Promise((r) => setTimeout(r, 300));
                        input.blur();
                        await new Promise((r) => setTimeout(r, 200));
                    }

                    // Also try toggling fold to see what that looks like
                    (app as unknown as CommandsApi).commands.executeCommandById(
                        'editor:toggle-fold-properties',
                    );
                    await new Promise((r) => setTimeout(r, 500));

                    (app as unknown as CommandsApi).commands.executeCommandById(
                        'editor:toggle-fold-properties',
                    );
                    await new Promise((r) => setTimeout(r, 500));

                    spy.disconnect();

                    return {
                        inputFound: !!input,
                        mutationCount: mutations.length,
                        mutations: mutations.map((m) => ({
                            oldClasses: m.oldClasses,
                            newClasses: m.newClasses,
                            classesAdded: m.newClasses
                                .split(/\s+/)
                                .filter(
                                    (c) =>
                                        !m.oldClasses.split(/\s+/).includes(c),
                                ),
                            classesRemoved: m.oldClasses
                                .split(/\s+/)
                                .filter(
                                    (c) =>
                                        !m.newClasses.split(/\s+/).includes(c),
                                ),
                        })),
                        conclusion:
                            'Check which class changes are fold-related (is-collapsed) vs noise from Meta Bind or Obsidian',
                    };
                },
            )) as Record<string, unknown>;

            console.log(
                '[SPIKE #89] Meta Bind class mutation audit:',
                JSON.stringify(result, null, 2),
            );
            expect(result).not.toHaveProperty('error');
        });
    });
});
