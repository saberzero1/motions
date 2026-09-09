import { Platform } from 'obsidian';

type FsPromisesType = {
    readFile(path: string, options: { encoding: string }): Promise<string>;
    access(path: string): Promise<void>;
};

type osType = {
    homedir(): string;
};

type electronShellType = {
    openPath(path: string): Promise<string>;
    showItemInFolder(path: string): void;
};

type electronType = {
    app?: { getPath(name: string): string };
    shell?: electronShellType;
    remote?: {
        app: { getPath(name: string): string };
        shell?: electronShellType;
    };
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
 * Read directory entries from an absolute filesystem path.
 * Guarded by `Platform.isDesktop` — returns `null` on mobile.
 * Returns an array of filenames (not full paths).
 */
export async function readExternalDir(
    dirPath: string,
): Promise<string[] | null> {
    if (!Platform.isDesktop) return null;

    const resolved = expandTilde(dirPath);
    try {
        const fs = getFs();
        // fs/promises.readdir returns string[] by default
        return await (
            fs as unknown as {
                readdir(path: string): Promise<string[]>;
            }
        ).readdir(resolved);
    } catch {
        return null;
    }
}

/**
 * List a directory at an absolute filesystem path, split into files and
 * folders and returned as full paths — the shape Obsidian's vault adapter
 * uses, so both can back the same walk.
 *
 * Separate from `readExternalDir`, which returns bare names and cannot
 * distinguish a subdirectory. Guarded by `Platform.isDesktop`.
 */
export async function listExternalDir(
    dirPath: string,
): Promise<{ files: string[]; folders: string[] } | null> {
    if (!Platform.isDesktop) return null;

    const resolved = expandTilde(dirPath);
    try {
        const fs = getFs();
        const entries = await (
            fs as unknown as {
                readdir(
                    path: string,
                    options: { withFileTypes: true },
                ): Promise<{ name: string; isDirectory(): boolean }[]>;
            }
        ).readdir(resolved, { withFileTypes: true });

        const base = dirPath.replace(/[\\/]+$/, '');
        const files: string[] = [];
        const folders: string[] = [];
        for (const entry of entries) {
            const full = `${base}/${entry.name}`;
            if (entry.isDirectory()) folders.push(full);
            else files.push(full);
        }
        return { files, folders };
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

/** Obsidian itself reaches this as `electron.remote.shell` in the renderer. */
function getElectronShell(): electronShellType | null {
    if (!Platform.isDesktop) return null;

    try {
        const electron = getElectron();
        return electron.shell ?? electron.remote?.shell ?? null;
    } catch {
        return null;
    }
}

/**
 * Open a file at an *absolute* filesystem path in the OS default application.
 *
 * `App.openWithDefaultApp()` cannot do this: it resolves its argument through
 * the vault adapter (`getFilePath()` joins onto the vault base path), so an
 * out-of-vault path silently becomes a bogus in-vault one. Anything outside
 * the vault has to go through Electron directly.
 *
 * Desktop-only — returns `false` on mobile or when Electron is unavailable, so
 * callers can surface a failure instead of appearing to succeed.
 */
export async function openExternalPath(filePath: string): Promise<boolean> {
    if (!Platform.isDesktop) return false;

    const shell = getElectronShell();
    if (!shell) return false;

    try {
        // Resolves to '' on success, or a non-empty error message on failure.
        return (await shell.openPath(expandTilde(filePath))) === '';
    } catch {
        return false;
    }
}

/**
 * Reveal an *absolute* filesystem path in the OS file manager, opening its
 * containing folder with the item selected.
 *
 * The in-vault counterpart is `App.showInFolder()`, which is vault-relative
 * for the same reason `openWithDefaultApp()` is and cannot reach outside it.
 *
 * Desktop-only — returns `false` on mobile or when Electron is unavailable.
 */
export function revealExternalPath(filePath: string): boolean {
    if (!Platform.isDesktop) return false;

    const shell = getElectronShell();
    if (!shell) return false;

    try {
        shell.showItemInFolder(expandTilde(filePath));
        return true;
    } catch {
        return false;
    }
}
