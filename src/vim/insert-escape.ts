import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter, VimApi } from '../types/vim-api';
import { getCmAdapter } from './vim-api';

const DEFAULT_TIMEOUT = 1000;

export class InsertEscapeHandler {
    private lastKeyTime = 0;
    private sequence = '';
    private app: App;
    private vim: VimApi;
    private boundKeydown: ((e: KeyboardEvent) => void) | null = null;
    private leafChangeRef: ReturnType<App['workspace']['on']> | null = null;

    private get timeout(): number {
        const val = this.vim.getOption('insertmodeescapetimeout') as
            | number
            | undefined;
        return typeof val === 'number' && val > 0 ? val : DEFAULT_TIMEOUT;
    }

    constructor(app: App, vim: VimApi) {
        this.app = app;
        this.vim = vim;
    }

    attach(): void {
        const onKeydown = (e: KeyboardEvent) => {
            this.onKeyDown(e);
        };
        this.boundKeydown = onKeydown;

        const attachToView = () => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const editorEl = (view.editor as unknown as Record<string, unknown>)
                .cm as { dom?: HTMLElement } | undefined;
            const dom = editorEl?.dom;
            if (dom) {
                dom.addEventListener('keydown', onKeydown, true);
            }
        };

        this.leafChangeRef = this.app.workspace.on('active-leaf-change', () => {
            attachToView();
        });

        attachToView();
    }

    destroy(): void {
        if (this.boundKeydown) {
            const docs = new Set<Document>();
            this.app.workspace.iterateAllLeaves((leaf) => {
                const doc = leaf.view?.containerEl?.ownerDocument;
                if (doc) docs.add(doc);
            });
            for (const doc of docs) {
                doc.querySelectorAll('.cm-editor').forEach((el) => {
                    el.removeEventListener(
                        'keydown',
                        this.boundKeydown as EventListener,
                        true,
                    );
                });
            }
            this.boundKeydown = null;
        }
        if (this.leafChangeRef) {
            this.app.workspace.offref(this.leafChangeRef);
            this.leafChangeRef = null;
        }
    }

    private getActiveAdapter(): CmAdapter | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return null;
        return getCmAdapter(view);
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;

        const adapter = this.getActiveAdapter();
        if (!adapter) return;
        const vimState = adapter.state.vim;
        if (!vimState || vimState.mode !== 'insert') {
            this.sequence = '';
            return;
        }

        const escapeSeq = this.vim.getOption('insertmodeescape') as
            | string
            | undefined;
        if (!escapeSeq || escapeSeq.length < 2) return;

        const now = Date.now();
        if (now - this.lastKeyTime > this.timeout) {
            this.sequence = '';
        }
        this.lastKeyTime = now;
        this.sequence += e.key;

        if (this.sequence.length >= escapeSeq.length) {
            const tail = this.sequence.slice(-escapeSeq.length);
            if (tail === escapeSeq) {
                e.preventDefault();
                e.stopPropagation();
                for (let i = 0; i < escapeSeq.length; i++) {
                    this.vim.handleKey(adapter, '<BS>');
                }
                this.vim.handleKey(adapter, '<Esc>');
                this.sequence = '';
            }
        }
    }
}
