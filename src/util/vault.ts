import type { App, Vault } from 'obsidian';

type VaultConfigKey = Parameters<Vault['getConfig']>[0];

export function getVaultConfig(app: App, key: VaultConfigKey): unknown {
    return app.vault.getConfig(key);
}

export function isBuiltinVimEnabled(app: App): boolean {
    try {
        return getVaultConfig(app, 'vimMode') === true;
    } catch {
        return false;
    }
}
