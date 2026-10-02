import type { EditorView } from '@codemirror/view';

/**
 * Which kind of editing surface a CodeMirror view is.
 *
 * Obsidian's Live Preview table editor creates a **separate `EditorView` per
 * cell** (measured: `.omo/table-probe/FINDINGS.md` § Q4 — two editors, two vim
 * states, the cell carrying its own gutters and cursor layer). Every per-view
 * subsystem the plugin registers through `registerEditorExtension` is therefore
 * instantiated again for each one-line cell document, which is defect A3.
 *
 * `'document'` means "not a table cell" rather than "a leaf's main editor":
 * Oil views, textarea overlays and popout editors all land here deliberately,
 * because no subsystem distinguishes them and each already carries its own
 * guard. Adding a kind nobody branches on would be vocabulary without a
 * consumer; new kinds join when a subsystem needs them *and* they can be
 * measured.
 */
export type EditorSurface = 'document' | 'table-cell';

/**
 * Obsidian's table widget wrapper. Already load-bearing in production
 * (`src/util/cell-editor-guard.ts`, `src/vim/table-cell-cursor-guard.ts`,
 * `src/vim/animated-cursor/controller.ts`), so the selector is measured rather
 * than assumed.
 */
export const TABLE_CELL_SELECTOR = '.cm-table-widget';

/**
 * Most-specific first; the first matching selector decides the surface.
 *
 * Ordering is load-bearing once a third kind arrives — our own nested table
 * editor will sit *inside* a surface of its own, and a looser selector earlier
 * in the list would claim it.
 */
const SURFACE_SELECTORS: readonly (readonly [string, EditorSurface])[] = [
    [TABLE_CELL_SELECTOR, 'table-cell'],
];

/**
 * Classify from a selector matcher rather than from a DOM node.
 *
 * Injected for the same reason `surface-field.ts` takes its Live Preview gate
 * as a predicate: it keeps the decision table unit-testable without a DOM, and
 * it makes the selector list the only thing a test has to agree with.
 */
export function classifySurfaceBy(
    matches: (selector: string) => boolean,
): EditorSurface {
    for (const [selector, surface] of SURFACE_SELECTORS) {
        if (matches(selector)) return surface;
    }
    return 'document';
}

/**
 * Classify a live view.
 *
 * Reads `view.dom`, so any test fake passed to a subsystem that calls this
 * needs a `dom` with `closest` — the absence of one is a crash, not a silent
 * `'document'`, and that is deliberate.
 */
export function classifySurface(view: EditorView): EditorSurface {
    return classifySurfaceBy((selector) => view.dom.closest(selector) !== null);
}
