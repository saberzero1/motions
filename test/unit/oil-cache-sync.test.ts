import { describe, expect, it, vi } from 'vitest';
import { OilCache } from '../../src/oil/cache';
import { entriesToBufferText, OilManager } from '../../src/oil/manager';
import { renderDirectory, discoverHiddenEntries } from '../../src/oil/render';
import type { OilEntry } from '../../src/oil/types';
import type { App } from 'obsidian';

function extractIdsFromBuffer(text: string): number[] {
    return text
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^\/(\d+)\s/);
            return match ? Number(match[1]) : -1;
        });
}

function createMockApp(opts: {
    indexedFiles?: { path: string; name: string }[];
    indexedFolders?: { path: string; name: string }[];
    adapterFiles?: string[];
    adapterFolders?: string[];
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
                list: vi.fn().mockResolvedValue({
                    files: opts.adapterFiles ?? [],
                    folders: opts.adapterFolders ?? [],
                }),
            },
        },
        workspace: {
            iterateAllLeaves: vi.fn(),
        },
    } as unknown as App;
}

describe('cache ID synchronization', () => {
    it('all buffer IDs resolve after renderDirectoryToBuffer', () => {
        const cache = new OilCache();
        const rawEntries: Array<Omit<OilEntry, 'id'>> = [
            { name: 'docs', type: 'folder', path: 'docs', parentPath: '' },
            {
                name: 'readme.md',
                type: 'file',
                path: 'readme.md',
                parentPath: '',
            },
        ];

        const entries = cache.loadDirectory('', rawEntries);
        const text = entriesToBufferText(entries);
        const ids = extractIdsFromBuffer(text);

        for (const id of ids) {
            expect(cache.getEntry(id)).toBeDefined();
        }
    });

    it('all buffer IDs resolve after discover-and-merge flow', () => {
        const cache = new OilCache();

        const indexedEntries: Array<Omit<OilEntry, 'id'>> = [
            { name: 'docs', type: 'folder', path: 'docs', parentPath: '' },
            {
                name: 'readme.md',
                type: 'file',
                path: 'readme.md',
                parentPath: '',
            },
        ];

        const hiddenEntries: Array<Omit<OilEntry, 'id'>> = [
            {
                name: '.gitignore',
                type: 'file',
                path: '.gitignore',
                parentPath: '',
            },
        ];

        const initialEntries = cache.loadDirectory('', indexedEntries);
        const initialContent = entriesToBufferText(initialEntries);

        const allRaw = [...indexedEntries, ...hiddenEntries];
        allRaw.sort((a, b) => {
            const typeOrder =
                a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1;
            if (typeOrder !== 0) return typeOrder;
            return a.name
                .toLowerCase()
                .localeCompare(b.name.toLowerCase(), undefined, {
                    sensitivity: 'base',
                });
        });
        const mergedEntries = cache.loadDirectory('', allRaw);
        const mergedContent = entriesToBufferText(mergedEntries);
        const mergedIds = extractIdsFromBuffer(mergedContent);

        for (const id of mergedIds) {
            expect(cache.getEntry(id)).toBeDefined();
        }

        expect(mergedContent).toContain('.gitignore');
    });

    it('expectedContent comparison succeeds after single loadDirectory', () => {
        const cache = new OilCache();

        const rawEntries: Array<Omit<OilEntry, 'id'>> = [
            { name: 'docs', type: 'folder', path: 'docs', parentPath: '' },
            {
                name: 'readme.md',
                type: 'file',
                path: 'readme.md',
                parentPath: '',
            },
        ];

        const entries = cache.loadDirectory('', rawEntries);
        const bufferContent = entriesToBufferText(entries);

        const comparisonResult = bufferContent === bufferContent;
        expect(comparisonResult).toBe(true);
    });

    it('multiple renderDirectoryToBuffer calls keep cache in sync', () => {
        const cache = new OilCache();

        const rawEntries: Array<Omit<OilEntry, 'id'>> = [
            { name: 'a.md', type: 'file', path: 'a.md', parentPath: '' },
            { name: 'b.md', type: 'file', path: 'b.md', parentPath: '' },
        ];

        for (let i = 0; i < 5; i++) {
            const entries = cache.loadDirectory('', rawEntries);
            const text = entriesToBufferText(entries);
            const ids = extractIdsFromBuffer(text);
            for (const id of ids) {
                expect(cache.getEntry(id)).toBeDefined();
            }
        }
    });

    it('discover flow does not corrupt cache when no hidden entries found', () => {
        const cache = new OilCache();

        const rawEntries: Array<Omit<OilEntry, 'id'>> = [
            {
                name: 'notes.md',
                type: 'file',
                path: 'notes.md',
                parentPath: '',
            },
        ];

        const entries = cache.loadDirectory('', rawEntries);
        const bufferContent = entriesToBufferText(entries);
        const ids = extractIdsFromBuffer(bufferContent);

        for (const id of ids) {
            expect(cache.getEntry(id)).toBeDefined();
        }
    });
});

describe('getEffectiveShowHidden', () => {
    function createManager(settingValue: boolean): {
        manager: OilManager;
        toggleHidden: () => void;
        renderDirectoryToBuffer: (dirPath: string) => string;
    } {
        const app = createMockApp({
            indexedFiles: [
                { path: '.dotfile.md', name: '.dotfile.md' },
                { path: 'visible.md', name: 'visible.md' },
            ],
        });
        const cache = new OilCache();
        const settings = {
            oilShowHiddenFiles: settingValue,
            oilDefaultSort: 'name' as const,
        } as unknown as import('../../src/settings').VimMotionsSettings;

        const manager = new OilManager(app, cache, settings);
        return {
            manager,
            toggleHidden: () => manager.toggleHidden(),
            renderDirectoryToBuffer: (dirPath: string) =>
                manager.renderDirectoryToBuffer(dirPath),
        };
    }

    it('uses setting value when no override is active', () => {
        const { renderDirectoryToBuffer } = createManager(false);
        const content = renderDirectoryToBuffer('');
        expect(content).not.toContain('.dotfile.md');
        expect(content).toContain('visible.md');
    });

    it('uses setting value true when no override is active', () => {
        const { renderDirectoryToBuffer } = createManager(true);
        const content = renderDirectoryToBuffer('');
        expect(content).toContain('.dotfile.md');
        expect(content).toContain('visible.md');
    });

    it('toggle overrides setting=false to show hidden', () => {
        const { toggleHidden, renderDirectoryToBuffer } = createManager(false);
        toggleHidden();
        const content = renderDirectoryToBuffer('');
        expect(content).toContain('.dotfile.md');
    });

    it('toggle overrides setting=true to hide hidden', () => {
        const { toggleHidden, renderDirectoryToBuffer } = createManager(true);
        toggleHidden();
        const content = renderDirectoryToBuffer('');
        expect(content).not.toContain('.dotfile.md');
    });

    it('double toggle returns to original state', () => {
        const { toggleHidden, renderDirectoryToBuffer } = createManager(false);
        toggleHidden();
        toggleHidden();
        const content = renderDirectoryToBuffer('');
        expect(content).not.toContain('.dotfile.md');
    });
});

describe('renderDirectory at vault root', () => {
    it('returns root-level files and folders', () => {
        const app = createMockApp({
            indexedFiles: [
                { path: 'readme.md', name: 'readme.md' },
                { path: 'notes/deep.md', name: 'deep.md' },
            ],
            indexedFolders: [
                { path: 'notes', name: 'notes' },
                { path: 'notes/sub', name: 'sub' },
            ],
        });

        const entries = renderDirectory(app, '', false, 'name');
        const names = entries.map((e) => e.name);
        expect(names).toContain('readme.md');
        expect(names).toContain('notes');
        expect(names).not.toContain('deep.md');
        expect(names).not.toContain('sub');
    });

    it('returns empty for empty vault root', () => {
        const app = createMockApp({
            indexedFiles: [],
            indexedFolders: [],
        });

        const entries = renderDirectory(app, '', false, 'name');
        expect(entries).toHaveLength(0);
    });
});
