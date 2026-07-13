import type { SnippetDefinition, SnippetEntry, SnippetFile } from './types';

export class SnippetRegistry {
    private entries = new Map<string, SnippetEntry>();
    private prefixIndex = new Map<string, SnippetEntry[]>();

    loadFile(
        file: SnippetFile,
        source: 'bundled' | 'user' | 'lua',
        sourceFile?: string,
    ): void {
        for (const [name, def] of Object.entries(file)) {
            const entry = this.normalizeEntry(name, def, source, sourceFile);
            this.entries.set(entry.id, entry);
            for (const prefix of entry.prefixes) {
                this.addToPrefixIndex(prefix, entry);
            }
        }
    }

    clear(): void {
        this.entries.clear();
        this.prefixIndex.clear();
    }

    getAll(): SnippetEntry[] {
        return Array.from(this.entries.values());
    }

    lookupByPrefix(prefix: string): SnippetEntry[] {
        return this.prefixIndex.get(prefix) ?? [];
    }

    search(query: string): SnippetEntry[] {
        const trimmed = query.trim();
        if (!trimmed) return this.getAll();
        const lowered = trimmed.toLowerCase();
        return this.getAll().filter((entry) => {
            if (entry.name.toLowerCase().includes(lowered)) return true;
            if (entry.description.toLowerCase().includes(lowered)) return true;
            return entry.prefixes.some((prefix) =>
                prefix.toLowerCase().includes(lowered),
            );
        });
    }

    get(id: string): SnippetEntry | undefined {
        return this.entries.get(id);
    }

    private normalizeEntry(
        name: string,
        def: SnippetDefinition,
        source: 'bundled' | 'user' | 'lua',
        sourceFile?: string,
    ): SnippetEntry {
        const prefixes = Array.isArray(def.prefix) ? def.prefix : [def.prefix];
        const body = Array.isArray(def.body) ? def.body : def.body.split('\n');
        return {
            id: `${source}:${name}`,
            name,
            prefixes,
            body,
            description: def.description ?? '',
            context: def.context,
            source,
            sourceFile,
        };
    }

    private addToPrefixIndex(prefix: string, entry: SnippetEntry): void {
        const existing = this.prefixIndex.get(prefix) ?? [];
        if (entry.source === 'user') {
            const bundledIndex = existing.findIndex(
                (item) => item.source === 'bundled',
            );
            if (bundledIndex === -1) {
                existing.push(entry);
            } else {
                existing.splice(bundledIndex, 0, entry);
            }
        } else {
            existing.push(entry);
        }
        this.prefixIndex.set(prefix, existing);
    }
}
