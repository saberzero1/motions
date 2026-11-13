export type InputMethodAreaKind = 'note' | 'input' | 'search' | 'unknown';

export type InputMethodMode =
    'normal' | 'insert' | 'replace' | 'visual' | 'operatorPending' | 'unknown';

export interface InputMethodArea {
    /** Stable identity used for the in-memory and persisted state map. */
    key: string;
    kind: InputMethodAreaKind;
    /** The CodeMirror watcher identity, when this is an editor area. */
    viewId?: string;
    /** A mode snapshot captured with the focus event, when available. */
    mode?: InputMethodMode;
}

export function noteInputMethodKey(
    vaultName: string,
    filePath: string,
): string {
    return `note:${vaultName}:${filePath}`;
}

export function searchInputMethodKey(
    scope: 'note' | 'global',
    filePath?: string,
): string {
    return scope === 'note' && filePath
        ? `search:note:${filePath}`
        : 'search:global';
}

export function isInsertInputMethodMode(
    mode: InputMethodMode | undefined,
): boolean {
    return mode === 'insert' || mode === 'replace';
}
