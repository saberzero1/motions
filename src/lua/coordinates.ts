const COMBINING_CHAR = /\p{Mn}|\p{Me}/u;

function utf8Size(codePoint: number): number {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
}

interface CharSpan {
    byteStart: number;
    byteEnd: number;
    utf16Start: number;
    utf16End: number;
}

/**
 * Maps each Vim "character" to its UTF-8 byte and host UTF-16 ranges.
 * charidx()/byteidx() fold composing marks into the preceding base character
 * unless countComposing is set, so a span may cover several code points.
 */
export function buildCharSpans(
    text: string,
    countComposing: boolean,
): CharSpan[] {
    const spans: CharSpan[] = [];
    let byte = 0;
    let utf16 = 0;
    for (const ch of text) {
        const size = utf8Size(ch.codePointAt(0) ?? 0);
        const previous = spans[spans.length - 1];
        if (!countComposing && previous && COMBINING_CHAR.test(ch)) {
            previous.byteEnd = byte + size;
            previous.utf16End = utf16 + ch.length;
        } else {
            spans.push({
                byteStart: byte,
                byteEnd: byte + size,
                utf16Start: utf16,
                utf16End: utf16 + ch.length,
            });
        }
        byte += size;
        utf16 += ch.length;
    }
    return spans;
}

export function utf8Length(text: string): number {
    let total = 0;
    for (const ch of text) total += utf8Size(ch.codePointAt(0) ?? 0);
    return total;
}
