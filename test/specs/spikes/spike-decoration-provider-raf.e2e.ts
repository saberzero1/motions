/**
 * Spike: Phase 0b of `.sisyphus/plans/nvim-set-decoration-provider.md`.
 *
 * Phase 3 proposes a CM6 ViewPlugin that schedules a `requestAnimationFrame`
 * which dispatches a transaction, guarded by an Annotation so the plugin
 * ignores its own commits. No such pattern exists in this repo:
 * `Annotation.define` appears nowhere in `src/`, and no ViewPlugin combines
 * update() + rAF + effect dispatch + self-suppression. This validates the
 * mechanism before Phase 3 commits to it.
 *
 * Variants:
 *   V1 production shape (Q1 predicate, guard on)
 *   V2 same, guard off        -> FINDING, not a gate
 *   V3 unconditional, guard off -> synthetic loop control (harness self-test)
 *   V4 synchronous dispatch from update() -> re-entrancy control
 *   V5 teardown cancellation
 *   V6 stale generation, view still alive
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

type Variant = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';

interface FrameSample {
    frame: number;
    dispatched: number;
    reasons: string[];
}

interface SpikeResult {
    error?: string;
    variant: Variant;
    samples: FrameSample[];
    totalDispatched: number;
    errors: string[];
    decorationsInDom: number;
    pendingBeforeTeardown?: boolean | null;
    dispatchedAfterTeardown?: number;
}

const FRAMES = 15;
const SETTLE_TAIL = 5;

async function runVariant(variant: Variant): Promise<SpikeResult> {
    return browser.executeObsidian(async ({ app, obsidian }, v: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'No MarkdownView', variant: v };
        // `view.editor.cm` IS the CM6 EditorView; `editorView.cm` is the
        // CM5-compat adapter (see `getCmAdapter`, src/vim/vim-api.ts:39-57).
        const cm6 = (view.editor as unknown as { cm?: unknown }).cm as
            Record<string, any> | undefined;
        if (typeof cm6?.dispatch !== 'function') {
            return { error: 'No CM6 EditorView', variant: v };
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cmView = require('@codemirror/view');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cmState = require('@codemirror/state');

        const selfTag = cmState.Annotation.define();
        const addEffect = cmState.StateEffect.define();

        const decoField = cmState.StateField.define({
            create: () => cmView.Decoration.none,
            update(deco: any, tr: any) {
                let next = deco.map(tr.changes);
                for (const e of tr.effects) {
                    if (e.is(addEffect)) {
                        const len = tr.state.doc.length;
                        if (len > 1) {
                            next = cmView.Decoration.set([
                                cmView.Decoration.mark({
                                    class: 'spike-raf-deco',
                                }).range(0, 1),
                            ]);
                        }
                    }
                }
                return next;
            },
            provide: (f: any) => cmView.EditorView.decorations.from(f),
        });

        // Per-view state. A global counter would silently aggregate split
        // panes and popovers, making any loop unattributable.
        const perView = new WeakMap<object, any>();
        const stateFor = (viewInstance: object) => {
            let st = perView.get(viewInstance);
            if (!st) {
                st = {
                    rafId: null as number | null,
                    dispatched: 0,
                    dispatchedThisFrame: 0,
                    reasonsThisFrame: [] as string[],
                    errors: [] as string[],
                    generation: 0,
                    measuring: false,
                };
                perView.set(viewInstance, st);
            }
            return st;
        };

        const guarded = v !== 'V2' && v !== 'V3';
        const unconditional = v === 'V3';
        const syncDispatch = v === 'V4';

        let tracked: any = null;

        const probe = cmView.ViewPlugin.fromClass(
            class {
                view: any;
                constructor(viewInstance: any) {
                    this.view = viewInstance;
                    tracked = stateFor(viewInstance);
                }
                update(u: any) {
                    const st = stateFor(this.view);
                    if (
                        guarded &&
                        u.transactions.some(
                            (tr: any) => tr.annotation(selfTag) !== undefined,
                        )
                    ) {
                        return;
                    }
                    const reasons: string[] = [];
                    if (u.docChanged) reasons.push('doc');
                    if (u.viewportChanged) reasons.push('viewport');
                    if (u.geometryChanged) reasons.push('geometry');
                    if (u.selectionSet) reasons.push('selection');
                    if (u.focusChanged) reasons.push('focus');
                    if (unconditional && reasons.length === 0) {
                        reasons.push('unconditional');
                    }
                    if (reasons.length === 0) return;

                    if (syncDispatch) {
                        try {
                            this.view.dispatch({
                                effects: addEffect.of(null),
                                annotations: selfTag.of(true),
                            });
                            st.dispatched++;
                        } catch (e) {
                            st.errors.push(String(e));
                        }
                        return;
                    }

                    if (st.rafId !== null) return;
                    const gen = st.generation;
                    st.rafId = window.requestAnimationFrame(() => {
                        st.rafId = null;
                        if (gen !== st.generation) return;
                        try {
                            this.view.dispatch({
                                effects: addEffect.of(null),
                                annotations: selfTag.of(true),
                            });
                            st.dispatched++;
                            if (st.measuring) {
                                st.dispatchedThisFrame++;
                                st.reasonsThisFrame.push(...reasons);
                            }
                        } catch (e) {
                            st.errors.push(String(e));
                        }
                    });
                }
                destroy() {
                    const st = stateFor(this.view);
                    if (st.rafId !== null) {
                        window.cancelAnimationFrame(st.rafId);
                        st.rafId = null;
                    }
                }
            },
        );

        const slot: unknown[] = [decoField, probe];
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { registerEditorExtension: (e: unknown) => void }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin.registerEditorExtension(slot);

        const nextFrame = () =>
            new Promise<void>((r) => window.requestAnimationFrame(() => r()));
        const sleep = (ms: number) =>
            new Promise<void>((r) => window.setTimeout(r, ms));

        // ---- setup phase: let registration settle, then zero counters ----
        await sleep(400);
        if (!tracked) return { error: 'probe never constructed', variant: v };
        tracked.dispatched = 0;
        tracked.errors.length = 0;

        cm6.dispatch({
            changes: { from: 0, insert: 'spike stimulus line\n' },
        });
        await sleep(100);

        const result: any = {
            variant: v,
            samples: [],
            errors: [],
            pendingBeforeTeardown: null,
            dispatchedAfterTeardown: 0,
        };

        if (v === 'V6') {
            // Invalidate the generation while a rAF is in flight, with the
            // view still alive. Teardown cannot test this.
            cm6.dispatch({ changes: { from: 0, insert: 'x' } });
            const wasPending = tracked.rafId !== null;
            tracked.generation++;
            const before = tracked.dispatched;
            await nextFrame();
            await nextFrame();
            result.pendingBeforeTeardown = wasPending;
            result.dispatchedAfterTeardown = tracked.dispatched - before;
            result.totalDispatched = tracked.dispatched;
            result.errors = [...tracked.errors];
            result.decorationsInDom =
                document.querySelectorAll('.spike-raf-deco').length;
            return result;
        }

        if (v === 'V5') {
            cm6.dispatch({ changes: { from: 0, insert: 'y' } });
            const wasPending = tracked.rafId !== null;
            const before = tracked.dispatched;
            slot.length = 0;
            app.workspace.updateOptions();
            await nextFrame();
            await nextFrame();
            result.pendingBeforeTeardown = wasPending;
            result.dispatchedAfterTeardown = tracked.dispatched - before;
            result.totalDispatched = tracked.dispatched;
            result.errors = [...tracked.errors];
            result.decorationsInDom =
                document.querySelectorAll('.spike-raf-deco').length;
            return result;
        }

        // ---- measurement phase ----
        tracked.measuring = true;
        for (let i = 0; i < 15; i++) {
            tracked.dispatchedThisFrame = 0;
            tracked.reasonsThisFrame = [];
            await nextFrame();
            result.samples.push({
                frame: i,
                dispatched: tracked.dispatchedThisFrame,
                reasons: [...new Set(tracked.reasonsThisFrame)],
            });
        }
        tracked.measuring = false;

        result.totalDispatched = tracked.dispatched;
        result.errors = [...tracked.errors];
        result.pendingAtBoundary = tracked.rafId !== null;
        result.decorationsInDom =
            document.querySelectorAll('.spike-raf-deco').length;

        slot.length = 0;
        app.workspace.updateOptions();
        return result;
    }, variant) as Promise<SpikeResult>;
}

function settles(r: SpikeResult & { pendingAtBoundary?: boolean }): boolean {
    const tail = r.samples.slice(-SETTLE_TAIL);
    return tail.every((s) => s.dispatched === 0) && !r.pendingAtBoundary;
}

describe('Spike: decoration-provider rAF dispatch mechanism', function () {
    this.timeout(60000);

    beforeEach(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('A/C: guarded production shape dispatches once and settles', async function () {
        const r = await runVariant('V1');
        console.log('V1: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
        expect(r.errors).toEqual([]);
        expect(r.totalDispatched).toBeGreaterThanOrEqual(1);
        expect(r.decorationsInDom).toBeGreaterThan(0);
        expect(settles(r)).toBe(true);
    });

    it('B: NEGATIVE CONTROL - sync dispatch from update() is rejected by CM6', async function () {
        const r = await runVariant('V4');
        console.log('V4: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
        expect(r.errors.join('\n')).toMatch(
            /update are not allowed|not allowed/,
        );
    });

    it('E: NEGATIVE CONTROL - unconditional scheduling loops and fails the detector', async function () {
        const r = await runVariant('V3');
        console.log('V3: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
        expect(settles(r)).toBe(false);
        const active = r.samples.filter((s) => s.dispatched > 0).length;
        expect(active).toBeGreaterThanOrEqual(10);
    });

    it('D: FINDING - is the annotation load-bearing or defence-in-depth?', async function () {
        const r = await runVariant('V2');
        const verdict = settles(r)
            ? 'SETTLES -> annotation is DEFENCE-IN-DEPTH; Q1 predicate alone sufficed for this decoration and stimulus'
            : 'LOOPS -> annotation is LOAD-BEARING; keep Q1 wording';
        console.log('V2 FINDING: ' + verdict + ' :: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
    });

    it('F: teardown cancels a pending callback', async function () {
        const r = await runVariant('V5');
        console.log('V5: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
        expect(r.pendingBeforeTeardown).toBe(true);
        expect(r.dispatchedAfterTeardown).toBe(0);
    });

    it('G: stale generation suppresses dispatch on a live view', async function () {
        const r = await runVariant('V6');
        console.log('V6: ' + JSON.stringify(r));
        expect(r.error).toBeUndefined();
        expect(r.pendingBeforeTeardown).toBe(true);
        expect(r.dispatchedAfterTeardown).toBe(0);
    });
});
