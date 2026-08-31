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

            const observerTracker = {
                keydownCount: 0,
                destroyCount: 0,
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
                        keydown: () => {
                            observerTracker.keydownCount++;
                        },
                    },
                },
            );

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

        const el = await browser.$('.cm-editor .cm-content');
        await el.click();
        await browser.keys('a');
        await browser.pause(PAUSE.RENDER);

        const beforeRemove = await browser.executeObsidian(() => {
            return {
                ...((window as unknown as Record<string, unknown>)
                    .__spikeObserverTracker as {
                    keydownCount: number;
                    destroyCount: number;
                }),
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

        await browser.pause(PAUSE.SETTLE);

        await browser.executeObsidian(() => {
            const tracker = (window as unknown as Record<string, unknown>)
                .__spikeObserverTracker as { keydownCount: number };
            tracker.keydownCount = 0;
        });

        await el.click();
        await browser.keys('b');
        await browser.pause(PAUSE.RENDER);

        const afterRemove = await browser.executeObsidian(() => {
            return {
                ...((window as unknown as Record<string, unknown>)
                    .__spikeObserverTracker as {
                    keydownCount: number;
                    destroyCount: number;
                }),
            };
        });

        console.log(
            'Observer after remove:',
            JSON.stringify(afterRemove, null, 2),
        );

        expect(afterRemove.keydownCount).toBe(0);
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
