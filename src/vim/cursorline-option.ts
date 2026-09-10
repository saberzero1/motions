/**
 * Neovim's `'cursorlineopt'` is a comma-separated list over the tokens `line`,
 * `screenline`, `number` and `both`, where `both` is an alias for
 * `line,number` and `line`/`screenline` are mutually exclusive
 * (runtime/doc/options.txt). That grammar collapses to only five reachable
 * states, so the settings dropdown stores one of those canonical spellings and
 * arbitrary legal input is normalized into it at the vimrc/Lua boundary.
 */

export const CURSORLINE_OPTIONS = {
    number: 'Number',
    line: 'Line',
    screenline: 'Screen line',
    both: 'Both',
    'screenline,number': 'Screen line and number',
} as const;

export type CursorlineOpt = keyof typeof CURSORLINE_OPTIONS;

export interface CursorlineFlags {
    number: boolean;
    line: boolean;
    screenline: boolean;
}

const TOKENS = new Set(['number', 'line', 'screenline', 'both']);

/**
 * Normalize any legal `'cursorlineopt'` spelling to its canonical form, or
 * `null` if Neovim would reject it. Duplicate tokens are rejected, matching
 * Neovim's own duplicate check.
 */
export function parseCursorlineOpt(value: string): CursorlineOpt | null {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.some((part) => !TOKENS.has(part))) return null;
    if (new Set(parts).size !== parts.length) return null;

    const tokens = new Set(parts);
    const line = tokens.has('line') || tokens.has('both');
    const screenline = tokens.has('screenline');
    const number = tokens.has('number') || tokens.has('both');

    if (line && screenline) return null;

    if (line) return number ? 'both' : 'line';
    if (screenline) return number ? 'screenline,number' : 'screenline';
    return number ? 'number' : null;
}

export function cursorlineFlags(opt: CursorlineOpt): CursorlineFlags {
    return {
        number:
            opt === 'number' || opt === 'both' || opt === 'screenline,number',
        line: opt === 'line' || opt === 'both',
        screenline: opt === 'screenline' || opt === 'screenline,number',
    };
}
