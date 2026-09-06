import type { Language } from 'web-tree-sitter';
import { QueryWrapper } from './query';
import {
    getQueryFileRevision,
    MAX_QUERY_BYTES,
    MAX_QUERY_SOURCES,
    queryByteLength,
    queryModelines,
    reportQueryError,
    resolveQuerySources,
    type QuerySource,
} from './query-files';

/** Per-Lua-state overrides and compiled queries. Old returned Query objects stay
 * usable after set()/reload; release their WASM allocations when the state closes.
 */
export class NamedQueries {
    private explicit = new Map<string, string>();
    private cache = new Map<string, QueryWrapper | null>();
    private owned = new Set<QueryWrapper>();
    private revision = -1;

    set(lang: string, name: string, text: string): void {
        const key = `${lang}/${name}`;
        this.explicit.set(key, text);
        this.cache.delete(key);
    }

    get(
        lang: string,
        name: string,
        language: Language | undefined,
    ): QueryWrapper | null {
        if (!language) return null; // Retry once the grammar has loaded.
        if (this.revision !== getQueryFileRevision()) {
            this.cache.clear();
            this.revision = getQueryFileRevision();
        }
        const key = `${lang}/${name}`;
        if (this.cache.has(key)) return this.cache.get(key) ?? null;
        const explicit = this.explicit.get(key);
        const explicitBytes = queryByteLength(explicit ?? '');
        if (explicitBytes > MAX_QUERY_BYTES) {
            reportQueryError(`query.set:${key}`, 'Query size limit exceeded');
            this.cache.set(key, null);
            return null;
        }
        let files: QuerySource[];
        if (explicit !== undefined) {
            files = [];
            const budget = {
                sources: MAX_QUERY_SOURCES,
                calls: MAX_QUERY_SOURCES * 2,
            };
            for (const modeline of queryModelines(explicit)) {
                if ('extends' in modeline) {
                    files.push(
                        ...resolveQuerySources(
                            lang,
                            name,
                            true,
                            new Set(),
                            budget,
                        ),
                    );
                } else
                    for (const entry of modeline.inherits) {
                        const parent = entry.replace(/^\(|\)$/g, '');
                        // Neovim ignores self-inheritance in explicit queries;
                        // explicit queries use 'extends' to include their own files.
                        if (parent !== lang)
                            files.push(
                                ...resolveQuerySources(
                                    parent,
                                    name,
                                    true,
                                    new Set(),
                                    budget,
                                ),
                            );
                    }
            }
        } else files = resolveQuerySources(lang, name);

        let text = '';
        let bytes = explicitBytes;
        for (const file of files) {
            if (file.text.length === 0) continue;
            const size = queryByteLength(file.text) + 1;
            if (bytes + size > MAX_QUERY_BYTES) {
                reportQueryError(
                    file.path ?? `${file.lang}/${file.name}`,
                    'Combined query size limit exceeded; skipped',
                );
                continue;
            }
            // Compile the accumulated text: extensions may reference captures
            // introduced by earlier files. Skip only the offending file.
            const candidate = `${text}${file.text}\n`;
            try {
                const probe = new QueryWrapper(language, candidate);
                probe.delete();
                text = candidate;
                bytes += size;
            } catch (error) {
                reportQueryError(
                    file.path ?? `bundled:${file.lang}/${file.name}`,
                    error,
                );
            }
        }
        if (explicit !== undefined) text += explicit;
        let query: QueryWrapper | null = null;
        if (text.length > 0) {
            try {
                query = new QueryWrapper(language, text);
                this.owned.add(query);
            } catch (error) {
                reportQueryError(`query.set:${key}`, error);
            }
        }
        this.cache.set(key, query);
        return query;
    }

    dispose(): void {
        for (const query of this.owned) query.delete();
        this.owned.clear();
        this.cache.clear();
        this.explicit.clear();
    }
}
