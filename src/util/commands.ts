import type { App } from 'obsidian';

export interface ObsidianCommand {
    id: string;
    name: string;
}

export function executeCommand(app: App, commandId: string): void {
    (
        app as unknown as {
            commands: { executeCommandById: (id: string) => void };
        }
    ).commands.executeCommandById(commandId);
}

export function getCommandRegistry(app: App): Record<string, ObsidianCommand> {
    return (
        app as unknown as {
            commands: {
                commands: Record<string, ObsidianCommand>;
            };
        }
    ).commands.commands;
}
