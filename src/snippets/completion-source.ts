import {
    type CompletionContext,
    type CompletionResult,
    type CompletionSource,
    snippetCompletion,
} from './autocomplete-types';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import { preprocessSnippetBody } from './preprocess';
import { detectCursorContext, matchesContext } from './context';

export function createSnippetCompletionSource(
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
): CompletionSource {
    return (context: CompletionContext): CompletionResult | null => {
        const registry = getRegistry();
        if (!registry) return null;

        const match = context.matchBefore(/[\w>![#]+/);
        if (!match && !context.explicit) return null;

        const cursorCtx = detectCursorContext(context.state, context.pos);
        const query = match?.text ?? '';
        const from = match?.from ?? context.pos;
        const options = registry.getAll().flatMap((entry) => {
            if (!matchesContext(entry.context, cursorCtx)) return [];
            return entry.prefixes.flatMap((prefix) => {
                if (query && !prefix.startsWith(query)) return [];
                const body = preprocessSnippetBody(entry.body, getContext());
                const isDynamic = registry.getDynamic(prefix) !== undefined;
                const detail = isDynamic
                    ? `[dynamic] ${entry.name}`
                    : entry.name;
                return [
                    snippetCompletion(body, {
                        label: prefix,
                        detail,
                        info: entry.description || undefined,
                        type: 'snippet',
                        boost: entry.source === 'user' ? 1 : 0,
                    }),
                ];
            });
        });

        if (options.length === 0) return null;

        return {
            from,
            options,
            validFor: /^[\w>![#]*$/,
        };
    };
}
