import { WidgetType, EditorView } from '@codemirror/view';
import {
    StateField,
    type EditorState,
    type Extension,
    type Range,
} from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';

const TABLE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

type Alignment = 'left' | 'center' | 'right' | null;

interface TableRange {
    from: number;
    to: number;
    lines: string[];
}

function findTableRanges(state: EditorState): TableRange[] {
    const doc = state.doc;
    const ranges: TableRange[] = [];
    let i = 1;
    while (i <= doc.lines) {
        const line = doc.line(i);
        if (!TABLE_RE.test(line.text)) {
            i++;
            continue;
        }
        const start = i;
        const lines: string[] = [line.text];
        i++;
        while (i <= doc.lines) {
            const next = doc.line(i);
            if (!TABLE_RE.test(next.text)) break;
            lines.push(next.text);
            i++;
        }
        if (lines.length >= 2) {
            ranges.push({
                from: doc.line(start).from,
                to: doc.line(start + lines.length - 1).to,
                lines,
            });
        }
    }
    return ranges;
}

function cursorInRange(
    state: EditorState,
    from: number,
    to: number,
): boolean {
    return state.selection.ranges.some(
        (r) => r.from <= to && r.to >= from,
    );
}

function splitCells(line: string): string[] {
    return line.split('|').slice(1, -1);
}

function parseAlignments(sepLine: string): Alignment[] {
    return splitCells(sepLine).map((cell) => {
        const t = cell.trim();
        const l = t.startsWith(':');
        const r = t.endsWith(':');
        if (l && r) return 'center';
        if (r) return 'right';
        if (l) return 'left';
        return null;
    });
}

function parseTable(lines: string[]): {
    headers: string[];
    alignments: Alignment[];
    rows: string[][];
} {
    const headers = splitCells(lines[0] ?? '').map((c) => c.trim());
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (SEPARATOR_RE.test(lines[i] ?? '')) {
            sepIdx = i;
            break;
        }
    }
    const alignments =
        sepIdx >= 0 ? parseAlignments(lines[sepIdx]!) : [];
    const rows: string[][] = [];
    for (let i = sepIdx >= 0 ? sepIdx + 1 : 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined || SEPARATOR_RE.test(line)) continue;
        rows.push(splitCells(line).map((c) => c.trim()));
    }
    return { headers, alignments, rows };
}

class TableRenderWidget extends WidgetType {
    constructor(
        private readonly tableText: string,
        private readonly lines: string[],
    ) {
        super();
    }

    eq(other: TableRenderWidget): boolean {
        return other.tableText === this.tableText;
    }

    get estimatedHeight(): number {
        return (this.lines.length + 1) * 28;
    }

    toDOM(view: EditorView): HTMLElement {
        const doc = view.dom.ownerDocument;
        const container = doc.createElement('div');
        container.className =
            'cm-embed-block markdown-rendered vim-table-rendered';

        const wrapper = doc.createElement('div');
        wrapper.className = 'table-wrapper';
        container.appendChild(wrapper);

        const { headers, alignments, rows } = parseTable(this.lines);

        const table = doc.createElement('table');
        wrapper.appendChild(table);

        const thead = doc.createElement('thead');
        table.appendChild(thead);
        const headerRow = doc.createElement('tr');
        thead.appendChild(headerRow);
        for (let i = 0; i < headers.length; i++) {
            const th = doc.createElement('th');
            const align = alignments[i];
            if (align) th.setAttribute('align', align);
            const cellWrapper = doc.createElement('div');
            cellWrapper.className = 'table-cell-wrapper';
            cellWrapper.textContent = headers[i] ?? '';
            th.appendChild(cellWrapper);
            headerRow.appendChild(th);
        }

        const tbody = doc.createElement('tbody');
        table.appendChild(tbody);
        for (const row of rows) {
            const tr = doc.createElement('tr');
            for (let i = 0; i < Math.max(row.length, headers.length); i++) {
                const td = doc.createElement('td');
                const align = alignments[i];
                if (align) td.setAttribute('align', align);
                const cellWrapper = doc.createElement('div');
                cellWrapper.className = 'table-cell-wrapper';
                cellWrapper.textContent = row[i] ?? '';
                td.appendChild(cellWrapper);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        return container;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

function buildDecorations(state: EditorState): DecorationSet {
    const tables = findTableRanges(state);
    const decorations: Range<Decoration>[] = [];

    for (const table of tables) {
        if (cursorInRange(state, table.from, table.to)) continue;
        decorations.push(
            Decoration.replace({
                widget: new TableRenderWidget(
                    table.lines.join('\n'),
                    table.lines,
                ),
                block: true,
            }).range(table.from, table.to),
        );
    }

    return Decoration.set(decorations, true);
}

let enabled = false;

export function setTableRenderEnabled(value: boolean): void {
    enabled = value;
}

export const tableRenderField: Extension = StateField.define<DecorationSet>({
    create(state) {
        return enabled ? buildDecorations(state) : Decoration.none;
    },
    update(prev, tr) {
        if (!enabled) return Decoration.none;
        if (tr.docChanged || tr.selection) {
            return buildDecorations(tr.state);
        }
        return prev;
    },
    provide: (f) => EditorView.decorations.from(f),
});
