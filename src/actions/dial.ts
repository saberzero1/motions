import { DIAL_RULES } from './dial-rules';

/**
 * Try all dial rules against the line at cursor position.
 * Returns replacement info or null if no rule matches.
 */
export function tryDial(
    line: string,
    cursorCh: number,
    direction: 1 | -1,
    count: number,
): { newText: string; start: number; end: number; cursorPos: number } | null {
    for (const rule of DIAL_RULES) {
        const match = rule.find(line, cursorCh);
        if (match) {
            const newText = rule.apply(match, direction, count);
            return {
                newText,
                start: match.start,
                end: match.end,
                cursorPos: match.start + newText.length - 1,
            };
        }
    }
    return null;
}
