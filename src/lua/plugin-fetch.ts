import { gunzipSync } from 'fflate';
import { parseTar, filterLuaFiles } from './tar';
import type { TarEntry } from './tar';

export interface PluginSpec {
    repo: string;
    owner: string;
    name: string;
    ref: string;
}

export interface FetchedPlugin {
    spec: PluginSpec;
    files: TarEntry[];
}

export function parsePluginRepo(repo: string): {
    owner: string;
    name: string;
} | null {
    const slash = repo.indexOf('/');
    if (slash <= 0 || slash === repo.length - 1) return null;
    const owner = repo.substring(0, slash);
    const name = repo.substring(slash + 1).replace(/\.nvim$/, '');
    return { owner, name };
}

function buildTarballUrl(owner: string, repo: string, ref: string): string {
    return `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.tar.gz`;
}

function buildCommitTarballUrl(
    owner: string,
    repo: string,
    sha: string,
): string {
    return `https://github.com/${owner}/${repo}/archive/${sha}.tar.gz`;
}

function buildTagTarballUrl(owner: string, repo: string, tag: string): string {
    return `https://github.com/${owner}/${repo}/archive/refs/tags/${tag}.tar.gz`;
}

export function getTarballUrl(
    owner: string,
    repoFullName: string,
    options: { branch?: string; tag?: string; commit?: string },
): string {
    if (options.commit) {
        return buildCommitTarballUrl(owner, repoFullName, options.commit);
    }
    if (options.tag) {
        return buildTagTarballUrl(owner, repoFullName, options.tag);
    }
    return buildTarballUrl(owner, repoFullName, options.branch ?? 'main');
}

export async function fetchPluginTarball(
    url: string,
    requestUrl: (url: string) => Promise<{ arrayBuffer: ArrayBuffer }>,
): Promise<TarEntry[]> {
    const response = await requestUrl(url);
    const compressed = new Uint8Array(response.arrayBuffer);
    const decompressed = gunzipSync(compressed);
    const allEntries = parseTar(decompressed);
    return [
        ...filterLuaFiles(allEntries),
        ...allEntries.filter((entry) =>
            /^queries\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.scm$/.test(entry.path),
        ),
    ];
}
