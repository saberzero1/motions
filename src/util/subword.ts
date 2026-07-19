const SUBWORD_RE =
    /(\d+)|([A-Z]{2,}(?=[A-Z][a-z]|\d|\b))|([A-Z]?[a-z]+)|([A-Z]+)/g;

function isWordChar(char: string | undefined): boolean {
    return !!char && /[A-Za-z0-9]/.test(char);
}

export function findSubwordBoundaries(text: string): number[] {
    const boundaries = new Set<number>();
    if (text.length > 0 && isWordChar(text[0])) {
        boundaries.add(0);
    }
    let match: RegExpExecArray | null;
    const re = new RegExp(SUBWORD_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
        boundaries.add(match.index);
    }
    return [...boundaries].sort((a, b) => a - b);
}

export function findSubwordEnds(text: string): number[] {
    const ends: number[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(SUBWORD_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
        ends.push(match.index + match[0].length);
    }
    return ends;
}
