import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimApi } from '../types/vim-api';
import { getCmAdapter } from './vim-api';

const DEFAULT_TIMEOUT = 200;

export class InsertEscapeHandler {
    private lastKey = '';
    private lastKeyTime = 0;
    private sequence = '';
    private app: App;
    private vim: VimApi;
    private keyHandler: ((key: string) => void) | null = null;
    private lastAdapter: CmAdapter | null = null;

    constructor(app: App, vim: VimApi) {
        this.app = app;
        this.vim = vim;
    }

    attach(): void {
        const handler = (key: string) => {
            this.onKeyPress(key);
        };
        this.keyHandler = handler;

        this.app.workspace.on('active-leaf-change', () => {
            this.detach();
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const adapter = getCmAdapter(view);
            if (!adapter) return;
            this.lastAdapter = adapter;
            adapter.on('vim-keypress', handler);
        });

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const adapter = getCmAdapter(view);
            if (adapter) {
                this.lastAdapter = adapter;
                adapter.on('vim-keypress', handler);
            }
        }
    }

    private detach(): void {
        if (this.lastAdapter && this.keyHandler) {
            this.lastAdapter.off(
                'vim-keypress',
                this.keyHandler as (...args: unknown[]) => void,
            );
            this.lastAdapter = null;
        }
    }

    destroy(): void {
        this.detach();
    }

    private onKeyPress(key: string): void {
        if (!this.lastAdapter) return;
        const vimState = this.lastAdapter.state.vim;
        if (!vimState || vimState.mode !== 'insert') {
            this.sequence = '';
            return;
        }

        const escapeSeq = this.vim.getOption('insertmodeescape') as
            | string
            | undefined;
        if (!escapeSeq || escapeSeq.length < 2) return;

        const now = Date.now();
        if (now - this.lastKeyTime > DEFAULT_TIMEOUT) {
            this.sequence = '';
        }
        this.lastKeyTime = now;
        this.sequence += key;

        if (this.sequence.length >= escapeSeq.length) {
            const tail = this.sequence.slice(-escapeSeq.length);
            if (tail === escapeSeq) {
                for (let i = 0; i < escapeSeq.length; i++) {
                    this.vim.handleKey(this.lastAdapter, '<BS>');
                }
                this.vim.handleKey(this.lastAdapter, '<Esc>');
                this.sequence = '';
            }
        }
    }
}
