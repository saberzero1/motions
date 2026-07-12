import { Compartment, type Extension } from '@codemirror/state';
import { gutter, GutterMarker, EditorView } from '@codemirror/view';

// ── Types ────────────────────────────────────────────────

export type LineNumberMode = 'off' | 'absolute' | 'relative' | 'hybrid';

// ── Mode helpers ─────────────────────────────────────────

/**
 * Map :set number/relativenumber flags to a line-number mode.
 */
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

function computeLineNumber(
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

// ── Compartment ──────────────────────────────────────────

const lineNumberCompartment = new Compartment();

// ── Extension factory ────────────────────────────────────

function createLineNumberGutter(mode: LineNumberMode): Extension {
    return gutter({
        class: 'vim-motions-line-numbers',
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
                return update.docChanged;
            }
            return update.selectionSet || update.docChanged;
        },
        initialSpacer(view) {
            const digits = Math.max(
                numberwidthValue,
                String(view.state.doc.lines).length,
            );
            return new LineNumberMarker('0'.repeat(digits), false);
        },
        updateSpacer(_spacer, update) {
            const digits = Math.max(
                numberwidthValue,
                String(update.view.state.doc.lines).length,
            );
            return new LineNumberMarker('0'.repeat(digits), false);
        },
    });
}

/**
 * Create a configurable line-number extension (absolute/relative/hybrid).
 */
export function createLineNumberExtension(
    number: boolean,
    relativenumber: boolean,
): Extension {
    const mode = getLineNumberMode(number, relativenumber);
    return lineNumberCompartment.of(
        mode === 'off' ? [] : createLineNumberGutter(mode),
    );
}

/**
 * Reconfigure the active line-number mode at runtime.
 */
export function reconfigureLineNumbers(
    view: EditorView,
    number: boolean,
    relativenumber: boolean,
): void {
    const mode = getLineNumberMode(number, relativenumber);
    const ext = mode === 'off' ? [] : createLineNumberGutter(mode);
    view.dispatch({ effects: lineNumberCompartment.reconfigure(ext) });
}
