import { App, TFile, TFolder } from 'obsidian';
import type { OilEntry } from './types';

function getParentPath(path: string): string {
    return path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
}

function isInConfigDir(path: string, configDir: string): boolean {
    return path === configDir || path.startsWith(`${configDir}/`);
}

type SortKey = 'name' | 'mtime' | 'size';

type EntryMeta = {
    entry: Omit<OilEntry, 'id'>;
    nameKey: string;
    mtime: number;
    size: number;
};

export function renderDirectory(
    app: App,
    dirPath: string,
    showHidden: boolean,
    sortKey: SortKey,
): Array<Omit<OilEntry, 'id'>> {
    const configDir = app.vault.configDir;

    const files = app.vault
        .getFiles()
        .filter((file) => !isInConfigDir(file.path, configDir))
        .filter((file) => getParentPath(file.path) === dirPath)
        .filter((file) => showHidden || !file.name.startsWith('.'))
        .map<EntryMeta>((file: TFile) => ({
            entry: {
                name: file.name,
                type: 'file',
                path: file.path,
                parentPath: getParentPath(file.path),
            },
            nameKey: file.name.toLowerCase(),
            mtime: file.stat.mtime,
            size: file.stat.size,
        }));

    const folders = app.vault
        .getAllFolders()
        .filter((folder) => folder.path !== '')
        .filter((folder) => !isInConfigDir(folder.path, configDir))
        .filter((folder) => getParentPath(folder.path) === dirPath)
        .filter((folder) => showHidden || !folder.name.startsWith('.'))
        .map<EntryMeta>((folder: TFolder) => ({
            entry: {
                name: folder.name,
                type: 'folder',
                path: folder.path,
                parentPath: getParentPath(folder.path),
            },
            nameKey: folder.name.toLowerCase(),
            mtime: 0,
            size: 0,
        }));

    const all = [...folders, ...files];

    all.sort((a, b) => {
        const typeOrder = a.entry.type === b.entry.type ? 0 : a.entry.type === 'folder' ? -1 : 1;
        if (typeOrder !== 0) return typeOrder;

        if (sortKey === 'name') {
            const nameCmp = a.nameKey.localeCompare(b.nameKey, undefined, {
                sensitivity: 'base',
            });
            return nameCmp;
        }

        if (sortKey === 'mtime') {
            const diff = b.mtime - a.mtime;
            if (diff !== 0) return diff;
        }

        if (sortKey === 'size') {
            const diff = b.size - a.size;
            if (diff !== 0) return diff;
        }

        return a.nameKey.localeCompare(b.nameKey, undefined, { sensitivity: 'base' });
    });

    return all.map((item) => item.entry);
}
