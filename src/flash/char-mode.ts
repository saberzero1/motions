import type { App } from 'obsidian';
import type {
    CmAdapter,
    MotionFn,
    MotionArgs,
    VimPos,
    VimState,
} from '../types/vim-api';
import { isEasyMotionActive } from '../easymotion/register';
import {
    isFlashActive,
    setFlashActive,
    cancelFlash,
    setLastFlashSearch,
    getLastFlashSearch,
} from './state';
import { findCharTargets } from '../easymotion/targets';
import type { Target } from '../easymotion/types';
import { filterVisibleTargets, showOverlay } from '../easymotion/overlay';
import { assignFlashLabels } from './labeler';
import { waitForFlashLabel } from './label-input';
import { recordInNoteJump } from '../workspace/in-note-jumps';
import { findFlashCharacterPositions } from './character-match';

function findCharTargetsCurrentLine(
    cm: CmAdapter,
    char: string,
    forward: boolean,
): Target[] {
    const cursor = cm.getCursor();
    const text = cm.getLine(cursor.line);
    const targets: Target[] = [];
    for (const ch of findFlashCharacterPositions(
        text,
        cursor.ch,
        char,
        forward,
        true,
    )) {
        targets.push({ line: cursor.line, ch });
    }

    return targets;
}

function findTargetsForFlash(
    cm: CmAdapter,
    char: string,
    forward: boolean,
    multiLine: boolean,
): Target[] {
    if (!multiLine) {
        return findCharTargetsCurrentLine(cm, char, forward);
    }
    const direction = forward ? 'forward' : 'backward';
    return findCharTargets(cm, char, direction, (text, target) =>
        findFlashCharacterPositions(text, -1, target, true, true),
    );
}

function applyTillOffset(
    targets: Target[],
    forward: boolean,
    cm: CmAdapter,
): Target[] {
    return targets
        .map((t) => {
            if (forward) {
                if (t.ch > 0) return { line: t.line, ch: t.ch - 1 };
                if (t.line > 0) {
                    const prevLen = cm.getLine(t.line - 1)?.length ?? 0;
                    return {
                        line: t.line - 1,
                        ch: Math.max(0, prevLen - 1),
                    };
                }
                return null;
            }
            return { line: t.line, ch: t.ch + 1 };
        })
        .filter((t): t is Target => t !== null);
}

interface FlashCharOptions {
    enableFlash: () => boolean;
    multiLine: () => boolean;
    cleverF: () => boolean;
    labels: () => string;
    dimming: () => boolean;
    fontSize: () => number;
    matchFontSize: () => boolean;
    app: App;
}

export function createFlashCharMotion(
    originalMotion: MotionFn,
    isTill: boolean,
    opts: FlashCharOptions,
): MotionFn {
    return (
        cm: CmAdapter,
        head: VimPos,
        motionArgs: MotionArgs,
        vimState: VimState,
        inputState: unknown,
    ) => {
        if (isFlashActive()) {
            cancelFlash();
        }

        if (!opts.enableFlash() || isEasyMotionActive()) {
            return originalMotion(cm, head, motionArgs, vimState, inputState);
        }

        const char = motionArgs.selectedCharacter;
        if (!char || char.length !== 1) {
            return originalMotion(cm, head, motionArgs, vimState, inputState);
        }

        const forward = motionArgs.forward !== false;

        if (opts.cleverF()) {
            const last = getLastFlashSearch();
            if (
                last &&
                last.char === char &&
                last.forward === forward &&
                last.isTill === isTill
            ) {
                return originalMotion(
                    cm,
                    head,
                    motionArgs,
                    vimState,
                    inputState,
                );
            }
        }

        let rawTargets = findTargetsForFlash(
            cm,
            char,
            forward,
            opts.multiLine(),
        );
        if (isTill) {
            rawTargets = applyTillOffset(rawTargets, forward, cm);
        }

        const targets = filterVisibleTargets(cm, rawTargets);

        if (targets.length === 0) {
            return null;
        }

        if (targets.length === 1) {
            const target = targets[0]!;
            recordSearch(cm, char, forward, isTill);
            setLastFlashSearch(char, forward, isTill);
            maybeRecordJump(opts.app, cm, target);
            return { line: target.line, ch: target.ch };
        }

        // When a count prefix is given (e.g. `3f{char}`), jump directly to the
        // Nth match without showing the label overlay.  Clamp to the last match
        // when the count exceeds the number of available targets (Neovim parity).
        if (motionArgs.repeat > 1) {
            const idx = Math.min(motionArgs.repeat, targets.length) - 1;
            const target = targets[idx]!;
            recordSearch(cm, char, forward, isTill);
            setLastFlashSearch(char, forward, isTill);
            maybeRecordJump(opts.app, cm, target);
            return { line: target.line, ch: target.ch };
        }

        setFlashActive(true);
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
            matchFontSize: opts.matchFontSize(),
        });
        if (!overlay) {
            setFlashActive(false);
            return null;
        }

        return waitForFlashLabel(labeled, (remaining) =>
            overlay.updateLabels(remaining),
        )
            .promise.then((match) => {
                overlay.cleanup();
                setFlashActive(false);
                if (!match) return null;
                recordSearch(cm, char, forward, isTill);
                setLastFlashSearch(char, forward, isTill);
                maybeRecordJump(opts.app, cm, match);
                return { line: match.line, ch: match.ch };
            })
            .catch(() => {
                overlay.cleanup();
                setFlashActive(false);
                return null;
            });
    };
}

function recordSearch(
    cm: CmAdapter,
    char: string,
    forward: boolean,
    isTill: boolean,
): void {
    const vim = (
        window as unknown as {
            CodeMirrorAdapter?: {
                Vim?: {
                    recordLastCharacterSearch: (
                        increment: number,
                        args: {
                            forward: boolean;
                            selectedCharacter: string;
                        },
                    ) => void;
                };
            };
        }
    ).CodeMirrorAdapter?.Vim;

    if (vim?.recordLastCharacterSearch) {
        const increment = isTill ? (forward ? -1 : 1) : 0;
        vim.recordLastCharacterSearch(increment, {
            forward,
            selectedCharacter: char,
        });
    }
}

function maybeRecordJump(app: App, cm: CmAdapter, target: Target): void {
    const cursor = cm.getCursor();
    if (target.line !== cursor.line) {
        recordInNoteJump(app, cm, cursor, target);
    }
}
