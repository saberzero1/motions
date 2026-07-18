import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimPos, VimState } from '../types/vim-api';
import { isEasyMotionActive } from '../easymotion/register';
import { isFlashActive, setFlashActive } from './state';
import { findCharTargets } from '../easymotion/targets';
import type { Target, LabeledTarget } from '../easymotion/types';
import { filterVisibleTargets, showOverlay } from '../easymotion/overlay';
import { waitForKey } from '../easymotion/keypress';
import { assignFlashLabels } from './labeler';
import { getJumpListInstance } from '../workspace/navigate';

function waitForFlashJumpLabel(
    labels: LabeledTarget[],
    onNarrow: (remaining: LabeledTarget[]) => void,
): Promise<LabeledTarget | null> {
    return new Promise((resolve) => {
        let prefix = '';
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                activeDocument.removeEventListener('keydown', handler, true);
                resolve(null);
                return;
            }

            if (e.key === 'Backspace') {
                if (prefix.length > 0) {
                    prefix = '';
                    onNarrow(labels);
                }
                return;
            }

            if (e.key.length !== 1) return;

            const typed = prefix + e.key;
            const exact = labels.find((t) => t.label === typed);
            if (exact) {
                activeDocument.removeEventListener('keydown', handler, true);
                resolve(exact);
                return;
            }

            const remaining = labels.filter((t) => t.label.startsWith(typed));
            if (remaining.length > 0) {
                prefix = typed;
                onNarrow(remaining);
            }
        };

        activeDocument.addEventListener('keydown', handler, true);
    });
}

interface FlashJumpOptions {
    enabled: () => boolean;
    labels: () => string;
    dimming: () => boolean;
    fontSize: () => number;
    app: App;
}

export function createFlashJumpMotion(
    opts: FlashJumpOptions,
): (
    cm: CmAdapter,
    head: VimPos,
    motionArgs: unknown,
    vimState: VimState,
    inputState: unknown,
) => Promise<VimPos | null> | null {
    return (cm, head) => {
        if (isFlashActive() || isEasyMotionActive()) {
            return null;
        }

        setFlashActive(true);

        return waitForKey()
            .then((char) => {
                if (!char || char.length !== 1) {
                    setFlashActive(false);
                    return null;
                }

                const rawTargets = findCharTargets(cm, char, 'bidirectional');
                const targets = filterVisibleTargets(cm, rawTargets);

                if (targets.length === 0) {
                    setFlashActive(false);
                    return null;
                }

                if (targets.length === 1) {
                    setFlashActive(false);
                    const target = targets[0]!;
                    maybeRecordJump(opts.app, cm, target);
                    return { line: target.line, ch: target.ch };
                }

                const cursor = cm.getCursor();
                const labeled = assignFlashLabels(
                    targets,
                    opts.labels(),
                    cursor.line,
                    cursor.ch,
                );

                const overlay = showOverlay(cm, labeled, {
                    shade: opts.dimming(),
                    fontSize: opts.fontSize(),
                });
                if (!overlay) {
                    setFlashActive(false);
                    return null;
                }

                return waitForFlashJumpLabel(labeled, (remaining) =>
                    overlay.updateLabels(remaining),
                ).then((match) => {
                    overlay.cleanup();
                    setFlashActive(false);
                    if (!match) return null;
                    maybeRecordJump(opts.app, cm, match);
                    return { line: match.line, ch: match.ch };
                });
            })
            .catch(() => {
                setFlashActive(false);
                return null;
            });
    };
}

function maybeRecordJump(app: App, cm: CmAdapter, target: Target): void {
    const cursor = cm.getCursor();
    if (target.line !== cursor.line) {
        const filePath =
            app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
        if (filePath) {
            getJumpListInstance()?.recordJump(filePath, cursor.line, cursor.ch);
        }
    }
}
