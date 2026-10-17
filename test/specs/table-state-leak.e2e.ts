import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    isSourceMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Entering a table must not leak global editor state across an LP→Source
 * switch.
 *
 * Three separately-owned pieces of state used to survive the transition: the
 * fork's per-view cursor suppression override (`table-cell-cursor-guard`), the
 * fork's global key interception (`table-nav-controller`), and focus itself,
 * which the browser parks on `<body>` when a focused element is detached. The
 * user-visible result was an editor with no cursor that accepted no keys until
 * it was clicked.
 *
 * Two properties of this spec are load-bearing and must not be "simplified":
 *
 * 1. **No settling pause before the first read.** The switch is dispatched
 *    without awaiting it, because `ensureSourceMode()` waits for the mode to
 *    land and the leak is observable in the window before that. Every other
 *    table spec waits, which is why 37 of them pass over this.
 * 2. **`keyMovesCursor` is asserted, not just the flags.** `main.ts`'s
 *    `keyInterceptSafetyHandler` clears the intercept on the next keydown, so
 *    a scenario that pressed a key before reading could not distinguish a
 *    correct release from a leak papered over by the backstop. And a flag
 *    reading `false` while `j` moves nothing is still a dead editor.
 *
 * ARM C is the control: identical mode and identical switch, differing only in
 * whether the table was entered. It must pass even when the others fail, or
 * the spec is measuring the mode switch rather than the table.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Line below',
].join('\n');

interface NestedStats {
    mounted: number;
    focused: boolean;
    routerInstalled: boolean;
    focusRestores: number;
    lastHandOff: {
        reason: string;
        hasFocus: boolean;
        focusNowhere: boolean;
        restored: boolean;
    } | null;
}

interface LeakPlugin {
    getNestedTableStats(): NestedStats;
}

interface Sample {
    error?: string;
    ownedSurfaces: number;
    nativeWidgets: number;
    nested: NestedStats;
    parentHead: number;
    activeTag: string;
    visibleCursors: number;
    viewOverrideCount: number | null;
    viewSuppressed: boolean | null;
    keyInterceptActive: boolean | null;
}

async function sample(): Promise<Sample> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Sample = {
            ownedSurfaces: -1,
            nativeWidgets: -1,
            nested: {
                mounted: -1,
                focused: false,
                routerInstalled: false,
                focusRestores: -1,
                lastHandOff: null,
            },
            parentHead: -1,
            activeTag: '',
            visibleCursors: -1,
            viewOverrideCount: null,
            viewSuppressed: null,
            keyInterceptActive: null,
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, LeakPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = view.editor?.cm;
        if (!cm) return { ...empty, error: 'no EditorView' };

        // Registered as `() => getTableDebugState(appRef)`: zero arity.
        const debug = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    getTableDebugState?: () => {
                        cursorSuppression: {
                            viewSuppressed: boolean | null;
                            viewOverrideCount: number;
                        };
                        fork: { keyInterceptActive: boolean };
                    } | null;
                };
            }
        ).CodeMirrorAdapter?.getTableDebugState?.();
        if (!debug) return { ...empty, error: 'no debug state' };

        const active = document.activeElement as HTMLElement | null;
        return {
            ownedSurfaces: document.querySelectorAll(
                '.vim-motions-table-surface',
            ).length,
            nativeWidgets: document.querySelectorAll('.cm-table-widget').length,
            nested: plugin.getNestedTableStats(),
            parentHead: cm.state.selection.main.head,
            activeTag: active?.tagName ?? '',
            // Real paint rather than a flag: suppression reading `false` while
            // nothing is drawn is the divergence that hid this for 22 commits.
            visibleCursors: [
                ...document.querySelectorAll<HTMLElement>(
                    '.cm-vimCursorLayer > *, .cm-cursor, .vim-motions-cursor',
                ),
            ].filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            }).length,
            viewOverrideCount: debug.cursorSuppression.viewOverrideCount,
            viewSuppressed: debug.cursorSuppression.viewSuppressed,
            keyInterceptActive: debug.fork.keyInterceptActive,
        };
    })) as Sample;
}

/** Dispatch LP→Source and return immediately, without awaiting the switch. */
async function switchToSourceUnsettled(): Promise<void> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ok: false as const, error: 'no MarkdownView' };
        const state = view.getState();
        state.mode = 'source';
        state.source = true;
        void view.setState(state, { history: false });
        return { ok: true as const };
    })) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
}

async function openTable(mode: 'owned' | 'native'): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', mode);
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

async function keyMovesCursor(): Promise<boolean> {
    const before = (await sample()).parentHead;
    await browser.keys(['j']);
    await browser.pause(400);
    return (await sample()).parentHead !== before;
}

async function expectNoLeak(label: string): Promise<void> {
    const s = await sample();
    const moved = await keyMovesCursor();
    // Logged rather than passed to `expect`: this `expect` build rejects a
    // second argument outright ("Expect takes at most one argument"), and the
    // TypeScript signature does not catch it, so the message form fails every
    // assertion for a reason unrelated to the subject.
    console.log(
        `[leak ${label}] ` +
            JSON.stringify({
                overrideCount: s.viewOverrideCount,
                suppressed: s.viewSuppressed,
                keyIntercept: s.keyInterceptActive,
                active: s.activeTag,
                cursors: s.visibleCursors,
                moved,
                handOff: s.nested.lastHandOff,
                restores: s.nested.focusRestores,
            }),
    );

    expect(s.error).toBeUndefined();
    expect(s.viewOverrideCount).toBe(0);
    expect(s.viewSuppressed).toBe(false);
    expect(s.keyInterceptActive).toBe(false);
    expect(s.activeTag).not.toBe('BODY');
    expect(s.visibleCursors).toBeGreaterThan(0);
    expect(moved).toBe(true);
}

describe('Table global state leak on LP→Source (#167)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        // ARM F opens a tab; without this the next scenario starts with two
        // surfaces mounted and fails its own precondition. Measured while
        // writing the transition probe this spec grew out of.
        await browser.executeObsidian(({ app }) => {
            app.workspace
                .getLeavesOfType('markdown')
                .slice(1)
                .forEach((l) => l.detach());
        });
        await browser.pause(400);
    });

    it('ARM A: owned, entered with real keys, releases everything', async () => {
        await openTable('owned');
        const pre = await sample();
        expect(pre.error).toBeUndefined();
        expect(pre.ownedSurfaces).toBeGreaterThan(0);
        expect(pre.nativeWidgets).toBe(0);

        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(700);
        const inside = await sample();
        expect(inside.nested.mounted).toBe(1);
        expect(inside.nested.focused).toBe(true);
        expect(inside.nested.routerInstalled).toBe(true);

        await switchToSourceUnsettled();
        await browser.pause(400);

        expect(await isSourceMode()).toBe(true);
        expect((await sample()).nested.mounted).toBe(0);
        await expectNoLeak('ARM A');
    });

    it('ARM B: owned, entered by selection dispatch, releases everything', async () => {
        await openTable('owned');
        expect((await sample()).ownedSurfaces).toBeGreaterThan(0);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = view?.editor?.cm;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(5).from + 2 },
            });
        });
        await browser.pause(700);
        expect((await sample()).nested.mounted).toBe(1);

        await switchToSourceUnsettled();
        await browser.pause(400);
        await expectNoLeak('ARM B');
    });

    it('ARM C (control): owned, table never entered, stays healthy', async () => {
        await openTable('owned');
        const pre = await sample();
        expect(pre.ownedSurfaces).toBeGreaterThan(0);
        expect(pre.nested.mounted).toBe(0);

        await switchToSourceUnsettled();
        await browser.pause(400);

        expect(await isSourceMode()).toBe(true);
        await expectNoLeak('ARM C control');
    });

    it('ARM E: a modal open/close leaves the entered table intact', async () => {
        await openTable('owned');
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(700);
        expect((await sample()).nested.mounted).toBe(1);

        const opened = (await browser.executeObsidian(({ app }) => {
            return (
                app as unknown as {
                    commands: { executeCommandById: (i: string) => boolean };
                }
            ).commands.executeCommandById('command-palette:open');
        })) as boolean;
        expect(opened).toBe(true);
        await browser.pause(600);
        await browser.keys(['Escape']);
        await browser.pause(600);

        // The caret is still inside the table, so the parent staying
        // suppressed is correct here -- what must survive is the nested view,
        // its painted caret, and the keys.
        const s = await sample();
        expect(s.nested.mounted).toBe(1);
        expect(s.viewOverrideCount).toBe(1);
        expect(s.visibleCursors).toBeGreaterThan(0);
        expect(s.activeTag).not.toBe('BODY');
        expect(await keyMovesCursor()).toBe(true);
    });

    it('ARM F: a tab switch away and back leaves the entered table intact', async () => {
        await openTable('owned');
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(700);
        expect((await sample()).nested.mounted).toBe(1);

        await browser.executeObsidian(({ app }) => {
            const c = (
                app as unknown as {
                    commands: { executeCommandById: (i: string) => boolean };
                }
            ).commands;
            c.executeCommandById('workspace:new-tab');
        });
        await browser.pause(800);
        await browser.executeObsidian(({ app }) => {
            const c = (
                app as unknown as {
                    commands: { executeCommandById: (i: string) => boolean };
                }
            ).commands;
            c.executeCommandById('workspace:previous-tab');
        });
        await browser.pause(800);

        const s = await sample();
        expect(s.nested.mounted).toBe(1);
        expect(s.viewOverrideCount).toBe(1);
        expect(s.visibleCursors).toBeGreaterThan(0);
        expect(s.activeTag).not.toBe('BODY');
        expect(await keyMovesCursor()).toBe(true);
    });

    it('ARM D: native, entered with real keys, releases everything', async () => {
        await openTable('native');
        const pre = await sample();
        expect(pre.nativeWidgets).toBeGreaterThan(0);
        expect(pre.ownedSurfaces).toBe(0);

        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(700);

        await switchToSourceUnsettled();
        await browser.pause(400);
        await expectNoLeak('ARM D');
    });
});
