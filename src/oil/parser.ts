import type { ParsedLine } from './types';

const OIL_LINE_RE = /^\/(\d+)\s+([df])\s(.+)$/;

export function parseBufferLines(text: string): ParsedLine[] {
    const lines = text.split('\n');
    const parsed: ParsedLine[] = [];

    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) continue;

        const match = line.match(OIL_LINE_RE);
        if (match) {
            const idText = match[1];
            const typeText = match[2];
            const nameText = match[3];
            if (!idText || !typeText || !nameText) continue;
            const id = Number(idText);
            const type = typeText === 'd' ? 'd' : 'f';
            const name = nameText.trimEnd();
            if (!name) continue;
            parsed.push({ id, type, name });
            continue;
        }

        const name = line.trim();
        if (!name) continue;
        const isDir = name.endsWith('/');
        parsed.push({ id: 0, type: isDir ? 'd' : 'f', name: isDir ? name.slice(0, -1) : name });
    }

    return parsed;
}
