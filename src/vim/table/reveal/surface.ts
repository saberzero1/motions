import { editorInfoField } from 'obsidian';
import type { Extension } from '@codemirror/state';
import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import {
    captureHighlightChannel,
    getHighlightChannel,
    highlightChannelFailed,
} from './highlight-channel';
import {
    isRevealedAt,
    requestReveal,
    revealField,
    revealStateExtension,
    withdrawRevealEffect,
    type RevealedSpan,
} from './reveal-field';
import { rowRanges, tablesTouchedBy } from './table-extent';
import { revealGridDecorations } from './grid-decorations';
import { releaseNativeCellEditor, revealWidgetInput } from './widget-input';

export interface TableRevealOptions {
    /** Called once if Obsidian's highlight channel cannot be captured. */
    onUnavailable: () => void;
}

function sameSpans(
    a: readonly RevealedSpan[],
    b: readonly RevealedSpan[],
): boolean {
    return (
        a.length === b.length &&
        a.every((v, i) => v.from === b[i]?.from && v.to === b[i]?.to)
    );
}

/**
 * The per-view parts of the surface that need a view: capturing the channel,
 * reconciling a view that starts with its caret in a table, and withdrawing
 * the highlights when the surface is removed.
 */
class RevealLifecycle implements PluginValue {
    private placed: readonly RevealedSpan[] = [];
    private destroyed = false;

    constructor(
        private readonly view: EditorView,
        private readonly options: TableRevealOptions,
    ) {
        this.ensureChannel();
        this.reconcileSoon();
    }

    update(update: ViewUpdate): void {
        this.placed = update.state.field(revealField, false)?.highlights ?? [];
        if (!getHighlightChannel() && !highlightChannelFailed()) {
            this.ensureChannel();
            this.reconcileSoon();
        }
        // A backstop, normally a no-op: should Obsidian ever open its own
        // cell editor on a revealed table, its write lock on that cell would
        // silently drop the user's edits there.
        if (
            update.selectionSet &&
            isRevealedAt(update.state, update.state.selection.main.head)
        ) {
            queueMicrotask(() => {
                if (!this.destroyed) releaseNativeCellEditor(this.view);
            });
        }
    }

    private ensureChannel(): void {
        if (getHighlightChannel() || highlightChannelFailed()) return;
        const info = this.view.state.field(editorInfoField, false) as
            { editor?: unknown } | undefined;
        captureHighlightChannel(info?.editor);
        if (highlightChannelFailed()) this.options.onUnavailable();
    }

    /**
     * Reveals what the selection already touches, for a view that never saw a
     * transaction move it there — a note opened with its caret in a table, or
     * the mode switched on with the caret in one. A view plugin may not
     * dispatch during construction or update, hence the microtask.
     */
    private reconcileSoon(): void {
        if (!getHighlightChannel()) return;
        const { doc, selection } = this.view.state;
        const desired = tablesTouchedBy(doc, selection).flatMap((t) =>
            rowRanges(doc, t),
        );
        const current =
            this.view.state.field(revealField, false)?.highlights ?? [];
        if (sameSpans(desired, current)) return;
        queueMicrotask(() => {
            if (this.destroyed) return;
            this.view.dispatch({ effects: requestReveal.of(null) });
        });
    }

    destroy(): void {
        this.destroyed = true;
        const effect = withdrawRevealEffect(this.placed);
        if (!effect || this.placed.length === 0) return;
        const view = this.view;
        // Withdrawn after the reconfiguration that removed this plugin, so a
        // table it revealed is handed back to Obsidian rather than staying
        // source in a mode that no longer expects it.
        queueMicrotask(() => {
            try {
                view.dispatch({ effects: effect });
            } catch (err) {
                console.warn('Vim Motions: table reveal teardown failed:', err);
            }
        });
    }
}

/**
 * `tableWidgetMode: 'reveal'`: Obsidian renders idle tables with its own
 * widget, and the table holding the caret becomes ordinary editor lines.
 *
 * The parent editor's own vim then edits the table directly — one document,
 * one vim state, one undo history, native input and IME — with no nested
 * editor and nothing to bridge. See `.omo/table-probe/REVEAL-SPIKE.md` for the
 * mechanism and the measurements behind it.
 */
export function createTableReveal(options: TableRevealOptions): Extension {
    return [
        revealStateExtension(),
        revealGridDecorations(),
        revealWidgetInput(),
        ViewPlugin.define((view) => new RevealLifecycle(view, options)),
    ];
}
