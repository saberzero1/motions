/**
 * In-memory snapshot of the vault's Lua sources, so `require()` can resolve a
 * cache miss without asynchronous I/O.
 *
 * `require` reads module source through the vault adapter, which is
 * Promise-based, so a cache miss must yield. But `vim.keymap.set` callbacks run
 * on the main state via plain `lua_pcall` and cannot yield. Modern Neovim
 * plugins lazily `require` submodules from exactly those callbacks, so they
 * fail on first use.
 *
 * This mirrors `src/treesitter/query-files.ts`, which snapshots vault `.scm`
 * files at config load for the same reason: to make a later lookup synchronous.
 */

export interface SnapshotAdapter {
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    read(path: string): Promise<string>;
}

export const MAX_MODULE_BYTES = 512 * 1024;
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
export const MAX_MODULE_FILES = 2048;
export const MAX_DIRECTORY_DEPTH = 32;

export interface SnapshotStats {
    files: number;
    bytes: number;
    /**
     * Paths deliberately not included, each with a reason.
     *
     * Reported rather than dropped: a limit breach that surfaced as "module not
     * found" would be indistinguishable from a typo in a `require` call.
     */
    skipped: { path: string; reason: string }[];
}

export class LuaModuleSnapshot {
    private sources = new Map<string, string>();
    private stats: SnapshotStats = { files: 0, bytes: 0, skipped: [] };

    /** Vault-relative path, e.g. `lua/flash/init.lua`. */
    get(path: string): string | undefined {
        return this.sources.get(path);
    }

    has(path: string): boolean {
        return this.sources.has(path);
    }

    getStats(): SnapshotStats {
        return {
            files: this.stats.files,
            bytes: this.stats.bytes,
            skipped: [...this.stats.skipped],
        };
    }

    clear(): void {
        this.sources = new Map();
        this.stats = { files: 0, bytes: 0, skipped: [] };
    }

    /**
     * Rebuilds from every root, swapping the result in atomically.
     *
     * The replacement map is built to one side and assigned only on success, so
     * a partially-walked tree is never observable — a half-built snapshot would
     * report real modules as missing. Roots share one budget, and are walked in
     * order, so an earlier root cannot be starved by a later one.
     */
    async rebuild(
        adapter: SnapshotAdapter,
        roots: readonly string[] = ['lua'],
    ): Promise<void> {
        const next = new Map<string, string>();
        const stats: SnapshotStats = { files: 0, bytes: 0, skipped: [] };

        const walk = async (dir: string, depth: number): Promise<void> => {
            if (depth > MAX_DIRECTORY_DEPTH) {
                stats.skipped.push({
                    path: dir,
                    reason: `directory depth exceeds ${MAX_DIRECTORY_DEPTH}`,
                });
                return;
            }
            let listing: { files: string[]; folders: string[] };
            try {
                listing = await adapter.list(dir);
            } catch {
                return;
            }

            for (const file of listing.files) {
                if (!file.endsWith('.lua')) continue;
                if (stats.files >= MAX_MODULE_FILES) {
                    stats.skipped.push({
                        path: file,
                        reason: `file count exceeds ${MAX_MODULE_FILES}`,
                    });
                    continue;
                }
                let source: string;
                try {
                    source = await adapter.read(file);
                } catch {
                    stats.skipped.push({ path: file, reason: 'unreadable' });
                    continue;
                }
                const size = source.length;
                if (size > MAX_MODULE_BYTES) {
                    stats.skipped.push({
                        path: file,
                        reason: `file exceeds ${MAX_MODULE_BYTES} bytes`,
                    });
                    continue;
                }
                if (stats.bytes + size > MAX_SNAPSHOT_BYTES) {
                    stats.skipped.push({
                        path: file,
                        reason: `snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`,
                    });
                    continue;
                }
                next.set(file, source);
                stats.files++;
                stats.bytes += size;
            }

            for (const folder of listing.folders) {
                // Staging and metadata directories are managed by the plugin
                // fetcher and never contain requirable modules.
                const name = folder.split('/').pop() ?? '';
                if (name.startsWith('.')) continue;
                await walk(folder, depth + 1);
            }
        };

        for (const root of roots) {
            await walk(root, 0);
        }

        this.sources = next;
        this.stats = stats;
    }
}
