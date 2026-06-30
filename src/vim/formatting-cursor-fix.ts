/**
 * Suppresses Obsidian's Decoration.replace({}) for markdown formatting marks
 * (* ** _ __ ` ~~ ==) so that cursor positioning works correctly inside
 * formatted content. Without suppression, Decoration.replace removes the
 * delimiter characters from the DOM, causing CM6 to snap the cursor to the
 * delimiter boundary when the cursor is placed programmatically.
 *
 * Uses the same RangeSetBuilder.prototype.add patching pattern as
 * table-widget-suppressor.ts.
 *
 * Current limitation: suppression is global (all lines, all times).
 * This correctly fixes cursor snapping but makes formatting marks visible
 * on inactive lines. The marks are styled with color:transparent via CSS
 * (see styles.css) to maintain the visual appearance of hidden formatting.
 */

import {
    RangeSetBuilder,
    StateField,
    type Extension,
    type Transaction,
} from '@codemirror/state';
import { around } from '../util/around';

let enabled = false;
let activeDoc: {
    sliceString: (from: number, to: number) => string;
} | null = null;

const FORMATTING_MARKS = new Set(['*', '**', '_', '__', '`', '~~', '==']);

interface DecorationValue {
    isReplace?: boolean;
    widget?: unknown;
}

function isFormattingReplace(
    from: number,
    to: number,
    value: unknown,
): boolean {
    const v = value as DecorationValue | null | undefined;
    if (!v || v.isReplace !== true) return false;
    if (v.widget) return false;
    const len = to - from;
    if (len < 1 || len > 2) return false;
    if (!activeDoc) return false;
    const text = activeDoc.sliceString(from, to);
    return FORMATTING_MARKS.has(text);
}

const docTrackerField = StateField.define<null>({
    create(state) {
        activeDoc = state.doc;
        return null;
    },
    update(_: null, tr: Transaction) {
        activeDoc = tr.state.doc;
        return null;
    },
});

export const formattingDocTracker: Extension = docTrackerField;

export function installFormattingCursorFix(): () => void {
    enabled = true;

    const proto = RangeSetBuilder.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
    >;
    const uninstall = around(proto, {
        add(orig) {
            return function (
                this: unknown,
                from: unknown,
                to: unknown,
                value: unknown,
            ) {
                if (
                    enabled &&
                    isFormattingReplace(from as number, to as number, value)
                ) {
                    return;
                }
                return orig.call(this, from, to, value);
            };
        },
        addInner(orig) {
            return function (
                this: unknown,
                from: unknown,
                to: unknown,
                value: unknown,
            ) {
                if (
                    enabled &&
                    isFormattingReplace(from as number, to as number, value)
                ) {
                    return false;
                }
                return orig.call(this, from, to, value);
            };
        },
    });

    return () => {
        enabled = false;
        uninstall();
    };
}
