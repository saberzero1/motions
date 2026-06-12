import type {
    CmAdapter,
    OperatorArgs,
    OperatorRange,
    VimApi,
    VimPos,
} from '../types/vim-api';
import { getVimApi } from '../vim/vim-api';

/**
 * Result of parsing the Markdown structural prefix from a line.
 */
interface WrapPrefix {
    /** The literal prefix string (e.g. "> ", "- ", "  ") */
    text: string;
    /** The continuation indent for wrapped lines */
    wrapIndent: string;
}

/**
 * Detect the Markdown structural prefix (blockquote, list marker, indentation)
 * and return both the prefix text and the continuation indent.
 */
function detectWrapPrefix(line: string): WrapPrefix {
    // Blockquote: >, > , > >, > >
    const bqMatch = line.match(/^((?:>\s?)+)/);
    if (bqMatch && bqMatch[1]) {
        const bqPart: string = bqMatch[1];
        const afterBq: string = line.slice(bqPart.length);

        // Check for list marker after blockquote: > - text
        const listMatch = afterBq.match(/^(\s*(?:[-*+]\s|(?:\d+[.)]\s)))/);
        if (listMatch && listMatch[1]) {
            return {
                text: bqPart + listMatch[1],
                wrapIndent: bqPart + ' '.repeat(listMatch[1].length),
            };
        }

        // Plain blockquote – continue with same prefix
        return { text: bqPart, wrapIndent: bqPart };
    }

    // List markers: "- ", "* ", "+ ", "1. ", "1) " (possibly indented)
    const listMatch = line.match(/^(\s*(?:[-*+]\s|(?:\d+[.)]\s)))/);
    if (listMatch && listMatch[1]) {
        return {
            text: listMatch[1],
            wrapIndent: ' '.repeat(listMatch[1].length),
        };
    }

    // Preserve leading whitespace for everything else
    const indentMatch = line.match(/^(\s+)/);
    if (indentMatch && indentMatch[1]) {
        return { text: indentMatch[1], wrapIndent: indentMatch[1] };
    }

    return { text: '', wrapIndent: '' };
}

/**
 * Find the last space character within `maxLen`. If none exists (single long word),
 * fall back to maxLen to force a hard break.
 */
function findBreak(text: string, maxLen: number): number {
    if (text.length <= maxLen) return text.length;
    const lastSpace = text.lastIndexOf(' ', maxLen);
    if (lastSpace > 0) return lastSpace;
    // No space before limit: search forward for the next space
    const nextSpace = text.indexOf(' ', maxLen);
    return nextSpace > 0 ? nextSpace : text.length;
}

/**
 * Hard-wrap (reformat) a range of text at `textwidth`.
 *
 * Splits lines exceeding textwidth at word boundaries, preserving Markdown
 * structural prefixes (blockquotes, list markers, indentation) on continuation
 * lines. Merges short lines with matching prefixes into the preceding line
 * when they fit within textwidth, producing a proper paragraph-reflow effect.
 *
 * @returns The last row that was written.
 */
function hardWrapRange(
    cm: CmAdapter,
    fromLine: number,
    toLine: number,
    textwidth: number,
): number {
    // ---- 1. Collect & wrap lines into a flat buffer ----
    const origLines: string[] = [];
    for (let i = fromLine; i <= toLine; i++) {
        const l = cm.getLine(i);
        if (l !== undefined) origLines.push(l);
    }

    const wrapped: string[] = [];

    for (let i = 0; i < origLines.length; i++) {
        const line: string = origLines[i]!;

        // Blank lines are preserved as-is and reset the merge chain
        if (line.trim() === '') {
            wrapped.push('');
            continue;
        }

        const prefix: WrapPrefix = detectWrapPrefix(line);
        const body: string = line.slice(prefix.text.length);

        // ---- Short line: try to merge with the previous wrapped line ----
        if (
            body.length <= textwidth - prefix.text.length &&
            wrapped.length > 0
        ) {
            const prev: string | undefined = wrapped[wrapped.length - 1];
            if (prev !== undefined && prev !== '') {
                const prevPrefix: WrapPrefix = detectWrapPrefix(prev);
                // Merge if the prefixes match (same structural level)
                if (prevPrefix.text === prefix.text) {
                    const prevBody: string = prev.slice(prevPrefix.text.length);
                    const gap: string = prevBody === '' ? '' : ' ';
                    const merged: string = prevBody + gap + body;
                    if (merged.length <= textwidth - prevPrefix.text.length) {
                        wrapped[wrapped.length - 1] = prevPrefix.text + merged;
                        continue;
                    }
                }
            }
        }

        // ---- Short line that can't be merged (or is first) ----
        if (body.length <= textwidth - prefix.text.length) {
            wrapped.push(line);
            continue;
        }

        // ---- Long line: split at word boundaries ----
        let remaining: string = body;
        let first = true;
        while (remaining.length > 0) {
            const indent: string = first ? prefix.text : prefix.wrapIndent;
            const maxBodyLen: number = textwidth - indent.length;

            if (remaining.length <= maxBodyLen) {
                wrapped.push(indent + remaining);
                break;
            }

            const breakAt: number = findBreak(remaining, maxBodyLen);
            wrapped.push(indent + remaining.slice(0, breakAt));
            remaining = remaining.slice(breakAt).trimStart();
            first = false;
        }
    }

    // ---- 2. Replace the original range with wrapped content ----
    const lastOrigLine: string | undefined = cm.getLine(toLine);
    cm.replaceRange(
        wrapped.join('\n'),
        { line: fromLine, ch: 0 },
        { line: toLine, ch: (lastOrigLine ?? '').length },
    );

    return fromLine + wrapped.length - 1;
}

/**
 * Operator callback for `gq` (hard-wrap / format).
 *
 * Mirrors the signature of Vim operators in @replit/codemirror-vim.
 * Processes each range in `ranges` independently.
 */
function hardWrapCore(
    cm: CmAdapter,
    operatorArgs: OperatorArgs,
    ranges: OperatorRange[],
): { endRow: number; fromLine: number } | null {
    const vim: VimApi | null = getVimApi();
    const twOption = vim?.getOption('textwidth');
    const tw = typeof twOption === 'number' && twOption > 0 ? twOption : 80;

    for (const range of ranges) {
        let from = range.anchor.line;
        let to = range.head.line;

        if (from > to) {
            [from, to] = [to, from];
        }

        // When the operator is invoked linewise (e.g. `gqq` or visual line `gq`),
        // the head includes one extra line that should not be processed.
        if (operatorArgs.linewise) {
            to--;
        }

        if (from > to) continue;

        const endRow = hardWrapRange(cm, from, to, tw);
        return { endRow, fromLine: from };
    }

    return null;
}

export function hardWrapOperator(
    cm: CmAdapter,
    operatorArgs: OperatorArgs,
    ranges: OperatorRange[],
    _oldAnchor: VimPos,
    _newHead: VimPos,
): VimPos | void {
    const result = hardWrapCore(cm, operatorArgs, ranges);
    if (result) return { line: result.endRow, ch: 0 };
}

export function hardWrapKeepCursorOperator(
    cm: CmAdapter,
    operatorArgs: OperatorArgs,
    ranges: OperatorRange[],
    oldAnchor: VimPos,
    _newHead: VimPos,
): VimPos | void {
    const result = hardWrapCore(cm, operatorArgs, ranges);
    if (result) return oldAnchor;
}
