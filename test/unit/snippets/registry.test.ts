import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SnippetRegistry } from '../../../src/snippets/registry';
import type { SnippetFile } from '../../../src/snippets/types';

const BUNDLED_OBSIDIAN_MARKDOWN: SnippetFile = JSON.parse(
    readFileSync(
        resolve(
            __dirname,
            '../../../src/snippets/bundled/obsidian-markdown.json',
        ),
        'utf-8',
    ),
);

function makeFile(
    entries: Record<
        string,
        {
            prefix: string | string[];
            body: string | string[];
            description?: string;
        }
    >,
): SnippetFile {
    return entries as SnippetFile;
}

describe('SnippetRegistry', () => {
    describe('basic loading', () => {
        it('loads entries and indexes by prefix', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({ Greeting: { prefix: 'hi', body: 'hello $0' } }),
                'bundled',
            );

            expect(registry.getAll()).toHaveLength(1);
            expect(registry.lookupByPrefix('hi')).toHaveLength(1);
            expect(registry.lookupByPrefix('hi')[0]!.name).toBe('Greeting');
        });

        it('supports multiple prefixes on a single entry', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    Greeting: { prefix: ['hi', 'hello'], body: 'hey' },
                }),
                'bundled',
            );

            expect(registry.lookupByPrefix('hi')).toHaveLength(1);
            expect(registry.lookupByPrefix('hello')).toHaveLength(1);
            expect(registry.lookupByPrefix('hi')[0]!.id).toBe(
                registry.lookupByPrefix('hello')[0]!.id,
            );
        });
    });

    describe('override semantics', () => {
        it('user overrides bundled with same prefix', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    'Built-in Table': { prefix: 'table', body: 'bundled' },
                }),
                'bundled',
            );
            registry.loadFile(
                makeFile({ 'My Table': { prefix: 'table', body: 'custom' } }),
                'user',
            );

            const byPrefix = registry.lookupByPrefix('table');
            expect(byPrefix).toHaveLength(1);
            expect(byPrefix[0]!.source).toBe('user');
            expect(byPrefix[0]!.name).toBe('My Table');

            const all = registry.getAll();
            expect(all).toHaveLength(1);
            expect(all[0]!.source).toBe('user');
        });

        it('lua overrides bundled with same prefix', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({ 'Built-in': { prefix: 'x', body: 'old' } }),
                'bundled',
            );
            registry.loadFile(
                makeFile({ 'Lua version': { prefix: 'x', body: 'new' } }),
                'lua',
            );

            const byPrefix = registry.lookupByPrefix('x');
            expect(byPrefix).toHaveLength(1);
            expect(byPrefix[0]!.source).toBe('lua');

            expect(registry.getAll()).toHaveLength(1);
        });

        it('user overrides lua with same prefix', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({ 'Lua ver': { prefix: 'snip', body: 'lua-body' } }),
                'lua',
            );
            registry.loadFile(
                makeFile({ 'User ver': { prefix: 'snip', body: 'user-body' } }),
                'user',
            );

            const byPrefix = registry.lookupByPrefix('snip');
            expect(byPrefix).toHaveLength(1);
            expect(byPrefix[0]!.source).toBe('user');

            expect(registry.getAll()).toHaveLength(1);
        });

        it('full priority chain: user > lua > bundled', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({ Bundled: { prefix: 'p', body: 'b' } }),
                'bundled',
            );
            registry.loadFile(
                makeFile({ Lua: { prefix: 'p', body: 'l' } }),
                'lua',
            );
            registry.loadFile(
                makeFile({ User: { prefix: 'p', body: 'u' } }),
                'user',
            );

            const byPrefix = registry.lookupByPrefix('p');
            expect(byPrefix).toHaveLength(1);
            expect(byPrefix[0]!.source).toBe('user');
            expect(byPrefix[0]!.name).toBe('User');

            expect(registry.getAll()).toHaveLength(1);
        });

        it('same-priority entries coexist', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    'User A': { prefix: 'tag', body: 'a' },
                    'User B': { prefix: 'tag', body: 'b' },
                }),
                'user',
            );

            expect(registry.lookupByPrefix('tag')).toHaveLength(2);
            expect(registry.getAll()).toHaveLength(2);
        });
    });

    describe('multi-prefix partial overlap', () => {
        it('removes bundled from overlapping prefix but keeps it for non-overlapping prefix', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    'Bundled Multi': { prefix: ['a', 'b'], body: 'bundled' },
                }),
                'bundled',
            );
            registry.loadFile(
                makeFile({ 'User A': { prefix: 'a', body: 'user' } }),
                'user',
            );

            const prefixA = registry.lookupByPrefix('a');
            expect(prefixA).toHaveLength(1);
            expect(prefixA[0]!.source).toBe('user');

            const prefixB = registry.lookupByPrefix('b');
            expect(prefixB).toHaveLength(1);
            expect(prefixB[0]!.source).toBe('bundled');

            const all = registry.getAll();
            expect(all).toHaveLength(2);
            expect(all.map((e) => e.source).sort()).toEqual([
                'bundled',
                'user',
            ]);
        });

        it('removes bundled from entries when all its prefixes are overridden', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    'Bundled Multi': { prefix: ['a', 'b'], body: 'bundled' },
                }),
                'bundled',
            );
            registry.loadFile(
                makeFile({
                    'User A': { prefix: 'a', body: 'ua' },
                    'User B': { prefix: 'b', body: 'ub' },
                }),
                'user',
            );

            expect(registry.lookupByPrefix('a')).toHaveLength(1);
            expect(registry.lookupByPrefix('b')).toHaveLength(1);

            const all = registry.getAll();
            expect(all.every((e) => e.source === 'user')).toBe(true);
            expect(all).toHaveLength(2);
        });
    });

    describe('no collision', () => {
        it('different prefixes coexist across sources', () => {
            const registry = new SnippetRegistry();
            registry.loadFile(
                makeFile({
                    'Built-in Table': { prefix: 'table', body: 'bundled' },
                }),
                'bundled',
            );
            registry.loadFile(
                makeFile({ 'My Custom': { prefix: 'tbl', body: 'custom' } }),
                'user',
            );

            expect(registry.lookupByPrefix('table')).toHaveLength(1);
            expect(registry.lookupByPrefix('table')[0]!.source).toBe('bundled');
            expect(registry.lookupByPrefix('tbl')).toHaveLength(1);
            expect(registry.lookupByPrefix('tbl')[0]!.source).toBe('user');
            expect(registry.getAll()).toHaveLength(2);
        });
    });

    describe('bundled table snippets', () => {
        it('Table 2x2 body has standalone $0 as last element', () => {
            const def = BUNDLED_OBSIDIAN_MARKDOWN['Table 2x2']!;
            const body = def.body as string[];
            expect(Array.isArray(body)).toBe(true);
            expect(body[body.length - 1]).toBe('$0');
            expect(body[body.length - 2]).not.toContain('$0');
        });

        it('Table 3x3 body has standalone $0 as last element', () => {
            const def = BUNDLED_OBSIDIAN_MARKDOWN['Table 3x3']!;
            const body = def.body as string[];
            expect(Array.isArray(body)).toBe(true);
            expect(body[body.length - 1]).toBe('$0');
            expect(body[body.length - 2]).not.toContain('$0');
        });
    });
});
