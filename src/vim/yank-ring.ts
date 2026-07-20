import type { CmAdapter, VimPos, VimApi } from '../types/vim-api';
import type { VimRegistration } from './registration';
import { Transaction } from '@codemirror/state';

interface YankRingState {
    active: boolean;
    registerIndex: number;
    pasteStart: VimPos;
    pasteEnd: VimPos;
    pasteLinewise: boolean;
}

export class YankRingManager {
    private state: YankRingState | null = null;
    private lastCycleCommandId = 0;
    private currentCommandId = 0;
    private lastKeyWasPaste = false;
    private prevCursor: VimPos = { line: 0, ch: 0 };
    private prevLineCount = 0;
    private cm: CmAdapter | null = null;

    setAdapter(cm: CmAdapter): void {
        this.cm = cm;
        this.prevCursor = cm.getCursor();
        this.prevLineCount = cm.lineCount();
    }

    onKeypress(key: string): void {
        this.lastKeyWasPaste = key === 'p' || key === 'P';
    }

    cycle(cm: CmAdapter, vim: VimApi, direction: 1 | -1): boolean {
        if (!this.state?.active) return false;

        const rc = vim.getRegisterController();
        const newIndex = this.findNextNonEmpty(
            rc,
            this.state.registerIndex,
            direction,
        );
        if (newIndex === null) return false;

        const reg = rc.getRegister
            ? rc.getRegister(String(newIndex))
            : rc.registers[String(newIndex)];
        if (!reg) return false;
        let newText = reg.toString();

        if (!this.state.pasteLinewise && newText.endsWith('\n')) {
            newText = newText.slice(0, -1);
        }

        const fromOffset = cm.indexFromPos(this.state.pasteStart);
        const toOffset = cm.indexFromPos(this.state.pasteEnd);

        cm.cm6.dispatch({
            changes: { from: fromOffset, to: toOffset, insert: newText },
            annotations: [Transaction.addToHistory.of(false)],
        });

        if (this.state.pasteLinewise) {
            const contentLines = newText.endsWith('\n')
                ? newText.slice(0, -1).split('\n')
                : newText.split('\n');
            this.state.pasteEnd = {
                line: this.state.pasteStart.line + contentLines.length,
                ch: 0,
            };
        } else {
            const lines = newText.split('\n');
            if (lines.length === 1) {
                this.state.pasteEnd = {
                    line: this.state.pasteStart.line,
                    ch: this.state.pasteStart.ch + newText.length,
                };
            } else {
                this.state.pasteEnd = {
                    line: this.state.pasteStart.line + lines.length - 1,
                    ch: (lines[lines.length - 1] ?? '').length,
                };
            }
        }

        this.state.registerIndex = newIndex;
        this.lastCycleCommandId = this.currentCommandId;
        return true;
    }

    onCommandDone(): void {
        this.currentCommandId++;

        if (this.lastKeyWasPaste && this.cm) {
            this.lastKeyWasPaste = false;
            const afterCursor = this.cm.getCursor();
            const afterLineCount = this.cm.lineCount();
            const lineDelta = afterLineCount - this.prevLineCount;
            const linewise =
                lineDelta > 0 && afterCursor.ch === this.prevCursor.ch;

            let start: VimPos;
            let end: VimPos;
            if (linewise) {
                const insertLine = afterCursor.line - lineDelta + 1;
                start = { line: insertLine, ch: 0 };
                end = { line: insertLine + lineDelta, ch: 0 };
            } else {
                start = this.prevCursor;
                end = afterCursor;
            }

            this.state = {
                active: true,
                registerIndex: 1,
                pasteStart: start,
                pasteEnd: end,
                pasteLinewise: linewise,
            };
            this.prevCursor = afterCursor;
            this.prevLineCount = afterLineCount;
            return;
        }

        this.lastKeyWasPaste = false;

        if (
            this.state?.active &&
            this.lastCycleCommandId < this.currentCommandId - 1
        ) {
            this.cancel();
        }

        if (this.cm) {
            this.prevCursor = this.cm.getCursor();
            this.prevLineCount = this.cm.lineCount();
        }
    }

    cancel(): void {
        this.state = null;
    }

    isActive(): boolean {
        return this.state?.active ?? false;
    }

    private findNextNonEmpty(
        rc: ReturnType<VimApi['getRegisterController']>,
        current: number,
        direction: 1 | -1,
    ): number | null {
        for (let step = 1; step <= 9; step++) {
            let idx = current + direction * step;
            idx = ((idx - 1 + 9) % 9) + 1;
            const reg = rc.registers[String(idx)];
            if (reg && reg.toString().length > 0) return idx;
        }
        return null;
    }
}

export function registerYankRing(
    reg: VimRegistration,
    vim: VimApi,
    yankRing: YankRingManager,
): void {
    vim.unmap('<C-p>', 'normal', { includeDefaults: true });
    vim.unmap('<C-n>', 'normal', { includeDefaults: true });

    reg.defineAction('yankRingPrev', (cm) => {
        if (!yankRing.cycle(cm, vim, -1)) {
            vim.handleKey(cm, 'k');
        }
    });
    reg.mapCommand('<C-p>', 'action', 'yankRingPrev', {});

    reg.defineAction('yankRingNext', (cm) => {
        if (!yankRing.cycle(cm, vim, 1)) {
            vim.handleKey(cm, 'j');
        }
    });
    reg.mapCommand('<C-n>', 'action', 'yankRingNext', {});
}
