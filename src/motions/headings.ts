import type { MotionFn, VimPos } from '../types/vim-api';

const HEADING_RE = /^(#{1,6})\s/;

function getHeadingLevel(lineText: string): number {
    const match = HEADING_RE.exec(lineText);
    if (!match?.[1]) return 0;
    return match[1].length;
}

function createHeadingMotion(forward: boolean, level?: number): MotionFn {
    return (cm, head, motionArgs) => {
        const repeat = motionArgs.repeat ?? 1;
        const lastLine = cm.lastLine();
        let found: VimPos | null = null;
        let count = 0;

        if (forward) {
            for (let i = head.line + 1; i <= lastLine; i++) {
                const headingLevel = getHeadingLevel(cm.getLine(i));
                if (
                    headingLevel > 0 &&
                    (level === undefined || headingLevel === level)
                ) {
                    count++;
                    if (count >= repeat) {
                        found = { line: i, ch: 0 };
                        break;
                    }
                }
            }
        } else {
            for (let i = head.line - 1; i >= 0; i--) {
                const headingLevel = getHeadingLevel(cm.getLine(i));
                if (
                    headingLevel > 0 &&
                    (level === undefined || headingLevel === level)
                ) {
                    count++;
                    if (count >= repeat) {
                        found = { line: i, ch: 0 };
                        break;
                    }
                }
            }
        }

        return found ?? head;
    };
}

export const nextHeading = createHeadingMotion(true);
export const prevHeading = createHeadingMotion(false);

export const nextHeading1 = createHeadingMotion(true, 1);
export const prevHeading1 = createHeadingMotion(false, 1);
export const nextHeading2 = createHeadingMotion(true, 2);
export const prevHeading2 = createHeadingMotion(false, 2);
export const nextHeading3 = createHeadingMotion(true, 3);
export const prevHeading3 = createHeadingMotion(false, 3);
export const nextHeading4 = createHeadingMotion(true, 4);
export const prevHeading4 = createHeadingMotion(false, 4);
export const nextHeading5 = createHeadingMotion(true, 5);
export const prevHeading5 = createHeadingMotion(false, 5);
export const nextHeading6 = createHeadingMotion(true, 6);
export const prevHeading6 = createHeadingMotion(false, 6);
