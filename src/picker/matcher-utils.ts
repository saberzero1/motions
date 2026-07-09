import type { PickerItem } from './types';

export function indicesToRanges(indices: number[]): [number, number][] {
    if (indices.length === 0) return [];
    const ranges: [number, number][] = [];
    let start = indices[0]!;
    let end = start + 1;
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === end) {
            end++;
        } else {
            ranges.push([start, end]);
            start = indices[i]!;
            end = start + 1;
        }
    }
    ranges.push([start, end]);
    return ranges;
}

export function utf32ToUtf16Indices(
    text: string,
    utf32Indices: number[],
): number[] {
    const result: number[] = [];
    let utf16Pos = 0;
    let utf32Pos = 0;
    let indexPtr = 0;
    while (indexPtr < utf32Indices.length && utf16Pos < text.length) {
        if (utf32Pos === utf32Indices[indexPtr]) {
            result.push(utf16Pos);
            indexPtr++;
        }
        const code = text.charCodeAt(utf16Pos);
        utf16Pos += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
        utf32Pos++;
    }
    return result;
}

export function toPairs(ranges: number[]): [number, number][] {
    const pairs: [number, number][] = [];
    for (let i = 0; i < ranges.length; i += 2) {
        const start = ranges[i];
        const end = ranges[i + 1];
        if (start === undefined || end === undefined) break;
        pairs.push([start, end]);
    }
    return pairs;
}

export function mapRangesToSegment(
    ranges: [number, number][],
    start: number,
    end: number,
): [number, number][] {
    const result: [number, number][] = [];
    for (const [rangeStart, rangeEnd] of ranges) {
        if (rangeEnd <= start || rangeStart >= end) continue;
        const clampedStart = Math.max(rangeStart, start) - start;
        const clampedEnd = Math.min(rangeEnd, end) - start;
        if (clampedEnd > clampedStart) {
            result.push([clampedStart, clampedEnd]);
        }
    }
    return result;
}

export function buildHighlights(
    item: PickerItem,
    ranges: [number, number][],
): { label: [number, number][]; desc: [number, number][] } {
    const label = item.label;
    const description = item.description ?? '';
    const base = item.filterValue ?? `${label} ${description}`;
    const labelStart = 0;
    const labelEnd = label.length;
    const descStart = description ? base.indexOf(description, labelEnd) : -1;
    const descEnd = descStart >= 0 ? descStart + description.length : descStart;

    const labelHighlights = mapRangesToSegment(ranges, labelStart, labelEnd);
    const descHighlights =
        descStart >= 0 ? mapRangesToSegment(ranges, descStart, descEnd) : [];

    return { label: labelHighlights, desc: descHighlights };
}

export function buildHaystack(item: PickerItem): string {
    return item.filterValue ?? `${item.label} ${item.description ?? ''}`;
}
