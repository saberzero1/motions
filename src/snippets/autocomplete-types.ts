/**
 * Re-exports from @codemirror/autocomplete fork.
 *
 * All snippet code imports from this module instead of directly from
 * @codemirror/autocomplete. When npm installs a nested copy of
 * @codemirror/state under the fork, TypeScript sees duplicate private
 * fields and resolves the fork's exports as error-typed. Centralising
 * imports here keeps the workaround in one place if needed.
 */
export {
    snippet,
    snippetCompletion,
    snippetState,
    hasNextSnippetField,
    hasPrevSnippetField,
    clearSnippet,
    nextSnippetField,
    prevSnippetField,
    cycleSnippetChoice,
    setActive,
    fieldSelection,
    FieldRange,
    ActiveSnippet,
    autocompletion,
} from '@codemirror/autocomplete';

export type {
    Completion,
    CompletionContext,
    CompletionResult,
    CompletionSource,
} from '@codemirror/autocomplete';
