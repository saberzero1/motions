import { App, TFile } from 'obsidian';
import type { PreviewResult } from '../types';

const MAX_PREVIEW_LINES = 500;
const MAX_PREVIEW_BYTES = 50000;

export async function readFilePreview(
    app: App,
    path: string,
): Promise<PreviewResult | null> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await app.vault.cachedRead(file);
    let markdown: string;
    if (content.length > MAX_PREVIEW_BYTES) {
        markdown =
            content.slice(0, MAX_PREVIEW_BYTES) +
            '\n\n[File too large for preview]';
    } else {
        const lines = content.split('\n');
        markdown =
            lines.length > MAX_PREVIEW_LINES
                ? lines.slice(0, MAX_PREVIEW_LINES).join('\n') +
                  '\n\n[Truncated]'
                : content;
    }
    return { markdown, sourcePath: path };
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
    const start = Math.max(0, targetLine - contextLines);
    const end = Math.min(lines.length, targetLine + contextLines + 1);
    const markdown = lines.slice(start, end).join('\n');
    return {
        markdown,
        sourcePath: path,
        lineRange: {
            lineStart: start + 1,
            lineEnd: end,
            targetLine: targetLine + 1,
        },
    };
}
