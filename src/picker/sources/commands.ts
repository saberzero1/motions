import type { PickerSource } from '../types';
import { executeCommand, getCommandRegistry } from '../../util/commands';

export function createCommandsSource(): PickerSource {
    return {
        name: 'commands',
        placeholder: 'Run command…',
        frecencySource: true,
        displayName: 'Run action',
        icon: 'terminal',
        description: 'Execute an Obsidian command',
        priority: 3,
        items(app) {
            return Object.values(getCommandRegistry(app))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((command) => ({
                    id: command.id,
                    label: command.name,
                    description: command.id,
                    filterValue: `${command.name} ${command.id}`,
                    data: { id: command.id },
                }));
        },
        onSelect(item, app) {
            const data = item.data as { id: string };
            executeCommand(app, data.id);
        },
        preview(item) {
            const data = item.data as { id: string };
            return `${item.label}\n\nID: ${data.id}`;
        },
    };
}
