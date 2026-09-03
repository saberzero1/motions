const SUBWORD_RE =
    /(\p{N}+)|(\p{Lu}{2,}(?=\p{Lu}\p{Ll}|\p{N}|\b))|(\p{Lu}?\p{Ll}+)|(\p{Lu}+)|([\p{L}\p{M}]+)/gu;

function isWordChar(char: string | undefined): boolean {
    return !!char && /[\p{L}\p{M}\p{N}]/u.test(char);
}

export function findSubwordBoundaries(text: string): number[] {
    const boundaries = new Set<number>();
    if (text.length > 0 && isWordChar(text[0])) {
        boundaries.add(0);
    }
    let match: RegExpExecArray | null;
    const re = new RegExp(SUBWORD_RE.source, SUBWORD_RE.flags);
    while ((match = re.exec(text)) !== null) {
        boundaries.add(match.index);
    }
    return [...boundaries].sort((a, b) => a - b);
}

export function findSubwordEnds(text: string): number[] {
    const ends: number[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(SUBWORD_RE.source, SUBWORD_RE.flags);
    while ((match = re.exec(text)) !== null) {
        ends.push(match.index + match[0].length);
    }
    return ends;
}
