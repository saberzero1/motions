import {
    isCjkCharacter,
    matchesPinyinInitialCodePoint,
} from './pinyin-initials';

function isAsciiLetter(target: string): boolean {
    if (target.length !== 1) return false;
    const code = target.charCodeAt(0);
    return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

export function matchesFlashCharacterAt(
    text: string,
    index: number,
    target: string,
    enablePinyin: boolean,
    ignoreCase = false,
): boolean {
    if (text[index] === target) return true;
    if (
        ignoreCase &&
        isAsciiLetter(target) &&
        text[index] !== undefined &&
        text[index].toLowerCase() === target.toLowerCase()
    ) {
        return true;
    }
    if (!enablePinyin || !isAsciiLetter(target)) return false;

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) return false;
    return matchesPinyinInitialCodePoint(codePoint, target);
}

export interface FlashPatternMatch {
    index: number;
    length: number;
}

/**
 * Returns whether a search pattern is eligible for Flash's pinyin matching.
 * Patterns outside this small shape remain ordinary Vim regular expressions.
 */
export function isFlashPinyinPattern(pattern: string): boolean {
    const characters = [...pattern];
    return (
        characters.length > 0 &&
        characters.length <= 4 &&
        characters.every((character) => {
            if (isAsciiLetter(character)) return true;
            const codePoint = character.codePointAt(0);
            return codePoint !== undefined && isCjkCharacter(codePoint);
        })
    );
}

/** Finds contiguous Flash search matches, preserving UTF-16 document offsets. */
export function findFlashPatternMatches(
    text: string,
    pattern: string,
    ignoreCase = false,
): FlashPatternMatch[] | null {
    if (!isFlashPinyinPattern(pattern)) return null;

    const targets = [...pattern];
    const matches: FlashPatternMatch[] = [];
    for (let index = 0; index < text.length;) {
        let cursor = index;
        let matched = true;
        for (const target of targets) {
            if (
                !matchesFlashCharacterAt(text, cursor, target, true, ignoreCase)
            ) {
                matched = false;
                break;
            }
            const codePoint = text.codePointAt(cursor)!;
            cursor += codePoint > 0xffff ? 2 : 1;
        }
        if (matched) matches.push({ index, length: cursor - index });

        const codePoint = text.codePointAt(index)!;
        index += codePoint > 0xffff ? 2 : 1;
    }
    return matches;
}

/** Finds character positions while preserving CodeMirror's UTF-16 columns. */
export function findFlashCharacterPositions(
    text: string,
    start: number,
    target: string,
    forward: boolean,
    enablePinyin: boolean,
): number[] {
    if (!enablePinyin || !isAsciiLetter(target)) {
        const positions: number[] = [];
        if (forward) {
            let index = text.indexOf(target, start + 1);
            while (index !== -1) {
                positions.push(index);
                index = text.indexOf(target, index + 1);
            }
        } else {
            let index = text.lastIndexOf(target, start - 1);
            while (index !== -1) {
                positions.push(index);
                index = text.lastIndexOf(target, index - 1);
            }
        }
        return positions;
    }

    const positions: number[] = [];
    if (forward) {
        let index = Math.max(0, start + 1);
        while (index < text.length) {
            if (matchesFlashCharacterAt(text, index, target, true)) {
                positions.push(index);
            }
            const codePoint = text.codePointAt(index)!;
            index += codePoint > 0xffff ? 2 : 1;
        }
        return positions;
    }

    let index = 0;
    const end = Math.min(text.length, Math.max(0, start));
    while (index < end) {
        if (matchesFlashCharacterAt(text, index, target, true)) {
            positions.push(index);
        }
        const codePoint = text.codePointAt(index)!;
        index += codePoint > 0xffff ? 2 : 1;
    }
    positions.reverse();
    return positions;
}
