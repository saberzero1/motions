import type { EditorState } from '@codemirror/state';
import { type Extension, Prec } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { snippet, snippetState } from './autocomplete-types';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import { preprocessSnippetBody } from './preprocess';
import { detectCursorContext, matchesContext } from './context';
import { expandDynamicSnippet } from './dynamic-bridge';

export function createSnippetTabKeymap(
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
    isInsertMode: () => boolean,
    isEnabled: () => boolean,
): Extension {
    const snippetStateField = snippetState;
    const hasNextSnippetFieldCompat = (state: EditorState): boolean => {
        const active = state.field(snippetStateField, false);
        return !!(
            active && active.ranges.some((r) => r.field === active.active + 1)
        );
    };

    return Prec.high(
        keymap.of([
            {
                key: 'Tab',
                run(view: EditorView): boolean {
                    if (!isEnabled() || !isInsertMode()) return false;
                    if (hasNextSnippetFieldCompat(view.state)) {
                        return false;
                    }
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

                    const cursorCtx = detectCursorContext(
                        view.state,
                        cursorPos,
                    );
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
                    const body = preprocessSnippetBody(
                        entry.body,
                        getContext(),
                    );
                    const apply = snippet(body) as unknown as (
                        view: EditorView,
                        completion: null,
                        from?: number,
                        to?: number,
                    ) => void;
                    apply(view, null, prefixFrom, cursorPos);
                    return true;
                },
            },
        ]),
    );
}
