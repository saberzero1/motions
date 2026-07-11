import type { App, Plugin } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimModeChange } from '../types/vim-api';
import type { ModePrompts } from '../settings';
import { getCmAdapter, getVimApi } from './vim-api';

const DEFAULT_MODE_LABELS: Record<string, string> = {
    normal: 'NORMAL',
    insert: 'INSERT',
    visual: 'VISUAL',
    visualLine: 'V-LINE',
    visualBlock: 'V-BLOCK',
    replace: 'REPLACE',
    select: 'SELECT',
    vreplace: 'V-REPLACE',
    command: 'COMMAND',
    search: 'SEARCH',
    insertNormal: 'NORMAL',
};

export function getDialogPrefix(dialog: HTMLElement): string | null {
    const firstSpan = dialog.querySelector('span');
    if (!firstSpan) return null;
    for (const child of Array.from(firstSpan.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim();
            if (text === ':' || text === '/' || text === '?') {
                return text;
            }
            return null;
        }
    }
    return null;
}

export interface VimModeTrackerOptions {
    chordDisplay: boolean;
    powerline: boolean;
    modePrompts: ModePrompts;
}

export class VimModeTracker {
    private statusBarEl: HTMLElement;
    private chordBarEl: HTMLElement | null = null;
    private modeLabels: Record<string, string>;
    private currentMode = 'normal';
    private recording: string | null = null;
    private modeHandler: ((mode: VimModeChange) => void) | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private lastAdapter: CmAdapter | null = null;
    private dialogHandler: (() => void) | null = null;
    private preDialogMode: string | null = null;
    constructor(plugin: Plugin, options?: VimModeTrackerOptions) {
        this.modeLabels = options?.modePrompts
            ? { ...options.modePrompts }
            : { ...DEFAULT_MODE_LABELS };
        this.statusBarEl = plugin.addStatusBarItem();
        this.statusBarEl.addClass('vim-motions-mode');
        if (options?.powerline) {
            this.statusBarEl.addClass('vim-motions-powerline');
        }
        if (options?.chordDisplay) {
            this.chordBarEl = plugin.addStatusBarItem();
            this.chordBarEl.addClass('vim-motions-chord');
        }
        const lastEl = this.chordBarEl ?? this.statusBarEl;
        lastEl.addClass('vim-motions-statusbar-end');
        const statusBar = this.statusBarEl.parentElement;
        if (statusBar) {
            statusBar.insertBefore(this.statusBarEl, statusBar.firstChild);
            if (this.chordBarEl) {
                statusBar.insertBefore(
                    this.chordBarEl,
                    this.statusBarEl.nextSibling,
                );
            }
        }
        this.updateDisplay();
    }

    attach(app: App): void {
        const modeHandler = (mode: VimModeChange) => {
            if (mode.mode === 'visual' && mode.subMode === 'linewise') {
                this.currentMode = 'visualLine';
            } else if (mode.mode === 'visual' && mode.subMode === 'blockwise') {
                this.currentMode = 'visualBlock';
            } else if (
                mode.mode === 'normal' &&
                mode.subMode?.startsWith('ctrl-o')
            ) {
                this.currentMode = 'insertNormal';
            } else {
                this.currentMode = mode.mode;
            }
            this.syncRecordingState();
            this.updateDisplay();
            this.syncChord();
        };
        this.modeHandler = modeHandler;

        const keyHandler = () => {
            this.syncRecordingState();
            this.syncChord();
        };
        this.keyHandler = keyHandler;

        const dialogHandler = () => {
            const dialog = this.lastAdapter?.state?.dialog;
            if (dialog) {
                const prefix = this.getDialogPrefix(dialog);
                if (prefix === ':') {
                    this.preDialogMode = this.currentMode;
                    this.currentMode = 'command';
                } else if (prefix === '/' || prefix === '?') {
                    this.preDialogMode = this.currentMode;
                    this.currentMode = 'search';
                }
            } else if (this.preDialogMode) {
                this.currentMode = this.preDialogMode;
                this.preDialogMode = null;
            }
            this.updateDisplay();
        };
        this.dialogHandler = dialogHandler;

        const attachToAdapter = (adapter: CmAdapter) => {
            this.lastAdapter = adapter;
            adapter.on('vim-mode-change', modeHandler);
            adapter.on('vim-keypress', keyHandler);
            adapter.on('vim-command-done', keyHandler);
            adapter.on('dialog', dialogHandler);
        };

        app.workspace.on('active-leaf-change', () => {
            this.detachFromAdapter();
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const adapter = getCmAdapter(view);
            if (!adapter) return;
            attachToAdapter(adapter);
        });

        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const adapter = getCmAdapter(view);
            if (adapter) {
                attachToAdapter(adapter);
            }
        }
    }

    private detachFromAdapter(): void {
        if (this.lastAdapter) {
            if (this.modeHandler) {
                this.lastAdapter.off(
                    'vim-mode-change',
                    this.modeHandler as (...args: unknown[]) => void,
                );
            }
            if (this.keyHandler) {
                this.lastAdapter.off(
                    'vim-keypress',
                    this.keyHandler as (...args: unknown[]) => void,
                );
                this.lastAdapter.off(
                    'vim-command-done',
                    this.keyHandler as (...args: unknown[]) => void,
                );
            }
            if (this.dialogHandler) {
                this.lastAdapter.off('dialog', this.dialogHandler);
            }
            this.lastAdapter = null;
        }
    }

    /**
     * Sync chord display from codemirror-vim's `vim.status` — the
     * authoritative pending-keystroke string.  We read it rather than
     * accumulating keystrokes ourselves because `vim-keypress` fires
     * *after* command processing in the CM6 adapter, so `vim.status`
     * is already cleared for completed commands.
     */
    private syncRecordingState(): void {
        const vim = getVimApi();
        if (!vim?.getMacroState) return;
        const macro = vim.getMacroState();
        const prev = this.recording;
        this.recording = macro.isRecording
            ? (macro.latestRegister ?? '?')
            : null;
        if (this.recording !== prev) {
            this.updateDisplay();
        }
    }

    private syncChord(): void {
        if (!this.chordBarEl) return;
        const adapter = this.lastAdapter;
        if (!adapter) return;
        const vim = adapter.state.vim;
        const chord = (vim as unknown as { status?: string })?.status ?? '';
        this.chordBarEl.setText(chord);
    }

    setGlobalChord(text: string): void {
        if (!this.chordBarEl) return;
        if (this.lastAdapter) return;
        this.chordBarEl.setText(text);
    }

    private updateDisplay(): void {
        const modeLabel =
            this.modeLabels[this.currentMode] ??
            DEFAULT_MODE_LABELS[this.currentMode] ??
            this.currentMode.toUpperCase();
        const recordLabel = this.recording
            ? ` RECORDING @${this.recording}`
            : '';
        this.statusBarEl.setText(modeLabel + recordLabel);
        this.statusBarEl.dataset['vimMode'] = this.modeToDataAttr(
            this.currentMode,
        );
    }

    private modeToDataAttr(mode: string): string {
        const map: Record<string, string> = {
            visualLine: 'v-line',
            visualBlock: 'v-block',
            insertNormal: 'insert-normal',
        };
        return map[mode] ?? mode;
    }

    private getDialogPrefix(dialog: HTMLElement): string | null {
        return getDialogPrefix(dialog);
    }

    destroy(): void {
        this.detachFromAdapter();
        this.statusBarEl.remove();
        this.chordBarEl?.remove();
    }
}
