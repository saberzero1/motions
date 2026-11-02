import { matchesPinyinInitialCodePoint } from './pinyin-initials';

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
): boolean {
    if (text[index] === target) return true;
    if (!enablePinyin || !isAsciiLetter(target)) return false;

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) return false;
    return matchesPinyinInitialCodePoint(codePoint, target);
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
