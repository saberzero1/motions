import {
    StateEffect,
    StateField,
    type ChangeDesc,
    type Extension,
    type Transaction,
} from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    EditorView,
    WidgetType,
} from '@codemirror/view';

// --- Data Model ---

export interface VirtTextChunk {
    text: string;
    hlGroup: string;
}

export interface ExtmarkOpts {
    id?: number;
    endLine?: number; // end_row (0-indexed)
    endCol?: number; // end_col (0-indexed)
    hlGroup?: string; // hl_group → CSS class .vim-hl-{name}
    virtText?: VirtTextChunk[];
    virtTextPos?: 'overlay' | 'eol' | 'inline' | 'right_align';
    priority?: number;
    signText?: string;
    signHlGroup?: string;
}

interface StoredExtmark {
    id: number;
    nsId: number;
    from: number; // absolute doc offset
    to: number; // absolute doc offset (same as from if no end_row/end_col)
    opts: ExtmarkOpts;
}

interface ExtmarkRegistryState {
    byNs: Map<number, Map<number, StoredExtmark>>;
    nextIdByNs: Map<number, number>;
}

// --- StateEffects ---

interface SetExtmarkPayload {
    nsId: number;
    id: number | null; // null = auto-assign
    from: number;
    to: number;
    opts: ExtmarkOpts;
}

interface DelExtmarkPayload {
    nsId: number;
    id: number;
}

interface ClearNamespacePayload {
    nsId: number;
    fromOffset: number; // -1 = start of doc
    toOffset: number; // -1 = end of doc
}

export const setExtmarkEffect = StateEffect.define<SetExtmarkPayload>();
export const delExtmarkEffect = StateEffect.define<DelExtmarkPayload>();
export const clearNamespaceEffect = StateEffect.define<ClearNamespacePayload>();

// --- Virtual Text Widget ---

class VirtTextWidget extends WidgetType {
    constructor(
        private readonly chunks: VirtTextChunk[],
        private readonly pos: 'overlay' | 'eol' | 'inline' | 'right_align',
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const wrapper = createSpan();
        wrapper.className = 'vim-motions-extmark-virt-text';
        if (this.pos === 'eol') {
            wrapper.className += ' vim-motions-extmark-virt-text-eol';
        }
        for (const chunk of this.chunks) {
            const span = createSpan();
            if (chunk.hlGroup) {
                span.className = `vim-hl-${chunk.hlGroup}`;
            }
            span.textContent = chunk.text;
            wrapper.appendChild(span);
        }
        return wrapper;
    }

    eq(other: VirtTextWidget): boolean {
        if (this.chunks.length !== other.chunks.length) return false;
        if (this.pos !== other.pos) return false;
        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            const otherChunk = other.chunks[i];
            if (!chunk || !otherChunk) return false;
            if (chunk.text !== otherChunk.text) return false;
            if (chunk.hlGroup !== otherChunk.hlGroup) return false;
        }
        return true;
    }

    // Prevent cursor from entering widget
    get estimatedHeight(): number {
        return -1;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

// --- StateField ---

function mapExtmarkPositions(
    extmarks: Map<number, Map<number, StoredExtmark>>,
    changes: ChangeDesc,
): Map<number, Map<number, StoredExtmark>> {
    if (changes.empty) return extmarks;
    const result = new Map<number, Map<number, StoredExtmark>>();
    for (const [nsId, nsMap] of extmarks) {
        const mapped = new Map<number, StoredExtmark>();
        for (const [id, mark] of nsMap) {
            const newFrom = changes.mapPos(mark.from, 1); // assoc=1 (gravity right)
            const newTo =
                mark.from === mark.to ? newFrom : changes.mapPos(mark.to, -1); // end gravity left
            mapped.set(id, { ...mark, from: newFrom, to: newTo });
        }
        result.set(nsId, mapped);
    }
    return result;
}

function applyEffects(
    state: ExtmarkRegistryState,
    tr: Transaction,
): ExtmarkRegistryState {
    let { byNs, nextIdByNs } = state;
    let changed = false;

    for (const effect of tr.effects) {
        if (effect.is(setExtmarkEffect)) {
            if (!changed) {
                byNs = new Map(byNs);
                nextIdByNs = new Map(nextIdByNs);
                changed = true;
            }
            const { nsId, from, to, opts } = effect.value;
            let nsMap = byNs.get(nsId);
            if (!nsMap) {
                nsMap = new Map();
                byNs.set(nsId, nsMap);
            } else {
                nsMap = new Map(nsMap);
                byNs.set(nsId, nsMap);
            }

            let id = effect.value.id;
            if (id === null) {
                id = nextIdByNs.get(nsId) ?? 1;
                nextIdByNs.set(nsId, id + 1);
            } else {
                const currentNext = nextIdByNs.get(nsId) ?? 1;
                if (id >= currentNext) {
                    nextIdByNs.set(nsId, id + 1);
                }
            }

            nsMap.set(id, { id, nsId, from, to, opts: { ...opts, id } });
        }

        if (effect.is(delExtmarkEffect)) {
            if (!changed) {
                byNs = new Map(byNs);
                changed = true;
            }
            const { nsId, id } = effect.value;
            const nsMap = byNs.get(nsId);
            if (nsMap) {
                const newMap = new Map(nsMap);
                newMap.delete(id);
                byNs.set(nsId, newMap);
            }
        }

        if (effect.is(clearNamespaceEffect)) {
            if (!changed) {
                byNs = new Map(byNs);
                changed = true;
            }
            const { nsId, fromOffset, toOffset } = effect.value;
            const nsMap = byNs.get(nsId);
            if (nsMap) {
                const docLen = tr.state.doc.length;
                const rangeFrom = fromOffset < 0 ? 0 : fromOffset;
                const rangeTo = toOffset < 0 ? docLen : toOffset;
                const newMap = new Map<number, StoredExtmark>();
                for (const [id, mark] of nsMap) {
                    // Keep marks outside the clear range
                    if (mark.from < rangeFrom || mark.from > rangeTo) {
                        newMap.set(id, mark);
                    }
                }
                byNs.set(nsId, newMap);
            }
        }
    }

    return changed ? { byNs, nextIdByNs } : state;
}

function buildDecorations(
    state: ExtmarkRegistryState,
    docLength: number,
): DecorationSet {
    const ranges: { from: number; to: number; deco: Decoration }[] = [];

    for (const [, nsMap] of state.byNs) {
        for (const [, mark] of nsMap) {
            // Highlight range (hl_group with end position)
            if (mark.opts.hlGroup && mark.from !== mark.to) {
                const from = Math.max(0, Math.min(mark.from, docLength));
                const to = Math.max(from, Math.min(mark.to, docLength));
                if (from < to) {
                    ranges.push({
                        from,
                        to,
                        deco: Decoration.mark({
                            class: `vim-hl-${mark.opts.hlGroup}`,
                            inclusive: true,
                        }),
                    });
                }
            }

            // Virtual text
            if (mark.opts.virtText && mark.opts.virtText.length > 0) {
                const pos = Math.max(0, Math.min(mark.from, docLength));
                const vtPos = mark.opts.virtTextPos ?? 'overlay';

                if (vtPos === 'overlay' && mark.from < docLength) {
                    // Replace 1 char with widget (hides underlying char)
                    const replEnd = Math.min(pos + 1, docLength);
                    if (pos < replEnd) {
                        ranges.push({
                            from: pos,
                            to: replEnd,
                            deco: Decoration.replace({
                                widget: new VirtTextWidget(
                                    mark.opts.virtText,
                                    vtPos,
                                ),
                            }),
                        });
                    }
                } else if (vtPos === 'eol') {
                    // Widget at end of line
                    ranges.push({
                        from: pos,
                        to: pos,
                        deco: Decoration.widget({
                            widget: new VirtTextWidget(
                                mark.opts.virtText,
                                vtPos,
                            ),
                            side: 1,
                        }),
                    });
                } else {
                    // inline / right_align — inline widget
                    ranges.push({
                        from: pos,
                        to: pos,
                        deco: Decoration.widget({
                            widget: new VirtTextWidget(
                                mark.opts.virtText,
                                vtPos,
                            ),
                            side: vtPos === 'right_align' ? 1 : 0,
                        }),
                    });
                }
            }
        }
    }

    // Sort by from position (required by CM6)
    ranges.sort((a, b) => a.from - b.from || a.to - b.to);

    // Build DecorationSet from sorted ranges
    return Decoration.set(
        ranges.map((r) => r.deco.range(r.from, r.to)),
        true,
    );
}

// The combined StateField — stores registry, provides decorations
interface ExtmarkFieldValue {
    registry: ExtmarkRegistryState;
    decorations: DecorationSet;
}

export const extmarkField = StateField.define<ExtmarkFieldValue>({
    create() {
        return {
            registry: { byNs: new Map(), nextIdByNs: new Map() },
            decorations: Decoration.none,
        };
    },
    update(prev, tr) {
        // 1. Map positions through changes
        let registry = prev.registry;
        if (tr.docChanged) {
            registry = {
                ...registry,
                byNs: mapExtmarkPositions(registry.byNs, tr.changes),
            };
        }

        // 2. Apply effects
        registry = applyEffects(registry, tr);

        // 3. Rebuild decorations if registry changed
        if (registry === prev.registry && !tr.docChanged) {
            return prev;
        }

        return {
            registry,
            decorations: buildDecorations(registry, tr.state.doc.length),
        };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

// --- Public API (called from api.ts) ---

export function dispatchSetExtmark(
    view: EditorView,
    nsId: number,
    line: number,
    col: number,
    opts: ExtmarkOpts,
): number {
    const doc = view.state.doc;
    const from = safeOffset(doc, line, col);
    const to =
        opts.endLine !== undefined && opts.endCol !== undefined
            ? safeOffset(doc, opts.endLine, opts.endCol)
            : from;

    // Read current ID counter to predict assigned ID
    const fieldValue = view.state.field(extmarkField);
    let id = opts.id ?? null;
    if (id === null) {
        id = fieldValue.registry.nextIdByNs.get(nsId) ?? 1;
    }

    try {
        view.dispatch({
            effects: setExtmarkEffect.of({ nsId, id, from, to, opts }),
        });
    } catch {
        // View may be destroyed
    }

    return id;
}

export function dispatchDelExtmark(
    view: EditorView,
    nsId: number,
    id: number,
): boolean {
    const fieldValue = view.state.field(extmarkField);
    const nsMap = fieldValue.registry.byNs.get(nsId);
    if (!nsMap?.has(id)) return false;
    try {
        view.dispatch({
            effects: delExtmarkEffect.of({ nsId, id }),
        });
    } catch {
        return false;
    }
    return true;
}

export function dispatchClearNamespace(
    view: EditorView,
    nsId: number,
    lineStart: number,
    lineEnd: number,
): void {
    const doc = view.state.doc;
    const fromOffset = lineStart < 0 ? -1 : safeOffset(doc, lineStart, 0);
    const toOffset =
        lineEnd < 0
            ? -1
            : lineEnd >= doc.lines
              ? doc.length
              : safeOffset(doc, lineEnd + 1, 0);
    try {
        view.dispatch({
            effects: clearNamespaceEffect.of({ nsId, fromOffset, toOffset }),
        });
    } catch {
        // View may be destroyed
    }
}

export function queryExtmarks(
    view: EditorView,
    nsId: number,
    start: [number, number], // [line, col] 0-indexed
    end: [number, number], // [line, col] 0-indexed, [-1,-1] = end of doc
    opts?: { limit?: number; details?: boolean },
): Array<[number, number, number, Record<string, unknown>?]> {
    const fieldValue = view.state.field(extmarkField);
    const nsMap = fieldValue.registry.byNs.get(nsId);
    if (!nsMap) return [];

    const doc = view.state.doc;
    const startOffset = start[0] < 0 ? 0 : safeOffset(doc, start[0], start[1]);
    const endOffset = end[0] < 0 ? doc.length : safeOffset(doc, end[0], end[1]);
    const limit = opts?.limit ?? Infinity;
    const details = opts?.details ?? false;

    const result: Array<[number, number, number, Record<string, unknown>?]> =
        [];

    for (const [, mark] of nsMap) {
        if (mark.from >= startOffset && mark.from <= endOffset) {
            const pos = offsetToLineCol(doc, mark.from);
            if (details) {
                const detailObj: Record<string, unknown> = {};
                if (mark.opts.hlGroup) detailObj.hl_group = mark.opts.hlGroup;
                if (mark.opts.virtText)
                    detailObj.virt_text = mark.opts.virtText;
                if (mark.opts.priority !== undefined)
                    detailObj.priority = mark.opts.priority;
                const endPos = offsetToLineCol(doc, mark.to);
                detailObj.end_row = endPos[0];
                detailObj.end_col = endPos[1];
                result.push([mark.id, pos[0], pos[1], detailObj]);
            } else {
                result.push([mark.id, pos[0], pos[1]]);
            }
            if (result.length >= limit) break;
        }
    }

    return result;
}

export function queryExtmarkById(
    view: EditorView,
    nsId: number,
    id: number,
    opts?: { details?: boolean },
): [number, number, Record<string, unknown>?] | null {
    const fieldValue = view.state.field(extmarkField);
    const nsMap = fieldValue.registry.byNs.get(nsId);
    if (!nsMap) return null;
    const mark = nsMap.get(id);
    if (!mark) return null;

    const doc = view.state.doc;
    const pos = offsetToLineCol(doc, mark.from);
    if (opts?.details) {
        const detailObj: Record<string, unknown> = {};
        if (mark.opts.hlGroup) detailObj.hl_group = mark.opts.hlGroup;
        if (mark.opts.virtText) detailObj.virt_text = mark.opts.virtText;
        const endPos = offsetToLineCol(doc, mark.to);
        detailObj.end_row = endPos[0];
        detailObj.end_col = endPos[1];
        return [pos[0], pos[1], detailObj];
    }
    return [pos[0], pos[1]];
}

// --- Helpers ---

function safeOffset(
    doc: { line(n: number): { from: number; length: number }; lines: number },
    line: number,
    col: number,
): number {
    const lineNum = Math.max(1, Math.min(line + 1, doc.lines)); // 0-indexed → 1-indexed
    const lineObj = doc.line(lineNum);
    return lineObj.from + Math.min(col, lineObj.length);
}

function offsetToLineCol(
    doc: {
        lineAt(pos: number): { number: number; from: number };
        length: number;
    },
    offset: number,
): [number, number] {
    const clamped = Math.max(0, Math.min(offset, doc.length));
    const lineObj = doc.lineAt(clamped);
    return [lineObj.number - 1, clamped - lineObj.from]; // 1-indexed → 0-indexed
}

// --- Extension export ---

export function extmarkExtension(): Extension {
    return extmarkField;
}
