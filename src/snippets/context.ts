interface DocLike {
    lineAt(pos: number): { number: number; text: string };
    line(n: number): { text: string };
    lines: number;
}

interface EditorStateLike {
    doc: DocLike;
}

export type CursorContextType = 'prose' | 'code' | 'frontmatter';

export interface CursorContext {
    type: CursorContextType;
    language?: string;
}

const FENCE_RE = /^(`{3,}|~{3,})\s*(.*)/;

export function detectCursorContext(
    state: EditorStateLike,
    pos: number,
): CursorContext {
    const doc = state.doc;
    const cursorLine = doc.lineAt(pos).number;

    const firstLine = doc.line(1).text.trim();
    if (firstLine === '---') {
        for (let i = 2; i <= doc.lines; i++) {
            const line = doc.line(i).text.trim();
            if (line === '---' || line === '...') {
                if (cursorLine >= 1 && cursorLine <= i) {
                    return { type: 'frontmatter' };
                }
                break;
            }
        }
    }

    let openFence: {
        line: number;
        marker: string;
        language: string;
    } | null = null;

    for (let i = 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text;
        const match = FENCE_RE.exec(lineText);
        const fenceMarker = match?.[1];
        if (fenceMarker) {
            if (!openFence) {
                openFence = {
                    line: i,
                    marker: fenceMarker.charAt(0),
                    language: (match?.[2] ?? '').trim(),
                };
            } else if (lineText.trim().startsWith(openFence.marker.repeat(3))) {
                if (cursorLine > openFence.line && cursorLine < i) {
                    return {
                        type: 'code',
                        language: openFence.language || undefined,
                    };
                }
                openFence = null;
            }
        }
    }

    return { type: 'prose' };
}

export function matchesContext(
    snippetContext: string | undefined,
    cursorContext: CursorContext,
): boolean {
    if (!snippetContext) return true;

    switch (snippetContext) {
        case 'prose':
            return cursorContext.type === 'prose';
        case 'frontmatter':
            return cursorContext.type === 'frontmatter';
        case 'code:*':
            return cursorContext.type === 'code';
        default:
            if (snippetContext.startsWith('code:')) {
                const lang = snippetContext.slice(5);
                return (
                    cursorContext.type === 'code' &&
                    cursorContext.language?.toLowerCase() === lang.toLowerCase()
                );
            }
            return true;
    }
}
