import { WidgetType, EditorView } from '@codemirror/view';
import {
    Prec,
    StateField,
    type EditorState,
    type Extension,
    type Range,
} from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import {
    type App,
    Component,
    editorInfoField,
    MarkdownRenderer,
} from 'obsidian';
import {
    SEPARATOR_RE,
    findTableRanges,
    cursorInRange,
    splitCellsEscapeAware,
    parseAlignments,
    type Alignment,
} from './table-utils';

function parseTable(lines: string[]): {
    headers: string[];
    alignments: Alignment[];
    rows: string[][];
} {
    const headers = splitCellsEscapeAware(lines[0] ?? '').map((c) => c.trim());
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (SEPARATOR_RE.test(lines[i] ?? '')) {
            sepIdx = i;
            break;
        }
    }
    const alignments = sepIdx >= 0 ? parseAlignments(lines[sepIdx]!) : [];
    const rows: string[][] = [];
    for (let i = sepIdx >= 0 ? sepIdx + 1 : 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined || SEPARATOR_RE.test(line)) continue;
        rows.push(splitCellsEscapeAware(line).map((c) => c.trim()));
    }
    return { headers, alignments, rows };
}

function renderCell(
    cellWrapper: HTMLElement,
    markdown: string,
    sourcePath: string,
    app: App,
    component: Component,
): void {
    cellWrapper.textContent = markdown;
    if (!markdown) return;

    MarkdownRenderer.render(app, markdown, cellWrapper, sourcePath, component)
        .then(() => {
            // MarkdownRenderer wraps inline content in <p> — unwrap it to
            // avoid block-level spacing inside table cells.
            const p = cellWrapper.querySelector(':scope > p');
            if (cellWrapper.children.length === 1 && p) {
                while (p.firstChild) {
                    cellWrapper.appendChild(p.firstChild);
                }
                p.remove();
            }
            const first = cellWrapper.firstChild;
            if (
                first?.nodeType === Node.TEXT_NODE &&
                first.textContent === markdown
            ) {
                first.remove();
            }
        })
        .catch(() => {});
}

class TableRenderWidget extends WidgetType {
    private component: Component | null = null;

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
        const info = view.state.field(editorInfoField);
        const app = (info as { app: App }).app;
        const sourcePath = info.file?.path ?? '';

        this.component = new Component();
        this.component.load();

        const doc = view.dom.ownerDocument;
        const container = doc.createElement('div');
        container.className =
            'cm-embed-block markdown-rendered vim-table-rendered';

        const wrapper = doc.createElement('div');
        wrapper.className = 'table-wrapper';
        container.appendChild(wrapper);

        const { headers, alignments, rows } = parseTable(this.lines);
        const separatorIndex = this.lines.findIndex((line) =>
            SEPARATOR_RE.test(line),
        );
        const headerRowCount = separatorIndex >= 0 ? separatorIndex + 1 : 1;

        const table = doc.createElement('table');
        wrapper.appendChild(table);

        const thead = doc.createElement('thead');
        table.appendChild(thead);
        const headerRow = doc.createElement('tr');
        thead.appendChild(headerRow);
        for (let i = 0; i < headers.length; i++) {
            const th = doc.createElement('th');
            th.setAttribute('data-row', '0');
            th.setAttribute('data-col', String(i));
            const align = alignments[i];
            if (align && align !== 'none') th.setAttribute('align', align);
            const cellWrapper = doc.createElement('div');
            cellWrapper.className = 'table-cell-wrapper';
            renderCell(
                cellWrapper,
                headers[i] ?? '',
                sourcePath,
                app,
                this.component,
            );
            th.appendChild(cellWrapper);
            headerRow.appendChild(th);
        }

        const tbody = doc.createElement('tbody');
        table.appendChild(tbody);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex] ?? [];
            const tr = doc.createElement('tr');
            for (let i = 0; i < Math.max(row.length, headers.length); i++) {
                const td = doc.createElement('td');
                td.setAttribute('data-row', String(rowIndex + headerRowCount));
                td.setAttribute('data-col', String(i));
                const align = alignments[i];
                if (align && align !== 'none') td.setAttribute('align', align);
                const cellWrapper = doc.createElement('div');
                cellWrapper.className = 'table-cell-wrapper';
                renderCell(
                    cellWrapper,
                    row[i] ?? '',
                    sourcePath,
                    app,
                    this.component,
                );
                td.appendChild(cellWrapper);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        return container;
    }

    destroy(): void {
        this.component?.unload();
        this.component = null;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

function buildDecorations(state: EditorState): DecorationSet {
    const tables = findTableRanges(state);
    const decorations: Range<Decoration>[] = [];

    for (const table of tables) {
        if (
            activeEditTableRange &&
            table.from <= activeEditTableRange.to &&
            table.to >= activeEditTableRange.from
        ) {
            continue;
        }
        if (!embeddedMode && cursorInRange(state, table.from, table.to)) {
            continue;
        }
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
let embeddedMode = false;
let activeEditTableRange: { from: number; to: number } | null = null;

export function setTableRenderEnabled(value: boolean): void {
    enabled = value;
}

export function setTableEmbeddedMode(value: boolean): void {
    embeddedMode = value;
}

export function setActiveEditTableRange(
    range: { from: number; to: number } | null,
): void {
    activeEditTableRange = range;
}

export const tableRenderField: Extension = Prec.high(
    StateField.define<DecorationSet>({
        create(state) {
            return enabled ? buildDecorations(state) : Decoration.none;
        },
        update(prev, tr) {
            if (!enabled) return Decoration.none;
            if (activeEditTableRange && tr.docChanged) {
                return prev.map(tr.changes);
            }
            if (tr.docChanged || tr.selection) {
                return buildDecorations(tr.state);
            }
            return prev;
        },
        provide: (f) => EditorView.decorations.from(f),
    }),
);
