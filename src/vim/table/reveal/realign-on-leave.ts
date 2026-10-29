import {
    EditorSelection,
    type ChangeSpec,
    type Extension,
    type Text,
} from '@codemirror/state';
import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { getAnyVimAdapter } from '../../vim-api';
import { findUnescapedPipes, realignTableLines } from '../../table-utils';
import type { CmAdapter, VimModeChange } from '../../../types/vim-api';
import { cellBounds, cellIndexAt, cellTextStart } from './cells';
import { findTableAt } from './table-extent';

/**
 * A row this module will rewrite: optional blockquote markers and
 * indentation, then a body that opens and closes with a pipe.
 */
const PIPED_ROW = /^((?:[ \t]{0,3}>[ \t]?)*[ \t]*)(\|.*\|)[ \t]*$/;

/**
 * With `tableAutoRealign` on, a table edited during an insert session is
 * realigned when the session ends, the way Obsidian's table editor realigns
 * when it commits a cell. Realigning on a natural boundary rather than per
 * keystroke is what vim-table-mode, table-nvim and org-mode all do.
 *
 * The realign is labelled `input.type.compose`, which CodeMirror's history
 * always joins to the previous event, so one `u` takes back the edit and the
 * realign together, as vim-table-mode's `undojoin` does. The vim adapter uses
 * the same label for the same reason.
 *
 * A table is left alone unless every row opens and closes with a pipe and
 * all rows share one prefix: a row still being typed must not be rebuilt
 * under the user.
 */
export function realignOnInsertLeave(isEnabled: () => boolean): Extension {
    return ViewPlugin.define((view) => new InsertLeaveRealign(view, isEnabled));
}

class InsertLeaveRealign implements PluginValue {
    private adapter: CmAdapter | null = null;
    private handler: ((mode: VimModeChange) => void) | null = null;
    private inInsert = false;
    /** Positions the current insert session changed, kept mapped. */
    private edited: number[] = [];
    /**
     * Positions changed by the keystroke being handled, outside insert mode.
     * `cw` deletes before the adapter signals insert mode, so a session that
     * starts during the same keystroke inherits them.
     */
    private recent: number[] = [];
    private destroyed = false;

    constructor(
        private readonly view: EditorView,
        private readonly isEnabled: () => boolean,
    ) {
        this.bind();
    }

    update(update: ViewUpdate): void {
        const current = getAnyVimAdapter(this.view);
        if (current !== this.adapter) {
            this.unbind();
            this.bind();
        }
        if (!update.docChanged) return;
        const changed = (into: number[]): number[] => {
            const out = into.map((p) => update.changes.mapPos(p));
            update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
                out.push(fromB, toB);
            });
            return out;
        };
        if (this.inInsert) {
            this.edited = changed(this.edited);
            return;
        }
        this.recent = changed(this.recent);
        queueMicrotask(() => {
            this.recent = [];
        });
    }

    destroy(): void {
        this.destroyed = true;
        this.unbind();
    }

    private bind(): void {
        const adapter = getAnyVimAdapter(this.view);
        if (!adapter) return;
        this.adapter = adapter;
        this.handler = (mode) => this.onModeChange(mode);
        adapter.on('vim-mode-change', this.handler);
    }

    private unbind(): void {
        if (this.adapter && this.handler) {
            this.adapter.off(
                'vim-mode-change',
                this.handler as (...args: unknown[]) => void,
            );
        }
        this.adapter = null;
        this.handler = null;
    }

    private onModeChange(mode: VimModeChange): void {
        const inserting = mode.mode === 'insert' || mode.mode === 'replace';
        if (inserting) {
            if (!this.inInsert) this.edited = [...this.recent];
            this.inInsert = true;
            return;
        }
        // `<C-o>` runs one normal-mode command and returns to the same
        // session, so the table is not rebuilt halfway through it.
        if (mode.subMode?.startsWith('ctrl-o')) {
            return;
        }
        if (!this.inInsert) return;
        this.inInsert = false;
        const edited = this.edited;
        this.edited = [];
        if (edited.length === 0 || !this.isEnabled()) return;
        // The adapter is still finishing the key that left insert mode, and
        // moves the caret back one after signalling the change.
        queueMicrotask(() => {
            if (this.destroyed || this.view.composing) return;
            realignEditedTables(this.view, edited);
        });
    }
}

function realignEditedTables(view: EditorView, edited: number[]): void {
    const { state } = view;
    const doc = state.doc;
    const head = state.selection.main.head;
    const changes: ChangeSpec[] = [];
    const seen = new Set<number>();
    let caret: { line: number; oldText: string; newText: string } | null = null;

    for (const pos of edited) {
        const lineNo = doc.lineAt(
            Math.min(Math.max(pos, 0), doc.length),
        ).number;
        const table = findTableAt(doc, lineNo);
        if (!table || seen.has(table.from)) continue;
        seen.add(table.from);
        const rewrite = realignedRows(doc, table.fromLine, table.toLine);
        if (!rewrite) continue;
        for (let i = 0; i < rewrite.length; i++) {
            const line = doc.line(table.fromLine + i);
            const next = rewrite[i];
            if (next === undefined || next === line.text) continue;
            changes.push({ from: line.from, to: line.to, insert: next });
            if (head >= line.from && head <= line.to) {
                caret = {
                    line: line.number,
                    oldText: line.text,
                    newText: next,
                };
            }
        }
    }
    if (changes.length === 0) return;

    const changeSet = state.changes(changes);
    let selection: EditorSelection | undefined;
    if (caret && state.selection.ranges.length === 1) {
        const line = doc.line(caret.line);
        const col = mapColumn(caret.oldText, caret.newText, head - line.from);
        selection = EditorSelection.single(
            changeSet.mapPos(line.from, -1) + col,
        );
    }
    view.dispatch({
        changes: changeSet,
        selection,
        userEvent: 'input.type.compose',
        scrollIntoView: false,
    });
}

/** The table's rows realigned with their prefix kept, or null to skip it. */
function realignedRows(
    doc: Text,
    fromLine: number,
    toLine: number,
): string[] | null {
    let prefix: string | null = null;
    const bodies: string[] = [];
    for (let n = fromLine; n <= toLine; n++) {
        const match = PIPED_ROW.exec(doc.line(n).text);
        if (!match) return null;
        const [, rowPrefix = '', body = ''] = match;
        const pipes = findUnescapedPipes(body);
        if (pipes[0] !== 0 || pipes[pipes.length - 1] !== body.length - 1) {
            return null;
        }
        if (prefix === null) prefix = rowPrefix;
        else if (rowPrefix !== prefix) return null;
        bodies.push(body);
    }
    const realigned = realignTableLines(bodies);
    if (realigned.length !== bodies.length) return null;
    return realigned.map((body) => (prefix ?? '') + body);
}

/**
 * Where column `col` of `oldText` lands in `newText`: the same delimiter, or
 * the same offset from the start of the same cell's content, kept inside the
 * cell when its padding shrank.
 */
function mapColumn(oldText: string, newText: string, col: number): number {
    const oldBounds = cellBounds(oldText);
    const newBounds = cellBounds(newText);
    const clampToLine = (c: number): number =>
        Math.max(0, Math.min(c, Math.max(0, newText.length - 1)));
    if (oldBounds.length === 0 || newBounds.length === 0) {
        return clampToLine(col);
    }
    const onBoundary = oldBounds.indexOf(col);
    if (onBoundary !== -1 && newBounds[onBoundary] !== undefined) {
        return clampToLine(newBounds[onBoundary]);
    }
    const index = cellIndexAt(oldBounds, col);
    const last = oldBounds.length - 1;
    if (index < 0) return clampToLine(col);
    if (index >= last) {
        const oldEnd = oldBounds[last] ?? 0;
        const newEnd = newBounds[newBounds.length - 1] ?? 0;
        return clampToLine(newEnd + (col - oldEnd));
    }
    const from = newBounds[index];
    const to = newBounds[index + 1];
    if (from === undefined || to === undefined) return clampToLine(col);
    const offset = col - cellTextStart(oldText, oldBounds, index);
    const target = cellTextStart(newText, newBounds, index) + offset;
    return clampToLine(Math.max(from + 1, Math.min(target, to - 1)));
}
