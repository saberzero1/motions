export interface DialRule {
    name: string;
    /** Find a matchable pattern at/near the cursor position on the line. */
    find(line: string, cursorCh: number): DialMatch | null;
    /** Apply increment/decrement and return the replacement text. */
    apply(match: DialMatch, direction: 1 | -1, count: number): string;
}

export interface DialMatch {
    start: number; // char offset in line (inclusive)
    end: number; // char offset in line (exclusive)
    text: string; // the matched text
    component?: number; // sub-component index (for hex, dates)
}

function findMatchContaining(
    pattern: RegExp,
    line: string,
    cursorCh: number,
): DialMatch | null {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
        const start = match.index;
        const end = start + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
            return { start, end, text: match[0] };
        }
    }
    return null;
}

function findMatchContainingOrAfter(
    pattern: RegExp,
    line: string,
    cursorCh: number,
): DialMatch | null {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let firstAfter: DialMatch | null = null;
    while ((match = pattern.exec(line))) {
        const start = match.index;
        const end = start + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
            return { start, end, text: match[0] };
        }
        if (!firstAfter && start >= cursorCh) {
            firstAfter = { start, end, text: match[0] };
        }
    }
    return firstAfter;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function applyCaseStyle(original: string, replacementLower: string): string {
    if (original.toUpperCase() === original) {
        return replacementLower.toUpperCase();
    }
    const title =
        original.charAt(0).toUpperCase() + original.slice(1).toLowerCase();
    if (title === original) {
        return (
            replacementLower.charAt(0).toUpperCase() + replacementLower.slice(1)
        );
    }
    return replacementLower;
}

const checkboxRule: DialRule = {
    name: 'markdown-checkbox',
    find(line, cursorCh) {
        return findMatchContainingOrAfter(/\[[ x]\]/g, line, cursorCh);
    },
    apply(match) {
        return match.text.includes('x') ? '[ ]' : '[x]';
    },
};

const BOOLEAN_MAP = new Map<string, string>([
    ['true', 'false'],
    ['false', 'true'],
    ['yes', 'no'],
    ['no', 'yes'],
    ['on', 'off'],
    ['off', 'on'],
]);

const booleanRule: DialRule = {
    name: 'boolean',
    find(line, cursorCh) {
        return findMatchContainingOrAfter(
            /\b(?:true|false|yes|no|on|off)\b/gi,
            line,
            cursorCh,
        );
    },
    apply(match) {
        const lower = match.text.toLowerCase();
        const replacement = BOOLEAN_MAP.get(lower);
        if (!replacement) return match.text;
        return applyCaseStyle(match.text, replacement);
    },
};

const hexColorRule: DialRule = {
    name: 'hex-color',
    find(line, cursorCh) {
        const match = findMatchContaining(/#[0-9a-fA-F]{6}\b/g, line, cursorCh);
        if (!match) return null;
        const offset = cursorCh - match.start;
        const component = offset <= 2 ? 0 : offset <= 4 ? 1 : 2;
        return { ...match, component };
    },
    apply(match, direction, count) {
        const hex = match.text.slice(1);
        const component = match.component ?? 0;
        const start = component * 2;
        const current = hex.slice(start, start + 2);
        const value = parseInt(current, 16);
        const next = clamp(value + direction * count, 0, 255);
        const hasLower = /[a-f]/.test(current);
        const nextHex = next.toString(16).padStart(2, '0');
        const formatted = hasLower
            ? nextHex.toLowerCase()
            : nextHex.toUpperCase();
        const updated = hex.slice(0, start) + formatted + hex.slice(start + 2);
        return `#${updated}`;
    },
};

const dateRule: DialRule = {
    name: 'date',
    find(line, cursorCh) {
        const match = findMatchContaining(/\d{4}-\d{2}-\d{2}/g, line, cursorCh);
        if (!match) return null;
        const offset = cursorCh - match.start;
        const component = offset <= 3 ? 0 : offset <= 6 ? 1 : 2;
        return { ...match, component };
    },
    apply(match, direction, count) {
        const [yearStr, monthStr, dayStr] = match.text.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);
        const date = new Date(Date.UTC(year, month - 1, day));
        const delta = direction * count;
        if (match.component === 0) {
            date.setUTCFullYear(date.getUTCFullYear() + delta);
        } else if (match.component === 1) {
            date.setUTCMonth(date.getUTCMonth() + delta);
        } else {
            date.setUTCDate(date.getUTCDate() + delta);
        }
        const nextYear = String(date.getUTCFullYear()).padStart(4, '0');
        const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
        const nextDay = String(date.getUTCDate()).padStart(2, '0');
        return `${nextYear}-${nextMonth}-${nextDay}`;
    },
};

const cssValueRule: DialRule = {
    name: 'css-value',
    find(line, cursorCh) {
        return findMatchContaining(
            /-?\d+(?:\.\d+)?(px|em|rem|%|vh|vw|pt|cm|mm|in|ch|ex|vmin|vmax)\b/g,
            line,
            cursorCh,
        );
    },
    apply(match, direction, count) {
        const parsed = match.text.match(
            /^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|pt|cm|mm|in|ch|ex|vmin|vmax)$/,
        );
        if (!parsed?.[1] || !parsed?.[2]) return match.text;
        const valueText = parsed[1];
        const unit = parsed[2];
        const decimalIndex = valueText.indexOf('.');
        const decimalPlaces =
            decimalIndex === -1 ? 0 : valueText.length - decimalIndex - 1;
        let nextValue = parseFloat(valueText) + direction * count;
        if (Object.is(nextValue, -0)) nextValue = 0;
        const formatted =
            decimalPlaces > 0
                ? nextValue.toFixed(decimalPlaces)
                : String(nextValue);
        return `${formatted}${unit}`;
    },
};

const integerRule: DialRule = {
    name: 'integer',
    find(line, cursorCh) {
        return findMatchContainingOrAfter(/-?\d+/g, line, cursorCh);
    },
    apply(match, direction, count) {
        const value = Number(match.text);
        const next = value + direction * count;
        return String(next);
    },
};

export const DIAL_RULES: DialRule[] = [
    checkboxRule,
    booleanRule,
    hexColorRule,
    dateRule,
    cssValueRule,
    integerRule,
];
