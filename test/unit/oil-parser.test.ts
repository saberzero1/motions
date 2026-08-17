import { describe, expect, it } from 'vitest';
import { parseBufferLines } from '../../src/oil/parser';

describe('Oil parser — parseBufferLines', () => {
    it('parses a standard Oil line with id, type, and name', () => {
        const result = parseBufferLines('/1 f notes.md');
        expect(result).toEqual([{ id: 1, type: 'f', name: 'notes.md' }]);
    });

    it('parses directory type', () => {
        const result = parseBufferLines('/2 d subdir');
        expect(result).toEqual([{ id: 2, type: 'd', name: 'subdir' }]);
    });

    it('parses multiple lines', () => {
        const result = parseBufferLines(
            '/1 f file.md\n/2 d folder\n/3 f other.txt',
        );
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ id: 1, type: 'f', name: 'file.md' });
        expect(result[1]).toEqual({ id: 2, type: 'd', name: 'folder' });
        expect(result[2]).toEqual({ id: 3, type: 'f', name: 'other.txt' });
    });

    it('skips empty lines', () => {
        const result = parseBufferLines('/1 f file.md\n\n\n/2 d dir');
        expect(result).toHaveLength(2);
    });

    it('strips trailing whitespace from names', () => {
        const result = parseBufferLines('/1 f name.md   ');
        expect(result[0]?.name).toBe('name.md');
    });

    it('handles Windows line endings', () => {
        const result = parseBufferLines('/1 f file.md\r\n/2 d dir\r\n');
        expect(result).toHaveLength(2);
        expect(result[0]?.name).toBe('file.md');
    });

    it('parses new file line (no id) as create with id=0', () => {
        const result = parseBufferLines('newfile.md');
        expect(result).toEqual([{ id: 0, type: 'f', name: 'newfile.md' }]);
    });

    it('parses new directory (trailing slash) as create with id=0', () => {
        const result = parseBufferLines('newdir/');
        expect(result).toEqual([{ id: 0, type: 'd', name: 'newdir' }]);
    });

    it('appends .md to new files without extension', () => {
        const result = parseBufferLines('untitled');
        expect(result[0]?.name).toBe('untitled.md');
    });

    it('does not append .md to files that already have an extension', () => {
        const result = parseBufferLines('readme.txt');
        expect(result[0]?.name).toBe('readme.txt');
    });

    it('handles large ids', () => {
        const result = parseBufferLines('/999999 f big-id.md');
        expect(result[0]?.id).toBe(999999);
    });

    it('returns empty array for empty input', () => {
        expect(parseBufferLines('')).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
        expect(parseBufferLines('   \n  \n   ')).toEqual([]);
    });

    it('handles names with spaces', () => {
        const result = parseBufferLines('/1 f my document.md');
        expect(result[0]?.name).toBe('my document.md');
    });

    it('handles mixed existing and new entries', () => {
        const text = '/1 f existing.md\nnewfile\n/2 d existdir';
        const result = parseBufferLines(text);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ id: 1, type: 'f', name: 'existing.md' });
        expect(result[1]).toEqual({ id: 0, type: 'f', name: 'newfile.md' });
        expect(result[2]).toEqual({ id: 2, type: 'd', name: 'existdir' });
    });
});
