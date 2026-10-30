import { describe, expect, it } from 'vitest';
import {
    noteModeChange,
    visualModeEndedThisTask,
} from '../../../src/vim/visual-exit';
import type { CmAdapter } from '../../../src/types/vim-api';

/**
 * The tracker behind `:obcommand`'s selection restore (#200). The e2e spec
 * `obcommand-stale-selection.e2e.ts` drives it through real keys; this pins
 * the three rules it rests on without an Obsidian instance.
 */

function fakeAdapter(): { cm: CmAdapter; vim: { lastSelection?: object } } {
    const vim: { lastSelection?: object } = {};
    return { cm: { state: { vim } } as unknown as CmAdapter, vim };
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('visualModeEndedThisTask', () => {
    it('is true after a visual exit, until the task ends', async () => {
        const { cm, vim } = fakeAdapter();
        noteModeChange(cm, { mode: 'visual' });
        vim.lastSelection = { head: 1 };
        noteModeChange(cm, { mode: 'normal' });

        const during = visualModeEndedThisTask(cm);
        await nextTask();

        expect(during).toBe(true);
        expect(visualModeEndedThisTask(cm)).toBe(false);
    });

    it('is false after an insert exit that saved no new selection', () => {
        const { cm, vim } = fakeAdapter();
        vim.lastSelection = { head: 1 };
        noteModeChange(cm, { mode: 'insert' });
        noteModeChange(cm, { mode: 'normal' });

        expect(visualModeEndedThisTask(cm)).toBe(false);
    });

    it('is false when no selection was ever saved', () => {
        const { cm } = fakeAdapter();
        noteModeChange(cm, { mode: 'visual' });
        noteModeChange(cm, { mode: 'normal' });

        expect(visualModeEndedThisTask(cm)).toBe(false);
    });
});
