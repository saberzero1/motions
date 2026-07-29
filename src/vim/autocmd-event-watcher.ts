import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { getCmAdapterFromEditorView } from './vim-api';
import { getDialogPrefix } from './mode-tracker';
import type { CmAdapter, VimYankEvent } from '../types/vim-api';

export interface AutocmdEventCallbacks {
    onCursorMoved: (filePath: string) => void;
    onCursorHold: (filePath: string) => void;
    onTextYankPost: (filePath: string, payload: VimYankEvent) => void;
    onCmdlineEnter: (filePath: string, cmdtype: string) => void;
    onCmdlineLeave: (filePath: string, cmdtype: string) => void;
}

let callbacks: AutocmdEventCallbacks | null = null;
let cursorHoldDelay = 4000;

class AutocmdEventWatcher implements PluginValue {
    private adapter: CmAdapter | null = null;
    private destroyed = false;
    private lastLine = -1;
    private lastCh = -1;
    private cursorHoldTimer: number | null = null;
    private dialogOpen = false;
    private cmdlinePrefix: string | null = null;

    private commandDoneHandler: (() => void) | null = null;
    private yankHandler: ((payload: VimYankEvent) => void) | null = null;
    private dialogHandler: (() => void) | null = null;

    constructor(private view: EditorView) {
        this.tryBind();
    }

    update(_update: ViewUpdate): void {
        if (this.destroyed) return;
        if (!this.adapter) {
            this.tryBind();
            return;
        }
        const current = getCmAdapterFromEditorView(this.view);
        if (current && current !== this.adapter) {
            this.unbind();
            this.adapter = current;
            this.bind();
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.unbind();
        this.clearHoldTimer();
    }

    private tryBind(): void {
        const adapter = getCmAdapterFromEditorView(this.view);
        if (!adapter) return;
        this.adapter = adapter;
        this.bind();
    }

    private bind(): void {
        if (!this.adapter) return;

        this.commandDoneHandler = () => {
            if (this.destroyed) return;
            const cursor = this.adapter?.getCursor();
            if (!cursor) return;
            if (cursor.line !== this.lastLine || cursor.ch !== this.lastCh) {
                this.lastLine = cursor.line;
                this.lastCh = cursor.ch;
                const filePath = this.getFilePath();
                callbacks?.onCursorMoved(filePath);

                this.clearHoldTimer();
                this.cursorHoldTimer = window.setTimeout(() => {
                    this.cursorHoldTimer = null;
                    if (this.destroyed) return;
                    callbacks?.onCursorHold(this.getFilePath());
                }, cursorHoldDelay);
            }
        };
        this.adapter.on('vim-command-done', this.commandDoneHandler);

        this.yankHandler = (payload: VimYankEvent) => {
            if (this.destroyed) return;
            callbacks?.onTextYankPost(this.getFilePath(), payload);
        };
        this.adapter.on('vim-yank', this.yankHandler);

        this.dialogHandler = () => {
            if (this.destroyed) return;
            const dialog = this.adapter?.state?.dialog;
            if (dialog) {
                if (!this.dialogOpen) {
                    const prefix = getDialogPrefix(dialog);
                    if (prefix) {
                        this.dialogOpen = true;
                        this.cmdlinePrefix = prefix;
                        callbacks?.onCmdlineEnter(this.getFilePath(), prefix);
                    }
                }
            } else if (this.dialogOpen) {
                this.dialogOpen = false;
                const prefix = this.cmdlinePrefix ?? ':';
                this.cmdlinePrefix = null;
                callbacks?.onCmdlineLeave(this.getFilePath(), prefix);
            }
        };
        this.adapter.on('dialog', this.dialogHandler);
    }

    private unbind(): void {
        if (this.adapter) {
            if (this.commandDoneHandler) {
                this.adapter.off('vim-command-done', this.commandDoneHandler);
            }
            if (this.yankHandler) {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- off() expects generic handler signature
                this.adapter.off(
                    'vim-yank',
                    this.yankHandler as (...args: unknown[]) => void,
                );
            }
            if (this.dialogHandler) {
                this.adapter.off('dialog', this.dialogHandler);
            }
        }
        this.adapter = null;
        this.commandDoneHandler = null;
        this.yankHandler = null;
        this.dialogHandler = null;
        this.dialogOpen = false;
        this.cmdlinePrefix = null;
        this.clearHoldTimer();
    }

    private clearHoldTimer(): void {
        if (this.cursorHoldTimer !== null) {
            window.clearTimeout(this.cursorHoldTimer);
            this.cursorHoldTimer = null;
        }
    }

    private getFilePath(): string {
        try {
            const info = this.view.state.field(editorInfoField, false);
            if (info && 'file' in info) {
                const file = (info as { file?: { path?: string } }).file;
                return file?.path ?? '';
            }
        } catch {
            // editorInfoField not available
        }
        return '';
    }
}

export function setAutocmdEventCallbacks(cbs: AutocmdEventCallbacks): void {
    callbacks = cbs;
}

export function clearAutocmdEventCallbacks(): void {
    callbacks = null;
}

export function setAutocmdEventHoldDelay(ms: number): void {
    cursorHoldDelay = ms;
}

export function createAutocmdEventExtension(): Extension {
    return ViewPlugin.fromClass(AutocmdEventWatcher);
}
