import type { MotionFn, VimPos } from '../types/vim-api';

const LIST_RE = /^(\s*)([-*+]|\d+[.)]) /;

function getListIndent(lineText: string): number | null {
    const match = LIST_RE.exec(lineText);
    if (!match) return null;
    return match[1]?.length ?? 0;
}

function createListMotion(forward: boolean): MotionFn {
    return (cm, head, motionArgs) => {
        const repeat = motionArgs.repeat ?? 1;
        const lastLine = cm.lastLine();
        const currentIndent = getListIndent(cm.getLine(head.line));
        if (currentIndent === null) return head;

        let found: VimPos | null = null;
        let count = 0;

        if (forward) {
            for (let i = head.line + 1; i <= lastLine; i++) {
                const indent = getListIndent(cm.getLine(i));
                if (indent === null) continue;
                if (indent === currentIndent) {
                    count++;
                    if (count >= repeat) {
                        found = { line: i, ch: indent + 2 };
                        break;
                    }
                }
            }
        } else {
            for (let i = head.line - 1; i >= 0; i--) {
                const indent = getListIndent(cm.getLine(i));
                if (indent === null) continue;
                if (indent === currentIndent) {
                    count++;
                    if (count >= repeat) {
                        found = { line: i, ch: indent + 2 };
                        break;
                    }
                }
            }
        }

        return found ?? head;
    };
}

export const nextListItem = createListMotion(true);
export const prevListItem = createListMotion(false);
