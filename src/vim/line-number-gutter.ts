import { Compartment, type Extension } from '@codemirror/state';
import { gutter, GutterMarker, EditorView } from '@codemirror/view';

// ── Types ────────────────────────────────────────────────

export type LineNumberMode = 'off' | 'absolute' | 'relative' | 'hybrid';

export type LineNumberDisplayMode = 'hybrid' | 'dual' | 'dual-rel-abs';

// ── Mode helpers ─────────────────────────────────────────

export function getLineNumberMode(
    number: boolean,
    relativenumber: boolean,
): LineNumberMode {
    if (number && relativenumber) return 'hybrid';
    if (number) return 'absolute';
    if (relativenumber) return 'relative';
    return 'off';
}

// ── Gutter marker ────────────────────────────────────────

class LineNumberMarker extends GutterMarker {
    constructor(
        private readonly text: string,
        private readonly isCurrent: boolean,
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const cls = this.isCurrent
            ? 'vim-motions-line-num vim-motions-line-num-current'
            : 'vim-motions-line-num';
        return createSpan({ cls, text: this.text });
    }

    eq(other: LineNumberMarker): boolean {
        return this.text === other.text && this.isCurrent === other.isCurrent;
    }
}

// ── Line number math ─────────────────────────────────────

export function computeLineNumber(
    lineNo: number,
    cursorLineNo: number,
    mode: LineNumberMode,
): string {
    switch (mode) {
        case 'absolute':
            return String(lineNo);
        case 'relative':
            return lineNo === cursorLineNo
                ? '0'
                : String(Math.abs(lineNo - cursorLineNo));
        case 'hybrid':
            return lineNo === cursorLineNo
                ? String(lineNo)
                : String(Math.abs(lineNo - cursorLineNo));
        case 'off':
        default:
            return '';
    }
}

// ── Number width ─────────────────────────────────────────

let numberwidthValue = 2;

export function setNumberwidth(value: number): void {
    numberwidthValue = Math.max(1, Math.min(20, value));
}

export function getNumberwidth(): number {
    return numberwidthValue;
}

// ── Compartments ─────────────────────────────────────────

const lineNumberCompartment = new Compartment();
const lineNumberSecondaryCompartment = new Compartment();

// ── Extension factory ────────────────────────────────────

function createLineNumberGutter(
    mode: LineNumberMode,
    gutterClass?: string,
): Extension {
    return gutter({
        class: gutterClass ?? 'vim-motions-line-numbers',
        lineMarker(view, line) {
            const cursorLineNo = view.state.doc.lineAt(
                view.state.selection.main.head,
            ).number;
            const lineNo = view.state.doc.lineAt(line.from).number;
            const text = computeLineNumber(lineNo, cursorLineNo, mode);
            return new LineNumberMarker(text, lineNo === cursorLineNo);
        },
        lineMarkerChange(update) {
            if (mode === 'absolute') {
                return update.docChanged || update.selectionSet;
            }
            return update.selectionSet || update.docChanged;
        },
        initialSpacer(view) {
            const digits =
                mode === 'relative'
                    ? numberwidthValue
                    : Math.max(
                          numberwidthValue,
                          String(view.state.doc.lines).length,
                      );
            return new LineNumberMarker('0'.repeat(digits), false);
        },
        updateSpacer(_spacer, update) {
            const digits =
                mode === 'relative'
                    ? numberwidthValue
                    : Math.max(
                          numberwidthValue,
                          String(update.view.state.doc.lines).length,
                      );
            return new LineNumberMarker('0'.repeat(digits), false);
        },
    });
}

/**
 * Create the primary line-number extension.
 */
export function createLineNumberExtension(
    number: boolean,
    relativenumber: boolean,
    displayMode: LineNumberDisplayMode = 'hybrid',
): Extension {
    const mode = getLineNumberMode(number, relativenumber);
    const { primary } = resolveGutters(mode, displayMode);
    return lineNumberCompartment.of(primary);
}

/**
 * Create the secondary line-number extension (for dual mode).
 * Must be registered as a separate registerEditorExtension() call.
 */
export function createLineNumberSecondaryExtension(
    number: boolean,
    relativenumber: boolean,
    displayMode: LineNumberDisplayMode = 'hybrid',
): Extension {
    const mode = getLineNumberMode(number, relativenumber);
    const { secondary } = resolveGutters(mode, displayMode);
    return lineNumberSecondaryCompartment.of(secondary);
}

/**
 * Reconfigure the active line-number mode at runtime.
 */
export function reconfigureLineNumbers(
    view: EditorView,
    number: boolean,
    relativenumber: boolean,
    displayMode: LineNumberDisplayMode = 'hybrid',
): void {
    const mode = getLineNumberMode(number, relativenumber);
    const { primary, secondary } = resolveGutters(mode, displayMode);
    view.dispatch({
        effects: [
            lineNumberCompartment.reconfigure(primary),
            lineNumberSecondaryCompartment.reconfigure(secondary),
        ],
    });
}

// ── Internal helpers ─────────────────────────────────────

function resolveGutters(
    mode: LineNumberMode,
    displayMode: LineNumberDisplayMode,
): { primary: Extension; secondary: Extension } {
    if (mode === 'off') {
        return { primary: [], secondary: [] };
    }

    if (mode !== 'hybrid' || displayMode === 'hybrid') {
        return {
            primary: createLineNumberGutter(mode),
            secondary: [],
        };
    }

    const absFirst = displayMode === 'dual';
    const leftMode: LineNumberMode = absFirst ? 'absolute' : 'relative';
    const rightMode: LineNumberMode = absFirst ? 'relative' : 'absolute';
    const leftClass = absFirst
        ? 'vim-motions-line-numbers vim-motions-line-numbers-absolute'
        : 'vim-motions-line-numbers vim-motions-line-numbers-relative';
    const rightClass = absFirst
        ? 'vim-motions-line-numbers vim-motions-line-numbers-relative'
        : 'vim-motions-line-numbers vim-motions-line-numbers-absolute';

    return {
        primary: createLineNumberGutter(leftMode, leftClass),
        secondary: createLineNumberGutter(rightMode, rightClass),
    };
}
