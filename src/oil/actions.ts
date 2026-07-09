import { App, Notice, TFile, TFolder } from 'obsidian';
import type { OilAction, OilCommitResult, OilMergedDiff } from './types';

function buildPath(parentPath: string, name: string): string {
    return parentPath ? `${parentPath}/${name}` : name;
}

function isInConfigDir(path: string, configDir: string): boolean {
    return path === configDir || path.startsWith(`${configDir}/`);
}

export function validateActions(
    diff: OilMergedDiff,
    app: App,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const configDir = app.vault.configDir;

    for (const create of diff.creates) {
        const targetPath = buildPath(create.parentPath, create.name);
        if (isInConfigDir(targetPath, configDir)) {
            errors.push(`Create blocked inside ${configDir}.`);
            continue;
        }
        if (app.vault.getAbstractFileByPath(targetPath)) {
            errors.push(`Create conflict at ${targetPath}.`);
        }
    }

    for (const rename of diff.renames) {
        const originalPath = rename.entry.path;
        const targetPath = buildPath(rename.entry.parentPath, rename.newName);
        if (
            isInConfigDir(originalPath, configDir) ||
            isInConfigDir(targetPath, configDir)
        ) {
            errors.push(`Rename blocked inside ${configDir}.`);
            continue;
        }
        if (!app.vault.getAbstractFileByPath(originalPath)) {
            errors.push(`Rename source missing at ${originalPath}.`);
            continue;
        }
        if (app.vault.getAbstractFileByPath(targetPath)) {
            errors.push(`Rename conflict at ${targetPath}.`);
        }
    }

    for (const move of diff.moves) {
        const targetPath = buildPath(move.newParentPath, move.newName);
        if (isInConfigDir(targetPath, configDir)) {
            errors.push(`Move blocked inside ${configDir}.`);
            continue;
        }
        if (!app.vault.getAbstractFileByPath(move.entry.path)) {
            errors.push(`Move source missing at ${move.entry.path}.`);
            continue;
        }
        if (app.vault.getAbstractFileByPath(targetPath)) {
            errors.push(`Move conflict at ${targetPath}.`);
        }
    }

    for (const del of diff.deletes) {
        const targetPath = del.entry.path;
        if (isInConfigDir(targetPath, configDir)) {
            errors.push(`Delete blocked inside ${configDir}.`);
            continue;
        }
        if (!app.vault.getAbstractFileByPath(targetPath)) {
            errors.push(`Delete target missing at ${targetPath}.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export async function executeActions(
    diff: OilMergedDiff,
    app: App,
): Promise<OilCommitResult> {
    const completed: OilAction[] = [];
    const failed: Array<{ action: OilAction; error: string }> = [];
    const skipped: OilAction[] = [];

    for (const create of diff.creates) {
        const targetPath = buildPath(create.parentPath, create.name);
        if (app.vault.getAbstractFileByPath(targetPath)) {
            skipped.push({
                type: 'create',
                name: create.name,
                parentPath: create.parentPath,
            });
            continue;
        }
        try {
            if (create.isFolder) {
                await app.vault.createFolder(targetPath);
                completed.push({
                    type: 'createFolder',
                    name: create.name,
                    parentPath: create.parentPath,
                });
            } else {
                await app.vault.create(targetPath, '');
                completed.push({
                    type: 'create',
                    name: create.name,
                    parentPath: create.parentPath,
                });
            }
        } catch (error) {
            failed.push({
                action: {
                    type: 'create',
                    name: create.name,
                    parentPath: create.parentPath,
                },
                error: String(error),
            });
        }
    }

    for (const move of diff.moves) {
        const action: OilAction = { type: 'move', ...move };
        const targetPath = buildPath(move.newParentPath, move.newName);
        const file = app.vault.getAbstractFileByPath(move.entry.path);
        if (!(file instanceof TFile || file instanceof TFolder)) {
            skipped.push(action);
            continue;
        }
        try {
            await app.fileManager.renameFile(file, targetPath);
            completed.push(action);
        } catch (error) {
            failed.push({ action, error: String(error) });
        }
    }

    for (const rename of diff.renames) {
        const action: OilAction = { type: 'rename', ...rename };
        const targetPath = buildPath(rename.entry.parentPath, rename.newName);
        const file = app.vault.getAbstractFileByPath(rename.entry.path);
        if (!(file instanceof TFile || file instanceof TFolder)) {
            skipped.push(action);
            continue;
        }
        if (app.vault.getAbstractFileByPath(targetPath)) {
            skipped.push(action);
            continue;
        }
        try {
            await app.fileManager.renameFile(file, targetPath);
            completed.push(action);
        } catch (error) {
            failed.push({ action, error: String(error) });
        }
    }

    for (const del of diff.deletes) {
        const action: OilAction = { type: 'delete', entry: del.entry };
        const file = app.vault.getAbstractFileByPath(del.entry.path);
        if (!(file instanceof TFile || file instanceof TFolder)) {
            skipped.push(action);
            continue;
        }
        try {
            await app.fileManager.trashFile(file);
            completed.push(action);
        } catch (error) {
            failed.push({ action, error: String(error) });
        }
    }

    if (failed.length > 0) {
        new Notice(`Oil: ${failed.length} operations failed.`);
    }

    return {
        success: failed.length === 0,
        completed,
        failed,
        skipped,
    };
}
