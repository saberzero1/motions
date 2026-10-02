import type { EditorState } from '@codemirror/state';
import { type Extension, Prec } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { snippet, snippetState } from './autocomplete-types';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import { preprocessSnippetBody } from './preprocess';
import { detectCursorContext, matchesContext } from './context';
import { expandDynamicSnippet } from './dynamic-bridge';

function hasNextSnippetFieldCompat(state: EditorState): boolean {
    const active = state.field(snippetState, false);
    return !!(
        active && active.ranges.some((r) => r.field === active.active + 1)
    );
}

/**
 * Expands the snippet prefix before `view`'s cursor, if one matches.
 *
 * Exported because the owned table surface has to drive this against the
 * **parent** editor: the nested cell editor holds focus, so the parent's own
 * Tab keymap never fires. Delivering the key to the parent's whole keymap
 * stack instead was measured corrupting the table — with no matching prefix,
 * Obsidian's indent handler claimed Tab and wrote a literal tab before the
 * row (`\t| iznlaa   | 11    |`).
 */
export function expandSnippetAtCursor(
    view: EditorView,
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
    isInsertMode: () => boolean,
    isEnabled: () => boolean,
): boolean {
    if (!isEnabled() || !isInsertMode()) return false;
    if (hasNextSnippetFieldCompat(view.state)) return false;
    if (!view.state.selection.main.empty) return false;

    const cursorPos = view.state.selection.main.from;
    const line = view.state.doc.lineAt(cursorPos);
    const before = line.text.slice(0, cursorPos - line.from);
    const match = before.match(/([\w>![#]+)$/);
    if (!match) return false;

    const prefix = match[1] ?? '';
    if (!prefix) return false;

    const registry = getRegistry();
    if (!registry) return false;

    const cursorCtx = detectCursorContext(view.state, cursorPos, view);
    const matches = registry
        .lookupByPrefix(prefix)
        .filter((e) => matchesContext(e.context, cursorCtx));
    const entry = matches[0];
    if (!entry) return false;

    const prefixFrom = cursorPos - prefix.length;
    const dynamicDef = registry.getDynamic(prefix);
    if (dynamicDef) {
        expandDynamicSnippet(
            view,
            dynamicDef,
            prefixFrom,
            cursorPos,
            getContext(),
        );
        return true;
    }
    const body = preprocessSnippetBody(entry.body, getContext());
    const apply = snippet(body) as unknown as (
        view: EditorView,
        completion: null,
        from?: number,
        to?: number,
    ) => void;
    apply(view, null, prefixFrom, cursorPos);
    return true;
}

export function createSnippetTabKeymap(
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
    isInsertMode: () => boolean,
    isEnabled: () => boolean,
): Extension {
    return Prec.high(
        keymap.of([
            {
                key: 'Tab',
                run: (view: EditorView): boolean =>
                    expandSnippetAtCursor(
                        view,
                        getRegistry,
                        getContext,
                        isInsertMode,
                        isEnabled,
                    ),
            },
        ]),
    );
}
