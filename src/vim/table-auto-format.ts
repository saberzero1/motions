import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import { getCmAdapter } from './vim-api';

const TABLE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

function isTableLine(text: string): boolean {
    return TABLE_RE.test(text);
}

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

function splitCells(line: string): string[] {
    return line.split('|').slice(1, -1);
}

type Alignment = 'left' | 'center' | 'right' | 'none';

function parseAlignments(line: string): Alignment[] {
    return splitCells(line).map((cell) => {
        const t = cell.trim();
        const l = t.startsWith(':');
        const r = t.endsWith(':');
        if (l && r) return 'center';
        if (r) return 'right';
        if (l) return 'left';
        return 'none';
    });
}

function buildSepCell(width: number, align: Alignment): string {
    const d = '-'.repeat(Math.max(width, 3));
    switch (align) {
        case 'left':
            return `:${d.slice(1)}`;
        case 'right':
            return `${d.slice(1)}:`;
        case 'center':
            return `:${d.slice(2)}:`;
        default:
            return d;
    }
}

function findTableBounds(
    doc: { line(n: number): { text: string }; lines: number },
    lineNum: number,
): { start: number; end: number } | null {
    const lineObj = doc.line(lineNum);
    if (!isTableLine(lineObj.text)) return null;

    let start = lineNum;
    while (start > 1 && isTableLine(doc.line(start - 1).text)) start--;

    let end = lineNum;
    while (end < doc.lines && isTableLine(doc.line(end + 1).text)) end++;

    return { start, end };
}

function realignTableLines(lines: string[]): string[] {
    const rows: string[][] = [];
    let sepIdx = -1;
    let alignments: Alignment[] = [];

    for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (text === undefined) continue;
        if (SEPARATOR_RE.test(text)) {
            sepIdx = i;
            alignments = parseAlignments(text);
            rows.push([]);
        } else {
            rows.push(splitCells(text).map((c) => c.trim()));
        }
    }

    const colCount = Math.max(...rows.map((r) => r.length));
    if (colCount <= 0) return lines;

    const colWidths: number[] = Array.from({ length: colCount }, () => 3);
    for (const row of rows) {
        for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (cell !== undefined && cell.length > (colWidths[col] ?? 0)) {
                colWidths[col] = cell.length;
            }
        }
    }

    while (alignments.length < colCount) alignments.push('none');

    return rows.map((row, i) => {
        if (i === sepIdx) {
            const cells = colWidths.map((w, col) =>
                buildSepCell(w, alignments[col] ?? 'none'),
            );
            return `| ${cells.join(' | ')} |`;
        }
        const cells = colWidths.map((w, col) => (row[col] ?? '').padEnd(w));
        return `| ${cells.join(' | ')} |`;
    });
}

/**
 * CM6 inputHandler extension for auto-formatting tables when `|` is typed
 * in insert mode. Also generates separator rows from `||`.
 */
export function createTableAutoFormatExtension(app: App): Extension {
    return EditorView.inputHandler.of((view, from, to, inserted) => {
        if (inserted !== '|') return false;

        const mode = getVimMode(app, view);
        if (mode !== 'insert') return false;

        const doc = view.state.doc;
        const line = doc.lineAt(from);
        const lineNum = line.number;

        const textBefore = line.text.slice(0, from - line.from);
        const textAfter = line.text.slice(to - line.from);
        const newLineText = textBefore + '|' + textAfter;

        if (textBefore === '|' && textAfter === '') {
            const bounds = findTableBounds(doc, lineNum);
            if (bounds && bounds.start < lineNum) {
                const headerLine = doc.line(bounds.start);
                const colCount = splitCells(headerLine.text).length;
                if (colCount > 0) {
                    const sepCells = Array.from(
                        { length: colCount },
                        () => '---',
                    );
                    const sepLine = `| ${sepCells.join(' | ')} |`;

                    view.dispatch({
                        changes: {
                            from: line.from,
                            to: line.to,
                            insert: sepLine,
                        },
                        selection: { anchor: line.from + sepLine.length },
                    });
                    return true;
                }
            }
        }

        if (!isTableLine(newLineText)) return false;

        view.dispatch({
            changes: { from, to, insert: '|' },
        });

        const updatedDoc = view.state.doc;
        const updatedLine = updatedDoc.lineAt(from);
        const updatedLineNum = updatedLine.number;
        const bounds = findTableBounds(updatedDoc, updatedLineNum);
        if (!bounds) return true;

        const tableLines: string[] = [];
        for (let i = bounds.start; i <= bounds.end; i++) {
            tableLines.push(updatedDoc.line(i).text);
        }

        const realigned = realignTableLines(tableLines);
        const startPos = updatedDoc.line(bounds.start).from;
        const endPos = updatedDoc.line(bounds.end).to;
        const newText = realigned.join('\n');

        if (newText === tableLines.join('\n')) return true;

        const cursorLineIdx = updatedLineNum - bounds.start;
        const cursorInLine = from + 1 - updatedLine.from;

        const realignedLine = realigned[cursorLineIdx];
        let newCursorOffset = startPos;
        for (let i = 0; i < cursorLineIdx; i++) {
            newCursorOffset += (realigned[i]?.length ?? 0) + 1;
        }
        newCursorOffset += Math.min(cursorInLine, realignedLine?.length ?? 0);

        view.dispatch({
            changes: { from: startPos, to: endPos, insert: newText },
            selection: { anchor: newCursorOffset },
        });

        return true;
    });
}
