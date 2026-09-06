import { BUNDLED_TEXTOBJECTS } from './bundled-queries';

export interface QueryFileAdapter {
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    read(path: string): Promise<string>;
}

export interface QuerySource {
    // Bundled constants have no physical path; get_files only lists vault files.
    path?: string;
    lang: string;
    name: string;
    text: string;
}

export interface QueryDiagnostic {
    path: string;
    message: string;
}

let sources: QuerySource[] = [];
let revision = 0;
let scanGeneration = 0;
const diagnostics = new Map<string, QueryDiagnostic>();
export const MAX_QUERY_FILE_BYTES = 128 * 1024;
export const MAX_QUERY_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_QUERY_SOURCES = 64;
const MAX_INHERITANCE_DEPTH = 16;
const encoder = new TextEncoder();

export function queryByteLength(text: string): number {
    return encoder.encode(text).length;
}

export function reportQueryError(path: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (diagnostics.get(path)?.message === message) return;
    diagnostics.set(path, { path, message });
    console.warn(`Vim Motions: treesitter query ${path}: ${message}`);
}

export function getQueryDiagnostics(): QueryDiagnostic[] {
    return [...diagnostics.values()];
}

export function getQueryFileRevision(): number {
    return revision;
}

const component = /^[a-zA-Z0-9_-]+$/;

// Read only immediate children returned by the adapter, never traversal paths.
function childName(parent: string, path: string): string | null {
    const prefix = `${parent}/`;
    if (!path.startsWith(prefix)) return null;
    const name = path.slice(prefix.length);
    return /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name) ? name : null;
}

/** Snapshot order: user, plugin roots (lexical), bundled fallback.
 * User: lua/queries/{lang}/{name}.scm
 * Plugin: lua/{plugin}/queries/{lang}/{name}.scm
 * Re-run on configuration reload; query.get itself never performs I/O.
 */
export async function preloadQueryFiles(
    adapter: QueryFileAdapter,
): Promise<void> {
    const generation = ++scanGeneration;
    const next: QuerySource[] = [];
    const errors: Array<{ path: string; error: unknown }> = [];
    let bytes = 0;

    function recordError(path: string, error: unknown): void {
        errors.push({ path, error });
    }

    async function scanRoot(root: string): Promise<void> {
        try {
            if (!(await adapter.exists(root))) return;
            const listing = await adapter.list(root);
            for (const folder of [...new Set(listing.folders)].sort()) {
                const lang = childName(root, folder);
                if (!lang) continue;
                try {
                    const files = await adapter.list(folder);
                    for (const path of [...new Set(files.files)].sort()) {
                        if (!path.endsWith('.scm')) continue;
                        const name = childName(folder, path.slice(0, -4));
                        if (!name) continue;
                        try {
                            const text = await adapter.read(path);
                            const size = queryByteLength(text);
                            if (
                                size > MAX_QUERY_FILE_BYTES ||
                                bytes + size > MAX_SNAPSHOT_BYTES
                            ) {
                                recordError(
                                    path,
                                    'Query file or snapshot size limit exceeded; skipped',
                                );
                                continue;
                            }
                            bytes += size;
                            next.push({ path, lang, name, text });
                        } catch (error) {
                            recordError(path, error);
                        }
                    }
                } catch (error) {
                    recordError(folder, error);
                }
            }
        } catch (error) {
            recordError(root, error);
        }
    }

    await scanRoot('lua/queries');
    try {
        if (await adapter.exists('lua')) {
            const listing = await adapter.list('lua');
            for (const folder of [...listing.folders].sort()) {
                const name = childName('lua', folder);
                if (name && name !== 'queries')
                    await scanRoot(`${folder}/queries`);
            }
        }
    } catch (error) {
        recordError('lua', error);
    }
    if (generation !== scanGeneration) return;
    sources = next;
    diagnostics.clear();
    for (const { path, error } of errors) reportQueryError(path, error);
    revision++;
}

export function clearQueryFiles(): void {
    scanGeneration++;
    sources = [];
    diagnostics.clear();
    revision++;
}

export function queryModelines(
    text: string,
): Array<{ extends: true } | { inherits: string[] }> {
    const result: Array<{ extends: true } | { inherits: string[] }> = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith(';')) break;
        const match = /^;+\s*inherits\s*:?\s*([a-z_,()]+)\s*$/.exec(line);
        if (match?.[1]) result.push({ inherits: match[1].split(',') });
        else if (/^;+\s*extends\s*$/.test(line)) result.push({ extends: true });
    }
    return result;
}

/** Mirrors Neovim v0.11.4 query.get_files, with cycle protection. */
export function resolveQuerySources(
    lang: string,
    name: string,
    included = false,
    visiting = new Set<string>(),
    budget = { sources: MAX_QUERY_SOURCES, calls: MAX_QUERY_SOURCES * 2 },
): QuerySource[] {
    if (!component.test(lang) || !component.test(name)) return [];
    if (
        budget.calls-- <= 0 ||
        budget.sources <= 0 ||
        visiting.size >= MAX_INHERITANCE_DEPTH
    ) {
        reportQueryError(
            `${lang}/${name}`,
            'Query inheritance limit exceeded; skipped',
        );
        return [];
    }
    if (visiting.has(lang)) {
        reportQueryError(`${lang}/${name}`, 'Cyclic query inheritance skipped');
        return [];
    }
    const candidates = sources.filter(
        (s) => s.lang === lang && s.name === name,
    );
    const bundled =
        name === 'textobjects' ? BUNDLED_TEXTOBJECTS.get(lang) : undefined;
    if (bundled !== undefined) candidates.push({ lang, name, text: bundled });
    let base: QuerySource | undefined;
    const extensions: QuerySource[] = [];
    const inherited: string[] = [];
    for (const source of candidates) {
        let extension = false;
        for (const modeline of queryModelines(source.text)) {
            if ('extends' in modeline) extension = true;
            else
                for (const entry of modeline.inherits) {
                    const optional =
                        entry.startsWith('(') && entry.endsWith(')');
                    if (optional && included) continue;
                    const parent = optional ? entry.slice(1, -1) : entry;
                    if (parent === lang) extension = true;
                    else if (inherited.length < MAX_QUERY_SOURCES)
                        inherited.push(parent);
                    else
                        reportQueryError(
                            `${lang}/${name}`,
                            'Query inheritance limit exceeded; skipped',
                        );
                }
        }
        if (extension) extensions.push(source);
        else base ??= source;
    }
    const next = new Set(visiting).add(lang);
    const result = inherited.flatMap((parent) =>
        resolveQuerySources(parent, name, true, next, budget),
    );
    for (const source of [...(base ? [base] : []), ...extensions]) {
        if (budget.sources-- <= 0) {
            reportQueryError(
                `${lang}/${name}`,
                'Query source limit exceeded; skipped',
            );
            break;
        }
        result.push(source);
    }
    return result;
}

export function getQueryFiles(
    lang: string,
    name: string,
    included = false,
): string[] {
    return resolveQuerySources(lang, name, included).flatMap((s) =>
        s.path ? [s.path] : [],
    );
}
