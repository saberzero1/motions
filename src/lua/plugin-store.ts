import type { TarEntry } from './tar';
import { preloadQueryFiles } from '../treesitter/query-files';

export interface PluginLockEntry {
    repo: string;
    ref: string;
    files: string[];
    fetchedAt: string;
}

export type PluginLock = Record<string, PluginLockEntry>;

export interface VaultAdapter {
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    remove(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

const LOCK_FILE = 'lua/.plugin-lock.json';
const STAGING_DIR = 'lua/.staging';

export async function readLockFile(adapter: VaultAdapter): Promise<PluginLock> {
    try {
        if (await adapter.exists(LOCK_FILE)) {
            const content = await adapter.read(LOCK_FILE);
            return JSON.parse(content) as PluginLock;
        }
    } catch {
        // Corrupted lock file — treat as empty
    }
    return {};
}

export async function writeLockFile(
    adapter: VaultAdapter,
    lock: PluginLock,
): Promise<void> {
    await adapter.write(LOCK_FILE, JSON.stringify(lock, null, 2));
}

export function isPluginCached(
    lock: PluginLock,
    repo: string,
    ref: string,
): boolean {
    const entry = lock[repo];
    if (!entry) return false;
    return entry.ref === ref;
}

async function ensureDir(adapter: VaultAdapter, path: string): Promise<void> {
    if (!(await adapter.exists(path))) {
        await adapter.mkdir(path);
    }
}

async function ensureParentDirs(
    adapter: VaultAdapter,
    filePath: string,
): Promise<void> {
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        await ensureDir(adapter, dir);
    }
}

export async function writePluginFiles(
    adapter: VaultAdapter,
    repo: string,
    ref: string,
    files: TarEntry[],
    lock: PluginLock,
): Promise<void> {
    // Keep each plugin's query root separate so a plugin cannot overwrite a
    // user's query (or another plugin's base/extends files).
    // GitHub owner names cannot contain underscores. Enforcing that makes the
    // owner__repo separator unambiguous, including for repositories with '__'.
    if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(repo)) {
        throw new Error(`Invalid plugin repository: ${repo}`);
    }
    const installedFiles = files.map((file) => {
        if (!file.path.startsWith('queries/')) return file;
        if (!/^queries\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.scm$/.test(file.path)) {
            throw new Error(`Invalid plugin query path: ${file.path}`);
        }
        return { ...file, path: `lua/${repo.replace('/', '__')}/${file.path}` };
    });
    const stagingBase = `${STAGING_DIR}/${repo.replace('/', '__')}`;

    try {
        await cleanupStaging(adapter, stagingBase);
        await ensureDir(adapter, STAGING_DIR);
        await ensureDir(adapter, stagingBase);

        for (const file of installedFiles) {
            const stagingPath = `${stagingBase}/${file.path}`;
            await ensureParentDirs(adapter, stagingPath);
            await adapter.write(stagingPath, file.data);
        }

        for (const file of installedFiles) {
            const finalPath = file.path;
            await ensureParentDirs(adapter, finalPath);
            const stagingPath = `${stagingBase}/${file.path}`;
            const content = await adapter.read(stagingPath);
            await adapter.write(finalPath, content);
        }

        const installedPaths = new Set(installedFiles.map((file) => file.path));
        const queryRoot = `lua/${repo.replace('/', '__')}/queries/`;
        const previousFiles = lock[repo]?.files;
        for (const previous of Array.isArray(previousFiles)
            ? previousFiles
            : []) {
            if (
                typeof previous === 'string' &&
                previous.startsWith(queryRoot) &&
                /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.scm$/.test(
                    previous.slice(queryRoot.length),
                ) &&
                !installedPaths.has(previous) &&
                (await adapter.exists(previous))
            ) {
                await adapter.remove(previous);
            }
        }
        lock[repo] = {
            repo,
            ref,
            files: installedFiles.map((f) => f.path),
            fetchedAt: new Date().toISOString(),
        };
        await writeLockFile(adapter, lock);
        // Called before vim.plugins.add resumes its Lua coroutine, so plugin
        // setup can immediately call query.get without yielding itself.
        await preloadQueryFiles(adapter);
    } finally {
        await cleanupStaging(adapter, stagingBase);
    }
}

async function cleanupStaging(
    adapter: VaultAdapter,
    stagingBase: string,
): Promise<void> {
    try {
        if (await adapter.exists(stagingBase)) {
            await adapter.remove(stagingBase);
        }
    } catch {
        // Best-effort cleanup
    }
}

export async function cleanupAllStaging(adapter: VaultAdapter): Promise<void> {
    try {
        if (await adapter.exists(STAGING_DIR)) {
            const listing = await adapter.list(STAGING_DIR);
            for (const folder of listing.folders) {
                await cleanupStaging(adapter, folder);
            }
            if (listing.files.length === 0 && listing.folders.length === 0) {
                await adapter.remove(STAGING_DIR);
            }
        }
    } catch {
        // Best-effort
    }
}
