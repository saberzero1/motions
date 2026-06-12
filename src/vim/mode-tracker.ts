import type { App, Plugin } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimModeChange } from '../types/vim-api';
import { getCmAdapter } from './vim-api';

const MODE_LABELS: Record<string, string> = {
    normal: 'NORMAL',
    insert: 'INSERT',
    visual: 'VISUAL',
    replace: 'REPLACE',
};

export class VimModeTracker {
    private statusBarEl: HTMLElement;
    private currentMode = 'normal';
    private recording: string | null = null;
    private pendingRecord = false;
    private modeHandler: ((mode: VimModeChange) => void) | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private lastAdapter: CmAdapter | null = null;

    constructor(plugin: Plugin) {
        this.statusBarEl = plugin.addStatusBarItem();
        this.statusBarEl.addClass('vim-motions-mode');
        this.updateDisplay();
    }

    attach(app: App): void {
        const modeHandler = (mode: VimModeChange) => {
            this.currentMode = mode.mode;
            if (mode.subMode === 'linewise') {
                this.currentMode = 'visual';
            }
            this.updateDisplay();
        };
        this.modeHandler = modeHandler;

        const keyHandler = (key: string) => {
            if (this.currentMode !== 'normal' && this.currentMode !== 'visual')
                return;
            if (this.pendingRecord) {
                this.pendingRecord = false;
                if (/^[a-zA-Z0-9]$/.test(key)) {
                    this.recording = key;
                }
                this.updateDisplay();
                return;
            }
            if (key === 'q') {
                if (this.recording) {
                    this.recording = null;
                    this.updateDisplay();
                } else {
                    this.pendingRecord = true;
                }
            }
        };
        this.keyHandler = keyHandler;

        const attachToAdapter = (adapter: CmAdapter) => {
            this.lastAdapter = adapter;
            adapter.on('vim-mode-change', modeHandler);
            adapter.on('vim-keypress', keyHandler);
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
            }
            this.lastAdapter = null;
        }
    }

    private updateDisplay(): void {
        const modeLabel =
            MODE_LABELS[this.currentMode] ?? this.currentMode.toUpperCase();
        const recordLabel = this.recording
            ? ` RECORDING @${this.recording}`
            : '';
        this.statusBarEl.setText(modeLabel + recordLabel);
        this.statusBarEl.dataset['vimMode'] = this.currentMode;
    }

    destroy(): void {
        this.detachFromAdapter();
        this.statusBarEl.remove();
    }
}
