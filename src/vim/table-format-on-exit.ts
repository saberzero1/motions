import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { Annotation, type Extension } from '@codemirror/state';
import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import {
    findTableRanges,
    splitCellsEscapeAware,
    realignTableLines,
    findTableBounds,
} from './table-utils';
import { getCmAdapter } from './vim-api';

const formatAnnotation = Annotation.define<boolean>();

interface TrackedTable {
    from: number;
    to: number;
}

function cursorInTable(
    state: { selection: { ranges: readonly { from: number; to: number }[] } },
    table: TrackedTable,
): boolean {
    return state.selection.ranges.some(
        (r) => r.from <= table.to && r.to >= table.from,
    );
}

const formatOnExitPlugin = ViewPlugin.fromClass(
    class {
        private trackedTable: TrackedTable | null = null;
        private dirty = false;
        private pendingFormat = false;

        update(update: ViewUpdate): void {
            if (
                update.transactions.some((tr) =>
                    tr.annotation(formatAnnotation),
                )
            ) {
                return;
            }

            const state = update.state;
            const startState = update.startState;

            if (update.docChanged && this.trackedTable) {
                const tables = findTableRanges(state);
                const prev = this.trackedTable;
                let stillIn = false;
                for (const t of tables) {
                    if (
                        cursorInTable(state, t) &&
                        Math.abs(t.from - prev.from) <
                            Math.abs(state.doc.length - startState.doc.length) +
                                500
                    ) {
                        this.trackedTable = { from: t.from, to: t.to };
                        this.dirty = true;
                        stillIn = true;
                        break;
                    }
                }
                if (!stillIn) {
                    if (this.dirty) {
                        this.formatTable(update.view, prev, startState.doc);
                    }
                    this.trackedTable = null;
                    this.dirty = false;
                }
                return;
            }

            if (!update.selectionSet && !update.docChanged) return;

            if (!this.trackedTable) {
                const tables = findTableRanges(state);
                for (const t of tables) {
                    if (cursorInTable(state, t)) {
                        this.trackedTable = { from: t.from, to: t.to };
                        this.dirty = false;
                        break;
                    }
                }
                return;
            }

            if (cursorInTable(state, this.trackedTable)) {
                return;
            }

            if (this.dirty) {
                this.formatTable(update.view, this.trackedTable, state.doc);
            }
            this.trackedTable = null;
            this.dirty = false;
        }

        private formatTable(
            view: EditorView,
            table: TrackedTable,
            doc: {
                line(n: number): { text: string; from: number };
                lines: number;
            },
        ): void {
            if (this.pendingFormat) return;
            this.pendingFormat = true;

            const tableFrom = table.from;
            queueMicrotask(() => {
                this.pendingFormat = false;
                const currentDoc = view.state.doc;
                const lineAt = currentDoc.lineAt(
                    Math.min(tableFrom, currentDoc.length),
                );
                const bounds = findTableBounds(currentDoc, lineAt.number);
                if (!bounds) return;

                const lines: string[] = [];
                for (let i = bounds.start; i <= bounds.end; i++) {
                    lines.push(currentDoc.line(i).text);
                }

                const realigned = realignTableLines(lines);
                const newText = realigned.join('\n');
                if (newText === lines.join('\n')) return;

                const from = currentDoc.line(bounds.start).from;
                const to = currentDoc.line(bounds.end).to;
                view.dispatch({
                    changes: { from, to, insert: newText },
                    annotations: formatAnnotation.of(true),
                });
            });
        }

        destroy(): void {
            this.trackedTable = null;
            this.dirty = false;
        }
    },
);

function getVimMode(app: App, editorView?: EditorView): string | null {
    if (editorView) {
        const adapter = (editorView as unknown as Record<string, unknown>)
            .cm as { state?: { vim?: { mode?: string } } } | undefined;
        return adapter?.state?.vim?.mode ?? null;
    }
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const adapter = getCmAdapter(view);
    return adapter?.state?.vim?.mode ?? null;
}

function createSeparatorAutoHandler(app: App): Extension {
    return EditorView.inputHandler.of((view, from, to, inserted) => {
        if (inserted !== '|') return false;

        const mode = getVimMode(app, view);
        if (mode !== 'insert') return false;

        const doc = view.state.doc;
        const line = doc.lineAt(from);
        const lineNum = line.number;

        const textBefore = line.text.slice(0, from - line.from);
        const textAfter = line.text.slice(to - line.from);

        if (textBefore !== '|' || textAfter !== '') return false;

        const bounds = findTableBounds(doc, lineNum);
        if (!bounds || bounds.start >= lineNum) return false;

        const headerLine = doc.line(bounds.start);
        const colCount = splitCellsEscapeAware(headerLine.text).length;
        if (colCount <= 0) return false;

        const sepCells = Array.from({ length: colCount }, () => '---');
        const sepLine = `| ${sepCells.join(' | ')} |`;

        view.dispatch({
            changes: { from: line.from, to: line.to, insert: sepLine },
            selection: { anchor: line.from + sepLine.length },
        });
        return true;
    });
}

export function createTableFormatOnExitExtension(app: App): Extension {
    return [formatOnExitPlugin, createSeparatorAutoHandler(app)];
}
