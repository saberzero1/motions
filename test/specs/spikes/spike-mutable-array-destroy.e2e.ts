/**
 * Spike: Verify that `registerEditorExtension()` with a mutable array
 * properly calls `ViewPlugin.destroy()` when the array is emptied and
 * `workspace.updateOptions()` is invoked.
 *
 * This is the key decision point for whether Strategy A (mutable array)
 * is viable for a vim-mode toggle command.
 *
 * What we test:
 *   1. Register a ViewPlugin via a mutable Extension[] array
 *   2. Confirm the plugin's create() ran (plugin is active)
 *   3. Empty the array, call updateOptions()
 *   4. Confirm destroy() was called on the removed plugin
 *   5. Re-populate the array, call updateOptions()
 *   6. Confirm create() ran again (re-creation works)
 *   7. Verify no duplicate plugins after re-creation
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { focusEditor } from '../../helpers';

const PAUSE = { SETTLE: 500, RENDER: 300 } as const;

describe('Spike: mutable array + updateOptions() destroy lifecycle', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should call ViewPlugin.destroy() when array is emptied and updateOptions() is called', async function () {
        this.timeout(30000);

        // Step 1: Register a probe ViewPlugin in a mutable array
        const setup = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            const editorWrapper = view.editor as unknown as {
                cm?: { cm?: unknown };
            };
            const cm6View = editorWrapper?.cm?.cm as
                Record<string, unknown> | undefined;
            if (!cm6View) return { error: 'No CM6 EditorView' };

            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const cmView = require('@codemirror/view');

            const tracker = {
                createCount: 0,
                destroyCount: 0,
                updateCount: 0,
                activeViews: 0,
            };
            (
                window as unknown as Record<string, unknown>
            ).__spikeDestroyTracker = tracker;

            const probePlugin = cmView.ViewPlugin.fromClass(
                class {
                    constructor() {
                        tracker.createCount++;
                        tracker.activeViews++;
                    }
                    update() {
                        tracker.updateCount++;
                    }
                    destroy() {
                        tracker.destroyCount++;
                        tracker.activeViews--;
                    }
                },
            );

            const extensionSlot: unknown[] = [probePlugin];
            (
                window as unknown as Record<string, unknown>
            ).__spikeExtensionSlot = extensionSlot;

            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                registerEditorExtension: (ext: unknown) => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];

            if (!plugin?.registerEditorExtension) {
                return { error: 'Plugin registerEditorExtension not found' };
            }

            plugin.registerEditorExtension(extensionSlot);

            return { registered: true };
        });

        if ('error' in setup) {
            throw new Error(setup.error as string);
        }
        expect(setup).toHaveProperty('registered', true);

        await browser.pause(PAUSE.SETTLE);

        // Step 2: Verify the plugin was created
        const afterCreate = await browser.executeObsidian(() => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeDestroyTracker as {
                createCount: number;
                destroyCount: number;
                updateCount: number;
                activeViews: number;
            };
            return { ...tracker };
        });

        console.log('After create:', JSON.stringify(afterCreate, null, 2));
        expect(afterCreate.createCount).toBeGreaterThanOrEqual(1);
        expect(afterCreate.destroyCount).toBe(0);
        expect(afterCreate.activeViews).toBeGreaterThanOrEqual(1);

        // Step 3: Empty the array and call updateOptions()
        await browser.executeObsidian(({ app }) => {
            const slot = (window as unknown as Record<string, unknown>)
                .__spikeExtensionSlot as unknown[];
            slot.length = 0;

            (
                app.workspace as unknown as { updateOptions: () => void }
            ).updateOptions();
        });

        await browser.pause(PAUSE.SETTLE);

        // Step 4: Verify destroy() was called
        const afterDestroy = await browser.executeObsidian(() => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeDestroyTracker as {
                createCount: number;
                destroyCount: number;
                updateCount: number;
                activeViews: number;
            };
            return { ...tracker };
        });

        console.log('After destroy:', JSON.stringify(afterDestroy, null, 2));
        expect(afterDestroy.destroyCount).toBeGreaterThanOrEqual(1);
        expect(afterDestroy.activeViews).toBe(0);

        // Step 5: Re-populate the array and call updateOptions()
        await browser.executeObsidian(({ app }) => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const cmView = require('@codemirror/view');
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeDestroyTracker as {
                createCount: number;
                destroyCount: number;
                updateCount: number;
                activeViews: number;
            };

            const probePlugin2 = cmView.ViewPlugin.fromClass(
                class {
                    constructor() {
                        tracker.createCount++;
                        tracker.activeViews++;
                    }
                    update() {
                        tracker.updateCount++;
                    }
                    destroy() {
                        tracker.destroyCount++;
                        tracker.activeViews--;
                    }
                },
            );

            const slot = (window as unknown as Record<string, unknown>)
                .__spikeExtensionSlot as unknown[];
            slot.push(probePlugin2);

            (
                app.workspace as unknown as { updateOptions: () => void }
            ).updateOptions();
        });

        await browser.pause(PAUSE.SETTLE);

        // Step 6: Verify re-creation
        const afterRecreate = await browser.executeObsidian(() => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeDestroyTracker as {
                createCount: number;
                destroyCount: number;
                updateCount: number;
                activeViews: number;
            };
            return { ...tracker };
        });

        console.log('After recreate:', JSON.stringify(afterRecreate, null, 2));

        expect(afterRecreate.createCount).toBeGreaterThan(
            afterDestroy.createCount,
        );
        expect(afterRecreate.destroyCount).toBe(afterDestroy.destroyCount);
        expect(afterRecreate.activeViews).toBeGreaterThanOrEqual(1);
    });

    it('should NOT have duplicate plugins after remove+re-add cycle', async function () {
        this.timeout(20000);

        const counts = await browser.executeObsidian(({ app, obsidian }) => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeDestroyTracker as {
                createCount: number;
                destroyCount: number;
                activeViews: number;
            };

            let mdViewCount = 0;
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view instanceof obsidian.MarkdownView) {
                    mdViewCount++;
                }
            });

            return {
                activeViews: tracker.activeViews,
                mdViewCount,
                ratio:
                    mdViewCount > 0
                        ? tracker.activeViews / mdViewCount
                        : 'no-views',
            };
        });

        console.log('Duplicate check:', JSON.stringify(counts, null, 2));

        if (typeof counts.ratio === 'number') {
            expect(counts.ratio).toBe(1);
        }
    });

    it('should handle eventObservers lifecycle: observer removed after array emptied', async function () {
        this.timeout(20000);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const cmView = require('@codemirror/view');

            const observerTracker: {
                keydownCount: number;
                destroyCount: number;
                lastView: unknown;
            } = {
                keydownCount: 0,
                destroyCount: 0,
                lastView: null,
            };
            (
                window as unknown as Record<string, unknown>
            ).__spikeObserverTracker = observerTracker;

            const observerPlugin = cmView.ViewPlugin.fromClass(
                class {
                    destroy() {
                        observerTracker.destroyCount++;
                    }
                },
                {
                    eventObservers: {
                        // The view is captured because "which view fired this"
                        // is half the diagnosis; the active editor is not
                        // necessarily the one the click and keypress landed on.
                        // Only editors that `registerEditorExtension` +
                        // `updateOptions()` actually governs are counted.
                        // Embedded editors — table cells, popovers, textarea
                        // overlays — are handed extensions when they are
                        // constructed and are never reconfigured afterwards,
                        // so an extension surviving there is by design and not
                        // what this spike is about. Windows exposed this by
                        // having a table cell editor open where Linux did not.
                        keydown: (_e: KeyboardEvent, firingView: unknown) => {
                            const dom = (firingView as { dom: HTMLElement })
                                .dom;
                            if (
                                dom.closest(
                                    '.cm-table-widget, .popover, .modal-container, .vim-motions-textarea-overlay',
                                )
                            ) {
                                return;
                            }
                            observerTracker.keydownCount++;
                            observerTracker.lastView = firingView;
                        },
                    },
                },
            );

            const win = window as unknown as Record<string, unknown>;
            win.__spikeObserverPlugin = observerPlugin;
            win.__spikeActiveCm = (
                view.editor as unknown as Record<string, unknown>
            ).cm;

            const slot2: unknown[] = [observerPlugin];
            (window as unknown as Record<string, unknown>).__spikeObserverSlot =
                slot2;

            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                registerEditorExtension: (ext: unknown) => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin!.registerEditorExtension(slot2);

            return { registered: true };
        });

        if ('error' in result) throw new Error(result.error as string);

        await browser.pause(PAUSE.SETTLE);

        await focusEditor();
        await browser.keys('a');
        await browser.pause(PAUSE.RENDER);

        const beforeRemove = await browser.executeObsidian(() => {
            // Read field by field, not by spreading: the tracker also holds an
            // EditorView, which WebDriver cannot serialise.
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeObserverTracker as {
                keydownCount: number;
                destroyCount: number;
            };
            return {
                keydownCount: tracker.keydownCount,
                destroyCount: tracker.destroyCount,
            };
        });

        console.log(
            'Observer before remove:',
            JSON.stringify(beforeRemove, null, 2),
        );
        expect(beforeRemove.keydownCount).toBeGreaterThanOrEqual(1);

        await browser.executeObsidian(({ app }) => {
            const slot = (window as unknown as Record<string, unknown>)
                .__spikeObserverSlot as unknown[];
            slot.length = 0;
            (
                app.workspace as unknown as { updateOptions: () => void }
            ).updateOptions();
        });

        // Wait for the reconfiguration to be observable rather than sleeping a
        // fixed interval. A timed pause cannot distinguish "the observer was
        // never detached" from "the reconfigure had not landed yet on a slower
        // runner", which is the open question behind this spec's Windows
        // failures.
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(() => {
                    const tracker = (
                        window as unknown as Record<string, unknown>
                    ).__spikeObserverTracker as { destroyCount: number };
                    return tracker.destroyCount;
                })) >= 1,
            {
                timeout: 10_000,
                timeoutMsg:
                    'ViewPlugin.destroy() never fired after clearing the ' +
                    'extension slot and calling updateOptions()',
            },
        );

        await browser.executeObsidian(() => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeObserverTracker as {
                keydownCount: number;
                lastView: unknown;
            };
            tracker.keydownCount = 0;
            // Cleared together: the view captured during the pre-removal
            // keypress would otherwise be read as evidence about a keydown
            // that never happened after the removal.
            tracker.lastView = null;
        });

        await focusEditor();
        await browser.keys('b');
        await browser.pause(PAUSE.RENDER);

        const afterRemove = await browser.executeObsidian(() => {
            // Three outcomes are possible and the plain counter cannot tell
            // them apart. `EditorView.plugin()` answers whether the firing
            // view still has the plugin in its configuration, and comparing
            // the firing view with the active one answers whether the key
            // even went where the reconfiguration was checked.
            const win = window as unknown as Record<string, unknown>;
            const tracker = win.__spikeObserverTracker as {
                keydownCount: number;
                destroyCount: number;
                lastView: unknown;
            };
            const firing = tracker.lastView as {
                plugin: (p: unknown) => unknown;
                dom: HTMLElement;
                inputState?: {
                    handlers?: Record<string, { observers?: unknown[] }>;
                };
            } | null;

            let verdict = 'no-keydown-observed';
            if (firing) {
                const stillConfigured =
                    firing.plugin(win.__spikeObserverPlugin) != null;
                const isActive = firing === win.__spikeActiveCm;
                verdict = stillConfigured
                    ? isActive
                        ? 'plugin-still-in-active-view'
                        : 'plugin-still-in-other-view'
                    : isActive
                      ? 'handler-map-stale-in-active-view'
                      : 'handler-map-stale-in-other-view';
            }

            return {
                keydownCount: tracker.keydownCount,
                destroyCount: tracker.destroyCount,
                verdict,
                firingViewAttached: firing ? firing.dom.isConnected : false,
                firingViewObservers:
                    firing?.inputState?.handlers?.keydown?.observers?.length ??
                    -1,
                editorCount: document.querySelectorAll('.cm-editor').length,
                // Names every editor present. `plugin-still-in-other-view`
                // says a second editor kept the configuration; this says what
                // that editor is, which decides whether it was ever governed
                // by registerEditorExtension at all — embedded editors receive
                // extensions through StateEffect.appendConfig instead.
                editorTags: Array.from(document.querySelectorAll('.cm-editor'))
                    .map((el) => {
                        const dom = el as HTMLElement;
                        const embedded =
                            (dom.closest('.cm-table-widget') &&
                                'table-widget') ||
                            (dom.closest('.popover') && 'popover') ||
                            (dom.closest('.modal-container') && 'modal') ||
                            (dom.closest('.vim-motions-textarea-overlay') &&
                                'textarea');
                        const leafType = dom
                            .closest('.workspace-leaf-content')
                            ?.getAttribute('data-type');
                        const isFiring = firing ? dom === firing.dom : false;
                        return `${
                            embedded
                                ? 'embedded:' + embedded
                                : leafType
                                  ? 'leaf:' + leafType
                                  : 'detached'
                        }${isFiring ? '*' : ''}`;
                    })
                    .join(','),
            };
        });

        console.log(
            'Observer after remove:',
            JSON.stringify(afterRemove, null, 2),
        );

        expect(
            `keydown=${afterRemove.keydownCount} verdict=${afterRemove.verdict} attached=${afterRemove.firingViewAttached} observers=${afterRemove.firingViewObservers} editors=[${afterRemove.editorTags}]`,
        ).toBe(
            `keydown=0 verdict=no-keydown-observed attached=false observers=-1 editors=[${afterRemove.editorTags}]`,
        );
        expect(afterRemove.destroyCount).toBeGreaterThanOrEqual(1);
    });

    after(async function () {
        await browser.executeObsidian(() => {
            const win = window as unknown as Record<string, unknown>;
            delete win.__spikeDestroyTracker;
            delete win.__spikeExtensionSlot;
            delete win.__spikeObserverTracker;
            delete win.__spikeObserverSlot;
        });
    });
});
