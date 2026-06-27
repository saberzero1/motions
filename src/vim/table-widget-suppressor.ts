/**
 * Table widget suppressor.
 *
 * Prevents Obsidian's Live Preview table widget from replacing
 * Markdown table ranges.  Patches RangeSetBuilder.prototype.add
 * and addInner to skip replace-decorations identified as table
 * widgets.
 *
 * Two modes:
 *   'always' — suppress all table widgets unconditionally
 *   'cursor' — suppress only the table whose range contains the
 *              primary cursor (other tables render as widgets)
 *
 * Detection: widget.containerEl.className includes 'cm-table-widget'.
 * Cursor position in 'cursor' mode: checks whether the cursor's
 * current line is a table line (starts with optional whitespace + |)
 * AND the cursor offset falls within the decoration's character range.
 * Line-based detection avoids the offset-boundary oscillation that
 * occurs with pure offset range checks on replace-decorations.
 */

import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import { around } from '../util/around';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

export type TableWidgetMode = 'off' | 'cursor' | 'always';

const TABLE_LINE_RE = /^\s*\|/;

let mode: TableWidgetMode = 'off';
let appRef: App | null = null;

function isTableWidgetDecoration(value: any): boolean {
    if (!value || value.isReplace !== true || !value.widget) return false;
    const el: HTMLElement | undefined = value.widget.containerEl;
    if (!el || typeof el.className !== 'string') return false;
    return el.className.includes('cm-table-widget');
}

function getCursorContext(): {
    offset: number;
    onTableLine: boolean;
} | null {
    if (!appRef) return null;
    const view = appRef.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const editor = view.editor;
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    return {
        offset: editor.posToOffset(cursor),
        onTableLine: TABLE_LINE_RE.test(lineText),
    };
}

function shouldSuppress(from: number, to: number, value: any): boolean {
    if (mode === 'off') return false;
    if (from >= to || !isTableWidgetDecoration(value)) return false;
    if (mode === 'always') return true;

    const ctx = getCursorContext();
    if (!ctx) return false;

    if (!ctx.onTableLine) return false;

    return ctx.offset >= from && ctx.offset <= to;
}

export function installTableWidgetSuppressor(
    app: App,
    newMode: TableWidgetMode,
): () => void {
    mode = newMode;
    appRef = app;

    const uninstall = around(RangeSetBuilder.prototype as any, {
        add(orig: any) {
            return function (this: any, from: number, to: number, value: any) {
                if (shouldSuppress(from, to, value)) return;
                return orig.call(this, from, to, value);
            };
        },
        addInner(orig: any) {
            return function (this: any, from: number, to: number, value: any) {
                if (shouldSuppress(from, to, value)) return false;
                return orig.call(this, from, to, value);
            };
        },
    });

    return () => {
        mode = 'off';
        appRef = null;
        uninstall();
    };
}
