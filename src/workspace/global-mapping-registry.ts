import type { App } from 'obsidian';

export type GlobalMapGate = 'standard' | 'hint';

export type GlobalMapAction =
    | { type: 'obcommand'; commandId: string }
    | { type: 'ex'; command: string }
    | { type: 'builtin'; fn: (app: App, count: number) => void };

export interface GlobalMapEntry {
    keys: string;
    action: GlobalMapAction;
    source: 'default' | 'user';
    gate: GlobalMapGate;
    label?: string;
}

export type ResolveResult =
    | { type: 'exact'; entry: GlobalMapEntry }
    | { type: 'partial' }
    | { type: 'none' };

export class GlobalMappingRegistry {
    private entries = new Map<string, GlobalMapEntry>();
    private groupLabels = new Map<string, string>();

    addMapping(
        keys: string,
        action: GlobalMapAction,
        opts: { source: 'default' | 'user'; gate: GlobalMapGate },
    ): void {
        this.entries.set(keys, { keys, action, ...opts });
    }

    removeMapping(keys: string): boolean {
        return this.entries.delete(keys);
    }

    setLabel(keys: string, label: string): void {
        const entry = this.entries.get(keys);
        if (entry) {
            entry.label = label;
        }
    }

    setGroupLabel(prefix: string, label: string): void {
        this.groupLabels.set(prefix, label);
    }

    getGroupLabels(): Map<string, string> {
        return new Map(this.groupLabels);
    }

    resolve(keySequence: string): ResolveResult {
        const entry = this.entries.get(keySequence);
        if (entry) return { type: 'exact', entry };

        for (const candidate of this.entries.keys()) {
            if (candidate.startsWith(keySequence)) {
                return { type: 'partial' };
            }
        }

        return { type: 'none' };
    }

    getCompletions(prefix: string): GlobalMapEntry[] {
        const matches: GlobalMapEntry[] = [];
        for (const entry of this.entries.values()) {
            if (entry.keys.startsWith(prefix)) {
                matches.push({ ...entry });
            }
        }
        return matches;
    }

    getAllEntries(): GlobalMapEntry[] {
        return Array.from(this.entries.values(), (entry) => ({ ...entry }));
    }

    clear(): void {
        this.entries.clear();
        this.groupLabels.clear();
    }
}

export function normalizeKeyEvent(e: KeyboardEvent): string {
    const key = e.key;

    if (e.ctrlKey && key.length === 1) {
        return `<C-${key}>`;
    }

    if (e.altKey && key.length === 1) {
        return `<A-${key}>`;
    }

    if (key === 'Enter') return '<CR>';
    if (key === 'Escape') return '<Esc>';
    if (key === 'Backspace') return '<BS>';
    if (key === 'Tab') return '<Tab>';
    if (key === ' ') return '<Space>';

    return key;
}
