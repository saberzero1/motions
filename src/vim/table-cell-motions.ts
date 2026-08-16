import type { App } from 'obsidian';
import type { MotionFn, VimApi, VimState, CmAdapter } from '../types/vim-api';
import type { ObsidianTableCell } from '../types/table-editor';
import { getActiveTableCell } from './native-table-adapter';
import { setCursorSuppressedForView } from '@replit/codemirror-vim';
import { signalCellCrossing } from './animated-cursor/manager';

// Captured once on first applyTableCellMotions() call, never overwritten.
// Survives teardown+reapply cycles (reloadFeatures).
let origMoveByLines: MotionFn | null = null;
let origMoveByCharacters: MotionFn | null = null;
let origMoveByDisplayLines: MotionFn | null = null;

let pendingCrossing: number | null = null;

function suppressMainCursor(cm: CmAdapter): void {
    const view = cm.cm6;
    setCursorSuppressedForView(view, true);
    const vimLayer = view.scrollDOM.querySelector('.cm-vimCursorLayer');
    if (vimLayer) vimLayer.textContent = '';
}

function scheduleCrossing(cm: CmAdapter, fn: () => void): void {
    if (pendingCrossing !== null) window.clearTimeout(pendingCrossing);
    suppressMainCursor(cm);
    signalCellCrossing();
    pendingCrossing = window.setTimeout(() => {
        pendingCrossing = null;
        fn();
    }, 0);
}

// The inputState parameter (5th motion arg) holds the pre-clearInputState
// snapshot — its .operator field indicates operator-pending (dj, yl, etc.).
interface InputStateSnapshot {
    operator?: string;
    [key: string]: unknown;
}

function isCellValid(cell: ObsidianTableCell): boolean {
    return cell.el?.isConnected === true;
}

function shouldCrossCellBoundary(vim: VimState, inputState: unknown): boolean {
    const snap = inputState as InputStateSnapshot | undefined;
    if (snap?.operator) return false;
    if (vim.visualMode) return false;
    return true;
}

function createMoveByLines(app: App): MotionFn {
    return function tableMoveByLines(
        this: unknown,
        cm,
        head,
        motionArgs,
        vim,
        inputState,
    ) {
        const cell = getActiveTableCell(app);
        if (!cell || !isCellValid(cell)) {
            return origMoveByLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }
        if (!shouldCrossCellBoundary(vim, inputState)) {
            return origMoveByLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }
        if (motionArgs.toFirstChar) {
            return origMoveByLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }

        const te = cell.table;
        const forward = motionArgs.forward ?? true;
        const firstLine = cm.firstLine();
        const lastLine = cm.lastLine();

        if (firstLine !== lastLine) {
            const targetLine = forward
                ? head.line + (motionArgs.repeat ?? 1)
                : head.line - (motionArgs.repeat ?? 1);
            if (targetLine >= firstLine && targetLine <= lastLine) {
                return origMoveByLines!.call(
                    this,
                    cm,
                    head,
                    motionArgs,
                    vim,
                    inputState,
                );
            }
        }

        const dest = forward ? te.getCellBelow(cell) : te.getCellAbove(cell);

        if (dest) {
            scheduleCrossing(cm, () => te.setCellFocus(dest.row, dest.col));
        } else {
            const placement = forward ? 'after' : 'before';
            scheduleCrossing(cm, () => te.placeCursorAround(placement));
        }

        return head;
    };
}

function createMoveByCharacters(app: App): MotionFn {
    return function tableMoveByCharacters(
        this: unknown,
        cm,
        head,
        motionArgs,
        vim,
        inputState,
    ) {
        const cell = getActiveTableCell(app);
        if (!cell || !isCellValid(cell)) {
            return origMoveByCharacters!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }
        if (!shouldCrossCellBoundary(vim, inputState)) {
            return origMoveByCharacters!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }

        const forward = motionArgs.forward ?? true;
        const repeat = motionArgs.repeat ?? 1;
        const lineLen = cm.getLine(head.line)?.length ?? 0;
        const targetCh = forward ? head.ch + repeat : head.ch - repeat;

        // Normal-mode cursor range is [0, lineLen-1]; cross at boundaries
        if (forward ? targetCh < lineLen : targetCh >= 0) {
            return origMoveByCharacters!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }

        const te = cell.table;
        const dest = te.getNextCell(cell, forward ? 'end' : 'start');

        if (dest) {
            scheduleCrossing(cm, () => te.setCellFocus(dest.row, dest.col));
        } else {
            const placement = forward ? 'after' : 'before';
            scheduleCrossing(cm, () => te.placeCursorAround(placement));
        }

        return head;
    };
}

function createMoveByDisplayLines(app: App): MotionFn {
    return function tableMoveByDisplayLines(
        this: unknown,
        cm,
        head,
        motionArgs,
        vim,
        inputState,
    ) {
        const cell = getActiveTableCell(app);
        if (!cell || !isCellValid(cell)) {
            return origMoveByDisplayLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }
        if (!shouldCrossCellBoundary(vim, inputState)) {
            return origMoveByDisplayLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }

        // Multi-line cells: delegate entirely (can't predict display-line boundaries)
        if (cm.firstLine() !== cm.lastLine()) {
            return origMoveByDisplayLines!.call(
                this,
                cm,
                head,
                motionArgs,
                vim,
                inputState,
            );
        }

        // Single-line cell — identical to moveByLines
        const forward = motionArgs.forward ?? true;
        const te = cell.table;
        const dest = forward ? te.getCellBelow(cell) : te.getCellAbove(cell);

        if (dest) {
            scheduleCrossing(cm, () => te.setCellFocus(dest.row, dest.col));
        } else {
            const placement = forward ? 'after' : 'before';
            scheduleCrossing(cm, () => te.placeCursorAround(placement));
        }

        return head;
    };
}

/**
 * Override moveByLines, moveByCharacters, and moveByDisplayLines to add
 * cross-cell navigation in native table cell editors.
 *
 * Returns a teardown function that restores the original motions.
 */
export function applyTableCellMotions(
    app: App,
    vim: VimApi,
): (() => void) | null {
    // Capture originals once. getMotion() returns bound functions (fork fix)
    // so they preserve `this` (the motions table) when called standalone.
    if (!origMoveByLines) {
        origMoveByLines = (vim.getMotion('moveByLines') as MotionFn) ?? null;
    }
    if (!origMoveByCharacters) {
        origMoveByCharacters =
            (vim.getMotion('moveByCharacters') as MotionFn) ?? null;
    }
    if (!origMoveByDisplayLines) {
        origMoveByDisplayLines =
            (vim.getMotion('moveByDisplayLines') as MotionFn) ?? null;
    }

    if (!origMoveByLines || !origMoveByCharacters) return null;

    vim.defineMotion('moveByLines', createMoveByLines(app));
    vim.defineMotion('moveByCharacters', createMoveByCharacters(app));
    if (origMoveByDisplayLines !== null) {
        vim.defineMotion('moveByDisplayLines', createMoveByDisplayLines(app));
    }

    return () => {
        if (origMoveByLines !== null)
            vim.defineMotion('moveByLines', origMoveByLines);
        if (origMoveByCharacters !== null)
            vim.defineMotion('moveByCharacters', origMoveByCharacters);
        if (origMoveByDisplayLines !== null)
            vim.defineMotion('moveByDisplayLines', origMoveByDisplayLines);
    };
}
