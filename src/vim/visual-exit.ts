import type { CmAdapter, VimModeChange } from '../types/vim-api';

/**
 * Whether the current task ended visual mode — the question `:obcommand`
 * needs answered and cannot ask directly (#200).
 *
 * The fork exits visual mode before it runs any ex command, so by the time
 * the handler runs the only trace of the selection is `vim.lastSelection`.
 * That object also survives every later keystroke, so restoring it whenever
 * it exists applied a normal-mode `vim.cmd('obcommand …')` to whatever was
 * selected minutes earlier. A selection saved by an exit is marked here and
 * unmarked once the current task's microtasks run, which keeps it visible to
 * a nested dispatch — an `exmap` that calls `handleEx` again after the outer
 * dispatch already left visual mode — and to nothing after it.
 */

const endedThisTask = new WeakSet<object>();
/** The `lastSelection` each adapter held at its previous mode change. */
const seenAtLastChange = new WeakMap<CmAdapter, unknown>();

export function noteModeChange(
    adapter: CmAdapter,
    change: VimModeChange,
): void {
    const selection = adapter.state.vim?.lastSelection;
    const previous = seenAtLastChange.get(adapter);
    seenAtLastChange.set(adapter, selection);
    // An exit from visual mode saves a new `lastSelection` before it signals
    // `normal`; an exit from insert mode signals `normal` and saves nothing.
    if (change.mode !== 'normal' || selection === previous) return;
    if (!selection || typeof selection !== 'object') return;
    endedThisTask.add(selection);
    queueMicrotask(() => endedThisTask.delete(selection));
}

export function visualModeEndedThisTask(cm: CmAdapter): boolean {
    const selection = cm.state.vim?.lastSelection;
    return (
        !!selection &&
        typeof selection === 'object' &&
        endedThisTask.has(selection)
    );
}
