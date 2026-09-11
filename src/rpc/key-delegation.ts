import { Notice, MarkdownView, type App, type EventRef } from 'obsidian';
import {
    setKeyInterceptActive,
    isKeyInterceptActive,
} from '@replit/codemirror-vim';
import { runCleanups } from '../util/cleanup';
import { FRONTMATTER_DELIMITER } from '../fold/frontmatter';
import { getVaultConfig } from '../util/vault';
import { getEditorView } from '../util/editor';
import type { MsgpackRpcClient } from './msgpack-rpc';
import type { NeovimDocumentSync } from './document-sync';

const specialKeys: Record<string, string> = {
    Backspace: 'BS',
    Delete: 'Del',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    End: 'End',
    Enter: 'CR',
    Escape: 'Esc',
    Home: 'Home',
    Insert: 'Insert',
    PageDown: 'PageDown',
    PageUp: 'PageUp',
    Tab: 'Tab',
};

const modifierKeys = new Set([
    'Alt',
    'AltGraph',
    'CapsLock',
    'Control',
    'Fn',
    'FnLock',
    'Meta',
    'NumLock',
    'ScrollLock',
    'Shift',
    'Symbol',
    'SymbolLock',
]);

function keyNotation(event: KeyboardEvent): string | null {
    if (modifierKeys.has(event.key)) return null;
    let key = specialKeys[event.key];
    if (!key && /^F(?:[1-9]|1[0-2])$/.test(event.key)) key = event.key;
    const altGraph = event.getModifierState('AltGraph');
    const modifiers = altGraph
        ? ''
        : `${event.ctrlKey ? 'C-' : ''}${event.altKey ? 'A-' : ''}${event.metaKey ? 'D-' : ''}${event.shiftKey && key ? 'S-' : ''}`;
    if (key) return `<${modifiers}${key}>`;
    if (event.key === '<' && !modifiers) return '<LT>';
    if (Array.from(event.key).length !== 1) return null;
    return modifiers ? `<${modifiers}${event.key}>` : event.key;
}

type NeovimMode = { mode?: unknown };

export class NeovimKeyDelegation {
    private editorContent: HTMLElement | null = null;
    private leafChangeRef: EventRef | null = null;
    private readonly pendingInputs = new Set<Promise<unknown>>();
    private settleOperation = 0;
    private active = false;
    private failureReported = false;
    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (
            event.isComposing ||
            (event as unknown as { keyCode?: number }).keyCode === 229
        )
            return;
        if (
            event
                .composedPath()
                .some(
                    (target) =>
                        target instanceof Element &&
                        target.closest('.metadata-container') !== null,
                )
        )
            return;
        if (isKeyInterceptActive()) {
            event.preventDefault();
            event.stopPropagation();
        }
        const notation = keyNotation(event);
        if (!notation) return;
        const operation = ++this.settleOperation;
        const input = this.documentSync
            .prepareKeyInput()
            .then(() => this.rpc.request('nvim_input', [notation]));
        this.pendingInputs.add(input);
        void input
            .then(() => this.syncState(operation))
            .catch((error: unknown) => this.reportFailure(error))
            .finally(() => this.pendingInputs.delete(input));
    };

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
        private readonly documentSync: NeovimDocumentSync,
        private readonly onMode: (mode: string) => void,
    ) {}

    start(): void {
        if (this.active) return;
        this.active = true;
        try {
            this.installEditorHandler();
            this.leafChangeRef = this.app.workspace.on(
                'active-leaf-change',
                () => this.installEditorHandler(),
            );
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    dispose(): void {
        if (!this.active && !isKeyInterceptActive()) return;
        this.active = false;
        const content = this.editorContent;
        const leafChangeRef = this.leafChangeRef;
        this.editorContent = null;
        this.leafChangeRef = null;
        runCleanups(
            [
                () =>
                    content?.removeEventListener(
                        'keydown',
                        this.onKeydown,
                        true,
                    ),
                () => {
                    if (leafChangeRef) this.app.workspace.offref(leafChangeRef);
                },
                () => setKeyInterceptActive(false),
            ],
            'Neovim key delegation',
        );
    }

    isActive(): boolean {
        return this.active;
    }

    getHandlerState(): {
        active: boolean;
        handlerAttached: boolean;
        keyInterceptActive: boolean;
    } {
        return {
            active: this.active,
            handlerAttached: this.editorContent !== null,
            keyInterceptActive: isKeyInterceptActive(),
        };
    }

    async flush(): Promise<void> {
        await Promise.all(this.pendingInputs);
        await this.syncState(++this.settleOperation);
    }

    private installEditorHandler(): void {
        this.editorContent?.removeEventListener(
            'keydown',
            this.onKeydown,
            true,
        );
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editorView = view ? getEditorView(view) : null;
        this.editorContent = editorView?.contentDOM ?? null;
        this.editorContent?.addEventListener('keydown', this.onKeydown, true);
        setKeyInterceptActive(this.editorContent !== null);
    }

    private async syncState(operation: number): Promise<void> {
        const modeValue = (await this.rpc.request(
            'nvim_get_mode',
            [],
        )) as NeovimMode;
        const cursor = await this.rpc.request('nvim_win_get_cursor', [0]);
        if (!this.active || operation !== this.settleOperation) return;
        if (typeof modeValue.mode === 'string') this.onMode(modeValue.mode);
        if (
            Array.isArray(cursor) &&
            typeof cursor[0] === 'number' &&
            typeof cursor[1] === 'number'
        ) {
            const cursorLine = cursor[0];
            const cursorColumn = cursor[1];
            const resolvedCursor = await this.resolveFoldCursor([
                cursorLine,
                cursorColumn,
            ]);
            if (!this.active || operation !== this.settleOperation) return;
            this.documentSync.syncCursor(resolvedCursor[0], resolvedCursor[1]);
        }
    }

    private async resolveFoldCursor(
        cursor: [number, number],
    ): Promise<[number, number]> {
        const foldStart = await this.rpc.request('nvim_call_function', [
            'foldclosed',
            [cursor[0]],
        ]);
        if (typeof foldStart !== 'number' || foldStart === -1) return cursor;
        if (
            foldStart !== 1 ||
            getVaultConfig(this.app, 'propertiesInDocument') === 'source'
        )
            return cursor;
        const firstLine = await this.rpc.request('nvim_buf_get_lines', [
            0,
            0,
            1,
            true,
        ]);
        if (
            !Array.isArray(firstLine) ||
            typeof firstLine[0] !== 'string' ||
            !FRONTMATTER_DELIMITER.test(firstLine[0])
        )
            return cursor;
        const [foldEnd, lineCount] = await Promise.all([
            this.rpc.request('nvim_call_function', [
                'foldclosedend',
                [cursor[0]],
            ]),
            this.rpc.request('nvim_buf_line_count', [0]),
        ]);
        if (
            typeof foldEnd !== 'number' ||
            typeof lineCount !== 'number' ||
            foldEnd + 1 > lineCount
        )
            return cursor;
        const resolved: [number, number] = [foldEnd + 1, 0];
        await this.rpc.request('nvim_win_set_cursor', [0, resolved]);
        return resolved;
    }

    private reportFailure(error: unknown): void {
        if (this.failureReported || !this.active) return;
        this.failureReported = true;
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Vim Motions: Neovim key delegation failed: ${message}`);
    }
}
