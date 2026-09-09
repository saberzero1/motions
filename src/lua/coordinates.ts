import type { CmAdapter } from '../types/vim-api';
import { getWindowDimensions } from './window-info';

const COMBINING_CHAR = /\p{Mn}|\p{Me}/u;

function utf8Size(codePoint: number): number {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
}

interface CharSpan {
    byteStart: number;
    byteEnd: number;
    utf16Start: number;
    utf16End: number;
}

/**
 * Maps each Vim "character" to its UTF-8 byte and host UTF-16 ranges.
 * charidx()/byteidx() fold composing marks into the preceding base character
 * unless countComposing is set, so a span may cover several code points.
 */
export function buildCharSpans(
    text: string,
    countComposing: boolean,
): CharSpan[] {
    const spans: CharSpan[] = [];
    let byte = 0;
    let utf16 = 0;
    for (const ch of text) {
        const size = utf8Size(ch.codePointAt(0) ?? 0);
        const previous = spans[spans.length - 1];
        if (!countComposing && previous && COMBINING_CHAR.test(ch)) {
            previous.byteEnd = byte + size;
            previous.utf16End = utf16 + ch.length;
        } else {
            spans.push({
                byteStart: byte,
                byteEnd: byte + size,
                utf16Start: utf16,
                utf16End: utf16 + ch.length,
            });
        }
        byte += size;
        utf16 += ch.length;
    }
    return spans;
}

export function utf8Length(text: string): number {
    let total = 0;
    for (const ch of text) total += utf8Size(ch.codePointAt(0) ?? 0);
    return total;
}

declare const utf16Brand: unique symbol;
declare const byteBrand: unique symbol;
declare const charBrand: unique symbol;
declare const displayBrand: unique symbol;
export type Utf16Col = number & { readonly [utf16Brand]: true };
export type ByteCol = number & { readonly [byteBrand]: true };
export type CharCol = number & { readonly [charBrand]: true };
export type DisplayCol = number & { readonly [displayBrand]: true };

// Constructors are adapter-private. Sentinels never pass through these.
const utf16Column = (value: number) => value as Utf16Col;
const byteColumn = (value: number) => value as ByteCol;
const charColumn = (value: number) => value as CharCol;
const displayColumn = (value: number) => value as DisplayCol;

export function utf16ToByte(text: string, col: Utf16Col): ByteCol {
    const span = buildCharSpans(text, true).find(
        (entry) => col < entry.utf16End,
    );
    return byteColumn(span?.byteStart ?? utf8Length(text));
}

/** D4: collapse interior bytes; never retain a byte-remainder shadow cursor. */
export function byteToUtf16(text: string, col: ByteCol): Utf16Col {
    const span = buildCharSpans(text, true).find(
        (entry) => col < entry.byteEnd,
    );
    return utf16Column(span?.utf16Start ?? text.length);
}

export function byteToCharColumn(text: string, col: ByteCol): CharCol {
    const spans = buildCharSpans(text, true);
    const index = spans.findIndex((entry) => col < entry.byteEnd);
    return charColumn(index < 0 ? spans.length : index);
}

/** Existing wide-codepoint classification, shared with strdisplaywidth. */
export function isWideCodePoint(cp: number): boolean {
    return (
        (cp >= 0x1100 && cp <= 0x115f) ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe10 && cp <= 0xfe6f) ||
        (cp >= 0xff01 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) ||
        (cp >= 0x20000 && cp <= 0x2fffd) ||
        (cp >= 0x30000 && cp <= 0x3fffd)
    );
}

interface DisplayContext {
    text: string;
    tabstop: number;
    list: boolean;
    listchars: string;
    wrap: boolean;
    width: number;
    showbreak: string;
}

function cellWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        if (!COMBINING_CHAR.test(ch))
            width += isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    }
    return width;
}

function displaySpans(context: DisplayContext) {
    const { text, tabstop, list, listchars, wrap, width } = context;
    const prefix =
        wrap && width > 0
            ? Math.min(cellWidth(context.showbreak), width - 1)
            : 0;
    let cell = 0;
    const spans = buildCharSpans(text, false);
    // Include the insertion EOL, but not a synthetic character in inverse lookup.
    return [
        ...spans,
        {
            byteStart: utf8Length(text),
            byteEnd: Infinity,
            utf16Start: text.length,
            utf16End: text.length,
        },
    ].map((span) => {
        const ch = text.slice(span.utf16Start, span.utf16End);
        let cells =
            ch === '\t'
                ? list && !/(?:^|,)tab:/.test(listchars)
                    ? 2
                    : tabstop - (cell % tabstop)
                : ch === ''
                  ? 1
                  : cellWidth(ch);
        const before = cell;
        if (
            wrap &&
            width > 0 &&
            cells === 2 &&
            ch !== '\t' &&
            cell % width === width - 1
        )
            cell++;
        if (cell > 0 && width > 0 && cell % width === 0) cell += prefix;
        const first = cell;
        // Whole wrapped rows can be accounted for without walking each
        // virtual cell/row on the UI thread. Prefix cells consume width.
        const remaining =
            wrap && width > 0
                ? Math.max(0, cells - (width - (cell % width)))
                : 0;
        const continuations =
            remaining > 0 ? Math.ceil(remaining / (width - prefix)) : 0;
        cell += cells + continuations * prefix;
        return { ...span, before, first, last: cell - 1 };
    });
}

export function byteToDisplayColumn(
    context: DisplayContext,
    col: ByteCol,
): DisplayCol {
    const span = displaySpans(context).find((entry) => col < entry.byteEnd);
    return displayColumn(span?.last ?? 0);
}

export function displayToByteColumn(
    context: DisplayContext,
    col: DisplayCol,
): ByteCol {
    const spans = displaySpans(context).filter(
        (entry) => entry.utf16Start < context.text.length,
    );
    // Prefix cells belong to the following character, not the previous one.
    const span =
        spans.find((entry) => col <= entry.last) ?? spans[spans.length - 1];
    return byteColumn(span?.byteStart ?? 0);
}

interface CoordinateHost {
    getLines?: (start: number, end: number) => string[];
    getLineCount?: () => number;
    getCursorPosition?: () => { line: number; col: number } | null;
    getCursorLine?: () => number;
    getCursorCol?: () => number;
    setCursorPosition?: (line: number, col: number) => void;
    getMarkPos?: (name: string) => { line: number; ch: number } | null;
    getLastVisualMode?: () => string;
    getCmAdapter?: () => CmAdapter | null;
}

interface CoordinateOptions {
    getBufferOption?: (name: string) => unknown;
    getWindowOption?: (name: string) => unknown;
}

export const MAXCOL = 2147483647;
type Failure = { kind: 'invalid' } | { kind: 'unloaded' } | { kind: 'unset' };
type BytePosition = {
    kind: 'position';
    line: number;
    text: string;
    col: ByteCol;
};
type Position = BytePosition | Failure | { kind: 'linewise-end'; line: number };
export type CoordinateResult<T> =
    { kind: 'value'; value: T } | { kind: 'error'; message: string };
const value = <T>(result: T): CoordinateResult<T> => ({
    kind: 'value',
    value: result,
});
const error = (message: string): CoordinateResult<never> => ({
    kind: 'error',
    message,
});

export function createNeovimCoordinateAdapter(
    host: CoordinateHost,
    options: CoordinateOptions = {},
) {
    const lineCount = () => host.getLineCount?.() ?? 0;
    function lineText(line: number): string | null {
        if (!Number.isInteger(line) || line < 1 || line > lineCount())
            return null;
        return host.getLines?.(line - 1, line)?.[0] ?? null;
    }
    function cursor(): Position {
        const pos = host.getCursorPosition
            ? host.getCursorPosition()
            : host.getCursorLine && host.getCursorCol
              ? { line: host.getCursorLine(), col: host.getCursorCol() }
              : null;
        if (!pos) return { kind: 'unset' };
        const text = lineText(pos.line);
        if (text === null) return { kind: 'unloaded' };
        return {
            kind: 'position',
            line: pos.line,
            text,
            col: utf16ToByte(text, utf16Column(Math.max(0, pos.col - 1))),
        };
    }
    function mark(name: string): Position {
        const pos = host.getMarkPos?.(name);
        if (!pos) return { kind: 'unset' };
        const line = pos.line + 1;
        if (
            pos.ch === Infinity ||
            (name === '>' && host.getLastVisualMode?.() === 'V')
        )
            return { kind: 'linewise-end', line };
        const text = lineText(line);
        if (text === null) return { kind: 'unloaded' };
        return {
            kind: 'position',
            line,
            text,
            col: utf16ToByte(text, utf16Column(pos.ch)),
        };
    }
    function expression(expr: unknown): CoordinateResult<Position> {
        if (Array.isArray(expr)) {
            if (
                expr.some(
                    (part) =>
                        typeof part === 'number' && !Number.isInteger(part),
                )
            )
                return error('Using a Float as a Number');
            const line = typeof expr[0] === 'number' ? expr[0] : 0;
            const text = lineText(line);
            if (text === null) return value({ kind: 'invalid' });
            const col: unknown =
                expr[1] === '$' ? utf8Length(text) + 1 : expr[1];
            if (
                typeof col !== 'number' ||
                col < 1 ||
                col > utf8Length(text) + 1
            )
                return value({ kind: 'invalid' });
            return value({
                kind: 'position',
                line,
                text,
                col: byteColumn(col - 1),
            });
        }
        if (typeof expr !== 'string')
            return error('String or List required for argument 1');
        if (expr === '.') return value(cursor());
        if (expr === '$') {
            const pos = cursor();
            return value(
                pos.kind === 'position'
                    ? { ...pos, col: byteColumn(utf8Length(pos.text)) }
                    : pos,
            );
        }
        if (expr.length === 2 && expr[0] === "'") return value(mark(expr[1]!));
        return value({ kind: 'invalid' });
    }
    function context(text: string): DisplayContext {
        const tabstop = options.getBufferOption?.('tabstop');
        const listchars = options.getWindowOption?.('listchars');
        const showbreak = options.getWindowOption?.('showbreak');
        return {
            text,
            tabstop:
                typeof tabstop === 'number' &&
                Number.isInteger(tabstop) &&
                tabstop > 0 &&
                tabstop <= 9999
                    ? tabstop
                    : 8,
            list: options.getWindowOption?.('list') === true,
            listchars: typeof listchars === 'string' ? listchars : 'tab:>-',
            wrap: options.getWindowOption?.('wrap') !== false,
            showbreak: typeof showbreak === 'string' ? showbreak : '',
            width: getWindowDimensions(host.getCmAdapter?.() ?? null).width,
        };
    }
    const eolBytes = () =>
        options.getBufferOption?.('fileformat') === 'dos' ? 2 : 1;
    return {
        bufferOffset(index: number): CoordinateResult<number> {
            if (lineCount() === 0) return value(-1);
            if (!Number.isInteger(index) || index < 0 || index > lineCount())
                return error('nvim_buf_get_offset: index out of bounds');
            let offset = 0;
            for (const line of host.getLines?.(0, index) ?? [])
                offset += utf8Length(line) + 1;
            return value(offset);
        },
        lineToByte(line: number): number {
            if (
                !Number.isInteger(line) ||
                !lineCount() ||
                line < 1 ||
                line > lineCount() + 1
            )
                return -1;
            let offset = 1;
            for (const text of host.getLines?.(0, line - 1) ?? [])
                offset += utf8Length(text) + eolBytes();
            return offset;
        },
        byteToLine(byte: number): number {
            if (!Number.isInteger(byte) || byte < 1 || !lineCount()) return -1;
            let end = 0;
            let line = 0;
            for (const text of host.getLines?.(0, lineCount()) ?? []) {
                end += utf8Length(text) + eolBytes();
                line++;
                if (byte <= end) return line;
            }
            return -1;
        },
        readCursor(): number[] {
            const pos = cursor();
            return pos.kind === 'position' ? [pos.line, pos.col] : [1, 0];
        },
        writeCursor(input: unknown): CoordinateResult<null> {
            if (
                !Array.isArray(input) ||
                input.length !== 2 ||
                input.some(
                    (part) =>
                        typeof part !== 'number' || !Number.isInteger(part),
                )
            )
                return error(
                    'nvim_win_set_cursor: expected {line, col} with integer numbers',
                );
            const [line, col] = input as [number, number];
            const text = lineText(line);
            if (text === null || col < 0 || col > MAXCOL)
                return error('nvim_win_set_cursor: coordinate out of range');
            host.setCursorPosition?.(
                line,
                byteToUtf16(text, byteColumn(col)) + 1,
            );
            return value(null);
        },
        readMark(name: string): CoordinateResult<number[]> {
            if (!/^[a-zA-Z0-9'`"[\]<>^.()]$/.test(name))
                return error('nvim_buf_get_mark: invalid mark name');
            const pos = mark(name);
            if (pos.kind === 'linewise-end') return value([pos.line, MAXCOL]);
            return value(
                pos.kind === 'position' ? [pos.line, pos.col] : [0, 0],
            );
        },
        expressionByte(expr: unknown): CoordinateResult<number> {
            const result = expression(expr);
            if (result.kind === 'error') return result;
            const pos = result.value;
            return value(
                pos.kind === 'position'
                    ? pos.col + 1
                    : pos.kind === 'linewise-end'
                      ? MAXCOL
                      : 0,
            );
        },
        expressionCharacter(expr: unknown): CoordinateResult<number> {
            // List columns are already characters. Do not send them through byte conversion.
            if (Array.isArray(expr)) {
                if (
                    expr.some(
                        (part) =>
                            typeof part === 'number' && !Number.isInteger(part),
                    )
                )
                    return error('Using a Float as a Number');
                const text = lineText(
                    typeof expr[0] === 'number' ? expr[0] : 0,
                );
                if (text === null) return value(0);
                const length = buildCharSpans(text, true).length;
                const col: unknown = expr[1] === '$' ? length + 1 : expr[1];
                return value(
                    typeof col === 'number' && col >= 1 && col <= length + 1
                        ? col
                        : 0,
                );
            }
            const result = expression(expr);
            if (result.kind === 'error') return result;
            const pos = result.value;
            return value(
                pos.kind === 'position'
                    ? byteToCharColumn(pos.text, pos.col) + 1
                    : pos.kind === 'linewise-end'
                      ? MAXCOL
                      : 0,
            );
        },
        expressionDisplay(
            expr: unknown,
            list: unknown = false,
            winid: unknown = 0,
        ): CoordinateResult<number | number[]> {
            if (typeof list !== 'boolean' && typeof list !== 'number')
                return value(0);
            const listMode = Boolean(list);
            const result = expression(expr);
            if (result.kind === 'error') return result;
            const pos = result.value;
            if (winid !== 0 || pos.kind !== 'position')
                return value(listMode ? [0, 0] : 0);
            const ctx = context(pos.text);
            const last = byteToDisplayColumn(ctx, pos.col) + 1;
            const first =
                displaySpans(ctx).find((span) => pos.col < span.byteEnd)
                    ?.first ?? 0;
            return value(listMode ? [first + 1, last] : last);
        },
        displayToByte(winid: number, line: number, col: number): number {
            if (
                winid !== 0 ||
                !Number.isInteger(line) ||
                !Number.isInteger(col) ||
                line < 0 ||
                col < 0
            )
                return -1;
            const text = lineText(Math.max(1, line));
            if (text === null) return -1;
            if (text === '') return 0;
            return (
                displayToByteColumn(
                    context(text),
                    displayColumn(Math.max(1, col) - 1),
                ) + 1
            );
        },
    };
}
