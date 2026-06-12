import type { MotionFn, VimPos } from '../types/vim-api';

const LINK_RE = /\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)/g;

function findLinksOnLine(lineText: string): { start: number; end: number }[] {
    const results: { start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(LINK_RE.source, 'g');
    while ((match = re.exec(lineText)) !== null) {
        results.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return results;
}

function createLinkMotion(forward: boolean): MotionFn {
    return (cm, head, motionArgs) => {
        const repeat = motionArgs.repeat ?? 1;
        const lastLine = cm.lastLine();
        let found: VimPos | null = null;
        let count = 0;

        if (forward) {
            const startLine = head.line;
            for (let i = startLine; i <= lastLine; i++) {
                const links = findLinksOnLine(cm.getLine(i));
                for (const link of links) {
                    const isBeyondCursor =
                        i > startLine || link.start > head.ch;
                    if (isBeyondCursor) {
                        count++;
                        if (count >= repeat) {
                            found = { line: i, ch: link.start };
                            break;
                        }
                    }
                }
                if (found) break;
            }
        } else {
            const startLine = head.line;
            for (let i = startLine; i >= 0; i--) {
                const links = findLinksOnLine(cm.getLine(i)).reverse();
                for (const link of links) {
                    const isBeforeCursor =
                        i < startLine || link.start < head.ch;
                    if (isBeforeCursor) {
                        count++;
                        if (count >= repeat) {
                            found = { line: i, ch: link.start };
                            break;
                        }
                    }
                }
                if (found) break;
            }
        }

        return found ?? head;
    };
}

export const nextLink = createLinkMotion(true);
export const prevLink = createLinkMotion(false);
