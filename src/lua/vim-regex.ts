/**
 * Vim regex to JavaScript RegExp translation.
 *
 * Vim's regex dialect is not a superset or subset of JavaScript's — which
 * character is "special" depends on the *magic level*, and several constructs
 * have no direct equivalent. Compiling a Vim pattern with `new RegExp`
 * therefore fails silently rather than loudly: `\Val\C` becomes the literal
 * `ValC` and simply matches nothing.
 *
 * Magic levels, from most to least special:
 *
 * | Level | Set by | Special without a backslash |
 * | ----- | ------ | --------------------------- |
 * | very magic | `\v` | almost everything, closest to JavaScript |
 * | magic | `\m` (default) | `^ $ . * [ ]` |
 * | nomagic | `\M` | `^ $` |
 * | very nomagic | `\V` | `\` only |
 *
 * So in the default level `a+b` matches a literal `+`, while `a\+b` is "one or
 * more a". That is the reverse of JavaScript, and the main reason a pattern
 * cannot be passed through untranslated.
 */

export interface TranslatedRegex {
    source: string;
    /** `\c` forces ignore-case, `\C` forces match-case, anywhere in the pattern. */
    caseOverride: 'ignore' | 'match' | null;
}

type MagicLevel = 'very-magic' | 'magic' | 'nomagic' | 'very-nomagic';

const JS_SPECIAL = /[.*+?^${}()|[\]\\/]/;

function escapeLiteral(ch: string): string {
    return JS_SPECIAL.test(ch) ? `\\${ch}` : ch;
}

/** Vim character classes that map onto a JavaScript equivalent. */
const CLASS_MAP: Record<string, string> = {
    s: '[ \\t]',
    S: '[^ \\t]',
    d: '\\d',
    D: '\\D',
    w: '\\w',
    W: '\\W',
    a: '[A-Za-z]',
    A: '[^A-Za-z]',
    l: '[a-z]',
    L: '[^a-z]',
    u: '[A-Z]',
    U: '[^A-Z]',
    x: '[0-9A-Fa-f]',
    X: '[^0-9A-Fa-f]',
    o: '[0-7]',
    O: '[^0-7]',
    h: '[A-Za-z_]',
    H: '[^A-Za-z_]',
    n: '\\n',
    t: '\\t',
    e: '\\x1b',
    r: '\\r',
};

/**
 * Translates a Vim pattern into JavaScript RegExp source.
 *
 * `\zs` is rendered as a lookbehind over whatever precedes it, and `\ze` as a
 * lookahead over whatever follows, so the reported match covers the same span
 * Vim would report. A bare `\zs` (flash uses `split(s, "\\zs")` to mean "split
 * between every character") becomes an empty pattern, which is what makes
 * `String.prototype.split` produce one element per character.
 */
export function translateVimRegex(pattern: string): TranslatedRegex {
    let magic: MagicLevel = 'magic';
    let caseOverride: TranslatedRegex['caseOverride'] = null;
    let out = '';
    let zsIndex = -1;
    let zeIndex = -1;

    const isSpecialBare = (ch: string): boolean => {
        switch (magic) {
            case 'very-magic':
                return true;
            case 'magic':
                return '^$.*[]'.includes(ch);
            case 'nomagic':
                return '^$'.includes(ch);
            case 'very-nomagic':
                return false;
        }
    };

    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]!;

        if (ch === '\\') {
            const next = pattern[++i];
            if (next === undefined) {
                out += '\\\\';
                break;
            }
            switch (next) {
                case 'v':
                    magic = 'very-magic';
                    continue;
                case 'm':
                    magic = 'magic';
                    continue;
                case 'M':
                    magic = 'nomagic';
                    continue;
                case 'V':
                    magic = 'very-nomagic';
                    continue;
                case 'c':
                    caseOverride = 'ignore';
                    continue;
                case 'C':
                    caseOverride = 'match';
                    continue;
                case 'z': {
                    const kind = pattern[++i];
                    if (kind === 's') zsIndex = out.length;
                    else if (kind === 'e') zeIndex = out.length;
                    continue;
                }
                case '<':
                case '>':
                    out += '\\b';
                    continue;
                case '%':
                    // `\%(` is Vim's non-capturing group.
                    if (pattern[i + 1] === '(') {
                        out += '(?:';
                        i++;
                    }
                    continue;
                default:
                    break;
            }
            if (next in CLASS_MAP) {
                out += CLASS_MAP[next];
                continue;
            }
            // A backslashed char is special exactly when the bare one is not.
            if ('+?{}()|'.includes(next)) {
                out += magic === 'very-magic' ? escapeLiteral(next) : next;
                continue;
            }
            if ('^$.*[]'.includes(next)) {
                out += escapeLiteral(next);
                continue;
            }
            out += escapeLiteral(next);
            continue;
        }

        if (isSpecialBare(ch)) {
            out += ch;
            continue;
        }
        out += escapeLiteral(ch);
    }

    if (zeIndex >= 0) {
        out = `${out.slice(0, zeIndex)}(?=${out.slice(zeIndex)})`;
    }
    if (zsIndex > 0) {
        out = `(?<=${out.slice(0, zsIndex)})${out.slice(zsIndex)}`;
    }

    return { source: out, caseOverride };
}

/**
 * Compiles a Vim pattern to a RegExp.
 *
 * `ignorecase` supplies the default when the pattern carries neither `\c` nor
 * `\C`; an explicit flag in the pattern always wins, as in Vim.
 */
export function vimRegExp(
    pattern: string,
    options: { flags?: string; ignorecase?: boolean } = {},
): RegExp {
    const { source, caseOverride } = translateVimRegex(pattern);
    const ignore =
        caseOverride === 'ignore'
            ? true
            : caseOverride === 'match'
              ? false
              : (options.ignorecase ?? false);
    const flags = `${options.flags ?? ''}${ignore ? 'i' : ''}`;
    return new RegExp(source, flags);
}
