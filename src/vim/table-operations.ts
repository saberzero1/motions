import type { EditorView } from '@codemirror/view';
import type { TableRange } from './table-utils';
import { realignTableLines } from './table-utils';

export function tableRealign(view: EditorView, table: TableRange): void {
    const newLines = realignTableLines(table.lines);
    const newText = newLines.join('\n');
    if (newText === table.lines.join('\n')) return;
    view.dispatch({
        changes: { from: table.from, to: table.to, insert: newText },
    });
}
