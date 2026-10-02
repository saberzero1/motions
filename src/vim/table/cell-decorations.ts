import {
    type EditorState,
    type Extension,
    RangeSetBuilder,
} from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    type EditorView,
    ViewPlugin,
    type ViewUpdate,
} from '@codemirror/view';
import type { Alignment } from '../table-utils';
import { buildTableLayout, type TableLayout } from './layout-model';

export const CELL_CLASS = 'vim-motions-table-cell';
export const DELIMITER_CLASS = 'vim-motions-table-delim';

const DELIMITER_MARK = Decoration.mark({ class: DELIMITER_CLASS });

/**
 * One mark per alignment, so a column's alignment is readable from the DOM.
 *
 * The class is the whole of alignment handling here. The nested editor is a
 * character grid over the table's **source**, and Markdown pads a cell on the
 * right — `realignTableLines` uses `padEnd`, as Obsidian's own formatter does
 * — so there is no leading space to render and `text-align` does nothing on an
 * inline span. Producing a visible right-alignment would mean hiding trailing
 * pad characters and drawing substitutes before the content: the
 * "leading-space rewriting" Plan E1.4 rules out, for a cosmetic effect on a
 * surface whose job is to show the source faithfully.
 *
 * Alignment is rendered where CSS can do it honestly — the passive grid, whose
 * cells are real blocks. `TableLayout.alignments` is the single source for
 * both, parsed from the separator row.
 */
const CELL_MARKS: Record<Alignment, Decoration> = {
    none: Decoration.mark({ class: `${CELL_CLASS} is-align-none` }),
    left: Decoration.mark({ class: `${CELL_CLASS} is-align-left` }),
    center: Decoration.mark({ class: `${CELL_CLASS} is-align-center` }),
    right: Decoration.mark({ class: `${CELL_CLASS} is-align-right` }),
};

function buildDecorations(state: EditorState): DecorationSet {
    const lines: string[] = [];
    for (let i = 1; i <= state.doc.lines; i++) {
        lines.push(state.doc.line(i).text);
    }

    const layout: TableLayout | null = buildTableLayout({
        from: 0,
        to: state.doc.length,
        lines,
    });
    if (!layout) return Decoration.none;

    // Collected then sorted: cell and delimiter ranges interleave, and a
    // RangeSetBuilder requires ascending starts.
    const ranges: { from: number; to: number; value: Decoration }[] = [];

    for (const row of layout.rows) {
        for (const offset of row.delimiters) {
            ranges.push({
                from: offset,
                to: offset + 1,
                value: DELIMITER_MARK,
            });
        }
        if (row.kind === 'separator') continue;

        for (const cell of row.cells) {
            if (cell.to <= cell.from) continue;
            ranges.push({
                from: cell.from,
                to: cell.to,
                value: CELL_MARKS[layout.alignments[cell.column] ?? 'none'],
            });
        }
    }

    ranges.sort((a, b) => a.from - b.from || a.to - b.to);
    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) builder.add(r.from, r.to, r.value);
    return builder.finish();
}

/**
 * Cell and delimiter decorations for the nested table editor.
 *
 * Belongs to the **child**, whose whole document is the table's source, so
 * every offset is table-relative and `buildTableLayout` is called with
 * `from: 0`. The parent's copy of the range is block-replaced and renders
 * nothing, so decorating it would be invisible.
 *
 * The classes deliberately avoid `.cm-table-widget`. That selector *is*
 * `surface-gate.ts`'s `TABLE_CELL_SELECTOR`, so reusing it would make the
 * treesitter bridge withhold its parser from the owned surface and make the
 * cursorline rule hide the owned surface's own cursorline.
 */
export function tableCellDecorations(): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view.state);
            }

            update(update: ViewUpdate): void {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildDecorations(update.state);
                }
            }
        },
        { decorations: (v) => v.decorations },
    );
}
