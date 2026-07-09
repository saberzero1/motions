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

        const raw = line.trim();
        if (!raw) continue;
        const isDir = raw.endsWith('/');
        let name = isDir ? raw.slice(0, -1) : raw;
        if (!isDir && !name.includes('.')) {
            name += '.md';
        }
        parsed.push({ id: 0, type: isDir ? 'd' : 'f', name });
    }

    return parsed;
}
