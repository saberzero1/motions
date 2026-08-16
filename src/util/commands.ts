import type { App, Command } from 'obsidian';

export type ObsidianCommand = Pick<Command, 'id' | 'name'>;

export function executeCommand(app: App, commandId: string): void {
    app.commands.executeCommandById(commandId);
}

export function getCommandRegistry(app: App): Record<string, ObsidianCommand> {
    return app.commands.commands;
}
