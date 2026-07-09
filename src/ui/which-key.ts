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
    group?: boolean;
}

const DEFAULT_SHOW_DELAY = 500;

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
    label?: string;
}): string {
    if (entry.label) return entry.label;
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
        label?: string;
    }>,
    groupLabels?: Map<string, string>,
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
            label?: string;
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

    const groupEntries: WhichKeyEntry[] = [];
    const singleEntries: WhichKeyEntry[] = [];
    for (const [key, group] of groups) {
        if (group.length === 1) {
            const entry = group[0]!;
            const suffix =
                entry.keys.length > key.length
                    ? entry.keys.slice(key.length)
                    : '';
            const whichEntry: WhichKeyEntry = {
                key: entry.keys,
                description: describeKeymapEntry(entry),
            };
            if (suffix) {
                whichEntry.key = key + suffix;
            }
            singleEntries.push(whichEntry);
        } else {
            const singleChar = group.filter((e) => e.keys === key);
            if (singleChar.length > 0) {
                singleEntries.push({
                    key,
                    description: describeKeymapEntry(singleChar[0]!),
                });
            }
            const multiChar = group.filter((e) => e.keys !== key);
            if (multiChar.length > 0) {
                const customLabel = groupLabels?.get(key);
                const fallback =
                    singleChar.length > 0
                        ? `+${multiChar.length} more`
                        : `+${multiChar.length} keys`;
                const label = customLabel
                    ? `${customLabel} (+${multiChar.length})`
                    : fallback;
                if (singleChar.length === 0) {
                    groupEntries.push({
                        key,
                        description: label,
                        group: true,
                    });
                }
            }
        }
    }

    return [...groupEntries, ...singleEntries];
}

function getVimStatus(adapter: CmAdapter): string {
    const vim = adapter.state.vim;
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
    private groupLeaderBindings: boolean;
    private groupLabels: Map<string, string>;
    private commandLabels: Map<string, string>;
    private showDelay: number;
    private overlay: HTMLElement | null = null;
    private showTimer: number | null = null;
    private keyHandler: ((key: string) => void) | null = null;
    private commandDoneHandler: (() => void) | null = null;
    private leafChangeRef: ReturnType<typeof this.app.workspace.on> | null =
        null;
    private lastAdapter: CmAdapter | null = null;
    private pendingLeader = false;
    private leaderPrefix = '';
    private lastStatus = '';

    constructor(
        app: App,
        leaderKey: string,
        leaderBindings: LeaderBinding[],
        generalMode: boolean,
        groupLeaderBindings: boolean,
        groupLabels: Map<string, string>,
        commandLabels: Map<string, string>,
        showDelay?: number,
    ) {
        this.app = app;
        this.leaderKey = leaderKey;
        this.leaderBindings = leaderBindings;
        this.generalMode = generalMode;
        this.groupLeaderBindings = groupLeaderBindings;
        this.groupLabels = groupLabels;
        this.commandLabels = commandLabels;
        this.showDelay = showDelay ?? DEFAULT_SHOW_DELAY;
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
            this.leaderPrefix = '';
            this.clearTimer();
            if (this.showDelay > 0) {
                this.showTimer = window.setTimeout(() => {
                    if (this.pendingLeader) {
                        this.showLeaderBindings();
                    }
                }, this.showDelay);
            } else {
                this.showLeaderBindings();
            }
            return;
        }

        if (this.pendingLeader && this.groupLeaderBindings && this.overlay) {
            const nextPrefix = this.leaderPrefix + key;
            const matching = this.leaderBindings.filter((b) =>
                b.key.startsWith(nextPrefix),
            );
            if (matching.length > 1) {
                this.leaderPrefix = nextPrefix;
                this.showLeaderBindings();
                return;
            }
        }

        if (this.pendingLeader && !this.overlay) {
            // Overlay hasn't appeared yet (still in delay) — show immediately
            // on partial match so the user sees feedback without waiting.
            this.clearTimer();
            const nextPrefix = this.leaderPrefix + key;
            const matching = this.leaderBindings.filter((b) =>
                b.key.startsWith(nextPrefix),
            );
            if (matching.length > 1) {
                this.leaderPrefix = nextPrefix;
                this.showLeaderBindings();
                return;
            }
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

        if (this.overlay) {
            this.showCompletionsIfPartial(capturedAdapter);
            return;
        }

        if (this.showDelay > 0) {
            this.showTimer = window.setTimeout(() => {
                this.showCompletionsIfPartial(capturedAdapter);
            }, this.showDelay);
        } else {
            this.showCompletionsIfPartial(capturedAdapter);
        }
    }

    private showCompletionsIfPartial(adapter: CmAdapter): void {
        const opPending = isOperatorPending(adapter);
        const keyBuffer = getKeyBuffer(adapter);
        if (opPending || keyBuffer) {
            this.showCompletions(
                adapter,
                this.lastStatus,
                opPending,
                keyBuffer,
            );
        }
    }

    private showLeaderBindings(): void {
        const prefix = this.leaderPrefix;
        const filtered = prefix
            ? this.leaderBindings.filter((b) => b.key.startsWith(prefix))
            : this.leaderBindings;

        const titlePrefix = prefix
            ? `${this.leaderKey} ${prefix} \u2026`
            : `${this.leaderKey} \u2026`;

        if (!this.groupLeaderBindings) {
            const entries: WhichKeyEntry[] = filtered.map((b) => ({
                key: prefix ? b.key.slice(prefix.length) : b.key,
                description:
                    this.commandLabels.get(this.leaderKey + b.key) ?? b.command,
            }));
            this.showOverlay(titlePrefix, entries);
            return;
        }

        const bindingsForGrouping = filtered.map((b) => ({
            keys: prefix ? b.key.slice(prefix.length) : b.key,
            type: 'action' as const,
            action: b.command,
            label: this.commandLabels.get(this.leaderKey + b.key),
        }));

        const absolutePrefix = this.leaderKey + prefix;
        const relativeLabels = this.getRelativeGroupLabels(absolutePrefix);

        const entries = buildNextKeyEntries(
            bindingsForGrouping,
            relativeLabels,
        );
        this.showOverlay(titlePrefix, entries);
    }

    private getRelativeGroupLabels(keyBuffer: string): Map<string, string> {
        const relative = new Map<string, string>();
        for (const [key, label] of this.groupLabels) {
            if (keyBuffer && key.startsWith(keyBuffer)) {
                const rel = key.slice(keyBuffer.length);
                if (rel) relative.set(rel, label);
            } else if (!keyBuffer) {
                relative.set(key, label);
            }
        }
        return relative;
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
            const filtered = keymap
                .filter((e) => isValidInOperatorPending(e))
                .map((entry) => ({
                    ...entry,
                    label: this.commandLabels.get(entry.keys),
                }));
            const labels = this.getRelativeGroupLabels('');
            const grouped = buildNextKeyEntries(filtered, labels);
            entries.push(...grouped);
        } else if (keyBuffer) {
            if (typeof vim.getCompletions !== 'function') return;
            const effectiveContext = opPending ? 'operatorPending' : context;
            const completions = vim.getCompletions(keyBuffer, effectiveContext);

            const isLeaderScope =
                !opPending && keyBuffer.startsWith(this.leaderKey);

            const leaderBindingMap = new Map<string, string>();
            if (isLeaderScope) {
                const leaderSuffix = keyBuffer.slice(this.leaderKey.length);
                for (const b of this.leaderBindings) {
                    if (!leaderSuffix || b.key.startsWith(leaderSuffix)) {
                        const rel = leaderSuffix
                            ? b.key.slice(leaderSuffix.length)
                            : b.key;
                        leaderBindingMap.set(rel, b.command);
                    }
                }
            }

            if (this.groupLeaderBindings) {
                const completionEntries = completions.map((c) => ({
                    keys: c.suffix,
                    type: c.type ?? 'action',
                    operator: (c as Record<string, unknown>).operator as
                        | string
                        | undefined,
                    motion: (c as Record<string, unknown>).motion as
                        | string
                        | undefined,
                    action: (c as Record<string, unknown>).action as
                        | string
                        | undefined,
                    toKeys: (c as Record<string, unknown>).toKeys as
                        | string
                        | undefined,
                    label:
                        this.commandLabels.get(keyBuffer + c.suffix) ??
                        leaderBindingMap.get(c.suffix),
                }));

                const labels = this.getRelativeGroupLabels(keyBuffer);
                const grouped = buildNextKeyEntries(completionEntries, labels);

                if (grouped.length > 0) {
                    entries.push(...grouped);
                } else {
                    for (const c of completions) {
                        const desc =
                            this.commandLabels.get(keyBuffer + c.suffix) ??
                            leaderBindingMap.get(c.suffix);
                        entries.push({
                            key: c.suffix,
                            description: desc ?? describeKeymapEntry(c),
                        });
                    }
                }
            } else {
                for (const c of completions) {
                    const desc =
                        this.commandLabels.get(keyBuffer + c.suffix) ??
                        leaderBindingMap.get(c.suffix);
                    entries.push({
                        key: c.suffix,
                        description: desc ?? describeKeymapEntry(c),
                    });
                }
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

        this.overlay.createDiv({
            cls: 'vim-motions-which-key-title',
            text: title,
        });

        const grid = this.overlay.createDiv({
            cls: 'vim-motions-which-key-grid',
        });

        for (const entry of entries) {
            const rowCls = entry.group
                ? 'vim-motions-which-key-row vim-motions-which-key-group'
                : 'vim-motions-which-key-row';
            const row = grid.createDiv({ cls: rowCls });
            row.createSpan({
                cls: 'vim-motions-which-key-key',
                text: entry.key,
            });
            row.createSpan({
                cls: 'vim-motions-which-key-cmd',
                text: entry.description,
            });
        }

        container.appendChild(this.overlay);

        const statusBar =
            container.doc.querySelector<HTMLElement>('.status-bar');
        if (statusBar) {
            const containerRect = container.getBoundingClientRect();
            const statusBarRect = statusBar.getBoundingClientRect();
            if (containerRect.bottom >= statusBarRect.top) {
                this.overlay.style.paddingBottom = `${statusBar.offsetHeight}px`;
            }
        }
    }

    private clearTimer(): void {
        if (this.showTimer) {
            window.clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    private dismiss(): void {
        this.pendingLeader = false;
        this.leaderPrefix = '';
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
    private groupLabels = new Map<
        string,
        { label: string; builtin: boolean }
    >();

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

    addGroupLabel(prefix: string, label: string, builtin = false): void {
        this.groupLabels.set(prefix, { label, builtin });
    }

    clearBuiltinBindings(): void {
        this.bindings = this.bindings.filter((b) => b.source !== 'builtin');
        for (const [key, entry] of this.groupLabels) {
            if (entry.builtin) this.groupLabels.delete(key);
        }
    }

    getBindings(): LeaderBinding[] {
        return [...this.bindings];
    }

    getGroupLabels(): Map<string, string> {
        const result = new Map<string, string>();
        for (const [key, entry] of this.groupLabels) {
            result.set(key, entry.label);
        }
        return result;
    }
}
