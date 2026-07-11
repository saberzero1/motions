import { Platform } from 'obsidian';

type FsPromisesType = {
    readFile(path: string, options: { encoding: string }): Promise<string>;
    access(path: string): Promise<void>;
};

type osType = {
    homedir(): string;
};

type electronType = {
    app?: { getPath(name: string): string };
    remote?: { app: { getPath(name: string): string } };
};

let fsPromisesCache: FsPromisesType | null = null;
let osCache: osType | null = null;
let electronCache: electronType | null = null;

function getModule<T>(name: string): T {
    const requireFn = (
        window as Window & { require?: (module: string) => unknown }
    ).require;
    if (!requireFn) {
        throw new Error('Node modules unavailable');
    }
    return requireFn(name) as T;
}

function getFs(): FsPromisesType {
    if (!fsPromisesCache) {
        fsPromisesCache = getModule<FsPromisesType>('fs/promises');
    }
    return fsPromisesCache;
}

function getOs(): osType {
    if (!osCache) {
        osCache = getModule<osType>('os');
    }
    return osCache;
}

function getElectron(): electronType {
    if (!Platform.isDesktop) {
        return {};
    }
    if (!electronCache) {
        electronCache = getModule<electronType>('electron');
    }
    return electronCache;
}

/**
 * Detects whether a path is absolute (outside the vault).
 *
 * On Windows, absolute paths start with a drive letter (`C:\`) or UNC (`\\`).
 * On Unix, they start with `/`.
 * Tilde (`~`) is treated as absolute and expanded to the user's home directory.
 */
export function isAbsolutePath(p: string): boolean {
    if (p.startsWith('/') || p.startsWith('~')) return true;
    // Windows drive letter (C:\ or C:/) or UNC (\\server)
    if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return true;
    return false;
}

export function expandTilde(p: string): string {
    if (!p.startsWith('~')) return p;
    if (!Platform.isDesktop) return p;
    const os = getOs();
    const home = os.homedir();
    if (p === '~') return home;
    if (p.startsWith('~/') || p.startsWith('~\\')) {
        return home + p.slice(1);
    }
    return p;
}

/**
 * Read a file from an absolute filesystem path.
 * Guarded by `Platform.isDesktop` — returns `null` on mobile.
 */
export async function readExternalFile(
    filePath: string,
): Promise<string | null> {
    if (!Platform.isDesktop) return null;

    const resolved = expandTilde(filePath);
    try {
        const fs = getFs();
        return await fs.readFile(resolved, { encoding: 'utf-8' });
    } catch {
        return null;
    }
}

/**
 * Check whether a file exists at an absolute filesystem path.
 * Guarded by `Platform.isDesktop` — returns `false` on mobile.
 */
export async function externalFileExists(filePath: string): Promise<boolean> {
    if (!Platform.isDesktop) return false;

    const resolved = expandTilde(filePath);
    try {
        const fs = getFs();
        await fs.access(resolved);
        return true;
    } catch {
        return false;
    }
}

/**
 * Returns the path to Obsidian's global userData directory.
 * Desktop-only — returns `null` on mobile.
 *
 *   macOS:   ~/Library/Application Support/obsidian/
 *   Windows: %APPDATA%/obsidian/
 *   Linux:   ~/.config/obsidian/
 */
export function getObsidianUserDataDir(): string | null {
    if (!Platform.isDesktop) return null;

    try {
        const electron = getElectron();
        const app = electron.app ?? electron.remote?.app;
        return app?.getPath('userData') ?? null;
    } catch {
        return null;
    }
}
