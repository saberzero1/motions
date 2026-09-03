import type { App } from 'obsidian';
import type { WhichKeyLabelInfo } from '../ui/which-key';

export type GlobalMapGate = 'standard' | 'hint' | 'structural';

export type GlobalMapAction =
    | { type: 'obcommand'; commandId: string }
    | { type: 'ex'; command: string }
    | { type: 'builtin'; fn: (app: App, count: number) => void };

export interface GlobalMapEntry {
    keys: string;
    name?: string;
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
    private groupLabels = new Map<string, WhichKeyLabelInfo>();

    addMapping(
        keys: string,
        action: GlobalMapAction,
        opts: {
            source: 'default' | 'user';
            gate: GlobalMapGate;
            name?: string;
        },
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

    setGroupLabel(
        prefix: string,
        label: string,
        icon?: string,
        color?: string,
    ): void {
        this.groupLabels.set(prefix, { label, icon, color });
    }

    getGroupLabels(): Map<string, WhichKeyLabelInfo> {
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

/**
 * Normalize a key string so stored keys match `normalizeKeyEvent` output.
 * Converts raw special characters to their `<...>` notation:
 *   `" "` → `"<Space>"`, `"\n"` → `"<CR>"`, `"\t"` → `"<Tab>"`
 * This ensures keys registered from vimrc/Lua (which use raw characters
 * after leader replacement) match the accumulated key sequence from
 * keyboard events.
 */
export function normalizeKeyString(input: string): string {
    return input.replace(/ /g, '<Space>');
}

export function normalizeKeyEvent(e: KeyboardEvent): string {
    const key = e.key;

    // Build modifier prefix in canonical order: C-, A-, M-, S-
    let prefix = '';
    if (e.ctrlKey) prefix += 'C-';
    if (e.altKey) prefix += 'A-';
    if (e.metaKey && !e.ctrlKey) prefix += 'M-';

    if (prefix && key.length === 1) {
        return `<${prefix}${key}>`;
    }

    // Normalize special keys — include S- prefix when Shift is held
    // (for single-char keys, Shift is implicit in the key value)
    let special: string | null = null;
    if (key === 'Enter') special = 'CR';
    else if (key === 'Escape') special = 'Esc';
    else if (key === 'Backspace') special = 'BS';
    else if (key === 'Tab') special = 'Tab';
    else if (key === ' ') special = 'Space';

    if (special) {
        if (prefix || e.shiftKey) {
            const fullPrefix = prefix + (e.shiftKey ? 'S-' : '');
            return `<${fullPrefix}${special}>`;
        }
        return `<${special}>`;
    }

    if (prefix) {
        return `<${prefix}${key}>`;
    }

    return key;
}
