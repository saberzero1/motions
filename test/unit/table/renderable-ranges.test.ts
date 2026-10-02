import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { findRenderableTableRanges } from '../../../src/vim/table/renderable-ranges';
import { findTableRanges } from '../../../src/vim/table-utils';
import type { EditorState } from '@codemirror/state';

/**
 * Plan B Step 1.
 *
 * `findRenderableTableRanges` exists because `findTableRanges` matches any two
 * or more contiguous `|`-leading lines with no separator-row, fence or
 * frontmatter awareness. Harmless while Obsidian's parser decides what
 * renders; a correctness hole the moment a highest-precedence block replace is
 * keyed on it.
 *
 * Several cases therefore assert the **difference** between the two functions,
 * which is stronger than asserting the new one alone: it pins the hole the new
 * function closes, and would fail if someone "simplified" it back.
 */

const doc = (...lines: string[]): Text => Text.of(lines);

/** `findTableRanges` only reads `state.doc`, so a doc-only stub suffices. */
const asState = (text: Text): EditorState =>
    ({ doc: text }) as unknown as EditorState;

const VALID_TABLE = [
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
];

describe('findRenderableTableRanges', () => {
    it('accepts a well-formed table', () => {
        const ranges = findRenderableTableRanges(doc(...VALID_TABLE));
        expect(ranges).toHaveLength(1);
        expect(ranges[0]?.lines).toEqual(VALID_TABLE);
        expect(ranges[0]?.from).toBe(0);
    });

    it('accepts a header plus separator with no data rows', () => {
        const ranges = findRenderableTableRanges(
            doc('| Name | Value |', '|------|-------|'),
        );
        expect(ranges).toHaveLength(1);
    });

    it('rejects pipe-leading lines with no separator row, which findTableRanges accepts', () => {
        const text = doc('| foo', '| bar', '| baz');

        expect(findRenderableTableRanges(text)).toHaveLength(0);
        // The difference is the point: the lax scanner claims this is a table.
        expect(findTableRanges(asState(text))).toHaveLength(1);
    });

    it('rejects a separator that is not the second line', () => {
        const ranges = findRenderableTableRanges(
            doc('| Name | Value |', '| aa   | 11    |', '|------|-------|'),
        );
        expect(ranges).toHaveLength(0);
    });

    it('rejects a table inside a fenced code block, which findTableRanges accepts', () => {
        const text = doc(
            'Prose above',
            '```md',
            ...VALID_TABLE,
            '```',
            'Prose below',
        );

        expect(findRenderableTableRanges(text)).toHaveLength(0);
        expect(findTableRanges(asState(text))).toHaveLength(1);
    });

    it('rejects a table inside a tilde fence and honours fence length', () => {
        const tilde = doc('~~~~', ...VALID_TABLE, '~~~~');
        expect(findRenderableTableRanges(tilde)).toHaveLength(0);

        // A shorter run must not close a longer fence, so the table stays
        // inside it.
        const unclosed = doc('````', ...VALID_TABLE, '```', ...VALID_TABLE);
        expect(findRenderableTableRanges(unclosed)).toHaveLength(0);
    });

    it('rejects a table inside start-of-document frontmatter', () => {
        const text = doc('---', ...VALID_TABLE, '---', 'Prose');

        expect(findRenderableTableRanges(text)).toHaveLength(0);
        expect(findTableRanges(asState(text))).toHaveLength(1);
    });

    it('does not treat a mid-document --- as frontmatter', () => {
        const ranges = findRenderableTableRanges(
            doc('Prose', '---', ...VALID_TABLE),
        );
        expect(ranges).toHaveLength(1);
    });

    it('accepts a real table after frontmatter closes', () => {
        const ranges = findRenderableTableRanges(
            doc('---', 'title: x', '---', '', ...VALID_TABLE),
        );
        expect(ranges).toHaveLength(1);
        expect(ranges[0]?.lines).toEqual(VALID_TABLE);
    });

    it('finds two tables separated by a blank line', () => {
        const ranges = findRenderableTableRanges(
            doc(...VALID_TABLE, '', ...VALID_TABLE),
        );
        expect(ranges).toHaveLength(2);
        expect(ranges[0]?.to).toBeLessThan(ranges[1]?.from ?? -1);
    });

    it('accepts a table at end of document with no trailing newline', () => {
        const text = doc('Prose', ...VALID_TABLE);
        const ranges = findRenderableTableRanges(text);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]?.to).toBe(text.length);
    });

    it('returns an empty list for a document with no table', () => {
        expect(findRenderableTableRanges(doc('just', 'prose'))).toHaveLength(0);
    });

    it('does not mistake an unclosed fence for closed', () => {
        // Fence never closes, so everything after it is inside it.
        expect(
            findRenderableTableRanges(doc('```', ...VALID_TABLE)),
        ).toHaveLength(0);
    });
});
