import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimPos, VimState } from '../types/vim-api';
import { isEasyMotionActive } from '../easymotion/register';
import { isFlashActive, setFlashActive } from './state';
import { findSubstringTargets } from '../easymotion/targets';
import type { Target } from '../easymotion/types';
import {
    filterVisibleTargets,
    showOverlay,
    showMatchHighlights,
} from '../easymotion/overlay';
import { FlashLabeler } from './labeler';
import { getJumpListInstance } from '../workspace/navigate';

function computeSkipChars(
    cm: CmAdapter,
    targets: Target[],
    pattern: string,
    labelChars: string,
): Set<string> {
    const skip = new Set<string>();
    const labelSet = new Set([...labelChars].map((c) => c.toLowerCase()));
    const patternLen = pattern.length;

    for (const t of targets) {
        const text = cm.getLine(t.line);
        const afterIdx = t.ch + patternLen;
        if (afterIdx < text.length) {
            const nextChar = text[afterIdx]!.toLowerCase();
            if (labelSet.has(nextChar)) {
                skip.add(nextChar);
            }
        }
    }

    return skip;
}

interface FlashJumpOptions {
    enabled: () => boolean;
    minPatternLength: () => number;
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
    return (cm) => {
        if (!opts.enabled() || isFlashActive() || isEasyMotionActive()) {
            return null;
        }

        setFlashActive(true);

        return new Promise<VimPos | null>((resolve) => {
            let pattern = '';
            const labeler = new FlashLabeler();
            let currentOverlay: { cleanup: () => void } | null = null;

            const cleanup = () => {
                activeDocument.removeEventListener('keydown', handler, true);
                currentOverlay?.cleanup();
                currentOverlay = null;
                setFlashActive(false);
            };

            const updateDisplay = () => {
                currentOverlay?.cleanup();
                currentOverlay = null;

                if (!pattern) return;

                const rawTargets = findSubstringTargets(
                    cm,
                    pattern,
                    'bidirectional',
                );
                const targets = filterVisibleTargets(cm, rawTargets);

                if (targets.length === 0) {
                    cleanup();
                    resolve(null);
                    return;
                }

                const minLen = opts.minPatternLength();
                if ([...pattern].length < minLen) {
                    currentOverlay = showMatchHighlights(cm, targets);
                    return;
                }

                if (targets.length === 1) {
                    const target = targets[0]!;
                    cleanup();
                    maybeRecordJump(opts.app, cm, target);
                    resolve({ line: target.line, ch: target.ch });
                    return;
                }

                const cursor = cm.getCursor();
                const skipChars = computeSkipChars(
                    cm,
                    targets,
                    pattern,
                    opts.labels(),
                );
                const labeled = labeler.assign(
                    targets,
                    opts.labels(),
                    cursor.line,
                    cursor.ch,
                    skipChars,
                );

                currentOverlay = showOverlay(cm, labeled, {
                    shade: opts.dimming(),
                    fontSize: opts.fontSize(),
                });
            };

            const handler = (e: KeyboardEvent) => {
                if (e.isComposing) return;
                e.preventDefault();
                e.stopPropagation();

                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                    return;
                }

                if (e.key === 'Enter') {
                    const rawTargets = findSubstringTargets(
                        cm,
                        pattern,
                        'bidirectional',
                    );
                    const targets = filterVisibleTargets(cm, rawTargets);
                    if (targets.length > 0) {
                        const target = targets[0]!;
                        cleanup();
                        maybeRecordJump(opts.app, cm, target);
                        resolve({ line: target.line, ch: target.ch });
                    } else {
                        cleanup();
                        resolve(null);
                    }
                    return;
                }

                if (e.key === 'Backspace') {
                    if ([...pattern].length > 0) {
                        const chars = [...pattern];
                        chars.pop();
                        pattern = chars.join('');
                        labeler.reset(opts.labels());
                        updateDisplay();
                    }
                    return;
                }

                if (e.key.length !== 1) return;

                const minLen = opts.minPatternLength();
                if ([...pattern].length >= minLen && currentOverlay) {
                    const overlayEl = activeDocument.querySelector(
                        '.vim-motions-easymotion-label',
                    );
                    if (overlayEl) {
                        const rawTargets = findSubstringTargets(
                            cm,
                            pattern,
                            'bidirectional',
                        );
                        const targets = filterVisibleTargets(cm, rawTargets);
                        const cursor = cm.getCursor();
                        const skipChars = computeSkipChars(
                            cm,
                            targets,
                            pattern,
                            opts.labels(),
                        );
                        const labeled = labeler.assign(
                            targets,
                            opts.labels(),
                            cursor.line,
                            cursor.ch,
                            skipChars,
                        );
                        const match = labeled.find((t) => t.label === e.key);
                        if (match) {
                            cleanup();
                            maybeRecordJump(opts.app, cm, match);
                            resolve({ line: match.line, ch: match.ch });
                            return;
                        }
                    }
                }

                pattern += e.key;
                updateDisplay();
            };

            activeDocument.addEventListener('keydown', handler, true);
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
