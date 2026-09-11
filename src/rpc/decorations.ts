import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import {
    StateEffect,
    StateField,
    type ChangeDesc,
    type Extension,
    type Text,
} from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    EditorView,
    WidgetType,
} from '@codemirror/view';
import companionSource from './companion.lua';
import type { NeovimDocumentSync } from './document-sync';
import type { MsgpackRpcClient } from './msgpack-rpc';
import { NeovimFloatingWindows } from './floating-windows';

type HighlightGroup = string | string[];

interface VirtualTextChunk {
    text: string;
    groups: HighlightGroup;
}

interface ForwardedExtmark {
    nsId: number;
    id: number;
    from: number;
    to: number;
    row: number;
    byteColumn: number;
    highlight: HighlightGroup | null;
    virtualText: VirtualTextChunk[];
    virtualTextPosition: 'overlay' | 'eol' | 'inline';
    priority: number;
}

interface DecorationFieldValue {
    marks: ForwardedExtmark[];
    decorations: DecorationSet;
}

interface DecorationRange {
    from: number;
    to: number;
    priority: number;
    index: number;
    decoration: Decoration;
}

interface ForwardedFoldRange {
    startRow: number;
    endRow: number;
}

interface ForwardedFoldUpdate {
    firstRow: number;
    lastRow: number;
    ranges: ForwardedFoldRange[];
}

interface HighlightAttrs {
    fg?: number;
    bg?: number;
    sp?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    undercurl?: boolean;
    underdouble?: boolean;
    underdotted?: boolean;
    underdashed?: boolean;
    strikethrough?: boolean;
    reverse?: boolean;
    blend?: number;
}

const replaceDecorations = StateEffect.define<ForwardedExtmark[]>();

function groupNames(group: HighlightGroup | null): string[] {
    if (typeof group === 'string') return group ? [group] : [];
    return group?.filter((name) => name.length > 0) ?? [];
}

function groupClasses(group: HighlightGroup | null): string {
    return groupNames(group)
        .map((name) => `vim-hl-${name}`)
        .join(' ');
}

class NeovimVirtualTextWidget extends WidgetType {
    constructor(private readonly mark: ForwardedExtmark) {
        super();
    }

    eq(other: NeovimVirtualTextWidget): boolean {
        return (
            this.mark.nsId === other.mark.nsId &&
            this.mark.id === other.mark.id &&
            this.mark.from === other.mark.from &&
            this.mark.priority === other.mark.priority &&
            JSON.stringify(this.mark.virtualText) ===
                JSON.stringify(other.mark.virtualText)
        );
    }

    toDOM(view: EditorView): HTMLElement {
        const wrapper = view.dom.ownerDocument.win.createSpan();
        wrapper.className =
            'vim-motions-rpc-decoration vim-motions-rpc-virt-text';
        wrapper.dataset.nsId = String(this.mark.nsId);
        wrapper.dataset.extmarkId = String(this.mark.id);
        wrapper.dataset.offset = String(this.mark.from);
        wrapper.dataset.row = String(this.mark.row);
        wrapper.dataset.byteColumn = String(this.mark.byteColumn);
        wrapper.dataset.priority = String(this.mark.priority);
        for (const chunk of this.mark.virtualText) {
            const span = view.dom.ownerDocument.win.createSpan();
            const names = groupNames(chunk.groups);
            for (const name of names) {
                span.classList.add(`vim-hl-${name}`);
            }
            span.textContent = chunk.text;
            wrapper.appendChild(span);
        }
        return wrapper;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

function overlayEnd(doc: Text, from: number): number {
    if (from >= doc.length) return from;
    const codePoint = doc.sliceString(from, from + 2).codePointAt(0);
    return Math.min(
        doc.length,
        from + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1),
    );
}

function buildDecorations(marks: ForwardedExtmark[], doc: Text): DecorationSet {
    const ranges: DecorationRange[] = [];
    let index = 0;
    for (const mark of marks) {
        const highlightNames = groupNames(mark.highlight);
        if (highlightNames.length > 0 && mark.from < mark.to) {
            ranges.push({
                from: mark.from,
                to: mark.to,
                priority: mark.priority,
                index: index++,
                decoration: Decoration.mark({
                    class: `vim-motions-rpc-decoration ${groupClasses(mark.highlight)}`,
                    attributes: {
                        'data-ns-id': String(mark.nsId),
                        'data-extmark-id': String(mark.id),
                        'data-offset': String(mark.from),
                    },
                    inclusive: true,
                }),
            });
        }
        if (mark.virtualText.length === 0) continue;
        const widget = new NeovimVirtualTextWidget(mark);
        if (mark.virtualTextPosition === 'overlay') {
            const to = overlayEnd(doc, mark.from);
            ranges.push({
                from: mark.from,
                to,
                priority: mark.priority,
                index: index++,
                decoration:
                    to > mark.from
                        ? Decoration.replace({ widget })
                        : Decoration.widget({ widget }),
            });
        } else {
            const from =
                mark.virtualTextPosition === 'eol'
                    ? doc.lineAt(mark.from).to
                    : mark.from;
            ranges.push({
                from,
                to: from,
                priority: mark.priority,
                index: index++,
                decoration: Decoration.widget({
                    widget,
                    side: Math.max(-10000, Math.min(10000, mark.priority)),
                }),
            });
        }
    }
    ranges.sort(
        (left, right) =>
            left.from - right.from ||
            left.to - right.to ||
            left.priority - right.priority ||
            left.index - right.index,
    );
    return Decoration.set(
        ranges.map(({ from, to, decoration }) => decoration.range(from, to)),
        true,
    );
}

function mapMarks(
    marks: ForwardedExtmark[],
    changes: ChangeDesc,
): ForwardedExtmark[] {
    return marks.map((mark) => ({
        ...mark,
        from: changes.mapPos(mark.from, 1),
        to:
            mark.from === mark.to
                ? changes.mapPos(mark.to, 1)
                : changes.mapPos(mark.to, -1),
    }));
}

export const neovimDecorationField = StateField.define<DecorationFieldValue>({
    create: () => ({ marks: [], decorations: Decoration.none }),
    update(previous, transaction) {
        let marks = transaction.docChanged
            ? mapMarks(previous.marks, transaction.changes)
            : previous.marks;
        for (const effect of transaction.effects) {
            if (effect.is(replaceDecorations)) marks = effect.value;
        }
        if (marks === previous.marks) return previous;
        return {
            marks,
            decorations: buildDecorations(marks, transaction.state.doc),
        };
    },
    provide: (field) =>
        EditorView.decorations.from(field, (value) => value.decorations),
});

export function neovimDecorationExtension(): Extension {
    return neovimDecorationField;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseGroup(value: unknown): HighlightGroup | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
        return value;
    return null;
}

function parseVirtualText(value: unknown): VirtualTextChunk[] {
    if (!Array.isArray(value)) return [];
    const chunks: VirtualTextChunk[] = [];
    for (const chunk of value) {
        if (!Array.isArray(chunk) || typeof chunk[0] !== 'string') continue;
        chunks.push({
            text: chunk[0],
            groups: parseGroup(chunk[1]) ?? '',
        });
    }
    return chunks;
}

function rgb(value: number | undefined): string | null {
    if (value === undefined) return null;
    return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`;
}

function attrsToCss(attrs: HighlightAttrs): string {
    const properties: string[] = [];
    let foreground = rgb(attrs.fg);
    let background = rgb(attrs.bg);
    if (attrs.reverse) [foreground, background] = [background, foreground];
    if (foreground) properties.push(`color: ${foreground}`);
    if (background) properties.push(`background-color: ${background}`);
    if (attrs.bold) properties.push('font-weight: bold');
    if (attrs.italic) properties.push('font-style: italic');
    const lines: string[] = [];
    const styles: string[] = [];
    if (attrs.underline) lines.push('underline');
    if (attrs.undercurl) {
        lines.push('underline');
        styles.push('wavy');
    }
    if (attrs.underdouble) {
        lines.push('underline');
        styles.push('double');
    }
    if (attrs.underdotted) {
        lines.push('underline');
        styles.push('dotted');
    }
    if (attrs.underdashed) {
        lines.push('underline');
        styles.push('dashed');
    }
    if (attrs.strikethrough) lines.push('line-through');
    if (lines.length > 0)
        properties.push(
            `text-decoration-line: ${[...new Set(lines)].join(' ')}`,
        );
    if (styles[0]) properties.push(`text-decoration-style: ${styles[0]}`);
    const special = rgb(attrs.sp);
    if (special) properties.push(`text-decoration-color: ${special}`);
    if (attrs.blend !== undefined)
        properties.push(`opacity: ${1 - attrs.blend / 100}`);
    return properties.join('; ');
}

function cssEscape(value: string): string {
    return value.replace(
        /[^a-zA-Z0-9_-]/gu,
        (character) => `\\${character.codePointAt(0)?.toString(16)} `,
    );
}

class NeovimHighlightStyles {
    private readonly attributes = new Map<string, HighlightAttrs>();
    private readonly requested = new Set<string>();
    private readonly sheets = new Map<Document, CSSStyleSheet>();
    private disposed = false;

    constructor(private readonly rpc: MsgpackRpcClient) {}

    request(groups: string[], document: Document): void {
        this.ensureDocument(document);
        for (const group of groups) {
            if (this.requested.has(group)) continue;
            this.requested.add(group);
            void this.rpc
                .request('nvim_get_hl', [0, { name: group, link: false }])
                .then((value) => {
                    if (this.disposed || !isRecord(value)) return;
                    this.attributes.set(group, value);
                    this.render();
                })
                .catch(() => {});
        }
    }

    destroy(): void {
        this.disposed = true;
        for (const [document, sheet] of this.sheets)
            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
                (candidate) => candidate !== sheet,
            );
        this.sheets.clear();
        this.attributes.clear();
        this.requested.clear();
    }

    private ensureDocument(document: Document): void {
        if (this.sheets.has(document)) return;
        const sheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        this.sheets.set(document, sheet);
        this.render();
    }

    private render(): void {
        const rules = [...this.attributes]
            .map(([group, attrs]) => {
                const css = attrsToCss(attrs);
                return css ? `.vim-hl-${cssEscape(group)} { ${css} }` : '';
            })
            .filter(Boolean)
            .join('\n');
        for (const sheet of this.sheets.values()) sheet.replaceSync(rules);
    }
}

export class NeovimDecorationBridge {
    private notificationCleanup: (() => void) | null = null;
    private lastView: EditorView | null = null;
    private readonly highlights: NeovimHighlightStyles;
    private readonly floatingWindows: NeovimFloatingWindows;
    private readonly folds = new Map<number, number>();
    private disposed = false;

    constructor(
        private readonly rpc: MsgpackRpcClient,
        private readonly documentSync: NeovimDocumentSync,
    ) {
        this.highlights = new NeovimHighlightStyles(rpc);
        this.floatingWindows = new NeovimFloatingWindows((groups, document) =>
            this.highlights.request(groups, document),
        );
    }

    async start(): Promise<void> {
        const buffer = this.documentSync.getBuffer();
        if (buffer === null)
            throw new Error('Neovim mirror buffer is unavailable');
        this.notificationCleanup = this.rpc.onNotification(
            'vim_motions_extmarks',
            (args) => this.handleExtmarks(args),
        );
        const floatCleanup = this.rpc.onNotification(
            'vim_motions_floats',
            (args) => this.handleFloats(args),
        );
        const extmarkCleanup = this.notificationCleanup;
        this.notificationCleanup = () => {
            extmarkCleanup();
            floatCleanup();
        };
        await this.rpc.request('nvim_exec_lua', [companionSource, [buffer]]);
        await this.rpc.request('nvim_ui_attach', [
            120,
            40,
            {
                rgb: true,
                ext_linegrid: true,
                ext_messages: true,
                ext_cmdline: true,
                ext_popupmenu: true,
            },
        ]);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.notificationCleanup?.();
        this.notificationCleanup = null;
        this.clearView(this.lastView);
        const current = this.documentSync.getEditorView();
        if (current !== this.lastView) this.clearView(current);
        this.lastView = null;
        this.folds.clear();
        this.floatingWindows.clear();
        this.highlights.destroy();
        const buffer = this.documentSync.getBuffer();
        if (buffer !== null)
            this.rpc.notify('nvim_exec_lua', [
                'if vim_motions_rpc_companion_teardown then vim_motions_rpc_companion_teardown(...) end',
                [buffer],
            ]);
        this.rpc.notify('nvim_ui_detach', []);
    }

    private handleFloats(args: unknown[]): void {
        if (this.disposed || !Array.isArray(args[0])) return;
        const view = this.documentSync.getEditorView();
        if (!view) {
            this.floatingWindows.clear();
            return;
        }
        this.floatingWindows.render(args[0], view);
    }

    private handleExtmarks(args: unknown[]): void {
        if (this.disposed) return;
        const buffer = numberValue(args[0]);
        const values = args[1];
        if (buffer === null || buffer !== this.documentSync.getBuffer()) return;
        if (!Array.isArray(values)) return;
        const view = this.documentSync.getEditorView();
        if (!view) return;
        if (this.lastView && this.lastView !== view)
            this.clearView(this.lastView);
        this.lastView = view;
        const marks = values
            .map((value) => this.parseExtmark(value, view))
            .filter((value): value is ForwardedExtmark => value !== null);
        const groups = new Set<string>();
        for (const mark of marks) {
            for (const group of groupNames(mark.highlight)) groups.add(group);
            for (const chunk of mark.virtualText)
                for (const group of groupNames(chunk.groups)) groups.add(group);
        }
        this.highlights.request([...groups], view.dom.ownerDocument);
        const foldUpdate = this.parseFolds(args[2]);
        if (foldUpdate) {
            for (const row of [...this.folds.keys()]) {
                if (row >= foldUpdate.firstRow && row <= foldUpdate.lastRow)
                    this.folds.delete(row);
            }
            for (const range of foldUpdate.ranges)
                this.folds.set(range.startRow, range.endRow);
        }
        try {
            view.dispatch({
                effects: [
                    replaceDecorations.of(marks),
                    ...this.foldEffects(view),
                ],
            });
        } catch (error) {
            console.warn(
                'Vim Motions: Neovim decoration dispatch failed:',
                error,
            );
        }
    }

    private parseFolds(value: unknown): ForwardedFoldUpdate | null {
        if (!isRecord(value) || !Array.isArray(value.lines)) return null;
        const firstRow = numberValue(value.first);
        const lastRow = numberValue(value.last);
        if (firstRow === null || lastRow === null) return null;
        const ranges: ForwardedFoldRange[] = [];
        for (const line of value.lines) {
            if (!isRecord(line)) continue;
            const row = numberValue(line.row);
            const closed = numberValue(line.closed);
            const closedEnd = numberValue(line.closed_end);
            if (
                row === null ||
                closed === null ||
                closedEnd === null ||
                closed !== row + 1 ||
                closedEnd <= closed
            )
                continue;
            ranges.push({ startRow: row, endRow: closedEnd - 1 });
        }
        return { firstRow, lastRow, ranges };
    }

    private foldEffects(
        view: EditorView,
    ): StateEffect<{ from: number; to: number }>[] {
        const desired = new Map<string, { from: number; to: number }>();
        for (const [startRow, endRow] of this.folds) {
            if (
                startRow < 0 ||
                endRow <= startRow ||
                startRow >= view.state.doc.lines
            )
                continue;
            const start = view.state.doc.line(startRow + 1);
            const end = view.state.doc.line(
                Math.min(endRow + 1, view.state.doc.lines),
            );
            const range = { from: start.to, to: end.to };
            desired.set(`${range.from}:${range.to}`, range);
        }
        const effects: StateEffect<{ from: number; to: number }>[] = [];
        const current = foldedRanges(view.state);
        const iter = current.iter();
        while (iter.value) {
            const key = `${iter.from}:${iter.to}`;
            if (desired.has(key)) desired.delete(key);
            else
                effects.push(unfoldEffect.of({ from: iter.from, to: iter.to }));
            iter.next();
        }
        for (const range of desired.values())
            effects.push(foldEffect.of(range));
        return effects;
    }

    private parseExtmark(
        value: unknown,
        view: EditorView,
    ): ForwardedExtmark | null {
        if (!isRecord(value)) return null;
        const nsId = numberValue(value.ns_id);
        const id = numberValue(value.id);
        const row = numberValue(value.row);
        const byteColumn = numberValue(value.col);
        if (nsId === null || id === null || row === null || byteColumn === null)
            return null;
        const from = this.documentSync.bufferPositionToOffset(row, byteColumn);
        if (from === null) return null;
        const endRow = numberValue(value.end_row) ?? row;
        const endColumn = numberValue(value.end_col) ?? byteColumn;
        const to =
            this.documentSync.bufferPositionToOffset(endRow, endColumn) ?? from;
        const position = value.virt_text_pos;
        const virtualTextPosition =
            position === 'eol' ||
            position === 'inline' ||
            position === 'overlay'
                ? position
                : 'eol';
        return {
            nsId,
            id,
            from: Math.max(0, Math.min(from, view.state.doc.length)),
            to: Math.max(0, Math.min(to, view.state.doc.length)),
            row,
            byteColumn,
            highlight: parseGroup(value.hl_group),
            virtualText: parseVirtualText(value.virt_text),
            virtualTextPosition,
            priority: numberValue(value.priority) ?? 0,
        };
    }

    private clearView(view: EditorView | null): void {
        if (!view) return;
        try {
            const effects: StateEffect<unknown>[] = [replaceDecorations.of([])];
            const folds = foldedRanges(view.state).iter();
            while (folds.value) {
                effects.push(
                    unfoldEffect.of({ from: folds.from, to: folds.to }),
                );
                folds.next();
            }
            view.dispatch({ effects });
        } catch (error) {
            console.warn('Vim Motions: Neovim decoration clear failed:', error);
        }
    }
}
