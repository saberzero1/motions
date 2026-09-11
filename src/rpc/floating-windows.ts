import type { EditorView } from '@codemirror/view';
import { neovimByteToUtf16 } from './document-sync';

type HighlightGroup = string | string[];

interface FloatExtmark {
    nsId: number;
    id: number;
    row: number;
    column: number;
    endRow: number;
    endColumn: number;
    highlight: HighlightGroup | null;
    virtualText: { text: string; groups: HighlightGroup }[];
    virtualTextPosition: 'overlay' | 'eol' | 'inline';
    priority: number;
}

interface FloatConfig {
    relative: string;
    row: number;
    column: number;
    width: number;
    height: number;
    zindex: number;
    anchor: string;
    border: boolean;
}

interface ForwardedFloat {
    win: number;
    buffer: number;
    config: FloatConfig;
    originRow: number;
    originColumn: number;
    lines: string[];
    extmarks: FloatExtmark[];
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

function groupNames(group: HighlightGroup | null): string[] {
    if (typeof group === 'string') return group ? [group] : [];
    return group?.filter(Boolean) ?? [];
}

function parseVirtualText(
    value: unknown,
): { text: string; groups: HighlightGroup }[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((chunk) =>
        Array.isArray(chunk) && typeof chunk[0] === 'string'
            ? [{ text: chunk[0], groups: parseGroup(chunk[1]) ?? '' }]
            : [],
    );
}

function hasBorder(value: unknown): boolean {
    if (typeof value === 'string') return value !== '' && value !== 'none';
    return Array.isArray(value) && value.some((item) => item !== '');
}

function parseExtmark(value: unknown): FloatExtmark | null {
    if (!isRecord(value)) return null;
    const nsId = numberValue(value.ns_id);
    const id = numberValue(value.id);
    const row = numberValue(value.row);
    const column = numberValue(value.col);
    if (nsId === null || id === null || row === null || column === null)
        return null;
    const position = value.virt_text_pos;
    return {
        nsId,
        id,
        row,
        column,
        endRow: numberValue(value.end_row) ?? row,
        endColumn: numberValue(value.end_col) ?? column,
        highlight: parseGroup(value.hl_group),
        virtualText: parseVirtualText(value.virt_text),
        virtualTextPosition:
            position === 'overlay' ||
            position === 'inline' ||
            position === 'eol'
                ? position
                : 'eol',
        priority: numberValue(value.priority) ?? 0,
    };
}

function parseFloat(value: unknown): ForwardedFloat | null {
    if (!isRecord(value) || !isRecord(value.config)) return null;
    const win = numberValue(value.win);
    const buffer = numberValue(value.buf);
    const row = numberValue(value.config.row);
    const column = numberValue(value.config.col);
    const width = numberValue(value.config.width);
    const height = numberValue(value.config.height);
    if (
        win === null ||
        buffer === null ||
        row === null ||
        column === null ||
        width === null ||
        height === null ||
        typeof value.config.relative !== 'string' ||
        !Array.isArray(value.lines)
    )
        return null;
    const origin = isRecord(value.origin) ? value.origin : {};
    return {
        win,
        buffer,
        config: {
            relative: value.config.relative,
            row,
            column,
            width,
            height,
            zindex: numberValue(value.config.zindex) ?? 50,
            anchor:
                typeof value.config.anchor === 'string'
                    ? value.config.anchor
                    : 'NW',
            border: hasBorder(value.config.border),
        },
        originRow: numberValue(origin.row) ?? 0,
        originColumn: numberValue(origin.col) ?? 0,
        lines: value.lines.filter(
            (line): line is string => typeof line === 'string',
        ),
        extmarks: Array.isArray(value.extmarks)
            ? value.extmarks
                  .map(parseExtmark)
                  .filter((mark): mark is FloatExtmark => mark !== null)
            : [],
    };
}

function addGroupClasses(
    element: HTMLElement,
    group: HighlightGroup | null,
): void {
    for (const name of groupNames(group))
        element.classList.add(`vim-hl-${name}`);
}

function appendHighlightedLine(
    lineElement: HTMLElement,
    line: string,
    row: number,
    extmarks: FloatExtmark[],
): void {
    const marks = extmarks
        .filter(
            (mark) =>
                groupNames(mark.highlight).length > 0 &&
                mark.row <= row &&
                mark.endRow >= row,
        )
        .sort(
            (left, right) =>
                left.column - right.column || left.priority - right.priority,
        );
    let cursor = 0;
    for (const mark of marks) {
        const startByte = mark.row === row ? mark.column : 0;
        const endByte =
            mark.endRow === row
                ? mark.endColumn
                : new TextEncoder().encode(line).length;
        const start = neovimByteToUtf16(line, startByte);
        const end = neovimByteToUtf16(line, endByte);
        if (start < cursor || end <= start) continue;
        lineElement.append(line.slice(cursor, start));
        const span = lineElement.ownerDocument.win.createSpan();
        span.className = 'vim-motions-rpc-float-extmark';
        span.dataset.nsId = String(mark.nsId);
        span.dataset.extmarkId = String(mark.id);
        addGroupClasses(span, mark.highlight);
        span.textContent = line.slice(start, end);
        lineElement.appendChild(span);
        cursor = end;
    }
    lineElement.append(line.slice(cursor));
}

export class NeovimFloatingWindows {
    private readonly elements = new Map<number, HTMLElement>();

    constructor(
        private readonly requestHighlights: (
            groups: string[],
            document: Document,
        ) => void,
    ) {}

    render(values: unknown[], view: EditorView): void {
        const floats = values
            .map(parseFloat)
            .filter((value): value is ForwardedFloat => value !== null);
        const active = new Set(floats.map((float) => float.win));
        for (const [win, element] of this.elements) {
            if (active.has(win)) continue;
            element.remove();
            this.elements.delete(win);
        }
        for (const float of floats) this.renderFloat(float, view);
    }

    clear(): void {
        for (const element of this.elements.values()) element.remove();
        this.elements.clear();
    }

    private renderFloat(float: ForwardedFloat, view: EditorView): void {
        this.elements.get(float.win)?.remove();
        const document = view.dom.ownerDocument;
        const element = document.win.createDiv();
        element.className = 'vim-motions-rpc-float';
        element.dataset.win = String(float.win);
        element.dataset.buffer = String(float.buffer);
        element.dataset.relative = float.config.relative;
        element.dataset.row = String(float.config.row);
        element.dataset.column = String(float.config.column);
        element.dataset.zindex = String(float.config.zindex);
        element.dataset.border = String(float.config.border);
        const metrics = this.position(float, view);
        Object.assign(element.style, {
            left: `${metrics.left}px`,
            top: `${metrics.top}px`,
            width: `${float.config.width * metrics.cellWidth}px`,
            height: `${float.config.height * metrics.lineHeight}px`,
            zIndex: String(float.config.zindex),
        });
        element.dataset.cellWidth = String(metrics.cellWidth);
        element.dataset.lineHeight = String(metrics.lineHeight);
        element.dataset.left = String(metrics.left);
        element.dataset.top = String(metrics.top);
        for (let row = 0; row < float.config.height; row++) {
            const line = document.win.createDiv();
            line.className = 'vim-motions-rpc-float-line';
            line.style.height = `${metrics.lineHeight}px`;
            line.style.lineHeight = `${metrics.lineHeight}px`;
            appendHighlightedLine(
                line,
                float.lines[row] ?? '',
                row,
                float.extmarks,
            );
            element.appendChild(line);
        }
        for (const mark of float.extmarks) {
            if (mark.virtualText.length === 0) continue;
            const widget = document.win.createSpan();
            widget.className =
                'vim-motions-rpc-float-extmark vim-motions-rpc-float-virt-text';
            widget.dataset.nsId = String(mark.nsId);
            widget.dataset.extmarkId = String(mark.id);
            widget.dataset.row = String(mark.row);
            widget.dataset.byteColumn = String(mark.column);
            const line = float.lines[mark.row] ?? '';
            const column =
                mark.virtualTextPosition === 'eol'
                    ? line.length
                    : neovimByteToUtf16(line, mark.column);
            widget.style.left = `${column * metrics.cellWidth}px`;
            widget.style.top = `${mark.row * metrics.lineHeight}px`;
            widget.style.zIndex = String(mark.priority);
            for (const chunk of mark.virtualText) {
                const span = document.win.createSpan();
                addGroupClasses(span, chunk.groups);
                span.textContent = chunk.text;
                widget.appendChild(span);
            }
            element.appendChild(widget);
        }
        const groups = new Set<string>();
        for (const mark of float.extmarks) {
            for (const group of groupNames(mark.highlight)) groups.add(group);
            for (const chunk of mark.virtualText)
                for (const group of groupNames(chunk.groups)) groups.add(group);
        }
        this.requestHighlights([...groups], document);
        view.dom.appendChild(element);
        this.elements.set(float.win, element);
    }

    private position(
        float: ForwardedFloat,
        view: EditorView,
    ): { left: number; top: number; cellWidth: number; lineHeight: number } {
        const cellWidth = view.defaultCharacterWidth;
        const lineHeight = view.defaultLineHeight;
        const viewRect = view.dom.getBoundingClientRect();
        const scrollerRect = view.scrollDOM.getBoundingClientRect();
        const scrollerStyle = view.dom.ownerDocument.win.getComputedStyle(
            view.scrollDOM,
        );
        let left =
            scrollerRect.left -
            viewRect.left +
            (Number.parseFloat(scrollerStyle.paddingLeft) || 0);
        let top =
            scrollerRect.top -
            viewRect.top +
            (Number.parseFloat(scrollerStyle.paddingTop) || 0);
        if (float.config.relative === 'cursor') {
            const cursor = view.coordsAtPos(view.state.selection.main.head);
            if (cursor) {
                left = cursor.left - viewRect.left;
                top = cursor.top - viewRect.top;
            }
        } else if (float.config.relative === 'win') {
            left += float.originColumn * cellWidth;
            top += float.originRow * lineHeight;
        }
        left += float.config.column * cellWidth;
        top += float.config.row * lineHeight;
        if (float.config.anchor.endsWith('E'))
            left -= float.config.width * cellWidth;
        if (float.config.anchor.startsWith('S'))
            top -= float.config.height * lineHeight;
        return { left, top, cellWidth, lineHeight };
    }
}
