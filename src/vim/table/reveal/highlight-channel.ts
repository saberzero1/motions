import {
    EditorState,
    type Range,
    type StateEffect,
    type StateEffectType,
} from '@codemirror/state';
import type { Decoration } from '@codemirror/view';

/**
 * The highlight style whose presence makes Obsidian leave a table as source.
 *
 * Obsidian's Live Preview table builder skips any table touched by a
 * decoration in the `Editor.addHighlights()` field whose value is the mark it
 * keeps for this style. That is how in-file search shows a match inside a
 * table. Read from `app.js` and present unchanged from 1.5.8 through 1.13.7;
 * see `.omo/table-probe/REVEAL-SPIKE.md`.
 */
export const SEARCH_HIGHLIGHT_STYLE = 'obsidian-search-match-highlight';

/** Filters Obsidian's highlight field: keep a range when it returns true. */
export type HighlightFilter = (
    from: number,
    to: number,
    value: Decoration,
) => boolean;

/**
 * Obsidian's own effect types for its highlight field, and the exact mark its
 * table builder compares against.
 *
 * Identity is the point: the builder tests `value === mark`, so a mark of our
 * own with the same class would be ignored.
 */
export interface HighlightChannel {
    add: StateEffectType<readonly Range<Decoration>[]>;
    filter: StateEffectType<HighlightFilter>;
    mark: Decoration;
}

type EditorPosition = { line: number; ch: number };

type AddHighlights = (
    this: unknown,
    ranges: { from: EditorPosition; to: EditorPosition }[],
    style: string,
    removePrevious: boolean,
    unfold?: boolean,
) => void;

let channel: HighlightChannel | null = null;
let failed = false;

/** The captured channel, or null until one has been captured. */
export function getHighlightChannel(): HighlightChannel | null {
    return channel;
}

/** True once a capture has run and its result was unusable. */
export function highlightChannelFailed(): boolean {
    return failed;
}

/**
 * Captures the channel from an Obsidian `Editor`, once per session.
 *
 * `addHighlights` is called with a stand-in `this` whose `cm` is a synthetic
 * two-line state and whose `dispatch` records the spec instead of applying it.
 * Measured from `app.js`, the method touches nothing on `this` but
 * `cm.state` and `cm.dispatch`, and its fold lookup falls back to an empty set
 * on a state without folds — so no editor the user can see is involved, and
 * the result does not depend on which note happens to be open.
 *
 * The live view is deliberately **not** used. Its `dispatch` is an own
 * property bound in `EditorView`'s constructor, and swapping it for a capture
 * and back is easy to get subtly wrong: deleting the override instead of
 * restoring it leaves the prototype method, which still serves
 * `view.dispatch(...)` calls but breaks every command that destructures
 * `{ dispatch }` — the spike lost `u` exactly that way, with no error logged.
 *
 * The effect types and the mark are module-level in Obsidian, shared by every
 * editor, so one capture serves them all. A spec that does not have the
 * expected shape marks the channel failed and leaves it null, and the reveal
 * surface stays inert.
 */
export function captureHighlightChannel(
    editor: unknown,
): HighlightChannel | null {
    if (channel || failed) return channel;
    const addHighlights = (editor as { addHighlights?: unknown } | null)
        ?.addHighlights;
    if (typeof addHighlights !== 'function') return null;

    let spec: { effects?: unknown } | null = null;
    const standIn = {
        cm: {
            state: EditorState.create({ doc: 'ab\ncd' }),
            dispatch: (s: { effects?: unknown }) => {
                spec = s;
            },
        },
    };

    try {
        (addHighlights as AddHighlights).call(
            standIn,
            [{ from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } }],
            SEARCH_HIGHLIGHT_STYLE,
            true,
        );
    } catch (err) {
        console.warn('Vim Motions: table reveal capture threw:', err);
        failed = true;
        return null;
    }

    channel = parseCapturedSpec(spec);
    if (!channel) failed = true;
    return channel;
}

/**
 * Picks the add and filter effects out of a captured `addHighlights` spec.
 *
 * Exported for unit testing; production calls it only through the capture.
 */
export function parseCapturedSpec(spec: unknown): HighlightChannel | null {
    const effects = (spec as { effects?: unknown } | null)?.effects;
    if (!Array.isArray(effects)) return null;

    let add: StateEffect<unknown> | undefined;
    let filter: StateEffect<unknown> | undefined;
    for (const effect of effects as StateEffect<unknown>[]) {
        if (Array.isArray(effect?.value)) add = effect;
        else if (typeof effect?.value === 'function') filter = effect;
    }
    if (!add || !filter) return null;

    const first = (add.value as Range<Decoration>[])[0];
    const mark = first?.value;
    const cls = (mark?.spec as { class?: unknown } | undefined)?.class;
    if (!mark || cls !== SEARCH_HIGHLIGHT_STYLE) return null;

    // `type` is real but marked internal in CodeMirror's typings. It is the
    // only way to obtain an effect type that some other bundle defined.
    const typeOf = (effect: StateEffect<unknown>): unknown =>
        (effect as unknown as { type: unknown }).type;
    return {
        add: typeOf(add) as StateEffectType<readonly Range<Decoration>[]>,
        filter: typeOf(filter) as StateEffectType<HighlightFilter>,
        mark,
    };
}
