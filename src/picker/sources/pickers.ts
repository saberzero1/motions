import type { App } from 'obsidian';
import type { PickerItem, PickerSource } from '../types';
import { pickerRegistry } from '../registry';
import type { LeaderBinding } from '../../ui/which-key';

export function createPickersSource(
    getLeaderBindings: () => LeaderBinding[],
    getLeaderKey: () => string,
    openPicker: (source: string) => void,
): PickerSource {
    return {
        name: 'pickers',
        displayName: 'Pickers',
        placeholder: 'Select a picker source...',
        icon: 'list',
        description: 'List all available picker sources',
        priority: 100,

        items(_app: App): PickerItem[] {
            const sources = pickerRegistry.getAll();
            const bindings = getLeaderBindings();
            const leader = getLeaderKey();

            const keymapBySource = new Map<string, string>();
            for (const binding of bindings) {
                keymapBySource.set(binding.command, leader + binding.key);
            }

            const builtinItems: PickerItem[] = [];
            const externalItems: PickerItem[] = [];

            for (const source of sources) {
                if (source.name === 'pickers') continue;

                const keymap = keymapBySource.get(source.name);
                const parts: string[] = [];
                if (source.description) parts.push(source.description);
                if (keymap) parts.push(keymap);
                const description = parts.join('  ·  ') || undefined;

                const item: PickerItem = {
                    id: source.name,
                    label: source.displayName ?? source.name,
                    description,
                    data: source.name,
                    group: pickerRegistry.isBuiltin(source.name)
                        ? 'Built-in'
                        : 'Extensions',
                };

                if (pickerRegistry.isBuiltin(source.name)) {
                    builtinItems.push(item);
                } else {
                    externalItems.push(item);
                }
            }

            builtinItems.sort((a, b) => {
                const sa = pickerRegistry.get(a.id)?.priority ?? 50;
                const sb = pickerRegistry.get(b.id)?.priority ?? 50;
                return sa - sb;
            });
            externalItems.sort((a, b) => a.label.localeCompare(b.label));

            return [...builtinItems, ...externalItems];
        },

        onSelect(item: PickerItem): void {
            const sourceName = item.data as string;
            openPicker(sourceName);
        },
    };
}
