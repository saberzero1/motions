/**
 * Type-safe bridge for @codemirror/autocomplete fork imports.
 *
 * The fork may install its own @codemirror/state, creating duplicate
 * private-field types that TypeScript resolves as error/any. This
 * module declares explicit local types and casts the fork's runtime
 * values to them, breaking the type chain at the package boundary.
 */
import type {
    EditorState,
    EditorSelection,
    Extension,
    StateCommand,
    StateEffectType,
    StateField,
    Transaction,
} from '@codemirror/state';

// Runtime imports — values only, types come from local declarations
import * as autocompleteModule from '@codemirror/autocomplete';

// ── Local type declarations ─────────────────────────────────────

export interface FieldRange {
    readonly field: number;
    readonly from: number;
    readonly to: number;
}

export interface SnippetChoices {
    [fieldIndex: number]: string[];
}

export interface ActiveSnippet {
    readonly ranges: readonly FieldRange[];
    readonly active: number;
    readonly choices: SnippetChoices;
    readonly deco: unknown;
}

export interface Completion {
    label: string;
    detail?: string;
    info?: string;
    type?: string;
    boost?: number;
    apply?: unknown;
    section?: unknown;
}

export interface CompletionContext {
    readonly state: EditorState;
    readonly pos: number;
    readonly explicit: boolean;
    matchBefore(
        expr: RegExp,
    ): { from: number; to: number; text: string } | null;
}

export interface CompletionResult {
    from: number;
    to?: number;
    options: Completion[];
    validFor?:
        | RegExp
        | ((
              text: string,
              from: number,
              to: number,
              state: EditorState,
          ) => boolean);
    filter?: boolean;
}

export type CompletionSource = (
    context: CompletionContext,
) => CompletionResult | null | Promise<CompletionResult | null>;

type SnippetApplyFn = (
    editor: { state: EditorState; dispatch: (tr: Transaction) => void },
    completion: Completion | null,
    from: number,
    to: number,
) => void;

// ── Typed runtime accessors ─────────────────────────────────────

const mod = autocompleteModule as unknown as Record<string, unknown>;

export const snippet = mod['snippet'] as (template: string) => SnippetApplyFn;

export const snippetCompletion = mod['snippetCompletion'] as (
    template: string,
    completion: Completion,
) => Completion;

export const snippetState = mod[
    'snippetState'
] as StateField<ActiveSnippet | null>;

export const hasNextSnippetField = mod['hasNextSnippetField'] as (
    state: EditorState,
) => boolean;

export const hasPrevSnippetField = mod['hasPrevSnippetField'] as (
    state: EditorState,
) => boolean;

export const clearSnippet = mod['clearSnippet'] as StateCommand;

export const nextSnippetField = mod['nextSnippetField'] as StateCommand;

export const prevSnippetField = mod['prevSnippetField'] as StateCommand;

export const cycleSnippetChoice = mod['cycleSnippetChoice'] as (
    dir: 1 | -1,
) => StateCommand;

export const setActive = mod[
    'setActive'
] as StateEffectType<ActiveSnippet | null>;

export const fieldSelection = mod['fieldSelection'] as (
    ranges: readonly FieldRange[],
    field: number,
) => EditorSelection;

// eslint-disable-next-line @typescript-eslint/naming-convention -- matches upstream class name
export const FieldRange = mod['FieldRange'] as new (
    field: number,
    from: number,
    to: number,
) => FieldRange;

// eslint-disable-next-line @typescript-eslint/naming-convention -- matches upstream class name
export const ActiveSnippet = mod['ActiveSnippet'] as new (
    ranges: readonly FieldRange[],
    active: number,
    choices?: SnippetChoices,
) => ActiveSnippet;

export const autocompletion = mod['autocompletion'] as (config?: {
    override?: CompletionSource[];
    activateOnTyping?: boolean;
    defaultKeymap?: boolean;
}) => Extension;
