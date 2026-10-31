import type { App, WorkspaceLeaf } from 'obsidian';

/**
 * Whether the active pane is still loading its note. A split activates its
 * new pane at once and loads the note into it afterwards (Obsidian defers it),
 * and when the load finishes Obsidian focuses that pane.
 */
export function isActiveLeafLoading(app: App): boolean {
    // Not getMostRecentLeaf(): measured right after a split, it still named
    // the previous pane while the new one, the pane Obsidian's own pane
    // commands act on, was loading, so the check passed and <C-w>h ran during
    // the load. `activeLeaf` is marked discouraged, but it is that pane.
    const leaf = (
        app.workspace as unknown as { activeLeaf: WorkspaceLeaf | null }
    ).activeLeaf;
    return !!leaf && (leaf.working || leaf.isDeferred);
}

const LIMIT_MS = 1500;
const POLL_MS = 25;
const pending: Array<() => void> = [];
let draining = false;

/**
 * Runs a window or tab action now, or once the active pane has loaded.
 *
 * Run during the load, an action is undone by it: `<C-w>v<C-w>h` moved to the
 * original pane, and the finished load focused the new one again, measured 4
 * of 4 times from a mapping and from keys sent together. Queued actions run in
 * order, so one typed later cannot overtake one still waiting, and the wait
 * gives up after 1.5 s, as the Neovim bridge's does. With nothing loading the
 * action runs synchronously, as before.
 */
export function whenActiveLeafSettled(app: App, run: () => void): void {
    if (pending.length === 0 && !isActiveLeafLoading(app)) {
        run();
        return;
    }
    pending.push(run);
    if (!draining) void drain(app);
}

async function drain(app: App): Promise<void> {
    draining = true;
    try {
        let waited = 0;
        while (pending.length > 0) {
            if (isActiveLeafLoading(app) && waited < LIMIT_MS) {
                await new Promise((resolve) =>
                    window.setTimeout(resolve, POLL_MS),
                );
                waited += POLL_MS;
                continue;
            }
            // An action can start a load of its own, such as a split, so
            // the next one waits afresh.
            waited = 0;
            try {
                pending.shift()?.();
            } catch (error) {
                console.error('Vim Motions: window action failed', error);
            }
        }
    } finally {
        draining = false;
    }
}
