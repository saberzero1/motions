import { App, TFile } from 'obsidian';

const MAX_PREVIEW_LINES = 500;
const MAX_PREVIEW_BYTES = 50000;

export async function readFilePreview(
    app: App,
    path: string,
): Promise<string | null> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await app.vault.cachedRead(file);
    if (content.length > MAX_PREVIEW_BYTES) {
        return (
            content.slice(0, MAX_PREVIEW_BYTES) +
            '\n\n[File too large for preview]'
        );
    }
    const lines = content.split('\n');
    if (lines.length > MAX_PREVIEW_LINES) {
        return lines.slice(0, MAX_PREVIEW_LINES).join('\n') + '\n\n[Truncated]';
    }
    return content;
}

export async function readLinesAroundPosition(
    app: App,
    path: string,
    targetLine: number,
    contextLines = 20,
): Promise<string | null> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await app.vault.cachedRead(file);
    const lines = content.split('\n');
    const start = Math.max(0, targetLine - contextLines);
    const end = Math.min(lines.length, targetLine + contextLines + 1);
    return lines
        .slice(start, end)
        .map((line, i) => {
            const lineNum = start + i + 1;
            const marker = lineNum === targetLine + 1 ? '>' : ' ';
            return `${marker} ${String(lineNum).padStart(4)} │ ${line}`;
        })
        .join('\n');
}
