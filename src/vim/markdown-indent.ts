import { indentUnit } from '@codemirror/language';
import type { OperatorFn, VimPos } from '../types/vim-api';
import type { VimRegistration } from './registration';

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?=\s|$)/;
const FENCE = /^\s*(`{3,}|~{3,})/;

/** The columns `text`'s leading whitespace takes, a tab to the next stop. */
function indentColumns(text: string, tabSize: number): number {
    let cols = 0;
    for (const ch of text) {
        if (ch === ' ') cols++;
        else if (ch === '\t') cols += tabSize - (cols % tabSize);
        else break;
    }
    return cols;
}

/**
 * Lines `=` keeps as they are: a fenced code block, fences included, and
 * frontmatter.
 */
function verbatimLines(lines: readonly string[]): boolean[] {
    const verbatim = lines.map(() => false);
    let i = 0;
    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
        if (end > 0) {
            for (let n = 0; n <= end; n++) verbatim[n] = true;
            i = end + 1;
        }
    }
    let fence: string | null = null;
    for (; i < lines.length; i++) {
        const m = FENCE.exec(lines[i] ?? '');
        if (fence) {
            verbatim[i] = true;
            if (
                m &&
                m[1]?.[0] === fence[0] &&
                (m[1]?.length ?? 0) >= fence.length
            ) {
                fence = null;
            }
        } else if (m) {
            verbatim[i] = true;
            fence = m[1] ?? null;
        }
    }
    return verbatim;
}

/**
 * The indent, in columns, Markdown-aware `=` gives each of lines `first` to
 * `last`, or null for a line it keeps:
 *
 * - a fenced code block and frontmatter keep theirs;
 * - a blank line is emptied (0);
 * - a list item keeps its nesting, normalized: a child is one `shiftwidth`
 *   deeper than its parent, and an item as deep as an earlier one is its
 *   sibling, so a list keeps its shape but not its stray spaces;
 * - a line continuing a list item goes to the item's text;
 * - any other line has none, since four columns would make it code.
 *
 * Nesting is read from the lines' indents as they are. Lines above the range
 * keep theirs, and are the reference for the lines in it.
 */
export function markdownIndents(
    lines: readonly string[],
    first: number,
    last: number,
    shiftwidth: number,
    tabSize: number,
): (number | null)[] {
    const verbatim = verbatimLines(lines);
    const original = lines.map((l) => indentColumns(l, tabSize));
    // Each list item's new indent and text column, for the items after it.
    const target: (number | null)[] = lines.map(() => null);
    const textColumn: (number | null)[] = lines.map(() => null);
    // Items of the list being read, outermost first: original and new indent.
    let stack: { orig: number; cols: number; line: number }[] = [];
    // The item a non-item line continues, if any.
    let owner: number | null = null;
    let blankBefore = false;
    for (let i = 0; i <= last && i < lines.length; i++) {
        const text = lines[i] ?? '';
        if (verbatim[i]) {
            stack = [];
            owner = null;
            continue;
        }
        if (!/\S/.test(text)) {
            target[i] = 0;
            blankBefore = true;
            continue;
        }
        const item = LIST_ITEM.exec(text);
        if (item) {
            const orig = original[i] ?? 0;
            while (
                stack.length &&
                orig < (stack[stack.length - 1]?.orig ?? 0)
            ) {
                stack.pop();
            }
            const top = stack[stack.length - 1];
            let cols: number;
            if (i < first) {
                // Above the range nothing moves, so its items are the
                // reference for the lines below as they stand.
                cols = orig;
                if (top && orig === top.orig) stack.pop();
            } else if (!top) {
                cols = 0;
            } else if (orig === top.orig) {
                cols = top.cols;
                stack.pop();
            } else {
                cols = top.cols + shiftwidth;
            }
            stack.push({ orig, cols, line: i });
            target[i] = cols;
            const marker = item[2] ?? '';
            const space =
                /^\s+/.exec(text.slice(item[0].length))?.[0].length ?? 1;
            textColumn[i] = cols + marker.length + Math.max(1, space);
            owner = i;
        } else if (owner !== null && (!blankBefore || (original[i] ?? 0) > 0)) {
            target[i] = textColumn[owner] ?? 0;
        } else {
            stack = [];
            owner = null;
            target[i] = 0;
        }
        blankBefore = false;
    }
    return target.slice(first, last + 1);
}

/**
 * The indent, in columns, Neovim's `=` gives lines `first` to `last` of a
 * Markdown note, which has no 'indentexpr': the indent of the nearest
 * non-blank line above, as re-indented, and none for a blank line.
 */
export function autoindentIndents(
    lines: readonly string[],
    first: number,
    last: number,
    tabSize: number,
): number[] {
    const cols = lines.map((l) => indentColumns(l, tabSize));
    const result: number[] = [];
    for (let i = first; i <= last && i < lines.length; i++) {
        if (!/\S/.test(lines[i] ?? '')) {
            result.push(0);
            continue;
        }
        let above = 0;
        for (let j = i - 1; j >= 0; j--) {
            if (/\S/.test(lines[j] ?? '')) {
                above = cols[j] ?? 0;
                break;
            }
        }
        cols[i] = above;
        result.push(above);
    }
    return result;
}

/**
 * `=` in a note: Markdown-aware when `isEnabled()`, Neovim's otherwise.
 *
 * The bundled engine's `=` uses CodeMirror's language indentation and falls
 * back to Vim's autoindent only where the language gives none, but
 * Obsidian's Markdown gives every line the indent it already has, so `=`
 * changed nothing. Both rules are applied here instead.
 */
export function registerMarkdownIndent(
    reg: VimRegistration,
    isEnabled: () => boolean,
): void {
    const operator: OperatorFn = (cm, args, ranges) =>
        reindent(cm, args, ranges, isEnabled());
    // With getOperator the built-in comes back on teardown; without it, the
    // next setup defines this again.
    if (!reg.defineOperatorOverride('indentAuto', () => operator)) {
        reg.defineOperator('indentAuto', operator);
    }
}

const reindent = (
    cm: Parameters<OperatorFn>[0],
    args: Parameters<OperatorFn>[1],
    ranges: Parameters<OperatorFn>[2],
    markdown: boolean,
): VimPos => {
    const vim = window.CodeMirrorAdapter?.Vim;
    const state = cm.cm6.state;
    const tabSize = state.tabSize;
    const swOption = vim?.getOption('shiftwidth');
    const shiftwidth =
        typeof swOption === 'number' && swOption > 0 ? swOption : tabSize;
    const et = vim?.getOption('expandtab');
    const useSpaces =
        typeof et === 'boolean' ? et : !state.facet(indentUnit).includes('\t');
    let first = Infinity;
    let last = -1;
    for (const range of ranges) {
        const a = range.anchor;
        const h = range.head;
        const from =
            a.line < h.line || (a.line === h.line && a.ch <= h.ch) ? a : h;
        const to = from === a ? h : a;
        const end = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
        first = Math.min(first, from.line);
        last = Math.max(last, end);
    }
    if (first === Infinity) return ranges[0]?.anchor ?? { line: 0, ch: 0 };
    const lines: string[] = [];
    for (let i = 0; i <= last; i++) lines.push(cm.getLine(i));
    const targets = markdown
        ? markdownIndents(lines, first, last, shiftwidth, tabSize)
        : autoindentIndents(lines, first, last, tabSize);
    for (let i = first; i <= last; i++) {
        const cols = targets[i - first];
        if (cols === null || cols === undefined) continue;
        const text = cm.getLine(i);
        const ws = text.length - text.replace(/^\s+/, '').length;
        const blank = ws === text.length;
        const indent = blank
            ? ''
            : useSpaces
              ? ' '.repeat(cols)
              : '\t'.repeat(Math.floor(cols / tabSize)) +
                ' '.repeat(cols % tabSize);
        if (text.slice(0, ws) !== indent) {
            cm.replaceRange(indent, { line: i, ch: 0 }, { line: i, ch: ws });
        }
    }
    const text = cm.getLine(first);
    const want = args.curswant;
    const ch =
        want !== undefined && vim?.startOfLineColumn
            ? vim.startOfLineColumn(cm, first, want)
            : Math.max(0, text.search(/\S|$/));
    return { line: first, ch };
};
