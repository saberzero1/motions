import { Annotation, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { lua, lauxlib, to_jsstring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import {
    CALLBACK_INSTRUCTION_LIMIT,
    showLuaErrorNotice,
    withInstructionGuard,
} from './engine';

/**
 * Marks transactions this subsystem commits itself, so the scheduling
 * ViewPlugin can ignore its own work.
 *
 * Phase 0b measured this as defence-in-depth rather than the load-bearing
 * guard: the trigger predicate already rejects effect-only commits, because
 * they change neither doc, viewport, geometry, nor selection. Retained because
 * that result was scoped to one decoration shape.
 */
export const decorationCycleAnnotation = Annotation.define<boolean>();

const CYCLE_INSTRUCTION_LIMIT = Math.min(100_000, CALLBACK_INSTRUCTION_LIMIT);
const MAX_CONSECUTIVE_FAULTS = 8;

export interface DecorationProviderRefs {
    onStart?: number;
    onBuf?: number;
    onWin?: number;
    onEnd?: number;
}

interface RegisteredProvider {
    nsId: number;
    refs: DecorationProviderRefs;
    faults: number;
    faulted: boolean;
}

export class DecorationProviderManager {
    private readonly providers = new Map<number, RegisteredProvider>();
    private generation = 0;
    private cycleInProgress = false;
    private tick = 0;
    private disposed = false;

    constructor(private readonly L: lua_State) {}

    hasProviders(): boolean {
        if (this.disposed) return false;
        for (const p of this.providers.values()) if (!p.faulted) return true;
        return false;
    }

    currentGeneration(): number {
        return this.generation;
    }

    register(nsId: number, refs: DecorationProviderRefs): void {
        this.unref(this.providers.get(nsId));
        const hasAny =
            refs.onStart !== undefined ||
            refs.onBuf !== undefined ||
            refs.onWin !== undefined ||
            refs.onEnd !== undefined;
        if (!hasAny) {
            this.providers.delete(nsId);
            return;
        }
        this.providers.set(nsId, { nsId, refs, faults: 0, faulted: false });
    }

    remove(nsId: number): void {
        this.unref(this.providers.get(nsId));
        this.providers.delete(nsId);
    }

    /** Invalidates every in-flight callback without tearing down the view. */
    invalidate(): void {
        this.generation++;
    }

    dispose(): void {
        for (const p of this.providers.values()) this.unref(p);
        this.providers.clear();
        this.disposed = true;
        this.generation++;
    }

    private unref(provider: RegisteredProvider | undefined): void {
        if (!provider) return;
        for (const ref of Object.values(provider.refs)) {
            if (typeof ref === 'number') {
                lauxlib.luaL_unref(this.L, lua.LUA_REGISTRYINDEX, ref);
            }
        }
    }

    private call(
        provider: RegisteredProvider,
        ref: number | undefined,
        args: number[],
    ): boolean {
        if (ref === undefined) return true;
        const L = this.L;
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
        for (const arg of args) lua.lua_pushinteger(L, arg);
        const status = withInstructionGuard(L, CYCLE_INSTRUCTION_LIMIT, () =>
            lua.lua_pcall(L, args.length, 1, 0),
        );
        if (status !== lua.LUA_OK) {
            const msg = lua.lua_tolstring(L, -1);
            const error = msg ? to_jsstring(msg) : 'Lua callback error';
            console.error(
                `Vim Motions: decoration provider ns ${provider.nsId}: ${error}`,
            );
            showLuaErrorNotice(error);
            lua.lua_pop(L, 1);
            provider.faults++;
            if (provider.faults >= MAX_CONSECUTIVE_FAULTS) {
                provider.faulted = true;
                console.error(
                    `Vim Motions: decoration provider ns ${provider.nsId} faulted after ${MAX_CONSECUTIVE_FAULTS} errors; disabling until re-registered`,
                );
            }
            return false;
        }
        const keepGoing = !lua.lua_isboolean(L, -1) || lua.lua_toboolean(L, -1);
        lua.lua_pop(L, 1);
        provider.faults = 0;
        return keepGoing;
    }

    runCycle(view: EditorView, topline: number, botline: number): void {
        if (this.disposed || this.cycleInProgress || !this.hasProviders()) {
            return;
        }
        this.cycleInProgress = true;
        const generation = this.generation;
        this.tick++;
        try {
            for (const provider of this.providers.values()) {
                if (provider.faulted) continue;
                if (generation !== this.generation) return;
                if (!this.call(provider, provider.refs.onStart, [this.tick])) {
                    continue;
                }
                if (!this.call(provider, provider.refs.onBuf, [0, this.tick])) {
                    continue;
                }
                if (
                    !this.call(provider, provider.refs.onWin, [
                        0,
                        0,
                        topline,
                        botline,
                    ])
                ) {
                    continue;
                }
                this.call(provider, provider.refs.onEnd, [this.tick]);
            }
        } finally {
            this.cycleInProgress = false;
        }
    }
}

let activeManager: DecorationProviderManager | null = null;

export function setActiveDecorationProviderManager(
    manager: DecorationProviderManager | null,
): void {
    activeManager = manager;
}

export function decorationProviderExtension(): Extension {
    return ViewPlugin.fromClass(
        class {
            private rafId: number | null = null;

            constructor(private readonly view: EditorView) {}

            update(update: ViewUpdate): void {
                const manager = activeManager;
                if (!manager?.hasProviders()) return;
                if (
                    update.transactions.some(
                        (tr) =>
                            tr.annotation(decorationCycleAnnotation) !==
                            undefined,
                    )
                ) {
                    return;
                }
                if (
                    !update.docChanged &&
                    !update.viewportChanged &&
                    !update.geometryChanged &&
                    !update.selectionSet &&
                    !update.focusChanged
                ) {
                    return;
                }
                if (this.rafId !== null) return;

                const generation = manager.currentGeneration();
                this.rafId = window.requestAnimationFrame(() => {
                    this.rafId = null;
                    if (
                        activeManager !== manager ||
                        generation !== manager.currentGeneration()
                    ) {
                        return;
                    }
                    try {
                        const doc = this.view.state.doc;
                        const topline = doc.lineAt(
                            this.view.viewport.from,
                        ).number;
                        const botline = doc.lineAt(
                            this.view.viewport.to,
                        ).number;
                        manager.runCycle(this.view, topline, botline);
                    } catch {
                        // View may have been destroyed mid-frame.
                    }
                });
            }

            destroy(): void {
                if (this.rafId !== null) {
                    window.cancelAnimationFrame(this.rafId);
                    this.rafId = null;
                }
            }
        },
    );
}
