import { describe, expect, it, vi } from 'vitest';
import {
    discoverHiddenEntries,
    getParentPath,
    isInConfigDir,
} from '../../src/oil/render';
import type { App } from 'obsidian';

describe('getParentPath', () => {
    it('returns parent for nested path', () => {
        expect(getParentPath('a/b/c.md')).toBe('a/b');
    });

    it('returns parent for single-level path', () => {
        expect(getParentPath('folder/file.md')).toBe('folder');
    });

    it('returns empty string for root-level path', () => {
        expect(getParentPath('file.md')).toBe('');
    });

    it('returns empty string for path without slash', () => {
        expect(getParentPath('readme')).toBe('');
    });
});

describe('isInConfigDir', () => {
    it('matches exact config dir', () => {
        expect(isInConfigDir('.obsidian', '.obsidian')).toBe(true);
    });

    it('matches nested config path', () => {
        expect(isInConfigDir('.obsidian/plugins/foo', '.obsidian')).toBe(true);
    });

    it('rejects unrelated path', () => {
        expect(isInConfigDir('notes/file.md', '.obsidian')).toBe(false);
    });

    it('rejects path that starts with config dir name but is not inside it', () => {
        expect(isInConfigDir('.obsidian-backup/data', '.obsidian')).toBe(false);
    });
});

function createMockApp(opts: {
    indexedFiles?: { path: string; name: string }[];
    indexedFolders?: { path: string; name: string }[];
    adapterFiles?: string[];
    adapterFolders?: string[];
    adapterError?: boolean;
}): App {
    return {
        vault: {
            configDir: '.obsidian',
            getFiles: () =>
                (opts.indexedFiles ?? []).map((f) => ({
                    path: f.path,
                    name: f.name,
                    stat: { mtime: 0, ctime: 0, size: 0 },
                })),
            getAllFolders: () =>
                (opts.indexedFolders ?? []).map((f) => ({
                    path: f.path,
                    name: f.name,
                })),
            adapter: {
                list: opts.adapterError
                    ? vi.fn().mockRejectedValue(new Error('access denied'))
                    : vi.fn().mockResolvedValue({
                          files: opts.adapterFiles ?? [],
                          folders: opts.adapterFolders ?? [],
                      }),
            },
        },
    } as unknown as App;
}

describe('discoverHiddenEntries', () => {
    it('returns dotfiles not in the vault index', async () => {
        const app = createMockApp({
            indexedFiles: [{ path: 'readme.md', name: 'readme.md' }],
            adapterFiles: ['readme.md', '.gitignore', '.env'],
            adapterFolders: [],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(2);
        expect(result.map((e) => e.name)).toEqual(['.gitignore', '.env']);
        expect(result.every((e) => e.type === 'file')).toBe(true);
    });

    it('returns dot-prefixed folders not in the vault index', async () => {
        const app = createMockApp({
            indexedFolders: [{ path: 'docs', name: 'docs' }],
            adapterFolders: ['docs', '.git', '.hidden'],
            adapterFiles: [],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(2);
        expect(result.map((e) => e.name)).toEqual(['.git', '.hidden']);
        expect(result.every((e) => e.type === 'folder')).toBe(true);
    });

    it('excludes files already in the vault index', async () => {
        const app = createMockApp({
            indexedFiles: [
                { path: '.dotfile.md', name: '.dotfile.md' },
                { path: 'normal.md', name: 'normal.md' },
            ],
            adapterFiles: ['.dotfile.md', 'normal.md', '.new-hidden.md'],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('.new-hidden.md');
    });

    it('excludes .obsidian config directory', async () => {
        const app = createMockApp({
            adapterFiles: ['.obsidian/app.json', '.obsidian/workspace.json'],
            adapterFolders: ['.obsidian', '.obsidian/plugins'],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(0);
    });

    it('excludes non-dotfiles not in the index', async () => {
        const app = createMockApp({
            adapterFiles: ['unindexed-file.txt'],
            adapterFolders: ['unindexed-folder'],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(0);
    });

    it('returns empty array when adapter.list() fails', async () => {
        const app = createMockApp({ adapterError: true });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(0);
    });

    it('sets correct parentPath for nested hidden files', async () => {
        const app = createMockApp({
            adapterFiles: ['sub/.hidden-note.md'],
            adapterFolders: [],
        });

        const result = await discoverHiddenEntries(app, 'sub');
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: '.hidden-note.md',
            type: 'file',
            path: 'sub/.hidden-note.md',
            parentPath: 'sub',
        });
    });

    it('handles mixed indexed and hidden entries', async () => {
        const app = createMockApp({
            indexedFiles: [
                { path: 'notes/a.md', name: 'a.md' },
                { path: 'notes/b.md', name: 'b.md' },
            ],
            indexedFolders: [{ path: 'notes/sub', name: 'sub' }],
            adapterFiles: ['notes/a.md', 'notes/b.md', 'notes/.secret.md'],
            adapterFolders: ['notes/sub', 'notes/.private'],
        });

        const result = await discoverHiddenEntries(app, 'notes');
        expect(result).toHaveLength(2);
        const names = result.map((e) => e.name);
        expect(names).toContain('.secret.md');
        expect(names).toContain('.private');
    });

    it('returns empty when no hidden entries exist', async () => {
        const app = createMockApp({
            indexedFiles: [{ path: 'a.md', name: 'a.md' }],
            adapterFiles: ['a.md'],
            adapterFolders: [],
        });

        const result = await discoverHiddenEntries(app, '');
        expect(result).toHaveLength(0);
    });
});
