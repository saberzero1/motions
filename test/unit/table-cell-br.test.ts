import { describe, it, expect } from 'vitest';
import { cellBrToNewline, cellNewlineToBr } from '../../src/vim/table-utils';

describe('cellBrToNewline', () => {
    it('converts <br> to newline', () => {
        expect(cellBrToNewline('line1<br>line2')).toBe('line1\nline2');
    });

    it('converts <br/> to newline', () => {
        expect(cellBrToNewline('line1<br/>line2')).toBe('line1\nline2');
    });

    it('converts <br /> with space to newline', () => {
        expect(cellBrToNewline('line1<br />line2')).toBe('line1\nline2');
    });

    it('is case-insensitive', () => {
        expect(cellBrToNewline('a<BR>b<Br>c<bR/>d')).toBe('a\nb\nc\nd');
    });

    it('handles multiple <br> tags', () => {
        expect(cellBrToNewline('a<br>b<br>c')).toBe('a\nb\nc');
    });

    it('returns text unchanged when no <br> present', () => {
        expect(cellBrToNewline('no breaks here')).toBe('no breaks here');
    });

    it('handles empty string', () => {
        expect(cellBrToNewline('')).toBe('');
    });
});

describe('cellNewlineToBr', () => {
    it('converts newline to <br>', () => {
        expect(cellNewlineToBr('line1\nline2')).toBe('line1<br>line2');
    });

    it('converts multiple newlines', () => {
        expect(cellNewlineToBr('a\nb\nc')).toBe('a<br>b<br>c');
    });

    it('returns text unchanged when no newlines present', () => {
        expect(cellNewlineToBr('no newlines')).toBe('no newlines');
    });

    it('handles empty string', () => {
        expect(cellNewlineToBr('')).toBe('');
    });
});

describe('round-trip', () => {
    it('newline → br → newline preserves content', () => {
        const original = 'line1\nline2\nline3';
        expect(cellBrToNewline(cellNewlineToBr(original))).toBe(original);
    });

    it('br → newline → br preserves content', () => {
        const original = 'line1<br>line2<br>line3';
        expect(cellNewlineToBr(cellBrToNewline(original))).toBe(original);
    });

    it('mixed content with markdown survives round-trip', () => {
        const original = '**bold**\nand `code`\n*italic*';
        const asBr = cellNewlineToBr(original);
        expect(asBr).toBe('**bold**<br>and `code`<br>*italic*');
        expect(cellBrToNewline(asBr)).toBe(original);
    });
});
