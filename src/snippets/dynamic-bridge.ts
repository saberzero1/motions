import type { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
    ActiveSnippet,
    FieldRange,
    fieldSelection,
    setActive,
    snippet,
    snippetState,
} from '@codemirror/autocomplete';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import type { LuaSnippetNode } from '../lua/snippet-api';
import { readSnippetNodes } from '../lua/snippet-api';
import { preprocessSnippetBody } from './preprocess';
import type { PreprocessContext } from './types';
import { compileNode } from './lua-compiler';

const DYNAMIC_DEBOUNCE_MS = 50;
const MAX_LUA_EXEC_MS = 100;
const snippetStateField = snippetState;
const fieldSelectionCompat = fieldSelection;

export interface DynamicNodeMeta {
    kind: 'function' | 'dynamic';
    luaFnRef: number;
    dependsOn: number[];
    fieldIndex: number;
    subFieldRange?: { start: number; count: number };
    restoreState?: Map<number, string>;
}

export interface DynamicSnippetDef {
    staticBody: string;
    dynamicNodes: DynamicNodeMeta[];
    luaState: lua_State;
    staticFieldCount: number;
}

export class DynamicSnippetContext {
    readonly def: DynamicSnippetDef;
    readonly fieldCache = new Map<number, string>();

    constructor(def: DynamicSnippetDef) {
        this.def = cloneDynamicDef(def);
    }

    hasChangedDependencies(
        state: EditorState,
        ranges: readonly FieldRange[],
    ): number[] {
        const changed: number[] = [];
        for (const node of this.def.dynamicNodes) {
            for (const dep of node.dependsOn) {
                const depRanges = ranges.filter((r) => r.field === dep);
                const depRange = depRanges[0];
                if (!depRange) continue;
                const currentText = state.sliceDoc(
                    depRange.from,
                    depRange.to,
                );
                if (this.fieldCache.get(dep) !== currentText) {
                    this.fieldCache.set(dep, currentText);
                    if (!changed.includes(node.fieldIndex)) {
                        changed.push(node.fieldIndex);
                    }
                }
            }
        }
        return changed;
    }

    destroy(): void {
        for (const node of this.def.dynamicNodes) {
            lauxlib.luaL_unref(
                this.def.luaState,
                lua.LUA_REGISTRYINDEX,
                node.luaFnRef,
            );
        }
    }
}

function cloneDynamicDef(def: DynamicSnippetDef): DynamicSnippetDef {
    const dynamicNodes = def.dynamicNodes.map((node) => ({
        ...node,
        luaFnRef: cloneLuaFunctionRef(def.luaState, node.luaFnRef),
        subFieldRange: node.subFieldRange
            ? { ...node.subFieldRange }
            : undefined,
        restoreState: node.restoreState
            ? new Map(node.restoreState)
            : undefined,
    }));

    return {
        ...def,
        dynamicNodes,
    };
}

function cloneLuaFunctionRef(L: lua_State, ref: number): number {
    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
    return lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
}

function invokeFunctionNode(
    L: lua_State,
    fnRef: number,
    fieldValues: Map<number, string>,
    dependsOn: number[],
): string | null {
    try {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, fnRef);

        lua.lua_newtable(L);
        let argIndex = 1;
        for (const dep of dependsOn) {
            const text = fieldValues.get(dep) ?? '';
            lua.lua_pushstring(L, to_luastring(text));
            lua.lua_rawseti(L, -2, argIndex);
            argIndex += 1;
        }

        lua.lua_pushnil(L);

        const status = lua.lua_pcall(L, 2, 1, 0);
        if (status !== lua.LUA_OK) {
            const msg = lua.lua_tolstring(L, -1);
            console.error(
                `Vim Motions: snippet f() error:`,
                msg ? to_jsstring(msg) : 'unknown error',
            );
            lua.lua_pop(L, 1);
            return null;
        }

        if (lua.lua_isstring(L, -1)) {
            const result = to_jsstring(lua.lua_tolstring(L, -1)!);
            lua.lua_pop(L, 1);
            return result;
        }
        lua.lua_pop(L, 1);
        return '';
    } catch (error) {
        console.error('Vim Motions: snippet f() exception:', error);
        return null;
    }
}

function invokeDynamicNode(
    L: lua_State,
    fnRef: number,
    fieldValues: Map<number, string>,
    dependsOn: number[],
    restoreState: Map<number, string> | undefined,
): LuaSnippetNode[] | null {
    try {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, fnRef);

        lua.lua_newtable(L);
        let argIndex = 1;
        for (const dep of dependsOn) {
            const text = fieldValues.get(dep) ?? '';
            lua.lua_pushstring(L, to_luastring(text));
            lua.lua_rawseti(L, -2, argIndex);
            argIndex += 1;
        }

        lua.lua_pushnil(L);

        if (restoreState && restoreState.size > 0) {
            lua.lua_newtable(L);
            for (const [key, value] of restoreState) {
                lua.lua_pushstring(L, to_luastring(value));
                lua.lua_rawseti(L, -2, key);
            }
        } else {
            lua.lua_pushnil(L);
        }

        const status = lua.lua_pcall(L, 3, 1, 0);
        if (status !== lua.LUA_OK) {
            const msg = lua.lua_tolstring(L, -1);
            console.error(
                `Vim Motions: snippet d() error:`,
                msg ? to_jsstring(msg) : 'unknown error',
            );
            lua.lua_pop(L, 1);
            return null;
        }

        if (!lua.lua_istable(L, -1)) {
            lua.lua_pop(L, 1);
            return [];
        }

        lua.lua_getfield(L, -1, to_luastring('nodes'));
        const nodes = readSnippetNodes(L, -1);
        lua.lua_pop(L, 2);
        return nodes;
    } catch (error) {
        console.error('Vim Motions: snippet d() exception:', error);
        return null;
    }
}

export function createDynamicSnippetPlugin(
    getContext: () => DynamicSnippetContext | null,
): ViewPlugin<DynamicSnippetPluginValue> {
    return ViewPlugin.define(
        (view) => new DynamicSnippetPluginValue(view, getContext),
    );
}

class DynamicSnippetPluginValue {
    private debounceTimer: number | null = null;

    constructor(
        private view: EditorView,
        private getContext: () => DynamicSnippetContext | null,
    ) {}

    update(update: ViewUpdate) {
        if (!update.docChanged) return;

        const active = update.state.field(snippetStateField, false);
        const ctx = this.getContext();
        if (!active || !ctx) return;

        const changedNodes = ctx.hasChangedDependencies(
            update.state,
            active.ranges,
        );
        if (changedNodes.length === 0) return;

        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = null;
            this.recompute(changedNodes);
        }, DYNAMIC_DEBOUNCE_MS);
    }

    private recompute(changedNodeFields: number[]) {
        try {
            const active = this.view.state.field(snippetStateField, false);
            const ctx = this.getContext();
            if (!active || !ctx) return;

            const startTime = performance.now();

            const fieldValues = new Map<number, string>();
            const fieldsSeen = new Set<number>();
            for (const r of active.ranges) {
                if (!fieldsSeen.has(r.field)) {
                    fieldsSeen.add(r.field);
                    fieldValues.set(
                        r.field,
                        this.view.state.sliceDoc(r.from, r.to),
                    );
                }
            }

            const changes: Array<{ from: number; to: number; insert: string }> =
                [];
            let newRanges = [...active.ranges];

            for (const nodeFieldIndex of changedNodeFields) {
                const nodeMeta = ctx.def.dynamicNodes.find(
                    (n) => n.fieldIndex === nodeFieldIndex,
                );
                if (!nodeMeta) continue;

                if (performance.now() - startTime > MAX_LUA_EXEC_MS) {
                    console.warn(
                        'Vim Motions: snippet dynamic recomputation timed out',
                    );
                    break;
                }

                if (nodeMeta.kind === 'function') {
                    const newText = invokeFunctionNode(
                        ctx.def.luaState,
                        nodeMeta.luaFnRef,
                        fieldValues,
                        nodeMeta.dependsOn,
                    );
                    if (newText === null) continue;

                    const targetRanges = active.ranges.filter(
                        (r) => r.field === nodeFieldIndex,
                    );
                    for (const r of targetRanges) {
                        const currentText = this.view.state.sliceDoc(
                            r.from,
                            r.to,
                        );
                        if (currentText !== newText) {
                            changes.push({
                                from: r.from,
                                to: r.to,
                                insert: newText,
                            });
                            newRanges = newRanges.map((range) =>
                                range.field === r.field &&
                                range.from === r.from &&
                                range.to === r.to
                                    ? new FieldRange(
                                          range.field,
                                          range.from,
                                          range.from + newText.length,
                                      )
                                    : range,
                            );
                        }
                    }
                } else if (nodeMeta.kind === 'dynamic') {
                    const subNodes = invokeDynamicNode(
                        ctx.def.luaState,
                        nodeMeta.luaFnRef,
                        fieldValues,
                        nodeMeta.dependsOn,
                        nodeMeta.restoreState,
                    );
                    if (subNodes === null) continue;

                    if (nodeMeta.subFieldRange) {
                        const restored = new Map<number, string>();
                        for (let i = 0; i < nodeMeta.subFieldRange.count; i++) {
                            const absField = nodeMeta.subFieldRange.start + i;
                            const text = fieldValues.get(absField);
                            if (text !== undefined) restored.set(i, text);
                        }
                        nodeMeta.restoreState = restored;
                    }

                    const compiled = compileSubSnippet(
                        subNodes,
                        nodeMeta,
                        ctx.def.staticFieldCount,
                    );

                    const targetRanges = active.ranges.filter(
                        (r) => r.field === nodeFieldIndex,
                    );
                    const r = targetRanges[0];
                    if (r) {
                        changes.push({
                            from: r.from,
                            to: r.to,
                            insert: compiled.text,
                        });

                        nodeMeta.subFieldRange = {
                            start: compiled.fieldStart,
                            count: compiled.fieldCount,
                        };

                        newRanges = rebuildRangesForDynamic(
                            newRanges,
                            nodeFieldIndex,
                            r.from,
                            compiled,
                        );
                    }
                }
            }

            if (changes.length === 0) return;

            const mappedRanges = applyChangesAndRemapRanges(
                this.view.state,
                changes,
                newRanges,
            );

            if (mappedRanges) {
                this.view.dispatch(
                    this.view.state.update({
                        changes,
                        selection: fieldSelectionCompat(
                            mappedRanges.ranges,
                            active.active,
                        ),
                        effects: setActive.of(
                            new ActiveSnippet(
                                mappedRanges.ranges,
                                active.active,
                            ),
                        ),
                    }),
                );
            }
        } catch (error) {
            console.error('Vim Motions: snippet dynamic recompute error:', error);
        }
    }

    destroy() {
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
        }
    }
}

function compileSubSnippet(
    nodes: LuaSnippetNode[],
    parentMeta: DynamicNodeMeta,
    globalFieldOffset: number,
): {
    text: string;
    fieldStart: number;
    fieldCount: number;
    ranges: FieldRange[];
} {
    let text = '';
    const ranges: FieldRange[] = [];
    let fieldCount = 0;
    const fieldStart = globalFieldOffset;

    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                text += node.text ?? '';
                break;
            case 'insert': {
                const absField = fieldStart + fieldCount;
                const placeholder = node.placeholder ?? '';
                const restored = parentMeta.restoreState?.get(fieldCount);
                const content = restored ?? placeholder;
                const from = text.length;
                ranges.push(
                    new FieldRange(absField, from, from + content.length),
                );
                text += content;
                fieldCount++;
                break;
            }
            case 'restore': {
                const absField = fieldStart + fieldCount;
                const restored =
                    parentMeta.restoreState?.get(node.index ?? 0) ?? '';
                const from = text.length;
                ranges.push(
                    new FieldRange(absField, from, from + restored.length),
                );
                text += restored;
                fieldCount++;
                break;
            }
            default:
                text += compileNode(node);
        }
    }

    return { text, fieldStart, fieldCount, ranges };
}

function rebuildRangesForDynamic(
    currentRanges: FieldRange[],
    dynamicFieldIndex: number,
    insertPos: number,
    compiled: {
        text: string;
        ranges: FieldRange[];
        fieldStart: number;
        fieldCount: number;
    },
): FieldRange[] {
    const filtered = currentRanges.filter((r) => {
        if (r.field === dynamicFieldIndex) return true;
        if (
            r.field >= compiled.fieldStart &&
            r.field < compiled.fieldStart + compiled.fieldCount
        ) {
            return false;
        }
        return true;
    });

    const updated = filtered.map((r) => {
        if (r.field === dynamicFieldIndex) {
            return new FieldRange(
                r.field,
                insertPos,
                insertPos + compiled.text.length,
            );
        }
        return r;
    });

    for (const subRange of compiled.ranges) {
        updated.push(
            new FieldRange(
                subRange.field,
                insertPos + subRange.from,
                insertPos + subRange.to,
            ),
        );
    }

    return updated;
}

function applyChangesAndRemapRanges(
    state: EditorState,
    changes: Array<{ from: number; to: number; insert: string }>,
    ranges: FieldRange[],
): { ranges: FieldRange[] } | null {
    const sorted = [...changes].sort((a, b) => b.from - a.from);
    const totalDelta = sorted.reduce(
        (sum, change) => sum + (change.insert.length - (change.to - change.from)),
        0,
    );
    const finalDocLength = state.doc.length + totalDelta;

    const newRanges: FieldRange[] = [];
    for (const r of ranges) {
        let from = r.from;
        let to = r.to;
        for (const change of sorted) {
            const insertEnd = change.from + change.insert.length;
            if (from >= change.from && to <= insertEnd) {
                continue;
            }
            if (change.from <= from) {
                const delta = change.insert.length - (change.to - change.from);
                from += delta;
                to += delta;
            }
        }
        if (from < 0) from = 0;
        if (to < from) to = from;
        if (to > finalDocLength) to = finalDocLength;
        newRanges.push(new FieldRange(r.field, from, to));
    }

    return newRanges.length > 0 ? { ranges: newRanges } : null;
}

export function expandDynamicSnippet(
    view: EditorView,
    def: DynamicSnippetDef,
    from: number,
    to: number,
    preprocessCtx: PreprocessContext,
): void {
    const body = preprocessSnippetBody([def.staticBody], preprocessCtx);
    const apply = snippet(body) as unknown as (
        view: EditorView,
        completion: null,
        from: number,
        to: number,
    ) => void;
    apply(view, null, from, to);

    const ctx = new DynamicSnippetContext(def);
    setActiveDynamicContext(ctx);

    const active = view.state.field(snippetStateField, false);
    if (active) {
        const fieldValues = new Map<number, string>();
        const seen = new Set<number>();
        for (const r of active.ranges) {
            if (!seen.has(r.field)) {
                seen.add(r.field);
                fieldValues.set(r.field, view.state.sliceDoc(r.from, r.to));
            }
        }

        for (const node of ctx.def.dynamicNodes) {
            if (node.kind === 'function') {
                const text = invokeFunctionNode(
                    ctx.def.luaState,
                    node.luaFnRef,
                    fieldValues,
                    node.dependsOn,
                );
                if (text !== null) {
                    ctx.fieldCache.set(node.fieldIndex, text);
                }
            }
        }
    }
}

let activeDynamicContext: DynamicSnippetContext | null = null;

export function setActiveDynamicContext(
    ctx: DynamicSnippetContext | null,
): void {
    if (activeDynamicContext) {
        activeDynamicContext.destroy();
    }
    activeDynamicContext = ctx;
}

export function getActiveDynamicContext(): DynamicSnippetContext | null {
    return activeDynamicContext;
}
