import type { App, Editor, Plugin } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimModeChange } from '../types/vim-api';
import type { ModePrompts } from '../settings';
import { getCmAdapter, getVimApi } from './vim-api';
import {
    getActiveTableCellEditorView,
    hasActiveTableCell,
} from './native-table-adapter';
import { countSearchMatches, formatSearchCount } from './search-counter';
import { invariant } from '../util/invariant';

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
    private searchCountEl: HTMLElement | null = null;
    private modeLabels: Record<string, string>;
    private currentMode = 'normal';
    private recording: string | null = null;
    private modeHandler: ((mode: VimModeChange) => void) | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private lastAdapter: CmAdapter | null = null;
    private dialogHandler: (() => void) | null = null;
    private preDialogMode: string | null = null;
    private cellEditorActive = false;
    private cellEditorTimer: number | null = null;
    private app: App | null = null;
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
        this.searchCountEl = plugin.addStatusBarItem();
        this.searchCountEl.addClass('vim-motions-search-count');
        this.searchCountEl.hide();
        const lastEl =
            this.searchCountEl ?? this.chordBarEl ?? this.statusBarEl;
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
        this.app = app;
        const modeHandler = (mode: VimModeChange) => {
            if (
                this.cellEditorActive ||
                (this.app && hasActiveTableCell(this.app))
            )
                return;
            const resolved = this.resolveMode(mode.mode, mode.subMode);
            invariant(
                resolved in DEFAULT_MODE_LABELS,
                `Invalid vim mode: "${resolved}" (raw: mode="${mode.mode}", subMode="${mode.subMode}")`,
            );
            this.currentMode = resolved;
            if (mode.mode !== 'normal') {
                this.hideSearchCount();
            }
            this.syncRecordingState();
            this.updateDisplay();
            this.syncChord();
        };
        this.modeHandler = modeHandler;

        const keyHandler = (key?: string) => {
            this.syncRecordingState();
            this.syncChord();
            if (key === '<Esc>' && this.currentMode === 'normal') {
                this.clearNativeHighlights();
            }
        };
        this.keyHandler = keyHandler;

        const dialogHandler = () => {
            const dialog = this.lastAdapter?.state?.dialog;
            if (dialog) {
                const prefix = this.getDialogPrefix(dialog);
                if (prefix === ':') {
                    invariant(
                        this.preDialogMode === null,
                        `Entering command mode but preDialogMode already set to "${this.preDialogMode}"`,
                    );
                    this.preDialogMode = this.currentMode;
                    this.currentMode = 'command';
                } else if (prefix === '/' || prefix === '?') {
                    invariant(
                        this.preDialogMode === null,
                        `Entering search mode but preDialogMode already set to "${this.preDialogMode}"`,
                    );
                    this.preDialogMode = this.currentMode;
                    this.currentMode = 'search';
                }
            } else if (this.preDialogMode) {
                invariant(
                    this.currentMode === 'command' ||
                        this.currentMode === 'search',
                    `Restoring preDialogMode but currentMode is "${this.currentMode}", expected command or search`,
                );
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
            this.syncModeFromAdapter(adapter);
        });

        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const adapter = getCmAdapter(view);
            if (adapter) {
                attachToAdapter(adapter);
            }
        }

        this.startCellEditorMonitor();
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

    private startCellEditorMonitor(): void {
        if (this.cellEditorTimer !== null) return;
        this.cellEditorTimer = window.setInterval(() => {
            if (!this.app) return;
            const active = hasActiveTableCell(this.app);
            if (!active) {
                if (this.cellEditorActive) {
                    this.cellEditorActive = false;
                    const fallback = this.lastAdapter?.state?.vim?.mode;
                    if (fallback) {
                        this.currentMode = this.resolveMode(fallback);
                    }
                    this.syncRecordingState();
                    this.updateDisplay();
                }
                return;
            }

            const editorView = getActiveTableCellEditorView(this.app);
            if (!editorView) return;
            const adapter = (editorView as unknown as Record<string, unknown>)
                .cm as { state?: { vim?: { mode?: string } } } | undefined;
            const mode = adapter?.state?.vim?.mode ?? null;
            if (!mode) return;
            const resolved = this.resolveMode(mode);
            if (!this.cellEditorActive || resolved !== this.currentMode) {
                this.cellEditorActive = true;
                this.currentMode = resolved;
                this.syncRecordingState();
                this.updateDisplay();
            }
        }, 50);
    }

    private syncModeFromAdapter(adapter: CmAdapter): void {
        const vim = adapter.state?.vim;
        if (!vim) return;
        const vimAny = vim as Record<string, unknown>;
        let resolved: string;
        if (vim.selectMode) {
            resolved = 'select';
        } else if (vim.insertMode && vim.virtualReplace) {
            resolved = 'vreplace';
        } else if (vim.insertMode) {
            resolved = 'insert';
        } else if (vim.visualLine) {
            resolved = 'visualLine';
        } else if (vim.visualBlock) {
            resolved = 'visualBlock';
        } else if (vim.visualMode) {
            resolved = 'visual';
        } else if (vimAny['insertModeReturn']) {
            resolved = 'insertNormal';
        } else {
            resolved = 'normal';
        }
        this.currentMode = resolved;
        this.preDialogMode = null;
        this.updateDisplay();
    }

    private resolveMode(mode: string, subMode?: string | null): string {
        if (mode === 'visual' && subMode === 'linewise') {
            return 'visualLine';
        }
        if (mode === 'visual' && subMode === 'blockwise') {
            return 'visualBlock';
        }
        if (mode === 'normal' && subMode?.startsWith('ctrl-o')) {
            return 'insertNormal';
        }
        return mode;
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
        if (this.chordBarEl) {
            const adapter = this.lastAdapter;
            if (adapter) {
                const vim = adapter.state.vim;
                const chord =
                    (vim as unknown as { status?: string })?.status ?? '';
                this.chordBarEl.setText(chord);
            }
        }
        this.syncSearchCount();
    }

    private syncSearchCount(): void {
        if (!this.searchCountEl) return;
        const adapter = this.lastAdapter;
        if (!adapter) {
            this.hideSearchCount();
            return;
        }
        const count = countSearchMatches(adapter);
        if (count && count.total > 0 && count.cursorOnMatch) {
            this.searchCountEl.setText(formatSearchCount(count));
            this.searchCountEl.show();
        } else {
            this.hideSearchCount();
        }
    }

    private hideSearchCount(): void {
        if (!this.searchCountEl) return;
        this.searchCountEl.setText('');
        this.searchCountEl.hide();
    }

    private clearNativeHighlights(): void {
        if (!this.app) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor: Editor = view.editor;
        if (editor.hasHighlight('is-flashing')) {
            editor.removeHighlights('is-flashing');
        }
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
        if (this.cellEditorTimer !== null) {
            window.clearInterval(this.cellEditorTimer);
            this.cellEditorTimer = null;
        }
        this.statusBarEl.remove();
        this.chordBarEl?.remove();
        this.searchCountEl?.remove();
    }
}
