import type { App } from 'obsidian';
import type { ConfigItem } from '@obsidian-typings/obsidian-public-latest';

export function getVaultConfig(app: App, key: ConfigItem): unknown {
    return app.vault.getConfig(key);
}

export function isBuiltinVimEnabled(app: App): boolean {
    try {
        return getVaultConfig(app, 'vimMode') === true;
    } catch {
        return false;
    }
}
