import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import { readFilePreview } from '../../../src/picker/sources/preview-utils';
import type { PreviewResult } from '../../../src/picker/types';

/**
 * Issue #172. `readFilePreview` used to `cachedRead()` every `TFile`
 * regardless of type or size, decoding multi-megabyte binaries as UTF-8 —
 * and Obsidian caches that string. The 50 KB truncation ran afterwards, so
 * it bounded rendering cost but not read or memory cost.
 *
 * Contract: for non-Markdown files the mode decides the outcome BEFORE any
 * read happens. Markdown is never affected.
 */

function makeFile(path: string, size: number): TFile {
    const file = new TFile();
    const name = path.split('/').pop() ?? path;
    const dot = name.lastIndexOf('.');
    file.path = path;
    file.name = name;
    file.basename = dot > 0 ? name.slice(0, dot) : name;
    file.extension = dot > 0 ? name.slice(dot + 1) : '';
    file.stat = { size, ctime: 0, mtime: 0 };
    return file;
}

function makeApp(files: TFile[], contents: Record<string, string> = {}) {
    const cachedRead = vi.fn((file: TFile) =>
        Promise.resolve(contents[file.path] ?? ''),
    );
    const app = {
        vault: {
            getAbstractFileByPath: (path: string) =>
                files.find((f) => f.path === path) ?? null,
            cachedRead,
        },
    } as never;
    return { app, cachedRead };
}

describe('readFilePreview non-Markdown policy (#172)', () => {
    describe('hidden', () => {
        it('returns null for a PDF without reading it from disk', async () => {
            const pdf = makeFile('refs/paper.pdf', 5_000_000);
            const { app, cachedRead } = makeApp([pdf]);

            const result = await readFilePreview(app, pdf.path, 'hidden');

            expect(cachedRead).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });
    });

    describe('rendered', () => {
        it('never reads a PDF from disk', async () => {
            const pdf = makeFile('refs/paper.pdf', 5_000_000);
            const { app, cachedRead } = makeApp([pdf]);

            await readFilePreview(app, pdf.path, 'rendered');

            expect(cachedRead).not.toHaveBeenCalled();
        });

        it('describes a PDF with a placeholder card naming the file', async () => {
            const pdf = makeFile('refs/paper.pdf', 5_000_000);
            const { app } = makeApp([pdf]);

            const result = (await readFilePreview(
                app,
                pdf.path,
                'rendered',
            )) as PreviewResult;

            expect(result).not.toBeNull();
            expect(typeof result).toBe('object');
            expect(result.markdown).toContain('paper.pdf');
            // A placeholder must NOT be a native embed: instantiating a
            // PDF.js viewer per selection is the leak this policy avoids.
            expect(result.markdown).not.toContain('![[');
        });

        it('embeds an image natively without reading its bytes', async () => {
            const png = makeFile('assets/diagram.png', 2_000_000);
            const { app, cachedRead } = makeApp([png]);

            const result = (await readFilePreview(
                app,
                png.path,
                'rendered',
            )) as PreviewResult;

            expect(cachedRead).not.toHaveBeenCalled();
            expect(result.markdown).toContain('![[assets/diagram.png]]');
        });

        it('shows a placeholder for video rather than embedding it', async () => {
            const video = makeFile('clips/demo.mp4', 40_000_000);
            const { app, cachedRead } = makeApp([video]);

            const result = (await readFilePreview(
                app,
                video.path,
                'rendered',
            )) as PreviewResult;

            expect(cachedRead).not.toHaveBeenCalled();
            expect(result.markdown).not.toContain('![[');
            expect(result.markdown).toContain('demo.mp4');
        });

        it('reads a small plain-text file and returns it as raw text', async () => {
            const txt = makeFile('notes/todo.txt', 42);
            const { app, cachedRead } = makeApp([txt], {
                'notes/todo.txt': 'buy milk',
            });

            const result = await readFilePreview(app, txt.path, 'rendered');

            expect(cachedRead).toHaveBeenCalledTimes(1);
            expect(result).toBe('buy milk');
        });
    });

    describe('raw', () => {
        it('refuses to read a file above the preview byte budget', async () => {
            const pdf = makeFile('refs/paper.pdf', 5_000_000);
            const { app, cachedRead } = makeApp([pdf]);

            const result = await readFilePreview(app, pdf.path, 'raw');

            expect(cachedRead).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it('returns a small file as a raw string, not rendered markdown', async () => {
            const json = makeFile('data/config.json', 20);
            const { app } = makeApp([json], { 'data/config.json': '{"a":1}' });

            const result = await readFilePreview(app, json.path, 'raw');

            expect(result).toBe('{"a":1}');
        });
    });

    describe('markdown is exempt from the policy', () => {
        it.each(['rendered', 'hidden', 'raw'] as const)(
            'still returns rendered markdown in %s mode',
            async (mode) => {
                const md = makeFile('notes/note.md', 120);
                const { app, cachedRead } = makeApp([md], {
                    'notes/note.md': '# Heading\n\nBody text.',
                });

                const result = (await readFilePreview(
                    app,
                    md.path,
                    mode,
                )) as PreviewResult;

                expect(cachedRead).toHaveBeenCalledTimes(1);
                expect(result.markdown).toBe('# Heading\n\nBody text.');
                expect(result.sourcePath).toBe('notes/note.md');
            },
        );

        it('still truncates an oversized markdown file rather than hiding it', async () => {
            const big = 'x'.repeat(60_000);
            const md = makeFile('notes/big.md', 60_000);
            const { app } = makeApp([md], { 'notes/big.md': big });

            const result = (await readFilePreview(
                app,
                md.path,
                'rendered',
            )) as PreviewResult;

            expect(result.markdown).toContain('[File too large for preview]');
            expect(result.markdown.length).toBeLessThan(60_000);
        });
    });

    it('returns null when the path does not resolve to a file', async () => {
        const { app, cachedRead } = makeApp([]);

        const result = await readFilePreview(app, 'nope.md', 'rendered');

        expect(result).toBeNull();
        expect(cachedRead).not.toHaveBeenCalled();
    });
});
