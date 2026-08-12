import { WidgetType, EditorView } from '@codemirror/view';
import {
    Prec,
    EditorState,
    StateField,
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

        const container = createDiv({
            cls: 'cm-embed-block markdown-rendered vim-table-rendered',
        });

        const wrapper = container.createDiv({ cls: 'table-wrapper' });

        const { headers, alignments, rows } = parseTable(this.lines);
        const separatorIndex = this.lines.findIndex((line) =>
            SEPARATOR_RE.test(line),
        );
        const headerRowCount = separatorIndex >= 0 ? separatorIndex + 1 : 1;

        const table = wrapper.createEl('table');

        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (let i = 0; i < headers.length; i++) {
            const th = headerRow.createEl('th', {
                attr: { 'data-row': '0', 'data-col': String(i) },
            });
            const align = alignments[i];
            if (align && align !== 'none') th.setAttribute('align', align);
            const cellWrapper = th.createDiv({ cls: 'table-cell-wrapper' });
            renderCell(
                cellWrapper,
                headers[i] ?? '',
                sourcePath,
                app,
                this.component,
            );
        }

        const tbody = table.createEl('tbody');
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex] ?? [];
            const tr = tbody.createEl('tr');
            for (let i = 0; i < Math.max(row.length, headers.length); i++) {
                const td = tr.createEl('td', {
                    attr: {
                        'data-row': String(rowIndex + headerRowCount),
                        'data-col': String(i),
                    },
                });
                const align = alignments[i];
                if (align && align !== 'none') td.setAttribute('align', align);
                const cellWrapper = td.createDiv({ cls: 'table-cell-wrapper' });
                renderCell(
                    cellWrapper,
                    row[i] ?? '',
                    sourcePath,
                    app,
                    this.component,
                );
            }
        }

        if (embeddedMode && onCellClick) {
            const handler = onCellClick;
            const editorView = view;
            container.addEventListener('click', (e: MouseEvent) => {
                const target = e.target as HTMLElement | null;
                const cell = target?.closest<HTMLElement>(
                    '[data-row][data-col]',
                );
                if (!cell) return;
                const row = parseInt(cell.getAttribute('data-row') ?? '', 10);
                const col = parseInt(cell.getAttribute('data-col') ?? '', 10);
                if (isNaN(row) || isNaN(col)) return;
                handler(editorView, row, col, container);
                e.preventDefault();
                e.stopPropagation();
            });
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

type CellClickHandler = (
    view: EditorView,
    row: number,
    col: number,
    widgetEl: HTMLElement,
) => void;
let onCellClick: CellClickHandler | null = null;

export function setTableWidgetCellClickHandler(
    handler: CellClickHandler | null,
): void {
    onCellClick = handler;
}

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

const tableCursorGuard = EditorState.transactionFilter.of((tr) => {
    if (!enabled || embeddedMode) return tr;
    if (!tr.docChanged || !tr.selection) return tr;

    const oldHead = tr.startState.selection.main.head;
    const newHead = tr.selection.main.head;
    if (oldHead === newHead) return tr;

    const mappedOld = tr.changes.mapPos(oldHead, 1);
    if (mappedOld === newHead) return tr;

    const tables = findTableRanges(tr.state);
    const oldInTable = tables.find(
        (t) => mappedOld >= t.from && mappedOld <= t.to,
    );
    if (!oldInTable) return tr;

    const newInSameTable =
        newHead >= oldInTable.from && newHead <= oldInTable.to;
    if (!newInSameTable) return tr;

    const newLine = tr.state.doc.lineAt(newHead);
    const oldLine = tr.state.doc.lineAt(mappedOld);
    if (newLine.number === oldLine.number) return tr;

    const tableStartLine = tr.state.doc.lineAt(oldInTable.from);
    if (newLine.number !== tableStartLine.number) return tr;

    return {
        ...tr,
        selection: { anchor: mappedOld },
    };
});

export const tableRenderField: Extension = [
    Prec.high(
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
    ),
    tableCursorGuard,
];
