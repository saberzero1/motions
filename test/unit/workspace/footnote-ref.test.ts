import { describe, expect, it } from 'vitest';
import { findFootnoteRefAtCursor } from '../../../src/workspace/navigation';

/** `K` previews the footnote under the cursor (#209). */
describe('findFootnoteRefAtCursor', () => {
    const line = 'Some text[^1] and[^note] here.';

    it('finds the reference the cursor is on, at either end', () => {
        expect(findFootnoteRefAtCursor(line, line.indexOf('[^1]'))).toBe('1');
        expect(findFootnoteRefAtCursor(line, line.indexOf('[^1]') + 3)).toBe(
            '1',
        );
        expect(findFootnoteRefAtCursor(line, line.indexOf('note'))).toBe(
            'note',
        );
    });

    it('finds nothing beside a reference', () => {
        expect(findFootnoteRefAtCursor(line, line.indexOf('[^1]') - 1)).toBe(
            null,
        );
        expect(findFootnoteRefAtCursor(line, line.indexOf('[^1]') + 4)).toBe(
            null,
        );
    });

    it('treats [^id]: at the start of a line as the definition', () => {
        expect(findFootnoteRefAtCursor('[^1]: The body', 1)).toBe(null);
        expect(findFootnoteRefAtCursor('See [^1]: inline', 5)).toBe('1');
    });
});
