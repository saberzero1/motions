import {
    Compartment,
    type Extension,
    type EditorState,
} from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import {
    foldable,
    foldEffect,
    foldedRanges,
    unfoldEffect,
} from '@codemirror/language';
import {
    signColumnField,
    SignMarker,
    parseSignColumnMode,
    type ParsedSignColumnMode,
} from './sign-column';
import {
    computeLineNumber,
    getLineNumberMode,
    getNumberwidth,
    type LineNumberMode,
} from './line-number-gutter';

// ── Types ────────────────────────────────────────────────

type SegmentType =
    | 'line-number'
    | 'relative-number'
    | 'signs'
    | 'fold'
    | 'separator'
    | 'literal';

interface StatusColumnSegment {
    type: SegmentType;
    text?: string;
}

interface RenderedSegment {
    type: SegmentType;
    text: string;
    cls: string;
}

export interface StatusColumnSettings {
    number: boolean;
    relativenumber: boolean;
    signcolumn: string;
}

// ── Parser ───────────────────────────────────────────────

const TOKEN_RE = /%(l|r|s|C|=)|%(\{[^}]*\}|[^lrsC= ])|([^%]+)/g;

export function parseStatusColumn(format: string): StatusColumnSegment[] {
    if (!format) return [];
    const segments: StatusColumnSegment[] = [];
    let m: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(format)) !== null) {
        if (m[1]) {
            switch (m[1]) {
                case 'l':
                    segments.push({ type: 'line-number' });
                    break;
                case 'r':
                    segments.push({ type: 'relative-number' });
                    break;
                case 's':
                    segments.push({ type: 'signs' });
                    break;
                case 'C':
                    segments.push({ type: 'fold' });
                    break;
                case '=':
                    segments.push({ type: 'separator' });
                    break;
            }
        } else if (m[2]) {
            throw new Error(
                `Unsupported statuscolumn token: %${m[2]}. Supported: %l, %r, %s, %C, %=`,
            );
        } else if (m[3]) {
            segments.push({ type: 'literal', text: m[3] });
        }
    }
    return segments;
}

// ── Composite GutterMarker ───────────────────────────────

class StatusColumnMarker extends GutterMarker {
    constructor(
        private readonly rendered: RenderedSegment[],
        private readonly key: string,
        private readonly view: EditorView,
        private readonly lineFrom: number,
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const row = createSpan({ cls: 'vim-motions-stc-row' });
        for (const seg of this.rendered) {
            const span = createSpan({ cls: seg.cls, text: seg.text });
            if (seg.type === 'signs' && seg.text) {
                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.view.dispatch({
                        selection: { anchor: this.lineFrom },
                    });
                    this.view.focus();
                });
            } else if (seg.type === 'fold' && seg.text) {
                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleFoldClick();
                });
            }
            row.appendChild(span);
        }
        return row;
    }

    eq(other: StatusColumnMarker): boolean {
        return this.key === other.key;
    }

    private handleFoldClick(): void {
        const state = this.view.state;
        const folded = foldedRanges(state);
        let isFolded = false;
        folded.between(this.lineFrom, this.lineFrom, () => {
            isFolded = true;
        });
        if (isFolded) {
            this.view.dispatch({
                effects: unfoldEffect.of({
                    from: this.lineFrom,
                    to: this.lineFrom,
                }),
            });
        } else {
            const line = state.doc.lineAt(this.lineFrom);
            const range = foldable(state, line.from, line.to);
            if (range) {
                this.view.dispatch({
                    effects: foldEffect.of({
                        from: range.from,
                        to: range.to,
                    }),
                });
            }
        }
    }
}

class StatusColumnSpacer extends GutterMarker {
    constructor(
        private readonly segments: StatusColumnSegment[],
        private readonly spacerKey: string,
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const row = createSpan({ cls: 'vim-motions-stc-row' });
        for (const seg of this.segments) {
            const text = this.getSpacerText(seg);
            const cls = getSegmentClass(seg.type);
            row.appendChild(
                createSpan({ cls, text, attr: { style: 'visibility:hidden' } }),
            );
        }
        return row;
    }

    eq(other: StatusColumnSpacer): boolean {
        return this.spacerKey === other.spacerKey;
    }

    private getSpacerText(seg: StatusColumnSegment): string {
        switch (seg.type) {
            case 'line-number':
                return '0'.repeat(getNumberwidth());
            case 'relative-number':
                return '0'.repeat(Math.max(2, getNumberwidth()));
            case 'signs':
                return 'aa';
            case 'fold':
                return ' ';
            case 'separator':
                return ' ';
            case 'literal':
                return seg.text ?? ' ';
        }
    }
}

// ── Segment rendering ────────────────────────────────────

function getSegmentClass(type: SegmentType): string {
    switch (type) {
        case 'line-number':
            return 'vim-motions-stc-line-number';
        case 'relative-number':
            return 'vim-motions-stc-relative-number';
        case 'signs':
            return 'vim-motions-stc-signs';
        case 'fold':
            return 'vim-motions-stc-fold';
        case 'separator':
            return 'vim-motions-stc-separator';
        case 'literal':
            return 'vim-motions-stc-literal';
    }
}

function renderSegment(
    seg: StatusColumnSegment,
    lineNo: number,
    cursorLineNo: number,
    isCurrent: boolean,
    state: EditorState,
    lineFrom: number,
    lineTo: number,
    lineNumberMode: LineNumberMode,
    signMode: ParsedSignColumnMode,
): RenderedSegment {
    switch (seg.type) {
        case 'line-number': {
            const effectiveMode =
                lineNumberMode === 'off' ? 'absolute' : lineNumberMode;
            const text = computeLineNumber(lineNo, cursorLineNo, effectiveMode);
            const cls =
                getSegmentClass('line-number') +
                (isCurrent ? ' vim-motions-line-num-current' : '');
            return { type: 'line-number', text, cls };
        }
        case 'relative-number': {
            const rel = isCurrent
                ? '0'
                : String(Math.abs(lineNo - cursorLineNo));
            const cls =
                getSegmentClass('relative-number') +
                (isCurrent ? ' vim-motions-line-num-current' : '');
            return { type: 'relative-number', text: rel, cls };
        }
        case 'signs': {
            if (signMode.base === 'no') {
                return {
                    type: 'signs',
                    text: '',
                    cls: getSegmentClass('signs'),
                };
            }
            let markText = '';
            try {
                const field = state.field(signColumnField);
                field.between(lineFrom, lineFrom, (_from, _to, value) => {
                    if (value instanceof SignMarker) {
                        markText = value.label;
                    }
                });
            } catch {
                // field not registered
            }
            const first = markText[0] ?? '';
            const typeCls =
                first >= 'A' && first <= 'Z'
                    ? ' vim-motions-sign-marker-global'
                    : markText
                      ? ' vim-motions-sign-marker-local'
                      : '';
            return {
                type: 'signs',
                text: markText,
                cls: getSegmentClass('signs') + typeCls,
            };
        }
        case 'fold': {
            const folded = foldedRanges(state);
            let isFolded = false;
            folded.between(lineFrom, lineFrom, () => {
                isFolded = true;
            });
            if (isFolded) {
                return {
                    type: 'fold',
                    text: '▾',
                    cls: getSegmentClass('fold'),
                };
            }
            const foldRange = foldable(state, lineFrom, lineTo);
            if (foldRange) {
                return {
                    type: 'fold',
                    text: '▸',
                    cls: getSegmentClass('fold'),
                };
            }
            return { type: 'fold', text: '', cls: getSegmentClass('fold') };
        }
        case 'separator':
            return {
                type: 'separator',
                text: '',
                cls: getSegmentClass('separator'),
            };
        case 'literal':
            return {
                type: 'literal',
                text: seg.text ?? '',
                cls: getSegmentClass('literal'),
            };
    }
}

// ── Compartment ──────────────────────────────────────────

const statusColumnCompartment = new Compartment();

// ── Extension factory ────────────────────────────────────

function createStatusColumnGutter(
    segments: StatusColumnSegment[],
    settings: StatusColumnSettings,
): Extension {
    const lineNumberMode = getLineNumberMode(
        settings.number,
        settings.relativenumber,
    );
    const signMode = parseSignColumnMode(settings.signcolumn);
    const hasRelative = segments.some(
        (s) => s.type === 'relative-number' || s.type === 'line-number',
    );

    return gutter({
        class: 'vim-motions-statuscolumn',
        lineMarker(view, line) {
            const cursorLineNo = view.state.doc.lineAt(
                view.state.selection.main.head,
            ).number;
            const lineNo = view.state.doc.lineAt(line.from).number;
            const isCurrent = lineNo === cursorLineNo;

            const rendered: RenderedSegment[] = [];
            const keyParts: string[] = [];

            for (const seg of segments) {
                const r = renderSegment(
                    seg,
                    lineNo,
                    cursorLineNo,
                    isCurrent,
                    view.state,
                    line.from,
                    line.to,
                    lineNumberMode,
                    signMode,
                );
                rendered.push(r);
                keyParts.push(r.text + r.cls);
            }

            return new StatusColumnMarker(
                rendered,
                keyParts.join('|'),
                view,
                line.from,
            );
        },
        lineMarkerChange(update) {
            if (!hasRelative) {
                return (
                    update.docChanged ||
                    update.viewportChanged ||
                    update.transactions.some((tr) =>
                        tr.effects.some(
                            (e) => e.is(foldEffect) || e.is(unfoldEffect),
                        ),
                    )
                );
            }
            return (
                update.selectionSet ||
                update.docChanged ||
                update.viewportChanged ||
                update.transactions.some((tr) =>
                    tr.effects.some(
                        (e) => e.is(foldEffect) || e.is(unfoldEffect),
                    ),
                )
            );
        },
        initialSpacer(view) {
            const spacerKey = segments
                .map((s) => s.type + (s.text ?? ''))
                .join('|');
            return new StatusColumnSpacer(segments, spacerKey);
        },
        updateSpacer(_spacer, update) {
            const spacerKey =
                segments.map((s) => s.type + (s.text ?? '')).join('|') +
                ':' +
                String(update.view.state.doc.lines);
            return new StatusColumnSpacer(segments, spacerKey);
        },
    });
}

// ── Public API ───────────────────────────────────────────

export function createStatusColumnExtension(
    format: string,
    settings: StatusColumnSettings,
): Extension {
    if (!format) return statusColumnCompartment.of([]);
    const segments = parseStatusColumn(format);
    return statusColumnCompartment.of(
        createStatusColumnGutter(segments, settings),
    );
}

export function reconfigureStatusColumn(
    view: EditorView,
    format: string,
    settings: StatusColumnSettings,
): void {
    let ext: Extension = [];
    if (format) {
        try {
            const segments = parseStatusColumn(format);
            ext = createStatusColumnGutter(segments, settings);
        } catch {
            // invalid format — fall back to empty
        }
    }
    try {
        view.dispatch({
            effects: statusColumnCompartment.reconfigure(ext),
        });
    } catch {
        // noop — view may be destroyed
    }
}
