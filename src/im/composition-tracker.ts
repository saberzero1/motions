import {
    type EditorView,
    ViewPlugin,
    type PluginValue,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const trackers = new Set<CompositionTracker>();
let compositionEndCallback: (() => void) | null = null;

class CompositionTracker implements PluginValue {
    private composing = false;
    private destroyed = false;

    constructor(private view: EditorView) {
        view.scrollDOM.addEventListener(
            'compositionstart',
            this.onCompositionStart,
        );
        view.scrollDOM.addEventListener(
            'compositionend',
            this.onCompositionEnd,
        );
        trackers.add(this);
    }

    destroy(): void {
        this.destroyed = true;
        this.view.scrollDOM.removeEventListener(
            'compositionstart',
            this.onCompositionStart,
        );
        this.view.scrollDOM.removeEventListener(
            'compositionend',
            this.onCompositionEnd,
        );
        trackers.delete(this);

        if (this.composing) {
            this.composing = false;
            notifyIfAllEnded();
        }
    }

    private onCompositionStart = (): void => {
        if (this.destroyed) return;
        this.composing = true;
    };

    private onCompositionEnd = (): void => {
        if (this.destroyed) return;
        this.composing = false;
        notifyIfAllEnded();
    };
}

function notifyIfAllEnded(): void {
    if (isAnyViewComposing()) return;
    if (!compositionEndCallback) return;
    const cb = compositionEndCallback;
    compositionEndCallback = null;
    void Promise.resolve().then(cb);
}

/**
 * Returns `true` when at least one tracked EditorView is inside an
 * active IME composition (`compositionstart` fired, `compositionend`
 * has not yet fired).
 */
export function isAnyViewComposing(): boolean {
    for (const t of trackers) {
        if ((t as unknown as { composing: boolean }).composing) return true;
    }
    return false;
}

/**
 * Register a one-shot callback that fires (via microtask) when the last
 * composing view ends its composition.  Only one callback may be
 * registered at a time — a new registration replaces the previous one.
 *
 * Returns an unsubscribe function.
 */
export function onAllCompositionsEnd(cb: () => void): () => void {
    compositionEndCallback = cb;
    return () => {
        if (compositionEndCallback === cb) compositionEndCallback = null;
    };
}

/**
 * CM6 extension that installs a per-EditorView composition tracker.
 * Register once via `registerEditorExtension()` — Obsidian applies it
 * to every editor (primary leaf, popover, canvas card, etc.).
 */
export function createCompositionTrackerExtension(): Extension {
    return ViewPlugin.fromClass(CompositionTracker);
}

/** @internal — exposed for unit tests only. */
export function _resetTrackers(): void {
    trackers.clear();
    compositionEndCallback = null;
}
