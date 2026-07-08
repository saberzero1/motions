import type { PickerSource } from '../types';

export function createCommandsSource(): PickerSource {
    return {
        name: 'commands',
        placeholder: 'Run command…',
        frecencySource: true,
        items(app) {
            const commands = (
                app as unknown as {
                    commands: {
                        commands: Record<string, { id: string; name: string }>;
                    };
                }
            ).commands.commands;
            return Object.values(commands)
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
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById(data.id);
        },
        preview(item) {
            const data = item.data as { id: string };
            return `${item.label}\n\nID: ${data.id}`;
        },
    };
}
