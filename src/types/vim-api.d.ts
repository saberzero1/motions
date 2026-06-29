/**
 * Type declarations for the Vim API exposed by @replit/codemirror-vim
 * via window.CodeMirrorAdapter.Vim in Obsidian.
 *
 * These are NOT official types — they are inferred from the codemirror-vim
 * source code (src/vim.js) and observed behavior in Obsidian plugins.
 */

/** Cursor position in CodeMirror's CM5-compat layer. */
export interface VimPos {
    line: number;
    ch: number;
}

/** Vim mode descriptor emitted on mode change events. */
export interface VimModeChange {
    mode: 'normal' | 'insert' | 'visual' | 'replace';
    subMode?: 'linewise' | 'blockwise' | '';
}

/** Arguments passed to motion functions. */
export interface MotionArgs {
    repeat: number;
    forward?: boolean;
    linewise?: boolean;
    textObjectInner?: boolean;
    selectedCharacter?: string;
    toJumplist?: boolean;
    explicitRepeat?: boolean;
}

/** Arguments passed to operator functions. */
export interface OperatorArgs {
    repeat: number;
    linewise?: boolean;
    registerName?: string;
    indentRight?: boolean;
}

/** Range used by operators. */
export interface OperatorRange {
    anchor: VimPos;
    head: VimPos;
}

/** Arguments passed to action functions. */
export interface ActionArgs {
    repeat: number;
    forward?: boolean;
    selectedCharacter?: string;
    after?: boolean;
    isEdit?: boolean;
    register?: string;
}

/** Arguments passed to ex command callbacks. */
export interface ExCommandArgs {
    args: string[];
    argString: string;
    commandName: string;
    input: string;
    line?: number;
    lineEnd?: number;
}

/** Internal Vim state attached to a CM adapter. */
export interface VimState {
    mode?: string;
    insertMode?: boolean;
    visualMode?: boolean;
    visualLine?: boolean;
    visualBlock?: boolean;
    lastSelection?: unknown;
    inputState?: {
        keyBuffer: string[];
        [key: string]: unknown;
    };
    marks?: Record<string, { find(): VimPos | undefined; clear(): void }>;
    status?: string;
}

/** Keymap entry types used by Vim.mapCommand. */
export type KeymapType =
    | 'motion'
    | 'action'
    | 'operator'
    | 'operatorMotion'
    | 'keyToKey';

/** Context for key mappings. */
export type MapContext = 'normal' | 'visual' | 'insert';

/**
 * Motion function signature.
 * Return a single VimPos for cursor motions, or [VimPos, VimPos] for text objects (ranges).
 */
export type MotionFn = (
    cm: CmAdapter,
    head: VimPos,
    motionArgs: MotionArgs,
    vim: VimState,
    inputState: unknown,
) => VimPos | [VimPos, VimPos] | Promise<VimPos | null> | null | undefined;

/** Operator function signature. */
export type OperatorFn = (
    cm: CmAdapter,
    operatorArgs: OperatorArgs,
    ranges: OperatorRange[],
    oldAnchor: VimPos,
    newHead: VimPos,
) => VimPos | void;

/** Action function signature. */
export type ActionFn = (
    cm: CmAdapter,
    actionArgs: ActionArgs,
    vim: VimState,
) => void;

/** Ex command function signature. */
export type ExCommandFn = (cm: CmAdapter, params: ExCommandArgs) => void;

/**
 * The CM5-compat adapter wrapping a CM6 EditorView.
 * Accessed via (view.editor as any).cm in Obsidian.
 */
export interface CmAdapter {
    /** The CM6 EditorView. Available on the adapter as a public field. */
    cm6: import('@codemirror/view').EditorView;

    /** Internal Vim state. */
    state: {
        vim?: VimState;
    };

    getCursor(start?: string): VimPos;
    setCursor(line: number, ch: number): void;
    getLine(n: number): string;
    lineCount(): number;
    getSelection(): string;
    replaceSelection(text: string): void;
    replaceRange(
        text: string,
        from: VimPos,
        to?: VimPos,
        origin?: string,
    ): void;
    getRange(from: VimPos, to: VimPos): string;
    firstLine(): number;
    lastLine(): number;
    indexFromPos(pos: VimPos): number;
    posFromIndex(offset: number): VimPos;

    /** Subscribe to CM5-compat events. */
    on(event: 'vim-mode-change', handler: (mode: VimModeChange) => void): void;
    on(event: 'vim-keypress', handler: (key: string) => void): void;
    on(event: 'vim-command-done', handler: () => void): void;

    /** Unsubscribe from CM5-compat events. */
    off(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * The global Vim API singleton.
 * Accessed via window.CodeMirrorAdapter.Vim in Obsidian.
 */
export interface VimApi {
    defineMotion(name: string, fn: MotionFn): void;
    defineAction(name: string, fn: ActionFn): void;
    getAction?(name: string): ActionFn | undefined;
    defineOperator(name: string, fn: OperatorFn): void;
    defineEx(name: string, shortName: string, fn: ExCommandFn): void;

    map(lhs: string, rhs: string, context?: MapContext): void;
    noremap(lhs: string, rhs: string, context?: MapContext): void;
    unmap(
        lhs: string,
        context?: MapContext,
        options?: { includeDefaults?: boolean },
    ): boolean;

    mapCommand(
        keys: string,
        type: KeymapType,
        name: string,
        args?: Record<string, unknown>,
        extra?: Record<string, unknown>,
    ): void;

    removeMapCommand?(keys: string): boolean;

    handleKey(cm: CmAdapter, key: string, origin?: string): boolean;
    handleEx(cm: CmAdapter, input: string): void;

    defineOption(
        name: string,
        defaultValue: unknown,
        type: string,
        aliases?: string[],
        callback?: (value: unknown, cm: CmAdapter) => void,
    ): void;

    clearInputState?(cm: CmAdapter, reason?: string): void;
    resetKeymap?(): void;

    setOption(name: string, value: unknown): void;
    getOption(name: string): unknown;

    getVimGlobalState_(): Record<string, unknown>;

    getInputState(cm: CmAdapter): {
        prefixRepeat: string[];
        motionRepeat: string[];
        operator: string | undefined | null;
        operatorArgs: OperatorArgs | undefined | null;
        motion: string | undefined | null;
        motionArgs: MotionArgs | undefined | null;
        keyBuffer: string[];
        registerName?: string;
        operatorShortcut?: string;
        selectedCharacter?: string;
        pushRepeatDigit(n: string): void;
        getRepeat(): number;
    };

    getLastEditInfo(cm: CmAdapter): {
        inputState: unknown;
        actionCommand: unknown;
    };

    getSearchState(cm: CmAdapter):
        | {
              setReversed(reversed: boolean): void;
              isReversed(): boolean | undefined;
              getQuery(): RegExp;
              setQuery(query: string | RegExp): void;
          }
        | undefined;

    getJumpList(): {
        cachedCursor?: VimPos;
        head: number;
        tail: number;
        length: number;
    };

    getMacroState(): {
        latestRegister?: string;
        isPlaying: boolean;
        isRecording: boolean;
        replaySearchQueries: unknown[];
        onRecordingDone?: unknown;
        lastInsertModeChanges: unknown;
    };

    getRegisterController(): {
        registers: Record<
            string,
            {
                toString(): string;
                keyBuffer: string[];
                linewise: boolean;
                blockwise: boolean;
            }
        >;
    };

    getKeymap(context?: string): Array<{
        keys: string;
        type: string;
        context?: string;
        operator?: string;
        operatorArgs?: Record<string, unknown>;
        motion?: string;
        motionArgs?: Record<string, unknown>;
        action?: string;
        actionArgs?: Record<string, unknown>;
        toKeys?: string;
        isEdit?: boolean;
        searchArgs?: Record<string, unknown>;
        operatorPending?: boolean;
    }>;

    getCompletions(
        prefix: string,
        context?: string,
    ): Array<{
        keys: string;
        suffix: string;
        type: string;
        context?: string;
        operator?: string;
        motion?: string;
        action?: string;
        toKeys?: string;
        searchArgs?: Record<string, unknown>;
        operatorPending?: boolean;
    }>;
}

/**
 * Augment the global Window with CodeMirrorAdapter.
 */
declare global {
    interface Window {
        CodeMirrorAdapter?: {
            Vim?: VimApi;
        };
    }
}
