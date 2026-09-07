import { describe, it, expect } from 'vitest';
import { translateVimRegex, vimRegExp } from '../../../src/lua/vim-regex';

const src = (p: string) => translateVimRegex(p).source;
const matches = (p: string, text: string) => vimRegExp(p).test(text);

describe('translateVimRegex — magic levels', () => {
    it('treats + ? ( ) | as literal at the default magic level', () => {
        expect(matches('a+b', 'a+b')).toBe(true);
        expect(matches('a+b', 'aab')).toBe(false);
        expect(matches('a(b)', 'a(b)')).toBe(true);
        expect(matches('a|b', 'a|b')).toBe(true);
    });

    it('makes them operators when backslashed at the default level', () => {
        expect(matches('a\\+b', 'aaab')).toBe(true);
        expect(matches('a\\|b', 'b')).toBe(true);
        expect(matches('\\(ab\\)\\+', 'abab')).toBe(true);
    });

    it('keeps . * ^ $ special at the default level', () => {
        expect(matches('a.c', 'abc')).toBe(true);
        expect(matches('ab*c', 'ac')).toBe(true);
        expect(matches('^abc$', 'abc')).toBe(true);
    });

    it('very magic (\\v) behaves closest to JavaScript', () => {
        expect(matches('\\va+b', 'aaab')).toBe(true);
        expect(matches('\\v(ab)+', 'abab')).toBe(true);
        expect(matches('\\va|b', 'b')).toBe(true);
    });

    it('very nomagic (\\V) makes everything literal', () => {
        expect(matches('\\Va.c', 'a.c')).toBe(true);
        expect(matches('\\Va.c', 'abc')).toBe(false);
        expect(matches('\\Va*', 'a*')).toBe(true);
        expect(matches('\\Valpha', 'alpha bravo')).toBe(true);
    });

    it('nomagic (\\M) keeps only ^ and $ special', () => {
        expect(matches('\\M^a.c$', 'a.c')).toBe(true);
        expect(matches('\\M^a.c$', 'abc')).toBe(false);
    });
});

describe('translateVimRegex — case flags', () => {
    it('\\c forces ignore-case anywhere in the pattern', () => {
        expect(matches('\\cALPHA', 'alpha')).toBe(true);
        expect(matches('alpha\\c', 'ALPHA')).toBe(true);
    });

    it('\\C forces match-case even when ignorecase is requested', () => {
        expect(vimRegExp('\\CALPHA', { ignorecase: true }).test('alpha')).toBe(
            false,
        );
    });

    it('falls back to the supplied ignorecase when neither flag is present', () => {
        expect(vimRegExp('ALPHA', { ignorecase: true }).test('alpha')).toBe(
            true,
        );
        expect(vimRegExp('ALPHA', { ignorecase: false }).test('alpha')).toBe(
            false,
        );
    });

    it('handles flash\\u2019s exact pattern shape', () => {
        // flash/search/pattern.lua:104 emits "\V" .. chars .. ("\c" or "\C")
        expect(matches('\\Valpha\\C', 'alpha bravo alpha')).toBe(true);
        expect(matches('\\VALPHA\\c', 'alpha bravo alpha')).toBe(true);
        expect(matches('\\VALPHA\\C', 'alpha bravo alpha')).toBe(false);
    });
});

describe('translateVimRegex — special atoms', () => {
    it('maps \\< and \\> to word boundaries', () => {
        expect(matches('\\<alpha\\>', 'an alpha here')).toBe(true);
        expect(matches('\\<alpha\\>', 'alphabet')).toBe(false);
    });

    it('maps \\%( to a non-capturing group', () => {
        expect(src('\\%(ab\\)')).toBe('(?:ab)');
        expect(matches('\\%(ab\\)\\+', 'abab')).toBe(true);
    });

    it('renders a bare \\zs as an empty pattern, for split-into-characters', () => {
        expect(src('\\zs')).toBe('');
        expect('abc'.split(vimRegExp('\\zs'))).toEqual(['a', 'b', 'c']);
    });

    it('renders a prefixed \\zs as a lookbehind', () => {
        expect(src('foo\\zsbar')).toBe('(?<=foo)bar');
        const m = vimRegExp('foo\\zsbar').exec('foobar');
        expect(m?.[0]).toBe('bar');
        expect(m?.index).toBe(3);
    });

    it('renders \\ze as a lookahead', () => {
        expect(src('foo\\zebar')).toBe('foo(?=bar)');
        expect(vimRegExp('foo\\zebar').exec('foobar')?.[0]).toBe('foo');
    });

    it('maps Vim character classes', () => {
        expect(matches('\\d\\+', '42')).toBe(true);
        expect(matches('\\u\\l\\+', 'Hello')).toBe(true);
        expect(matches('\\x\\+', 'beef')).toBe(true);
    });
});

describe('translateVimRegex — robustness', () => {
    it('escapes JavaScript metacharacters that Vim treats as literal', () => {
        expect(matches('a{2}', 'a{2}')).toBe(true);
        expect(matches('a/b', 'a/b')).toBe(true);
    });

    it('does not throw on a trailing backslash', () => {
        expect(() => vimRegExp('abc\\')).not.toThrow();
    });

    it('still rejects a genuinely malformed pattern', () => {
        expect(() => vimRegExp('\\v(unclosed')).toThrow();
    });
});
