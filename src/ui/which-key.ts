import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import { getCmAdapter, getVimApi } from '../vim/vim-api';

export interface LeaderBinding {
    key: string;
    command: string;
    source: 'builtin' | 'user';
}

interface WhichKeyEntry {
    key: string;
    description: string;
}

const SHOW_DELAY = 500;

const OPERATOR_PENDING_TYPES = new Set(['motion', 'operatorMotion', 'search']);

function isValidInOperatorPending(entry: {
    type: string;
    operatorPending?: boolean;
    context?: string;
}): boolean {
    if (entry.context === 'insert') return false;
    return OPERATOR_PENDING_TYPES.has(entry.type) || !!entry.operatorPending;
}

function isSpecialKey(key: string): boolean {
    return key.startsWith('<') && key.endsWith('>');
}

function describeKeymapEntry(entry: {
    type: string;
    operator?: string;
    motion?: string;
    action?: string;
    toKeys?: string;
}): string {
    if (entry.toKeys) return entry.toKeys;
    if (entry.operator) return entry.operator;
    if (entry.motion) return entry.motion;
    if (entry.action) return entry.action;
    return entry.type;
}

function extractFirstKey(keys: string): string {
    if (keys.startsWith('<')) {
        const end = keys.indexOf('>');
        if (end !== -1) return keys.slice(0, end + 1);
    }
    return keys[0] ?? '';
}

function buildNextKeyEntries(
    entries: Array<{
        keys: string;
        type: string;
        operator?: string;
        motion?: string;
        action?: string;
        toKeys?: string;
        operatorPending?: boolean;
    }>,
): WhichKeyEntry[] {
    const groups = new Map<
        string,
        Array<{
            keys: string;
            type: string;
            operator?: string;
            motion?: string;
            action?: string;
            toKeys?: string;
        }>
    >();

    for (const entry of entries) {
        const firstKey = extractFirstKey(entry.keys);
        if (!firstKey || isSpecialKey(firstKey)) continue;
        let group = groups.get(firstKey);
        if (!group) {
            group = [];
            groups.set(firstKey, group);
        }
        group.push(entry);
    }

    const result: WhichKeyEntry[] = [];
    for (const [key, group] of groups) {
        if (group.length === 1) {
            const entry = group[0]!;
            const suffix =
                entry.keys.length > key.length
                    ? entry.keys.slice(key.length)
                    : '';
            result.push({
                key: entry.keys,
                description: describeKeymapEntry(entry),
            });
            if (suffix) {
                result[result.length - 1]!.key = key + suffix;
            }
        } else {
            const singleChar = group.filter((e) => e.keys === key);
            if (singleChar.length > 0) {
                result.push({
                    key,
                    description: describeKeymapEntry(singleChar[0]!),
                });
            }
            const multiChar = group.filter((e) => e.keys !== key);
            if (multiChar.length > 0) {
                const label =
                    singleChar.length > 0
                        ? `+${multiChar.length} more`
                        : `+${multiChar.length} keys`;
                if (singleChar.length === 0) {
                    result.push({ key, description: label });
                }
            }
        }
    }

    return result;
}

function getVimStatus(adapter: CmAdapter): string {
    const vim = adapter.state.vim as unknown as { status?: string } | undefined;
    return vim?.status ?? '';
}

function getVimContext(adapter: CmAdapter): string {
    return adapter.state.vim?.visualMode ? 'visual' : 'normal';
}

function isOperatorPending(adapter: CmAdapter): boolean {
    const vim = getVimApi();
    if (!vim || typeof vim.getInputState !== 'function') return false;
    const inputState = vim.getInputState(adapter);
    return !!inputState.operator;
}

function getKeyBuffer(adapter: CmAdapter): string {
    const vim = getVimApi();
    if (!vim || typeof vim.getInputState !== 'function') return '';
    const inputState = vim.getInputState(adapter);
    return inputState.keyBuffer.join('');
}

function getEditorContainer(app: App): HTMLElement | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    return view.contentEl;
}

export class WhichKeyOverlay {
    private app: App;
    private leaderKey: string;
    private leaderBindings: LeaderBinding[];
    private generalMode: boolean;
    private overlay: HTMLElement | null = null;
    private showTimer: number | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private commandDoneHandler: (() => void) | null = null;
    private leafChangeRef: ReturnType<typeof this.app.workspace.on> | null =
        null;
    private lastAdapter: CmAdapter | null = null;
    private pendingLeader = false;
    private lastStatus = '';

    constructor(
        app: App,
        leaderKey: string,
        leaderBindings: LeaderBinding[],
        generalMode: boolean,
    ) {
        this.app = app;
        this.leaderKey = leaderKey;
        this.leaderBindings = leaderBindings;
        this.generalMode = generalMode;
    }

    attach(): void {
        const handler = (key: string) => {
            this.onKeyPress(key);
        };
        this.keyHandler = handler;

        const doneHandler = () => {
            this.dismiss();
        };
        this.commandDoneHandler = doneHandler;

        this.leafChangeRef = this.app.workspace.on('active-leaf-change', () => {
            this.detachAdapter();
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const adapter = getCmAdapter(view);
            if (!adapter) return;
            this.lastAdapter = adapter;
            adapter.on('vim-keypress', handler);
            adapter.on('vim-command-done', doneHandler);
        });

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const adapter = getCmAdapter(view);
            if (adapter) {
                this.lastAdapter = adapter;
                adapter.on('vim-keypress', handler);
                adapter.on('vim-command-done', doneHandler);
            }
        }
    }

    private detachAdapter(): void {
        if (this.lastAdapter) {
            if (this.keyHandler) {
                this.lastAdapter.off(
                    'vim-keypress',
                    this.keyHandler as (...args: unknown[]) => void,
                );
            }
            if (this.commandDoneHandler) {
                this.lastAdapter.off(
                    'vim-command-done',
                    this.commandDoneHandler,
                );
            }
            this.lastAdapter = null;
        }
    }

    destroy(): void {
        if (this.leafChangeRef) {
            this.app.workspace.offref(this.leafChangeRef);
            this.leafChangeRef = null;
        }
        this.detachAdapter();
        this.dismiss();
    }

    private onKeyPress(key: string): void {
        if (!this.lastAdapter) return;
        const vim = this.lastAdapter.state.vim;
        if (vim?.insertMode) {
            this.dismiss();
            return;
        }

        if (this.generalMode) {
            this.onKeyPressGeneral(key);
        } else {
            this.onKeyPressLeaderOnly(key);
        }
    }

    private onKeyPressLeaderOnly(key: string): void {
        if (key === this.leaderKey && !this.pendingLeader) {
            this.pendingLeader = true;
            this.clearTimer();
            this.showTimer = window.setTimeout(() => {
                if (this.pendingLeader) {
                    this.showLeaderBindings();
                }
            }, SHOW_DELAY);
            return;
        }

        if (this.pendingLeader) {
            this.dismiss();
        }
    }

    private onKeyPressGeneral(key: string): void {
        this.clearTimer();

        if (!this.lastAdapter) return;

        const status = getVimStatus(this.lastAdapter);
        const opPending = isOperatorPending(this.lastAdapter);
        const keyBuffer = getKeyBuffer(this.lastAdapter);

        if (!status && !opPending && !keyBuffer) {
            this.dismiss();
            return;
        }

        this.lastStatus = status;
        const capturedAdapter = this.lastAdapter;
        this.showTimer = window.setTimeout(() => {
            if (!capturedAdapter) return;
            const currentOpPending = isOperatorPending(capturedAdapter);
            const currentKeyBuffer = getKeyBuffer(capturedAdapter);
            if (currentOpPending || currentKeyBuffer) {
                this.showCompletions(
                    capturedAdapter,
                    this.lastStatus,
                    currentOpPending,
                    currentKeyBuffer,
                );
            }
        }, SHOW_DELAY);
    }

    private showLeaderBindings(): void {
        const entries: WhichKeyEntry[] = this.leaderBindings.map((b) => ({
            key: b.key,
            description: b.command,
        }));
        this.showOverlay(`${this.leaderKey} \u2026`, entries);
    }

    private showCompletions(
        adapter: CmAdapter,
        displayChord: string,
        opPending: boolean,
        keyBuffer: string,
    ): void {
        const vim = getVimApi();
        if (!vim) return;

        const context = getVimContext(adapter);
        const entries: WhichKeyEntry[] = [];

        if (opPending && !keyBuffer) {
            if (typeof vim.getKeymap !== 'function') return;
            const keymap = vim.getKeymap(context);
            const filtered = keymap.filter((e) => isValidInOperatorPending(e));
            const grouped = buildNextKeyEntries(filtered);
            entries.push(...grouped);
        } else if (keyBuffer) {
            if (typeof vim.getCompletions !== 'function') return;
            const effectiveContext = opPending ? 'operatorPending' : context;
            const completions = vim.getCompletions(keyBuffer, effectiveContext);

            const leaderBindingMap = new Map<string, string>();
            if (!opPending && keyBuffer === this.leaderKey) {
                for (const b of this.leaderBindings) {
                    leaderBindingMap.set(b.key, b.command);
                }
            }

            for (const c of completions) {
                const leaderDesc = leaderBindingMap.get(c.suffix);
                entries.push({
                    key: c.suffix,
                    description: leaderDesc ?? describeKeymapEntry(c),
                });
            }
        }

        if (entries.length === 0) return;

        const title = displayChord ? `${displayChord} \u2026` : '\u2026';
        this.showOverlay(title, entries);
    }

    private showOverlay(title: string, entries: WhichKeyEntry[]): void {
        this.clearTimer();
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        if (entries.length === 0) return;

        const container = getEditorContainer(this.app);
        if (!container) return;

        this.overlay = createDiv({ cls: 'vim-motions-which-key' });

        this.overlay.createEl('div', {
            cls: 'vim-motions-which-key-title',
            text: title,
        });

        const grid = this.overlay.createEl('div', {
            cls: 'vim-motions-which-key-grid',
        });

        for (const entry of entries) {
            const row = grid.createEl('div', {
                cls: 'vim-motions-which-key-row',
            });
            row.createEl('span', {
                cls: 'vim-motions-which-key-key',
                text: entry.key,
            });
            row.createEl('span', {
                cls: 'vim-motions-which-key-cmd',
                text: entry.description,
            });
        }

        container.appendChild(this.overlay);
    }

    private clearTimer(): void {
        if (this.showTimer) {
            window.clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    private dismiss(): void {
        this.pendingLeader = false;
        this.lastStatus = '';
        this.clearTimer();
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

    addBinding(
        lhs: string,
        rhs: string,
        source: 'builtin' | 'user' = 'user',
    ): void {
        const leader = this.leaderKey;
        if (!lhs.startsWith(leader)) return;
        const key = lhs.slice(leader.length);
        if (key.length === 0) return;

        const existing = this.bindings.find((b) => b.key === key);
        if (existing) {
            existing.command = rhs;
            existing.source = source;
        } else {
            this.bindings.push({ key, command: rhs, source });
        }
    }

    clearBuiltinBindings(): void {
        this.bindings = this.bindings.filter((b) => b.source !== 'builtin');
    }

    getBindings(): LeaderBinding[] {
        return [...this.bindings];
    }
}
