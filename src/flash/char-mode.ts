import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
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
import { getJumpListInstance } from '../workspace/navigate';

function findCharTargetsCurrentLine(
    cm: CmAdapter,
    char: string,
    forward: boolean,
): Target[] {
    const cursor = cm.getCursor();
    const text = cm.getLine(cursor.line);
    const targets: Target[] = [];

    if (forward) {
        let idx = cursor.ch + 1;
        while (idx < text.length) {
            const found = text.indexOf(char, idx);
            if (found === -1) break;
            targets.push({ line: cursor.line, ch: found });
            idx = found + 1;
        }
    } else {
        let idx = cursor.ch - 1;
        while (idx >= 0) {
            const found = text.lastIndexOf(char, idx);
            if (found === -1) break;
            targets.push({ line: cursor.line, ch: found });
            idx = found - 1;
        }
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
    return findCharTargets(cm, char, direction);
}

function applyTillOffset(targets: Target[], forward: boolean): Target[] {
    return targets
        .map((t) => {
            if (forward) {
                return t.ch > 0 ? { line: t.line, ch: t.ch - 1 } : null;
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
            rawTargets = applyTillOffset(rawTargets, forward);
        }

        const targets = filterVisibleTargets(cm, rawTargets);

        if (targets.length === 0) {
            return null;
        }

        if (targets.length === 1) {
            const target = targets[0]!;
            recordSearch(cm, char, forward, isTill, opts);
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
        });
        if (!overlay) {
            setFlashActive(false);
            return null;
        }

        return waitForFlashLabel(labeled, (remaining) =>
            overlay.updateLabels(remaining),
        )
            .then((match) => {
                overlay.cleanup();
                setFlashActive(false);
                if (!match) return null;
                recordSearch(cm, char, forward, isTill, opts);
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
    opts: FlashCharOptions,
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
        const filePath =
            app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
        if (filePath) {
            getJumpListInstance()?.recordJump(filePath, cursor.line, cursor.ch);
        }
    }
}
