import { type Extension } from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    type EditorView,
    ViewPlugin,
    type ViewUpdate,
} from '@codemirror/view';
import { getCmAdapterFromEditorView } from './vim-api';

/** Painted on the text of each line a visual-block selection covers. */
export const VISUAL_BLOCK_SELECTION_CLASS =
    'vim-motions-visual-block-selection';
/** On the scroller while a visual-block selection is active. */
export const VISUAL_BLOCK_ACTIVE_CLASS = 'vim-motions-visual-block';

const mark = Decoration.mark({ class: VISUAL_BLOCK_SELECTION_CLASS });

function inVisualBlock(view: EditorView): boolean {
    const vim = getCmAdapterFromEditorView(view)?.state?.vim;
    return !!(vim?.visualMode && vim.visualBlock);
}

function build(view: EditorView): DecorationSet {
    const ranges = view.state.selection.ranges
        .filter((r) => !r.empty)
        .map((r) => mark.range(r.from, r.to));
    return Decoration.set(ranges, true);
}

/**
 * Paints a visual-block selection on the text it covers (#249).
 *
 * The engine gives the editor one range per line, which the editor draws on
 * its selection layer. That layer sits behind the lines, and Obsidian paints
 * a code block's lines with an opaque background, so inside a code block the
 * selection was hidden and only the cursor showed. `v` is unaffected because
 * the browser draws its single range on the text itself, and `V` because its
 * line highlight overrides the line's background.
 *
 * Marks are drawn inside the line, over its background, the way the browser's
 * own selection is. While they are, the selection layer and the browser's
 * selection are hidden in CSS, so no range is painted twice.
 */
class VisualBlockHighlight {
    decorations: DecorationSet = Decoration.none;
    private active = false;

    constructor(private readonly view: EditorView) {
        this.refresh(view);
    }

    update(update: ViewUpdate): void {
        const active = inVisualBlock(update.view);
        // Entering block mode from `v` on one line can leave the selection
        // unchanged, so the mode flip alone has to trigger a rebuild.
        if (
            active !== this.active ||
            (active && (update.selectionSet || update.docChanged))
        ) {
            this.refresh(update.view);
        }
    }

    private refresh(view: EditorView): void {
        this.active = inVisualBlock(view);
        this.decorations = this.active ? build(view) : Decoration.none;
        view.scrollDOM.classList.toggle(VISUAL_BLOCK_ACTIVE_CLASS, this.active);
    }

    destroy(): void {
        this.view.scrollDOM.classList.remove(VISUAL_BLOCK_ACTIVE_CLASS);
    }
}

export function visualBlockHighlightExtension(): Extension {
    return ViewPlugin.fromClass(VisualBlockHighlight, {
        decorations: (v) => v.decorations,
    });
}
