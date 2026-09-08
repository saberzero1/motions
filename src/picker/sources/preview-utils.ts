import { App, TFile } from 'obsidian';
import type { PreviewResult, PreviewReturn } from '../types';

const MAX_PREVIEW_LINES = 500;
const MAX_PREVIEW_BYTES = 50000;

export type NonMarkdownPreviewMode = 'rendered' | 'hidden' | 'raw';

const EMBEDDABLE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'bmp',
    'svg',
    'webp',
    'avif',
    'canvas',
]);

/**
 * Types whose Obsidian embed instantiates a stateful viewer (PDF.js, a media
 * element). Repeatedly creating and destroying those while the selection moves
 * retains memory, so they get a metadata card instead of `![[...]]`.
 */
const VIEWER_EXTENSIONS = new Map<string, string>([
    ['pdf', 'PDF document'],
    ['mp4', 'Video'],
    ['webm', 'Video'],
    ['mov', 'Video'],
    ['mkv', 'Video'],
    ['ogv', 'Video'],
    ['mp3', 'Audio'],
    ['wav', 'Audio'],
    ['m4a', 'Audio'],
    ['ogg', 'Audio'],
    ['flac', 'Audio'],
    ['3gp', 'Audio'],
]);

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
}

function truncateForPreview(content: string): string {
    if (content.length > MAX_PREVIEW_BYTES) {
        return (
            content.slice(0, MAX_PREVIEW_BYTES) +
            '\n\n[File too large for preview]'
        );
    }
    const lines = content.split('\n');
    return lines.length > MAX_PREVIEW_LINES
        ? lines.slice(0, MAX_PREVIEW_LINES).join('\n') + '\n\n[Truncated]'
        : content;
}

function metadataCard(file: TFile, kind: string): PreviewResult {
    return {
        markdown: [
            `### ${file.name}`,
            '',
            `- **Type:** ${kind}`,
            `- **Size:** ${formatBytes(file.stat.size)}`,
        ].join('\n'),
        sourcePath: file.path,
    };
}

/**
 * Detect YAML frontmatter and return the index of the first line after it.
 * Returns 0 if no frontmatter is present.
 */
function getFrontmatterEnd(lines: string[]): number {
    if (lines.length < 2 || lines[0]?.trimEnd() !== '---') return 0;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trimEnd() === '---') return i + 1;
    }
    return 0;
}

export async function readFilePreview(
    app: App,
    path: string,
    mode: NonMarkdownPreviewMode = 'rendered',
): Promise<PreviewReturn> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;

    if (file.extension === 'md') {
        const content = await app.vault.cachedRead(file);
        return { markdown: truncateForPreview(content), sourcePath: path };
    }

    if (mode === 'hidden') return null;

    if (mode === 'rendered') {
        if (EMBEDDABLE_EXTENSIONS.has(file.extension)) {
            return { markdown: `![[${path}]]`, sourcePath: path };
        }
        const viewerKind = VIEWER_EXTENSIONS.get(file.extension);
        if (viewerKind) return metadataCard(file, viewerKind);
    }

    // Anything left is treated as text. The size is checked against the file
    // metadata so an oversized binary is never decoded just to be truncated.
    if (file.stat.size > MAX_PREVIEW_BYTES) return null;
    const content = await app.vault.cachedRead(file);
    return truncateForPreview(content);
}

export async function readLinesAroundPosition(
    app: App,
    path: string,
    targetLine: number,
    contextLines = 20,
): Promise<PreviewResult | null> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await app.vault.cachedRead(file);
    const lines = content.split('\n');
    const fmEnd = getFrontmatterEnd(lines);
    const start = Math.max(0, targetLine - contextLines);
    const end = Math.min(lines.length, targetLine + contextLines + 1);

    // Skip frontmatter lines — MarkdownRenderer strips them so they
    // would cause a mismatch between the gutter numbers and rendered text.
    const effectiveStart = Math.max(start, fmEnd);
    const markdown = lines.slice(effectiveStart, end).join('\n');
    return {
        markdown,
        sourcePath: path,
        lineRange: {
            lineStart: effectiveStart + 1,
            lineEnd: end,
            targetLine: targetLine + 1,
        },
    };
}
