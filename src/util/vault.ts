import type { App } from 'obsidian';

export function getVaultConfig(app: App, key: string): unknown {
    return (
        app.vault as unknown as { getConfig: (key: string) => unknown }
    ).getConfig(key);
}

export function isBuiltinVimEnabled(app: App): boolean {
    try {
        return getVaultConfig(app, 'vimMode') === true;
    } catch {
        return false;
    }
}
