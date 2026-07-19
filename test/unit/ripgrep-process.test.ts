import { describe, it, expect } from 'vitest';
import {
    parseRipgrepOutput,
    parseGrepOutput,
    buildArgs,
    isFatalExecError,
} from '../../src/picker/sources/ripgrep-process';
import type { RipgrepConfig } from '../../src/picker/sources/ripgrep-process';

function makeRgMatchLine(
    path: string,
    lineNumber: number,
    text: string,
): string {
    return JSON.stringify({
        type: 'match',
        data: {
            path: { text: path },
            line_number: lineNumber,
            lines: { text: text },
        },
    });
}

function makeRgLine(type: string): string {
    return JSON.stringify({ type, data: {} });
}

describe('parseRipgrepOutput', () => {
    it('parses a single valid match line', () => {
        const input = makeRgMatchLine('file.md', 10, 'hello\n');
        const results = parseRipgrepOutput(input, 100);
        expect(results).toEqual([
            { path: 'file.md', lineNumber: 10, lineText: 'hello' },
        ]);
    });

    it('parses 3 match lines', () => {
        const lines = [
            makeRgMatchLine('a.md', 1, 'first\n'),
            makeRgMatchLine('b.md', 2, 'second\n'),
            makeRgMatchLine('c.md', 3, 'third\n'),
        ].join('\n');
        const results = parseRipgrepOutput(lines, 100);
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({
            path: 'a.md',
            lineNumber: 1,
            lineText: 'first',
        });
        expect(results[2]).toEqual({
            path: 'c.md',
            lineNumber: 3,
            lineText: 'third',
        });
    });

    it('only returns "match" type entries', () => {
        const lines = [
            makeRgLine('begin'),
            makeRgMatchLine('file.md', 5, 'content\n'),
            makeRgLine('end'),
            makeRgLine('summary'),
        ].join('\n');
        const results = parseRipgrepOutput(lines, 100);
        expect(results).toHaveLength(1);
        expect(results[0]!.path).toBe('file.md');
    });

    it('caps results at maxResults', () => {
        const lines = Array.from({ length: 50 }, (_, i) =>
            makeRgMatchLine(`file${i}.md`, i + 1, `line ${i}\n`),
        ).join('\n');
        const results = parseRipgrepOutput(lines, 10);
        expect(results).toHaveLength(10);
    });

    it('skips invalid JSON and parses valid lines', () => {
        const lines = [
            'not valid json at all',
            makeRgMatchLine('good.md', 1, 'valid\n'),
            '{broken json',
            makeRgMatchLine('also-good.md', 2, 'also valid\n'),
        ].join('\n');
        const results = parseRipgrepOutput(lines, 100);
        expect(results).toHaveLength(2);
        expect(results[0]!.path).toBe('good.md');
        expect(results[1]!.path).toBe('also-good.md');
    });

    it('returns empty array for empty string', () => {
        expect(parseRipgrepOutput('', 100)).toEqual([]);
    });

    it('trims trailing whitespace from lineText', () => {
        const input = makeRgMatchLine('file.md', 1, 'content   \n');
        const results = parseRipgrepOutput(input, 100);
        expect(results[0]!.lineText).toBe('content');
    });
});

describe('parseGrepOutput', () => {
    it('parses standard grep format', () => {
        const input = 'file.ts:10:hello world\n';
        const results = parseGrepOutput(input, 100);
        expect(results).toEqual([
            { path: 'file.ts', lineNumber: 10, lineText: 'hello world' },
        ]);
    });

    it('handles paths containing colons', () => {
        const input = 'path/with:colon.ts:5:content\n';
        const results = parseGrepOutput(input, 100);
        expect(results).toEqual([
            { path: 'path/with:colon.ts', lineNumber: 5, lineText: 'content' },
        ]);
    });

    it('caps results at maxResults', () => {
        const lines = Array.from(
            { length: 20 },
            (_, i) => `file${i}.ts:${i + 1}:line ${i}`,
        ).join('\n');
        const results = parseGrepOutput(lines, 5);
        expect(results).toHaveLength(5);
    });

    it('skips empty lines', () => {
        const input = 'a.ts:1:first\n\n\nb.ts:2:second\n';
        const results = parseGrepOutput(input, 100);
        expect(results).toHaveLength(2);
    });

    it('skips lines not matching file:num:content format', () => {
        const input = [
            'file.ts:10:valid',
            'no-match-here',
            'also:not:a:number:line',
            'good.ts:3:also valid',
        ].join('\n');
        const results = parseGrepOutput(input, 100);
        expect(results).toHaveLength(2);
        expect(results[0]!.path).toBe('file.ts');
        expect(results[1]!.path).toBe('good.ts');
    });
});

describe('buildArgs', () => {
    it('builds ripgrep args with defaults', () => {
        const config: RipgrepConfig = {
            mode: 'ripgrep',
            args: [],
            binary: '',
            timeoutMs: 0,
        };
        const result = buildArgs(config, 'search');
        expect(result).toEqual([
            '--json',
            '--max-count',
            '100',
            '--',
            'search',
            '.',
        ]);
    });

    it('builds grep args with defaults', () => {
        const config: RipgrepConfig = {
            mode: 'grep',
            args: [],
            binary: '',
            timeoutMs: 0,
        };
        const result = buildArgs(config, 'search');
        expect(result).toEqual(['-rn', '--', 'search', '.']);
    });

    it('includes user args for ripgrep mode', () => {
        const config: RipgrepConfig = {
            mode: 'ripgrep',
            args: ['--hidden'],
            binary: '',
            timeoutMs: 0,
        };
        const result = buildArgs(config, 'pat');
        expect(result).toEqual([
            '--json',
            '--max-count',
            '100',
            '--hidden',
            '--',
            'pat',
            '.',
        ]);
    });

    it('includes user args for grep mode', () => {
        const config: RipgrepConfig = {
            mode: 'grep',
            args: ['-i'],
            binary: '',
            timeoutMs: 0,
        };
        const result = buildArgs(config, 'pat');
        expect(result).toEqual(['-rn', '-i', '--', 'pat', '.']);
    });
});

describe('isFatalExecError', () => {
    it('returns true for ENOENT code', () => {
        expect(isFatalExecError({ code: 'ENOENT' })).toBe(true);
    });

    it('returns true when signal is present', () => {
        expect(isFatalExecError({ signal: 'SIGTERM' })).toBe(true);
    });

    it('returns false for numeric exit code 1', () => {
        expect(isFatalExecError({ code: 1 })).toBe(false);
    });

    it('returns false for numeric code 2 with null signal', () => {
        expect(isFatalExecError({ code: 2, signal: null })).toBe(false);
    });

    it('returns false for empty error object', () => {
        expect(isFatalExecError({})).toBe(false);
    });
});
