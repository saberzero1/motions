import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';

export interface LeaderBinding {
    key: string;
    command: string;
}

const SHOW_DELAY = 500;

export class WhichKeyOverlay {
    private app: App;
    private leaderKey: string;
    private bindings: LeaderBinding[];
    private overlay: HTMLElement | null = null;
    private showTimer: number | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private lastAdapter: CmAdapter | null = null;
    private pendingLeader = false;

    constructor(app: App, leaderKey: string, bindings: LeaderBinding[]) {
        this.app = app;
        this.leaderKey = leaderKey;
        this.bindings = bindings;
    }

    attach(): void {
        if (this.bindings.length === 0) return;

        const handler = (key: string) => {
            this.onKeyPress(key);
        };
        this.keyHandler = handler;

        this.app.workspace.on('active-leaf-change', () => {
            this.detachAdapter();
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

    private detachAdapter(): void {
        if (this.lastAdapter && this.keyHandler) {
            this.lastAdapter.off(
                'vim-keypress',
                this.keyHandler as (...args: unknown[]) => void,
            );
            this.lastAdapter = null;
        }
    }

    destroy(): void {
        this.detachAdapter();
        this.dismiss();
    }

    private onKeyPress(key: string): void {
        if (!this.lastAdapter) return;
        const mode = this.lastAdapter.state.vim?.mode;
        if (mode !== 'normal') {
            this.dismiss();
            return;
        }

        if (key === this.leaderKey && !this.pendingLeader) {
            this.pendingLeader = true;
            this.showTimer = window.setTimeout(() => {
                if (this.pendingLeader) {
                    this.show();
                }
            }, SHOW_DELAY);
            return;
        }

        if (this.pendingLeader) {
            this.dismiss();
            return;
        }
    }

    private show(): void {
        this.dismiss();

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editorEl = (
            view.editor as unknown as { cm: { cm6: { dom: HTMLElement } } }
        )?.cm?.cm6?.dom;
        if (!editorEl) return;

        this.overlay = createDiv({ cls: 'vim-motions-which-key' });

        this.overlay.createEl('div', {
            cls: 'vim-motions-which-key-title',
            text: `${this.leaderKey} \u2026`,
        });

        const grid = this.overlay.createEl('div', {
            cls: 'vim-motions-which-key-grid',
        });

        for (const binding of this.bindings) {
            const row = grid.createEl('div', {
                cls: 'vim-motions-which-key-row',
            });
            row.createEl('span', {
                cls: 'vim-motions-which-key-key',
                text: binding.key,
            });
            row.createEl('span', {
                cls: 'vim-motions-which-key-cmd',
                text: binding.command,
            });
        }

        editorEl.parentElement?.appendChild(this.overlay);
    }

    private dismiss(): void {
        this.pendingLeader = false;
        if (this.showTimer) {
            window.clearTimeout(this.showTimer);
            this.showTimer = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}

export class LeaderRegistry {
    private leaderKey = '\\';
    private bindings: LeaderBinding[] = [];

    setLeaderKey(key: string): void {
        this.leaderKey = key;
    }

    getLeaderKey(): string {
        return this.leaderKey;
    }

    addBinding(lhs: string, rhs: string): void {
        const leader = this.leaderKey;
        if (!lhs.startsWith(leader)) return;
        const key = lhs.slice(leader.length);
        if (key.length === 0) return;

        const existing = this.bindings.find((b) => b.key === key);
        if (existing) {
            existing.command = rhs;
        } else {
            this.bindings.push({ key, command: rhs });
        }
    }

    getBindings(): LeaderBinding[] {
        return [...this.bindings];
    }
}
