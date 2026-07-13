/**
 * Mark gutter indicators — shows vim mark letters in the sign column
 * gutter. Delegates rendering to sign-column.ts; this module retains
 * the refresh scheduling API consumed by main.ts.
 */

import { EditorView } from '@codemirror/view';
import { setSignsEffect } from './sign-column';
import type { SignEntry } from './sign-column';
export {
    createSignColumnExtension as createMarkGutterExtension,
    reconfigureSignColumn as reconfigureMarkGutter,
} from './sign-column';
export type { SignColumnMode } from './sign-column';
import type { CmAdapter } from '../types/vim-api';

// ── Refresh Logic ────────────────────────────────────────

const pendingRefresh = new WeakMap<EditorView, number>();

export interface PersistedMarkEntry {
    name: string;
    line: number;
}

export function scheduleMarkGutterRefresh(
    view: EditorView,
    cm: CmAdapter,
    persistedMarksForFile?: PersistedMarkEntry[],
): void {
    if (pendingRefresh.has(view)) return;
    const id = window.requestAnimationFrame(() => {
        pendingRefresh.delete(view);
        refreshMarkGutter(view, cm, persistedMarksForFile);
    });
    pendingRefresh.set(view, id);
}

export function cancelMarkGutterRefresh(view: EditorView): void {
    const id = pendingRefresh.get(view);
    if (id !== undefined) {
        cancelAnimationFrame(id);
        pendingRefresh.delete(view);
    }
}

function refreshMarkGutter(
    view: EditorView,
    cm: CmAdapter,
    persistedMarksForFile?: PersistedMarkEntry[],
): void {
    const marks = cm.state.vim?.marks;

    const byLine = new Map<number, string[]>();

    if (marks) {
        for (const [name, marker] of Object.entries(marks)) {
            const pos = marker.find();
            if (!pos) continue;
            const lineNum = pos.line + 1;
            if (lineNum < 1 || lineNum > view.state.doc.lines) continue;
            const lineStart = view.state.doc.line(lineNum).from;
            const existing = byLine.get(lineStart) ?? [];
            existing.push(name);
            byLine.set(lineStart, existing);
        }
    }

    if (persistedMarksForFile) {
        for (const pm of persistedMarksForFile) {
            const lineNum = pm.line + 1;
            if (lineNum < 1 || lineNum > view.state.doc.lines) continue;
            const lineStart = view.state.doc.line(lineNum).from;
            const existing = byLine.get(lineStart) ?? [];
            if (!existing.includes(pm.name)) {
                existing.push(pm.name);
            }
            byLine.set(lineStart, existing);
        }
    }

    const entries: SignEntry[] = [];
    for (const [pos, names] of byLine) {
        entries.push({ pos, labels: names.sort().join('') });
    }

    try {
        view.dispatch({ effects: setSignsEffect.of(entries) });
    } catch {
        // noop — view destroyed
    }
}
