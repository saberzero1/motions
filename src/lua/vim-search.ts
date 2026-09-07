import { vimRegExp } from './vim-regex';

export interface SearchHit {
    line: number;
    col: number;
}

export interface SearchDoc {
    lineCount(): number;
    getLine(index: number): string;
}

/**
 * Buffer search behind `vim.fn.searchpos()`.
 *
 * Extracted from the loader so it can be unit-tested. Patterns are Vim regex,
 * translated to JavaScript by `vimRegExp` — `searchpos()` is a Vim API, so its
 * argument follows Vim's magic-level rules, not JavaScript's.
 *
 * Returns 1-based line and column, matching `searchpos()`.
 */
export function searchBufferLines(
    doc: SearchDoc,
    pattern: string,
    flags: string,
    cursorLine: number,
    cursorCol: number,
    stopline: number | null,
): SearchHit | null {
    const lineCount = doc.lineCount();

    try {
        const re = vimRegExp(pattern);
        const backward = flags.includes('b');
        const wrapScan = !flags.includes('W');

        if (!backward) {
            const startLine = cursorLine - 1;
            const startCol = flags.includes('c') ? cursorCol - 1 : cursorCol;
            const maxLine =
                stopline !== null
                    ? Math.min(stopline - 1, lineCount - 1)
                    : lineCount - 1;

            for (let i = startLine; i <= maxLine; i++) {
                const line = doc.getLine(i);
                const searchFrom = i === startLine ? startCol : 0;
                const sub = line.substring(searchFrom);
                const m = re.exec(sub);
                if (m) {
                    return { line: i + 1, col: searchFrom + m.index + 1 };
                }
            }

            if (wrapScan && stopline === null) {
                for (let i = 0; i < startLine; i++) {
                    const line = doc.getLine(i);
                    const m = re.exec(line);
                    if (m) {
                        return { line: i + 1, col: m.index + 1 };
                    }
                }
            }
        } else {
            const startLine = cursorLine - 1;
            const minLine = stopline !== null ? Math.max(stopline - 1, 0) : 0;

            for (let i = startLine; i >= minLine; i--) {
                const line = doc.getLine(i);
                const searchUpTo =
                    i === startLine ? cursorCol - 1 : line.length;
                const sub = line.substring(0, searchUpTo);
                const lastMatch = lastMatchIn(pattern, sub);
                if (lastMatch !== null) {
                    return { line: i + 1, col: lastMatch + 1 };
                }
            }

            if (wrapScan && stopline === null) {
                for (let i = lineCount - 1; i > startLine; i--) {
                    const line = doc.getLine(i);
                    const lastMatch = lastMatchIn(pattern, line);
                    if (lastMatch !== null) {
                        return { line: i + 1, col: lastMatch + 1 };
                    }
                }
            }
        }
    } catch {
        // Invalid regex
    }

    return null;
}

function lastMatchIn(pattern: string, text: string): number | null {
    const globalRe = vimRegExp(pattern, { flags: 'g' });
    let lastIndex: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
        lastIndex = m.index;
        if (!globalRe.lastIndex || globalRe.lastIndex === m.index) break;
    }
    return lastIndex;
}
