import type { TarEntry } from './tar';

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
    const stagingBase = `${STAGING_DIR}/${repo.replace('/', '__')}`;

    try {
        await cleanupStaging(adapter, stagingBase);
        await ensureDir(adapter, STAGING_DIR);
        await ensureDir(adapter, stagingBase);

        for (const file of files) {
            const stagingPath = `${stagingBase}/${file.path}`;
            await ensureParentDirs(adapter, stagingPath);
            await adapter.write(stagingPath, file.data);
        }

        for (const file of files) {
            const finalPath = file.path;
            await ensureParentDirs(adapter, finalPath);
            const stagingPath = `${stagingBase}/${file.path}`;
            const content = await adapter.read(stagingPath);
            await adapter.write(finalPath, content);
        }

        lock[repo] = {
            repo,
            ref,
            files: files.map((f) => f.path),
            fetchedAt: new Date().toISOString(),
        };
        await writeLockFile(adapter, lock);
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
