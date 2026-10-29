import { syntaxTree } from '@codemirror/language';
import {
    RangeSetBuilder,
    type EditorState,
    type Extension,
    type Line,
} from '@codemirror/state';
import {
    Decoration,
    ViewPlugin,
    type DecorationSet,
    type EditorView,
    type ViewUpdate,
} from '@codemirror/view';
import type { Alignment } from '../../table-utils';
import { buildTableLayout, cellAt } from '../layout-model';
import { revealField } from './reveal-field';

export const REVEAL_ROW_CLASS = 'vim-motions-reveal-row';
/**
 * Every line of a revealed extent, table row or not. The stylesheet keys on it
 * to stop the highlight that keeps the table revealed from looking like a
 * search result, which has to hold on every highlighted line — including the
 * ones Obsidian's parser does not count as rows.
 */
const REVEALED_LINE_CLASS = 'vim-motions-revealed-line';
const CELL_CLASS = 'vim-motions-reveal-cell';
const DELIM_CLASS = 'vim-motions-reveal-delim';
const ACTIVE_CLASS = 'is-active-cell';

const ROW_LINE = {
    header: Decoration.line({
        class: `${REVEALED_LINE_CLASS} ${REVEAL_ROW_CLASS} is-header`,
    }),
    separator: Decoration.line({
        class: `${REVEALED_LINE_CLASS} ${REVEAL_ROW_CLASS} is-separator`,
    }),
    data: Decoration.line({
        class: `${REVEALED_LINE_CLASS} ${REVEAL_ROW_CLASS} is-data`,
    }),
};
const PLAIN_LINE = Decoration.line({ class: REVEALED_LINE_CLASS });

const DELIM_MARK = Decoration.mark({ class: DELIM_CLASS });

const cellMarks = new Map<string, Decoration>();

function cellMark(alignment: Alignment, active: boolean): Decoration {
    const key = `${alignment}:${active}`;
    let mark = cellMarks.get(key);
    if (!mark) {
        mark = Decoration.mark({
            class: `${CELL_CLASS} is-align-${alignment}${active ? ` ${ACTIVE_CLASS}` : ''}`,
        });
        cellMarks.set(key, mark);
    }
    return mark;
}

/**
 * Whether Obsidian's own parser counts `line` as a table row.
 *
 * The reveal record is deliberately wider than Obsidian's idea of a table, so
 * it cannot be what decides styling: a run of `| x |` lines inside a code
 * fence is revealed harmlessly, and must not be painted as a grid. The syntax
 * tree is the authority, measured in the spike as a line node named
 * `HyperMD-table-N_HyperMD-table-row_HyperMD-table-row-M`.
 */
function isTableRowLine(state: EditorState, line: Line): boolean {
    let found = false;
    syntaxTree(state).iterate({
        from: line.from,
        to: line.to,
        enter: (node) => {
            if (found) return false;
            if (node.name.includes('HyperMD-table-row')) {
                found = true;
                return false;
            }
            return undefined;
        },
    });
    return found;
}

function buildDecorations(view: EditorView): DecorationSet {
    const state = view.state;
    const reveal = state.field(revealField, false);
    if (!reveal || reveal.tables.length === 0) return Decoration.none;

    const doc = state.doc;
    const head = state.selection.main.head;
    const ranges: { from: number; to: number; value: Decoration }[] = [];

    for (const table of reveal.tables) {
        if (table.to < view.viewport.from || table.from > view.viewport.to) {
            continue;
        }
        const first = doc.lineAt(table.from).number;
        const last = doc.lineAt(table.to).number;
        const lines: Line[] = [];
        for (let n = first; n <= last; n++) lines.push(doc.line(n));

        const rows = lines.filter((line) => isTableRowLine(state, line));
        const rowSet = new Set(rows.map((l) => l.number));

        lines.forEach((line, index) => {
            const kind =
                index === 0 ? 'header' : index === 1 ? 'separator' : 'data';
            ranges.push({
                from: line.from,
                to: line.from,
                value: rowSet.has(line.number) ? ROW_LINE[kind] : PLAIN_LINE,
            });
        });
        if (rows.length === 0) continue;

        const layout = buildTableLayout({
            from: table.from,
            to: table.to,
            lines: lines.map((l) => l.text),
        });
        if (!layout) continue;
        const active = cellAt(layout, head);

        for (const row of layout.rows) {
            if (!rowSet.has(doc.lineAt(row.from).number)) continue;
            for (const offset of row.delimiters) {
                ranges.push({
                    from: offset,
                    to: offset + 1,
                    value: DELIM_MARK,
                });
            }
            if (row.kind === 'separator') continue;
            for (const cell of row.cells) {
                if (cell.to <= cell.from) continue;
                ranges.push({
                    from: cell.from,
                    to: cell.to,
                    value: cellMark(
                        layout.alignments[cell.column] ?? 'none',
                        cell === active,
                    ),
                });
            }
        }
    }

    // Line decorations sort first at a position, then marks by start.
    ranges.sort(
        (a, b) =>
            a.from - b.from ||
            Number(b.from === b.to) - Number(a.from === a.to) ||
            a.to - b.to,
    );
    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) builder.add(r.from, r.to, r.value);
    return builder.finish();
}

/**
 * Styles a revealed table as an aligned source grid.
 *
 * Rows get a line class by kind, so the stylesheet can set the monospace font
 * that makes padded columns line up; delimiters and cells get marks carrying
 * each column's alignment; and the cell holding the caret is marked active.
 * Only rows Obsidian's parser confirms are styled — see `isTableRowLine`.
 */
export function revealGridDecorations(): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view);
            }

            update(update: ViewUpdate): void {
                if (
                    update.docChanged ||
                    update.selectionSet ||
                    update.viewportChanged ||
                    update.startState.field(revealField, false) !==
                        update.state.field(revealField, false) ||
                    syntaxTree(update.startState) !== syntaxTree(update.state)
                ) {
                    this.decorations = buildDecorations(update.view);
                }
            }
        },
        { decorations: (v) => v.decorations },
    );
}
